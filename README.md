# لقيته — سجل الهواتف المسروقة والمفقودة
**Stolen Phone Registry** · تطبيق ويب قابل للتثبيت (PWA) · عربي بالكامل (RTL)

> ⚠️ **نسخة تجريبية (Prototype):** لا يوجد خادم ولا قاعدة بيانات مركزية. كل البيانات (الحسابات، البلاغات، الصور، الرسائل) محفوظة **على نفس الجهاز والمتصفح فقط** (localStorage + IndexedDB). لا تستخدمه لبيانات حقيقية.

## ما هو «لقيته»؟
سجل مجتمعي للهواتف المسروقة والمفقودة في مصر:
- **مالك الهاتف** يبلّغ عن هاتفه برقم IMEI (مع التحقق من 15 رقماً + خوارزمية Luhn) وصورة العلبة وبيانات اختيارية (فاتورة، رقم محضر)، مع تحكم كامل في خصوصية بيانات التواصل لكل حقل (مخفية افتراضياً).
- **أي شخص وجد هاتفاً أو سيشتري مستعملاً** يفحص رقم IMEI أو الرقم التسلسلي بدون تسجيل، ويراسل المالك داخل التطبيق (بحسابه أو كضيف بالاسم ورقم الموبايل).
- **فني الصيانة** يسجّل ببيانات المحل وصورة البطاقة وسيلفي مباشر من الكاميرا (لا يُسمح بالرفع من المعرض) ولقطة شاشة لـ IMEI هاتفه، وبعد اعتماده من الدعم يفحص الأجهزة (أخضر/أحمر) ويسجّل تسليم الهاتف لمالكه بقائمة تحقق وصور، ثم يؤكد المالك الاستلام من حسابه.
- **الدعم الفني** يراجع طلبات الفنيين (البطاقة والسيلفي جنباً إلى جنب)، يدير البلاغات والنزاعات وبلاغات الإكراه، يوقف الفنيين المخالفين، ويطلع على سجل العمليات.

## التشغيل محلياً
موقع ثابت بالكامل — لا يحتاج أي build ولا مكتبات خارجية:
```bash
cd stolen-phone-app
python3 -m http.server 8080
# افتح http://localhost:8080
```
> يجب فتحه عبر `http://localhost` أو `https://` (وليس `file://`) لأن الـ Service Worker والكاميرا وES Modules تتطلب ذلك.

## النشر على GitHub Pages
ارفع محتويات المجلد إلى مستودع، ثم من **Settings → Pages** اختر الفرع `main` والمجلد `/ (root)`. كل المسارات نسبية وملف `.nojekyll` موجود، فيعمل التطبيق على `https://<user>.github.io/<repo>/`.
عند تعديل أي ملف لاحقاً غيّر قيمة `CACHE_VERSION` في `sw.js` حتى يحصل المستخدمون على التحديث.

## تثبيت التطبيق على الجهاز
| الجهاز | الطريقة |
|---|---|
| **أندرويد** | افتح الموقع في **Chrome** ← اضغط زر «تثبيت التطبيق» داخل التطبيق، أو من القائمة ⋮ اختر **«تثبيت التطبيق»**. |
| **آيفون / آيباد** | افتح الموقع في **Safari** ← زر **المشاركة** ⬆️ ← **«إضافة إلى الشاشة الرئيسية»** ← إضافة. (يوجد شرح داخل التطبيق.) |
| **ويندوز / ماك** | في **Chrome** أو **Edge** اضغط أيقونة التثبيت ⊕ في شريط العنوان، أو من القائمة «تثبيت لقيته». |

بعد أول فتح يعمل التطبيق **بدون إنترنت** (Service Worker يخزّن كل الملفات).

## الحسابات التجريبية
| الدور | البريد | كلمة المرور |
|---|---|---|
| مالك هاتف (له بلاغان) | `owner@demo.eg` | `Owner@123` |
| مالكة (بلاغات أخرى) | `mona@demo.eg` | `Owner@123` |
| فني صيانة موثّق | `tech@demo.eg` | `Tech@123` |
| فني قيد المراجعة | `newtech@demo.eg` | `Tech@123` |
| الدعم الفني (أدمن) | `admin@demo.eg` | `Admin@123` |

أرقام IMEI تجريبية للفحص: `356938035643809` (مسروق)، `352099001761481` (مفقود)، `868910041234577` (مسروق — رقم المالك ظاهر للعامة)، `353325101234569` (تم التسليم)، `490154203237518` (غير مبلغ عنه — جرّب الإبلاغ به).

