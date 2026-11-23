// Lasteast Present Professional 2027 — desktop shell (Electron)
const { app, BrowserWindow, protocol, net, ipcMain, session, desktopCapturer, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const APP_DIR = path.join(__dirname, 'app');
protocol.registerSchemesAsPrivileged([{ scheme: 'lasteast', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

let win = null;
const pending = [];
const isDoc = (p) => /\.(lpres|pptx|ppsx|pdf|odp)$/i.test(p || '');
function sendFile(p) {
  try { const data = fs.readFileSync(p).toString('base64'); const msg = { name: path.basename(p), b64: data }; if (win && win.webContents && !win.webContents.isLoading()) win.webContents.send('open-file', msg); else pending.push(msg); }
  catch (e) { dialog.showErrorBox('Lasteast Present', 'Could not open ' + p + '\n' + e.message); }
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', (_e, argv) => { const f = argv.find(isDoc); if (f) sendFile(f); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.on('open-file', (e, p) => { e.preventDefault(); sendFile(p); }); // macOS
  app.whenReady().then(boot);
}

function boot() {
  // serve bundled web app from lasteast://app/...
  protocol.handle('lasteast', (req) => {
    const u = new URL(req.url); let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(APP_DIR, rel));
    if (!file.startsWith(APP_DIR)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // Camera / microphone / screen capture: allowed only for our own origin; the UI asks the user explicitly.
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb(['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write', 'window-management', 'speaker-selection'].includes(perm) && (details.requestingUrl || '').startsWith('lasteast://')));
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => { desktopCapturer.getSources({ types: ['screen', 'window'] }).then(srcs => cb({ video: srcs[0], audio: process.platform === 'win32' ? 'loopback' : undefined })).catch(() => cb({})); });
  createWindow();
  const f = process.argv.slice(1).find(isDoc); if (f) sendFile(f);
  setupUpdater();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600, title: 'Lasteast Present', autoHideMenuBar: true, backgroundColor: '#0b1a3a', show: false,
    icon: path.join(__dirname, 'app', 'assets', 'icon-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true },
  });
  win.once('ready-to-show', () => { win.show(); });
  win.webContents.on('did-finish-load', () => { while (pending.length) win.webContents.send('open-file', pending.shift()); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('lasteast://')) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#000000', icon: path.join(__dirname, 'app', 'assets', 'icon-512.png'), webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } } };
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.session.setSpellCheckerLanguages(['en-US', 'he', 'ar'].filter(l => session.defaultSession.availableSpellCheckerLanguages.includes(l)));
  win.loadURL('lasteast://app/app/index.html');
  const isMac = process.platform === 'darwin';
  if (isMac) {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ label: 'Lasteast Present', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'File', submenu: [{ label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow() }, { type: 'separator' }, isMac ? { role: 'close' } : { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'toggleDevTools' }] },
    { label: 'Help', submenu: [{ label: 'Lasteast Present website', click: () => shell.openExternal('https://lasteast-present.netlify.app') }, { label: 'Check for Updates…', click: () => checkUpdates(true) }] },
  ]));
  } else {
    Menu.setApplicationMenu(null); win.setMenuBarVisibility(false); win.removeMenu();
  }
}

let updater = null;
function setupUpdater() {
  try { updater = require('electron-updater').autoUpdater; } catch (e) { return; }
  updater.autoDownload = true;
  updater.on('update-downloaded', (info) => { dialog.showMessageBox(win, { type: 'info', buttons: ['Restart now', 'Later'], title: 'Update ready', message: `Lasteast Present ${info.version} has been downloaded.`, detail: 'Restart to install the update.' }).then(r => { if (r.response === 0) updater.quitAndInstall(); }); });
  updater.on('error', () => { });
  if (app.isPackaged) setTimeout(() => updater.checkForUpdates().catch(() => { }), 8000);
}
async function checkUpdates(manual) {
  if (!updater || !app.isPackaged) { if (manual) dialog.showMessageBox(win, { message: 'Updates are available in installed builds only.' }); return; }
  try { const r = await updater.checkForUpdates(); if (manual && (!r || !r.updateInfo || r.updateInfo.version === app.getVersion())) dialog.showMessageBox(win, { message: `You have the latest version (${app.getVersion()}).` }); }
  catch (e) { if (manual) dialog.showMessageBox(win, { type: 'warning', message: 'Could not check for updates.', detail: String(e.message || e) }); }
}
ipcMain.handle('check-updates', () => checkUpdates(true));
ipcMain.handle('app-version', () => app.getVersion());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
