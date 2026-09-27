// لوحة الدعم الفني — support admin dashboard
import db from '../db.js';
import { esc, extLink, fmtDate, fmtDateTime, STATUS, TECH_STATUS, DISPUTE_STATUS, HANDOVER_STATUS, ROLE_LABEL, normalizeId } from '../utils.js';
import { $, $$, go, toast, badge, statusBadge, hydrateImages, fileImg, emptyState, confirmDialog, promptDialog, alertBox } from '../ui.js';
import { icon } from '../icons.js';

const TABS = [
  ['verify', 'طلبات الفنيين'], ['techs', 'الفنيين'], ['reports', 'البلاغات'], ['disputes', 'النزاعات'], ['audit', 'سجل العمليات'],
];

export async function adminView(el, { query }) {
  const tab = query.get('tab') || 'verify';
  const s = await db.stats();
  const counts = { verify: s.pendingTechs, disputes: s.openDisputes };
  el.innerHTML = `<div class="page-head"><div><h2 class="page-title">لوحة الإدارة</h2><div class="muted small">مراجعة الفنيين والبلاغات والنزاعات</div></div></div>
    <div class="stats stats-5">
      <div class="stat"><b>${s.reports}</b><span>كل البلاغات</span></div>
      <div class="stat"><b>${s.active}</b><span>نشطة</span></div>
      <div class="stat"><b>${s.delivered}</b><span>اتسلّمت</span></div>
      <a class="stat" href="#/admin?tab=verify"><b>${s.pendingTechs}</b><span>فنيين مستنيين</span></a>
      <a class="stat" href="#/admin?tab=disputes"><b>${s.openDisputes}</b><span>نزاعات مفتوحة</span></a>
    </div>
    <nav class="tabs" role="tablist">${TABS.map(([k, l]) => `<a role="tab" class="tab ${k === tab ? 'active' : ''}" href="#/admin?tab=${k}" aria-selected="${k === tab}">${l}${counts[k] ? ` <span class="count">${counts[k]}</span>` : ''}</a>`).join('')}</nav>
    <div id="admin-body"></div>`;
  const body = $('#admin-body', el);
  const refresh = () => go('#/admin?tab=' + tab);
  await ({ verify: verifyTab, techs: techsTab, reports: reportsTab, disputes: disputesTab, audit: auditTab }[tab] || verifyTab)(body, refresh, query);
  hydrateImages(body);
}

const FM_TEXT = {
  match: ['ok', 'circle-check', 'السيلفي مطابق للبطاقة'],
  no_match: ['danger', 'circle-x', 'السيلفي مش مطابق للبطاقة، راجع بنفسك'],
  no_face_id: ['warn', 'triangle-alert', 'مفيش وش واضح في صورة البطاقة'],
  no_face_selfie: ['warn', 'triangle-alert', 'مفيش وش واضح في السيلفي'],
  multiple_faces_selfie: ['warn', 'triangle-alert', 'فيه أكتر من شخص في السيلفي'],
  error: ['neutral', 'circle-alert', 'المقارنة التلقائية ما اشتغلتش'],
  pending: ['neutral', 'clock', 'المقارنة التلقائية لسه ما خلصتش'],
};
function faceMatchBox(t) {
  const fm = t.tech.faceMatch;
  const [cls, ic, text] = FM_TEXT[fm?.status] || ['neutral', 'scan-face', 'لسه ما اتعملش مقارنة تلقائية'];
  const score = typeof fm?.score === 'number' ? ` <span class="mono" dir="ltr">${Math.round(fm.score * 100)}%</span>` : '';
  const auto = fm?.auto_approved ? '<div class="xsmall">اتفعّل تلقائياً عشان التطابق واضح.</div>' : '';
  const when = fm?.checked_at ? `<div class="xsmall muted">${fmtDateTime(fm.checked_at)}</div>` : '';
  return `<div class="fm-result" data-testid="facematch-result" data-status="${esc(fm?.status || 'none')}">
    ${alertBox(cls, ic, `<b>${text}</b>${score}${auto}${when}<div class="xsmall muted">المقارنة التلقائية مساعدة بس. بص على الصورتين بنفسك.</div>`)}
    <button class="btn btn-sm btn-ghost" data-rerun-fm="${t.id}">${icon('refresh-cw', { size: 16 })} قارن تاني</button></div>`;
}

