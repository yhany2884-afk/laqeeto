// لوحة فني الصيانة — technician dashboard, IMEI check, handover
import db from '../db.js';
import { esc, fmtDate, fmtDateTime, normalizeId, validateImei, TECH_STATUS, HANDOVER_STATUS } from '../utils.js';
import { $, $$, go, toast, badge, statusBadge, photoField, bindPhotoFields, checkPhotoFields, emptyState, safetyNote } from '../ui.js';
import { startMessageFlow } from './public.js';

function statusScreen(user) {
  const t = user.tech;
  const st = TECH_STATUS[t.status];
  const body = {
    pending: `<p>شكراً لتسجيلك يا ${esc(user.name)}. يراجع فريق الدعم مستنداتك الآن، وسيتم تفعيل أدوات الفحص فور الاعتماد.</p>
      <ol class="checklist-status">
        <li class="done">✅ بيانات الحساب والمحل</li>
        <li class="done">✅ صورة البطاقة ولقطة شاشة الهاتف</li>
        <li class="done">✅ سيلفي مباشر</li>
        <li class="wait" data-testid="facematch-placeholder">⏳ مطابقة الوجه مع البطاقة — ستُربط بخدمة تحقق حقيقية لاحقاً</li>
        <li class="wait">⏳ مراجعة يدوية من الدعم الفني</li>
      </ol>`,
    rejected: `<p>للأسف تم رفض طلب التوثيق.</p>${t.reviewNote ? `<div class="alert alert-danger alert-compact">السبب: ${esc(t.reviewNote)}</div>` : ''}<p>تواصل مع الدعم الفني لتصحيح البيانات.</p>`,
    suspended: `<p>تم إيقاف حسابك مؤقتاً من فريق الدعم.</p>${t.reviewNote ? `<div class="alert alert-danger alert-compact">السبب: ${esc(t.reviewNote)}</div>` : ''}`,
  }[t.status];
  return `<section class="card center-card" data-testid="tech-status">
    <div class="big-icon">${t.status === 'pending' ? '⏳' : '⛔'}</div>
    <h2>حالة الحساب: ${badge(st.label, st.cls)}</h2>${body}
    <div class="muted small">${esc(t.shopName)} — ${esc(t.governorate)}</div></section>`;
}

export async function techDashboardView(el, { user, query }) {
  if (user.tech?.status !== 'approved') { el.innerHTML = statusScreen(user); return; }
  const handovers = await db.listMyHandovers();
  const q0 = normalizeId(query.get('q') || '');
  el.innerHTML = `
  <div class="page-head"><h2 class="page-title">لوحة الفني</h2>${badge('فني موثّق ✓', 'ok')}</div>
  <p class="muted">${esc(user.tech.shopName)} — ${esc(user.tech.governorate)}</p>
  <section class="card">
    <h3>🔍 فحص جهاز قبل الشراء أو الإصلاح</h3>
    <form id="tech-check" class="search-box" role="search">
      <input id="tech-q" dir="ltr" inputmode="text" placeholder="IMEI أو الرقم التسلسلي" value="${esc(q0)}" required autocomplete="off">
      <button class="btn btn-primary">افحص</button>
    </form>
    <p class="hint">اطلب <b dir="ltr">*#06#</b> على الجهاز لقراءة IMEI الحقيقي — لا تعتمد على الرقم المكتوب على الغطاء فقط.</p>
    <div id="tech-result" aria-live="polite"></div>
  </section>
  <h3 class="section-title">عمليات التسليم التي سجلتها</h3>
  <div class="list">${handovers.length ? handovers.map((h) => `<div class="card small-card"><div class="rc-top"><b>${esc(h.report?.brand)} ${esc(h.report?.model)}</b>${badge(HANDOVER_STATUS[h.status].label, HANDOVER_STATUS[h.status].cls)}</div><div class="muted small">IMEI <span dir="ltr">${esc(h.deviceImei)}</span> · ${fmtDateTime(h.createdAt)}</div></div>`).join('') : emptyState('📦', 'لا توجد عمليات تسليم بعد')}</div>
  ${safetyNote(true)}`;
  const form = $('#tech-check', el);
  const run = async (q) => {
    const out = $('#tech-result', el);
    const warn = /^\d{15}$/.test(q) && !validateImei(q).ok ? '<div class="alert alert-warn alert-compact">الرقم لا يجتاز تحقق Luhn — تأكد منه عبر *#06#.</div>' : '';
    let res;
    try { res = await db.searchReports(q, { asTechnician: true }); } catch (e) { toast(e.message, 'error'); return; }
    const active = res.filter((r) => r.active);
    if (!active.length) {
      out.innerHTML = `${warn}<div class="verdict verdict-ok" data-testid="tech-clear"><div class="verdict-icon">✓</div><div><b>غير مبلغ عنه</b><div dir="ltr" class="mono">${esc(q)}</div><small>لا يوجد بلاغ نشط بهذا الرقم في السجل. استمر في طلب إثبات الملكية (العلبة/الفاتورة).</small></div></div>`;
      return;
    }
    out.innerHTML = warn + active.map((r) => `<div class="verdict verdict-bad" data-testid="tech-reported"><div class="verdict-icon">!</div><div class="grow">
      <b>مبلغ عنه ${r.type === 'lost' ? 'كمفقود' : 'كمسروق'}</b>
      <div>${esc(r.brand)} ${esc(r.model)} — ${esc(r.color)} · ${statusBadge(r.status)}</div>
      <small>تاريخ البلاغ: ${fmtDate(r.reportedAt)}${r.governorate ? ' · ' + esc(r.governorate) : ''}</small>
      <div class="alert alert-danger alert-compact">لا تشترِ هذا الجهاز ولا تفتحه أو تغيّر برمجته. تواصل مع المالك عبر التطبيق.</div>
      <div class="btn-row">
        <button class="btn btn-light" data-contact="${r.id}">💬 تواصل مع المالك</button>
        ${r.status !== 'dispute' ? `<a class="btn btn-light" href="#/tech/handover/${r.id}" data-testid="start-handover">📦 تسجيل تسليم للمالك</a>` : '<span class="small">البلاغ عليه نزاع — لا يمكن التسليم الآن.</span>'}
      </div></div></div>`).join('');
    $$('[data-contact]', out).forEach((b) => b.addEventListener('click', () => startMessageFlow(b.dataset.contact, user)));
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = normalizeId($('#tech-q', el).value); if (q) run(q); });
  if (q0) run(q0);
}

