// الدخول والتسجيل — login, owner sign-up, technician sign-up
import db from '../db.js';
import { esc, validateEmail, validateEgPhone, validateImei, GOVERNORATES } from '../utils.js';
import { $, go, toast, photoField, bindPhotoFields, checkPhotoFields } from '../ui.js';

const DEMO = [
  { role: 'مالك هاتف', email: 'owner@demo.eg', pw: 'Owner@123' },
  { role: 'مالكة (بلاغات أخرى)', email: 'mona@demo.eg', pw: 'Owner@123' },
  { role: 'فني صيانة (موثّق)', email: 'tech@demo.eg', pw: 'Tech@123' },
  { role: 'فني (قيد المراجعة)', email: 'newtech@demo.eg', pw: 'Tech@123' },
  { role: 'الدعم الفني (أدمن)', email: 'admin@demo.eg', pw: 'Admin@123' },
];
export const homeFor = (u) => ({ owner: '#/owner', technician: '#/tech', admin: '#/admin', guest: '#/inbox' }[u?.role] || '#/');

function afterAuth(u, query) {
  window.dispatchEvent(new Event('auth-changed'));
  const next = query?.get('next');
  go(next && next.startsWith('#/') && !next.startsWith('#/login') ? next : homeFor(u));
}

export async function loginView(el, { query }) {
  el.innerHTML = `
  <div class="auth-wrap">
    <section class="card">
      <h2 class="page-title">تسجيل الدخول</h2>
      <form id="login-form" class="form" novalidate>
        <label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" required autocomplete="username" dir="ltr"></label>
        <label class="field"><span>كلمة المرور</span><input name="password" type="password" required autocomplete="current-password" dir="ltr"></label>
        <button class="btn btn-primary btn-block" type="submit">دخول</button>
      </form>
      <div class="auth-links">
        <a href="#/signup">إنشاء حساب مالك هاتف</a>
        <a href="#/tech-signup">تسجيل فني صيانة</a>
      </div>
    </section>
    <section class="card demo-creds">
      <h3>🔑 حسابات تجريبية</h3>
      <p class="muted small">نسخة تجريبية — اضغط على أي حساب لملء البيانات.</p>
      <table class="table"><thead><tr><th>الدور</th><th>البريد</th><th>كلمة المرور</th></tr></thead><tbody>
      ${DEMO.map((d) => `<tr class="demo-row" data-email="${d.email}" data-pw="${d.pw}" tabindex="0"><td>${esc(d.role)}</td><td dir="ltr">${d.email}</td><td dir="ltr">${d.pw}</td></tr>`).join('')}
      </tbody></table>
    </section>
  </div>`;
  const form = $('#login-form', el);
  el.querySelectorAll('.demo-row').forEach((r) => {
    const fill = () => { form.email.value = r.dataset.email; form.password.value = r.dataset.pw; form.password.focus(); };
    r.addEventListener('click', fill);
    r.addEventListener('keydown', (e) => { if (e.key === 'Enter') fill(); });
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const u = await db.login(form.email.value, form.password.value);
      toast(`أهلاً ${u.name} 👋`, 'ok');
      afterAuth(u, query);
    } catch (err) { toast(err.message, 'error'); }
  });
}

const accountFields = `
  <label class="field"><span>الاسم بالكامل <span class="req">*</span></span><input name="name" required minlength="3" autocomplete="name"></label>
  <label class="field"><span>البريد الإلكتروني <span class="req">*</span></span><input name="email" type="email" required dir="ltr" autocomplete="email"></label>
  <label class="field"><span>رقم الموبايل <span class="req">*</span></span><input name="phone" inputmode="tel" required dir="ltr" placeholder="01xxxxxxxxx" autocomplete="tel"></label>
  <div class="grid-2">
    <label class="field"><span>كلمة المرور <span class="req">*</span></span><input name="password" type="password" required minlength="6" dir="ltr" autocomplete="new-password"></label>
    <label class="field"><span>تأكيد كلمة المرور <span class="req">*</span></span><input name="password2" type="password" required dir="ltr" autocomplete="new-password"></label>
  </div>`;

function validateAccount(f) {
  if (f.name.value.trim().length < 3) return 'اكتب اسمك بالكامل';
  if (!validateEmail(f.email.value)) return 'البريد الإلكتروني غير صحيح';
  if (!validateEgPhone(f.phone.value).ok) return 'رقم الموبايل غير صحيح (مثال: 01012345678)';
  if (f.password.value.length < 6) return 'كلمة المرور يجب ألا تقل عن 6 أحرف';
  if (f.password.value !== f.password2.value) return 'كلمتا المرور غير متطابقتين';
  return null;
}

export async function signupView(el, { query }) {
  el.innerHTML = `<div class="auth-wrap single"><section class="card">
    <h2 class="page-title">إنشاء حساب مالك هاتف</h2>
    <form id="signup-form" class="form" novalidate>${accountFields}
      <p class="muted small">🔒 نموذج أولي: كلمة المرور تُحفظ مشفّرة (SHA-256) على هذا الجهاز فقط.</p>
      <button class="btn btn-primary btn-block" type="submit">إنشاء الحساب</button></form>
    <div class="auth-links"><a href="#/login">لديك حساب؟ سجّل الدخول</a><a href="#/tech-signup">أنت فني صيانة؟</a></div>
  </section></div>`;
  const f = $('#signup-form', el);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = validateAccount(f);
    if (err) return toast(err, 'error');
    try {
      const u = await db.signUp({ role: 'owner', name: f.name.value, email: f.email.value, phone: validateEgPhone(f.phone.value).value, password: f.password.value });
      toast('تم إنشاء حسابك ✅', 'ok');
      afterAuth(u, query);
    } catch (e2) { toast(e2.message, 'error'); }
  });
}

