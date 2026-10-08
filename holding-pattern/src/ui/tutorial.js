import { T } from '../world/grid.js';

// Six short tooltips that walk a new player from grass to the first landing.
// Each step points at the relevant button and completes itself when done.
const STEPS = [
  {
    title: 'Lay a runway',
    text: 'Pick <b>Runway</b> and drag a straight line at least 60 tiles long. Planes land in the direction you drag.',
    anchor: '[data-tool="runway"]',
    done: (g) => g.grid.runways.length > 0,
  },
  {
    title: 'Connect a taxiway',
    text: 'Pick <b>Taxiway</b> and drag from the side of the runway out toward open grass. Taxiways must touch the runway. One near the start of the runway helps departures.',
    anchor: '[data-tool="taxiway"]',
    done: (g) => g.grid.countType(T.TAXI) >= 4 && g.graph.refresh() !== null && g.grid.runways.some((r) => g.graph.accessNodes(r.id).length),
  },
  {
    title: 'Build a terminal',
    text: 'Pick <b>Terminal</b> and drag a rectangle of floor next to your taxiway. Passengers come in through doors on its south side.',
    anchor: '[data-tool="terminal"]',
    done: (g) => g.grid.countType(T.TERMINAL) >= 6,
  },
  {
    title: 'Add a stand or gate',
    text: 'A <b>Gate</b> has a jet bridge: put its back on the taxiway and its nose against the terminal. A <b>Stand</b> only needs the taxiway. <kbd>Q</kbd>/<kbd>E</kbd> rotate.',
    anchor: '[data-tool="gate"]',
    done: (g) => g.grid.stands.length > 0,
  },
  {
    title: 'Fit out the terminal',
    text: 'Inside the terminal add a <b>Check-in</b> desk, a <b>Security</b> lane and a <b>Gate lounge</b>. Their open ends need free floor in front.',
    anchor: '[data-tool="checkin"]',
    done: (g) => ['checkin', 'security', 'lounge'].every((t) => g.grid.rooms.some((r) => r.type === t)),
  },
  {
    title: 'Land your first plane',
    text: 'Your first flight is on its way. Watch it in the <b>Landing queue</b>: drag rows to change the order, keep an eye on fuel, and press <kbd>R</kbd> for radar.',
    anchor: '#queue',
    side: 'left',
    done: (g) => g.ops.stats.landings > 0,
  },
];

export class Tutorial {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    const el = document.createElement('div');
    el.id = 'tut';
    el.className = 'panel';
    document.getElementById('hud').appendChild(el);
    this.el = el;
    this.step = 0;
    this.active = false;
    this.t = 0;
    this.pulse = null;
  }

  start() {
    this.step = 0;
    this.active = true;
    this.render();
  }

  stop() {
    this.active = false;
    this.el.classList.remove('show');
    this.pulse?.classList.remove('pulse');
  }

  render() {
    if (!this.active) return;
    const s = STEPS[this.step];
    const dots = STEPS.map((_, i) => `<i class="${i === this.step ? 'on' : ''}"></i>`).join('');
    this.el.innerHTML = `<div class="arrow"></div><div class="step">Tutorial · ${this.step + 1} of ${STEPS.length}</div><h3>${s.title}</h3><p>${s.text}</p>
      <div class="row"><div class="dots">${dots}</div><button class="btn ghost" data-skip>Skip tutorial</button></div>`;
    this.el.querySelector('[data-skip]').onclick = () => {
      this.stop();
      this.game.events.emit('tutorialDone', true);
    };
    this.el.classList.add('show');
    this.pulse?.classList.remove('pulse');
    this.pulse = document.querySelector(s.anchor);
    this.pulse?.classList.add('pulse');
    this.place();
  }

  place() {
    const s = STEPS[this.step];
    const target = document.querySelector(s.anchor);
    const arrow = this.el.querySelector('.arrow');
    if (!target || !arrow) return;
    const r = target.getBoundingClientRect();
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    let x, y;
    if (s.side === 'left') {
      x = r.left - w - 16;
      y = Math.max(80, r.top);
      arrow.style.cssText = `right:-7px;top:22px;transform:rotate(-135deg)`;
    } else {
      x = r.right + 16;
      y = Math.min(window.innerHeight - h - 16, Math.max(80, r.top + r.height / 2 - 30));
      arrow.style.cssText = `left:-7px;top:${Math.max(12, Math.min(h - 24, r.top + r.height / 2 - y - 7))}px;transform:rotate(45deg)`;
    }
    this.el.style.left = `${Math.max(8, x)}px`;
    this.el.style.top = `${y}px`;
  }

  update(dt) {
    if (!this.active) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.3;
    this.place();
    const s = STEPS[this.step];
    if (s.done(this.game)) {
      this.step++;
      if (this.step >= STEPS.length) {
        this.stop();
        this.ui.toast('Tutorial complete', { kind: 'gold', icon: 'plane', sub: 'Grow it into a hub: keep passengers happy and flights on time to raise your rating.', ms: 7000 });
        this.game.events.emit('tutorialDone', false);
        return;
      }
      this.render();
    }
  }

  toJSON() {
    return { step: this.step, active: this.active };
  }

  load(d) {
    if (!d) return this.stop();
    this.step = Math.min(d.step || 0, STEPS.length - 1);
    if (d.active) {
      this.active = true;
      this.render();
    } else this.stop();
  }
}
