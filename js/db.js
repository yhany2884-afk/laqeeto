/**
 * طبقة البيانات — Data layer (Supabase: Postgres + Auth + Storage)
 * ----------------------------------------------------------------------------
 * The views ONLY talk to the exported `db` object. Every method is async and
 * returns the same camelCase shapes the old localStorage prototype returned.
 * Security is enforced on the server (Row Level Security + SECURITY DEFINER
 * RPCs in supabase/schema.sql); checks here are for UX only.
 *
 * Guests (finders without an account) keep their conversation tokens locally
 * (localStorage "laqeeto.guest*") and talk to the owner via rate-limited RPCs.
 * ----------------------------------------------------------------------------
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL } from './config.js';
import { uid as makeId } from './utils.js';

const GUEST_KEY = 'laqeeto.guest';
const GUEST_CONVS_KEY = 'laqeeto.guestConvs';
const PROFILE_KEY = 'laqeeto.profile';
const ts = (v) => (v ? Date.parse(v) : null);

export const isConfigured = () => !!SUPABASE_URL && !/YOUR_/.test(SUPABASE_URL) && !!SUPABASE_ANON_KEY && !/YOUR_/.test(SUPABASE_ANON_KEY);

let sb = null;
function client() {
  if (!sb) {
    if (!isConfigured()) throw new Error('الخدمة مش متاحة دلوقتي');
    if (!window.supabase?.createClient) throw new Error('الخدمة مش متاحة دلوقتي. حاول تاني');
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'laqeeto-auth' },
    });
  }
  return sb;
}

/* ---------------- errors ---------------- */
const AUTH_MESSAGES = [
  [/invalid login credentials/i, 'الإيميل أو كلمة السر مش صح'],
  [/already registered|already been registered|user already exists/i, 'الإيميل ده عليه حساب بالفعل. سجّل دخول'],
  [/email not confirmed/i, 'لسه ما أكدتش الإيميل. افتح رسالة التأكيد الأول'],
  [/password should be at least|weak password/i, 'كلمة السر ضعيفة (٨ حروف على الأقل)'],
  [/rate limit|too many requests|over_request_rate_limit|security purposes/i, 'محاولات كتير. استنى شوية وجرّب تاني'],
  [/invalid.*email|email address .* is invalid/i, 'الإيميل مش صح'],
  [/failed to fetch|networkerror|load failed|fetch failed/i, 'مش قادرين نوصل. اتأكد من النت وحاول تاني'],
  [/jwt expired/i, 'الجلسة خلصت. سجّل دخول تاني'],
  [/permission denied|row-level security|violates row-level/i, 'مش مسموحلك تعمل ده'],
  [/duplicate key value.*reports_one_active_imei1/i, 'يوجد بلاغ نشط بالفعل لهذا الرقم. إذا كان الهاتف ملكك فعلاً افتح نزاعاً أو تواصل مع الدعم الفني.'],
  [/violates check constraint/i, 'فيه بيانات مش مظبوطة. راجع الخانات'],
  [/payload too large|exceeded the maximum allowed size/i, 'الصورة كبيرة قوي'],
];
function toError(error) {
  const msg = error?.message || String(error || 'خطأ غير معروف');
  if (/[\u0600-\u06FF]/.test(msg)) return new Error(msg); // server already speaks Arabic
  for (const [re, ar] of AUTH_MESSAGES) if (re.test(msg)) return new Error(ar);
  console.warn('db error', error);
  return new Error('حصلت مشكلة. حاول تاني');
}
async function run(promise) {
  let res;
  try { res = await promise; } catch (e) { throw toError(e); }
  if (res.error) throw toError(res.error);
  return res.data;
}
const rpc = (fn, args = {}) => run(client().rpc(fn, args));

