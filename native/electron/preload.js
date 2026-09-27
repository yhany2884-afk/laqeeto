// Exposes a tiny, read-only flag so the web app knows it runs inside the desktop app
// (skips service-worker registration and the "install app" prompts).
const { contextBridge } = require('electron');
const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
contextBridge.exposeInMainWorld('laqeetoDesktop', Object.freeze({ platform, version: process.versions.electron }));
