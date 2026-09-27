// لوحة المالك — owner dashboard, report form, report details, dispute form
import db from '../db.js';
import { esc, fmtDate, fmtDateTime, validateImei, normalizeId, validateEgPhone, validateEmail, BRANDS, GOVERNORATES, STATUS, ACTIVE_STATUSES, DISPUTE_STATUS, HANDOVER_STATUS, debounce } from '../utils.js';
import { $, $$, go, toast, modal, confirmDialog, badge, statusBadge, hydrateImages, fileImg, photoField, bindPhotoFields, checkPhotoFields, emptyState, safetyNote, alertBox } from '../ui.js';
import { icon } from '../icons.js';

const phoneName = (r) => `${esc(r.brand)} ${esc(r.model)}`;

export async function ownerDashboardView(el, { user }) {
  const [reports, handovers, disputes, unread] = await Promise.all([db.listMyReports(), db.listMyHandovers(), db.listDisputes(), db.unreadCount()]);
  const pending = handovers.filter((h) => h.status === 'pending_owner');
  el.innerHTML = `
  <div class="page-head"><div><h2 class="page-title">أهلاً ${esc(user.name)}</h2><div class="muted small">بلاغاتك ورسايلك في مكان واحد</div></div>
    <a class="btn btn-primary" href="#/report/new">${icon('plus', { size: 18 })} بلاغ جديد</a></div>
  ${pending.map((h) => `<section class="card confirm-card" data-testid="confirm-handover">
      <h3>${icon('package')} أكّد إنك استلمت موبايلك</h3>
      <p>الفني <b>${esc(h.technicianName)}</b> من <b>${esc(h.shopName)}</b> سجّل إنه سلّمك <b>${phoneName(h.report)}</b> يوم ${fmtDateTime(h.createdAt)}.</p>
      <p class="muted small">أكّد بس لو استلمته فعلاً وبرضاك. لو حد هددك أو طلب منك فلوس، اختار «ما استلمتوش / حصل ضغط».</p>
      <div class="btn-row">
        <button class="btn btn-success" data-confirm="${h.id}">${icon('check', { size: 18 })} أيوه، استلمته</button>
        <button class="btn btn-danger-outline" data-coerce="${h.id}" data-report="${h.reportId}">${icon('triangle-alert', { size: 18 })} ما استلمتوش / حصل ضغط</button>
      </div></section>`).join('')}
  <div class="stats">
    <div class="stat"><b>${reports.length}</b><span>كل البلاغات</span></div>
    <div class="stat"><b>${reports.filter((r) => ACTIVE_STATUSES.includes(r.status)).length}</b><span>نشطة</span></div>
    <a class="stat" href="#/inbox"><b>${unread}</b><span>رسايل جديدة</span></a>
  </div>
  <h3 class="section-title">بلاغاتي</h3>
  <div class="list" id="my-reports">
  ${reports.length ? reports.map((r) => `
    <article class="report-card" data-testid="report-card">
      ${fileImg(r.boxPhoto, 'صورة العلبة', 'rc-img')}
      <div class="rc-body">
        <div class="rc-top"><h4>${phoneName(r)}</h4>${statusBadge(r.status)}</div>
        <div class="rc-meta">${esc(r.color)} · <span dir="ltr" class="mono">${esc(r.imei1)}</span></div>
        <div class="rc-meta">اتبلّغ عنه ${fmtDate(r.createdAt)}</div>
        <div class="btn-row">
          <a class="btn btn-sm btn-outline" href="#/report/${r.id}">التفاصيل</a>
          ${ACTIVE_STATUSES.includes(r.status) && r.status !== 'dispute' ? `<button class="btn btn-sm btn-outline" data-recover="${r.id}">${icon('check', { size: 16 })} رجعلي</button>` : ''}
          ${r.status !== 'dispute' ? `<a class="btn btn-sm btn-ghost" href="#/dispute/new/${r.id}">افتح نزاع</a>` : ''}
        </div>
      </div>
    </article>`).join('') : `<div class="card">${emptyState('smartphone', 'مفيش بلاغات لسه', { text: 'لو موبايلك اتسرق أو ضاع، بلّغ عنه عشان أي حد يفحصه يعرف إنه بتاعك.', action: '<a class="btn btn-primary" href="#/report/new">بلّغ عن موبايل</a>', inCard: true })}</div>`}
  </div>
  ${disputes.length ? `<h3 class="section-title">النزاعات</h3><div class="list">${disputes.map((d) => `
    <div class="card small-card"><div class="rc-top"><b>${d.report ? phoneName(d.report) : ''}</b>${badge(DISPUTE_STATUS[d.status].label, DISPUTE_STATUS[d.status].cls)}</div>
    <p class="small">${esc(d.description)}</p><div class="muted small">${fmtDateTime(d.createdAt)}${d.notes.length ? ` · آخر رد من فريق لقيته: ${esc(d.notes[d.notes.length - 1].text)}` : ''}</div></div>`).join('')}</div>` : ''}
  ${safetyNote(true)}`;
  hydrateImages(el);
  $$('[data-recover]', el).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('موبايلك رجعلك؟ البلاغ هيتقفل ومش هيظهر إنه مسروق لما حد يفحصه.', { okLabel: 'أيوه، رجعلي' }))) return;
    await db.setReportStatus(b.dataset.recover, 'found', 'المالك أكد استرداد الهاتف');
    toast('تمام، البلاغ اتقفل', 'ok'); go('#/owner');
  }));
  $$('[data-confirm]', el).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('بأكد إني استلمت موبايلي بنفسي، من غير أي ضغط ومن غير ما أدفع فلوس.', { okLabel: 'أيوه، بأكد' }))) return;
    try { await db.confirmHandover(b.dataset.confirm); toast('حمد الله على السلامة! الاستلام اتأكد', 'ok'); go('#/owner'); } catch (e) { toast(e.message, 'error'); }
  }));
  $$('[data-coerce]', el).forEach((b) => b.addEventListener('click', () => go(`#/dispute/new/${b.dataset.report}?handover=${b.dataset.coerce}&coercion=1`)));
}

