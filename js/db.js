/**
 * طبقة البيانات — Data layer
 * ----------------------------------------------------------------------------
 * PROTOTYPE: everything is stored on THIS device only.
 *   - JSON records  -> localStorage (key prefix "laqeeto.v1.")
 *   - Images/files  -> IndexedDB ("laqeeto-files"), falls back to localStorage
 *
 * The rest of the app ONLY talks to the exported `db` object and every method
 * is async (returns a Promise). To move to Firebase / Supabase later, write a
 * new module that exports the same methods (same names, same shapes) and change
 * the import in the views. Security rules (who may read/write what) must then
 * be enforced on the server — the role checks here are for UX only.
 * ----------------------------------------------------------------------------
 */
import { uid, sha256, normalizeId, ACTIVE_STATUSES, ROLE_LABEL } from './utils.js';

const NS = 'laqeeto.v1.';
const COLLECTIONS = ['users', 'reports', 'conversations', 'messages', 'handovers', 'disputes', 'audit'];
const now = () => Date.now();

/* ---------------- low-level storage ---------------- */
const store = {
  all(col) {
    try { return JSON.parse(localStorage.getItem(NS + col) || '[]'); } catch { return []; }
  },
  save(col, arr) { localStorage.setItem(NS + col, JSON.stringify(arr)); },
  get(col, id) { return this.all(col).find((r) => r.id === id) || null; },
  insert(col, rec) { const a = this.all(col); a.push(rec); this.save(col, a); return rec; },
  update(col, id, patch) {
    const a = this.all(col);
    const i = a.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('السجل غير موجود');
    a[i] = typeof patch === 'function' ? patch(structuredClone(a[i])) : { ...a[i], ...patch };
    this.save(col, a);
    return a[i];
  },
};

/* ---------------- files (IndexedDB) ---------------- */
let idbPromise = null;
function idb() {
  if (!idbPromise) {
    idbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) return reject(new Error('no idb'));
      const req = indexedDB.open('laqeeto-files', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => { idbPromise = null; throw e; });
  }
  return idbPromise;
}
function idbOp(mode, fn) {
  return idb().then((d) => new Promise((resolve, reject) => {
    const tx = d.transaction('files', mode);
    const r = fn(tx.objectStore('files'));
    tx.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    tx.onerror = () => reject(tx.error);
  }));
}
const files = {
  async put(dataUrl) {
    if (!dataUrl) return null;
    const id = uid('file');
    try { await idbOp('readwrite', (s) => s.put(dataUrl, id)); } catch { localStorage.setItem(NS + 'file.' + id, dataUrl); }
    return id;
  },
  async get(id) {
    if (!id) return null;
    try {
      const v = await idbOp('readonly', (s) => s.get(id));
      if (v) return v;
    } catch { /* fall through */ }
    return localStorage.getItem(NS + 'file.' + id);
  },
  async clear() {
    try { await idbOp('readwrite', (s) => s.clear()); } catch { /* ignore */ }
    Object.keys(localStorage).filter((k) => k.startsWith(NS + 'file.')).forEach((k) => localStorage.removeItem(k));
  },
};

/* ---------------- session ---------------- */
const SESSION_KEY = NS + 'session';
function sessionUserId() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.userId || null; } catch { return null; }
}
function currentUserSync() {
  const id = sessionUserId();
  return id ? store.get('users', id) : null;
}
function requireUser(roles) {
  const u = currentUserSync();
  if (!u) throw new Error('يجب تسجيل الدخول أولاً');
  if (roles && !roles.includes(u.role)) throw new Error('ليست لديك صلاحية لهذا الإجراء');
  return u;
}
function requireApprovedTech() {
  const u = requireUser(['technician']);
  if (u.tech?.status !== 'approved') throw new Error('حساب الفني غير مفعّل بعد');
  return u;
}
async function hashPassword(password, salt) { return sha256(`${salt}:${password}`); }
const publicUser = (u) => {
  if (!u) return null;
  const { passwordHash, salt, ...rest } = u;
  return rest;
};

