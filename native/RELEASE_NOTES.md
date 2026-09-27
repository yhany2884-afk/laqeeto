## لقيته {{VERSION}} — سجل الهواتف المسروقة والمفقودة 📱🔍

تطبيقات مستقلة لكل جهاز، متصلة بنفس قاعدة البيانات المشتركة (Supabase) التي يستخدمها موقع الويب — حسابك وبلاغاتك ورسائلك واحدة في كل مكان.

🌐 **بدون تثبيت:** https://yhany2884-afk.github.io/laqeeto/

| الجهاز | الملف |
|---|---|
| 🤖 أندرويد 7 فأحدث | [Laqeeto-Android.apk](https://github.com/yhany2884-afk/laqeeto/releases/download/{{VERSION}}/Laqeeto-Android.apk) |
| 🪟 ويندوز 10/11 (64-bit) | [Laqeeto-Windows-Setup.exe](https://github.com/yhany2884-afk/laqeeto/releases/download/{{VERSION}}/Laqeeto-Windows-Setup.exe) |
| 🍎 ماك بمعالج Apple (M1/M2/M3/M4…) | [Laqeeto-macOS-arm64.dmg](https://github.com/yhany2884-afk/laqeeto/releases/download/{{VERSION}}/Laqeeto-macOS-arm64.dmg) |
| 🍏 ماك بمعالج Intel | [Laqeeto-macOS-x64.dmg](https://github.com/yhany2884-afk/laqeeto/releases/download/{{VERSION}}/Laqeeto-macOS-x64.dmg) |
| 📱 آيفون / آيباد (للتحميل الجانبي) | [Laqeeto-iPhone-unsigned.ipa](https://github.com/yhany2884-afk/laqeeto/releases/download/{{VERSION}}/Laqeeto-iPhone-unsigned.ipa) |

> هذه نسخة تجريبية (Prototype) غير موقّعة من Apple أو Microsoft، لذلك سيظهر تحذير عند التثبيت — هذا متوقع. خطوات التثبيت بالأسفل.

### 🤖 أندرويد
1. حمّل `Laqeeto-Android.apk` من الهاتف وافتحه.
2. إذا ظهرت رسالة «لأسباب أمنية غير مسموح…» اضغط **الإعدادات** وفعّل **«السماح من هذا المصدر»** (تثبيت تطبيقات غير معروفة) للمتصفح أو مدير الملفات، ثم ارجع واضغط **تثبيت**.
3. قد يعرض Google Play Protect تحذيراً لأن التطبيق ليس من المتجر: اختر **«التثبيت على أي حال»**.
4. عند أول استخدام للسيلفي المباشر اسمح للتطبيق باستخدام **الكاميرا**.

### 🪟 ويندوز
1. حمّل `Laqeeto-Windows-Setup.exe` وشغّله.
2. إذا ظهرت شاشة **Windows SmartScreen** الزرقاء اضغط **«مزيد من المعلومات» (More info)** ثم **«تشغيل على أي حال» (Run anyway)**.
3. اتبع خطوات المثبّت؛ ستجد اختصار «لقيته» على سطح المكتب وفي قائمة ابدأ.

### 🍎 ماك
1. اختر الملف المناسب لجهازك (من قائمة  ← «حول هذا الماك»: Chip = Apple → `arm64`، Processor = Intel → `x64`).
2. افتح ملف `.dmg` واسحب **Laqeeto** إلى مجلد **Applications**.
3. أول مرة: اضغط على التطبيق **بزر الماوس الأيمن ← فتح (Open)** ثم **فتح**. في macOS 15 (Sequoia) فأحدث: حاول فتحه مرة، ثم اذهب إلى **إعدادات النظام ← الخصوصية والأمان** واضغط **«فتح على أي حال» (Open Anyway)**.
4. اسمح بالوصول إلى **الكاميرا** عند الطلب (للسيلفي المباشر).

### 📱 آيفون / آيباد
**الطريقة الأسهل (موصى بها):** افتح https://yhany2884-afk.github.io/laqeeto/ في **Safari** ← زر **المشاركة** ⬆️ ← **«إضافة إلى الشاشة الرئيسية»**.

**أو تثبيت ملف IPA (للمتقدمين):** الملف غير موقّع، ويجب توقيعه بحساب Apple ID الخاص بك:
1. ثبّت **[Sideloadly](https://sideloadly.io/)** (ويندوز/ماك) أو **AltStore**، ووصّل الآيفون بالكمبيوتر.
2. اسحب `Laqeeto-iPhone-unsigned.ipa` إلى Sideloadly، وأدخل Apple ID، واضغط **Start**.
3. على الآيفون: **الإعدادات ← عام ← VPN وإدارة الأجهزة** ← اختر حسابك ← **وثوق (Trust)**. وفي iOS 16 فأحدث فعّل **وضع المطوّر (Developer Mode)** من **الإعدادات ← الخصوصية والأمان**.
4. مع حساب Apple مجاني **تنتهي صلاحية التطبيق كل 7 أيام** ويجب إعادة توقيعه (Sideloadly/AltStore يمكنهما التجديد).

### ℹ️ ملاحظات
- كل النسخ تحتاج اتصالاً بالإنترنت للفحص والإبلاغ والرسائل.
- نسخة تجريبية — لا تضع بيانات حساسة. أنشئ حسابك الخاص من داخل التطبيق.
- التطبيق لا يتحدث تلقائياً: حمّل الإصدار الأحدث من صفحة الإصدارات.
- قاعدة البيانات على الخطة المجانية وقد تتوقف مؤقتاً بعد أسبوع بدون نشاط.
- للتحقق من سلامة الملفات: `SHA256SUMS.txt`.

---
**English:** Native builds of Laqeeto (Stolen Phone Registry) sharing the same Supabase backend as the web app. Android APK (signed), Windows NSIS installer (x64), macOS DMG for Apple Silicon (arm64) and Intel (x64) — ad-hoc signed, not notarized (right-click → Open / Privacy & Security → Open Anyway), and an **unsigned** iPhone IPA for sideloading with Sideloadly/AltStore (re-sign every 7 days with a free Apple ID). Windows: SmartScreen → More info → Run anyway. Web: https://yhany2884-afk.github.io/laqeeto/