const socialRow = (i, v = { value: '', public: false }) => `<div class="contact-row" data-social="${i}">
  <input name="social${i}" type="url" dir="ltr" placeholder="https://facebook.com/..." value="${esc(v.value)}">
  <label class="switch"><input type="checkbox" name="social${i}Public" ${v.public ? 'checked' : ''}><span>يظهر</span></label></div>`;

export function contactFieldsHTML(c = {}) {
  return `<div class="contact-block form">
    <p class="hint">${icon('eye-off', { size: 16 })} بياناتك <b>مخفية</b> من الأول. الناس بتبعتلك رسايل جوه التطبيق. فعّل «يظهر» بس للي عايزه يبان في نتيجة الفحص.</p>
    <div class="field"><span class="field-label">رقم الموبايل</span>
    <div class="contact-row"><input name="cPhone" inputmode="tel" dir="ltr" value="${esc(c.phone?.value || '')}" placeholder="01xxxxxxxxx" aria-label="رقم الموبايل">
      <label class="switch"><input type="checkbox" name="cPhonePublic" ${c.phone?.public ? 'checked' : ''}><span>يظهر</span></label></div></div>
    <div class="field"><span class="field-label">الإيميل</span>
    <div class="contact-row"><input name="cEmail" type="email" dir="ltr" value="${esc(c.email?.value || '')}" aria-label="الإيميل">
      <label class="switch"><input type="checkbox" name="cEmailPublic" ${c.email?.public ? 'checked' : ''}><span>يظهر</span></label></div></div>
    <div class="field"><span class="field-label">لينكات السوشيال ميديا <span class="opt">(اختياري)</span></span>
    ${[0, 1, 2].map((i) => socialRow(i, c.socials?.[i])).join('')}</div>
  </div>`;
}
export function readContact(f) {
  return {
    phone: { value: validateEgPhone(f.cPhone.value).value || f.cPhone.value.trim(), public: f.cPhonePublic.checked },
    email: { value: f.cEmail.value.trim(), public: f.cEmailPublic.checked },
    socials: [0, 1, 2].map((i) => ({ value: f['social' + i].value.trim(), public: f[`social${i}Public`].checked })).filter((s) => s.value),
  };
}
function validateContact(c) {
  if (c.phone.value && !validateEgPhone(c.phone.value).ok) return 'رقم الموبايل مش صح';
  if (c.email.value && !validateEmail(c.email.value)) return 'الإيميل مش صح';
  if (c.socials.some((s) => !/^https?:\/\/\S+\.\S+/.test(s.value))) return 'اللينك لازم يبدأ بـ https://';
  return null;
}

