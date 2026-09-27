// نقطة البداية — app shell, router, navigation
import db from './db.js';
import { esc, ROLE_LABEL } from './utils.js';
import { $, go, toast, errorState, skeleton } from './ui.js';
import { icon } from './icons.js';
import { playExit, initDesktopExit } from './splash.js';
import { initPWA, onInstallChange, shouldShowInstall, promptInstall } from './pwa.js';
import { homeView, searchView, aboutView, notFoundView } from './views/public.js';
import { loginView, signupView, techSignupView, homeFor } from './views/auth.js';
import { ownerDashboardView, newReportView, reportDetailView, disputeFormView } from './views/owner.js';
import { techDashboardView, handoverView } from './views/tech.js';
import { inboxView, chatView } from './views/chat.js';
import { adminView } from './views/admin.js';

initPWA();
initDesktopExit();

// [pattern, view, allowed roles (null = public), title]
const routes = [
  [/^\/?$/, homeView, null, 'الرئيسية'],
  [/^\/search$/, searchView, null, 'فحص هاتف'],
  [/^\/about$/, aboutView, null, 'المساعدة'],
  [/^\/login$/, loginView, null, 'تسجيل الدخول'],
  [/^\/signup$/, signupView, null, 'حساب جديد'],
  [/^\/tech-signup$/, techSignupView, null, 'تسجيل فني'],
  [/^\/owner$/, ownerDashboardView, ['owner'], 'بلاغاتي'],
  [/^\/report\/new$/, newReportView, ['owner'], 'إبلاغ عن هاتف'],
  [/^\/report\/([\w-]+)$/, reportDetailView, ['owner', 'admin'], 'تفاصيل البلاغ'],
  [/^\/dispute\/new\/([\w-]+)$/, disputeFormView, ['owner'], 'فتح نزاع'],
  [/^\/tech$/, techDashboardView, ['technician'], 'لوحة الفني'],
  [/^\/tech\/handover\/([\w-]+)$/, handoverView, ['technician'], 'تسجيل تسليم'],
  [/^\/inbox$/, inboxView, ['owner', 'technician', 'admin', 'guest'], 'الرسائل'],
  [/^\/chat\/([\w-]+)$/, chatView, ['owner', 'technician', 'admin', 'guest'], 'محادثة'],
  [/^\/admin$/, adminView, ['admin'], 'لوحة الإدارة'],
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, query: new URLSearchParams(qs) };
}

function navItems(user) {
  const r = user?.role;
  const items = [['#/', 'house', 'الرئيسية']];
  if (r === 'owner') items.push(['#/owner', 'smartphone', 'بلاغاتي'], ['#/report/new', 'circle-plus', 'بلّغ'], ['#/inbox', 'message-circle', 'الرسايل']);
  else if (r === 'technician') items.push(['#/tech', 'wrench', 'الفحص'], ['#/inbox', 'message-circle', 'الرسايل']);
  else if (r === 'admin') items.push(['#/admin', 'headset', 'الإدارة'], ['#/inbox', 'message-circle', 'الرسايل']);
  else if (r === 'guest') items.push(['#/search', 'search', 'افحص'], ['#/inbox', 'message-circle', 'الرسايل']);
  else items.push(['#/search', 'search', 'افحص'], ['#/report/new', 'circle-plus', 'بلّغ']);
  items.push(['#/about', 'circle-help', 'مساعدة']);
  return items;
}

async function renderChrome(user) {
  const unread = await db.unreadCount();
  const { path } = parseHash();
  const cur = '#' + (path === '' ? '/' : path);
  const nav = navItems(user).map(([href, ic, label]) => {
    const active = cur === href || (href !== '#/' && cur.startsWith(href + '/') && href !== '#/report/new') ? 'active' : '';
    const badge = href === '#/inbox' && unread ? `<span class="nav-badge" data-testid="unread-badge">${unread}</span>` : '';
    return `<a href="${href}" class="${active}" ${active ? 'aria-current="page"' : ''}><span class="nav-icon">${icon(ic, { size: 22 })}${badge}</span><span>${label}</span></a>`;
  }).join('');
  $('#bottom-nav').innerHTML = nav;
  $('#top-nav').innerHTML = nav;
  $('#user-area').innerHTML = user
    ? `<div class="user-chip" title="${esc(ROLE_LABEL[user.role])}"><span class="avatar sm">${esc((user.name || '؟').slice(0, 1))}</span><span class="uc-text"><b>${esc(user.name)}</b><small>${esc(ROLE_LABEL[user.role])}</small></span></div>
       <button class="icon-btn" id="logout-btn" aria-label="تسجيل الخروج" title="تسجيل الخروج">${icon('log-out')}</button>`
    : `<a class="btn btn-sm btn-primary" href="#/login">دخول</a>`;
  $('#logout-btn')?.addEventListener('click', logout);
  $('#install-btn').hidden = !shouldShowInstall();
}

