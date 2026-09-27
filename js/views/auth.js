// الدخول والتسجيل — login, owner sign-up, technician sign-up
import db from '../db.js';
import { esc, validateEmail, validateEgPhone, validateImei, GOVERNORATES } from '../utils.js';
import { $, go, toast, photoField, bindPhotoFields, checkPhotoFields, alertBox } from '../ui.js';
import { icon } from '../icons.js';

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
      <p class="page-sub">ادخل بالإيميل وكلمة السر.</p>
      <form id="login-form" class="form" novalidate>
        <label class="field"><span>الإيميل</span><input name="email" type="email" required autocomplete="username" dir="ltr"></label>
        <label class="field"><span>كلمة السر</span><input name="password" type="password" required autocomplete="current-password" dir="ltr"></label>
        <button class="btn btn-primary btn-block" type="submit">دخول</button>
      </form>
      <div class="or">معندكش حساب؟</div>
      <div class="grid-2">
        <a class="btn btn-outline" href="#/signup">${icon('user-plus', { size: 18 })} حساب جديد</a>
        <a class="btn btn-outline" href="#/tech-signup">${icon('wrench', { size: 18 })} تسجيل فني</a>
      </div>
    </section>
    <p class="muted small center">تقدر تفحص أي رقم IMEI من <a href="#/search">صفحة الفحص</a> من غير تسجيل.</p>
  </div>`;
  const form = $('#login-form', el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.email.value.trim() || !form.password.value) return toast('اكتب الإيميل وكلمة السر', 'error');
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const u = await db.login(form.email.value, form.password.value);
      toast(`أهلاً ${u.name}`, 'ok');
      afterAuth(u, query);
    } catch (err) { toast(err.message, 'error'); } finally { btn.disabled = false; }
  });
}

const accountFields = `
  <label class="field"><span>الاسم بالكامل <span class="req">*</span></span><input name="name" required minlength="3" autocomplete="name"></label>
  <label class="field"><span>الإيميل <span class="req">*</span></span><input name="email" type="email" required dir="ltr" autocomplete="email"></label>
  <label class="field"><span>رقم الموبايل <span class="req">*</span></span><input name="phone" inputmode="tel" required dir="ltr" placeholder="01xxxxxxxxx" autocomplete="tel"></label>
  <div class="grid-2">
    <label class="field"><span>كلمة السر <span class="req">*</span></span><input name="password" type="password" required minlength="8" dir="ltr" autocomplete="new-password"><small class="hint">٨ حروف على الأقل</small></label>
    <label class="field"><span>اكتبها تاني <span class="req">*</span></span><input name="password2" type="password" required dir="ltr" autocomplete="new-password"></label>
  </div>`;

function validateAccount(f) {
  if (f.name.value.trim().length < 3) return 'اكتب اسمك بالكامل';
  if (!validateEmail(f.email.value)) return 'الإيميل مش صح';
  if (!validateEgPhone(f.phone.value).ok) return 'رقم الموبايل مش صح (مثال: 01012345678)';
  if (f.password.value.length < 8) return 'كلمة السر لازم تكون ٨ حروف على الأقل';
  if (f.password.value !== f.password2.value) return 'كلمتين السر مش زي بعض';
  return null;
}

export async function signupView(el, { query }) {
  el.innerHTML = `<div class="auth-wrap"><section class="card">
    <h2 class="page-title">حساب جديد</h2>
    <p class="page-sub">عشان تبلّغ عن موبايلك وتستقبل رسايل من اللي لقاه.</p>
    <form id="signup-form" class="form" novalidate>${accountFields}
      <button class="btn btn-primary btn-block" type="submit">اعمل الحساب</button></form>
    <div class="auth-links"><a href="#/login">عندك حساب؟ سجّل دخول</a><a href="#/tech-signup">إنت فني صيانة؟</a></div>
  </section></div>`;
  const f = $('#signup-form', el);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = validateAccount(f);
    if (err) return toast(err, 'error');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const u = await db.signUp({ role: 'owner', name: f.name.value, email: f.email.value, phone: validateEgPhone(f.phone.value).value, password: f.password.value });
      if (u?.needsConfirmation) { toast('بعتنالك إيميل تأكيد. افتحه وبعدين سجّل دخول', 'ok', 8000); go('#/login'); return; }
      toast('حسابك جاهز', 'ok');
      afterAuth(u, query);
    } catch (e2) { toast(e2.message, 'error'); } finally { btn.disabled = false; }
  });
}

export async function techSignupView(el) {
  const state = {};
  el.innerHTML = `<div class="auth-wrap wide"><section class="card">
    <h2 class="page-title">تسجيل فني صيانة</h2>
    <p class="page-sub">فريق لقيته بيراجع كل فني قبل تفعيل حسابه، عشان نحمي أصحاب الموبايلات من النصب. المراجعة غالباً بتاخد يوم عمل.</p>
    <form id="tech-form" class="form" novalidate>
      <fieldset class="form-section"><legend><span class="step-num">1</span> بياناتك</legend>${accountFields}</fieldset>
      <fieldset class="form-section"><legend><span class="step-num">2</span> المحل</legend>
        <label class="field"><span>اسم المحل <span class="req">*</span></span><input name="shopName" required></label>
        <div class="grid-2">
          <label class="field"><span>المحافظة <span class="req">*</span></span><select name="governorate" required><option value="">اختار</option>${GOVERNORATES.map((g) => `<option>${g}</option>`).join('')}</select></label>
          <label class="field"><span>العنوان <span class="req">*</span></span><input name="address" required placeholder="الشارع، المنطقة، علامة مميزة"></label>
        </div>
      </fieldset>
      <fieldset class="form-section"><legend><span class="step-num">3</span> المستندات</legend>
        ${photoField({ name: 'idPhoto', label: 'صورة البطاقة (الوش)', required: true, mode: 'capture', facing: 'environment', hint: 'لازم صورتك واسمك يبانوا بوضوح.' })}
        ${photoField({ name: 'deviceShot', label: 'سكرين شوت من موبايلك فيها الـ IMEI', required: true, mode: 'upload', hint: 'اطلب *#06# وخد سكرين شوت، أو من الإعدادات > حول الهاتف.' })}
        <label class="field"><span>IMEI موبايلك <span class="opt">(اختياري)</span></span><input name="deviceImei" inputmode="numeric" dir="ltr" maxlength="17"></label>
      </fieldset>
      <fieldset class="form-section"><legend><span class="step-num">4</span> سيلفي</legend>
        <p class="hint">صوّر نفسك دلوقتي بالكاميرا الأمامية. مينفعش ترفع صورة من الاستوديو.</p>
        ${photoField({ name: 'selfie', label: 'سيلفي', required: true, mode: 'live', facing: 'user' })}
        <div class="facematch" id="facematch">
          <div class="fm-side"><div class="fm-img" id="fm-id">${icon('id-card', { size: 28 })}</div>البطاقة</div>
          <div class="fm-mid">${icon('arrow-right', { size: 20 })}</div>
          <div class="fm-side"><div class="fm-img" id="fm-selfie">${icon('user-round', { size: 28 })}</div>السيلفي</div>
        </div>
        <p class="hint center" data-testid="facematch-placeholder">هنقارن السيلفي بصورة البطاقة للتأكد إنك صاحب البطاقة.</p>
      </fieldset>
      <label class="check"><input type="checkbox" name="agree" required> البيانات دي صحيحة، وأتعهد إني مش هشتري ولا هصلّح موبايل متبلّغ عنه، وهبلّغ صاحبه من التطبيق.</label>
      <button class="btn btn-primary btn-block" type="submit">ابعت طلب التسجيل</button>
    </form></section></div>`;
  const f = $('#tech-form', el);
  bindPhotoFields(f, state);
  // live preview of the face-match placeholder
  const refreshFM = () => {
    [['idPhoto', '#fm-id'], ['selfie', '#fm-selfie']].forEach(([k, sel]) => {
      const box = $(sel, el);
      if (!box) return; // view already left
      box.innerHTML = state[k] ? `<img src="${state[k]}" alt="">` : icon(k === 'idPhoto' ? 'id-card' : 'user-round', { size: 28 });
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
    if (!f.shopName.value.trim() || !f.governorate.value || !f.address.value.trim()) return toast('كمّل بيانات المحل', 'error');
    if (!checkPhotoFields(f, state)) return toast('محتاجين صورة البطاقة والسكرين شوت والسيلفي', 'error');
    if (f.deviceImei.value && !validateImei(f.deviceImei.value).ok) return toast('الـ IMEI بتاع موبايلك مش صح', 'error');
    if (!f.agree.checked) return toast('لازم توافق على التعهد', 'error');
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> بنرفع المستندات…';
    try {
      const res = await db.signUp({
        role: 'technician', name: f.name.value, email: f.email.value, phone: validateEgPhone(f.phone.value).value, password: f.password.value,
        tech: { shopName: f.shopName.value.trim(), governorate: f.governorate.value, address: f.address.value.trim(), deviceImei: validateImei(f.deviceImei.value).value, idPhoto: state.idPhoto, selfie: state.selfie, selfieMethod: state.selfieMethod, deviceShot: state.deviceShot },
      });
      obs.disconnect();
      if (res?.needsConfirmation) { toast('أكّد إيميلك وبعدين سجّل دخول عشان ترفع المستندات', 'ok', 8000); go('#/login'); return; }
      btn.innerHTML = '<span class="spinner"></span> بنقارن السيلفي بصورة البطاقة…';
      const fm = await db.runFaceMatch();
      toast(fm?.approved ? 'تمام! حسابك اتفعّل وتقدر تبدأ تفحص الأجهزة' : 'طلبك وصل. هنراجعه ونبلغك', 'ok', 6000);
      window.dispatchEvent(new Event('auth-changed'));
      go('#/tech');
    } catch (e2) { toast(e2.message, 'error'); } finally { btn.disabled = false; btn.textContent = 'ابعت طلب التسجيل'; }
  });
}
