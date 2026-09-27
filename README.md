# لقيته — سجل الهواتف المسروقة والمفقودة
**Stolen Phone Registry** · تطبيق ويب قابل للتثبيت (PWA) · عربي بالكامل (RTL) · قاعدة بيانات مشتركة على **Supabase**

🌐 **التطبيق المباشر:** https://yhany2884-afk.github.io/laqeeto/

> ⚠️ **نسخة تجريبية (Prototype):** البيانات الآن **مشتركة بين كل الأجهزة** (Supabase: Postgres + Auth + Storage) لكن المشروع على الخطة المجانية. لا تستخدمه لبيانات حقيقية حساسة.

## ⬇️ تحميل التطبيق
| الجهاز | ملف التثبيت |
|---|---|
| 🤖 أندرويد 7+ | [Laqeeto-Android.apk](https://github.com/yhany2884-afk/laqeeto/releases/latest/download/Laqeeto-Android.apk) |
| 🪟 ويندوز 10/11 (64-bit) | [Laqeeto-Windows-Setup.exe](https://github.com/yhany2884-afk/laqeeto/releases/latest/download/Laqeeto-Windows-Setup.exe) |
| 🍎 ماك (Apple M1/M2/M3/M4) | [Laqeeto-macOS-arm64.dmg](https://github.com/yhany2884-afk/laqeeto/releases/latest/download/Laqeeto-macOS-arm64.dmg) |
| 🍏 ماك (Intel) | [Laqeeto-macOS-x64.dmg](https://github.com/yhany2884-afk/laqeeto/releases/latest/download/Laqeeto-macOS-x64.dmg) |
| 📱 آيفون (IPA غير موقّع — للتحميل الجانبي) | [Laqeeto-iPhone-unsigned.ipa](https://github.com/yhany2884-afk/laqeeto/releases/latest/download/Laqeeto-iPhone-unsigned.ipa) |
| 🌐 أي جهاز بدون تثبيت | https://yhany2884-afk.github.io/laqeeto/ |

كل الملفات وخطوات التثبيت التفصيلية في [صفحة أحدث إصدار](https://github.com/yhany2884-afk/laqeeto/releases/latest). باختصار:
- **أندرويد:** اسمح بـ«تثبيت التطبيقات من مصادر غير معروفة» للمتصفح، وإذا حذّر Play Protect اختر «التثبيت على أي حال».
- **ويندوز:** في شاشة SmartScreen اضغط «مزيد من المعلومات» ← «تشغيل على أي حال».
- **ماك:** اسحب التطبيق إلى Applications ثم زر الماوس الأيمن ← «فتح»، أو «إعدادات النظام ← الخصوصية والأمان ← فتح على أي حال».
- **آيفون:** الأسهل: Safari ← مشاركة ← «إضافة إلى الشاشة الرئيسية». أو وقّع ملف IPA بـ Sideloadly/AltStore بحساب Apple ID (يلزم إعادة التوقيع كل 7 أيام مع الحساب المجاني).

> النسخ المستقلة غير موقّعة من Apple/Microsoft (نموذج تجريبي) ولا تتحدث تلقائياً؛ كلها تستخدم نفس قاعدة البيانات والحسابات.

## ما هو «لقيته»؟
سجل مجتمعي للهواتف المسروقة والمفقودة في مصر:
- **مالك الهاتف** يبلّغ عن هاتفه برقم IMEI (15 رقماً + خوارزمية Luhn، ويُتحقق منها في قاعدة البيانات أيضاً) وصورة العلبة وبيانات اختيارية (فاتورة، رقم محضر)، مع تحكم كامل في خصوصية بيانات التواصل لكل حقل (مخفية افتراضياً).
- **أي شخص وجد هاتفاً أو سيشتري مستعملاً** يفحص رقم IMEI أو الرقم التسلسلي بدون تسجيل، ويراسل المالك داخل التطبيق (بحسابه أو كضيف بالاسم ورقم الموبايل) — والمالك يرى الرسالة على جهازه هو.
- **فني الصيانة** يسجّل ببيانات المحل وصورة البطاقة وسيلفي مباشر من الكاميرا ولقطة شاشة لـ IMEI هاتفه، وبعد اعتماده من الدعم يفحص الأجهزة (أخضر/أحمر) ويسجّل تسليم الهاتف لمالكه بقائمة تحقق وصور، ثم يؤكد المالك الاستلام من حسابه.
- **الدعم الفني** يراجع طلبات الفنيين (البطاقة والسيلفي جنباً إلى جنب)، يدير البلاغات والنزاعات وبلاغات الإكراه، يوقف الفنيين المخالفين، ويطلع على سجل العمليات.

## التجربة
- **فحص IMEI بدون تسجيل:** اكتب أي رقم IMEI من صفحة الفحص. قاعدة البيانات الحقيقية لا تحتوي على بيانات تجريبية.
- **حساب مالك:** أنشئ حساباً مجانياً من صفحة «إنشاء حساب».
- **لا توجد حسابات تجريبية.** حساب الدعم الفني (الأدمن) حساب شخصي لصاحب المشروع فقط، والاختبارات تنشئ حسابات مؤقتة بأسماء عشوائية وتحذفها مع كل بياناتها وملفاتها بعد الانتهاء (`tests/cleanup.py`).

> ⚠️ لا تنشر أبداً كلمة مرور حساب أدمن في المستودع أو في واجهة التطبيق. لإنشاء حساب أدمن: سجّل حساباً عادياً ثم رقّه عبر SQL (`update public.profiles set role = 'admin' where id = …`) — لا يمكن لأي مستخدم ترقية نفسه.

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
- **الروابط** (روابط التواصل الاجتماعي ورابط دليل النزاع) لا تُقبل إلا إذا بدأت بـ `https://` أو `http://` (تحقق على الخادم والواجهة معاً)، لمنع روابط `javascript:` الخبيثة.
- **اسم صاحب البلاغ** لا يظهر للفني أو للزائر في المحادثات: يظهر لهم «صاحب البلاغ» فقط.
- **حدود المعدّل** تعتمد على عنوان IP الذي يحدده Cloudflare (`cf-connecting-ip`) وليس على ترويسة `X-Forwarded-For` التي يمكن تزويرها. الفحص العام: 120/ساعة لكل IP للزوار و300/ساعة لكل حساب.
- **اختبار الاختراق**: `tests/security_attack_test.py` يجرب أكثر من 100 محاولة هجوم على الخادم الحقيقي بصفة زائر ومالك وفني معلّق ومعتمد وموقوف ومدير. يحتاج ملف بيانات دخول المدير خارج المستودع: `LAQEETO_TEST_CREDENTIALS=/path/creds.json python3 tests/security_attack_test.py`.

### تأكيد البريد الإلكتروني: متوقف (قرار مقصود للنموذج)
خدمة البريد المدمجة في Supabase محدودة جداً (بضع رسائل في الساعة) وغير مخصصة للاستخدام الفعلي، فتم إيقاف تأكيد البريد (`mailer_autoconfirm = true`) حتى يعمل التسجيل فوراً. **قبل الإنتاج:** اربط خدمة SMTP (مثل Resend أو SendGrid) وفعّل التأكيد، وأضف التحقق برسالة SMS (OTP) لأرقام الموبايل. الواجهة جاهزة للحالتين (تعرض رسالة «أكّد بريدك» إذا كان التأكيد مفعّلاً).

### إعداد مشروع جديد من الصفر (`supabase/setup.py`)
سكربت بايثون بمكتبات قياسية فقط يستخدم Supabase Management API:
```bash
export SUPABASE_ACCESS_TOKEN=sbp_...     # أو ضعه في ~/.supabase_token (chmod 600)
python3 supabase/setup.py                 # الخطوات الافتراضية: project,schema,auth,config (بدون بيانات تجريبية)
python3 supabase/setup.py --steps schema  # خطوات محددة (مثلاً بعد تعديل schema.sql)
```
| الخطوة | ماذا تفعل |
|---|---|
| `project` | ينشئ (أو يجد) منظمة `laqeeto` (خطة مجانية) ومشروع `laqeeto` في eu-central-1، ويولّد كلمة مرور قاعدة البيانات ويحفظها في `~/.laqeeto_db_password` (chmod 600) دون طباعتها. |
| `schema` | يطبّق `supabase/schema.sql` (قابل لإعادة التشغيل): الجداول، RLS، الدوال، الحاويات وسياساتها. |
| `auth` | رابط الموقع وقائمة روابط إعادة التوجيه (GitHub Pages + localhost)، إيقاف تأكيد البريد، حد أدنى 6 أحرف لكلمة المرور. |
| `config` | يكتب `js/config.js` بالرابط والمفتاح العام. |
| `seed` | **اختياري ولمشاريع الاختبار فقط:** ينشئ بيانات تجريبية عشوائية (بريد `demo-<run>-…@example.com` وأرقام IMEI عشوائية وكلمات مرور عشوائية، بدون أدمن). لا يعمل إلا مع `LAQEETO_SEED_DEMO=yes` ويرفض مشروع الإنتاج. للحذف: `python3 tests/cleanup.py 'demo-<run>-%@example.com'` |

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
supabase/seed_demo.py   بيانات تجريبية اختيارية (لمشاريع الاختبار فقط)
docs/PLAN.md            خطة المنتج الكاملة
native/                 التطبيقات المستقلة (لا تُنشر على الموقع):
  scripts/build-www.mjs   ينسخ ملفات الويب من جذر المستودع إلى native/www
  capacitor.config.json   أندرويد + iOS (Capacitor 8)
  android/ · ios/         مشروعا Capacitor الأصليان (أذونات الكاميرا، الأيقونات، التوقيع)
  electron/               تطبيق سطح المكتب (Electron) لويندوز وماك
  electron-builder.yml    إعداد مثبّت ويندوز (NSIS) و DMG للماك
  RELEASE_NOTES.md        نص صفحة الإصدار
.github/workflows/build.yml  بناء كل المنصات وإنشاء الإصدار على GitHub
```

## بناء التطبيقات المستقلة
جذر المستودع هو **المصدر الوحيد** لكود الواجهة؛ مجلد `native/` يغلّفه فقط:
- **أندرويد (Capacitor):** APK موقّع بمفتاح إصدار محفوظ في GitHub Secrets فقط (`ANDROID_KEYSTORE_BASE64`، `ANDROID_KEYSTORE_PASSWORD`، `ANDROID_KEY_PASSWORD`؛ اسم المفتاح `laqeeto`). إذن `CAMERA` مضاف، وCapacitor يمرر طلبات الكاميرا من WebView (السيلفي المباشر و`<input capture>`).
- **ويندوز وماك (Electron):** الواجهة تُحمّل من بروتوكول خاص آمن `app://laqeeto/`، الكاميرا فقط مسموحة (الميكروفون وغيره مرفوض)، والروابط الخارجية تفتح في المتصفح. الماك موقّع ad-hoc بدون توثيق Apple.
- **آيفون (Capacitor):** IPA **غير موقّع** يُبنى على macOS بـ `xcodebuild archive CODE_SIGNING_ALLOWED=NO`.
- في التطبيقات المستقلة لا يُسجَّل Service Worker ولا تظهر أزرار «تثبيت التطبيق».

**إصدار جديد:** غيّر `CACHE_VERSION` في `sw.js` إن عدّلت الواجهة، ثم:
```bash
git tag v2.0.1 && git push origin v2.0.1   # يبني كل المنصات وينشئ الإصدار تلقائياً
```
أو شغّل الـ workflow يدوياً من تبويب Actions (مع أو بدون tag).

**محلياً:**
```bash
cd native && npm ci
npm run electron          # تشغيل نسخة سطح المكتب
npm run cap:sync          # نسخ الواجهة إلى android/ و ios/ ثم افتحها في Android Studio / Xcode
npx @capacitor/assets generate --android --ios   # إعادة توليد الأيقونات من native/assets
```

## التصميم والأصول (للمطورين)

- **الخط:** IBM Plex Sans Arabic (رخصة SIL OFL 1.1، الملف `fonts/OFL.txt`) مستضاف داخل التطبيق، أوزان 400/500/700.
- **الأيقونات:** Lucide (رخصة ISC، `icons/LICENSE-lucide.txt`) كـ SVG داخل `js/icons.js`، مفيش خطوط أيقونات ولا CDN.
- **الألوان:** لون أساسي واحد `#16499B` + رماديات + أخضر/أحمر/أصفر للحالات فقط (المتغيرات في أول `css/style.css`).
- **الشعار وأيقونات التطبيقات وشاشات البداية:** كلها بتتولد من نفس رسمة الشعار:
  `python3 native/scripts/gen-brand-assets.py` (محتاج Playwright + Pillow)، وبيحدّث أيقونات الويب وأندرويد وآيفون والكمبيوتر.
- **أنيميشن الفتح/القفل:** CSS/SVG داخل `index.html` (مرة واحدة لكل تشغيل، تقدر تتخطاه، وبيحترم `prefers-reduced-motion`)،
  وأنيميشن الخروج في `js/splash.js` (عند تسجيل الخروج، وعند قفل شباك تطبيق الكمبيوتر). لون شاشة البداية في أندرويد وآيفون والكمبيوتر هو نفس لون الأنيميشن عشان مفيش وميض أبيض.

## مطابقة الوجه (السيلفي ↔ صورة البطاقة)

- **إزاي بتشتغل:** بعد ما الفني يرفع المستندات، التطبيق بينادي Edge Function اسمها `face-match` (`supabase/functions/face-match/`).
  الـ function بتنزّل صورة البطاقة والسيلفي من الـ Storage، وبتدوّر على الوش بـ **YuNet** وتعدّله (alignment) وتطلع بصمة للوش بـ **SFace** (موديلات OpenCV Zoo، رخص MIT وApache-2.0، مجانية)، وبعدين بتحسب التشابه (cosine).
  مفيش أي خدمة خارجية ولا فلوس، كله شغال على الخطة المجانية. الصور مش بتتخزن في أي مكان تاني، والبصمة نفسها مش بتتحفظ، بيتحفظ الناتج بس (الحالة والدرجة) في `profiles.tech_face_match`.
- **القرار في قاعدة البيانات مش في الـ function:** الـ function بتبعت النتيجة لـ `record_face_match` (service role بس)، وهي اللي بتطبّق السياسة من `private.settings`:
  - اعتماد تلقائي **بس** لو: الفني pending، والحالة `match`، والدرجة ≥ `auto_min_score` (0.5)، ووش البطاقة ≥ 40px ووش السيلفي ≥ 80px، والسيلفي من الكاميرا مباشرة.
  - أي حاجة تانية (درجة ضعيفة، مفيش وش، أكتر من شخص، عطل) ← **مراجعة يدوية**. مفيش رفض تلقائي أبداً.
  - كل مقارنة وكل اعتماد تلقائي بيتسجلوا في `audit_log`. الفني بيعرف بس لو اتفعّل ولا لأ، والدرجة للأدمن بس.
  - حد أقصى 10 مقارنات للفني في الساعة. النتيجة القديمة بتتجاهل لو الفني غيّر المستندات في النص.
  - لإيقاف الاعتماد التلقائي: `update private.settings set value = jsonb_set(value, '{auto_approve}', 'false') where key = 'face_match';`
- **الموديلات** في bucket خاص `ml-models` (مفيش أي policy للعملاء): `python3 supabase/upload_models.py` (التعليمات جوه الملف).
- **النشر:** `SUPABASE_TOKEN_FILE=... python3 supabase/functions_api.py deploy supabase/functions/face-match face-match` (التوكن محتاج صلاحية `edge_functions_write`).
- **الاختبارات:** `FACE_FIXTURES=<dir> deno test -A supabase/functions/face-match/handler.test.ts` (الـ auth والصلاحيات والمطابقة بصور حقيقية مع mock للـ API)، و`python3 tests/face_match_db_test.py` (سياسة الاعتماد في قاعدة البيانات).
  و`python3 tests/face_match_live_test.py` (على السيرفر الحقيقي: فنيين مؤقتين، زوج متطابق بيتفعّل تلقائي، زوج مش متطابق بيفضل pending، ومحاولات تفعيل ذاتي بتفشل).
- **حدود:** مفيش liveness حقيقي (غير إن السيلفي لازم يتصوّر من الكاميرا جوه التطبيق)، وصور البطايق القديمة أو الصغيرة بتدي درجات أقل، فبتروح للمراجعة اليدوية. المطابقة بتثبت إن اللي في السيلفي هو صاحب الصورة اللي في البطاقة، مش إن البطاقة نفسها سليمة.

## بوت تيليجرام (@laqeeto_help_bot)

- **الكود:** `supabase/functions/telegram-bot/` (Edge Function بـ webhook، `verify_jwt=false`؛ الحماية بالـ header `X-Telegram-Bot-Api-Secret-Token`). الكلام كله في `texts.ts`.
- **القائمة (`/start`):** إزاي أبلّغ، افحص IMEI، تسجيل الفنيين، أسئلة شائعة، كلّم الدعم، ولينكات للتطبيق وصفحة التحميل.
- **فحص IMEI:** بيرجّع الحالة بس (متبلّغ عنه ولا لأ، الماركة والموديل والتاريخ)، **من غير أي بيانات عن المالك**. حد أقصى 10 فحوصات كل 10 دقايق و60 في اليوم لكل محادثة. بيقبل أرقام عربي.
- **الدعم:** رسالة العميل بتتحوّل لحساب الأدمن مع اسمه، والأدمن يعمل Reply على الرسالة والبوت يوصّل الرد للعميل (نص أو صورة). حد أقصى 20 رسالة في الساعة لكل عميل.
- **تسجيل الأدمن بأمان:** من حساب الأدمن ابعت `/claim <code>` مرة واحدة (الكود في secret `TELEGRAM_ADMIN_CLAIM_CODE`، ومقارنته constant-time، و5 محاولات في الساعة، والرسالة اللي فيها الكود بتتمسح). بعد ما حد يعمل claim محدش تاني يقدر لحد ما الأدمن يبعت `/release`. بديل: secret `TELEGRAM_ADMIN_CHAT_ID` بيثبّت الأدمن ويقفل `/claim`.
- **الأسرار:** `TELEGRAM_BOT_TOKEN` و`TELEGRAM_WEBHOOK_SECRET` و`TELEGRAM_ADMIN_CLAIM_CODE` في secrets الـ function بس. قاعدة البيانات مبتشوفش التوكن. كل الـ RPCs بتاعة البوت (`bot_*`) service role بس.
- **النشر (function + secrets + webhook مرة واحدة):** `SUPABASE_TOKEN_FILE=... LAQEETO_CREDS=... python3 supabase/setup_edge.py` (التوكن محتاج `edge_functions_write` و`edge_functions_secrets_write`).
- **الاختبارات:** `deno test -A supabase/functions/telegram-bot/bot.test.ts` (Telegram وSupabase عاملين mock).

## الاختبارات

- `tests/security_attack_test.py`: اختبارات هجوم على الـ API (صلاحيات، رفع ملفات، XSS، rate limit).
- `tests/e2e_flow_test.py`: رحلة كاملة في المتصفح (مالك، ضيف، فني، أدمن، تسليم، نزاع، وضع بدون نت).
- الاتنين بيعملوا حسابات مؤقتة `lqtest-*@example.com` وبيمسحوها هي وملفاتها في الآخر:
  ```bash
  LAQEETO_TEST_CREDENTIALS=~/.laqeeto_admin_credentials LAQEETO_DB_PASSWORD_FILE=~/.laqeeto_db_password python3 tests/e2e_flow_test.py
  ```
- `supabase/functions_api.py`: نشر Edge Functions وضبط الـ secrets عن طريق Management API (التوكن بيتقري من متغير بيئة أو ملف، ومبيتطبعش).

## القيود الحالية
- فيديو الإثبات في النزاعات يُحفظ **كاسم ملف فقط** (لا يُرفع الفيديو).
- الرسائل تتحدث بالاستطلاع كل 6 ثوانٍ (وليس Realtime) ولا توجد إشعارات Push بعد.
- المشروع قد يتوقف بعد أسبوع خمول (خطة مجانية).

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
- **Setup:** `SUPABASE_ACCESS_TOKEN=… python3 supabase/setup.py [--steps project,schema,auth,config[,seed]]` (stdlib only; token may also live in `~/.supabase_token`, DB password is written to `~/.laqeeto_db_password`, chmod 600).
- **Free tier:** the project **pauses after ~1 week of inactivity** — restore it from the Supabase dashboard (data is kept).
- **Telegram bot** (`supabase/functions/telegram-bot`): Egyptian-Arabic help bot @laqeeto_help_bot (menu, public-only IMEI check, technician guide, FAQ, support relay to the admin via reply). Webhook secret header, one-time `/claim` admin registration, all `bot_*` RPCs service-role only. Deploy with `supabase/setup_edge.py`.
- **Limitations:** face match is automatic but has no liveness/anti-spoofing beyond the live-camera selfie, dispute video stored as file name only, chat uses 6-second polling (no realtime/push).
- **No demo data in production:** no demo accounts or demo IMEIs exist in the live DB. The optional seed (`LAQEETO_SEED_DEMO=yes`, refuses the production project) creates random accounts/IMEIs with random passwords and never an admin. Tests create random temporary accounts and purge them (rows + storage) with `tests/cleanup.py`. Admins are promoted manually via SQL.
- **Native apps** (`native/`, built by `.github/workflows/build.yml` on `v*` tags): signed Android APK (Capacitor 8), Windows NSIS installer and macOS arm64/x64 DMGs (Electron, unsigned/ad-hoc), unsigned iPhone IPA for sideloading. Direct links: `https://github.com/yhany2884-afk/laqeeto/releases/latest/download/<file>`.
- **Roadmap:** SMTP + SMS OTP, liveness / anti-spoofing + ID OCR, Realtime + push, CAPTCHA, legal/privacy review (Egyptian PDPL 151/2020, police/NTRA cooperation), Capacitor store builds.