async function logout() {
  const hide = await playExit();
  try { await db.logout(); } catch (e) { console.warn(e); }
  $('#toasts').innerHTML = '';
  window.dispatchEvent(new Event('auth-changed'));
  go('#/');
  setTimeout(() => { hide(); toast('سجّلت خروج. نشوفك تاني'); }, 150);
}

let renderSeq = 0;
async function router() {
  const seq = ++renderSeq;
  document.body.dataset.busy = '1';
  const { path, query } = parseHash();
  let user = null;
  try { user = await db.currentUser(); } catch (e) { console.warn(e); }
  // Fresh container per render: a slow view from a previous route writes into a detached node
  // instead of clobbering the current page.
  const el = document.createElement('div');
  let match = null, params = [];
  for (const r of routes) { const m = path.match(r[0]); if (m) { match = r; params = m.slice(1); break; } }
  await renderChrome(user);
  if (seq !== renderSeq) return;
  const host = $('#view');
  el.innerHTML = skeleton();
  host.replaceChildren(el);
  if (!match) { notFoundView(el); delete document.body.dataset.busy; return; }
  const [, view, roles, title] = match;
  if (roles && !user) { go('#/login?next=' + encodeURIComponent(location.hash)); toast('سجّل دخول الأول'); return; }
  if (roles && !roles.includes(user.role)) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">${icon('lock', { size: 24 })}</div><div class="empty-title">الصفحة دي مش لحسابك</div><p>إنت داخل بحساب «${esc(ROLE_LABEL[user.role])}».</p><div class="btn-row" style="justify-content:center"><a class="btn btn-primary" href="${homeFor(user)}">روح للوحتي</a><button class="btn btn-outline" id="switch-acc">غيّر الحساب</button></div></div>`;
    $('#switch-acc', el).addEventListener('click', async () => { await db.logout(); window.dispatchEvent(new Event('auth-changed')); go('#/login?next=' + encodeURIComponent(location.hash)); });
    delete document.body.dataset.busy;
    return;
  }
  document.title = `${title} — لقيته`;
  host.classList.remove('fade-in'); void host.offsetWidth; host.classList.add('fade-in');
  try {
    await view(el, { params, query, user });
  } catch (err) {
    if (seq !== renderSeq) return;
    console.error(err);
    el.innerHTML = errorState(err.message);
    $('[data-retry]', el)?.addEventListener('click', router);
  }
  if (seq === renderSeq) { window.scrollTo(0, 0); delete document.body.dataset.busy; }
}

function updateBanner() {
  const b = $('#status-banner');
  if (!db.isConfigured()) { b.hidden = false; b.innerHTML = `${icon('circle-alert', { size: 16 })}<span>الخدمة مش متاحة دلوقتي. جرّب بعد شوية.</span>`; return; }
  if (!navigator.onLine) { b.hidden = false; b.innerHTML = `${icon('wifi-off', { size: 16 })}<span>إنت مش متصل بالإنترنت. الفحص والبلاغات والرسايل محتاجين نت.</span>`; return; }
  b.hidden = true;
}
window.addEventListener('online', updateBanner);
window.addEventListener('offline', updateBanner);

window.addEventListener('hashchange', router);
const chrome = async () => { try { renderChrome(await db.currentUser()); } catch { /* offline */ } };
window.addEventListener('auth-changed', chrome);
window.addEventListener('badge-refresh', chrome);
onInstallChange(() => { $('#install-btn').hidden = !shouldShowInstall(); });

(async function start() {
  $('#install-btn').addEventListener('click', promptInstall);
  updateBanner();
  try { await db.init(); } catch (e) { console.error(e); toast('مش قادرين نوصل للخدمة دلوقتي. اتأكد من النت وحاول تاني.', 'error', 8000); }
  await router();
  document.documentElement.classList.add('ready');
})();
