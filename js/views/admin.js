// لوحة الدعم الفني — support admin dashboard
import db from '../db.js';
import { esc, fmtDate, fmtDateTime, STATUS, TECH_STATUS, DISPUTE_STATUS, HANDOVER_STATUS, ROLE_LABEL, normalizeId } from '../utils.js';
import { $, $$, go, toast, badge, statusBadge, hydrateImages, fileImg, emptyState, confirmDialog, promptDialog } from '../ui.js';

const TABS = [
  ['verify', 'توثيق الفنيين'], ['techs', 'الفنيون'], ['reports', 'البلاغات'], ['disputes', 'النزاعات'], ['audit', 'سجل العمليات'],
];

export async function adminView(el, { query }) {
  const tab = query.get('tab') || 'verify';
  const s = await db.stats();
  const counts = { verify: s.pendingTechs, disputes: s.openDisputes };
  el.innerHTML = `<div class="page-head"><h2 class="page-title">لوحة الدعم الفني</h2></div>
    <div class="stats">
      <div class="stat"><b>${s.reports}</b><span>كل البلاغات</span></div>
      <div class="stat"><b>${s.active}</b><span>نشطة</span></div>
      <div class="stat"><b>${s.delivered}</b><span>تم تسليمها</span></div>
      <div class="stat"><b>${s.pendingTechs}</b><span>فنيون بانتظار التوثيق</span></div>
      <div class="stat"><b>${s.openDisputes}</b><span>نزاعات مفتوحة</span></div>
    </div>
    <nav class="tabs" role="tablist">${TABS.map(([k, l]) => `<a role="tab" class="tab ${k === tab ? 'active' : ''}" href="#/admin?tab=${k}" aria-selected="${k === tab}">${l}${counts[k] ? ` <span class="count">${counts[k]}</span>` : ''}</a>`).join('')}</nav>
    <div id="admin-body"></div>`;
  const body = $('#admin-body', el);
  const refresh = () => go('#/admin?tab=' + tab);
  await ({ verify: verifyTab, techs: techsTab, reports: reportsTab, disputes: disputesTab, audit: auditTab }[tab] || verifyTab)(body, refresh, query);
  hydrateImages(body);
}

function techCard(t, actions) {
  const st = TECH_STATUS[t.tech.status];
  return `<article class="card tech-card" data-testid="tech-card" data-email="${esc(t.email)}">
    <div class="rc-top"><h3>${esc(t.name)}</h3>${badge(st.label, st.cls)}</div>
    <dl class="kv small"><dt>المحل</dt><dd>${esc(t.tech.shopName)}</dd><dt>العنوان</dt><dd>${esc(t.tech.governorate)} — ${esc(t.tech.address)}</dd>
      <dt>البريد</dt><dd dir="ltr">${esc(t.email)}</dd><dt>الموبايل</dt><dd dir="ltr">${esc(t.phone)}</dd>
      ${t.tech.deviceImei ? `<dt>IMEI هاتفه</dt><dd dir="ltr" class="mono">${esc(t.tech.deviceImei)}</dd>` : ''}
      <dt>تاريخ الطلب</dt><dd>${fmtDateTime(t.tech.submittedAt)}</dd>
      <dt>طريقة السيلفي</dt><dd>${t.tech.selfieMethod === 'live-camera' ? 'كاميرا مباشرة ✓' : esc(t.tech.selfieMethod || '—')}</dd>
      ${t.tech.reviewedAt ? `<dt>المراجعة</dt><dd>${esc(t.tech.reviewedByName || '')} · ${fmtDateTime(t.tech.reviewedAt)}${t.tech.reviewNote ? ' — ' + esc(t.tech.reviewNote) : ''}</dd>` : ''}
    </dl>
    <div class="side-by-side">
      <figure>${fileImg(t.tech.idPhoto, 'صورة البطاقة')}<figcaption>البطاقة</figcaption></figure>
      <figure>${fileImg(t.tech.selfie, 'السيلفي المباشر')}<figcaption>السيلفي المباشر</figcaption></figure>
      <figure>${fileImg(t.tech.deviceShot, 'لقطة شاشة الهاتف')}<figcaption>لقطة IMEI</figcaption></figure>
    </div>
    <div class="alert alert-info alert-compact">🧪 مطابقة الوجه مع البطاقة — ستُربط بخدمة تحقق حقيقية لاحقاً. قارن الصورتين يدوياً.</div>
    <div class="btn-row">${actions}</div></article>`;
}
function bindTechActions(root, refresh) {
  $$('[data-tech-act]', root).forEach((b) => b.addEventListener('click', async () => {
    const act = b.dataset.techAct, id = b.dataset.id;
    let note = '';
    if (act === 'reject' || act === 'suspend') {
      note = await promptDialog(act === 'reject' ? 'سبب الرفض' : 'سبب الإيقاف', 'اكتب السبب (يظهر للفني)');
      if (note === null) return;
    } else if (!(await confirmDialog(act === 'approve' ? 'اعتماد هذا الفني وتفعيل حسابه؟' : 'إعادة تفعيل هذا الفني؟'))) return;
    await db.reviewTechnician(id, act, note);
    toast('تم الحفظ ✅', 'ok'); refresh();
  }));
}

