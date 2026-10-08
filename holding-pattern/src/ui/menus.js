import { ICONS } from './icons.js';
import { money } from '../core/math.js';
import { hasSave, saveInfo, writeSave, readSave, newestSlot } from '../save/save.js';

const KEYS_HTML = `<div class="keys">
  <kbd>Drag</kbd><span>Orbit the camera (with no tool picked)</span>
  <kbd>Right-drag</kbd><span>Pan (or <b>WASD</b> / arrow keys)</span>
  <kbd>Scroll</kbd><span>Zoom (pinch on a trackpad)</span>
  <kbd>Q</kbd><span>/ <b>E</b> rotate a stand or room while placing (or the camera)</span>
  <kbd>Esc</kbd><span>Stop building / close / pause menu</span>
  <kbd>R</kbd><span>Radar mode</span>
  <kbd>Space</kbd><span>Pause</span>
  <kbd>1 2 3</kbd><span>Game speed 1×, 2×, 4×</span>
  <kbd>C</kbd><span>Contracts</span>
  <kbd>B</kbd><span>Fold the departures board</span>
</div>`;

const HOW_HTML = `<h2>How to play</h2>
  <p><b>Build</b>: lay a runway, connect taxiways, add stands or gates (gates need to touch the terminal), then fit out the terminal with check-in desks, security lanes and gate lounges. Passengers walk entrance → check-in → security → lounge → plane.</p>
  <p><b>Fly</b>: inbound flights join the landing queue with a fuel timer. They land in queue order: drag rows to change it, and pick a runway once you have two. Amber means low fuel, red means it must land next or it diverts.</p>
  <p><b>Grow</b>: landing and passenger fees pay the bills; staff wages are paid at midnight. Happy passengers and on-time departures raise your rating, which unlocks bigger planes and better contracts. Three days in the red and you're bankrupt.</p>
  ${KEYS_HTML}`;