/* ---------------- mapping (snake_case rows -> app shapes) ---------------- */
function mapUser(p) {
  if (!p) return null;
  return {
    id: p.id, role: p.role, name: p.name, email: p.email, phone: p.phone, createdAt: ts(p.created_at),
    tech: p.role === 'technician' ? {
      shopName: p.tech_shop_name, address: p.tech_address, governorate: p.tech_governorate, deviceImei: p.tech_device_imei,
      idPhoto: p.tech_id_photo, selfie: p.tech_selfie, selfieMethod: p.tech_selfie_method, deviceShot: p.tech_device_shot,
      status: p.tech_status, faceMatch: p.tech_face_match, submittedAt: ts(p.tech_submitted_at),
      reviewedByName: p.tech_reviewed_by_name, reviewedAt: ts(p.tech_reviewed_at), reviewNote: p.tech_review_note,
    } : null,
  };
}
function mapReport(r) {
  if (!r) return null;
  return {
    id: r.id, ownerId: r.owner_id, ownerName: r.owner?.name, ownerPhone: r.owner?.phone, type: r.type, status: r.status,
    brand: r.brand, model: r.model, color: r.color, imei1: r.imei1, imei2: r.imei2 || '', serial: r.serial || '',
    incidentDate: r.incident_date || '', governorate: r.governorate || '', place: r.place || '', description: r.description || '',
    boxPhoto: r.box_photo, invoicePhoto: r.invoice_photo, policeNumber: r.police_number || '', policePhoto: r.police_photo,
    contact: r.contact || {}, createdAt: ts(r.created_at), updatedAt: ts(r.updated_at),
    history: (r.history || []).sort((a, b) => a.id - b.id).map((h) => ({ status: h.status, note: h.note, byName: h.by_name, at: ts(h.at) })),
  };
}
const mapPublic = (r) => ({
  id: r.id, brand: r.brand, model: r.model, color: r.color, type: r.type, status: r.status, active: r.active,
  reportedAt: ts(r.reported_at), governorate: r.governorate || '', publicContact: r.public_contact || {}, isMine: !!r.is_mine,
});
function mapMessage(m) {
  return {
    id: m.id, fromId: m.sender_id || (m.sender_kind === 'guest' ? 'guest' : 'system'), fromName: m.sender_name, fromRole: m.sender_role,
    kind: m.kind, text: m.body, data: m.data, createdAt: ts(m.created_at),
  };
}
function mapConversation(c) {
  return {
    id: c.id, reportId: c.report_id, iAmOwner: c.viewer === 'owner',
    other: { name: c.other_name || (c.other_role === 'guest' ? 'زائر' : 'مستخدم'), role: c.other_role },
    report: c.report ? { ...c.report } : null,
    messages: (c.messages || []).map(mapMessage),
  };
}
function mapHandover(h) {
  return {
    id: h.id, reportId: h.report_id, technicianId: h.technician_id, technicianName: h.technician_name, shopName: h.shop_name,
    ownerId: h.owner_id, checklist: h.checklist, deviceImei: h.device_imei, ownerIdPhoto: h.owner_id_photo, selfie: h.selfie,
    notes: h.notes, status: h.status, createdAt: ts(h.created_at), confirmedAt: ts(h.confirmed_at),
    report: { brand: h.device_brand, model: h.device_model, color: h.device_color },
  };
}
function mapDispute(d) {
  return {
    id: d.id, reportId: d.report_id, ownerId: d.owner_id, ownerName: d.owner_name, handoverId: d.handover_id, technicianId: d.technician_id,
    coercion: d.coercion, description: d.description, policeNumber: d.police_number || '', evidenceFileName: d.evidence_file_name || '',
    evidenceLink: d.evidence_link || '', witnesses: d.witnesses || '', status: d.status, createdAt: ts(d.created_at), updatedAt: ts(d.updated_at),
    notes: (d.notes || []).sort((a, b) => a.id - b.id).map((n) => ({ at: ts(n.created_at), byName: n.author_name, text: n.body })),
    report: d.report || null,
    technician: d.technician ? { id: d.technician.id, name: d.technician.name, tech: { shopName: d.technician.tech_shop_name, status: d.technician.tech_status } } : null,
  };
}

