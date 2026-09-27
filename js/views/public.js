// الصفحات العامة: الرئيسية، البحث، عن التطبيق
import db from '../db.js';
import { esc, extLink, normalizeId, validateImei, fmtDate, validateEgPhone, STATUS } from '../utils.js';
import { $, go, toast, modal, statusBadge, safetyNote, emptyState } from '../ui.js';
import { promptInstall, installInstructionsHTML, isNativeApp } from '../pwa.js';

const imeiTip = `<div class="tip"><span class="tip-code" dir="ltr">*#06#</span><div><b>كيف أعرف رقم IMEI؟</b><br>اطلب الكود <b dir="ltr">*#06#</b> من لوحة الاتصال على الهاتف وسيظهر الرقم فوراً، أو ابحث عنه على علبة الهاتف أو الفاتورة.</div></div>`;

export function searchBox(value = '', { big = true } = {}) {
  return `<form class="search-box ${big ? 'big' : ''}" id="search-form" role="search">
    <label for="search-q" class="sr-only">رقم IMEI أو الرقم التسلسلي</label>
    <input id="search-q" name="q" inputmode="text" autocomplete="off" dir="ltr" placeholder="IMEI أو الرقم التسلسلي" value="${esc(value)}" required>
    <button class="btn btn-primary" type="submit">🔍 افحص</button>
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

export async function homeView(el, { user }) {
  el.innerHTML = `
  <section class="hero">
    <h1>هل وجدت هاتفاً؟ أو ستشتري هاتفاً مستعملاً؟</h1>
    <p>افحص رقم <b>IMEI</b> أو الرقم التسلسلي في ثوانٍ لتعرف إن كان مبلغاً عنه كمسروق أو مفقود — مجاناً وبدون تسجيل.</p>
    ${searchBox()}
  </section>
  ${imeiTip}
  <section class="grid-3 actions-grid">
    <a class="action-card" href="#/report/new"><span class="ac-icon">🚨</span><b>أبلغ عن هاتف مسروق أو مفقود</b><small>سجّل IMEI هاتفك ليتم التعرف عليه عند فحصه</small></a>
    <a class="action-card" href="${user?.role === 'technician' ? '#/tech' : '#/tech-signup'}"><span class="ac-icon">🛠️</span><b>أنا فني صيانة</b><small>افحص الأجهزة قبل الشراء أو الإصلاح، وساعد في إعادتها لأصحابها</small></a>
    <a class="action-card" href="#/about"><span class="ac-icon">💡</span><b>كيف يعمل التطبيق؟</b><small>خطوات بسيطة لكل مستخدم + نصائح الأمان</small></a>
  </section>
  ${safetyNote()}
  ${isNativeApp() ? '' : `<section class="card install-card">
    <div><b>ثبّت «لقيته» على هاتفك</b><p class="muted">يعمل بدون إنترنت بعد أول فتح، ويفتح كتطبيق مستقل.</p></div>
    <button class="btn btn-primary" id="home-install">⬇️ تثبيت التطبيق</button>
  </section>`}`;
  bindSearch(el);
  el.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => go('#/search?q=' + b.dataset.q)));
  $('#home-install', el)?.addEventListener('click', promptInstall);
}

export async function searchView(el, { query, user }) {
  const q = normalizeId(query.get('q') || '');
  el.innerHTML = `<h2 class="page-title">فحص هاتف</h2>${searchBox(q, { big: false })}<div id="search-result"></div>${imeiTip}`;
  bindSearch(el);
  if (!q) { $('#search-q', el).focus(); return; }
  const out = $('#search-result', el);
  const looksImei = /^\d{15}$/.test(q);
  const imeiWarn = looksImei && !validateImei(q).ok ? `<div class="alert alert-warn alert-compact">تنبيه: هذا الرقم لا يجتاز التحقق (Luhn) لأرقام IMEI — قد يكون مكتوباً بشكل خاطئ.</div>` : '';
  const results = await db.searchReports(q);
  const active = results.filter((r) => r.active);
  if (!active.length) {
    const past = results.find((r) => !r.active);
    out.innerHTML = `${imeiWarn}<div class="result result-ok" data-testid="result-clear">
      <div class="result-icon">✅</div><div><h3>لا يوجد بلاغ نشط لهذا الرقم</h3>
      <p dir="ltr" class="mono">${esc(q)}</p>
      ${past ? `<p>كان هذا الهاتف (${esc(past.brand)} ${esc(past.model)}) مبلغاً عنه سابقاً وحالته الآن: ${statusBadge(past.status)}</p>` : ''}
      <p class="muted small">هذا لا يضمن سلامة الجهاز بنسبة 100% — البيانات تعتمد على بلاغات المستخدمين. اطلب دائماً العلبة والفاتورة عند الشراء.</p></div></div>`;
    return;
  }
  out.innerHTML = imeiWarn + active.map((r) => `
    <div class="result result-bad" data-testid="result-reported">
      <div class="result-icon">🚫</div>
      <div class="grow">
        <h3>هذا الهاتف مبلغ عنه ${r.type === 'lost' ? 'كمفقود' : 'كمسروق'}</h3>
        <dl class="kv">
          <dt>الجهاز</dt><dd>${esc(r.brand)} ${esc(r.model)}</dd>
          <dt>اللون</dt><dd>${esc(r.color)}</dd>
          <dt>الحالة</dt><dd>${statusBadge(r.status)}</dd>
          <dt>تاريخ البلاغ</dt><dd>${fmtDate(r.reportedAt)}</dd>
          ${r.governorate ? `<dt>المحافظة</dt><dd>${esc(r.governorate)}</dd>` : ''}
        </dl>
        ${Object.keys(r.publicContact).length ? `<div class="public-contact"><b>بيانات تواصل أتاحها المالك للعامة:</b>
          ${r.publicContact.phone ? `<div>📞 <a href="tel:${esc(r.publicContact.phone)}" dir="ltr">${esc(r.publicContact.phone)}</a></div>` : ''}
          ${r.publicContact.email ? `<div>✉️ <a href="mailto:${esc(r.publicContact.email)}">${esc(r.publicContact.email)}</a></div>` : ''}
          ${(r.publicContact.socials || []).map((s) => `<div>🔗 ${extLink(s)}</div>`).join('')}
        </div>` : '<p class="muted small">🔒 بيانات تواصل المالك مخفية. تواصل معه بأمان من خلال رسائل التطبيق.</p>'}
        ${r.isMine ? `<div class="alert alert-info alert-compact">هذا بلاغك أنت. <a href="#/report/${esc(r.id)}">عرض التفاصيل</a></div>`
          : `<div class="btn-row"><button class="btn btn-primary" data-msg="${esc(r.id)}">💬 راسل المالك</button>
             ${user?.role === 'technician' ? `<a class="btn btn-outline" href="#/tech?q=${esc(q)}">🛠️ افتح في لوحة الفني</a>` : ''}</div>`}
      </div>
    </div>`).join('') + `<div class="alert alert-info"><b>وجدت هذا الهاتف؟</b> لا تحاول بيعه أو فتحه. راسل المالك من هنا، أو سلّمه لأقرب قسم شرطة أو محل صيانة موثّق في التطبيق.</div>` + safetyNote(true);
  el.querySelectorAll('[data-msg]').forEach((b) => b.addEventListener('click', () => startMessageFlow(b.dataset.msg, user)));
}

/** Ask for quick login (or guest name+phone) then compose a first message to the owner */
export async function startMessageFlow(reportId, user) {
  if (!user) {
    const m = modal({
      title: 'للتواصل مع المالك',
      body: `<p>سجّل دخولك، أو تابع كضيف باسمك ورقم هاتفك (لن يظهر رقمك للمالك إلا إذا قررت مشاركته).</p>
        <form id="guest-form" class="form">
          <label class="field"><span>الاسم</span><input name="name" required minlength="2" autocomplete="name"></label>
          <label class="field"><span>رقم الموبايل</span><input name="phone" required inputmode="tel" dir="ltr" placeholder="01xxxxxxxxx" autocomplete="tel"></label>
          <button class="btn btn-primary btn-block" type="submit">متابعة كضيف</button>
        </form>
        <div class="or">أو</div>
        <a class="btn btn-outline btn-block" href="#/login?next=${encodeURIComponent(location.hash)}" data-close>تسجيل الدخول</a>`,
    });
    $('#guest-form', m.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const ph = validateEgPhone(f.get('phone'));
      if (!ph.ok) { toast('رقم الموبايل غير صحيح (مثال: 01012345678)', 'error'); return; }
      const u = await db.guestLogin({ name: f.get('name'), phone: ph.value });
      m.close();
      window.dispatchEvent(new Event('auth-changed'));
      composeFirstMessage(reportId, u);
    });
    return;
  }
  composeFirstMessage(reportId, user);
}

function composeFirstMessage(reportId, user) {
  const m = modal({
    title: 'رسالة إلى مالك الهاتف',
    body: `<form id="first-msg" class="form">
      <label class="field"><span>رسالتك</span><textarea name="text" rows="4" required placeholder="مثال: وجدت هاتفاً بنفس الرقم في منطقة ... ويمكنني تسليمه في قسم الشرطة أو محل صيانة موثّق."></textarea></label>
      ${safetyNote(true)}
      <button class="btn btn-primary btn-block" type="submit">إرسال</button></form>`,
  });
  $('#first-msg', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = new FormData(e.target).get('text').trim();
    if (!text) return;
    try {
      const conv = await db.sendMessageToOwner(reportId, text);
      m.close();
      toast('تم إرسال رسالتك للمالك ✅', 'ok');
      go('#/chat/' + conv.id);
    } catch (err) { toast(err.message, 'error'); }
  });
}

export async function aboutView(el) {
  el.innerHTML = `
  <h2 class="page-title">عن «لقيته» وكيف يعمل</h2>
  <section class="card"><p><b>لقيته</b> (Stolen Phone Registry) سجل مجتمعي للهواتف المسروقة والمفقودة في مصر. يسجّل المالك رقم IMEI لهاتفه، فإذا حاول أحد بيعه أو إصلاحه لدى فني صيانة، أو وجده شخص أمين، يمكنه فحص الرقم والتواصل مع المالك بأمان داخل التطبيق.</p>
  <div class="alert alert-info alert-compact">هذه <b>نسخة تجريبية (Beta)</b>: البيانات محفوظة في قاعدة بيانات مشتركة على الإنترنت (Supabase) وتعمل من أي جهاز، ومحمية بصلاحيات صارمة.</div></section>

  <section class="how">
    <div class="how-step"><div class="how-num">1</div><div><h3>👤 مالك الهاتف</h3><ol>
      <li>أنشئ حساباً ثم اضغط «أبلغ عن هاتف».</li>
      <li>أدخل الماركة والموديل واللون ورقم IMEI (اطلب <span dir="ltr">*#06#</span> أو انظر للعلبة) وصورة العلبة، ورقم المحضر إن وجد.</li>
      <li>بيانات تواصلك <b>مخفية افتراضياً</b>؛ يتواصل معك الناس برسائل داخل التطبيق وأنت تقرر ما تكشفه.</li>
      <li>عند استرداد هاتفك من فني، أكّد الاستلام من «بلاغاتي»، أو افتح نزاعاً إن تعرضت لأي ضغط.</li></ol></div></div>
    <div class="how-step"><div class="how-num">2</div><div><h3>🔎 من وجد هاتفاً / المشتري</h3><ol>
      <li>افحص رقم IMEI أو الرقم التسلسلي من الصفحة الرئيسية بدون تسجيل.</li>
      <li>تظهر لك فقط حالة البلاغ ونوع الجهاز ولونه.</li>
      <li>راسل المالك باسمك ورقمك (كضيف) أو بحسابك.</li></ol></div></div>
    <div class="how-step"><div class="how-num">3</div><div><h3>🛠️ فني الصيانة</h3><ol>
      <li>سجّل ببيانات المحل وصورة البطاقة وسيلفي مباشر وصورة شاشة هاتفك توضح IMEI.</li>
      <li>يراجع الدعم الفني بياناتك (مطابقة الوجه مع البطاقة ستُربط بخدمة تحقق حقيقية لاحقاً).</li>
      <li>بعد التوثيق: افحص أي جهاز — أخضر «غير مبلغ عنه» أو أحمر «مبلغ عنه».</li>
      <li>عند التسليم: تأكد من العلبة ومطابقة IMEI وأن المالك فتح قفل الهاتف أمامك، وصوّر بطاقته وسيلفي التسليم.</li></ol></div></div>
    <div class="how-step"><div class="how-num">4</div><div><h3>🎧 الدعم الفني</h3><ol>
      <li>يراجع طلبات الفنيين (البطاقة والسيلفي جنباً إلى جنب) ويعتمدها أو يرفضها.</li>
      <li>يتابع النزاعات وبلاغات الإكراه، ويضيف ملاحظات، ويوقف الفنيين المخالفين.</li>
      <li>كل إجراء مهم يُسجّل في سجل العمليات.</li></ol></div></div>
  </section>

  ${safetyNote()}
  <section class="card"><h3>🔐 الخصوصية</h3><ul>
    <li>لا تظهر بيانات تواصلك للعامة إلا إذا فعّلت ذلك بنفسك لكل حقل.</li>
    <li>نتيجة الفحص العامة تعرض الماركة والموديل واللون وحالة البلاغ فقط.</li>
    <li>صور البطاقات والسيلفي يطلع عليها فريق الدعم فقط لأغراض التحقق.</li></ul></section>

  ${isNativeApp() ? '' : `<section class="card"><h3>⬇️ تثبيت التطبيق</h3>${installInstructionsHTML()}
    <button class="btn btn-primary" id="about-install">تثبيت التطبيق</button></section>`}

  <section class="card" id="backend-info"><h3>🗄️ أين تُحفظ البيانات؟</h3><ul>
    <li>في قاعدة بيانات Postgres على Supabase (خوادم الاتحاد الأوروبي — فرانكفورت).</li>
    <li>الزائر لا يستطيع قراءة الجداول مباشرة؛ الفحص العام يرجع فقط الماركة والموديل واللون والحالة.</li>
    <li>الصور (العلب، البطاقات، السيلفي) في مخازن خاصة وتُعرض بروابط مؤقتة لأصحابها وفريق الدعم فقط.</li>
    <li>هذه نسخة تجريبية — لا تضع بيانات حساسة أو حقيقية لا تحتاجها.</li></ul></section>
  <p class="muted center small">لقيته — نسخة تجريبية v2.0 · ${isNativeApp() ? 'تطبيق مثبّت' : 'واجهة التطبيق تعمل بدون إنترنت'}</p>`;
  $('#about-install', el)?.addEventListener('click', promptInstall);
}

export function notFoundView(el) {
  el.innerHTML = emptyState('🤷', 'الصفحة غير موجودة', '<a class="btn btn-primary" href="#/">الرئيسية</a>');
}
