// Exposes a tiny API so the web app knows it runs inside the desktop app (skips service-worker
// registration and the "install app" prompts) and can play its exit animation when the window closes.
const { contextBridge, ipcRenderer } = require('electron');
const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
let onClose = null;
ipcRenderer.on('laqeeto:close-requested', async () => {
  try { if (onClose) await onClose(); } catch { /* close anyway */ }
  ipcRenderer.send('laqeeto:close-ok');
});
contextBridge.exposeInMainWorld('laqeetoDesktop', Object.freeze({
  platform,
  version: process.versions.electron,
  // fn may return a promise; the window closes when it settles (or after 1.2 s at most).
  onCloseRequested: (fn) => { if (typeof fn === 'function') onClose = fn; },
}));
