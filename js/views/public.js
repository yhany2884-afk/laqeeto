// الصفحات العامة: الرئيسية، الفحص، المساعدة
import db from '../db.js';
import { esc, extLink, normalizeId, validateImei, fmtDate, validateEgPhone } from '../utils.js';
import { $, go, toast, modal, statusBadge, safetyNote, emptyState, alertBox } from '../ui.js';
import { icon } from '../icons.js';
import { promptInstall, installInstructionsHTML, isNativeApp, RELEASES_URL } from '../pwa.js';

const imeiHint = `<div class="imei-hint">${icon('info', { size: 16 })}<span>مش عارف الرقم؟ اطلب <span class="code-chip">*#06#</span> من الموبايل، أو بصّ على العلبة.</span></div>`;

export function searchBox(value = '') {
  return `<form class="search-box" id="search-form" role="search">
    <label for="search-q" class="sr-only">رقم الـ IMEI أو السيريال</label>
    <input id="search-q" name="q" inputmode="text" autocomplete="off" dir="ltr" placeholder="رقم الـ IMEI أو السيريال" value="${esc(value)}" required>
    <button class="btn btn-primary" type="submit">${icon('search', { size: 18 })} افحص</button>
  </form>`;
}
function bindSearch(root) {
  $('#search-form', root)?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = normalizeId($('#search-q', root).value);
    if (!q) return;
    go('#/search?q=' + encodeURIComponent(q));
  });
}

const menuItem = (href, ic, title, sub) => `<a class="menu-item" href="${href}"><span class="mi-icon">${icon(ic)}</span>
  <span class="mi-text"><b>${title}</b><small>${sub}</small></span>${icon('chevron-left', { size: 18, cls: 'mi-chev' })}</a>`;

export async function homeView(el, { user }) {
  const techHref = user?.role === 'technician' ? '#/tech' : '#/tech-signup';
  el.innerHTML = `
  <div class="layout-2" data-testid="home">
    <div>
      <section class="search-panel">
        <h1>اتأكد من الموبايل قبل ما تشتريه</h1>
        <p>اكتب رقم الـ IMEI أو السيريال، وهنقولك لو الموبايل متبلّغ عنه إنه مسروق أو ضايع. من غير تسجيل.</p>
        ${searchBox()}
        ${imeiHint}
      </section>
      ${safetyNote(true)}
    </div>
    <div class="home-side">
      <div class="menu-list">
        ${menuItem('#/report/new', 'shield-alert', 'بلّغ عن موبايل مسروق أو ضايع', 'سجّل الـ IMEI بتاعك، ولو حد فحصه هيعرف إنه بتاعك')}
        ${menuItem(techHref, 'wrench', 'أنا فني صيانة', 'افحص الأجهزة قبل ما تشتري أو تصلّح، وساعد أصحابها يرجعوها')}
        ${menuItem('#/about', 'circle-help', 'إزاي تستخدم لقيته', 'خطوات بسيطة ونصايح أمان')}
      </div>
      ${isNativeApp() ? '' : `<div class="menu-list"><a class="menu-item" href="#" id="home-install"><span class="mi-icon">${icon('download')}</span>
        <span class="mi-text"><b>نزّل التطبيق</b><small>على الموبايل أو الكمبيوتر</small></span>${icon('chevron-left', { size: 18, cls: 'mi-chev' })}</a></div>`}
    </div>
  </div>`;
  bindSearch(el);
  $('#home-install', el)?.addEventListener('click', (e) => { e.preventDefault(); promptInstall(); });
}

