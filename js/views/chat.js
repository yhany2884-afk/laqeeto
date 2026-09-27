// الرسائل — inbox & conversation
import db from '../db.js';
import { esc, extLink, fmtDateTime, ROLE_LABEL } from '../utils.js';
import { $, go, toast, modal, emptyState, safetyNote, statusBadge, alertBox } from '../ui.js';
import { icon } from '../icons.js';

export async function inboxView(el) {
  const convs = await db.listConversations();
  el.innerHTML = `<div class="narrow"><h2 class="page-title" style="margin-bottom:14px">الرسايل</h2>
    ${convs.length ? `<div class="conv-list">${convs.map((c) => `
      <a class="conv-item ${c.unread ? 'unread' : ''}" href="#/chat/${c.id}" data-testid="conv-item">
        <div class="avatar">${esc((c.other?.name || '؟').slice(0, 1))}</div>
        <div class="grow"><div class="rc-top"><b>${esc(c.other?.name || 'مستخدم')}</b><small class="muted xsmall">${fmtDateTime(c.updatedAt)}</small></div>
          <div class="muted xsmall">${esc(ROLE_LABEL[c.other?.role] || '')} · ${esc(c.report?.brand || '')} ${esc(c.report?.model || '')}</div>
          <div class="conv-last">${esc(c.lastText)}</div></div>
        ${c.unread ? `<span class="count">${c.unread}</span>` : ''}
      </a>`).join('')}</div>` : `<div class="card">${emptyState('inbox', 'مفيش رسايل لسه', { text: 'لما حد يبعتلك بخصوص موبايل، أو تبعت لصاحب موبايل، الرسايل هتظهر هنا.', inCard: true })}</div>`}</div>`;
}

export async function chatView(el, { params, user }) {
  const c = await db.getConversation(params[0]);
  if (!c) { el.innerHTML = emptyState('lock', 'المحادثة دي مش موجودة', { action: '<a class="btn btn-outline" href="#/inbox">الرسايل</a>' }); return; }
  window.dispatchEvent(new Event('badge-refresh'));
  const iAmOwner = c.iAmOwner;
  const canHandover = user.role === 'technician' && user.tech?.status === 'approved' && c.report?.active && c.report.status !== 'dispute';
  el.innerHTML = `<div class="narrow"><div class="chat">
    <div class="chat-head">
      <a href="#/inbox" class="icon-btn" aria-label="رجوع">${icon('arrow-right')}</a>
      <div class="grow"><b>${esc(c.other?.name || '')}</b> <small class="muted">${esc(ROLE_LABEL[c.other?.role] || '')}</small>
        <div class="xsmall muted">${esc(c.report?.brand || '')} ${esc(c.report?.model || '')} ${c.report ? statusBadge(c.report.status) : ''}</div></div>
      ${iAmOwner ? `<button class="btn btn-sm btn-outline" id="share-contact">${icon('share-2', { size: 16 })} شارك رقمك</button>` : ''}
      ${canHandover ? `<a class="btn btn-sm btn-primary" href="#/tech/handover/${c.reportId}">سجّل تسليم</a>` : ''}
    </div>
    ${safetyNote(true)}
    <div class="messages" id="messages">${c.messages.map((m) => msgHTML(m, user)).join('')}</div>
    <form class="chat-input" id="chat-form"><textarea name="text" rows="1" placeholder="اكتب رسالة…" required aria-label="رسالتك"></textarea><button class="btn btn-primary" aria-label="ابعت">${icon('send', { size: 18 })}</button></form>
  </div></div>`;
  const box = $('#messages', el);
  box.scrollTop = box.scrollHeight;
  // poll for new messages from the other device (simple & cheap; realtime can replace this later)
  const shown = new Set(c.messages.map((m) => m.id));
  const route = location.hash;
  const timer = setInterval(async () => {
    if (location.hash !== route || !document.body.contains(box)) { clearInterval(timer); return; }
    if (document.hidden) return;
    try {
      const fresh = await db.getConversation(c.id);
      const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      (fresh?.messages || []).filter((m) => !shown.has(m.id)).forEach((m) => { shown.add(m.id); box.insertAdjacentHTML('beforeend', msgHTML(m, user)); });
      if (nearBottom) box.scrollTop = box.scrollHeight;
    } catch { /* offline */ }
  }, 6000);
  const form = $('#chat-form', el);
  form.text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = form.text.value.trim();
    if (!text) return;
    try {
      const m = await db.reply(c.id, text);
      shown.add(m.id);
      box.insertAdjacentHTML('beforeend', msgHTML(m, user));
      form.text.value = ''; box.scrollTop = box.scrollHeight;
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#share-contact', el)?.addEventListener('click', () => {
    const mm = modal({
      title: 'شارك بيانات التواصل',
      body: `<p>اختار اللي عايز <b>${esc(c.other?.name || '')}</b> يشوفه (هو بس، مش كل الناس):</p>
        <form class="form" id="share-form">
          <label class="check"><input type="checkbox" name="phone" checked> رقم الموبايل</label>
          <label class="check"><input type="checkbox" name="email"> الإيميل</label>
          <label class="check"><input type="checkbox" name="socials"> لينكات السوشيال ميديا</label>
          ${alertBox('warn', 'shield-alert', 'شارك رقمك بس لو اطمنت للشخص ده. ومتدفعش أي فلوس.')}
          <button class="btn btn-primary btn-block">شارك</button></form>`,
    });
    $('#share-form', mm.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const m = await db.shareContact(c.id, { phone: f.phone.checked, email: f.email.checked, socials: f.socials.checked });
        mm.close(); shown.add(m.id); box.insertAdjacentHTML('beforeend', msgHTML(m, user)); box.scrollTop = box.scrollHeight;
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

function msgHTML(m, user) {
  if (m.kind === 'system') return `<div class="msg msg-system">${esc(m.text)}<small>${fmtDateTime(m.createdAt)}</small></div>`;
  const mine = m.fromId === user.id;
  let body = esc(m.text).replace(/\n/g, '<br>');
  if (m.kind === 'contact' && m.data) {
    body += `<div class="shared-contact">${m.data.phone ? `<div>${icon('phone', { size: 14 })}<a href="tel:${esc(m.data.phone)}" dir="ltr">${esc(m.data.phone)}</a></div>` : ''}${m.data.email ? `<div>${icon('mail', { size: 14 })}<a href="mailto:${esc(m.data.email)}">${esc(m.data.email)}</a></div>` : ''}${(m.data.socials || []).map((s) => `<div>${icon('link', { size: 14 })}${extLink(s)}</div>`).join('')}</div>`;
  }
  return `<div class="msg ${mine ? 'msg-me' : 'msg-them'}">${mine ? '' : `<b class="msg-from">${esc(m.fromName)}</b>`}<div>${body}</div><small>${fmtDateTime(m.createdAt)}</small></div>`;
}