/* ---------------- audit ---------------- */
function audit(action, details = '', actor = currentUserSync(), meta = {}) {
  store.insert('audit', {
    id: uid('log'), at: now(), action, details,
    actorId: actor?.id || 'system', actorName: actor?.name || 'النظام', actorRole: actor?.role || 'system', ...meta,
  });
}

/* ---------------- helpers ---------------- */
function pushHistory(r, status, by, note = '') {
  r.history = r.history || [];
  r.history.push({ status, at: now(), by: by?.id || 'system', byName: by?.name || 'النظام', note });
}
function reportLabel(r) { return r ? `${r.brand} ${r.model}` : ''; }

/** Public (sanitised) view of a report — the ONLY shape exposed to anonymous users */
function publicReportView(r) {
  const c = r.contact || {};
  const publicContact = {};
  if (c.phone?.public && c.phone.value) publicContact.phone = c.phone.value;
  if (c.email?.public && c.email.value) publicContact.email = c.email.value;
  const socials = (c.socials || []).filter((s) => s.public && s.value).map((s) => s.value);
  if (socials.length) publicContact.socials = socials;
  return {
    id: r.id, brand: r.brand, model: r.model, color: r.color, type: r.type, status: r.status,
    active: ACTIVE_STATUSES.includes(r.status), reportedAt: r.createdAt, governorate: r.governorate || '',
    ownerId: r.ownerId, publicContact,
  };
}

function ensureConversation(report, otherUser) {
  const convs = store.all('conversations');
  let conv = convs.find((c) => c.reportId === report.id && c.participants.includes(report.ownerId) && c.participants.includes(otherUser.id));
  if (!conv) {
    conv = store.insert('conversations', {
      id: uid('conv'), reportId: report.id, participants: [report.ownerId, otherUser.id],
      createdAt: now(), updatedAt: now(), lastText: '',
    });
  }
  return conv;
}
function addMessage(conv, from, text, kind = 'text', data = null) {
  const msg = store.insert('messages', {
    id: uid('msg'), conversationId: conv.id, fromId: from?.id || 'system', fromName: from?.name || 'النظام',
    fromRole: from?.role || 'system', text, kind, data, createdAt: now(), readBy: from ? [from.id] : [],
  });
  store.update('conversations', conv.id, { updatedAt: now(), lastText: text.slice(0, 120) });
  return msg;
}

/* ============================================================================
 *  PUBLIC API
 * ==========================================================================*/
