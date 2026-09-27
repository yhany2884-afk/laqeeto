// تثبيت التطبيق — PWA install handling
import { modal } from './ui.js';
import { icon } from './icons.js';

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const canPrompt = () => !!deferredPrompt;
export const RELEASES_URL = 'https://github.com/yhany2884-afk/laqeeto/releases/latest';
/** 'android' | 'ios' (Capacitor) · 'windows' | 'mac' | 'linux' (Electron) · null on the web */
export const nativePlatform = () => {
  const cap = window.Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return cap.getPlatform();
  if (window.laqeetoDesktop) return window.laqeetoDesktop.platform;
  return null;
};
export const isNativeApp = () => !!nativePlatform();
export const onInstallChange = (fn) => listeners.add(fn);
/** Show the header install button when we can prompt, or on iOS Safari (manual instructions) */
export const shouldShowInstall = () => !isNativeApp() && !isStandalone() && (canPrompt() || isIOS());

export function initPWA() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; notify(); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; notify(); });
  // Native wrappers (Capacitor / Electron) bundle every file already: no service worker there.
  if (isNativeApp()) { document.documentElement.dataset.native = nativePlatform(); return; }
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => console.warn('SW registration failed', err));
    });
  }
}

export const installInstructionsHTML = () => `
  <div class="install-steps">
    <section><h4>آيفون (Safari)</h4><ol>
      <li>افتح الموقع من <b>Safari</b>.</li>
      <li>دوس على زرار المشاركة <span class="kbd">${icon('share-2', { size: 14 })}</span>.</li>
      <li>اختار <b>«إضافة إلى الشاشة الرئيسية»</b> وبعدين <b>إضافة</b>.</li></ol></section>
    <section><h4>أندرويد (Chrome)</h4><ol>
      <li>دوس <b>«ثبّت التطبيق»</b>، أو</li>
      <li>من قايمة Chrome <span class="kbd">⋮</span> اختار <b>«تثبيت التطبيق»</b>.</li></ol></section>
    <section><h4>ويندوز أو ماك (Chrome / Edge)</h4><ol>
      <li>دوس على أيقونة التثبيت في شريط العنوان، أو من القايمة اختار <b>«تثبيت لقيته»</b>.</li></ol></section>
    <section><h4>ملفات التثبيت</h4><p>نسخة أندرويد وويندوز وماك وآيفون موجودة في
      <a href="${RELEASES_URL}" target="_blank" rel="noopener noreferrer">صفحة التحميل</a>.</p></section>
  </div>`;

export async function promptInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null; notify();
    return outcome;
  }
  modal({ title: 'ثبّت لقيته', body: (isStandalone() ? `<div class="alert alert-ok">${icon('circle-check', { size: 18 })}<div>التطبيق متثبّت على الجهاز ده.</div></div>` : '') + installInstructionsHTML() });
  return 'instructions';
}
