// تثبيت التطبيق — PWA install handling
import { modal } from './ui.js';

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
    <section><h4>📱 آيفون / آيباد (Safari)</h4><ol>
      <li>افتح الموقع من متصفح <b>Safari</b>.</li>
      <li>اضغط زر <b>المشاركة</b> <span class="kbd">⬆️</span> أسفل الشاشة.</li>
      <li>اختر <b>«إضافة إلى الشاشة الرئيسية» (Add to Home Screen)</b>.</li>
      <li>اضغط <b>إضافة</b> — ستجد أيقونة «لقيته» على شاشتك.</li></ol></section>
    <section><h4>🤖 أندرويد (Chrome)</h4><ol>
      <li>اضغط زر <b>«تثبيت التطبيق»</b> داخل التطبيق، أو</li>
      <li>من قائمة Chrome <span class="kbd">⋮</span> اختر <b>«تثبيت التطبيق» / «إضافة إلى الشاشة الرئيسية»</b>.</li></ol></section>
    <section><h4>💻 ويندوز / ماك (Chrome أو Edge)</h4><ol>
      <li>اضغط أيقونة التثبيت <span class="kbd">⊕</span> في شريط العنوان، أو من القائمة اختر <b>«تثبيت لقيته»</b>.</li></ol></section>
    <section><h4>📦 ملفات تثبيت مستقلة</h4><p>نسخة أندرويد (APK) وويندوز (EXE) وماك (DMG) وآيفون (IPA غير موقّع) متاحة من
      <a href="${RELEASES_URL}" target="_blank" rel="noopener noreferrer">صفحة الإصدارات على GitHub</a>.</p></section>
  </div>`;

export async function promptInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null; notify();
    return outcome;
  }
  modal({ title: isIOS() ? 'تثبيت التطبيق على آيفون' : 'تثبيت التطبيق', body: (isStandalone() ? '<div class="alert alert-ok">التطبيق مثبت بالفعل على هذا الجهاز ✅</div>' : '') + installInstructionsHTML() });
  return 'instructions';
}