async function verifyTab(body, refresh) {
  const list = await db.listTechnicians('pending');
  body.innerHTML = list.length ? list.map((t) => techCard(t, `
    <button class="btn btn-success" data-tech-act="approve" data-id="${t.id}">✅ اعتماد</button>
    <button class="btn btn-danger" data-tech-act="reject" data-id="${t.id}">✖ رفض</button>`)).join('') : emptyState('✅', 'لا توجد طلبات توثيق معلقة');
  bindTechActions(body, refresh);
}
async function techsTab(body, refresh) {
  const list = await db.listTechnicians();
  body.innerHTML = list.length ? list.map((t) => techCard(t,
    t.tech.status === 'approved' ? `<button class="btn btn-danger" data-tech-act="suspend" data-id="${t.id}">⛔ إيقاف</button>`
      : t.tech.status === 'pending' ? `<button class="btn btn-success" data-tech-act="approve" data-id="${t.id}">✅ اعتماد</button><button class="btn btn-danger" data-tech-act="reject" data-id="${t.id}">✖ رفض</button>`
        : `<button class="btn btn-outline" data-tech-act="reactivate" data-id="${t.id}">↺ إعادة تفعيل</button>`)).join('') : emptyState('🛠️', 'لا يوجد فنيون');
  bindTechActions(body, refresh);
}

async function reportsTab(body, refresh, query) {
  const all = await db.listAllReports();
  const fs = query.get('status') || '';
  const q = normalizeId(query.get('q') || '');
  const list = all.filter((r) => (!fs || r.status === fs) && (!q || [r.imei1, r.imei2, r.serial].includes(q)));
  body.innerHTML = `<form class="filters" id="rep-filter">
      <select name="status"><option value="">كل الحالات</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${fs === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <input name="q" dir="ltr" placeholder="IMEI / Serial" value="${esc(q)}"><button class="btn btn-outline">تصفية</button></form>
    <div class="table-wrap"><table class="table"><thead><tr><th>الجهاز</th><th>IMEI</th><th>المالك</th><th>التاريخ</th><th>الحالة</th><th>تغيير</th></tr></thead><tbody>
    ${list.map((r) => `<tr><td><a href="#/report/${r.id}">${esc(r.brand)} ${esc(r.model)}</a><div class="muted small">${esc(r.color)}</div></td>
      <td dir="ltr" class="mono small">${esc(r.imei1)}</td><td class="small" data-owner="${r.ownerId}">…</td><td class="small">${fmtDate(r.createdAt)}</td><td>${statusBadge(r.status)}</td>
      <td><div class="inline-form"><select data-status-for="${r.id}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select><button class="btn btn-sm btn-primary" data-save-status="${r.id}">حفظ</button></div></td></tr>`).join('') || '<tr><td colspan="6">لا توجد نتائج</td></tr>'}
    </tbody></table></div>`;
  $$('[data-owner]', body).forEach(async (td) => { const u = await db.getUser(td.dataset.owner); td.textContent = u ? `${u.name}` : '—'; });
  $('#rep-filter', body).addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; go(`#/admin?tab=reports&status=${f.status.value}&q=${encodeURIComponent(f.q.value)}`); });
  $$('[data-save-status]', body).forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.saveStatus; const st = $(`[data-status-for="${id}"]`, body).value;
    const note = await promptDialog('سبب تغيير الحالة', 'ملاحظة (تُسجل في سجل العمليات)', { required: false, multiline: false });
    if (note === null) return;
    await db.setReportStatus(id, st, note || 'تغيير بواسطة الدعم الفني'); toast('تم تغيير الحالة', 'ok'); refresh();
  }));
}