export async function newReportView(el, { user }) {
  const state = {};
  el.innerHTML = `<div class="auth-wrap wide"><section class="card"><h2 class="page-title">بلّغ عن موبايل</h2>
  <p class="page-sub">البلاغ بيخلّي أي حد يفحص الـ IMEI يعرف إن الموبايل ده مسروق أو ضايع.</p>
  <form id="report-form" class="form" novalidate>
    <fieldset class="form-section"><legend>الموبايل ده</legend>
      <div class="seg" role="radiogroup" aria-label="نوع البلاغ"><label><input type="radio" name="type" value="stolen" checked><span>اتسرق</span></label><label><input type="radio" name="type" value="lost"><span>ضاع</span></label></div>
    </fieldset>
    <fieldset class="form-section"><legend>بيانات الموبايل</legend>
      <div class="grid-3">
        <label class="field"><span>الماركة <span class="req">*</span></span><select name="brand" required><option value="">اختار</option>${BRANDS.map((b) => `<option>${b}</option>`).join('')}</select></label>
        <label class="field"><span>الموديل <span class="req">*</span></span><input name="model" required placeholder="مثلاً Galaxy A54"></label>
        <label class="field"><span>اللون <span class="req">*</span></span><input name="color" required placeholder="مثلاً أسود"></label>
      </div>
      <label class="field"><span>IMEI 1 <span class="req">*</span></span><input name="imei1" required inputmode="numeric" dir="ltr" maxlength="19" placeholder="15 رقم" autocomplete="off"><small class="field-msg" id="imei1-msg"></small>
        <small class="hint">اطلب <span class="code-chip">*#06#</span> من الموبايل لو معاك، أو بصّ على ملصق العلبة أو الفاتورة.</small></label>
      <div class="grid-2">
        <label class="field"><span>IMEI 2 <span class="opt">(لو الموبايل خطين)</span></span><input name="imei2" inputmode="numeric" dir="ltr" maxlength="19"><small class="field-msg" id="imei2-msg"></small></label>
        <label class="field"><span>السيريال <span class="opt">(اختياري)</span></span><input name="serial" dir="ltr" autocomplete="off"></label>
      </div>
      ${photoField({ name: 'boxPhoto', label: 'صورة العلبة وعليها الـ IMEI', required: true, mode: 'capture', facing: 'environment', hint: 'بتثبت إن الموبايل بتاعك. مش هتظهر لحد.' })}
      ${photoField({ name: 'invoicePhoto', label: 'صورة الفاتورة', mode: 'capture', facing: 'environment' })}
    </fieldset>
    <fieldset class="form-section"><legend>حصل إزاي</legend>
      <div class="grid-2">
        <label class="field"><span>التاريخ</span><input name="incidentDate" type="date" max="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="field"><span>المحافظة</span><select name="governorate"><option value="">اختار</option>${GOVERNORATES.map((g) => `<option>${g}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>المكان</span><input name="place" placeholder="مثلاً محطة مترو ..."></label>
      <label class="field"><span>وصف قصير</span><textarea name="description" rows="2"></textarea></label>
      <label class="field"><span>رقم المحضر <span class="opt">(اختياري)</span></span><input name="policeNumber" placeholder="مثلاً 1234 لسنة 2026 إداري ..."></label>
      ${photoField({ name: 'policePhoto', label: 'صورة المحضر', mode: 'capture', facing: 'environment' })}
    </fieldset>
    <fieldset class="form-section"><legend>التواصل والخصوصية</legend>${contactFieldsHTML({ phone: { value: user.phone, public: false }, email: { value: user.email, public: false } })}</fieldset>
    <label class="check"><input type="checkbox" name="agree"> الموبايل ده بتاعي والبيانات صحيحة. عارف إن البلاغ الكاذب بيعرّضني للمساءلة وإيقاف الحساب.</label>
    <button class="btn btn-primary btn-block" type="submit">ابعت البلاغ</button>
  </form></section></div>`;
  const f = $('#report-form', el);
  bindPhotoFields(f, state);
  const liveImei = (name, required) => {
    const input = f[name], msg = $(`#${name}-msg`, el);
    const run = () => {
      const v = input.value.trim();
      if (!v && !required) { msg.textContent = ''; input.classList.remove('invalid', 'valid'); return true; }
      const r = validateImei(v);
      msg.textContent = r.ok ? 'الرقم صح' : r.msg;
      msg.className = 'field-msg ' + (r.ok ? 'ok' : 'err');
      input.classList.toggle('invalid', !r.ok); input.classList.toggle('valid', r.ok);
      return r.ok;
    };
    input.addEventListener('input', debounce(() => { if (input.value.replace(/\D/g, '').length >= 15 || !input.value) run(); }, 200));
    input.addEventListener('blur', run);
    return run;
  };
  const v1 = liveImei('imei1', true), v2 = liveImei('imei2', false);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.brand.value || !f.model.value.trim() || !f.color.value.trim()) return toast('كمّل الماركة والموديل واللون', 'error');
    if (!v1()) { f.imei1.focus(); return toast('IMEI 1 مش صح', 'error'); }
    if (!v2()) { f.imei2.focus(); return toast('IMEI 2 مش صح', 'error'); }
    if (f.imei2.value && normalizeId(f.imei2.value) === normalizeId(f.imei1.value)) return toast('IMEI 2 هو نفس IMEI 1', 'error');
    if (!checkPhotoFields(f, state)) return toast('محتاجين صورة العلبة', 'error');
    const contact = readContact(f);
    const cErr = validateContact(contact);
    if (cErr) return toast(cErr, 'error');
    if (!f.agree.checked) return toast('لازم تأكد إن البيانات صحيحة', 'error');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> بنبعت البلاغ…';
    try {
      const r = await db.createReport({
        type: f.type.value, brand: f.brand.value, model: f.model.value.trim(), color: f.color.value.trim(),
        imei1: f.imei1.value, imei2: f.imei2.value, serial: f.serial.value, incidentDate: f.incidentDate.value, governorate: f.governorate.value,
        place: f.place.value.trim(), description: f.description.value.trim(), policeNumber: f.policeNumber.value.trim(),
        boxPhoto: state.boxPhoto, invoicePhoto: state.invoicePhoto, policePhoto: state.policePhoto, contact,
      });
      toast('البلاغ اتسجّل. أي حد يفحص الموبايل هيعرف إنه متبلّغ عنه', 'ok');
      go('#/report/' + r.id);
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'ابعت البلاغ'; }
  });
}