function techCard(t, actions) {
  const st = TECH_STATUS[t.tech.status];
  return `<article class="card tech-card" data-testid="tech-card" data-email="${esc(t.email)}">
    <div class="rc-top"><h3>${esc(t.name)}</h3>${badge(st.label, st.cls)}</div>
    <dl class="kv small"><dt>المحل</dt><dd>${esc(t.tech.shopName)}</dd><dt>العنوان</dt><dd>${esc(t.tech.governorate)} — ${esc(t.tech.address)}</dd>
      <dt>الإيميل</dt><dd><span dir="ltr">${esc(t.email)}</span></dd><dt>الموبايل</dt><dd><span dir="ltr">${esc(t.phone)}</span></dd>
      ${t.tech.deviceImei ? `<dt>IMEI موبايله</dt><dd><span dir="ltr" class="mono">${esc(t.tech.deviceImei)}</span></dd>` : ''}
      <dt>تاريخ الطلب</dt><dd>${fmtDateTime(t.tech.submittedAt)}</dd>
      <dt>السيلفي</dt><dd>${t.tech.selfieMethod === 'live-camera' ? 'اتصوّر من الكاميرا مباشرة' : esc(t.tech.selfieMethod || '—')}</dd>
      ${t.tech.reviewedAt ? `<dt>المراجعة</dt><dd>${esc(t.tech.reviewedByName || '')} · ${fmtDateTime(t.tech.reviewedAt)}${t.tech.reviewNote ? ' — ' + esc(t.tech.reviewNote) : ''}</dd>` : ''}
    </dl>
    <div class="side-by-side">
      <figure>${fileImg(t.tech.idPhoto, 'صورة البطاقة')}<figcaption>البطاقة</figcaption></figure>
      <figure>${fileImg(t.tech.selfie, 'السيلفي')}<figcaption>السيلفي</figcaption></figure>
      <figure>${fileImg(t.tech.deviceShot, 'سكرين شوت الـ IMEI')}<figcaption>سكرين شوت الـ IMEI</figcaption></figure>
    </div>
    ${faceMatchBox(t)}
    <div class="btn-row">${actions}</div></article>`;
}
function bindTechActions(root, refresh) {
  $$('[data-tech-act]', root).forEach((b) => b.addEventListener('click', async () => {
    const act = b.dataset.techAct, id = b.dataset.id;
    let note = '';
    if (act === 'reject' || act === 'suspend') {
      note = await promptDialog(act === 'reject' ? 'سبب الرفض' : 'سبب الإيقاف', 'اكتب السبب (الفني هيشوفه)');
      if (note === null) return;
    } else if (!(await confirmDialog(act === 'approve' ? 'تعتمد الفني ده وتفعّل حسابه؟' : 'ترجّع تفعيل الفني ده؟', { okLabel: act === 'approve' ? 'اعتمد' : 'فعّل' }))) return;
    try { await db.reviewTechnician(id, act, note); toast('اتحفظ', 'ok'); refresh(); } catch (e) { toast(e.message, 'error'); }
  }));  $$('[data-rerun-fm]', root).forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true; b.innerHTML = '<span class="spinner"></span> بنقارن…';
    const r = await db.runFaceMatch(b.dataset.rerunFm);
    if (r?.error) toast(FM_ERR[r.error] || FM_ERR.failed, 'error'); else toast('المقارنة خلصت', 'ok');
    refresh();
  }));
}
const FM_ERR = { rate_limited: 'اتعملت مقارنات كتير للفني ده. جرّب بعد ساعة', unavailable: 'المقارنة التلقائية مش متاحة دلوقتي', timeout: 'المقارنة خدت وقت طويل. جرّب تاني', failed: 'المقارنة ما اشتغلتش. جرّب تاني' };
// pending technicians whose automatic check never ran (e.g. they closed the app right after uploading)
async function autoRunMissing(list, refresh) {
  const stale = (t) => !t.tech.faceMatch || (t.tech.faceMatch.status === 'pending' && Date.now() - (t.tech.submittedAt || 0) > 120000);
  let ran = 0;
  for (const t of list.filter(stale).slice(0, 5)) {
    const r = await db.runFaceMatch(t.id);
    if (r?.error === 'unavailable' || r?.error === 'network') break;
    ran++;
  }
  if (ran) refresh();
}

