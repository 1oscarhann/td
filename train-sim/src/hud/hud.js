import { createDial } from './dial.js';
import { NOTCHES } from '../physics/controller.js';
import { ASPECT_INFO, Aspect } from '../signals/aspects.js';
import { requiredDeceleration } from '../physics/braking.js';
import { formatClock, mpsToKmh, mpsToMph } from '../core/units.js';

/** Notch names as the driver would say them. */
const NOTCH_TEXT = Object.freeze({
  EB: 'Emergency',
  B3: 'Brake 3 (full service)',
  B2: 'Brake 2',
  B1: 'Brake 1',
  OFF: 'Off (coasting)',
  P1: 'Power 1',
  P2: 'Power 2',
  P3: 'Power 3',
  P4: 'Power 4 (full)',
});

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Only touch the DOM when something actually changed. */
function setText(/** @type {HTMLElement} */ node, /** @type {string} */ text) {
  if (node.textContent !== text) node.textContent = text;
}

function setClass(/** @type {HTMLElement | SVGElement} */ node, /** @type {string} */ name, /** @type {boolean} */ on) {
  if (node.classList.contains(name) !== on) node.classList.toggle(name, on);
}

/**
 * The cab desk (gauges and indicator lights) plus the message log, alerts and driving aid,
 * as plain HTML/CSS laid over the 3D view.
 */
export class Hud {
  /**
   * @param {HTMLElement} root
   * @param {import('../core/settings.js').Settings} settings
   */
  constructor(root, settings) {
    this.root = root;
    this.settings = settings;
    root.replaceChildren();

    // Top: message log, alert banner, driving aid.
    this.log = h('ol', 'hud-log');
    this.log.setAttribute('aria-live', 'polite');
    this.alert = h('div', 'hud-alert');
    this.alert.setAttribute('role', 'alert');
    this.assist = h('div', 'hud-assist');
    this.assistHtml = '';
    root.append(this.log, this.alert, this.assist);

    // Bottom: the desk.
    const desk = h('div', 'hud-desk');
    root.append(desk);

    // Controller position, power at the top like pushing a real handle forwards.
    const ctrl = h('div', 'panel controller');
    ctrl.append(h('div', 'panel-title', 'Controller'));
    const notchList = h('ol', 'notches');
    /** @type {Record<string, HTMLElement>} */
    this.notchEls = {};
    for (const n of [...NOTCHES].reverse()) {
      const li = h('li', `notch notch-${n.startsWith('P') ? 'power' : n === 'OFF' ? 'off' : 'brake'}`, n);
      this.notchEls[n] = li;
      notchList.append(li);
    }
    ctrl.append(notchList, h('div', 'key-hint', 'W / S'));

    this.speedoHolder = h('div', 'gauge');
    this.buildSpeedo();

    // Safety systems panel.
    const safety = h('div', 'panel safety');
    safety.append(h('div', 'panel-title', 'Safety systems'));
    const grid = h('div', 'safety-grid');
    this.sunflower = this.buildSunflower();
    const awsCell = h('div', 'cell');
    awsCell.append(this.sunflower, h('span', 'cell-label', 'AWS (Q)'));
    const tpws = h('div', 'cell tpws');
    this.tpwsBrake = h('span', 'lamp red', 'BRAKE DEMAND');
    this.tpwsIsol = h('span', 'lamp amber', 'TEMP ISOL / FAULT');
    this.tpwsOverride = h('span', 'lamp amber', 'TRAIN STOP O/RIDE');
    tpws.append(h('span', 'cell-label', 'TPWS'), this.tpwsBrake, this.tpwsIsol, this.tpwsOverride);
    this.draLamp = h('span', 'dra', 'DRA');
    const draCell = h('div', 'cell');
    draCell.append(this.draLamp, h('span', 'cell-label', 'Reminder (R)'));
    this.dsdLamp = h('span', 'lamp green', 'DSD');
    this.doorsLamp = h('span', 'lamp amber', 'DOORS CLOSED');
    this.powerLamp = h('span', 'lamp red', 'NO POWER');
    const lampsCell = h('div', 'cell lamps');
    lampsCell.append(this.dsdLamp, this.doorsLamp, this.powerLamp);
    grid.append(awsCell, tpws, draCell, lampsCell);
    safety.append(grid);

    const brake = createDial({ min: 0, max: 10, major: 2, minor: 0.5, label: 'Brake', unit: 'bar', needles: ['#f2f2f2', '#e0453a'] });
    this.brakeDial = brake;
    const brakeHolder = h('div', 'gauge');
    brakeHolder.append(brake.el, h('div', 'gauge-legend', 'white: brake cyl. · red: main res.'));

    const info = h('div', 'panel info');
    this.clock = h('div', 'clock', '--:--:--');
    this.notchText = h('div', 'info-line');
    this.lineSpeed = h('div', 'info-line');
    this.doorsText = h('div', 'info-line');
    info.append(h('div', 'panel-title', 'Clock'), this.clock, this.notchText, this.lineSpeed, this.doorsText);

    desk.append(ctrl, this.speedoHolder, safety, brakeHolder, info);
    this.applySettings(settings);
  }

