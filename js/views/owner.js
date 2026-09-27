// لوحة المالك — owner dashboard, report form, report details, dispute form
import db from '../db.js';
import { esc, fmtDate, fmtDateTime, validateImei, normalizeId, validateEgPhone, validateEmail, BRANDS, GOVERNORATES, STATUS, ACTIVE_STATUSES, DISPUTE_STATUS, HANDOVER_STATUS, debounce } from '../utils.js';
import { $, $$, go, toast, modal, confirmDialog, badge, statusBadge, hydrateImages, fileImg, photoField, bindPhotoFields, checkPhotoFields, emptyState, safetyNote } from '../ui.js';

const phoneName = (r) => `${esc(r.brand)} ${esc(r.model)}`;

export async function ownerDashboardView(el, { user }) {
  const [reports, handovers, disputes, unread] = await Promise.all([db.listMyReports(), db.listMyHandovers(), db.listDisputes(), db.unreadCount()]);
  const pending = handovers.filter((h) => h.status === 'pending_owner');
  el.innerHTML = `
  <div class="page-head"><h2 class="page-title">أهلاً ${esc(user.name)} 👋</h2><a class="btn btn-primary" href="#/report/new">➕ إبلاغ عن هاتف</a></div>
  ${pending.map((h) => `<section class="card confirm-card" data-testid="confirm-handover">
      <h3>📦 أكّد استلام هاتفك</h3>
      <p>سجّل الفني <b>${esc(h.technicianName)}</b> — <b>${esc(h.shopName)}</b> تسليم هاتفك <b>${phoneName(h.report)}</b> بتاريخ ${fmtDateTime(h.createdAt)}.</p>
      <p class="muted small">أكّد فقط إذا استلمت هاتفك فعلاً وبإرادتك. إذا تعرضت لأي تهديد أو إكراه أو طُلب منك مال، اختر «لم أستلمه / تعرضت لضغط».</p>
      <div class="btn-row">
        <button class="btn btn-success" data-confirm="${h.id}">✅ نعم، استلمت هاتفي</button>
        <button class="btn btn-danger" data-coerce="${h.id}" data-report="${h.reportId}">⚠️ لم أستلمه / تعرضت لضغط أو تهديد</button>
      </div></section>`).join('')}
  <div class="stats">
    <div class="stat"><b>${reports.length}</b><span>بلاغاتي</span></div>
    <div class="stat"><b>${reports.filter((r) => ACTIVE_STATUSES.includes(r.status)).length}</b><span>نشطة</span></div>
    <a class="stat" href="#/inbox"><b>${unread}</b><span>رسائل جديدة</span></a>
  </div>
  <h3 class="section-title">بلاغاتي</h3>
  <div class="list" id="my-reports">
  ${reports.length ? reports.map((r) => `
    <article class="report-card" data-testid="report-card">
      ${fileImg(r.boxPhoto, 'صورة العلبة', 'rc-img')}
      <div class="rc-body">
        <div class="rc-top"><h4>${phoneName(r)}</h4>${statusBadge(r.status)}</div>
        <div class="muted small">${esc(r.color)} · IMEI <span dir="ltr" class="mono">${esc(r.imei1)}</span></div>
        <div class="muted small">أُبلغ عنه ${fmtDate(r.createdAt)}</div>
        <div class="btn-row">
          <a class="btn btn-sm btn-outline" href="#/report/${r.id}">التفاصيل</a>
          ${ACTIVE_STATUSES.includes(r.status) && r.status !== 'dispute' ? `<button class="btn btn-sm btn-success" data-recover="${r.id}">تم العثور عليه</button>` : ''}
          ${r.status !== 'dispute' ? `<a class="btn btn-sm btn-ghost" href="#/dispute/new/${r.id}">فتح نزاع</a>` : ''}
        </div>
      </div>
    </article>`).join('') : emptyState('📱', 'لم تبلغ عن أي هاتف بعد', '<a class="btn btn-primary" href="#/report/new">إبلاغ عن هاتف</a>')}
  </div>
  ${disputes.length ? `<h3 class="section-title">النزاعات</h3><div class="list">${disputes.map((d) => `
    <div class="card small-card"><div class="rc-top"><b>${d.report ? phoneName(d.report) : ''}</b>${badge(DISPUTE_STATUS[d.status].label, DISPUTE_STATUS[d.status].cls)}</div>
    <p class="small">${esc(d.description)}</p><div class="muted small">${fmtDateTime(d.createdAt)}${d.notes.length ? ` · آخر رد من الدعم: ${esc(d.notes[d.notes.length - 1].text)}` : ''}</div></div>`).join('')}</div>` : ''}
  ${safetyNote(true)}`;
  hydrateImages(el);
  $$('[data-recover]', el).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('هل استعدت هاتفك؟ سيتم تغيير حالة البلاغ إلى «تم العثور عليه» ولن يظهر كمسروق عند الفحص.'))) return;
    await db.setReportStatus(b.dataset.recover, 'found', 'المالك أكد استرداد الهاتف');
    toast('تم تحديث الحالة ✅', 'ok'); go('#/owner');
  }));
  $$('[data-confirm]', el).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('أؤكد أنني استلمت هاتفي بنفسي وبدون أي ضغط أو دفع أموال.', { okLabel: 'نعم، أؤكد' }))) return;
    try { await db.confirmHandover(b.dataset.confirm); toast('تم تأكيد الاستلام — حمداً لله على السلامة 🎉', 'ok'); go('#/owner'); } catch (e) { toast(e.message, 'error'); }
  }));
  $$('[data-coerce]', el).forEach((b) => b.addEventListener('click', () => go(`#/dispute/new/${b.dataset.report}?handover=${b.dataset.coerce}&coercion=1`)));
}