async function verifyTab(body, refresh) {
  const list = await db.listTechnicians('pending');
  body.innerHTML = list.length ? list.map((t) => techCard(t, `
    <button class="btn btn-success" data-tech-act="approve" data-id="${t.id}">${icon('check', { size: 18 })} اعتمد</button>
    <button class="btn btn-danger-outline" data-tech-act="reject" data-id="${t.id}">${icon('x', { size: 18 })} ارفض</button>`)).join('') : emptyState('clipboard-check', 'مفيش طلبات مستنية', { text: 'أي فني جديد يسجّل هيظهر هنا للمراجعة.' });
  if (list.length && !verifyTab.autoRan) { verifyTab.autoRan = true; autoRunMissing(list, refresh); }
  bindTechActions(body, refresh);
}
async function techsTab(body, refresh) {
  const list = await db.listTechnicians();
  body.innerHTML = list.length ? list.map((t) => techCard(t,
    t.tech.status === 'approved' ? `<button class="btn btn-danger-outline" data-tech-act="suspend" data-id="${t.id}">${icon('ban', { size: 18 })} أوقف</button>`
      : t.tech.status === 'pending' ? `<button class="btn btn-success" data-tech-act="approve" data-id="${t.id}">${icon('check', { size: 18 })} اعتمد</button><button class="btn btn-danger-outline" data-tech-act="reject" data-id="${t.id}">${icon('x', { size: 18 })} ارفض</button>`
        : `<button class="btn btn-outline" data-tech-act="reactivate" data-id="${t.id}">${icon('rotate-ccw', { size: 18 })} فعّل تاني</button>`)).join('') : emptyState('wrench', 'مفيش فنيين لسه');
  bindTechActions(body, refresh);
}

async function reportsTab(body, refresh, query) {
  const all = await db.listAllReports();
  const fs = query.get('status') || '';
  const q = normalizeId(query.get('q') || '');
  const list = all.filter((r) => (!fs || r.status === fs) && (!q || [r.imei1, r.imei2, r.serial].includes(q)));
  body.innerHTML = `<form class="filters" id="rep-filter">
      <select name="status"><option value="">كل الحالات</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${fs === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <input name="q" dir="ltr" placeholder="IMEI / Serial" value="${esc(q)}" aria-label="IMEI أو السيريال"><button class="btn btn-outline">${icon('filter', { size: 16 })} فلتر</button></form>
    <div class="table-wrap"><table class="table"><thead><tr><th>الجهاز</th><th>IMEI</th><th>صاحبه</th><th>التاريخ</th><th>الحالة</th><th>تغيير</th></tr></thead><tbody>
    ${list.map((r) => `<tr><td><a href="#/report/${r.id}">${esc(r.brand)} ${esc(r.model)}</a><div class="muted small">${esc(r.color)}</div></td>
      <td dir="ltr" class="mono small">${esc(r.imei1)}</td><td class="small">${esc(r.ownerName || '—')}</td><td class="small">${fmtDate(r.createdAt)}</td><td>${statusBadge(r.status)}</td>
      <td><div class="inline-form"><select data-status-for="${r.id}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select><button class="btn btn-sm btn-primary" data-save-status="${r.id}">احفظ</button></div></td></tr>`).join('') || `<tr><td colspan="6">${emptyState('file-text', all.length ? 'مفيش نتايج' : 'مفيش بلاغات لسه', { inCard: true })}</td></tr>`}
    </tbody></table></div>`;
  $('#rep-filter', body).addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; go(`#/admin?tab=reports&status=${f.status.value}&q=${encodeURIComponent(f.q.value)}`); });
  $$('[data-save-status]', body).forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.saveStatus; const st = $(`[data-status-for="${id}"]`, body).value;
    const note = await promptDialog('سبب تغيير الحالة', 'ملاحظة (بتتسجل في سجل العمليات)', { required: false, multiline: false });
    if (note === null) return;
    try { await db.setReportStatus(id, st, note || 'تغيير بواسطة الدعم الفني'); toast('الحالة اتغيرت', 'ok'); refresh(); } catch (e) { toast(e.message, 'error'); }
  }));
}

