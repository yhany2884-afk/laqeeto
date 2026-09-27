# لقيته — سجل الهواتف المسروقة والمفقودة
**Stolen Phone Registry** · تطبيق ويب قابل للتثبيت (PWA) · عربي بالكامل (RTL) · قاعدة بيانات مشتركة على **Supabase**

🌐 **التطبيق المباشر:** https://yhany2884-afk.github.io/laqeeto/

> ⚠️ **نسخة تجريبية (Prototype):** البيانات الآن **مشتركة بين كل الأجهزة** (Supabase: Postgres + Auth + Storage) لكن المشروع على الخطة المجانية، والحسابات التجريبية مشتركة للجميع، ومطابقة الوجه محاكاة. لا تستخدمه لبيانات حقيقية حساسة.

## ما هو «لقيته»؟
سجل مجتمعي للهواتف المسروقة والمفقودة في مصر:
- **مالك الهاتف** يبلّغ عن هاتفه برقم IMEI (15 رقماً + خوارزمية Luhn، ويُتحقق منها في قاعدة البيانات أيضاً) وصورة العلبة وبيانات اختيارية (فاتورة، رقم محضر)، مع تحكم كامل في خصوصية بيانات التواصل لكل حقل (مخفية افتراضياً).
- **أي شخص وجد هاتفاً أو سيشتري مستعملاً** يفحص رقم IMEI أو الرقم التسلسلي بدون تسجيل، ويراسل المالك داخل التطبيق (بحسابه أو كضيف بالاسم ورقم الموبايل) — والمالك يرى الرسالة على جهازه هو.
- **فني الصيانة** يسجّل ببيانات المحل وصورة البطاقة وسيلفي مباشر من الكاميرا ولقطة شاشة لـ IMEI هاتفه، وبعد اعتماده من الدعم يفحص الأجهزة (أخضر/أحمر) ويسجّل تسليم الهاتف لمالكه بقائمة تحقق وصور، ثم يؤكد المالك الاستلام من حسابه.
- **الدعم الفني** يراجع طلبات الفنيين (البطاقة والسيلفي جنباً إلى جنب)، يدير البلاغات والنزاعات وبلاغات الإكراه، يوقف الفنيين المخالفين، ويطلع على سجل العمليات.

## الحسابات التجريبية
| الدور | البريد | كلمة المرور |
|---|---|---|
| مالك هاتف (له بلاغان) | `owner@demo.eg` | `Owner@123` |
| مالكة (بلاغات أخرى) | `mona@demo.eg` | `Owner@123` |
| فني صيانة موثّق | `tech@demo.eg` | `Tech@123` |
| فني قيد المراجعة | `newtech@demo.eg` | `Tech@123` |
| الدعم الفني (أدمن) | `admin@demo.eg` | `Admin@123` |

أرقام IMEI تجريبية للفحص: `356938035643809` (مسروق)، `352099001761481` (مفقود)، `868910041234577` (مسروق — رقم المالك ظاهر للعامة)، `353325101234569` (تم التسليم)، `490154203237518` (غير مبلغ عنه — جرّب الإبلاغ به).

> الحسابات التجريبية **مشتركة** بين كل الزوار، فقد يغيّر أحدهم بياناتها. لإعادتها لحالتها الأصلية: `python3 supabase/setup.py --steps seed`.

## الخادم: Supabase
| المكوّن | الاستخدام |
|---|---|
| **Auth** | تسجيل وتسجيل دخول بالبريد وكلمة المرور (كلمات المرور تُشفّر على الخادم). |
| **Postgres + RLS** | كل الجداول محمية بـ Row Level Security؛ المفتاح العام (anon) **لا يستطيع قراءة أي جدول مباشرة**. |
| **دوال RPC (SECURITY DEFINER)** | الفحص العام، رسائل الضيوف، فحص الفني، التسليم، النزاعات، أدوات الدعم — كل منها يتحقق من الدور ويكتب في سجل العمليات. |
| **Storage** | ثلاث حاويات **خاصة**: `report-photos` و`tech-docs` و`handover-photos` (5 ميجا، صور فقط). كل مستخدم يرفع داخل مجلده فقط، والعرض بروابط موقّعة مؤقتة. |

