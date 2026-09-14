// Windows-app: start de ingebouwde server op 127.0.0.1 en toont de app in een venster.
// De geluidsbibliotheek staat in de gebruikersmap (AppData\Roaming\Hushfall\library) en kan
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

/**
 * De app heette eerder Sfeer, Nebula en heel kort Thrum. De gebruikersmap hangt aan de naam van de app, dus na
 * het hernoemen wijst hij naar een lege map terwijl de bibliotheek — vaak vele gigabytes — nog in de
 * oude staat. Bij de eerste start nemen we die over. We verplaatsen niets: acht gigabyte verplaatsen
 * kan minuten duren en halverwege misgaan, dus we wijzen de oude map alleen aan in de instellingen,
 * waar de gebruiker hem ook zelf kan veranderen.
 */
function erfOudeBibliotheek() {
  const c = readConfig();
  if (c.libraryDir || c.oudeMapBekeken) return;
  if (fs.existsSync(path.join(defaultLibraryDir(), 'library.json'))) { writeConfig({ oudeMapBekeken: true }); return; }
  const roaming = path.dirname(app.getPath('userData'));
  const heeftLib = (d) => { try { return !!d && fs.existsSync(path.join(d, 'library.json')); } catch { return false; } };
  for (const oud of ['Thrum', 'Nebula', 'Sfeer']) {
    // Eerst de map die de gebruiker in de oude versie zelf had aangewezen: wie zijn bibliotheek
    // ergens anders heeft neergezet, staat niet in de standaardmap. Pas daarna de standaardmap zelf.
    let eigen = null;
    try { eigen = JSON.parse(fs.readFileSync(path.join(roaming, oud, 'config.json'), 'utf8')).libraryDir; } catch { /* geen oude config */ }
    for (const kandidaat of [eigen, path.join(roaming, oud, 'library')]) {
      if (heeftLib(kandidaat)) { writeConfig({ libraryDir: kandidaat, oudeMapBekeken: true }); return; }
    }
  }
  writeConfig({ oudeMapBekeken: true });
}

async function createWindow() {
  if (!serverInfo) {
    if (app.isPackaged) erfOudeBibliotheek();
    // De bibliotheek staat in de gebruikersmap (%APPDATA%\Hushfall\library) en hangt aan de naam van de
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
    title: 'Hushfall',
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
 * Bronnen die de Store-versie mag ophalen. De BBC RemArc-licentie staat alleen persoonlijk,
 * educatief en niet-commercieel gebruik toe, en de gratis Mixkit-licenties verbieden herdistributie.
 * In een app die via de Microsoft Store wordt verspreid horen die er dus niet in. Wat overblijft is
 * Creative Commons en publiek domein, en dat is bovendien het eerlijke verhaal: het merendeel van
 * wat je hoort maakt de app zelf.
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
    return { error: e.message === 'Gestopt' ? 'stopped by the user' : e.message, added: 0 };
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
 * Bijwerken. De app kijkt kort na het starten of er een nieuwere versie op GitHub staat, haalt die
 * op de achtergrond binnen en installeert hem pas als je Hushfall afsluit. Zo hoef je nooit zelf te
 * de-installeren en onderbreekt het bijwerken nooit waar je naar aan het luisteren bent.
 * De gedownloade bibliotheek staat in de gebruikersmap en blijft dus staan.
 */
function startBijwerken() {
  if (!app.isPackaged) return;                 // tijdens ontwikkelen is er niets om bij te werken
  // Uit de Microsoft Store: daar werkt de Store zelf de app bij, en de installatiemap is alleen-lezen.
  // Zelf bijwerken zou dus mislukken, en de Store keurt apps af die het toch proberen. Electron zet
  // deze vlag zodra de app uit een MSIX-pakket draait, dus hier is geen aparte broncode voor nodig.
  if (process.windowsStore) return;
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
  app.on('window-all-closed', () => {
  // Op een Mac blijft een app leven als je het venster sluit; via het Dock open
  // je hem weer (zie de activate-regel hierboven). De servertjes laten we dan
  // ook staan, anders heeft dat nieuwe venster niets om mee te praten.
  if (process.platform === 'darwin') return;
  if (fetchController) fetchController.abort();
  if (serverInfo) serverInfo.server.close();
  if (streamInfo) streamInfo.server.close();
  app.quit();
});
}