export async function handoverView(el, { params, user }) {
  if (user.tech?.status !== 'approved') { el.innerHTML = statusScreen(user); return; }
  const r = await db.getReport(params[0]);
  if (!r) { el.innerHTML = emptyState('❓', 'البلاغ غير موجود'); return; }
  if (!r.active) { el.innerHTML = emptyState('ℹ️', 'هذا البلاغ ليس نشطاً — لا يلزم تسليم.'); return; }
  const state = {};
  el.innerHTML = `<section class="card"><h2 class="page-title">📦 تسجيل تسليم هاتف لمالكه</h2>
    <div class="summary">${esc(r.brand)} ${esc(r.model)} — ${esc(r.color)} ${statusBadge(r.status)}</div>
    <div class="alert alert-warn alert-compact">سلّم الهاتف داخل محلك وأمام كاميرا المراقبة إن وجدت. ممنوع طلب أي مبالغ من المالك مقابل التسليم. أي شكوى إكراه تؤدي لإيقاف الحساب فوراً.</div>
    <form id="handover-form" class="form" novalidate>
      <fieldset><legend>قائمة التحقق</legend>
        <label class="check"><input type="checkbox" name="box"> أحضر المالك علبة الهاتف الأصلية</label>
        <label class="check"><input type="checkbox" name="imeiMatch"> رقم IMEI على العلبة يطابق الجهاز (بعد طلب <span dir="ltr">*#06#</span>)</label>
        <label class="check"><input type="checkbox" name="unlocked"> فتح المالك قفل الهاتف (PIN/بصمة/نمط) أمامي</label>
        <label class="field"><span>IMEI الظاهر على الجهاز عبر <span dir="ltr">*#06#</span> <span class="req">*</span></span><input name="deviceImei" dir="ltr" inputmode="numeric" maxlength="19" required placeholder="15 رقماً"><small class="hint">يجب أن يطابق IMEI المسجل في البلاغ.</small></label>
      </fieldset>
      <fieldset><legend>صور التوثيق (مباشرة من الكاميرا)</legend>
        ${photoField({ name: 'ownerIdPhoto', label: 'صورة بطاقة المالك', required: true, mode: 'live', facing: 'environment' })}
        ${photoField({ name: 'selfie', label: 'سيلفي التسليم (أنت والمالك والهاتف)', required: true, mode: 'live', facing: 'user' })}
      </fieldset>
      <label class="field"><span>ملاحظات <span class="opt">(اختياري)</span></span><textarea name="notes" rows="2"></textarea></label>
      <p class="hint">بعد الحفظ سيطلب التطبيق من المالك تأكيد الاستلام من حسابه. لا يكتمل التسليم إلا بتأكيده.</p>
      <button class="btn btn-primary btn-block" type="submit">تسجيل التسليم</button>
    </form></section>`;
  const f = $('#handover-form', el);
  bindPhotoFields(f, state);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.box.checked || !f.imeiMatch.checked || !f.unlocked.checked) return toast('يجب استيفاء كل بنود قائمة التحقق قبل التسليم', 'error');
    if (!validateImei(f.deviceImei.value).ok) return toast('أدخل IMEI صحيحاً من الجهاز', 'error');
    if (!checkPhotoFields(f, state)) return toast('التقط صورة بطاقة المالك وسيلفي التسليم', 'error');
    try {
      await db.createHandover(r.id, {
        checklist: { box: true, imeiMatch: true, unlocked: true }, deviceImei: f.deviceImei.value,
        ownerIdPhoto: state.ownerIdPhoto, selfie: state.selfie, notes: f.notes.value.trim(),
      });
      toast('تم تسجيل التسليم — بانتظار تأكيد المالك', 'ok');
      go('#/tech');
    } catch (err) { toast(err.message, 'error'); }
  });
}
