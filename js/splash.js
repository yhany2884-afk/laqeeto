// Exit animation — the mirror of the launch animation in index.html (the lock closes).
// Used on logout and, in the desktop app, when the window is closed. Mobile OSes don't let an app animate on exit.
const MARK = `<svg class="sp-mark" viewBox="0 0 512 512" aria-hidden="true">
  <g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <rect x="160" y="88" width="192" height="336" rx="40" stroke-width="24"/><path d="M232 132h48" stroke-width="16"/>
    <path class="sp-shackle" d="M222 262v-26a34 34 0 0 1 68 0v26" stroke-width="20"/></g>
  <rect x="202" y="258" width="108" height="88" rx="16" fill="#fff"/>
  <g class="sp-key"><circle cx="256" cy="296" r="11" fill="#16499b"/><path d="M256 300v18" stroke="#16499b" stroke-width="10" stroke-linecap="round"/></g>
  <path class="sp-check" d="M231 302l17 17 33-35" fill="none" stroke="#16499b" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Shows the brand overlay and closes the lock. Resolves when the animation is done; returns a function that fades it out. */
export async function playExit({ message = '' } = {}) {
  if (reduced()) return () => {};
  const el = document.createElement('div');
  el.className = 'splash exit';
  el.setAttribute('role', 'status');
  el.innerHTML = MARK + `<div class="sp-word">لقيته</div>${message ? `<div class="xsmall" style="opacity:.8">${message}</div>` : ''}`;
  document.body.appendChild(el);
  void el.offsetWidth;
  el.classList.add('in');
  await wait(170);
  el.classList.add('lock');
  await wait(380);
  return () => { el.classList.add('out'); el.classList.remove('in'); setTimeout(() => el.remove(), 280); };
}

/** Desktop app: play the exit animation when the window is being closed, then let it close. */
export function initDesktopExit() {
  const d = window.laqeetoDesktop;
  if (!d || typeof d.onCloseRequested !== 'function') return;
  d.onCloseRequested(() => playExit());
}