/* ---------------- files (Supabase Storage, private buckets + signed URLs) ---------------- */
const urlCache = new Map();
async function sessionUserId() {
  const { data } = await client().auth.getSession();
  return data.session?.user?.id || null;
}
const files = {
  /** Upload a data URL into `bucket/<uid>/<random>.jpg`; returns the stored reference "bucket/path" */
  async put(dataUrl, bucket = 'report-photos') {
    if (!dataUrl) return null;
    const userId = await sessionUserId();
    if (!userId) throw new Error('يجب تسجيل الدخول لرفع الصور');
    const blob = await (await fetch(dataUrl)).blob();
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${userId}/${(crypto.randomUUID ? crypto.randomUUID() : makeId('f'))}.${ext}`;
    await run(client().storage.from(bucket).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false }));
    return `${bucket}/${path}`;
  },
  /** Signed URL (1h) for a stored reference; null if not allowed / missing */
  async get(ref) {
    if (!ref) return null;
    const hit = urlCache.get(ref);
    if (hit && hit.exp > Date.now()) return hit.url;
    const i = ref.indexOf('/');
    const { data, error } = await client().storage.from(ref.slice(0, i)).createSignedUrl(ref.slice(i + 1), 3600);
    if (error || !data?.signedUrl) return null;
    urlCache.set(ref, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
    return data.signedUrl;
  },
};

/* ---------------- session ---------------- */
let profileCache = null;
let profileAt = 0;
function guestIdentity() {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || 'null'); } catch { return null; }
}
const guestConvs = () => { try { return JSON.parse(localStorage.getItem(GUEST_CONVS_KEY) || '[]'); } catch { return []; } };
const guestToken = (id) => guestConvs().find((c) => c.id === id)?.token;
function guestUser() {
  const g = guestIdentity();
  return g ? { id: 'guest', role: 'guest', name: g.name, phone: g.phone, email: '' } : null;
}
async function isGuestMode() {
  return !(await sessionUserId()) && !!guestIdentity();
}

export const db = {
  files,
  isConfigured,

  async init() {
    if (!isConfigured()) return;
    client().auth.onAuthStateChange((event) => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'TOKEN_REFRESHED'].includes(event)) {
        profileAt = 0;
        setTimeout(() => window.dispatchEvent(new Event('auth-changed')), 0);
      }
    });
    await client().auth.getSession();
  },

  /* ---------- auth ---------- */
  async currentUser({ fresh = false } = {}) {
    if (!isConfigured()) return null;
    const userId = await sessionUserId();
    if (!userId) { profileCache = null; return guestUser(); }
    if (!fresh && profileCache?.id === userId && Date.now() - profileAt < 15000) return profileCache;
    try {
      const row = await run(client().from('profiles').select('*').eq('id', userId).maybeSingle());
      if (!row) return null;
      profileCache = mapUser(row); profileAt = Date.now();
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profileCache));
      return profileCache;
    } catch (e) {
      const cached = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); // offline fallback
      if (cached?.id === userId) return cached;
      throw e;
    }
  },

  /** Sign up. Returns the user, or {needsConfirmation:true} if the project requires e-mail confirmation. */
  async signUp({ role = 'owner', name, email, phone, password, tech = null }) {
    const meta = { name: String(name).trim(), phone: phone || '', role: role === 'technician' ? 'technician' : 'owner' };
    if (tech) Object.assign(meta, { shop_name: tech.shopName, address: tech.address, governorate: tech.governorate, device_imei: tech.deviceImei || '' });
    const data = await run(client().auth.signUp({ email: String(email).trim().toLowerCase(), password, options: { data: meta, emailRedirectTo: SITE_URL } }));
    if (!data.session) return { needsConfirmation: true };
    localStorage.removeItem(GUEST_KEY);
    if (role === 'technician' && tech) await this.submitTechnicianDocuments(tech);
    profileAt = 0;
    return this.currentUser({ fresh: true });
  },
  async submitTechnicianDocuments({ idPhoto, selfie, selfieMethod, deviceShot }) {
    const [a, b, c] = await Promise.all([files.put(idPhoto, 'tech-docs'), files.put(selfie, 'tech-docs'), files.put(deviceShot, 'tech-docs')]);
    await rpc('submit_technician_documents', { p_id_photo: a, p_selfie: b, p_selfie_method: selfieMethod || 'live-camera', p_device_shot: c });
    profileAt = 0;
  },
  async login(email, password) {
    await run(client().auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password }));
    localStorage.removeItem(GUEST_KEY);
    profileAt = 0;
    rpc('log_login').catch(() => {});
    return this.currentUser({ fresh: true });
  },
  /** Finder without an account: name + phone kept on this device only */
  async guestLogin({ name, phone }) {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ name: String(name).trim(), phone }));
    return guestUser();
  },
  async logout() {
    localStorage.removeItem(GUEST_KEY);
    localStorage.removeItem(PROFILE_KEY);
    profileCache = null; urlCache.clear();
    if (isConfigured()) await client().auth.signOut().catch(() => {});
  },
  async getUser(id) {
    return mapUser(await run(client().from('profiles').select('*').eq('id', id).maybeSingle()));
  },

  /* ---------- reports ---------- */
  async createReport(data) {
    const [box, invoice, police] = await Promise.all([files.put(data.boxPhoto), files.put(data.invoicePhoto), files.put(data.policePhoto)]);
    const row = await run(client().from('reports').insert({
      type: data.type === 'lost' ? 'lost' : 'stolen', brand: data.brand, model: data.model, color: data.color,
      imei1: data.imei1, imei2: data.imei2 || null, serial: data.serial || null,
      incident_date: data.incidentDate || null, governorate: data.governorate || null, place: data.place || null,
      description: data.description || null, police_number: data.policeNumber || null,
      box_photo: box, invoice_photo: invoice, police_photo: police, contact: data.contact || {},
    }).select('*').single());
    return mapReport(row);
  },
  /** Full report for its owner / admins, otherwise the public (sanitised) view */
  async getReport(id) {
    if (await sessionUserId()) {
      const row = await run(client().from('reports').select('*, history:report_history(*)').eq('id', id).maybeSingle());
      if (row) return mapReport(row);
    }
    const rows = await rpc('get_report_public', { p_id: id });
    return rows?.[0] ? mapPublic(rows[0]) : null;
  },
  async listMyReports() {
    const userId = await sessionUserId();
    return (await run(client().from('reports').select('*').eq('owner_id', userId).order('created_at', { ascending: false }))).map(mapReport);
  },
  async listAllReports() {
    return (await run(client().from('reports').select('*, owner:profiles!reports_owner_id_fkey(name, phone)').order('created_at', { ascending: false }).limit(500))).map(mapReport);
  },
  async searchReports(query, { asTechnician = false } = {}) {
    const rows = await rpc(asTechnician ? 'technician_check' : 'search_reports', { q: String(query || '') });
    return (rows || []).map(mapPublic);
  },
  async setReportStatus(id, status, note = '') { await rpc('set_report_status', { p_report: id, p_status: status, p_note: note || '' }); },
  async updateReportContact(id, contact) {
    await run(client().from('reports').update({ contact }).eq('id', id));
  },

  /* ---------- messaging ---------- */
  async sendMessageToOwner(reportId, text) {
    if (await isGuestMode()) {
      const g = guestIdentity();
      const res = await rpc('guest_message_owner', { p_report: reportId, p_name: g.name, p_phone: g.phone, p_body: text });
      const list = guestConvs();
      list.unshift({ id: res.conversation_id, token: res.token, reportId, createdAt: Date.now() });
      localStorage.setItem(GUEST_CONVS_KEY, JSON.stringify(list.slice(0, 50)));
      return { id: res.conversation_id };
    }
    return { id: await rpc('message_owner', { p_report: reportId, p_body: text }) };
  },
  async reply(conversationId, text) {
    if (await isGuestMode()) {
      return mapMessage(await rpc('guest_send_message', { p_conv: conversationId, p_token: guestToken(conversationId) || '', p_body: text }));
    }
    return mapMessage(await rpc('send_message', { p_conv: conversationId, p_body: text }));
  },
  async listConversations() {
    if (await isGuestMode()) {
      const out = [];
      for (const c of guestConvs()) {
        try {
          const j = await rpc('guest_get_conversation', { p_conv: c.id, p_token: c.token, p_mark: false });
          out.push({ id: c.id, other: { name: j.other_name, role: 'owner' }, report: j.report, lastText: j.last_text, updatedAt: ts(j.updated_at), unread: j.unread || 0 });
        } catch { /* expired / deleted */ }
      }
      return out.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return (await rpc('list_my_conversations')).map((c) => ({
      id: c.id, reportId: c.report_id, updatedAt: ts(c.updated_at), lastText: c.last_text, unread: c.unread, iAmOwner: c.i_am_owner,
      other: { name: c.other_name || 'زائر', role: c.other_role }, report: { brand: c.report_brand, model: c.report_model, status: c.report_status },
    }));
  },
  async getConversation(id) {
    if (await isGuestMode()) {
      const token = guestToken(id);
      if (!token) return null;
      const j = await rpc('guest_get_conversation', { p_conv: id, p_token: token, p_mark: true });
      return j ? mapConversation(j) : null;
    }
    const j = await rpc('get_conversation', { p_conv: id });
    return j ? mapConversation(j) : null;
  },
  async unreadCount() {
    if (!isConfigured()) return 0;
    try {
      if (await sessionUserId()) return await rpc('unread_count');
      const list = guestConvs();
      if (!guestIdentity() || !list.length) return 0;
      return await rpc('guest_unread', { p_convs: list.map((c) => ({ id: c.id, token: c.token })) });
    } catch { return 0; }
  },
  async shareContact(conversationId, fields) {
    return mapMessage(await rpc('share_contact', { p_conv: conversationId, p_phone: !!fields.phone, p_email: !!fields.email, p_socials: !!fields.socials }));
  },

  /* ---------- technicians ---------- */
  async listTechnicians(status = null) {
    let qb = client().from('profiles').select('*').eq('role', 'technician');
    if (status) qb = qb.eq('tech_status', status);
    return (await run(qb.order('tech_submitted_at', { ascending: false, nullsFirst: false }))).map(mapUser);
  },
  async reviewTechnician(userId, decision, note = '') { await rpc('admin_review_technician', { p_user: userId, p_decision: decision, p_note: note || '' }); },

  /* ---------- handovers ---------- */
  async createHandover(reportId, { checklist, deviceImei, ownerIdPhoto, selfie, notes }) {
    await rpc('handover_precheck', { p_report: reportId, p_device_imei: deviceImei }); // validate before uploading photos
    const [a, b] = await Promise.all([files.put(ownerIdPhoto, 'handover-photos'), files.put(selfie, 'handover-photos')]);
    const id = await rpc('create_handover', { p_report: reportId, p_checklist: checklist, p_device_imei: deviceImei, p_owner_id_photo: a, p_selfie: b, p_notes: notes || '' });
    return { id };
  },
  async listMyHandovers() {
    const u = await this.currentUser();
    const col = u?.role === 'technician' ? 'technician_id' : 'owner_id';
    return (await run(client().from('handovers').select('*').eq(col, u.id).order('created_at', { ascending: false }))).map(mapHandover);
  },
  async listHandoversForReport(reportId) {
    return (await run(client().from('handovers').select('*').eq('report_id', reportId).order('created_at', { ascending: false }))).map(mapHandover);
  },
  async confirmHandover(handoverId) { await rpc('confirm_handover', { p_handover: handoverId }); return true; },

  /* ---------- disputes ---------- */
  async createDispute(d) {
    return { id: await rpc('create_dispute', {
      p_report: d.reportId, p_handover: d.handoverId || null, p_coercion: !!d.coercion, p_description: d.description,
      p_police_number: d.policeNumber || '', p_evidence_file_name: d.evidenceFileName || '', p_evidence_link: d.evidenceLink || '', p_witnesses: d.witnesses || '',
    }) };
  },
  async listDisputes() {
    const rows = await run(client().from('disputes')
      .select('*, notes:dispute_notes(*), report:reports(brand, model, imei1), technician:profiles!disputes_technician_id_fkey(id, name, tech_shop_name, tech_status)')
      .order('created_at', { ascending: false }));
    return rows.map(mapDispute);
  },
  async addDisputeNote(disputeId, text) { await rpc('admin_add_dispute_note', { p_dispute: disputeId, p_body: text }); },
  async setDisputeStatus(disputeId, status) { await rpc('admin_set_dispute_status', { p_dispute: disputeId, p_status: status }); },

  /* ---------- admin ---------- */
  async listAudit(limit = 300) {
    return (await run(client().from('audit_log').select('*').order('at', { ascending: false }).limit(limit)))
      .map((l) => ({ id: l.id, at: ts(l.at), actorName: l.actor_name, actorRole: l.actor_role, action: l.action, details: l.details }));
  },
  async stats() { return rpc('admin_stats'); },
  /** Selfie ↔ ID comparison (Edge Function "face-match"). Technicians: own documents; admins: pass a userId.
   *  Resolves to { checked, approved } for technicians, the full result for admins, or { error } — never throws. */
  async runFaceMatch(userId = null, { timeoutMs = 30000 } = {}) {
    try {
      const { data } = await client().auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return { error: 'auth' };
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/face-match`, {
        method: 'POST', signal: ctl.signal,
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(userId ? { user_id: userId } : {}),
      }).finally(() => clearTimeout(t));
      const body = await res.json().catch(() => ({}));
      profileAt = 0;
      if (!res.ok) return { error: res.status === 429 ? 'rate_limited' : res.status === 404 ? 'unavailable' : 'failed', status: res.status };
      return body;
    } catch (e) { return { error: e?.name === 'AbortError' ? 'timeout' : 'network' }; }
  },
};

export default db;
