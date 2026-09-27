// أدوات مساعدة عامة — Utilities (no dependencies)

/** Escape text for safe insertion into HTML */
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Return the URL only if it is a plain http(s) link (blocks javascript:, data:, vbscript: … — stored XSS) */
export function safeUrl(v) {
  const s = String(v ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch { return ''; }
}

/** External link HTML for user-supplied URLs: a real link for http(s), plain text otherwise */
export function extLink(v) {
  const u = safeUrl(v);
  return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow" dir="ltr">${esc(v)}</a>` : `<span dir="ltr">${esc(v)}</span>`;
}

/** Convert Arabic-Indic / Persian digits to Latin digits */
export function toLatinDigits(s) {
  return String(s ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Normalise an IMEI / serial for storage & comparison */
export function normalizeId(v) {
  return toLatinDigits(v).replace(/[\s\-_/.]/g, '').toUpperCase();
}

/** Luhn checksum (used by IMEI) */
export function luhnValid(num) {
  if (!/^\d+$/.test(num)) return false;
  let sum = 0, dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = num.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Validate an IMEI: 15 digits + Luhn. Returns {ok, value, msg} */
export function validateImei(v) {
  const d = normalizeId(v);
  if (!d) return { ok: false, value: d, msg: 'رقم IMEI مطلوب' };
  if (!/^\d+$/.test(d)) return { ok: false, value: d, msg: 'رقم IMEI يجب أن يحتوي على أرقام فقط' };
  if (d.length !== 15) return { ok: false, value: d, msg: `رقم IMEI يجب أن يكون 15 رقماً (أدخلت ${d.length})` };
  if (!luhnValid(d)) return { ok: false, value: d, msg: 'رقم IMEI غير صحيح (فشل التحقق من رقم المراجعة Luhn). راجع الرقم على العلبة أو اطلب ‎*#06#‎' };
  return { ok: true, value: d, msg: '' };
}

/** Egyptian mobile number check (01x + 8 digits) */
export function validateEgPhone(v) {
  const d = toLatinDigits(v).replace(/[\s\-+]/g, '').replace(/^20(?=1)/, '0').replace(/^0020(?=1)/, '0');
  return { ok: /^01[0125]\d{8}$/.test(d), value: d };
}

export function validateEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
}

export function uid(prefix = 'id') {
  const rnd = (crypto.getRandomValues ? Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(16).slice(2, 12));
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

const dtf = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
const df = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' });
export const fmtDateTime = (t) => (t ? dtf.format(new Date(t)) : '—');
export const fmtDate = (t) => (t ? df.format(new Date(t)) : '—');

/** Mask an identifier for display: 3569••••••3809 */
export function maskId(v) {
  const s = String(v || '');
  if (s.length <= 6) return s;
  return s.slice(0, 4) + '•'.repeat(Math.max(0, s.length - 8)) + s.slice(-4);
}

/* ---------------- Hashing (SHA-256) ---------------- */
function hex(buf) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Pure-JS SHA-256 fallback (only used when crypto.subtle is unavailable, e.g. plain-http LAN testing) */
function sha256Fallback(ascii) {
  const bytes = new TextEncoder().encode(ascii);
  const rrot = (v, n) => (v >>> n) | (v << (32 - n));
  const K = [], H = [];
  let n = 2, c = 0;
  const isPrime = (x) => { for (let i = 2; i * i <= x; i++) if (x % i === 0) return false; return true; };
  while (c < 64) {
    if (isPrime(n)) {
      if (c < 8) H[c] = (Math.pow(n, 1 / 2) * 4294967296) | 0;
      K[c] = (Math.pow(n, 1 / 3) * 4294967296) | 0;
      c++;
    }
    n++;
  }
  const len = bytes.length;
  const withPad = ((len + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(withPad);
  m.set(bytes); m[len] = 0x80;
  const bitLen = len * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(withPad - 4, bitLen >>> 0);
  dv.setUint32(withPad - 8, Math.floor(bitLen / 4294967296));
  const w = new Int32Array(64);
  for (let off = 0; off < withPad; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rrot(w[i - 15], 7) ^ rrot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rrot(w[i - 2], 17) ^ rrot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, cc, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22);
      const maj = (a & b) ^ (a & cc) ^ (b & cc);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = cc; cc = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + cc) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/** SHA-256 hex digest. PROTOTYPE ONLY — real apps must hash passwords server-side (bcrypt/argon2). */
export async function sha256(text) {
  if (globalThis.crypto && crypto.subtle && globalThis.isSecureContext !== false) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return hex(buf);
  }
  return sha256Fallback(text);
}
export const _sha256Fallback = sha256Fallback;

/* ---------------- Images ---------------- */
/** Read an image File, downscale it and return a JPEG data URL */
export function imageFileToDataURL(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!file.type.startsWith('image/')) return reject(new Error('الملف ليس صورة'));
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('تعذر قراءة الصورة'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function debounce(fn, ms = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const GOVERNORATES = ['القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية', 'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد', 'مطروح', 'شمال سيناء', 'جنوب سيناء'];

export const BRANDS = ['Samsung', 'Apple iPhone', 'Xiaomi', 'Redmi', 'Oppo', 'Realme', 'Vivo', 'Huawei', 'Honor', 'Infinix', 'Tecno', 'Nokia', 'Motorola', 'OnePlus', 'Google Pixel', 'أخرى'];

export const STATUS = {
  stolen: { label: 'مسروق', cls: 'danger' },
  lost: { label: 'مفقود', cls: 'warn' },
  found: { label: 'تم العثور عليه', cls: 'info' },
  delivered: { label: 'تم التسليم', cls: 'ok' },
  dispute: { label: 'نزاع', cls: 'purple' },
};
export const ACTIVE_STATUSES = ['stolen', 'lost', 'dispute'];

export const ROLE_LABEL = { owner: 'مالك هاتف', technician: 'فني صيانة', admin: 'الدعم الفني', guest: 'زائر', system: 'النظام' };
export const TECH_STATUS = {
  pending: { label: 'قيد المراجعة', cls: 'warn' },
  approved: { label: 'موثّق', cls: 'ok' },
  rejected: { label: 'مرفوض', cls: 'danger' },
  suspended: { label: 'موقوف', cls: 'danger' },
};
export const DISPUTE_STATUS = {
  open: { label: 'مفتوح', cls: 'danger' },
  reviewing: { label: 'قيد المراجعة', cls: 'warn' },
  resolved: { label: 'تم الحل', cls: 'ok' },
  rejected: { label: 'مرفوض', cls: 'muted' },
};
export const HANDOVER_STATUS = {
  pending_owner: { label: 'بانتظار تأكيد المالك', cls: 'warn' },
  confirmed: { label: 'أكد المالك الاستلام', cls: 'ok' },
  disputed: { label: 'اعترض المالك (نزاع)', cls: 'danger' },
};
