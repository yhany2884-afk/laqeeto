// لوحة فني الصيانة — technician dashboard, IMEI check, handover
import db from '../db.js';
import { esc, fmtDate, fmtDateTime, normalizeId, validateImei, TECH_STATUS, HANDOVER_STATUS } from '../utils.js';
import { $, $$, go, toast, badge, statusBadge, photoField, bindPhotoFields, checkPhotoFields, emptyState, safetyNote, alertBox } from '../ui.js';
import { icon } from '../icons.js';
import { startMessageFlow } from './public.js';

// Pending screen: what happened to the automatic selfie ↔ ID check (the score itself is only shown to admins).
function faceStep(fm) {
  const st = fm?.status;
  const [ok, text] = st === 'match' ? [true, 'السيلفي مطابق لصورة البطاقة']
    : st && st !== 'pending' ? [false, 'مقارنة السيلفي بالبطاقة: فريق لقيته هيراجعها بنفسه']
      : [false, 'مقارنة السيلفي بصورة البطاقة'];
  return `<li class="${ok ? 'done' : 'wait'}" data-testid="facematch-step" data-status="${esc(st || 'none')}">${icon(ok ? 'circle-check' : 'clock', { size: 20 })}<span>${text}</span></li>`;
}

function statusScreen(user) {
  const t = user.tech;
  const st = TECH_STATUS[t.status];
  const hasDocs = !!t.idPhoto;
  const step = (done, text, extra = '') => `<li class="${done ? 'done' : 'wait'}" ${extra}>${icon(done ? 'circle-check' : 'clock', { size: 20 })}<span>${text}</span></li>`;
  const body = {
    pending: `<h2>طلبك بيتراجع</h2><p class="muted">شكراً يا ${esc(user.name)}. هنفعّل أدوات الفحص أول ما المراجعة تخلص، وغالباً ده بياخد يوم عمل.</p>
      <ol class="checklist-status">
        ${step(true, 'بياناتك وبيانات المحل')}
        ${step(hasDocs, 'صورة البطاقة والسكرين شوت')}
        ${step(hasDocs, 'السيلفي')}
        ${faceStep(t.faceMatch)}
        ${step(false, 'مراجعة فريق لقيته')}
      </ol>`,
    rejected: `<h2>طلبك اترفض</h2>${t.reviewNote ? alertBox('danger', 'circle-x', `<b>السبب:</b> ${esc(t.reviewNote)}`) : ''}<p class="muted">صحّح البيانات وارفع المستندات تاني تحت.</p>`,
    suspended: `<h2>حسابك متوقف</h2>${t.reviewNote ? alertBox('danger', 'ban', `<b>السبب:</b> ${esc(t.reviewNote)}`) : ''}<p class="muted">مش هتقدر تفحص أو تسجّل تسليم لحد ما فريق لقيته يراجع حسابك.</p>`,
  }[t.status];
  return `<div class="narrow"><section class="card" data-testid="tech-status">
    <div class="status-hero"><div class="sh-icon ${t.status === 'pending' ? 'pending' : 'blocked'}">${icon(t.status === 'pending' ? 'hourglass' : t.status === 'suspended' ? 'ban' : 'circle-x', { size: 28 })}</div>
    <div style="margin-bottom:8px">${badge(st.label, st.cls)}</div>${body}</div>
    <div class="muted small center" style="margin-top:8px">${icon('store', { size: 16 })} ${esc(t.shopName)} — ${esc(t.governorate)}</div></section></div>`;
}

function docsForm(el, user) {
  const state = {};
  const rejected = user.tech.status === 'rejected';
  el.firstElementChild.insertAdjacentHTML('beforeend', `<section class="card" id="docs-card"><h3>${icon('paperclip', { size: 18 })} ${rejected ? 'ارفع المستندات تاني' : 'كمّل المستندات'}</h3>
    <form id="docs-form" class="form" novalidate>
      ${photoField({ name: 'idPhoto', label: 'صورة البطاقة', required: true, mode: 'capture', facing: 'environment' })}
      ${photoField({ name: 'deviceShot', label: 'سكرين شوت من موبايلك فيها الـ IMEI', required: true, mode: 'upload' })}
      ${photoField({ name: 'selfie', label: 'سيلفي', required: true, mode: 'live', facing: 'user' })}
      <button class="btn btn-primary btn-block" type="submit">ابعت المستندات</button></form></section>`);
  const f = $('#docs-form', el);
  bindPhotoFields(f, state);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!checkPhotoFields(f, state)) return toast('محتاجين الصور التلاتة', 'error');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      btn.innerHTML = '<span class="spinner"></span> بنرفع المستندات…';
      await db.submitTechnicianDocuments({ idPhoto: state.idPhoto, deviceShot: state.deviceShot, selfie: state.selfie, selfieMethod: state.selfieMethod });
      btn.innerHTML = '<span class="spinner"></span> بنقارن السيلفي بصورة البطاقة…';
      const fm = await db.runFaceMatch();
      toast(fm?.approved ? 'تمام! حسابك اتفعّل' : 'المستندات وصلت. طلبك بيتراجع', 'ok');
      window.dispatchEvent(new Event('auth-changed'));
      go('#/tech');
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });
}

