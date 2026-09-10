// Windows-app: start de ingebouwde server op 127.0.0.1 en toont de app in een venster.
// De geluidsbibliotheek staat in de gebruikersmap (AppData\Roaming\Nebula\library) en kan
// vanuit de app zelf worden gevuld ("Geluiden ophalen").
const { app, BrowserWindow, shell, Menu, nativeTheme, ipcMain, dialog } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const sonos = require('./sonos.cjs');
const { autoUpdater } = require('electron-updater');

let win = null;
let serverInfo = null;
let fetchController = null;
let hub = null;          // verdeelt de live MP3-stream
let streamInfo = null;   // zender op het lokale netwerk (alleen als Sonos gebruikt wordt)
const STREAM_PORT = 34872;
// Instellingen van de app (o.a. een zelfgekozen bibliotheekmap) in de gebruikersmap.
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const readConfig = () => { try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; } };
const writeConfig = (patch) => { const c = { ...readConfig(), ...patch }; fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(configPath(), JSON.stringify(c, null, 2)); return c; };
// Bibliotheekmap: zelf gekozen map, anders uitgepakt (npm start) public/ van het project en geïnstalleerd de gebruikersmap.
const defaultLibraryDir = () => (app.isPackaged ? path.join(app.getPath('userData'), 'library') : path.join(__dirname, '..', 'public'));
const libraryDir = () => { const c = readConfig().libraryDir; return c && fs.existsSync(c) ? c : defaultLibraryDir(); };

async function createWindow() {
  if (!serverInfo) {
    // De bibliotheek staat in de gebruikersmap (%APPDATA%\Nebula\library) en hangt aan de naam van de
    // app, niet aan het versienummer. Een nieuwe versie laat hem dus staan; de app schrijft er bij
    // het opstarten nooit iets over. Alleen de map zelf wordt aangemaakt als hij nog niet bestaat.
    fs.mkdirSync(libraryDir(), { recursive: true });
    const { startServer, createStreamHub } = await import(pathToFileURL(path.join(__dirname, '..', 'server.js')).href);
    hub = createStreamHub();
    // Een vaste poort: de pagina houdt dan dezelfde herkomst, zodat instellingen en de laatste mix
    // (localStorage) bewaard blijven tussen sessies. Is de poort bezet, dan kiest het systeem er een.
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
    title: 'Nebula',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // geluid en animatie blijven lopen als het venster niet gefocust is
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

// IPC: bibliotheek beheren vanuit de app
ipcMain.handle('library:info', () => {
  const dir = libraryDir();
  try {
    const lib = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
    return { dir, isDefault: dir === defaultLibraryDir(), count: lib.sounds?.length || 0, bytes: (lib.sounds || []).reduce((a, s) => a + (s.bytes || 0), 0) };
  } catch { return { dir, isDefault: dir === defaultLibraryDir(), count: 0, bytes: 0 }; }
});
// Een bestaande bibliotheekmap kiezen (met library.json en sounds/), bijvoorbeeld de public-map van het project.
ipcMain.handle('library:chooseFolder', async () => {
  if (fetchController) return { error: 'Er loopt nog een download; stop die eerst.' };
  const r = await dialog.showOpenDialog(win, { title: 'Kies de map met library.json en sounds', properties: ['openDirectory'], defaultPath: libraryDir() });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  const dir = r.filePaths[0];
  const hasLib = fs.existsSync(path.join(dir, 'library.json'));
  writeConfig({ libraryDir: dir });
  fs.mkdirSync(path.join(dir, 'sounds'), { recursive: true });
  return { dir, hasLib };
});
ipcMain.handle('library:resetFolder', () => { writeConfig({ libraryDir: null }); return { dir: libraryDir() }; });
ipcMain.handle('library:fetch', async (event, mode) => {
  if (fetchController) return { error: 'Er loopt al een download' };
  fetchController = new AbortController();
  const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
  try {
    const { runFetch } = await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'fetch-sounds.js')).href);
    const result = await runFetch({
      dir: libraryDir(), mode: mode === 'all' ? 'all' : 'quick', signal: fetchController.signal,
      log: (line) => send('library:log', String(line)),
      progress: (p) => send('library:progress', p),
    });
    return result;
  } catch (e) {
    return { error: e.message === 'Gestopt' ? 'gestopt door gebruiker' : e.message, added: 0 };
  } finally {
    fetchController = null;
  }
});
// ---- Sonos: spelers op het netwerk laten meeluisteren -------------------------------------------
// De zender start pas als je hem echt gebruikt. Windows Firewall vraagt dan eenmalig om toestemming,
// omdat de speaker de audio bij deze computer moet kunnen ophalen.
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
const spelend = new Set(); // groepen die onze zender spelen, om ze bij afsluiten netjes te stoppen
ipcMain.handle('sonos:play', async (e, host) => {
  try {
    await ensureStreamServer();
    await sonos.play(host, streamUrl(), 'Nebula');
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
 * Bijwerken. De app kijkt kort na het starten of er een nieuwere versie op GitHub staat, haalt die
 * op de achtergrond binnen en installeert hem pas als je Nebula afsluit. Zo hoef je nooit zelf te
 * de-installeren en onderbreekt het bijwerken nooit waar je naar aan het luisteren bent.
 * De gedownloade bibliotheek staat in de gebruikersmap en blijft dus staan.
 */
function startBijwerken() {
  if (!app.isPackaged) return;                 // tijdens ontwikkelen is er niets om bij te werken
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const melden = (staat, extra = {}) => { if (win && !win.isDestroyed()) win.webContents.send('update:staat', { staat, ...extra }); };
  autoUpdater.on('update-available', (i) => melden('gevonden', { versie: i?.version }));
  autoUpdater.on('update-downloaded', (i) => melden('klaar', { versie: i?.version }));
  autoUpdater.on('download-progress', (p) => melden('bezig', { procent: Math.round(p?.percent || 0) }));
  // Geen foutmelding aan de gebruiker: zonder internet of zonder release is dit geen probleem.
  autoUpdater.on('error', (e) => console.warn('bijwerken mislukt:', e?.message || e));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 8000); // eerst rustig opstarten
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}
// Nu meteen herstarten en installeren, als de gebruiker daar in de app op klikt.
ipcMain.handle('update:installeer', () => { autoUpdater.quitAndInstall(); });

// Autoplay zonder gebruikersinteractie toestaan (voor herstel van de laatste sessie).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow).then(startBijwerken);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  // Bij afsluiten de speakers stoppen, anders blijven ze een zender zoeken die er niet meer is.
  let afsluiten = false;
  app.on('before-quit', (e) => {
    if (afsluiten || !spelend.size) return;
    e.preventDefault(); afsluiten = true;
    Promise.allSettled([...spelend].map((h) => sonos.stop(h))).then(() => { spelend.clear(); app.quit(); });
    setTimeout(() => app.exit(0), 2500); // niet blijven hangen als een speaker niet reageert
  });
  app.on('window-all-closed', () => { if (fetchController) fetchController.abort(); if (serverInfo) serverInfo.server.close(); if (streamInfo) streamInfo.server.close(); app.quit(); });
}
