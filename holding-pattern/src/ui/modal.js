// One modal layer for dialogs (contracts, pause menu, day summary, game over).
export class Modal {
  constructor(ui) {
    this.ui = ui;
    const el = document.createElement('div');
    el.id = 'modal';
    document.body.appendChild(el);
    this.el = el;
    this.current = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target === el && this.current?.dismissable !== false) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.current && this.current.dismissable !== false) {
        e.stopImmediatePropagation();
        this.close();
      }
    }, true);
  }

  get open() {
    return !!this.current;
  }

  show(html, { wide = false, onMount, onClose, dismissable = true, pause = true, key = null } = {}) {
    if (this.current) this.close(true);
    const game = this.ui.game;
    this.current = { onClose, dismissable, key, wasPaused: game.clock.paused, pause };
    if (pause) game.clock.paused = true;
    game.events.emit('speed');
    this.el.innerHTML = `<div class="dialog ${wide ? 'wide' : ''}">${html}</div>`;
    this.el.classList.add('show');
    onMount?.(this.el.firstElementChild, this);
  }

  close(silent = false) {
    const c = this.current;
    if (!c) return;
    this.current = null;
    this.el.classList.remove('show');
    this.el.innerHTML = '';
    const game = this.ui.game;
    if (c.pause) game.clock.paused = c.wasPaused;
    game.events.emit('speed');
    if (!silent) c.onClose?.();
  }
}