- **المشروع:** `yymuypxnoroszkxttmgh` — `https://yymuypxnoroszkxttmgh.supabase.co` (منطقة eu-central-1 / فرانكفورت).
- **`js/config.js`** يحتوي رابط المشروع و**المفتاح العام (anon / publishable)** فقط — وهو عام بطبيعته وآمن للنشر لأن الحماية كلها في RLS. **لا تضع أبداً مفتاح `service_role` / secret في الواجهة أو في المستودع.**
- مكتبة `supabase-js` v2 مضمّنة محلياً في `js/vendor/supabase.js` (بدون CDN) حتى يعمل الـ Service Worker بدون إنترنت.

### نموذج الأمان (باختصار)
- **الفحص العام** عبر `search_reports` / `get_report_public` يعيد الماركة والموديل واللون والحالة والمحافظة وبيانات التواصل التي جعلها المالك «عامة» فقط — لا IMEI ولا صور ولا أرقام خاصة.
- **رسائل الضيوف** عبر `guest_message_owner` مع حدود معدّل: 5 رسائل/ساعة لكل رقم موبايل، 10/ساعة لكل بلاغ، 20/ساعة لكل IP. الضيف يحصل على رمز محادثة يُخزَّن في قاعدة البيانات **مُجزّأً (hash)** فقط.
- **الأدوار** لا يمكن تغييرها من المستخدم: قيمة `role=admin` في بيانات التسجيل تُتجاهل، والمستخدم لا يعدّل في ملفه إلا الاسم والموبايل، والمالك لا يعدّل في بلاغه إلا إعدادات التواصل (الحالة تتغير عبر دوال مراقبة فقط).
- **بلاغ نشط واحد لكل IMEI** (فهرس فريد + Trigger يمنع التعارض مع IMEI2 والرقم التسلسلي).
- **الفني المعلّق أو الموقوف** لا يستطيع الفحص أو تسجيل تسليم أو رفع صور تسليم (يُتحقق على الخادم).
- **التسليم** يُسجَّل فقط بعد فحص مسبق على الخادم (`handover_precheck`) لمطابقة IMEI، ولا يكتمل إلا بتأكيد المالك من حسابه.
- **سجل العمليات** (`audit_log`) يُكتب بواسطة Triggers ودوال الخادم، ولا يقرؤه إلا الدعم.

### تأكيد البريد الإلكتروني: متوقف (قرار مقصود للنموذج)
خدمة البريد المدمجة في Supabase محدودة جداً (بضع رسائل في الساعة) وغير مخصصة للاستخدام الفعلي، فتم إيقاف تأكيد البريد (`mailer_autoconfirm = true`) حتى يعمل التسجيل فوراً. **قبل الإنتاج:** اربط خدمة SMTP (مثل Resend أو SendGrid) وفعّل التأكيد، وأضف التحقق برسالة SMS (OTP) لأرقام الموبايل. الواجهة جاهزة للحالتين (تعرض رسالة «أكّد بريدك» إذا كان التأكيد مفعّلاً).