export async function techDashboardView(el, { user, query }) {
  if (user.tech?.status !== 'approved') {
    user = (await db.currentUser({ fresh: true })) || user; // status may have changed on another device
  }
  if (user.tech?.status !== 'approved') {
    el.innerHTML = statusScreen(user);
    if ((user.tech?.status === 'pending' && !user.tech.idPhoto) || user.tech?.status === 'rejected') docsForm(el, user);
    return;
  }
  const handovers = await db.listMyHandovers();
  const q0 = normalizeId(query.get('q') || '');
  el.innerHTML = `
  <div class="page-head"><div><h2 class="page-title">لوحة الفني</h2><div class="muted small">${esc(user.tech.shopName)} — ${esc(user.tech.governorate)}</div></div>
    <span class="verified">${icon('badge-check', { size: 18 })} فني موثّق</span></div>
  <div class="layout-2">
    <div>
      <section class="card">
        <h3>${icon('search', { size: 18 })} افحص جهاز قبل ما تشتريه أو تصلّحه</h3>
        <form id="tech-check" class="search-box" role="search">
          <input id="tech-q" dir="ltr" inputmode="text" placeholder="رقم الـ IMEI أو السيريال" value="${esc(q0)}" required autocomplete="off" aria-label="رقم الـ IMEI أو السيريال">
          <button class="btn btn-primary">افحص</button>
        </form>
        <p class="hint" style="margin-top:10px">اطلب <span class="code-chip">*#06#</span> من الجهاز نفسه. متعتمدش على الرقم المكتوب على الضهر.</p>
        <div id="tech-result" aria-live="polite"></div>
      </section>
    </div>
    <div>
      <h3 class="section-title">التسليمات اللي سجلتها</h3>
      <div class="list">${handovers.length ? handovers.map((h) => `<div class="card small-card"><div class="rc-top"><b>${esc(h.report?.brand)} ${esc(h.report?.model)}</b>${badge(HANDOVER_STATUS[h.status].label, HANDOVER_STATUS[h.status].cls)}</div><div class="rc-meta"><span dir="ltr" class="mono">${esc(h.deviceImei)}</span> · ${fmtDateTime(h.createdAt)}</div></div>`).join('') : `<div class="card">${emptyState('package', 'مفيش تسليمات لسه', { text: 'لما تسلّم موبايل متبلّغ عنه لصاحبه، هيظهر هنا.', inCard: true })}</div>`}</div>
      ${safetyNote(true)}
    </div>
  </div>`;
  const form = $('#tech-check', el);
  const run = async (q) => {
    const out = $('#tech-result', el);
    const warn = /^\d{15}$/.test(q) && !validateImei(q).ok ? alertBox('warn', 'triangle-alert', 'الرقم ده شكله مكتوب غلط. راجعه من <span class="code-chip">*#06#</span>.') : '';
    out.innerHTML = '<div class="skel skel-card" style="margin-top:14px"></div>';
    let res;
    try { res = await db.searchReports(q, { asTechnician: true }); } catch (e) { out.innerHTML = ''; toast(e.message, 'error'); return; }
    const active = res.filter((r) => r.active);
    if (!active.length) {
      out.innerHTML = `${warn}<div class="verdict verdict-ok" data-testid="tech-clear"><div class="verdict-top"><span class="verdict-icon">${icon('circle-check', { size: 24 })}</span><div><b>مش متبلّغ عنه</b><div dir="ltr" class="mono">${esc(q)}</div></div></div>
        <div class="verdict-body muted">مفيش بلاغ نشط بالرقم ده. برضه اطلب العلبة أو الفاتورة.</div></div>`;
      return;
    }
    out.innerHTML = warn + active.map((r) => `<div class="verdict verdict-bad" data-testid="tech-reported">
      <div class="verdict-top"><span class="verdict-icon">${icon('octagon-alert', { size: 24 })}</span><div><b>متبلّغ عنه إنه ${r.type === 'lost' ? 'ضايع' : 'مسروق'}</b><div dir="ltr" class="mono">${esc(q)}</div></div></div>
      <div class="verdict-body">
        <dl class="kv"><dt>الجهاز</dt><dd>${esc(r.brand)} ${esc(r.model)} — ${esc(r.color)}</dd><dt>الحالة</dt><dd>${statusBadge(r.status)}</dd>
          <dt>تاريخ البلاغ</dt><dd>${fmtDate(r.reportedAt)}${r.governorate ? ' · ' + esc(r.governorate) : ''}</dd></dl>
        ${alertBox('danger', 'ban', 'متشتريش الجهاز ده، ومتفتحهوش ومتغيّرش سوفت وير. كلّم صاحبه من التطبيق.')}
        <div class="btn-row">
          <button class="btn btn-primary" data-contact="${r.id}">${icon('message-circle', { size: 18 })} كلّم صاحبه</button>
          ${r.status !== 'dispute' ? `<a class="btn btn-outline" href="#/tech/handover/${r.id}" data-testid="start-handover">${icon('package', { size: 18 })} سجّل تسليم لصاحبه</a>` : '<span class="small muted">البلاغ عليه نزاع، مينفعش تسليم دلوقتي.</span>'}
        </div></div></div>`).join('');
    $$('[data-contact]', out).forEach((b) => b.addEventListener('click', () => startMessageFlow(b.dataset.contact, user)));
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = normalizeId($('#tech-q', el).value); if (q) run(q); });
  if (q0) run(q0);
}