  buildSpeedo() {
    const kmh = this.settings.speedUnits === 'kmh';
    this.speedo = createDial(
      kmh
        ? { min: 0, max: 180, major: 20, minor: 10, label: 'Speed', unit: 'km/h', needles: ['#f2f2f2'] }
        : { min: 0, max: 110, major: 10, minor: 5, label: 'Speed', unit: 'mph', needles: ['#f2f2f2'] },
    );
    this.speedoHolder.replaceChildren(this.speedo.el);
  }

  /** AWS "sunflower": all black normally, black and yellow segments after a warning. */
  buildSunflower() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '-50 -50 100 100');
    svg.setAttribute('class', 'sunflower');
    for (let i = 0; i < 8; i++) {
      const a0 = (i * Math.PI) / 4;
      const a1 = ((i + 1) * Math.PI) / 4;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M0 0 L ${45 * Math.sin(a0)} ${-45 * Math.cos(a0)} A 45 45 0 0 1 ${45 * Math.sin(a1)} ${-45 * Math.cos(a1)} Z`);
      path.setAttribute('class', i % 2 ? 'petal odd' : 'petal');
      svg.append(path);
    }
    return svg;
  }

  /** @param {import('../core/settings.js').Settings} settings */
  applySettings(settings) {
    const unitsChanged = settings.speedUnits !== this.settings.speedUnits || !this.speedo;
    this.settings = settings;
    if (unitsChanged) this.buildSpeedo();
    this.assist.hidden = !settings.assistOverlay;
  }

  /** @param {number} mps */
  speedValue(mps) {
    return this.settings.speedUnits === 'kmh' ? mpsToKmh(mps) : mpsToMph(mps);
  }

  /** @param {number} mps */
  speedText(mps) {
    return `${Math.round(this.speedValue(mps))} ${this.settings.speedUnits === 'kmh' ? 'km/h' : 'mph'}`;
  }

  reset() {
    this.log.replaceChildren();
  }

  /**
   * @param {import('../sim/simulation.js').SimEvent} ev
   * @param {number} clockStart time of day the run started, in seconds
   */
  pushEvent(ev, clockStart) {
    const li = h('li', `log-${ev.type}`, `${formatClock(ev.time + clockStart)}  ${ev.text}`);
    this.log.prepend(li);
    while (this.log.children.length > 6) this.log.lastElementChild?.remove();
  }

  /** @param {import('../sim/simulation.js').Simulation} sim */
  update(sim) {
    const train = sim.train;

    this.speedo.setNeedle(0, this.speedValue(train.speed));
    this.speedo.setDigital(String(Math.round(this.speedValue(train.speed))));
    this.speedo.setBug(this.speedValue(sim.lineSpeed));
    this.brakeDial.setNeedle(0, train.bcPressure);
    this.brakeDial.setNeedle(1, sim.spec.brake.mainReservoirBar);
    this.brakeDial.setDigital(train.bcPressure.toFixed(1));

    for (const n of NOTCHES) setClass(this.notchEls[n], 'active', n === sim.controller.notch);

    // Safety lights. Flashing is done in CSS with the "flash" class.
    for (const petal of this.sunflower.children) setClass(petal, 'on', sim.aws.sunflower && petal.classList.contains('odd'));
    setClass(this.tpwsBrake, 'on', sim.tpws.brakeDemand);
    setClass(this.tpwsBrake, 'flash', sim.tpws.brakeDemand);
    setClass(this.draLamp, 'on', sim.draSet);
    const dsdMode = this.settings.dsdMode;
    setText(this.dsdLamp, dsdMode === 'off' ? 'DSD OFF' : dsdMode === 'vigilance' ? 'VIGILANCE' : 'DSD');
    setClass(this.dsdLamp, 'on', dsdMode === 'hold' ? sim.held.dsd : dsdMode === 'vigilance' && !sim.dsd.warning);
    setClass(this.dsdLamp, 'warn', sim.dsd.warning);
    setClass(this.doorsLamp, 'on', sim.doors.closedAndLocked);
    const inhibit = sim.tractionInhibitReason;
    setClass(this.powerLamp, 'on', inhibit !== null);

    setText(this.clock, formatClock(sim.clock));
    setText(this.notchText, NOTCH_TEXT[/** @type {keyof typeof NOTCH_TEXT} */ (sim.controller.notch)]);
    setText(this.lineSpeed, `Line speed ${this.speedText(sim.lineSpeed)}`);
    setText(this.doorsText, `Doors ${sim.doors.state}${inhibit ? ` · no power: ${inhibit}` : ''}`);

    this.updateAlert(sim);
    if (this.settings.assistOverlay) this.updateAssist(sim);
  }

  /** @param {import('../sim/simulation.js').Simulation} sim */
  updateAlert(sim) {
    /** @type {[string, string] | null} */
    let alert = null;
    if (sim.penalty) {
      alert = ['danger', sim.train.isStationary ? 'Emergency brake applied. Press Q to reset.' : 'EMERGENCY BRAKE'];
    } else if (sim.aws.hornSounding) {
      alert = ['caution', 'AWS warning: press Q to acknowledge'];
    } else if (sim.dsd.warning) {
      alert = ['caution', this.settings.dsdMode === 'vigilance' ? 'Vigilance: press Space' : "Dead man's handle: hold Space"];
    } else if (sim.overspeed) {
      alert = ['caution', `Overspeed: limit ${this.speedText(sim.lineSpeed)}`];
    } else if (sim.result) {
      alert = ['good', `Run complete: ${sim.result.score} points`];
    }
    this.alert.hidden = !alert;
    if (alert) {
      this.alert.dataset.kind = alert[0];
      setText(this.alert, alert[1]);
    }
  }

  /**
   * The driving aid. Real drivers know the route by heart ("route knowledge"); this stands in for it.
   * @param {import('../sim/simulation.js').Simulation} sim
   */
  updateAssist(sim) {
    const lines = [];
    const front = sim.train.position;
    const next = sim.nextSignal;
    if (next) {
      const aspect = next.signal.aspect;
      lines.push(`<div class="assist-row"><span class="aspect aspect-${aspect}"></span><b>${next.signal.id}</b> in ${Math.round(next.distance)} m: ${ASPECT_INFO[/** @type {keyof typeof ASPECT_INFO} */ (aspect)].name}</div>`);
      if (aspect === Aspect.RED && sim.train.speed > 0.5) {
        const need = requiredDeceleration(sim.train.speed, Math.max(1, next.distance - 20));
        const advice = need < 0.15 ? 'coast for now' : need < 0.35 ? 'brake 1' : need < 0.65 ? 'brake 2' : need < 0.95 ? 'brake 3 now!' : 'too late, emergency!';
        lines.push(`<div class="assist-row assist-advice">To stop at it: ${need.toFixed(2)} m/s² → ${advice}</div>`);
      }
    }
    const change = sim.route.speedLimits.nextChange(front, sim.dir);
    if (change && Math.abs(change.position - front) < 4000) {
      lines.push(`<div class="assist-row">Speed limit ${this.speedText(change.value)} in ${Math.round(Math.abs(change.position - front))} m</div>`);
    }
    const g = sim.dir * sim.route.gradientAt(front);
    lines.push(`<div class="assist-row">Gradient: ${g === 0 ? 'level' : `1 in ${Math.round(1000 / Math.abs(g))} ${g > 0 ? 'rising' : 'falling'}`}</div>`);
    const obj = sim.route.data.objective;
    const platform = obj && sim.route.data.platforms.find((/** @type {any} */ p) => p.id === obj.platform);
    if (platform && !sim.result) {
      const marker = platform.stopMarkers?.[0]?.position ?? platform.to;
      const d = sim.dir * (marker - front);
      lines.push(`<div class="assist-row">Stop: ${platform.name} marker in ${d >= 0 ? `${Math.round(d)} m` : `${Math.round(-d)} m behind you`}</div>`);
    }
    lines.push('<div class="assist-keys">W/S controller · Q AWS / reset · Space DSD · D doors · R DRA · H horn · Tab hide · P pause</div>');
    const html = lines.join('');
    if (html !== this.assistHtml) {
      this.assistHtml = html;
      this.assist.innerHTML = html; // all text here is ours, never user input
    }
  }
}
