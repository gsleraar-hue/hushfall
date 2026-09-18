// Windows app: starts the built-in server on 127.0.0.1 and shows the app in a window.
// The sound library lives in the user folder (AppData\Roaming\Hushfall\library) and can be
// filled from the app itself ("Geluiden ophalen" / fetch sounds).
const { app, BrowserWindow, shell, Menu, nativeTheme, ipcMain, dialog } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const sonos = require('./sonos.cjs');
const { autoUpdater } = require('electron-updater');

let win = null;
let serverInfo = null;
let fetchController = null;
let hub = null;          // hands out the live MP3 stream
let streamInfo = null;   // station on the local network (only when Sonos is used)
const STREAM_PORT = 34872;
// The app's settings (a library folder of your own, among others) in the user folder.
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const readConfig = () => { try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; } };
const writeConfig = (patch) => { const c = { ...readConfig(), ...patch }; fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(configPath(), JSON.stringify(c, null, 2)); return c; };
// Library folder: a folder you picked yourself, else unpacked (npm start) the project's public/, and installed the user folder.
const defaultLibraryDir = () => (app.isPackaged ? path.join(app.getPath('userData'), 'library') : path.join(__dirname, '..', 'public'));
const libraryDir = () => { const c = readConfig().libraryDir; return c && fs.existsSync(c) ? c : defaultLibraryDir(); };

/**
 * This app used to be called Sfeer, then Nebula and very briefly Thrum. The user folder hangs off the app name, so after
 * a rename it points at an empty folder while the library - often many gigabytes - still sits in the
 * old one. On first start we adopt it. We move nothing: moving eight gigabytes
 * can take minutes and fail halfway, so we only point at the old folder in the settings,
 * where the user can change it themselves as well.
 */
function erfOudeBibliotheek() {
  const c = readConfig();
  if (c.libraryDir || c.oudeMapBekeken) return;
  if (fs.existsSync(path.join(defaultLibraryDir(), 'library.json'))) { writeConfig({ oudeMapBekeken: true }); return; }
  const roaming = path.dirname(app.getPath('userData'));
  const heeftLib = (d) => { try { return !!d && fs.existsSync(path.join(d, 'library.json')); } catch { return false; } };
  for (const oud of ['Thrum', 'Nebula', 'Sfeer']) {
    // First the folder the user pointed at themselves in the old version: anyone who put their library
    // somewhere else is not in the default folder. Only after that the default folder itself.
    let eigen = null;
    try { eigen = JSON.parse(fs.readFileSync(path.join(roaming, oud, 'config.json'), 'utf8')).libraryDir; } catch { /* no old config */ }
    for (const kandidaat of [eigen, path.join(roaming, oud, 'library')]) {
      if (heeftLib(kandidaat)) { writeConfig({ libraryDir: kandidaat, oudeMapBekeken: true }); return; }
    }
  }
  writeConfig({ oudeMapBekeken: true });
}