const socialRow = (i, v = { value: '', public: false }) => `<div class="contact-row" data-social="${i}">
  <input name="social${i}" type="url" dir="ltr" placeholder="https://facebook.com/..." value="${esc(v.value)}">
  <label class="switch"><input type="checkbox" name="social${i}Public" ${v.public ? 'checked' : ''}><span>عام</span></label></div>`;

export function contactFieldsHTML(c = {}) {
  return `<div class="contact-block">
    <p class="hint">🔒 افتراضياً <b>لا تظهر</b> بياناتك للعامة؛ يتواصل معك الناس برسائل داخل التطبيق وأنت تقرر متى تكشف بياناتك. فعّل «عام» فقط لما تريد إظهاره في نتيجة البحث.</p>
    <label class="field-label">رقم الموبايل</label>
    <div class="contact-row"><input name="cPhone" inputmode="tel" dir="ltr" value="${esc(c.phone?.value || '')}" placeholder="01xxxxxxxxx">
      <label class="switch"><input type="checkbox" name="cPhonePublic" ${c.phone?.public ? 'checked' : ''}><span>عام</span></label></div>
    <label class="field-label">البريد الإلكتروني</label>
    <div class="contact-row"><input name="cEmail" type="email" dir="ltr" value="${esc(c.email?.value || '')}">
      <label class="switch"><input type="checkbox" name="cEmailPublic" ${c.email?.public ? 'checked' : ''}><span>عام</span></label></div>
    <label class="field-label">روابط حسابات التواصل الاجتماعي</label>
    ${[0, 1, 2].map((i) => socialRow(i, c.socials?.[i])).join('')}
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
  if (c.phone.value && !validateEgPhone(c.phone.value).ok) return 'رقم الموبايل غير صحيح';
  if (c.email.value && !validateEmail(c.email.value)) return 'البريد الإلكتروني غير صحيح';
  if (c.socials.some((s) => !/^https?:\/\/\S+\.\S+/.test(s.value))) return 'روابط التواصل يجب أن تبدأ بـ https://';
  return null;
}

export async function newReportView(el, { user }) {
  const state = {};
  el.innerHTML = `<section class="card"><h2 class="page-title">إبلاغ عن هاتف مسروق أو مفقود</h2>
  <form id="report-form" class="form" novalidate>
    <fieldset><legend>نوع البلاغ</legend>
      <div class="seg"><label><input type="radio" name="type" value="stolen" checked><span>🚨 مسروق</span></label><label><input type="radio" name="type" value="lost"><span>❓ مفقود</span></label></div>
    </fieldset>
    <fieldset><legend>بيانات الهاتف</legend>
      <div class="grid-3">
        <label class="field"><span>الماركة <span class="req">*</span></span><select name="brand" required><option value="">اختر…</option>${BRANDS.map((b) => `<option>${b}</option>`).join('')}</select></label>
        <label class="field"><span>الموديل <span class="req">*</span></span><input name="model" required placeholder="مثال: Galaxy A54"></label>
        <label class="field"><span>اللون <span class="req">*</span></span><input name="color" required placeholder="مثال: أسود"></label>
      </div>
      <label class="field"><span>IMEI 1 <span class="req">*</span></span><input name="imei1" required inputmode="numeric" dir="ltr" maxlength="19" placeholder="15 رقماً" autocomplete="off"><small class="field-msg" id="imei1-msg"></small></label>
      <p class="hint">اطلب <b dir="ltr">*#06#</b> على الهاتف (إن كان معك) أو انظر إلى الملصق على العلبة أو الفاتورة.</p>
      <div class="grid-2">
        <label class="field"><span>IMEI 2 <span class="opt">(اختياري — للهواتف ثنائية الشريحة)</span></span><input name="imei2" inputmode="numeric" dir="ltr" maxlength="19"><small class="field-msg" id="imei2-msg"></small></label>
        <label class="field"><span>الرقم التسلسلي <span class="opt">(اختياري)</span></span><input name="serial" dir="ltr" autocomplete="off"></label>
      </div>
      ${photoField({ name: 'boxPhoto', label: 'صورة علبة الهاتف يظهر فيها IMEI', required: true, mode: 'capture', facing: 'environment', hint: 'تثبت ملكيتك وتقلل البلاغات الكاذبة. لن تظهر للعامة.' })}
      ${photoField({ name: 'invoicePhoto', label: 'صورة فاتورة الشراء', mode: 'capture', facing: 'environment' })}
    </fieldset>
    <fieldset><legend>تفاصيل الواقعة</legend>
      <div class="grid-2">
        <label class="field"><span>تاريخ الواقعة</span><input name="incidentDate" type="date" max="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="field"><span>المحافظة</span><select name="governorate"><option value="">اختر…</option>${GOVERNORATES.map((g) => `<option>${g}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>المكان</span><input name="place" placeholder="مثال: محطة مترو ..."></label>
      <label class="field"><span>وصف مختصر</span><textarea name="description" rows="2"></textarea></label>
      <label class="field"><span>رقم المحضر <span class="opt">(اختياري)</span></span><input name="policeNumber" placeholder="مثال: 1234 لسنة 2026 إداري ..."></label>
      ${photoField({ name: 'policePhoto', label: 'صورة المحضر', mode: 'capture', facing: 'environment' })}
    </fieldset>
    <fieldset><legend>بيانات التواصل والخصوصية</legend>${contactFieldsHTML({ phone: { value: user.phone, public: false }, email: { value: user.email, public: false } })}</fieldset>
    <label class="check"><input type="checkbox" name="agree"> أقر بأن الهاتف ملكي وأن المعلومات صحيحة، وأعلم أن البلاغ الكاذب يعرضني للمساءلة وإيقاف الحساب.</label>
    <button class="btn btn-primary btn-block" type="submit">إرسال البلاغ</button>
  </form></section>`;
  const f = $('#report-form', el);
  bindPhotoFields(f, state);
  const liveImei = (name, required) => {
    const input = f[name], msg = $(`#${name}-msg`, el);
    const run = () => {
      const v = input.value.trim();
      if (!v && !required) { msg.textContent = ''; input.classList.remove('invalid', 'valid'); return true; }
      const r = validateImei(v);
      msg.textContent = r.ok ? '✓ رقم IMEI صحيح' : r.msg;
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
    if (!f.brand.value || !f.model.value.trim() || !f.color.value.trim()) return toast('أكمل الماركة والموديل واللون', 'error');
    if (!v1()) { f.imei1.focus(); return toast('رقم IMEI 1 غير صحيح', 'error'); }
    if (!v2()) { f.imei2.focus(); return toast('رقم IMEI 2 غير صحيح', 'error'); }
    if (f.imei2.value && normalizeId(f.imei2.value) === normalizeId(f.imei1.value)) return toast('IMEI 2 مطابق لـ IMEI 1', 'error');
    if (!checkPhotoFields(f, state)) return toast('صورة علبة الهاتف مطلوبة', 'error');
    const contact = readContact(f);
    const cErr = validateContact(contact);
    if (cErr) return toast(cErr, 'error');
    if (!f.agree.checked) return toast('يجب الإقرار بصحة البيانات', 'error');
    try {
      const r = await db.createReport({
        type: f.type.value, brand: f.brand.value, model: f.model.value.trim(), color: f.color.value.trim(),
        imei1: f.imei1.value, imei2: f.imei2.value, serial: f.serial.value, incidentDate: f.incidentDate.value, governorate: f.governorate.value,
        place: f.place.value.trim(), description: f.description.value.trim(), policeNumber: f.policeNumber.value.trim(),
        boxPhoto: state.boxPhoto, invoicePhoto: state.invoicePhoto, policePhoto: state.policePhoto, contact,
      });
      toast('تم تسجيل البلاغ ✅ سيظهر هاتفك كمبلغ عنه عند فحصه', 'ok');
      go('#/report/' + r.id);
    } catch (err) { toast(err.message, 'error'); }
  });
}

