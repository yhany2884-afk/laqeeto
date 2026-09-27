// عناصر واجهة مشتركة — shared UI helpers
import { esc, imageFileToDataURL, STATUS } from './utils.js';
import db from './db.js';
import { openCamera } from './camera.js';
import { icon } from './icons.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };

export function toast(msg, type = 'info', ms = 3500) {
  const box = document.getElementById('toasts');
  while (box.children.length >= 2) box.firstElementChild.remove(); // keep the stack short
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  if (type === 'ok' || type === 'error') el.innerHTML = icon(type === 'ok' ? 'circle-check' : 'circle-alert', { size: 18 });
  const span = document.createElement('span');
  span.textContent = msg; // user-supplied text never goes through innerHTML
  el.appendChild(span);
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

/** Simple modal. Returns {el, close}. actions: [{label, cls, onClick(close)}] */
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="إغلاق">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>
    ${actions.length ? `<div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-act="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
  </div>`;
  const close = () => { wrap.remove(); document.body.classList.remove('no-scroll'); onClose && onClose(); };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
    const b = e.target.closest('[data-act]');
    if (b) actions[+b.dataset.act].onClick?.(close, wrap);
  });
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  return { el: wrap, close };
}

export function confirmDialog(text, { okLabel = 'أيوه', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title: 'متأكد؟', body: `<p>${esc(text)}</p>`,
      actions: [
        { label: okLabel, cls: danger ? 'btn-danger' : 'btn-primary', onClick: (c) => { done = true; c(); resolve(true); } },
        { label: 'إلغاء', cls: 'btn-ghost', onClick: (c) => c() },
      ],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

export function promptDialog(title, label, { required = true, multiline = true } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: `<label class="field"><span>${esc(label)}</span>${multiline ? '<textarea rows="3" id="prompt-input"></textarea>' : '<input id="prompt-input">'}</label>`,
      actions: [
        { label: 'احفظ', cls: 'btn-primary', onClick: (c, w) => { const v = w.querySelector('#prompt-input').value.trim(); if (required && !v) { toast('الخانة دي مطلوبة', 'error'); return; } done = true; c(); resolve(v); } },
        { label: 'إلغاء', cls: 'btn-ghost', onClick: (c) => c() },
      ],
      onClose: () => { if (!done) resolve(null); },
    });
    setTimeout(() => m.el.querySelector('#prompt-input')?.focus(), 50);
  });
}

export const badge = (label, cls = 'muted') => `<span class="badge badge-${cls}">${esc(label)}</span>`;
export const statusBadge = (s) => badge(STATUS[s]?.label || s, STATUS[s]?.cls);

/** Load <img data-file="id"> sources from the file store */
export async function hydrateImages(root = document) {
  await Promise.all($$('img[data-file]', root).map(async (img) => {
    const id = img.dataset.file;
    if (!id || id === 'null') { img.replaceWith(Object.assign(document.createElement('div'), { className: 'img-missing ' + img.className.replace('thumb', ''), textContent: 'مفيش صورة' })); return; }
    const src = await db.files.get(id);
    if (src) img.src = src; else img.alt = 'الصورة مش متاحة';
    img.addEventListener('click', () => modal({ title: img.alt || 'صورة', body: `<img class="zoom-img" src="${src}" alt="">`, wide: true }));
  }));
}
export const fileImg = (id, alt = '', cls = '') => `<img class="thumb ${cls}" data-file="${esc(id)}" alt="${esc(alt)}" loading="lazy">`;

/**
 * Photo field. mode:
 *   'upload'  -> file input (gallery or camera), accept image/*
 *   'capture' -> file input with capture attr (opens camera on phones), still allows gallery on desktop
 *   'live'    -> ONLY live camera via getUserMedia (no gallery). Fallback to capture input only if getUserMedia is unavailable.
 */