export async function reportDetailView(el, { params, user }) {
  const r = await db.getReport(params[0]);
  if (!r || !r.imei1) { el.innerHTML = emptyState('lock', 'البلاغ ده مش موجود', { text: 'أو مش من حقك تشوفه.', action: '<a class="btn btn-outline" href="#/">الرئيسية</a>' }); return; }
  const isOwner = user.id === r.ownerId;
  const [handovers, disputes] = await Promise.all([db.listHandoversForReport(r.id), db.listDisputes()]);
  const myDisputes = disputes.filter((d) => d.reportId === r.id);
  const c = r.contact || {};
  const pub = (x) => (x ? badge('بيظهر', 'info') : badge('مخفي', 'muted'));
  el.innerHTML = `
  <div class="page-head"><h2 class="page-title">${phoneName(r)}</h2>${statusBadge(r.status)}</div>
  <section class="card">
    <dl class="kv">
      <dt>نوع البلاغ</dt><dd>${STATUS[r.type].label}</dd><dt>اللون</dt><dd>${esc(r.color)}</dd>
      <dt>IMEI 1</dt><dd dir="ltr" class="mono">${esc(r.imei1)}</dd>
      ${r.imei2 ? `<dt>IMEI 2</dt><dd dir="ltr" class="mono">${esc(r.imei2)}</dd>` : ''}
      ${r.serial ? `<dt>الرقم التسلسلي</dt><dd dir="ltr" class="mono">${esc(r.serial)}</dd>` : ''}
      <dt>التاريخ</dt><dd>${esc(r.incidentDate || '—')}</dd>
      <dt>المكان</dt><dd>${esc([r.governorate, r.place].filter(Boolean).join(' — ') || '—')}</dd>
      ${r.description ? `<dt>الوصف</dt><dd>${esc(r.description)}</dd>` : ''}
      <dt>رقم المحضر</dt><dd>${esc(r.policeNumber || '—')}</dd>
    </dl>
    <div class="photos">
      <figure>${fileImg(r.boxPhoto, 'صورة العلبة')}<figcaption>العلبة</figcaption></figure>
      ${r.invoicePhoto ? `<figure>${fileImg(r.invoicePhoto, 'الفاتورة')}<figcaption>الفاتورة</figcaption></figure>` : ''}
      ${r.policePhoto ? `<figure>${fileImg(r.policePhoto, 'المحضر')}<figcaption>المحضر</figcaption></figure>` : ''}
    </div>
  </section>
  <section class="card"><div class="rc-top" style="margin-bottom:6px"><h3 style="margin:0">بيانات التواصل</h3>${isOwner ? `<button class="btn btn-sm btn-outline" id="edit-privacy">${icon('eye', { size: 16 })} الخصوصية</button>` : ''}</div>
    <ul class="plain">
      <li>${icon('phone', { size: 16, cls: 'muted' })}<span class="grow" dir="ltr" style="text-align:start">${esc(c.phone?.value || '—')}</span> ${pub(c.phone?.public)}</li>
      <li>${icon('mail', { size: 16, cls: 'muted' })}<span class="grow">${esc(c.email?.value || '—')}</span> ${pub(c.email?.public)}</li>
      ${(c.socials || []).map((s) => `<li>${icon('link', { size: 16, cls: 'muted' })}<span class="grow" dir="ltr" style="text-align:start">${esc(s.value)}</span> ${pub(s.public)}</li>`).join('')}
    </ul></section>
  ${isOwner ? `<div class="btn-row">
    ${ACTIVE_STATUSES.includes(r.status) && r.status !== 'dispute' ? `<button class="btn btn-success" id="mark-found">${icon('check', { size: 18 })} الموبايل رجعلي</button>` : ''}
    ${r.status === 'found' ? `<button class="btn btn-outline" id="reactivate">${icon('rotate-ccw', { size: 18 })} رجّع البلاغ نشط</button>` : ''}
    ${r.status !== 'dispute' ? `<a class="btn btn-ghost" href="#/dispute/new/${r.id}">افتح نزاع</a>` : ''}
  </div>` : ''}
  ${handovers.length ? `<section class="card"><h3>التسليم</h3>${handovers.map((h) => `<div class="timeline-item"><b>${esc(h.shopName)}</b> — ${esc(h.technicianName)} ${badge(HANDOVER_STATUS[h.status].label, HANDOVER_STATUS[h.status].cls)}<div class="muted small">${fmtDateTime(h.createdAt)}</div></div>`).join('')}</section>` : ''}
  ${myDisputes.length ? `<section class="card"><h3>النزاعات</h3>${myDisputes.map((d) => `<div class="timeline-item">${badge(DISPUTE_STATUS[d.status].label, DISPUTE_STATUS[d.status].cls)} ${esc(d.description)}<div class="muted small">${fmtDateTime(d.createdAt)}</div>${d.notes.map((n) => `<div class="note"><b>${esc(n.byName)}:</b> ${esc(n.text)}</div>`).join('')}</div>`).join('')}</section>` : ''}
  <section class="card"><h3>${icon('history', { size: 18 })} سجل الحالة</h3><div class="timeline">${(r.history || []).slice().reverse().map((h) => `<div class="timeline-item">${statusBadge(h.status)} ${esc(h.note || '')}<div class="muted small">${fmtDateTime(h.at)}${h.byName ? ' · ' + esc(h.byName) : ''}</div></div>`).join('')}</div></section>`;
  hydrateImages(el);
  $('#mark-found', el)?.addEventListener('click', async () => {
    if (!(await confirmDialog('موبايلك رجعلك؟ البلاغ هيتقفل.', { okLabel: 'أيوه، رجعلي' }))) return;
    await db.setReportStatus(r.id, 'found', 'المالك أكد استرداد الهاتف'); toast('تمام، البلاغ اتقفل', 'ok'); go('#/report/' + r.id);
  });
  $('#reactivate', el)?.addEventListener('click', async () => { await db.setReportStatus(r.id, r.type, 'إعادة تفعيل البلاغ'); toast('البلاغ رجع نشط', 'ok'); go('#/report/' + r.id); });
  $('#edit-privacy', el)?.addEventListener('click', () => {
    const m = modal({ title: 'التواصل والخصوصية', body: `<form class="form" id="privacy-form">${contactFieldsHTML(c)}<button class="btn btn-primary btn-block">احفظ</button></form>` });
    $('#privacy-form', m.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const nc = readContact(e.target); const err = validateContact(nc);
      if (err) return toast(err, 'error');
      try { await db.updateReportContact(r.id, nc); m.close(); toast('اتحفظ', 'ok'); go('#/report/' + r.id); } catch (e2) { toast(e2.message, 'error'); }
    });
  });
}