async function disputesTab(body, refresh) {
  const list = await db.listDisputes();
  if (!list.length) { body.innerHTML = emptyState('🕊️', 'لا توجد نزاعات'); return; }
  const owners = Object.fromEntries(await Promise.all([...new Set(list.map((d) => d.ownerId))].map(async (id) => [id, await db.getUser(id)])));
  body.innerHTML = list.map((d) => `<article class="card dispute-card ${d.coercion ? 'coercion' : ''}" data-testid="dispute-card">
    <div class="rc-top"><h3>${d.coercion ? '🚨 إكراه/تهديد — ' : ''}${esc(d.report?.brand)} ${esc(d.report?.model)}</h3>${badge(DISPUTE_STATUS[d.status].label, DISPUTE_STATUS[d.status].cls)}</div>
    <dl class="kv small">
      <dt>المالك</dt><dd>${esc(owners[d.ownerId]?.name || d.ownerName)} · <span dir="ltr">${esc(owners[d.ownerId]?.phone || '')}</span></dd>
      <dt>IMEI</dt><dd dir="ltr" class="mono">${esc(d.report?.imei1)}</dd>
      ${d.technician ? `<dt>الفني</dt><dd>${esc(d.technician.name)} — ${esc(d.technician.tech?.shopName)} ${badge(TECH_STATUS[d.technician.tech.status].label, TECH_STATUS[d.technician.tech.status].cls)}</dd>` : ''}
      <dt>التاريخ</dt><dd>${fmtDateTime(d.createdAt)}</dd>
      <dt>الوصف</dt><dd>${esc(d.description)}</dd>
      <dt>رقم المحضر</dt><dd>${esc(d.policeNumber || '—')}</dd>
      <dt>ملف الفيديو</dt><dd>${esc(d.evidenceFileName || '—')}</dd>
      <dt>رابط الدليل</dt><dd>${d.evidenceLink ? `<a href="${esc(d.evidenceLink)}" target="_blank" rel="noopener noreferrer" dir="ltr">${esc(d.evidenceLink)}</a>` : '—'}</dd>
      <dt>الشهود</dt><dd>${esc(d.witnesses || '—')}</dd>
    </dl>
    <div class="notes">${d.notes.map((n) => `<div class="note">💬 <b>${esc(n.byName)}</b> (${fmtDateTime(n.at)}): ${esc(n.text)}</div>`).join('') || '<div class="muted small">لا توجد ملاحظات بعد</div>'}</div>
    <div class="btn-row">
      <select data-dstatus="${d.id}">${Object.entries(DISPUTE_STATUS).map(([k, v]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <button class="btn btn-sm btn-primary" data-dsave="${d.id}">حفظ الحالة</button>
      <button class="btn btn-sm btn-outline" data-dnote="${d.id}">➕ ملاحظة</button>
      ${d.report ? `<a class="btn btn-sm btn-ghost" href="#/report/${d.reportId}">البلاغ</a>` : ''}
      ${d.technician && d.technician.tech.status === 'approved' ? `<button class="btn btn-sm btn-danger" data-suspend="${d.technician.id}">⛔ إيقاف الفني</button>` : ''}
    </div></article>`).join('');
  $$('[data-dsave]', body).forEach((b) => b.addEventListener('click', async () => {
    await db.setDisputeStatus(b.dataset.dsave, $(`[data-dstatus="${b.dataset.dsave}"]`, body).value); toast('تم الحفظ', 'ok'); refresh();
  }));
  $$('[data-dnote]', body).forEach((b) => b.addEventListener('click', async () => {
    const t = await promptDialog('إضافة ملاحظة', 'الملاحظة (تظهر للمالك)'); if (!t) return;
    await db.addDisputeNote(b.dataset.dnote, t); toast('تمت إضافة الملاحظة', 'ok'); refresh();
  }));
  $$('[data-suspend]', body).forEach((b) => b.addEventListener('click', async () => {
    const note = await promptDialog('إيقاف الفني', 'سبب الإيقاف'); if (note === null) return;
    await db.reviewTechnician(b.dataset.suspend, 'suspend', note); toast('تم إيقاف الفني', 'ok'); refresh();
  }));
}

async function auditTab(body) {
  const logs = await db.listAudit();
  body.innerHTML = `<div class="table-wrap"><table class="table audit"><thead><tr><th>الوقت</th><th>من</th><th>الإجراء</th><th>التفاصيل</th></tr></thead><tbody>
    ${logs.map((l) => `<tr><td class="small nowrap">${fmtDateTime(l.at)}</td><td class="small">${esc(l.actorName)}<div class="muted">${esc(ROLE_LABEL[l.actorRole] || l.actorRole)}</div></td><td><b>${esc(l.action)}</b></td><td class="small">${esc(l.details)}</td></tr>`).join('')}
    </tbody></table></div>`;
}
