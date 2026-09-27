// All bot copy (Egyptian Arabic). HTML parse mode: dynamic values must go through esc().
export const WEB = 'https://yhany2884-afk.github.io/laqeeto/';
export const RELEASES = 'https://github.com/yhany2884-afk/laqeeto/releases/latest';
export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const T = {
  welcome: 'أهلاً بيك في بوت <b>لقيته</b>.\nلقيته بيساعدك تتأكد إن الموبايل مش مسروق قبل ما تشتريه، وتبلّغ عن موبايلك لو اتسرق أو ضاع.\n\nاختار من تحت، أو ابعتلي رقم IMEI على طول وأنا أفحصه.',
  report: '<b>إزاي تبلّغ عن موبايل اتسرق أو ضاع</b>\n\n'
    + '1. افتح لقيته واعمل حساب بالإيميل.\n'
    + '2. دوس «بلّغ» واكتب الماركة والموديل واللون ورقم الـ IMEI.\n'
    + '3. صوّر علبة الموبايل وعليها الـ IMEI، والفاتورة والمحضر لو معاك.\n'
    + '4. بيانات التواصل بتاعتك مخفية. الناس بتبعتلك رسايل جوه التطبيق، وإنت تختار تظهر إيه.\n\n'
    + 'الـ IMEI مكتوب على العلبة والفاتورة. بعد البلاغ، أي حد يفحص الرقم هيعرف إن الموبايل متبلّغ عنه.\n'
    + 'اعمل محضر في القسم كمان، وضيف رقمه للبلاغ.',
  checkPrompt: 'ابعتلي رقم الـ IMEI (15 رقم).\n\nتعرفه لو طلبت <code>*#06#</code> من الموبايل نفسه، أو من الإعدادات ← حول الهاتف.\nمتعتمدش على رقم مكتوب على ورقة أو على ضهر الموبايل.',
  invalid: 'الرقم ده مش مظبوط. الـ IMEI بيبقى <b>15 رقم</b> بالظبط.\nجرّب تاني، أو دوس /cancel.',
  luhn: 'الرقم ده شكله فيه غلطة في الكتابة (مش رقم IMEI سليم).\nراجعه تاني من <code>*#06#</code> وابعته.',
  rateLimited: 'استنى شوية. تقدر تفحص 10 أرقام كل 10 دقايق.',
  clear: (n: string, hadOld: boolean) => `✅ <b>مفيش بلاغ نشط عن الرقم ده</b>\n<code>${esc(n)}</code>\n\n`
    + (hadOld ? 'كان فيه بلاغ قديم عن الرقم ده واتقفل (الموبايل رجع لصاحبه).\n\n' : '')
    + 'ده مش ضمان كامل: اطلب العلبة والفاتورة، واتأكد إن الرقم اللي على العلبة هو نفس اللي بيطلع بـ <code>*#06#</code>.',
  reported: (n: string, r: { brand: string; model: string; type: string; status: string; reported_at: string }) =>
    `⛔️ <b>الرقم ده متبلّغ عنه إنه ${r.type === 'lost' ? 'ضايع' : 'مسروق'}</b>${r.status === 'dispute' ? ' (وعليه نزاع)' : ''}\n<code>${esc(n)}</code>\n\n`
    + `الجهاز: ${esc(r.brand)} ${esc(r.model)}\nاتبلّغ عنه: ${esc(fmtDate(r.reported_at))}\n\n`
    + 'متشتريش الموبايل ده ومتصلّحهوش. لو الموبايل معاك أو لقيته، ابعت لصاحبه من التطبيق، أو سلّمه لأقرب قسم شرطة.',
  tech: '<b>تسجيل فنيين الصيانة</b>\n\n'
    + '1. سجّل من «تسجيل فني» في لقيته، واكتب بيانات المحل.\n'
    + '2. ارفع صورة البطاقة، وسكرين شوت من موبايلك فيها الـ IMEI.\n'
    + '3. صوّر سيلفي من الكاميرا (مينفعش صورة من الاستوديو). بنقارن السيلفي بصورة البطاقة: لو التطابق واضح حسابك بيتفعّل على طول، غير كده فريق لقيته بيراجعه، وغالباً ده بياخد يوم عمل.\n'
    + '4. بعد التفعيل تقدر تفحص أي جهاز قبل ما تشتريه أو تصلّحه، وتكلّم صاحبه، وتسجّل تسليم الموبايل له.\n\n'
    + 'الفني الموثّق بيتعهد إنه مش هيشتري ولا يصلّح موبايل متبلّغ عنه.',
  faq: '<b>أسئلة شائعة</b>\n\n'
    + '<b>لقيته بيعرض بياناتي؟</b>\nلأ. بياناتك مخفية إلا اللي إنت تختار تظهره، والناس بتبعتلك رسايل جوه التطبيق.\n\n'
    + '<b>حد كلمني وقال إنه لقى موبايلي وعايز فلوس؟</b>\nمتحوّلش فلوس لحد. قابله في مكان عام أو عند فني موثّق، ومتدّيش حد كود تحقق أو كلمة سر.\n\n'
    + '<b>لقيت موبايل، أعمل إيه؟</b>\nافحص الـ IMEI هنا أو في التطبيق. لو متبلّغ عنه ابعت لصاحبه من التطبيق، أو سلّمه لأقرب قسم شرطة.\n\n'
    + '<b>موبايلي رجعلي؟</b>\nادخل التطبيق ودوس «رجعلي» على البلاغ عشان يتقفل.\n\n'
    + '<b>لقيته بديل عن محضر الشرطة؟</b>\nلأ. اعمل محضر، وضيف رقمه في البلاغ.\n\n'
    + '<b>التطبيق بفلوس؟</b>\nلأ، مجاني.',
  supportPrompt: 'اكتب رسالتك هنا وهتوصل لفريق لقيته، وهنرد عليك في نفس المحادثة.\nممكن تبعت صورة أو سكرين شوت كمان.\n\nلما تخلص دوس /cancel.',
  supportSent: 'وصلت لفريق لقيته ✓ هنرد عليك هنا في أقرب وقت.',
  supportOff: 'الدعم على تيليجرام مش متاح دلوقتي. جرّب تاني بعد شوية.',
  supportBusy: 'بعت رسايل كتير. استنى شوية وابعت تاني.',
  cancelled: 'تمام. اختار من القائمة:',
  unknown: 'مش فاهمك. اختار من القائمة، أو ابعت رقم IMEI على طول.',
  adminReply: (text: string) => `<b>فريق لقيته:</b>\n${esc(text)}`,
  // admin side
  adminHeader: (name: string, user: string, id: number) => `📩 رسالة جديدة من <b>${esc(name)}</b>${user ? ' (@' + esc(user) + ')' : ''} — <code>${id}</code>\nاعمل Reply على الرسالة دي أو اللي تحتها عشان ترد عليه.`,
  adminHint: 'عشان ترد على عميل، اعمل <b>Reply</b> على رسالته.\nتقدر تفحص IMEI هنا برضه.',
  adminRelayed: 'وصل للعميل ✓',
  adminNoThread: 'مش لاقي العميل صاحب الرسالة دي (ممكن تكون قديمة أكتر من 30 يوم).',
  adminBlocked: 'مقدرتش أوصّل الرد. غالباً العميل قفل البوت.',
  claimOk: 'تمام، الحساب ده بقى حساب الدعم.\nأي رسالة من عميل هتوصلك هنا، واعمل Reply عليها عشان توصله. /release لفك الربط.',
  claimTaken: 'فيه حساب دعم متسجّل بالفعل.',
  claimBad: 'الكود مش صح.',
  claimSlow: 'محاولات كتير. جرّب بعد ساعة.',
  released: 'اتفك الربط. الحساب ده مبقاش حساب الدعم.',
};

export function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Cairo' }); } catch { return iso; }
}

type Btn = { text: string; callback_data?: string; url?: string };
export const menu = (): { inline_keyboard: Btn[][] } => ({
  inline_keyboard: [
    [{ text: 'إزاي أبلّغ عن موبايل', callback_data: 'report' }, { text: 'افحص IMEI', callback_data: 'check' }],
    [{ text: 'تسجيل الفنيين', callback_data: 'tech' }, { text: 'أسئلة شائعة', callback_data: 'faq' }],
    [{ text: 'كلّم الدعم', callback_data: 'support' }],
    [{ text: 'افتح لقيته', url: WEB }, { text: 'نزّل التطبيق', url: RELEASES }],
  ],
});
export const back = (extra: Btn[] = []) => ({ inline_keyboard: [...(extra.length ? [extra] : []), [{ text: 'القائمة', callback_data: 'menu' }]] });
export const COMMANDS = [
  { command: 'start', description: 'القائمة' },
  { command: 'check', description: 'افحص رقم IMEI' },
  { command: 'support', description: 'كلّم فريق لقيته' },
  { command: 'cancel', description: 'إلغاء' },
];