### إعداد مشروع جديد من الصفر (`supabase/setup.py`)
سكربت بايثون بمكتبات قياسية فقط يستخدم Supabase Management API:
```bash
export SUPABASE_ACCESS_TOKEN=sbp_...     # أو ضعه في ~/.supabase_token (chmod 600)
python3 supabase/setup.py                 # كل الخطوات: project,schema,auth,config,seed
python3 supabase/setup.py --steps schema  # خطوات محددة (مثلاً بعد تعديل schema.sql)
```
| الخطوة | ماذا تفعل |
|---|---|
| `project` | ينشئ (أو يجد) منظمة `laqeeto` (خطة مجانية) ومشروع `laqeeto` في eu-central-1، ويولّد كلمة مرور قاعدة البيانات ويحفظها في `~/.laqeeto_db_password` (chmod 600) دون طباعتها. |
| `schema` | يطبّق `supabase/schema.sql` (قابل لإعادة التشغيل): الجداول، RLS، الدوال، الحاويات وسياساتها. |
| `auth` | رابط الموقع وقائمة روابط إعادة التوجيه (GitHub Pages + localhost)، إيقاف تأكيد البريد، حد أدنى 6 أحرف لكلمة المرور. |
| `config` | يكتب `js/config.js` بالرابط والمفتاح العام. |
| `seed` | ينشئ الحسابات والبلاغات التجريبية عبر الواجهة العامة (المفتاح العام) + SQL لترقية الأدمن واعتماد الفني. |

لا يطبع السكربت ولا يحفظ داخل المستودع رمز الوصول ولا مفتاح `service_role` ولا كلمة مرور قاعدة البيانات.

### حدود الخطة المجانية
- **يتوقف المشروع مؤقتاً (Pause) بعد نحو أسبوع بدون أي نشاط.** عندها يظهر في التطبيق خطأ اتصال؛ الحل: افتح لوحة Supabase ← المشروع ← **Restore project** (البيانات لا تُحذف).
- مساحة قاعدة البيانات 500 ميجا، والتخزين 1 جيجا، وحدود على عدد الطلبات والبريد.

## التشغيل محلياً
موقع ثابت بالكامل — لا يحتاج أي build:
```bash
cd laqeeto
python3 -m http.server 8080
# افتح http://localhost:8080
```
> يجب فتحه عبر `http://localhost` أو `https://` (وليس `file://`) لأن الـ Service Worker والكاميرا وES Modules تتطلب ذلك. النسخة المحلية تتصل بنفس مشروع Supabase (localhost مسموح في إعدادات Auth).

## النشر على GitHub Pages
من **Settings → Pages** اختر الفرع `main` والمجلد `/ (root)`. كل المسارات نسبية وملف `.nojekyll` موجود.
**عند تعديل أي ملف غيّر قيمة `CACHE_VERSION` في `sw.js`** حتى يحصل المستخدمون على التحديث.

## تثبيت التطبيق على الجهاز
| الجهاز | الطريقة |
|---|---|
| **أندرويد** | افتح الموقع في **Chrome** ← زر «تثبيت التطبيق» داخل التطبيق، أو من القائمة ⋮ **«تثبيت التطبيق»**. |
| **آيفون / آيباد** | افتح الموقع في **Safari** ← زر **المشاركة** ⬆️ ← **«إضافة إلى الشاشة الرئيسية»**. |
| **ويندوز / ماك** | في **Chrome** أو **Edge** اضغط أيقونة التثبيت ⊕ في شريط العنوان. |

بعد أول فتح تُفتح واجهة التطبيق **بدون إنترنت**، لكن الفحص والإبلاغ والرسائل تحتاج اتصالاً (يظهر شريط تنبيه).

## هيكل المشروع
```
index.html              الصفحة الوحيدة (SPA بتوجيه #/)
manifest.json           بيان PWA (أيقونات 192/512 + maskable)
sw.js                   Service Worker (CACHE_VERSION)
css/style.css           التصميم (Mobile-first, RTL)
js/config.js            رابط Supabase + المفتاح العام (يكتبه setup.py)
js/config.example.js    نموذج فارغ
js/vendor/supabase.js   supabase-js v2 (UMD) مضمّن محلياً
js/db.js                طبقة البيانات — الواجهة الوحيدة لـ Supabase (Auth, RPC, Storage)
js/app.js               الموجّه (router) وهيكل الواجهة
js/utils.js             IMEI/Luhn، ضغط الصور، ثوابت
js/ui.js · camera.js · pwa.js   عناصر مشتركة، الكاميرا المباشرة، التثبيت
js/views/*.js           الشاشات: عامة، دخول/تسجيل، المالك، الفني، الرسائل، الدعم
supabase/schema.sql     الجداول + RLS + الدوال + الحاويات (قابل لإعادة التشغيل)
supabase/setup.py       إعداد المشروع عبر Management API
supabase/seed_demo.py   البيانات التجريبية
docs/PLAN.md            خطة المنتج الكاملة
```