export function photoField({ name, label, hint = '', required = false, mode = 'upload', facing = 'environment' }) {
  const cap = mode === 'capture' ? `capture="${facing}"` : '';
  return `<div class="photo-field" data-photo="${name}" data-mode="${mode}" data-facing="${facing}" ${required ? 'data-required="1"' : ''}>
    <div class="photo-label">${esc(label)} ${required ? '<span class="req">*</span>' : '<span class="opt">(اختياري)</span>'}</div>
    ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}
    <div class="photo-preview" hidden><img alt=""><span class="photo-ok">${icon('check', { size: 16 })} تمام</span><button type="button" class="btn btn-sm btn-ghost" data-photo-clear>شيل الصورة</button></div>
    <div class="photo-actions">
      ${mode === 'live'
        ? `<button type="button" class="btn btn-outline" data-live-cam>${icon('camera', { size: 18 })} صوّر دلوقتي</button>`
        : `<label class="btn btn-outline file-btn">${icon('image-plus', { size: 18 })} اختار صورة أو صوّر<input type="file" accept="image/*" ${cap} data-photo-input="${name}" hidden></label>`}
    </div>
  </div>`;
}

/** Bind all photo fields inside root; values are written into state[name] (data URL) */
export function bindPhotoFields(root, state) {
  $$('.photo-field', root).forEach((pf) => {
    const name = pf.dataset.photo;
    const preview = $('.photo-preview', pf);
    const set = (url, method) => {
      state[name] = url;
      if (method) state[name + 'Method'] = method;
      preview.hidden = !url;
      $('img', preview).src = url || '';
      pf.classList.toggle('has-photo', !!url);
      pf.classList.remove('invalid');
    };
    $('[data-photo-clear]', pf).addEventListener('click', () => set(null));
    const input = $('input[type=file]', pf);
    if (input) {
      input.addEventListener('change', async () => {
        try { set(await imageFileToDataURL(input.files[0]), 'file'); } catch (e) { toast(e.message, 'error'); }
        input.value = '';
      });
    }
    const live = $('[data-live-cam]', pf);
    if (live) {
      live.addEventListener('click', async () => {
        const res = await openCamera({ facing: pf.dataset.facing, title: $('.photo-label', pf).textContent.replace('*', '').trim() });
        if (res) set(res.dataUrl, res.method);
      });
    }
  });
}
export function checkPhotoFields(root, state) {
  let ok = true;
  $$('.photo-field[data-required]', root).forEach((pf) => {
    if (!state[pf.dataset.photo]) { pf.classList.add('invalid'); ok = false; }
  });
  return ok;
}

/** Empty state: icon name (Lucide), title, optional short text and action HTML */
export function emptyState(iconName, title, { text = '', action = '', inCard = false } = {}) {
  return `<div class="empty ${inCard ? 'in-card' : ''}"><div class="empty-icon">${icon(iconName, { size: 24 })}</div><div class="empty-title">${esc(title)}</div>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}

/** Error state with a retry button (re-renders the current route) */
export function errorState(message) {
  return `<div class="empty error-state" role="alert"><div class="empty-icon">${icon('circle-alert', { size: 24 })}</div><div class="empty-title">حصلت مشكلة</div>
    <p>${esc(message || 'حاول تاني بعد شوية.')}</p><button class="btn btn-outline" data-retry>${icon('refresh-cw', { size: 18 })} حاول تاني</button></div>`;
}

export const skeleton = (cards = 2) => `<div class="loading" aria-label="جارٍ التحميل"><div class="skel skel-title"></div>${'<div class="skel skel-card"></div>'.repeat(cards)}</div>`;

export const alertBox = (type, iconName, html) => `<div class="alert alert-${type}" role="note">${icon(iconName, { size: 18 })}<div>${html}</div></div>`;

export const safetyNote = (compact = false) => `<div class="alert alert-warn ${compact ? 'alert-compact' : ''}" role="note">${icon('shield-alert', { size: 18 })}<div>
  <b>خلّي بالك:</b> متحوّلش فلوس لحد بيقول إنه لقى موبايلك أو بيطلب «حلاوة» أو مصاريف شحن. قابل الشخص في مكان عام أو عند فني موثّق في التطبيق، ومتدّيش حد كود التحقق أو كلمة السر.
</div></div>`;