// Title screen, pause menu, help and the bankruptcy screen.
export class Menus {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    const ev = this.game.events;
    ev.on('openPause', () => this.pause());
    ev.on('bankrupt', () => this.bankrupt());
    this.buildTitle();
  }

  buildTitle() {
    const el = document.createElement('div');
    el.id = 'title';
    el.innerHTML = `<div class="inner panel">
      <div class="orbit"><div class="ring"></div><div class="tower">${ICONS.radar}</div>
        <div class="pl"><span>${ICONS.plane}</span></div><div class="pl b"><span>${ICONS.plane}</span></div></div>
      <h1>Holding Pattern</h1>
      <div class="tag">Build the airport. Run the sky.</div>
      <div class="stack" id="tStack"></div>
      <div class="foot">Start with a grass strip and one tiny prop plane. Grow it into a busy hub.</div>
    </div>`;
    document.body.appendChild(el);
    this.title = el;
  }

  showTitle() {
    document.body.classList.add('title');
    this.game.clock.paused = true;
    const stack = this.title.querySelector('#tStack');
    const slot = newestSlot();
    const info = slot ? saveInfo(slot) : null;
    stack.innerHTML = `${info ? `<button class="btn primary" data-act="continue">Continue · Day ${info.day} · ${money(info.money)}</button>` : ''}
      <button class="btn ${info ? '' : 'primary'}" data-act="new">New game</button>
      <button class="btn" data-act="how">How to play</button>`;
    stack.querySelector('[data-act="new"]').onclick = () => this.startNew();
    stack.querySelector('[data-act="how"]').onclick = () => this.help(() => this.showTitle());
    const cont = stack.querySelector('[data-act="continue"]');
    if (cont) cont.onclick = () => this.load(slot, true);
  }

  hideTitle() {
    document.body.classList.remove('title');
  }

  startNew() {
    this.hideTitle();
    this.ui.modal.close(true);
    this.game.newGame();
    this.game.clock.paused = false;
    this.game.events.emit('speed');
  }

  load(slot, fromTitle = false) {
    const r = readSave(this.game, slot);
    if (!r.ok) {
      this.ui.toast(`Couldn't load: ${r.error}`, { kind: 'bad', icon: 'close' });
      return;
    }
    this.hideTitle();
    this.ui.modal.close(true);
    this.game.started = true;
    this.game.clock.paused = false;
    this.game.events.emit('speed');
    this.ui.toast(fromTitle ? 'Welcome back' : 'Game loaded', { kind: 'good', icon: 'plane', sub: `Day ${this.game.clock.day} · ${money(this.game.economy.money)}` });
  }

  pause() {
    if (document.body.classList.contains('title') || this.ui.modal.open) return;
    const manual = saveInfo('manual'), auto = saveInfo('auto');
    const when = (i) => (i ? `Day ${i.day} · ${money(i.money)}` : 'empty');
    this.ui.modal.show(
      `<h2>Paused</h2>
       <p>Day ${this.game.clock.day} · ${money(this.game.economy.money)} · ${this.game.rating.value.toFixed(1)}★</p>
       <div class="stack">
         <button class="btn primary" data-act="resume">Resume</button>
         <button class="btn" data-act="save">Save game</button>
         <button class="btn" data-act="loadm" ${manual ? '' : 'disabled'}>Load saved game (${when(manual)})</button>
         <button class="btn" data-act="loada" ${auto ? '' : 'disabled'}>Load autosave (${when(auto)})</button>
         <button class="btn" data-act="how">How to play</button>
         <button class="btn danger" data-act="new">New game</button>
         <button class="btn ghost" data-act="title">Quit to title</button>
       </div>
       <p class="note">The game autosaves every in-game day and when you close the tab.</p>`,
      {
        key: 'pause',
        onMount: (el) => {
          const on = (a, fn) => (el.querySelector(`[data-act="${a}"]`).onclick = fn);
          on('resume', () => this.ui.modal.close());
          on('save', () => {
            const ok = writeSave(this.game, 'manual');
            this.ui.toast(ok ? 'Game saved' : "Couldn't save (storage full or blocked)", { kind: ok ? 'good' : 'bad', icon: ok ? 'plane' : 'close' });
            this.ui.modal.close();
          });
          on('loadm', () => this.load('manual'));
          on('loada', () => this.load('auto'));
          on('how', () => this.help(() => this.pause()));
          on('new', () => this.confirmNew());
          on('title', () => {
            writeSave(this.game, 'auto');
            this.ui.modal.close(true);
            this.showTitle();
          });
        },
      },
    );
  }

  confirmNew() {
    this.ui.modal.show(
      `<h2>Start a new airport?</h2><p>Your current airport stays in its save slots until they are overwritten. Save first if you want to come back to it.</p>
       <div class="actions"><button class="btn danger" data-yes>Start fresh</button><button class="btn" data-no>Back</button></div>`,
      {
        onMount: (el) => {
          el.querySelector('[data-yes]').onclick = () => this.startNew();
          el.querySelector('[data-no]').onclick = () => this.pause();
        },
      },
    );
  }

  help(back) {
    this.ui.modal.show(`${HOW_HTML}<div class="actions"><button class="btn primary" data-back>Got it</button></div>`, {
      wide: true,
      onMount: (el) => (el.querySelector('[data-back]').onclick = () => (back ? back() : this.ui.modal.close())),
    });
  }

  bankrupt() {
    const g = this.game;
    const st = g.ops.stats;
    this.ui.modal.show(
      `<h2>Bankrupt</h2>
       <p>Three days in the red and the creditors have taken the keys. The tower lights go out.</p>
       <div class="ledger">
         <span>Days open</span><span>${g.clock.day - 1}</span>
         <span>Flights handled</span><span>${st.departures}</span>
         <span>Passengers</span><span>${st.passengers.toLocaleString('en-GB')}</span>
         <span>Rating</span><span>${g.rating.value.toFixed(1)}★</span>
         <span class="tot">Final balance</span><span class="tot neg">${money(g.economy.money)}</span>
       </div>
       <div class="actions"><button class="btn primary" data-new>New game</button>${hasSave('manual') ? '<button class="btn" data-load>Load saved game</button>' : ''}<button class="btn ghost" data-title>Title screen</button></div>`,
      {
        dismissable: false,
        onMount: (el) => {
          el.querySelector('[data-new]').onclick = () => this.startNew();
          el.querySelector('[data-load]')?.addEventListener('click', () => this.load('manual'));
          el.querySelector('[data-title]').onclick = () => {
            this.ui.modal.close(true);
            this.showTitle();
          };
        },
      },
    );
  }
}