export async function searchView(el, { query, user }) {
  const q = normalizeId(query.get('q') || '');
  el.innerHTML = `<div class="narrow"><h2 class="page-title">افحص موبايل</h2><p class="page-sub">اكتب الـ IMEI (15 رقم) أو السيريال.</p>
    ${searchBox(q)}<div id="search-result" aria-live="polite"></div>${q ? '' : imeiHint}</div>`;
  bindSearch(el);
  if (!q) { $('#search-q', el).focus(); return; }
  const out = $('#search-result', el);
  out.innerHTML = '<div class="skel skel-card" style="margin-top:12px"></div>';
  const looksImei = /^\d{15}$/.test(q);
  const imeiWarn = looksImei && !validateImei(q).ok ? alertBox('warn', 'triangle-alert', 'الرقم ده شكله مكتوب غلط. راجعه تاني من <span class="code-chip">*#06#</span>.') : '';
  const results = await db.searchReports(q);
  const active = results.filter((r) => r.active);
  if (!active.length) {
    const past = results.find((r) => !r.active);
    out.innerHTML = `${imeiWarn}<div class="result result-ok" data-testid="result-clear">
      <div class="result-head"><span class="result-icon">${icon('circle-check', { size: 24 })}</span><div><h3>مش متبلّغ عنه</h3><div class="mono" dir="ltr">${esc(q)}</div></div></div>
      <div class="result-body">
        ${past ? `<p>الموبايل ده (${esc(past.brand)} ${esc(past.model)}) كان متبلّغ عنه قبل كده، وحالته دلوقتي: ${statusBadge(past.status)}</p>` : ''}
        <p class="muted small">ده معناه إن محدش بلّغ عنه عندنا، مش ضمان ١٠٠٪. اطلب العلبة والفاتورة دايماً وإنت بتشتري.</p>
      </div></div>`;
    return;
  }
  out.innerHTML = imeiWarn + active.map((r) => `
    <div class="result result-bad" data-testid="result-reported">
      <div class="result-head"><span class="result-icon">${icon('octagon-alert', { size: 24 })}</span>
        <div><h3>متبلّغ عنه إنه ${r.type === 'lost' ? 'ضايع' : 'مسروق'}</h3><div class="mono" dir="ltr">${esc(q)}</div></div></div>
      <div class="result-body">
        <dl class="kv">
          <dt>الجهاز</dt><dd>${esc(r.brand)} ${esc(r.model)}</dd>
          <dt>اللون</dt><dd>${esc(r.color)}</dd>
          <dt>الحالة</dt><dd>${statusBadge(r.status)}</dd>
          <dt>تاريخ البلاغ</dt><dd>${fmtDate(r.reportedAt)}</dd>
          ${r.governorate ? `<dt>المحافظة</dt><dd>${esc(r.governorate)}</dd>` : ''}
        </dl>
        ${Object.keys(r.publicContact).length ? `<div class="public-contact"><div class="small muted" style="margin-bottom:4px">صاحب الموبايل سايب الطريقة دي للتواصل:</div>
          ${r.publicContact.phone ? `<div class="pc-row">${icon('phone', { size: 16 })}<a href="tel:${esc(r.publicContact.phone)}" dir="ltr">${esc(r.publicContact.phone)}</a></div>` : ''}
          ${r.publicContact.email ? `<div class="pc-row">${icon('mail', { size: 16 })}<a href="mailto:${esc(r.publicContact.email)}">${esc(r.publicContact.email)}</a></div>` : ''}
          ${(r.publicContact.socials || []).map((s) => `<div class="pc-row">${icon('link', { size: 16 })}${extLink(s)}</div>`).join('')}
        </div>` : `<p class="muted small" style="margin-top:10px">${icon('eye-off', { size: 16 })} بيانات صاحب الموبايل مش ظاهرة. تقدر تبعتله رسالة من هنا بأمان.</p>`}
        ${r.isMine ? alertBox('info', 'info', `ده بلاغك إنت. <a href="#/report/${esc(r.id)}">افتح التفاصيل</a>`)
          : `<div class="btn-row"><button class="btn btn-primary" data-msg="${esc(r.id)}">${icon('message-circle', { size: 18 })} ابعت رسالة لصاحبه</button>
             ${user?.role === 'technician' ? `<a class="btn btn-outline" href="#/tech?q=${esc(q)}">${icon('wrench', { size: 18 })} افتحه في لوحة الفني</a>` : ''}</div>`}
      </div>
    </div>`).join('') + alertBox('info', 'hand-helping', '<b>لقيت الموبايل ده؟</b> متبيعهوش ومتفتحهوش. ابعت لصاحبه من هنا، أو سلّمه لأقرب قسم شرطة أو فني موثّق في التطبيق.') + safetyNote(true);
  el.querySelectorAll('[data-msg]').forEach((b) => b.addEventListener('click', () => startMessageFlow(b.dataset.msg, user)));
}

/** Ask for quick login (or guest name+phone) then compose a first message to the owner */
export async function startMessageFlow(reportId, user) {
  if (!user) {
    const m = modal({
      title: 'تواصل مع صاحب الموبايل',
      body: `<p class="muted">اكتب اسمك ورقمك، أو سجّل دخول. رقمك مش هيظهر لصاحب الموبايل إلا لو إنت شاركته.</p>
        <form id="guest-form" class="form">
          <label class="field"><span>اسمك</span><input name="name" required minlength="2" autocomplete="name"></label>
          <label class="field"><span>رقم موبايلك</span><input name="phone" required inputmode="tel" dir="ltr" placeholder="01xxxxxxxxx" autocomplete="tel"></label>
          <button class="btn btn-primary btn-block" type="submit">كمّل</button>
        </form>
        <div class="or">أو</div>
        <a class="btn btn-outline btn-block" href="#/login?next=${encodeURIComponent(location.hash)}" data-close>سجّل دخول</a>`,
    });
    $('#guest-form', m.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const ph = validateEgPhone(f.get('phone'));
      if (!ph.ok) { toast('رقم الموبايل مش صح (مثال: 01012345678)', 'error'); return; }
      const u = await db.guestLogin({ name: f.get('name'), phone: ph.value });
      m.close();
      window.dispatchEvent(new Event('auth-changed'));
      composeFirstMessage(reportId, u);
    });
    return;
  }
  composeFirstMessage(reportId, user);
}