export async function handoverView(el, { params, user }) {
  if (user.tech?.status !== 'approved') { el.innerHTML = statusScreen(user); return; }
  const r = await db.getReport(params[0]);
  if (!r) { el.innerHTML = emptyState('circle-help', 'البلاغ ده مش موجود'); return; }
  if (!r.active) { el.innerHTML = emptyState('info', 'البلاغ ده مقفول', { text: 'مش محتاج تسجّل تسليم.', action: '<a class="btn btn-outline" href="#/tech">لوحة الفني</a>' }); return; }
  const state = {};
  el.innerHTML = `<div class="auth-wrap wide"><section class="card"><h2 class="page-title">سجّل تسليم موبايل لصاحبه</h2>
    <div class="summary">${esc(r.brand)} ${esc(r.model)} — ${esc(r.color)} ${statusBadge(r.status)}</div>
    ${alertBox('warn', 'triangle-alert', 'سلّم الموبايل جوه المحل وقدام الكاميرا لو فيه. ممنوع تطلب أي فلوس من صاحب الموبايل. أي شكوى ضغط أو تهديد بتوقف الحساب فوراً.')}
    <form id="handover-form" class="form" novalidate>
      <fieldset class="form-section"><legend>${icon('list-checks', { size: 18 })} اتأكد من الآتي</legend>
        <label class="check"><input type="checkbox" name="box"> صاحب الموبايل جاب العلبة الأصلية</label>
        <label class="check"><input type="checkbox" name="imeiMatch"> الـ IMEI اللي على العلبة هو نفسه اللي على الجهاز (بعد <span class="code-chip">*#06#</span>)</label>
        <label class="check"><input type="checkbox" name="unlocked"> صاحب الموبايل فتح القفل (باسورد/بصمة/نمط) قدامي</label>
        <label class="field"><span>الـ IMEI اللي ظاهر على الجهاز <span class="req">*</span></span><input name="deviceImei" dir="ltr" inputmode="numeric" maxlength="19" required placeholder="15 رقم"><small class="hint">لازم يطابق الـ IMEI اللي في البلاغ.</small></label>
      </fieldset>
      <fieldset class="form-section"><legend>${icon('camera', { size: 18 })} صور التسليم</legend>
        ${photoField({ name: 'ownerIdPhoto', label: 'بطاقة صاحب الموبايل', required: true, mode: 'live', facing: 'environment' })}
        ${photoField({ name: 'selfie', label: 'سيلفي التسليم (إنت وصاحب الموبايل والجهاز)', required: true, mode: 'live', facing: 'user' })}
      </fieldset>
      <label class="field"><span>ملاحظات <span class="opt">(اختياري)</span></span><textarea name="notes" rows="2"></textarea></label>
      <p class="hint">بعد ما تحفظ، صاحب الموبايل هيأكد الاستلام من حسابه. التسليم مش بيكمل غير بتأكيده.</p>
      <button class="btn btn-primary btn-block" type="submit">سجّل التسليم</button>
    </form></section></div>`;
  const f = $('#handover-form', el);
  bindPhotoFields(f, state);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.box.checked || !f.imeiMatch.checked || !f.unlocked.checked) return toast('لازم تتأكد من كل البنود قبل التسليم', 'error');
    if (!validateImei(f.deviceImei.value).ok) return toast('اكتب الـ IMEI الصح من الجهاز', 'error');
    if (!checkPhotoFields(f, state)) return toast('صوّر بطاقة صاحب الموبايل وسيلفي التسليم', 'error');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      await db.createHandover(r.id, {
        checklist: { box: true, imeiMatch: true, unlocked: true }, deviceImei: f.deviceImei.value,
        ownerIdPhoto: state.ownerIdPhoto, selfie: state.selfie, notes: f.notes.value.trim(),
      });
      toast('التسليم اتسجّل. مستنيين صاحب الموبايل يأكد', 'ok');
      go('#/tech');
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });
}
