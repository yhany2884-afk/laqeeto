// الكاميرا المباشرة — live camera capture via getUserMedia
// Selfies must be taken live: no gallery upload. We only fall back to an <input capture> when
// getUserMedia is not available at all (very old browsers / insecure context).
import { esc, imageFileToDataURL } from './utils.js';
import { icon } from './icons.js';

export const hasLiveCamera = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext !== false);

/**
 * Opens a modal camera. Resolves {dataUrl, method: 'live-camera'|'capture-input'} or null if cancelled.
 */
export function openCamera({ facing = 'user', title = 'التقاط صورة' } = {}) {
  return new Promise((resolve) => {
    let stream = null, settled = false;
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop camera-backdrop';
    const finish = (val) => {
      if (settled) return; settled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      wrap.remove(); document.body.classList.remove('no-scroll');
      resolve(val);
    };
    const live = hasLiveCamera();
    wrap.innerHTML = `<div class="modal camera-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-cancel aria-label="إغلاق">${icon('x')}</button></div>
      <div class="modal-body">
        ${live ? `
          <div class="camera-stage ${facing === 'user' ? 'mirror' : ''}">
            <video playsinline autoplay muted></video>
            ${facing === 'user' ? '<div class="face-guide" aria-hidden="true"></div>' : '<div class="card-guide" aria-hidden="true"></div>'}
            <div class="camera-msg">بنشغّل الكاميرا…</div>
          </div>
          <p class="hint center">${facing === 'user' ? 'خلّي وشك جوه الإطار في نور كويس ودوس «صوّر».' : 'خلّي البطاقة جوه الإطار بوضوح ودوس «صوّر».'}</p>
          <div class="modal-actions">
            <button class="btn btn-primary" data-snap disabled>${icon('camera', { size: 18 })} صوّر</button>
            <button class="btn btn-ghost" data-cancel>إلغاء</button>
          </div>` : `
          <div class="alert alert-info">${icon('info', { size: 18 })}<div>هنفتح كاميرا الجهاز على طول.</div></div>
          <label class="btn btn-primary file-btn">${icon('camera', { size: 18 })} افتح الكاميرا<input type="file" accept="image/*" capture="${facing}" hidden data-fallback></label>
          <div class="modal-actions"><button class="btn btn-ghost" data-cancel>إلغاء</button></div>`}
      </div></div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('no-scroll');
    wrap.addEventListener('click', (e) => { if (e.target.closest('[data-cancel]')) finish(null); });

    if (!live) {
      wrap.querySelector('[data-fallback]').addEventListener('change', async (e) => {
        const url = await imageFileToDataURL(e.target.files[0], 1024).catch(() => null);
        if (url) finish({ dataUrl: url, method: 'capture-input' });
      });
      return;
    }
    const video = wrap.querySelector('video');
    const msg = wrap.querySelector('.camera-msg');
    const snap = wrap.querySelector('[data-snap]');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (settled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s; video.srcObject = s;
        video.onloadedmetadata = () => { video.play(); msg.hidden = true; snap.disabled = false; };
      })
      .catch((err) => {
        msg.innerHTML = `مش قادرين نشغّل الكاميرا.<br>اسمح للتطبيق يستخدم الكاميرا من الإعدادات وجرّب تاني.<br><small style="opacity:.7">${esc(err.name || '')}</small>`;
        msg.classList.add('error');
      });
    snap.addEventListener('click', () => {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return;
      const scale = Math.min(1, 1024 / Math.max(w, h));
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
      const ctx = cv.getContext('2d');
      if (facing === 'user') { ctx.translate(cv.width, 0); ctx.scale(-1, 1); } // save as the user saw it
      ctx.drawImage(video, 0, 0, cv.width, cv.height);
      finish({ dataUrl: cv.toDataURL('image/jpeg', 0.85), method: 'live-camera', capturedAt: Date.now() });
    });
  });
}
