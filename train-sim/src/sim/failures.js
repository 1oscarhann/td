import { mphToMps } from '../core/units.js';

/** Average minutes between random events, per setting. */
export const FAILURE_RATES = Object.freeze({ off: Infinity, rare: 30, normal: 12, frequent: 5 });

/**
 * @typedef {object} Trespasser
 * @property {string} track
 * @property {number} s
 * @property {number} lateral metres from the track centre (walks across)
 * @property {'on-track' | 'clearing' | 'gone'} state
 * @property {boolean} seen the driver has had a chance to see them (within 900 m)
 * @property {boolean} reported
 * @property {boolean} warned horn sounded while they were on the line
 */

/**
 * Random things going wrong ahead of the player: a signal failing at red, crossing barriers that
 * won't lower, someone walking on the line. One at a time, always well ahead so there's time to
 * react.
 */
export class Failures {
  /**
   * @param {import('./simulation.js').Simulation} sim
   * @param {{ frequency?: keyof typeof FAILURE_RATES, rng?: () => number }} [opts]
   */
  constructor(sim, { frequency = 'rare', rng = Math.random } = {}) {
    this.sim = sim;
    this.frequency = frequency;
    this.rng = rng;
    this.timer = 0;
    /** @type {null | { kind: 'signal' | 'crossing' | 'trespass', id: string }} */
    this.active = null;
  }

  /** @param {number} dt */
  update(dt) {
    const sim = this.sim;
    this.timer += dt;
    if (this.active) {
      this.checkCleared();
      return;
    }
    if (this.timer < 20) return; // roll the dice every 20 s
    this.timer = 0;
    const meanMin = FAILURE_RATES[this.frequency];
    if (!Number.isFinite(meanMin)) return;
    if (this.rng() > 20 / (meanMin * 60)) return;
    if (sim.time < 60 || sim.journey.complete) return;
    const roll = this.rng();
    if (roll < 0.4) this.failSignal();
    else if (roll < 0.7) this.failCrossing();
    else this.addTrespasser();
  }

  /**
   * Failures are "fixed" once the player is past them.
   */
  checkCleared() {
    const sim = this.sim;
    const a = this.active;
    if (!a) return;
    if (a.kind === 'signal') {
      const sig = sim.signalling.signals.get(a.id);
      if (!sig) return;
      const ahead = sim.signalling.signalsAhead(sim.player.front, 12000, 12).some((x) => x.signal.id === a.id);
      if (!ahead) {
        sig.failed = false;
        this.active = null;
      }
    } else if (a.kind === 'crossing') {
      const lc = sim.crossings.byId.get(a.id);
      if (!lc) return;
      const ahead = this.distanceToCrossing(lc) !== null;
      if (!ahead && !sim.player.body().some((p) => sim.network.track(p.track).line.id === lc.def.line && Math.abs(p.to - lc.def.position) < 200)) {
        lc.failure = null;
        sim.removeLimit(`lc:${lc.id}`);
        this.active = null;
      }
    } else if (!sim.trespassers.some((t) => t.state !== 'gone')) {
      this.active = null;
    }
  }

  /**
   * @param {import('./crossings.js').LevelCrossing} lc
   * @returns {number | null} distance along the player's route
   */
  distanceToCrossing(lc) {
    const sim = this.sim;
    /** @type {number | null} */
    let found = null;
    sim.network.walk(sim.player.front.track, sim.player.front.s, 8000, {
      decide: (p) => sim.player.plan.get(p.id) ?? p.state,
      onPiece: (piece, before) => {
        const t = sim.network.track(piece.track);
        if (t.line.id !== lc.def.line) return false;
        const u = t.u(lc.def.position);
        if (u > t.u(piece.from) && u <= t.u(piece.to)) {
          found = before + (u - t.u(piece.from));
          return true;
        }
        return false;
      },
    });
    return found;
  }

  failSignal() {
    const sim = this.sim;
    const options = sim.signalling
      .signalsAhead(sim.player.front, 6000, 6)
      .filter((x) => x.distance > 2000 && !x.signal.feather && !x.signal.held.size && x.signal.kind !== 'protecting');
    const pick = options[Math.floor(this.rng() * options.length)];
    if (!pick) return;
    pick.signal.failed = true;
    this.active = { kind: 'signal', id: pick.signal.id };
  }

  failCrossing() {
    const sim = this.sim;
    const options = sim.crossings.crossings.filter((lc) => {
      if (!lc.hasBarriers) return false;
      const d = this.distanceToCrossing(lc);
      return d !== null && d > 2500 && d < 7000;
    });
    const lc = options[Math.floor(this.rng() * options.length)];
    if (!lc) return;
    lc.failure = 'stuck-up';
    this.active = { kind: 'crossing', id: lc.id };
    if (lc.type === 'AHB') {
      // No signal protects an AHB, so the signaller tells you on the radio and imposes a limit.
      sim.addLimit({ id: `lc:${lc.id}`, line: lc.def.line, from: lc.def.position - 400, to: lc.def.position + 20, maxSpeed: mphToMps(10), reason: `${lc.name} failed` });
      sim.signaller.say(
        `Driver of ${sim.player.id}, ${lc.name} automatic half barriers have failed. Approach at caution, sound the horn, and don't go over the crossing faster than 10 mph.`,
      );
    }
  }

  addTrespasser() {
    const sim = this.sim;
    // Prefer a footpath crossing ahead: that's where people actually get on the line.
    const fp = sim.crossings.crossings.filter((lc) => !lc.hasBarriers).map((lc) => ({ lc, d: this.distanceToCrossing(lc) }));
    const near = fp.filter((x) => x.d !== null && /** @type {number} */ (x.d) > 1500 && /** @type {number} */ (x.d) < 5000);
    /** @type {import('../route/network.js').TrackPos | null} */
    let at = null;
    if (near.length) {
      const pick = near[Math.floor(this.rng() * near.length)];
      const res = sim.network.walk(sim.player.front.track, sim.player.front.s, /** @type {number} */ (pick.d), { decide: (p) => sim.player.plan.get(p.id) ?? p.state });
      at = { track: res.track, s: res.s };
    } else {
      const res = sim.network.walk(sim.player.front.track, sim.player.front.s, 1800 + this.rng() * 2000, { decide: (p) => sim.player.plan.get(p.id) ?? p.state });
      if (!res.end) at = { track: res.track, s: res.s };
    }
    if (!at) return;
    sim.trespassers.push({ track: at.track, s: at.s, lateral: -3, state: 'on-track', seen: false, reported: false, warned: false });
    this.active = { kind: 'trespass', id: `${at.track}@${Math.round(at.s)}` };
  }
}