## القيود الحالية
- مطابقة الوجه بين السيلفي والبطاقة **محاكاة** — المراجعة يدوية من الدعم.
- فيديو الإثبات في النزاعات يُحفظ **كاسم ملف فقط** (لا يُرفع الفيديو).
- الرسائل تتحدث بالاستطلاع كل 6 ثوانٍ (وليس Realtime) ولا توجد إشعارات Push بعد.
- الحسابات التجريبية مشتركة، والمشروع قد يتوقف بعد أسبوع خمول (خطة مجانية).

## خارطة الطريق للإنتاج
1. **البريد و SMS:** SMTP خاص + تفعيل تأكيد البريد، وOTP لأرقام الموبايل قبل كشف بيانات التواصل.
2. **تحقق حقيقي من الهوية:** خدمة KYC لمطابقة الوجه + **فحص الحيوية (Liveness)** + قراءة البطاقة (OCR).
3. **Realtime وإشعارات:** Supabase Realtime للرسائل، وWeb Push / FCM.
4. **حماية إضافية:** CAPTCHA على التسجيل ورسائل الضيوف، حذف تلقائي للصور بعد إغلاق الحالة، نسخ احتياطي (خطة مدفوعة لا تتوقف).
5. **مراجعة قانونية وخصوصية:** قانون حماية البيانات الشخصية المصري (151 لسنة 2020)، والتعاون مع وزارة الداخلية والجهاز القومي لتنظيم الاتصالات (NTRA).
6. **تطبيقات المتاجر:** تغليف نفس الكود بـ **Capacitor** لأندرويد و iOS.

---

## English summary
**Laqeeto ("I found it") — Stolen Phone Registry.** A mobile-first, installable, fully Arabic (RTL) PWA for reporting stolen/lost phones in Egypt and checking IMEI/serial numbers. Live: https://yhany2884-afk.github.io/laqeeto/

- **Backend: Supabase** (project `yymuypxnoroszkxttmgh`, eu-central-1, free plan) — Auth (email/password), Postgres with strict **Row Level Security** + column grants, `SECURITY DEFINER` RPCs for every privileged flow (public search returns only public columns; rate-limited guest messaging with hashed guest tokens; technician check/handover/disputes/admin tools with server-side role checks and an audit log), and three **private** Storage buckets served via signed URLs. The anon key cannot read any table directly.
- `js/config.js` holds only the project URL and the **public anon/publishable key** (safe to publish). The service_role/secret key, the Management API token and the DB password are never in the repo.
- **Email confirmation is OFF** for the prototype (Supabase's built-in mailer is heavily rate-limited); enable it with a custom SMTP before production. The UI already handles the "confirm your email" case.
- **Setup:** `SUPABASE_ACCESS_TOKEN=… python3 supabase/setup.py [--steps project,schema,auth,config,seed]` (stdlib only; token may also live in `~/.supabase_token`, DB password is written to `~/.laqeeto_db_password`, chmod 600).
- **Free tier:** the project **pauses after ~1 week of inactivity** — restore it from the Supabase dashboard (data is kept).
- **Limitations:** simulated face match (manual admin review), dispute video stored as file name only, chat uses 6-second polling (no realtime/push), shared demo accounts.
- **Demo accounts:** see the table above (`owner@demo.eg / Owner@123`, `tech@demo.eg / Tech@123`, `admin@demo.eg / Admin@123`, …). Reset with `python3 supabase/setup.py --steps seed`.
- **Roadmap:** SMTP + SMS OTP, real KYC face-match + liveness, Realtime + push, CAPTCHA, legal/privacy review (Egyptian PDPL 151/2020, police/NTRA cooperation), Capacitor store builds.
