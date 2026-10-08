import { ICONS } from './icons.js';

// Short stacked notifications under the top bar.
export class Toasts {
  constructor(root) {
    const el = document.createElement('div');
    el.id = 'toasts';
    root.appendChild(el);
    this.el = el;
    this.recent = new Map();
  }

  show(text, { kind = '', icon = 'plane', sub = '', ms = 3800, key = null } = {}) {
    // de-duplicate rapid repeats (e.g. the same build rejection)
    const k = key || text;
    const now = performance.now();
    if (this.recent.has(k) && now - this.recent.get(k) < 1500) return;
    this.recent.set(k, now);
    const t = document.createElement('div');
    t.className = `panel toast ${kind}`;
    t.innerHTML = `<span class="dot">${ICONS[icon] || ICONS.plane}</span><span>${text}${sub ? `<span class="sm">${sub}</span>` : ''}</span>`;
    this.el.prepend(t);
    while (this.el.children.length > 4) this.el.lastChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 380);
    }, ms);
  }
}
