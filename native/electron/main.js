// Laqeeto (لقيته) desktop shell — Electron. Serves the bundled web app (../www) from a
// privileged custom protocol app://laqeeto/ so ES modules, localStorage, getUserMedia (secure
// context) and fetch() to Supabase all behave like on https.
'use strict';
const { app, BrowserWindow, Menu, net, protocol, session, shell, systemPreferences } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'laqeeto';
const START_URL = `${SCHEME}://${HOST}/index.html`;
const WWW = path.join(__dirname, '..', 'www');
const WEB_URL = 'https://yhany2884-afk.github.io/laqeeto/';

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;

function serveFile(request) {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response('Not found', { status: 404 });
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(WWW, rel));
  if (!file.startsWith(WWW + path.sep)) return new Response('Forbidden', { status: 403 });
  return net.fetch(pathToFileURL(file).toString());
}

const isAppUrl = (u) => { try { return new URL(u).protocol === `${SCHEME}:`; } catch { return false; } };
const openExternal = (u) => {
  try {
    const { protocol: p } = new URL(u);
    if (['https:', 'http:', 'mailto:', 'tel:'].includes(p)) shell.openExternal(u);
  } catch { /* ignore malformed */ }
};

async function askCamera() {
  if (process.platform !== 'darwin') return true;
  try {
    const st = systemPreferences.getMediaAccessStatus('camera');
    if (st === 'granted') return true;
    if (st === 'denied' || st === 'restricted') return false;
    return await systemPreferences.askForMediaAccess('camera');
  } catch { return false; }
}

function setupPermissions() {
  const ses = session.defaultSession;
  // Only the camera (for the live selfie / handover photos), clipboard write and fullscreen are allowed.
  const allowed = new Set(['media', 'clipboard-sanitized-write', 'fullscreen']);
  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    if (!isAppUrl(details.requestingUrl || wc.getURL())) return callback(false);
    if (permission === 'media') {
      const wantsAudio = (details.mediaTypes || []).includes('audio');
      if (wantsAudio) return callback(false);
      return callback(await askCamera());
    }
    callback(allowed.has(permission));
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => allowed.has(permission) && isAppUrl(origin || ''));
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'تحرير', submenu: [{ role: 'undo', label: 'تراجع' }, { role: 'redo', label: 'إعادة' }, { type: 'separator' },
      { role: 'cut', label: 'قص' }, { role: 'copy', label: 'نسخ' }, { role: 'paste', label: 'لصق' }, { role: 'selectAll', label: 'تحديد الكل' }] },
    { label: 'عرض', submenu: [{ role: 'reload', label: 'إعادة تحميل' }, { type: 'separator' },
      { role: 'resetZoom', label: 'الحجم الأصلي' }, { role: 'zoomIn', label: 'تكبير' }, { role: 'zoomOut', label: 'تصغير' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'ملء الشاشة' }] },
    { label: 'مساعدة', submenu: [
      { label: 'فتح النسخة على الويب', click: () => shell.openExternal(WEB_URL) },
      { label: 'الإصدارات والتحديثات', click: () => shell.openExternal('https://github.com/yhany2884-afk/laqeeto/releases/latest') },
      { type: 'separator' }, { role: 'toggleDevTools', label: 'أدوات المطور' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 360, minHeight: 560,
    title: 'لقيته — Laqeeto', backgroundColor: '#f6f8fb', show: false,
    ...(process.platform === 'linux' ? { icon: path.join(__dirname, '..', 'build', 'icon.png') } : {}),
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  const wc = win.webContents;
  // Links with target=_blank, and any navigation away from the bundled app, go to the system browser.
  wc.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (!isAppUrl(url)) { e.preventDefault(); openExternal(url); } });
  wc.on('will-redirect', (e, url) => { if (!isAppUrl(url)) { e.preventDefault(); } });
  win.loadURL(START_URL);
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

app.whenReady().then(() => {
  app.setAppUserModelId('io.github.yhany2884afk.laqeeto');
  protocol.handle(SCHEME, serveFile);
  setupPermissions();
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