export async function reportDetailView(el, { params, user }) {
  const r = await db.getReport(params[0]);
  if (!r || !r.imei1) { el.innerHTML = emptyState('🔒', 'البلاغ غير موجود أو ليست لديك صلاحية لعرضه'); return; }
  const isOwner = user.id === r.ownerId;
  const [handovers, disputes] = await Promise.all([db.listHandoversForReport(r.id), db.listDisputes()]);
  const myDisputes = disputes.filter((d) => d.reportId === r.id);
  const c = r.contact || {};
  const pub = (x) => (x ? badge('عام', 'info') : badge('مخفي', 'muted'));
  el.innerHTML = `
  <div class="page-head"><h2 class="page-title">${phoneName(r)}</h2>${statusBadge(r.status)}</div>
  <section class="card">
    <dl class="kv">
      <dt>نوع البلاغ</dt><dd>${STATUS[r.type].label}</dd><dt>اللون</dt><dd>${esc(r.color)}</dd>
      <dt>IMEI 1</dt><dd dir="ltr" class="mono">${esc(r.imei1)}</dd>
      ${r.imei2 ? `<dt>IMEI 2</dt><dd dir="ltr" class="mono">${esc(r.imei2)}</dd>` : ''}
      ${r.serial ? `<dt>الرقم التسلسلي</dt><dd dir="ltr" class="mono">${esc(r.serial)}</dd>` : ''}
      <dt>تاريخ الواقعة</dt><dd>${esc(r.incidentDate || '—')}</dd>
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
  <section class="card"><div class="rc-top"><h3>بيانات التواصل</h3>${isOwner ? '<button class="btn btn-sm btn-outline" id="edit-privacy">تعديل الخصوصية</button>' : ''}</div>
    <ul class="plain">
      <li>📞 <span dir="ltr">${esc(c.phone?.value || '—')}</span> ${pub(c.phone?.public)}</li>
      <li>✉️ ${esc(c.email?.value || '—')} ${pub(c.email?.public)}</li>
      ${(c.socials || []).map((s) => `<li>🔗 <span dir="ltr">${esc(s.value)}</span> ${pub(s.public)}</li>`).join('')}
    </ul></section>
  ${isOwner ? `<div class="btn-row">
    ${ACTIVE_STATUSES.includes(r.status) && r.status !== 'dispute' ? '<button class="btn btn-success" id="mark-found">تم العثور عليه</button>' : ''}
    ${r.status === 'found' ? '<button class="btn btn-outline" id="reactivate">إعادة تفعيل البلاغ</button>' : ''}
    ${r.status !== 'dispute' ? `<a class="btn btn-ghost" href="#/dispute/new/${r.id}">فتح نزاع</a>` : ''}
  </div>` : ''}
  ${handovers.length ? `<section class="card"><h3>عمليات التسليم</h3>${handovers.map((h) => `<div class="timeline-item"><b>${esc(h.shopName)}</b> — ${esc(h.technicianName)} ${badge(HANDOVER_STATUS[h.status].label, HANDOVER_STATUS[h.status].cls)}<div class="muted small">${fmtDateTime(h.createdAt)}</div></div>`).join('')}</section>` : ''}
  ${myDisputes.length ? `<section class="card"><h3>النزاعات</h3>${myDisputes.map((d) => `<div class="timeline-item">${badge(DISPUTE_STATUS[d.status].label, DISPUTE_STATUS[d.status].cls)} ${esc(d.description)}<div class="muted small">${fmtDateTime(d.createdAt)}</div>${d.notes.map((n) => `<div class="note">💬 ${esc(n.byName)}: ${esc(n.text)}</div>`).join('')}</div>`).join('')}</section>` : ''}
  <section class="card"><h3>سجل الحالة</h3><div class="timeline">${(r.history || []).slice().reverse().map((h) => `<div class="timeline-item">${statusBadge(h.status)} ${esc(h.note || '')}<div class="muted small">${fmtDateTime(h.at)}${h.byName ? ' · ' + esc(h.byName) : ''}</div></div>`).join('')}</div></section>`;
  hydrateImages(el);
  $('#mark-found', el)?.addEventListener('click', async () => {
    if (!(await confirmDialog('تغيير الحالة إلى «تم العثور عليه»؟'))) return;
    await db.setReportStatus(r.id, 'found', 'المالك أكد استرداد الهاتف'); toast('تم التحديث', 'ok'); go('#/report/' + r.id);
  });
  $('#reactivate', el)?.addEventListener('click', async () => { await db.setReportStatus(r.id, r.type, 'إعادة تفعيل البلاغ'); toast('تم إعادة تفعيل البلاغ', 'ok'); go('#/report/' + r.id); });
  $('#edit-privacy', el)?.addEventListener('click', () => {
    const m = modal({ title: 'بيانات التواصل والخصوصية', body: `<form class="form" id="privacy-form">${contactFieldsHTML(c)}<button class="btn btn-primary btn-block">حفظ</button></form>` });
    $('#privacy-form', m.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const nc = readContact(e.target); const err = validateContact(nc);
      if (err) return toast(err, 'error');
      await db.updateReportContact(r.id, nc); m.close(); toast('تم الحفظ', 'ok'); go('#/report/' + r.id);
    });
  });
}