function composeFirstMessage(reportId) {
  const m = modal({
    title: 'رسالة لصاحب الموبايل',
    body: `<form id="first-msg" class="form">
      <label class="field"><span>رسالتك</span><textarea name="text" rows="4" required placeholder="مثال: لقيت موبايل بنفس الرقم في ... وممكن أسلّمه في قسم الشرطة أو عند فني موثّق."></textarea></label>
      ${safetyNote(true)}
      <button class="btn btn-primary btn-block" type="submit">${icon('send', { size: 18 })} ابعت</button></form>`,
  });
  $('#first-msg', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = new FormData(e.target).get('text').trim();
    if (!text) return;
    try {
      const conv = await db.sendMessageToOwner(reportId, text);
      m.close();
      toast('رسالتك وصلت لصاحب الموبايل', 'ok');
      go('#/chat/' + conv.id);
    } catch (err) { toast(err.message, 'error'); }
  });
}

const helpBlock = (ic, title, items) => `<section class="help-block"><h3>${icon(ic)} ${title}</h3><ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol></section>`;

export async function aboutView(el) {
  el.innerHTML = `<div class="narrow">
  <h2 class="page-title">إزاي تستخدم لقيته</h2>
  <p class="page-sub">لقيته بيساعدك تعرف لو الموبايل متبلّغ عنه قبل ما تشتريه، ويوصّل اللي لقى موبايل بصاحبه.</p>
  ${helpBlock('smartphone', 'لو موبايلك اتسرق أو ضاع', [
    'اعمل حساب واضغط «بلّغ».',
    'اكتب الماركة والموديل واللون والـ IMEI (اطلب <span class="code-chip">*#06#</span> أو بصّ على العلبة)، وصوّر العلبة.',
    'بياناتك مخفية. الناس بتبعتلك رسايل جوه التطبيق، وإنت اللي بتقرر تشارك إيه.',
    'لما موبايلك يرجعلك من فني، أكّد الاستلام من «بلاغاتي». ولو حد ضغط عليك أو طلب فلوس، افتح نزاع.'])}
  ${helpBlock('search', 'لو لقيت موبايل أو هتشتري مستعمل', [
    'افحص الـ IMEI أو السيريال من الصفحة الرئيسية، من غير تسجيل.',
    'هيظهرلك بس إذا كان متبلّغ عنه ونوع الجهاز ولونه.',
    'ابعت رسالة لصاحبه باسمك ورقمك، أو من حسابك.'])}
  ${helpBlock('wrench', 'لو إنت فني صيانة', [
    'سجّل ببيانات المحل وصورة البطاقة وسيلفي من الكاميرا.',
    'فريق لقيته بيراجع بياناتك ويفعّل حسابك.',
    'بعد التفعيل افحص أي جهاز: أخضر يعني مش متبلّغ عنه، وأحمر يعني متبلّغ عنه.',
    'وإنت بتسلّم موبايل لصاحبه: اتأكد من العلبة والـ IMEI، وإنه فتح القفل قدامك، وصوّر بطاقته.'])}
  ${safetyNote()}
  <section class="help-block"><h3>${icon('eye-off')} خصوصيتك</h3><ul>
    <li>بيانات التواصل بتاعتك مش بتظهر لحد إلا لو إنت فعّلت ده بنفسك.</li>
    <li>نتيجة الفحص بتعرض الماركة والموديل واللون وحالة البلاغ بس.</li>
    <li>صور البطايق والسيلفي بيشوفها فريق المراجعة بس.</li></ul></section>
  ${isNativeApp() ? '' : `<section class="help-block" id="install"><h3>${icon('download')} نزّل التطبيق</h3>${installInstructionsHTML()}
    <div class="btn-row"><button class="btn btn-primary" id="about-install">ثبّت التطبيق</button><a class="btn btn-outline" href="${RELEASES_URL}" target="_blank" rel="noopener noreferrer">${icon('external-link', { size: 16 })} صفحة التحميل</a></div></section>`}
  <p class="app-foot">لقيته</p></div>`;
  $('#about-install', el)?.addEventListener('click', promptInstall);
}

export function notFoundView(el) {
  el.innerHTML = emptyState('circle-help', 'الصفحة دي مش موجودة', { text: 'يمكن اللينك قديم أو فيه غلطة.', action: '<a class="btn btn-primary" href="#/">الرئيسية</a>' });
}