زر **«إعادة ضبط البيانات التجريبية»** موجود في شريط التنبيه أعلى الصفحة وفي صفحة «عن التطبيق».

## هيكل المشروع
```
index.html            الصفحة الوحيدة (SPA بتوجيه #/)
manifest.json         بيان PWA (أيقونات 192/512 + maskable)
sw.js                 Service Worker للعمل بدون إنترنت
css/style.css         التصميم (Mobile-first, RTL)
js/app.js             الموجّه (router) وهيكل الواجهة
js/db.js              طبقة البيانات — الواجهة الوحيدة للتخزين (قابلة للاستبدال بـ Firebase/Supabase)
js/seed.js            البيانات التجريبية
js/utils.js           التحقق من IMEI/Luhn، SHA-256، ضغط الصور، ثوابت
js/ui.js              عناصر واجهة مشتركة (نوافذ، إشعارات، حقول الصور)
js/camera.js          الكاميرا المباشرة (getUserMedia) للسيلفي وصور التسليم
js/pwa.js             زر التثبيت (beforeinstallprompt) وتعليمات آيفون
js/views/*.js         الشاشات: عامة، دخول/تسجيل، المالك، الفني، الرسائل، الدعم
icons/                أيقونات PNG و SVG
docs/PLAN.md          خطة المنتج الكاملة
```

## خارطة الطريق للإنتاج
1. **قاعدة بيانات وخادم حقيقي:** Firebase (Firestore + Storage + Auth) أو Supabase (Postgres + Storage + Row Level Security). كل الشاشات تتعامل مع `js/db.js` فقط؛ يكفي كتابة وحدة بنفس الدوال. يجب نقل كل الصلاحيات إلى قواعد الأمان على الخادم، وتشفير كلمات المرور على الخادم (bcrypt/argon2) بدلاً من SHA-256 في المتصفح.
2. **تحقق حقيقي من الهوية:** خدمة KYC لمطابقة الوجه مع البطاقة + **فحص الحيوية (Liveness)** لمنع استخدام صورة شخص آخر، وقراءة بيانات البطاقة آلياً (OCR).
3. **التحقق بالرسائل النصية (SMS/OTP)** لأرقام الموبايل عند التسجيل وقبل كشف بيانات التواصل.
4. **مراجعة قانونية وخصوصية:** التوافق مع قانون حماية البيانات الشخصية المصري (151 لسنة 2020)، سياسة خصوصية وشروط استخدام، مدة الاحتفاظ بالبيانات، وإمكانية **التعاون مع وزارة الداخلية والجهاز القومي لتنظيم الاتصالات (NTRA)** للتحقق من المحاضر وربط البلاغات بحظر IMEI.
5. **إشعارات فورية** (Web Push / FCM) عند وصول رسالة أو طلب تأكيد تسليم.
6. **تطبيقات المتاجر:** تغليف نفس الكود بـ **Capacitor** لإصدار نسخ Android (Google Play) و iOS (App Store) مع وصول أفضل للكاميرا والإشعارات.

---

## English summary
**Laqeeto ("I found it") — Stolen Phone Registry.** A mobile-first, installable, fully Arabic (RTL) PWA prototype for reporting stolen/lost phones in Egypt and checking IMEI/serial numbers.

- **Prototype only:** no backend. All data lives in the browser (localStorage + IndexedDB) on the current device. Passwords are SHA-256 hashed with SubtleCrypto for demo purposes only.
- **Pure static site**, zero external dependencies, relative paths, `.nojekyll` — ready for GitHub Pages (`https://<user>.github.io/<repo>/`). Serve locally with `python3 -m http.server`.
- **Roles:** phone owner (reports with IMEI Luhn validation, photos, per-field contact privacy, dashboard, inbox, recovery, disputes), public finder (search without login, message owner as guest), technician (verified sign-up with live selfie via getUserMedia, IMEI check green/red, handover checklist + live photos, owner confirmation), support admin (technician verification, reports, disputes, suspensions, audit log).
- **Install:** Android Chrome → “Install app”; iPhone Safari → Share → Add to Home Screen; Windows/Mac Chrome/Edge → install icon in the address bar. Works offline after first load.
- **Demo accounts:** see the table above (`owner@demo.eg / Owner@123`, `tech@demo.eg / Tech@123`, `admin@demo.eg / Admin@123`, …).
- **Roadmap:** Firebase/Supabase backend behind the `js/db.js` interface, real KYC face-match + liveness, SMS/OTP, legal/privacy review and possible cooperation with police / NTRA, push notifications, native store builds via Capacitor.