export const db = {
  files,

  /* ---------- lifecycle ---------- */
  isSeeded() { return localStorage.getItem(NS + 'seeded') === '1'; },
  async init() {
    if (!this.isSeeded()) {
      const { seed } = await import('./seed.js');
      await seed(this, { store, hashPassword, uid, audit });
      localStorage.setItem(NS + 'seeded', '1');
    }
  },
  async resetDemo() {
    COLLECTIONS.forEach((c) => localStorage.removeItem(NS + c));
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(NS + 'seeded');
    await files.clear();
    await this.init();
  },

  /* ---------- auth ---------- */
  async currentUser() { return publicUser(currentUserSync()); },
  async signUp({ role = 'owner', name, email, phone, password, tech = null }) {
    if (!['owner', 'technician'].includes(role)) throw new Error('نوع حساب غير مسموح');
    email = String(email || '').trim().toLowerCase();
    if (store.all('users').some((u) => u.email === email)) throw new Error('هذا البريد مسجل بالفعل، سجّل الدخول بدلاً من ذلك');
    const salt = uid('salt');
    const user = {
      id: uid('usr'), role, name: String(name).trim(), email, phone: phone || '',
      salt, passwordHash: await hashPassword(password, salt), createdAt: now(),
    };
    if (role === 'technician') {
      user.tech = {
        shopName: tech.shopName, address: tech.address, governorate: tech.governorate,
        deviceImei: tech.deviceImei || '',
        idPhoto: await files.put(tech.idPhoto),
        selfie: await files.put(tech.selfie),
        selfieMethod: tech.selfieMethod || 'live-camera',
        deviceShot: await files.put(tech.deviceShot),
        status: 'pending', faceMatch: 'simulated-pending', submittedAt: now(),
      };
    }
    store.insert('users', user);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
    audit(role === 'technician' ? 'تسجيل فني جديد (بانتظار التحقق)' : 'إنشاء حساب مالك', user.email, user);
    return publicUser(user);
  },
  async login(email, password) {
    email = String(email || '').trim().toLowerCase();
    const u = store.all('users').find((x) => x.email === email && x.role !== 'guest');
    if (!u || (await hashPassword(password, u.salt)) !== u.passwordHash) throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: u.id }));
    audit('تسجيل دخول', ROLE_LABEL[u.role], u);
    return publicUser(u);
  },
  /** Quick guest identity for finders: name + phone, no password */
  async guestLogin({ name, phone }) {
    let u = store.all('users').find((x) => x.role === 'guest' && x.phone === phone);
    if (!u) {
      u = store.insert('users', { id: uid('gst'), role: 'guest', name: String(name).trim(), phone, email: '', createdAt: now() });
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: u.id }));
    audit('دخول كضيف', phone, u);
    return publicUser(u);
  },
  async logout() { localStorage.removeItem(SESSION_KEY); },
  async getUser(id) { return publicUser(store.get('users', id)); },

  /* ---------- reports ---------- */
  async createReport(data) {
    const u = requireUser(['owner']);
    const imei1 = normalizeId(data.imei1);
    const ids = [imei1, normalizeId(data.imei2), normalizeId(data.serial)].filter(Boolean);
    const clash = store.all('reports').find((r) => ACTIVE_STATUSES.includes(r.status) &&
      [r.imei1, r.imei2, r.serial].filter(Boolean).some((x) => ids.includes(x)));
    if (clash) {
      audit('محاولة بلاغ مكرر', `IMEI/Serial مسجل في بلاغ نشط ${clash.id}`, u);
      throw new Error('يوجد بلاغ نشط بالفعل لهذا الرقم. إذا كان الهاتف ملكك فعلاً افتح نزاعاً أو تواصل مع الدعم الفني.');
    }
    const r = {
      id: uid('rep'), ownerId: u.id, type: data.type === 'lost' ? 'lost' : 'stolen',
      status: data.type === 'lost' ? 'lost' : 'stolen',
      brand: data.brand, model: data.model, color: data.color,
      imei1, imei2: normalizeId(data.imei2), serial: normalizeId(data.serial),
      incidentDate: data.incidentDate || '', governorate: data.governorate || '', place: data.place || '', description: data.description || '',
      boxPhoto: await files.put(data.boxPhoto), invoicePhoto: await files.put(data.invoicePhoto),
      policeNumber: data.policeNumber || '', policePhoto: await files.put(data.policePhoto),
      contact: data.contact, createdAt: now(), updatedAt: now(), history: [],
    };
    pushHistory(r, r.status, u, 'إنشاء البلاغ');
    store.insert('reports', r);
    audit('إنشاء بلاغ', `${reportLabel(r)} — IMEI ${imei1}`, u, { reportId: r.id });
    return r;
  },
  async getReport(id) {
    const u = currentUserSync();
    const r = store.get('reports', id);
    if (!r) return null;
    if (u && (u.role === 'admin' || u.id === r.ownerId)) return r; // full view
    return publicReportView(r);
  },
  async listMyReports() {
    const u = requireUser(['owner']);
    return store.all('reports').filter((r) => r.ownerId === u.id).sort((a, b) => b.createdAt - a.createdAt);
  },
  async listAllReports() {
    requireUser(['admin']);
    return store.all('reports').sort((a, b) => b.createdAt - a.createdAt);
  },
  /** Public search by IMEI or serial. Returns sanitised views only. */
  async searchReports(query, { asTechnician = false } = {}) {
    const q = normalizeId(query);
    if (q.length < 5) return [];
    const res = store.all('reports').filter((r) => [r.imei1, r.imei2, r.serial].filter(Boolean).includes(q))
      .sort((a, b) => Number(ACTIVE_STATUSES.includes(b.status)) - Number(ACTIVE_STATUSES.includes(a.status)) || b.createdAt - a.createdAt);
    if (asTechnician) {
      const t = requireApprovedTech();
      audit('فحص IMEI/Serial بواسطة فني', `${q} → ${res.some((r) => ACTIVE_STATUSES.includes(r.status)) ? 'مبلغ عنه' : 'غير مبلغ عنه'}`, t);
    }
    const me = currentUserSync();
    return res.map((r) => ({ ...publicReportView(r), isMine: !!me && me.id === r.ownerId }));
  },
  async setReportStatus(id, status, note = '') {
    const u = requireUser(['owner', 'admin']);
    const r = store.get('reports', id);
    if (!r) throw new Error('البلاغ غير موجود');
    if (u.role === 'owner') {
      if (r.ownerId !== u.id) throw new Error('ليست لديك صلاحية');
      if (!['found', 'stolen', 'lost'].includes(status)) throw new Error('لا يمكن للمالك تعيين هذه الحالة');
    }
    const upd = store.update('reports', id, (x) => { x.status = status; x.updatedAt = now(); pushHistory(x, status, u, note); return x; });
    audit('تغيير حالة بلاغ', `${reportLabel(r)}: ${r.status} → ${status}${note ? ' — ' + note : ''}`, u, { reportId: id });
    return upd;
  },
  async updateReportContact(id, contact) {
    const u = requireUser(['owner']);
    const r = store.get('reports', id);
    if (!r || r.ownerId !== u.id) throw new Error('ليست لديك صلاحية');
    audit('تعديل خصوصية بيانات التواصل', reportLabel(r), u, { reportId: id });
    return store.update('reports', id, { contact, updatedAt: now() });
  },

  /* ---------- messaging ---------- */
  async sendMessageToOwner(reportId, text) {
    const u = requireUser(['owner', 'technician', 'guest', 'admin']);
    const r = store.get('reports', reportId);
    if (!r) throw new Error('البلاغ غير موجود');
    if (r.ownerId === u.id) throw new Error('هذا بلاغك أنت');
    if (u.role === 'technician' && u.tech?.status !== 'approved') throw new Error('حساب الفني غير مفعّل بعد');
    const conv = ensureConversation(r, u);
    addMessage(conv, u, text);
    audit('رسالة إلى مالك بلاغ', reportLabel(r), u, { reportId });
    return conv;
  },
  async reply(conversationId, text, kind = 'text', data = null) {
    const u = requireUser();
    const conv = store.get('conversations', conversationId);
    if (!conv || !conv.participants.includes(u.id)) throw new Error('المحادثة غير موجودة');
    return addMessage(conv, u, text, kind, data);
  },
  async listConversations() {
    const u = requireUser();
    const msgs = store.all('messages');
    return store.all('conversations').filter((c) => c.participants.includes(u.id))
      .map((c) => {
        const otherId = c.participants.find((p) => p !== u.id);
        const other = store.get('users', otherId);
        const report = store.get('reports', c.reportId);
        const unread = msgs.filter((m) => m.conversationId === c.id && !m.readBy.includes(u.id)).length;
        return { ...c, other: publicUser(other), report: report ? publicReportView(report) : null, unread };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async getConversation(id) {
    const u = requireUser();
    const c = store.get('conversations', id);
    if (!c || !c.participants.includes(u.id)) return null;
    // mark as read
    const all = store.all('messages');
    all.forEach((m) => { if (m.conversationId === id && !m.readBy.includes(u.id)) m.readBy.push(u.id); });
    store.save('messages', all);
    const other = store.get('users', c.participants.find((p) => p !== u.id));
    const report = store.get('reports', c.reportId);
    return {
      ...c, other: publicUser(other), report: report ? publicReportView(report) : null,
      messages: all.filter((m) => m.conversationId === id).sort((a, b) => a.createdAt - b.createdAt),
    };
  },
  async unreadCount() {
    const u = currentUserSync();
    if (!u) return 0;
    const convIds = new Set(store.all('conversations').filter((c) => c.participants.includes(u.id)).map((c) => c.id));
    return store.all('messages').filter((m) => convIds.has(m.conversationId) && !m.readBy.includes(u.id)).length;
  },
  /** Owner chooses to reveal selected contact details inside a conversation */
  async shareContact(conversationId, fields) {
    const u = requireUser(['owner']);
    const conv = store.get('conversations', conversationId);
    if (!conv || !conv.participants.includes(u.id)) throw new Error('المحادثة غير موجودة');
    const r = store.get('reports', conv.reportId);
    const c = r?.contact || {};
    const shared = {};
    if (fields.phone && c.phone?.value) shared.phone = c.phone.value;
    if (fields.email && c.email?.value) shared.email = c.email.value;
    if (fields.socials) shared.socials = (c.socials || []).map((s) => s.value).filter(Boolean);
    if (!Object.keys(shared).length) throw new Error('لا توجد بيانات مختارة للمشاركة');
    audit('مشاركة بيانات التواصل في محادثة', Object.keys(shared).join(', '), u, { reportId: r?.id });
    return addMessage(conv, u, 'شارك المالك بيانات التواصل معك', 'contact', shared);
  },

  /* ---------- technicians ---------- */
  async listTechnicians(status = null) {
    requireUser(['admin']);
    return store.all('users').filter((u) => u.role === 'technician' && (!status || u.tech?.status === status))
      .map(publicUser).sort((a, b) => (b.tech?.submittedAt || 0) - (a.tech?.submittedAt || 0));
  },
  async reviewTechnician(userId, decision, note = '') {
    const admin = requireUser(['admin']);
    const map = { approve: 'approved', reject: 'rejected', suspend: 'suspended', reactivate: 'approved' };
    const status = map[decision];
    if (!status) throw new Error('إجراء غير معروف');
    const t = store.update('users', userId, (u) => {
      u.tech.status = status; u.tech.reviewedBy = admin.id; u.tech.reviewedByName = admin.name;
      u.tech.reviewedAt = now(); u.tech.reviewNote = note; return u;
    });
    const labels = { approve: 'اعتماد فني', reject: 'رفض فني', suspend: 'إيقاف فني', reactivate: 'إعادة تفعيل فني' };
    audit(labels[decision], `${t.name} — ${t.tech.shopName}${note ? ' — ' + note : ''}`, admin, { targetUserId: userId });
    return publicUser(t);
  },

  /* ---------- handovers ---------- */
  async createHandover(reportId, { checklist, deviceImei, ownerIdPhoto, selfie, notes }) {
    const t = requireApprovedTech();
    const r = store.get('reports', reportId);
    if (!r) throw new Error('البلاغ غير موجود');
    if (!ACTIVE_STATUSES.includes(r.status)) throw new Error('هذا البلاغ ليس نشطاً');
    if (!checklist?.box || !checklist?.imeiMatch || !checklist?.unlocked) throw new Error('يجب استيفاء كل بنود قائمة التحقق');
    const d = normalizeId(deviceImei);
    if (![r.imei1, r.imei2].filter(Boolean).includes(d)) throw new Error('رقم IMEI الظاهر على الجهاز لا يطابق البلاغ — لا تسلّم الهاتف');
    if (!ownerIdPhoto || !selfie) throw new Error('صورة بطاقة المالك وصورة التسليم مطلوبتان');
    const h = store.insert('handovers', {
      id: uid('hnd'), reportId, technicianId: t.id, technicianName: t.name, shopName: t.tech.shopName,
      ownerId: r.ownerId, checklist, deviceImei: d,
      ownerIdPhoto: await files.put(ownerIdPhoto), selfie: await files.put(selfie),
      notes: notes || '', status: 'pending_owner', createdAt: now(),
    });
    const conv = ensureConversation(r, t);
    addMessage(conv, null, `سجّل الفني ${t.name} (${t.tech.shopName}) تسليم هاتفك ${reportLabel(r)}. من فضلك افتح «بلاغاتي» وأكّد الاستلام، أو أبلغ عن مشكلة إذا تعرضت لأي ضغط.`, 'system');
    audit('تسجيل تسليم هاتف', `${reportLabel(r)} — بانتظار تأكيد المالك`, t, { reportId, handoverId: h.id });
    return h;
  },
  async listMyHandovers() {
    const u = requireUser(['technician', 'owner']);
    const key = u.role === 'technician' ? 'technicianId' : 'ownerId';
    return store.all('handovers').filter((h) => h[key] === u.id).sort((a, b) => b.createdAt - a.createdAt)
      .map((h) => ({ ...h, report: store.get('reports', h.reportId) }));
  },
  async listHandoversForReport(reportId) {
    const u = requireUser(['owner', 'admin']);
    return store.all('handovers').filter((h) => h.reportId === reportId && (u.role === 'admin' || h.ownerId === u.id));
  },
  async confirmHandover(handoverId) {
    const u = requireUser(['owner']);
    const h = store.get('handovers', handoverId);
    if (!h || h.ownerId !== u.id) throw new Error('غير مسموح');
    if (h.status !== 'pending_owner') throw new Error('تمت معالجة هذا التسليم بالفعل');
    store.update('handovers', h.id, { status: 'confirmed', confirmedAt: now() });
    store.update('reports', h.reportId, (r) => { r.status = 'delivered'; r.updatedAt = now(); pushHistory(r, 'delivered', u, `أكد المالك الاستلام من ${h.shopName}`); return r; });
    audit('أكد المالك استلام هاتفه', h.shopName, u, { reportId: h.reportId, handoverId });
    return true;
  },

  /* ---------- disputes ---------- */
  async createDispute(data) {
    const u = requireUser(['owner']);
    const r = store.get('reports', data.reportId);
    if (!r || r.ownerId !== u.id) throw new Error('غير مسموح');
    let technicianId = null, handoverId = data.handoverId || null;
    if (handoverId) {
      const h = store.get('handovers', handoverId);
      if (h && h.ownerId === u.id) {
        technicianId = h.technicianId;
        store.update('handovers', h.id, { status: 'disputed', disputedAt: now() });
      } else handoverId = null;
    }
    const d = store.insert('disputes', {
      id: uid('dsp'), reportId: r.id, ownerId: u.id, ownerName: u.name, handoverId, technicianId,
      coercion: !!data.coercion, description: data.description, policeNumber: data.policeNumber || '',
      evidenceFileName: data.evidenceFileName || '', evidenceLink: data.evidenceLink || '', witnesses: data.witnesses || '',
      status: 'open', notes: [], createdAt: now(), updatedAt: now(),
    });
    store.update('reports', r.id, (x) => { x.statusBeforeDispute = x.status === 'dispute' ? x.statusBeforeDispute : x.status; x.status = 'dispute'; x.updatedAt = now(); pushHistory(x, 'dispute', u, data.coercion ? 'بلاغ إكراه/تهديد' : 'فتح نزاع'); return x; });
    audit(data.coercion ? 'نزاع: إبلاغ عن إكراه/تهديد' : 'فتح نزاع', `${reportLabel(r)}${data.policeNumber ? ' — محضر ' + data.policeNumber : ''}`, u, { reportId: r.id, disputeId: d.id });
    return d;
  },
  async listDisputes() {
    const u = requireUser(['owner', 'admin']);
    return store.all('disputes').filter((d) => u.role === 'admin' || d.ownerId === u.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((d) => ({ ...d, report: store.get('reports', d.reportId), technician: publicUser(store.get('users', d.technicianId)) }));
  },
  async addDisputeNote(disputeId, text) {
    const u = requireUser(['admin']);
    const d = store.update('disputes', disputeId, (x) => { x.notes.push({ at: now(), by: u.id, byName: u.name, text }); x.updatedAt = now(); return x; });
    audit('ملاحظة على نزاع', text.slice(0, 80), u, { disputeId });
    return d;
  },
  async setDisputeStatus(disputeId, status) {
    const u = requireUser(['admin']);
    const d = store.update('disputes', disputeId, { status, updatedAt: now() });
    audit('تغيير حالة نزاع', status, u, { disputeId });
    return d;
  },

  /* ---------- audit ---------- */
  async listAudit(limit = 300) {
    requireUser(['admin']);
    return store.all('audit').sort((a, b) => b.at - a.at).slice(0, limit);
  },
  async stats() {
    requireUser(['admin']);
    const reps = store.all('reports');
    return {
      reports: reps.length, active: reps.filter((r) => ACTIVE_STATUSES.includes(r.status)).length,
      delivered: reps.filter((r) => r.status === 'delivered').length,
      pendingTechs: store.all('users').filter((u) => u.role === 'technician' && u.tech?.status === 'pending').length,
      openDisputes: store.all('disputes').filter((d) => ['open', 'reviewing'].includes(d.status)).length,
    };
  },
};

export default db;