async function disputesTab(body, refresh) {
  const list = await db.listDisputes();
  if (!list.length) { body.innerHTML = emptyState('scale', 'مفيش نزاعات', { text: 'لو صاحب موبايل اشتكى من تسليم، هيظهر هنا.' }); return; }
  const owners = Object.fromEntries(await Promise.all([...new Set(list.map((d) => d.ownerId))].map(async (id) => [id, await db.getUser(id)])));
  body.innerHTML = list.map((d) => `<article class="card dispute-card ${d.coercion ? 'coercion' : ''}" data-testid="dispute-card">
    <div class="rc-top"><h3>${d.coercion ? `<span style="color:var(--bad)">${icon('shield-alert', { size: 18 })} إكراه/تهديد —</span> ` : ''}${esc(d.report?.brand)} ${esc(d.report?.model)}</h3>${badge(DISPUTE_STATUS[d.status].label, DISPUTE_STATUS[d.status].cls)}</div>
    <dl class="kv small">
      <dt>صاحب الموبايل</dt><dd>${esc(owners[d.ownerId]?.name || d.ownerName)} · <span dir="ltr">${esc(owners[d.ownerId]?.phone || '')}</span></dd>
      <dt>IMEI</dt><dd><span dir="ltr" class="mono">${esc(d.report?.imei1)}</span></dd>
      ${d.technician ? `<dt>الفني</dt><dd>${esc(d.technician.name)} — ${esc(d.technician.tech?.shopName)} ${badge(TECH_STATUS[d.technician.tech.status].label, TECH_STATUS[d.technician.tech.status].cls)}</dd>` : ''}
      <dt>التاريخ</dt><dd>${fmtDateTime(d.createdAt)}</dd>
      <dt>الوصف</dt><dd>${esc(d.description)}</dd>
      <dt>رقم المحضر</dt><dd>${esc(d.policeNumber || '—')}</dd>
      <dt>ملف الفيديو</dt><dd>${esc(d.evidenceFileName || '—')}</dd>
      <dt>رابط الدليل</dt><dd>${d.evidenceLink ? extLink(d.evidenceLink) : '—'}</dd>
      <dt>الشهود</dt><dd>${esc(d.witnesses || '—')}</dd>
    </dl>
    <div class="notes">${d.notes.map((n) => `<div class="note"><b>${esc(n.byName)}</b> <span class="muted xsmall">${fmtDateTime(n.at)}</span><div>${esc(n.text)}</div></div>`).join('') || '<div class="muted small">مفيش ملاحظات لسه</div>'}</div>
    <div class="btn-row">
      <select data-dstatus="${d.id}">${Object.entries(DISPUTE_STATUS).map(([k, v]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <button class="btn btn-sm btn-primary" data-dsave="${d.id}">احفظ الحالة</button>
      <button class="btn btn-sm btn-outline" data-dnote="${d.id}">${icon('plus', { size: 16 })} ملاحظة</button>
      ${d.report ? `<a class="btn btn-sm btn-ghost" href="#/report/${d.reportId}">البلاغ</a>` : ''}
      ${d.technician && d.technician.tech.status === 'approved' ? `<button class="btn btn-sm btn-danger-outline" data-suspend="${d.technician.id}">${icon('ban', { size: 16 })} أوقف الفني</button>` : ''}
    </div></article>`).join('');
  $$('[data-dsave]', body).forEach((b) => b.addEventListener('click', async () => {
    try { await db.setDisputeStatus(b.dataset.dsave, $(`[data-dstatus="${b.dataset.dsave}"]`, body).value); toast('اتحفظ', 'ok'); refresh(); } catch (e) { toast(e.message, 'error'); }
  }));
  $$('[data-dnote]', body).forEach((b) => b.addEventListener('click', async () => {
    const t = await promptDialog('ملاحظة جديدة', 'الملاحظة (صاحب الموبايل هيشوفها)'); if (!t) return;
    try { await db.addDisputeNote(b.dataset.dnote, t); toast('الملاحظة اتضافت', 'ok'); refresh(); } catch (e) { toast(e.message, 'error'); }
  }));
  $$('[data-suspend]', body).forEach((b) => b.addEventListener('click', async () => {
    const note = await promptDialog('إيقاف الفني', 'سبب الإيقاف'); if (note === null) return;
    try { await db.reviewTechnician(b.dataset.suspend, 'suspend', note); toast('الفني اتوقف', 'ok'); refresh(); } catch (e) { toast(e.message, 'error'); }
  }));
}

async function auditTab(body) {
  const logs = await db.listAudit();
  if (!logs.length) { body.innerHTML = `<div class="audit">${emptyState('history', 'السجل فاضي')}</div>`; return; }
  body.innerHTML = `<div class="table-wrap"><table class="table audit"><thead><tr><th>الوقت</th><th>مين</th><th>الإجراء</th><th>التفاصيل</th></tr></thead><tbody>
    ${logs.map((l) => `<tr><td class="small nowrap">${fmtDateTime(l.at)}</td><td class="small">${esc(l.actorName)}<div class="muted">${esc(ROLE_LABEL[l.actorRole] || l.actorRole)}</div></td><td><b>${esc(l.action)}</b></td><td class="small">${esc(l.details)}</td></tr>`).join('')}
    </tbody></table></div>`;
}