export async function disputeFormView(el, { params, query }) {
  const r = await db.getReport(params[0]);
  if (!r || !r.imei1) { el.innerHTML = emptyState('lock', 'البلاغ ده مش موجود'); return; }
  const handoverId = query.get('handover') || '';
  const coercion = query.get('coercion') === '1';
  el.innerHTML = `<div class="auth-wrap wide"><section class="card"><h2 class="page-title">افتح نزاع</h2><p class="page-sub">${phoneName(r)}</p>
    ${coercion ? alertBox('danger', 'shield-alert', '<b>سلامتك الأول.</b> لو إنت في خطر دلوقتي كلّم النجدة <b dir="ltr">122</b>. هنوقف عملية التسليم وفريق لقيته هيراجع الفني.') : ''}
    <form id="dispute-form" class="form" novalidate>
      <label class="field"><span>إيه اللي حصل؟ <span class="req">*</span></span><textarea name="description" rows="5" required placeholder="مثلاً: رحت المحل أستلم موبايلي، طلبوا مني فلوس وهددوني عشان أسيب العلبة…"></textarea></label>
      <label class="check"><input type="checkbox" name="coercion" ${coercion ? 'checked' : ''}> اتعرّضت لتهديد أو ضغط أو ابتزاز</label>
      <label class="field"><span>رقم المحضر <span class="opt">(لو فيه)</span></span><input name="policeNumber"></label>
      <label class="field"><span>فيديو أو كاميرات مراقبة <span class="opt">(اختياري)</span></span><input type="file" name="evidenceFile" accept="video/*,image/*"><small class="hint">بنسجّل اسم الملف بس. ابعت الفيديو نفسه كلينك تحت.</small></label>
      <label class="field"><span>لينك الفيديو <span class="opt">(اختياري)</span></span><input name="evidenceLink" type="url" dir="ltr" placeholder="https://"></label>
      <label class="field"><span>الشهود <span class="opt">(اختياري)</span></span><textarea name="witnesses" rows="2" placeholder="اسم ورقم كل شاهد"></textarea></label>
      <button class="btn btn-danger btn-block" type="submit">ابعت النزاع</button>
    </form></section></div>`;
  $('#dispute-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.description.value.trim().length < 10) return toast('اكتب اللي حصل بوضوح (١٠ حروف على الأقل)', 'error');
    if (f.evidenceLink.value && !/^https?:\/\//.test(f.evidenceLink.value)) return toast('اللينك لازم يبدأ بـ https://', 'error');
    try {
      await db.createDispute({
        reportId: r.id, handoverId, coercion: f.coercion.checked, description: f.description.value.trim(), policeNumber: f.policeNumber.value.trim(),
        evidenceFileName: f.evidenceFile.files[0]?.name || '', evidenceLink: f.evidenceLink.value.trim(), witnesses: f.witnesses.value.trim(),
      });
      toast('النزاع وصل. فريق لقيته هيتواصل معاك', 'ok');
      go('#/owner');
    } catch (err) { toast(err.message, 'error'); }
  });
}
