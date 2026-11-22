// Lasteast Present — safe bridge between the desktop shell and the web app
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lpDesktop', {
  platform: process.platform,
  onOpenFile: (cb) => ipcRenderer.on('open-file', (_e, m) => cb(m.name, m.b64)),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  version: () => ipcRenderer.invoke('app-version'),
});
