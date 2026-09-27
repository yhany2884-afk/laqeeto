// الرسائل — inbox & conversation
import db from '../db.js';
import { esc, fmtDateTime, ROLE_LABEL } from '../utils.js';
import { $, go, toast, modal, emptyState, safetyNote, statusBadge } from '../ui.js';

export async function inboxView(el) {
  const convs = await db.listConversations();
  el.innerHTML = `<h2 class="page-title">الرسائل</h2>
    ${convs.length ? `<div class="list">${convs.map((c) => `
      <a class="conv-item ${c.unread ? 'unread' : ''}" href="#/chat/${c.id}" data-testid="conv-item">
        <div class="avatar">${esc((c.other?.name || '؟').slice(0, 1))}</div>
        <div class="grow"><div class="rc-top"><b>${esc(c.other?.name || 'مستخدم')}</b><small class="muted">${fmtDateTime(c.updatedAt)}</small></div>
          <div class="muted small">${esc(ROLE_LABEL[c.other?.role] || '')} · بخصوص ${esc(c.report?.brand || '')} ${esc(c.report?.model || '')}</div>
          <div class="conv-last">${esc(c.lastText)}</div></div>
        ${c.unread ? `<span class="count">${c.unread}</span>` : ''}
      </a>`).join('')}</div>` : emptyState('💬', 'لا توجد رسائل بعد')}`;
}

export async function chatView(el, { params, user }) {
  const c = await db.getConversation(params[0]);
  if (!c) { el.innerHTML = emptyState('🔒', 'المحادثة غير موجودة'); return; }
  window.dispatchEvent(new Event('badge-refresh'));
  const iAmOwner = c.report && c.report.ownerId === user.id;
  const canHandover = user.role === 'technician' && user.tech?.status === 'approved' && c.report?.active && c.report.status !== 'dispute';
  el.innerHTML = `<div class="chat">
    <div class="chat-head">
      <a href="#/inbox" class="icon-btn" aria-label="رجوع">→</a>
      <div class="grow"><b>${esc(c.other?.name || '')}</b> <small class="muted">${esc(ROLE_LABEL[c.other?.role] || '')}</small>
        <div class="small muted">بخصوص: ${esc(c.report?.brand || '')} ${esc(c.report?.model || '')} ${c.report ? statusBadge(c.report.status) : ''}</div></div>
      ${iAmOwner ? '<button class="btn btn-sm btn-outline" id="share-contact">مشاركة بيانات التواصل</button>' : ''}
      ${canHandover ? `<a class="btn btn-sm btn-primary" href="#/tech/handover/${c.reportId}">تسجيل تسليم</a>` : ''}
    </div>
    ${safetyNote(true)}
    <div class="messages" id="messages">${c.messages.map((m) => msgHTML(m, user)).join('')}</div>
    <form class="chat-input" id="chat-form"><textarea name="text" rows="1" placeholder="اكتب رسالة…" required></textarea><button class="btn btn-primary" aria-label="إرسال">إرسال</button></form>
  </div>`;
  const box = $('#messages', el);
  box.scrollTop = box.scrollHeight;
  const form = $('#chat-form', el);
  form.text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = form.text.value.trim();
    if (!text) return;
    try {
      const m = await db.reply(c.id, text);
      box.insertAdjacentHTML('beforeend', msgHTML(m, user));
      form.text.value = ''; box.scrollTop = box.scrollHeight;
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#share-contact', el)?.addEventListener('click', () => {
    const mm = modal({
      title: 'مشاركة بيانات التواصل',
      body: `<p>اختر ما تريد إظهاره لـ <b>${esc(c.other?.name || '')}</b> فقط (لن يظهر للعامة):</p>
        <form class="form" id="share-form">
          <label class="check"><input type="checkbox" name="phone" checked> رقم الموبايل</label>
          <label class="check"><input type="checkbox" name="email"> البريد الإلكتروني</label>
          <label class="check"><input type="checkbox" name="socials"> روابط التواصل الاجتماعي</label>
          <div class="alert alert-warn alert-compact">شارك رقمك فقط إذا اطمأننت للطرف الآخر. لا تدفع أي أموال.</div>
          <button class="btn btn-primary btn-block">مشاركة</button></form>`,
    });
    $('#share-form', mm.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const m = await db.shareContact(c.id, { phone: f.phone.checked, email: f.email.checked, socials: f.socials.checked });
        mm.close(); box.insertAdjacentHTML('beforeend', msgHTML(m, user)); box.scrollTop = box.scrollHeight;
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

function msgHTML(m, user) {
  if (m.kind === 'system') return `<div class="msg msg-system">🔔 ${esc(m.text)}<small>${fmtDateTime(m.createdAt)}</small></div>`;
  const mine = m.fromId === user.id;
  let body = esc(m.text).replace(/\n/g, '<br>');
  if (m.kind === 'contact' && m.data) {
    body += `<div class="shared-contact">${m.data.phone ? `<div>📞 <a href="tel:${esc(m.data.phone)}" dir="ltr">${esc(m.data.phone)}</a></div>` : ''}${m.data.email ? `<div>✉️ <a href="mailto:${esc(m.data.email)}">${esc(m.data.email)}</a></div>` : ''}${(m.data.socials || []).map((s) => `<div>🔗 <a href="${esc(s)}" target="_blank" rel="noopener noreferrer" dir="ltr">${esc(s)}</a></div>`).join('')}</div>`;
  }
  return `<div class="msg ${mine ? 'msg-me' : 'msg-them'}">${mine ? '' : `<b class="msg-from">${esc(m.fromName)}</b>`}<div>${body}</div><small>${fmtDateTime(m.createdAt)}</small></div>`;
}
