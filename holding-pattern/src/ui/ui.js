import { Hud } from './hud.js';
import { BuildMenu, CursorTip } from './buildMenu.js';
import { Toasts } from './toasts.js';

// Root of the HTML interface. Components are created here and updated each frame.
export class UI {
  constructor(game) {
    this.game = game;
    const root = document.getElementById('hud');
    this.root = root;
    this.toasts = new Toasts(root);
    this.hud = new Hud(this, root);
    this.buildMenu = new BuildMenu(this, root);
    this.tip = new CursorTip(this, root);
    this.right = document.createElement('div');
    this.right.id = 'right';
    root.appendChild(this.right);
    this.components = [this.hud];
    game.events.on('buildRejected', (reason) => this.toasts.show(reason, { kind: 'bad', icon: 'close', ms: 2200 }));
  }

  add(component) {
    this.components.push(component);
    return component;
  }

  toast(text, opts) {
    this.toasts.show(text, opts);
  }

  openContracts() {
    this.game.events.emit('openContracts');
  }

  openPause() {
    this.game.events.emit('openPause');
  }

  update(dt) {
    for (const c of this.components) c.update?.(dt);
  }
}
