export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  [...root.querySelectorAll(sel)] as T[];

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for safe interpolation into innerHTML templates. */
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const ICONS = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>',
  star: '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L14.6 9 L21 9.5 L16.2 13.7 L17.7 20 L12 16.6 L6.3 20 L7.8 13.7 L3 9.5 L9.4 9 Z"/></svg>',
  compare: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20 V10 M12 20 V4 M19 20 V13"/></svg>',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7 a2 2 0 0 1 2-2 h4 l2 2 h8 a2 2 0 0 1 2 2 v8 a2 2 0 0 1-2 2 H5 a2 2 0 0 1-2-2 Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 V19 M5 12 H19"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16 L20.5 20.5"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4 H20 V10 M20 4 L11 13 M18 14 V19 a1 1 0 0 1-1 1 H5 a1 1 0 0 1-1-1 V7 a1 1 0 0 1 1-1 H10"/></svg>',
  orbit: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-20 12 12)"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 L8 19 L19 8 L16 5 L5 16 Z M14 7 L17 10"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 20 H17 L18 7"/></svg>',
  locate: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" class="fill"/><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22"/></svg>',
  ruler: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5 V12 L18 16"/></svg>',
  weight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9 H18 L20 20 H4 Z"/><circle cx="12" cy="6" r="2.5"/></svg>',
  gravity: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 V17 M7 12 L12 17 L17 12 M5 21 H19"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2 V4 M12 20 V22 M2 12 H4 M20 12 H22 M5 5 L6.5 6.5 M17.5 17.5 L19 19 M5 19 L6.5 17.5 M17.5 6.5 L19 5"/></svg>',
  year: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="9"/><circle cx="21" cy="12" r="1.6" class="fill"/><circle cx="12" cy="12" r="2" class="fill"/></svg>',
  temp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14 V5 a2 2 0 0 1 4 0 V14 a4 4 0 1 1-4 0 Z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5 A8 8 0 1 1 9.5 4 a6.5 6.5 0 0 0 10.5 10.5 Z"/></svg>',
  distance: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="12" r="1.5"/><path d="M8 12 H17" stroke-dasharray="2 2"/></svg>',
  telescope: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 L16 5 L18 9 L5 15 Z M10 13 L8 21 M12 12 L15 21 M16 5 L20 3 L22 7 L18 9"/></svg>',
  ly: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12 H21 M17 8 L21 12 L17 16"/><circle cx="5" cy="12" r="1.5" class="fill"/></svg>',
  empty: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M8 15 C10 13 14 13 16 15"/><circle cx="9" cy="10" r="1" class="fill"/><circle cx="15" cy="10" r="1" class="fill"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19"/></svg>',
};

let toastTimer = 0;
export function toast(msg: string) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  host.appendChild(el);
  while (host.children.length > 3) host.firstElementChild?.remove();
  window.clearTimeout(toastTimer);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

export function announce(msg: string) {
  const el = $('#announcer');
  el.textContent = '';
  requestAnimationFrame(() => (el.textContent = msg));
}

export const orbStyle = (color: string) => `--c:${color}`;