async function createWindow() {
  if (!serverInfo) {
    if (app.isPackaged) erfOudeBibliotheek();
    // The library lives in the user folder (%APPDATA%\Hushfall\library) and hangs off the name of the
    // app, not off the version number. So a new version leaves it alone; the app never writes over it
    // at startup. Only the folder itself is created if it is not there yet.
    fs.mkdirSync(libraryDir(), { recursive: true });
    const { startServer, createStreamHub } = await import(pathToFileURL(path.join(__dirname, '..', 'server.js')).href);
    hub = createStreamHub();
    // A fixed port: the page then keeps the same origin, so settings and the last mix
    // (localStorage) survive between sessions. If the port is taken, the system picks another.
    try { serverInfo = await startServer({ port: 34871, host: '127.0.0.1', libraryDir, hub }); }
    catch { serverInfo = await startServer({ port: 0, host: '127.0.0.1', libraryDir, hub }); }
  }
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#0b0f1a',
    title: 'Hushfall',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // sound and animation keep running when the window is not focused
    },
  });
  Menu.setApplicationMenu(null);
  win.loadURL(`http://127.0.0.1:${serverInfo.port}/`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${serverInfo.port}`)) { e.preventDefault(); shell.openExternal(url); }
  });
  win.on('closed', () => { win = null; });
}

// IPC: managing the library from the app
ipcMain.handle('library:info', () => {
  const dir = libraryDir();
  try {
    const lib = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
    return { dir, isDefault: dir === defaultLibraryDir(), count: lib.sounds?.length || 0, bytes: (lib.sounds || []).reduce((a, s) => a + (s.bytes || 0), 0) };
  } catch { return { dir, isDefault: dir === defaultLibraryDir(), count: 0, bytes: 0 }; }
});
// Pick an existing library folder (with library.json and sounds/), the project's public folder for instance.
ipcMain.handle('library:chooseFolder', async () => {
  if (fetchController) return { error: 'A download is still running; stop it first.' };
  const r = await dialog.showOpenDialog(win, { title: 'Choose the folder containing library.json and sounds', properties: ['openDirectory'], defaultPath: libraryDir() });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  const dir = r.filePaths[0];
  const hasLib = fs.existsSync(path.join(dir, 'library.json'));
  writeConfig({ libraryDir: dir });
  fs.mkdirSync(path.join(dir, 'sounds'), { recursive: true });
  return { dir, hasLib };
});
ipcMain.handle('library:resetFolder', () => { writeConfig({ libraryDir: null }); return { dir: libraryDir() }; });
/**
 * Sources the Store version may fetch from. The BBC RemArc licence allows personal,
 * educational and non-commercial use only, and the free Mixkit licences forbid redistribution.
 * In an app handed out through the Microsoft Store those do not belong. What is left is
 * Creative Commons and public domain, and that is the honest story anyway: most of
 * what you hear is made by the app itself.
 */
const STORE_BRONNEN = ['archive', 'music', 'jazz', 'kerst', 'gregoriaans', 'commons', 'freesound'];

ipcMain.handle('library:fetch', async (event, mode) => {
  if (fetchController) return { error: 'A download is already running' };
  fetchController = new AbortController();
  const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
  try {
    const { runFetch } = await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'fetch-sounds.js')).href);
    const result = await runFetch({
      dir: libraryDir(), mode: mode === 'all' ? 'all' : 'quick', signal: fetchController.signal,
      only: process.windowsStore ? STORE_BRONNEN : null,
      log: (line) => send('library:log', String(line)),
      progress: (p) => send('library:progress', p),
    });
    return result;
  } catch (e) {
    return { error: e.message === 'Stopped' ? 'stopped by the user' : e.message, added: 0 };
  } finally {
    fetchController = null;
  }
});
// ---- Sonos: let speakers on the network listen along ---------------------------------------------
// De zender start pas als je hem echt gebruikt. Windows Firewall vraagt dan eenmalig om toestemming,
// because the speaker has to be able to fetch the audio from this computer.
async function ensureStreamServer() {
  if (streamInfo) return streamInfo;
  const { startStreamServer } = await import(pathToFileURL(path.join(__dirname, '..', 'server.js')).href);
  streamInfo = await startStreamServer({ port: STREAM_PORT, host: '0.0.0.0', hub });
  return streamInfo;
}
const streamUrl = () => `${sonos.localAddress()}:${streamInfo ? streamInfo.port : STREAM_PORT}/stream.mp3`;

ipcMain.handle('sonos:list', async () => {
  try { return { groups: await sonos.listGroups() }; }
  catch (e) { return { groups: [], error: e.message }; }
});
const spelend = new Set(); // groups playing our station, to stop them politely on quit
ipcMain.handle('sonos:play', async (e, host) => {
  try {
    await ensureStreamServer();
    await sonos.play(host, streamUrl(), 'Hushfall');
    spelend.add(host);
    return { ok: true, url: streamUrl(), listeners: hub ? hub.listeners : 0 };
  } catch (err) { return { error: err.message }; }
});
ipcMain.handle('sonos:stop', async (e, host) => {
  spelend.delete(host);
  try { await sonos.stop(host); return { ok: true }; }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('sonos:status', async (e, host) => {
  try { const s = await sonos.status(host); return { ...s, ours: s.uri.includes('/stream.mp3'), listeners: hub ? hub.listeners : 0 }; }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('sonos:volume', async (e, host, v) => {
  try { await sonos.setVolume(host, v); return { ok: true }; }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('sonos:info', () => ({ localIp: sonos.localAddress(), streamPort: streamInfo ? streamInfo.port : STREAM_PORT, streaming: !!streamInfo, listeners: hub ? hub.listeners : 0 }));

ipcMain.handle('library:stop', () => { if (fetchController) fetchController.abort(); return true; });
ipcMain.handle('library:openFolder', () => shell.openPath(libraryDir()));

/**
 * Updating. Shortly after starting, the app checks whether there is a newer version on GitHub, fetches
 * it in the background and installs it only once you quit Hushfall. That way you never have to
 * uninstall anything yourself and updating never interrupts whatever you are listening to.
 * The downloaded library lives in the user folder and simply stays put.
 */
// What the updater last reported, so the settings screen can show it even when you open that
// screen long after the check ran.
let updateStand = { staat: 'onbekend' };
/** A small log of its own next to the settings, so a failed update can be looked into afterwards. */
function updateLogger() {
  const bestand = path.join(app.getPath('userData'), 'update.log');
  const schrijf = (niveau) => (...a) => {
    const regel = `${new Date().toISOString()} ${niveau} ${a.map((x) => (x && x.stack) || (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')}\n`;
    try { fs.appendFileSync(bestand, regel); } catch { /* geen logboek is geen reden om te stoppen */ }
  };
  return { info: schrijf('info'), warn: schrijf('warn'), error: schrijf('error'), debug: schrijf('debug') };
}
function startBijwerken() {
  if (!app.isPackaged) return;                 // tijdens ontwikkelen is er niets om bij te werken
  // From the Microsoft Store: there the Store updates the app, and the install folder is read-only.
  // Updating ourselves would fail, and the Store rejects apps that try anyway. Electron sets
  // this flag as soon as the app runs from an MSIX package, so no separate source code is needed here.
  if (process.windowsStore) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = updateLogger();
  const melden = (staat, extra = {}) => {
    updateStand = { staat, ...extra };
    if (win && !win.isDestroyed()) win.webContents.send('update:staat', updateStand);
  };
  autoUpdater.on('checking-for-update', () => melden('zoeken'));
  autoUpdater.on('update-available', (i) => melden('gevonden', { versie: i?.version }));
  autoUpdater.on('update-not-available', () => melden('niets', { versie: app.getVersion() }));
  autoUpdater.on('update-downloaded', (i) => melden('klaar', { versie: i?.version }));
  autoUpdater.on('download-progress', (p) => melden('bezig', { procent: Math.round(p?.percent || 0) }));
  // Nothing is thrown at the user unasked: without the internet or without a release this is not a
  // problem. It does go in the log and into the state, so the settings screen can show what happened.
  autoUpdater.on('error', (e) => melden('fout', { fout: String(e?.message || e).slice(0, 200) }));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 8000); // eerst rustig opstarten
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}
// Restart and install right now, when the user clicks that in the app.
ipcMain.handle('update:installeer', () => { autoUpdater.quitAndInstall(); });
// Look now, because someone pressed the button. Development and the Store have nothing to look for.
ipcMain.handle('update:kijk', async () => {
  if (!app.isPackaged) return { staat: 'ontwikkel', versie: app.getVersion() };
  if (process.windowsStore) return { staat: 'winkel', versie: app.getVersion() };
  try { await autoUpdater.checkForUpdates(); } catch (e) { return { staat: 'fout', fout: String(e?.message || e).slice(0, 200) }; }
  return updateStand;
});
ipcMain.handle('update:stand', () => ({ ...updateStand, versie: updateStand.versie || app.getVersion() }));

// Allow autoplay without user interaction (to restore the last session).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow).then(startBijwerken);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  // Stop the speakers on quit, otherwise they keep looking for a station that is gone.
  let afsluiten = false;
  app.on('before-quit', (e) => {
    if (afsluiten || !spelend.size) return;
    e.preventDefault(); afsluiten = true;
    Promise.allSettled([...spelend].map((h) => sonos.stop(h))).then(() => { spelend.clear(); app.quit(); });
    setTimeout(() => app.exit(0), 2500); // do not hang around when a speaker fails to answer
  });
  app.on('window-all-closed', () => {
  // On a Mac an app stays alive when you close the window; through the Dock you
  // open it again (see the activate line above). So we leave the little servers
  // running too, otherwise that new window has nothing to talk to.
  if (process.platform === 'darwin') return;
  if (fetchController) fetchController.abort();
  if (serverInfo) serverInfo.server.close();
  if (streamInfo) streamInfo.server.close();
  app.quit();
});
}