export async function disputeFormView(el, { params, query }) {
  const r = await db.getReport(params[0]);
  if (!r || !r.imei1) { el.innerHTML = emptyState('🔒', 'البلاغ غير موجود'); return; }
  const handoverId = query.get('handover') || '';
  const coercion = query.get('coercion') === '1';
  el.innerHTML = `<section class="card"><h2 class="page-title">فتح نزاع — ${phoneName(r)}</h2>
    ${coercion ? '<div class="alert alert-danger"><b>سلامتك أولاً.</b> إذا كنت في خطر الآن اتصل بالنجدة <b dir="ltr">122</b>. سيتم تجميد عملية التسليم وإبلاغ فريق الدعم لمراجعة الفني.</div>' : ''}
    <form id="dispute-form" class="form" novalidate>
      <label class="field"><span>ماذا حدث؟ <span class="req">*</span></span><textarea name="description" rows="5" required placeholder="مثال: ذهبت لمحل الصيانة لاستلام هاتفي فطُلب مني مبلغ مالي وتم تهديدي لتسليم علبة الهاتف…"></textarea></label>
      <label class="check"><input type="checkbox" name="coercion" ${coercion ? 'checked' : ''}> تعرضت لتهديد أو إكراه أو ابتزاز</label>
      <label class="field"><span>رقم المحضر <span class="opt">(إن وجد)</span></span><input name="policeNumber"></label>
      <label class="field"><span>ملف فيديو / كاميرات مراقبة <span class="opt">(اختياري)</span></span><input type="file" name="evidenceFile" accept="video/*,image/*"><small class="hint">في النسخة التجريبية يُحفظ اسم الملف فقط.</small></label>
      <label class="field"><span>أو رابط للفيديو <span class="opt">(اختياري)</span></span><input name="evidenceLink" type="url" dir="ltr" placeholder="https://"></label>
      <label class="field"><span>الشهود <span class="opt">(اختياري)</span></span><textarea name="witnesses" rows="2" placeholder="الاسم ورقم الموبايل لكل شاهد"></textarea></label>
      <button class="btn btn-danger btn-block" type="submit">إرسال النزاع للدعم الفني</button>
    </form></section>`;
  $('#dispute-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.description.value.trim().length < 10) return toast('اكتب وصفاً واضحاً لما حدث (10 أحرف على الأقل)', 'error');
    if (f.evidenceLink.value && !/^https?:\/\//.test(f.evidenceLink.value)) return toast('الرابط يجب أن يبدأ بـ https://', 'error');
    try {
      await db.createDispute({
        reportId: r.id, handoverId, coercion: f.coercion.checked, description: f.description.value.trim(), policeNumber: f.policeNumber.value.trim(),
        evidenceFileName: f.evidenceFile.files[0]?.name || '', evidenceLink: f.evidenceLink.value.trim(), witnesses: f.witnesses.value.trim(),
      });
      toast('تم إرسال النزاع — سيتواصل معك فريق الدعم', 'ok');
      go('#/owner');
    } catch (err) { toast(err.message, 'error'); }
  });
}