export async function techSignupView(el) {
  const state = {};
  el.innerHTML = `<section class="card">
    <h2 class="page-title">تسجيل فني صيانة</h2>
    <p class="muted">يتم توثيق الفنيين يدوياً من فريق الدعم قبل تفعيل الحساب، لحماية أصحاب الهواتف من الاحتيال.</p>
    <ol class="stepper"><li>بيانات الحساب</li><li>بيانات المحل</li><li>المستندات</li><li>سيلفي مباشر</li><li>المراجعة</li></ol>
    <form id="tech-form" class="form" novalidate>
      <fieldset><legend>1) بيانات الحساب</legend>${accountFields}</fieldset>
      <fieldset><legend>2) بيانات المحل</legend>
        <label class="field"><span>اسم المحل <span class="req">*</span></span><input name="shopName" required></label>
        <div class="grid-2">
          <label class="field"><span>المحافظة <span class="req">*</span></span><select name="governorate" required><option value="">اختر…</option>${GOVERNORATES.map((g) => `<option>${g}</option>`).join('')}</select></label>
          <label class="field"><span>العنوان بالتفصيل <span class="req">*</span></span><input name="address" required placeholder="الشارع، المنطقة، علامة مميزة"></label>
        </div>
      </fieldset>
      <fieldset><legend>3) المستندات</legend>
        ${photoField({ name: 'idPhoto', label: 'صورة بطاقة الرقم القومي (الوجه الأمامي)', required: true, mode: 'capture', facing: 'environment', hint: 'صورة واضحة تظهر فيها صورتك واسمك.' })}
        ${photoField({ name: 'deviceShot', label: 'لقطة شاشة من هاتفك تُظهر IMEI / الرقم التسلسلي', required: true, mode: 'upload', hint: 'من الإعدادات > حول الهاتف، أو اطلب *#06# وخذ لقطة شاشة.' })}
        <label class="field"><span>IMEI هاتفك الشخصي <span class="opt">(اختياري)</span></span><input name="deviceImei" inputmode="numeric" dir="ltr" maxlength="17"></label>
      </fieldset>
      <fieldset><legend>4) سيلفي مباشر</legend>
        <p class="hint">يجب التقاط السيلفي الآن بالكاميرا الأمامية — لا يُسمح بالرفع من المعرض.</p>
        ${photoField({ name: 'selfie', label: 'سيلفي مباشر', required: true, mode: 'live', facing: 'user' })}
      </fieldset>
      <fieldset><legend>5) مطابقة الوجه والمراجعة</legend>
        <div class="facematch" id="facematch">
          <div class="fm-side"><div class="fm-img" id="fm-id">البطاقة</div><small>صورة البطاقة</small></div>
          <div class="fm-mid">⇄</div>
          <div class="fm-side"><div class="fm-img" id="fm-selfie">السيلفي</div><small>السيلفي المباشر</small></div>
        </div>
        <div class="alert alert-info alert-compact" data-testid="facematch-placeholder">🧪 <b>مطابقة الوجه مع البطاقة — ستُربط بخدمة تحقق حقيقية لاحقاً.</b> حالياً يراجع فريق الدعم الصور يدوياً.</div>
        <label class="check"><input type="checkbox" name="agree" required> أقر بصحة البيانات، وأتعهد بعدم شراء أو إصلاح أي هاتف مبلغ عنه وبإبلاغ المالك عبر التطبيق.</label>
      </fieldset>
      <button class="btn btn-primary btn-block" type="submit">إرسال طلب التوثيق</button>
    </form></section>`;
  const f = $('#tech-form', el);
  bindPhotoFields(f, state);
  // live preview of the face-match placeholder
  const refreshFM = () => {
    [['idPhoto', '#fm-id'], ['selfie', '#fm-selfie']].forEach(([k, sel]) => {
      const box = $(sel, el);
      if (!box) return; // view already left
      box.innerHTML = state[k] ? `<img src="${state[k]}" alt="">` : (k === 'idPhoto' ? 'البطاقة' : 'السيلفي');
    });
  };
  f.addEventListener('click', () => setTimeout(refreshFM, 400));
  f.addEventListener('change', () => setTimeout(refreshFM, 400));
  const obs = new MutationObserver(refreshFM);
  f.querySelectorAll('.photo-preview img').forEach((img) => obs.observe(img, { attributes: true, attributeFilter: ['src'] }));

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = validateAccount(f);
    if (err) return toast(err, 'error');
    if (!f.shopName.value.trim() || !f.governorate.value || !f.address.value.trim()) return toast('أكمل بيانات المحل', 'error');
    if (!checkPhotoFields(f, state)) return toast('صورة البطاقة ولقطة الشاشة والسيلفي المباشر مطلوبة', 'error');
    if (f.deviceImei.value && !validateImei(f.deviceImei.value).ok) return toast('IMEI هاتفك غير صحيح', 'error');
    if (!f.agree.checked) return toast('يجب الموافقة على التعهد', 'error');
    try {
      await db.signUp({
        role: 'technician', name: f.name.value, email: f.email.value, phone: validateEgPhone(f.phone.value).value, password: f.password.value,
        tech: { shopName: f.shopName.value.trim(), governorate: f.governorate.value, address: f.address.value.trim(), deviceImei: validateImei(f.deviceImei.value).value, idPhoto: state.idPhoto, selfie: state.selfie, selfieMethod: state.selfieMethod, deviceShot: state.deviceShot },
      });
      obs.disconnect();
      toast('تم إرسال طلبك — الحساب قيد المراجعة', 'ok');
      window.dispatchEvent(new Event('auth-changed'));
      go('#/tech');
    } catch (e2) { toast(e2.message, 'error'); }
  });
}
