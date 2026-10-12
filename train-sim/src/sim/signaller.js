import { mphToMps } from '../core/units.js';
import { Aspect } from '../signals/aspects.js';

/** Seconds before the signaller answers the radio (A). */
const ANSWER_DELAY_S = 5;

/**
 * @typedef {object} Authority permission from the signaller to do something not normally allowed
 * @property {'pass-at-danger' | 'caution'} kind
 * @property {string | null} signalId the signal you may pass at danger
 * @property {string | null} untilSignal caution applies until you pass this signal
 * @property {string | null} crossingId crossing to cross slowly (failed barriers)
 * @property {number} maxSpeed m/s while the authority lasts
 */

/**
 * The signaller on the other end of the cab radio (GSM-R). Press C to call. They look at what's
 * going on and answer: a reason you're being held, permission to pass a failed signal, or
 * authority to carry on after a SPAD.
 */
export class Signaller {
  /** @param {import('./simulation.js').Simulation} sim */
  constructor(sim) {
    this.sim = sim;
    /** @type {null | { at: number }} */
    this.pending = null;
  }

  /** Driver calls the signaller. */
  call() {
    if (this.pending) return;
    this.pending = { at: this.sim.time + ANSWER_DELAY_S };
    this.sim.emit('radio', `Calling the signaller…`);
  }

  /**
   * The signaller speaks first (failures they know about).
   * @param {string} text
   */
  say(text) {
    this.sim.emit('signaller', `Signaller: ${text}`);
  }

  update() {
    if (!this.pending || this.sim.time < this.pending.at) return;
    this.pending = null;
    this.answer();
  }

  answer() {
    const sim = this.sim;
    const hc = sim.player.id;

    if (sim.spadPending) {
      sim.spadPending = false;
      sim.spadAuthorised = true;
      const next = sim.signalling.nextSignalAhead(sim.player.front, 8000);
      sim.authority = { kind: 'caution', signalId: null, untilSignal: next?.signal.id ?? null, crossingId: null, maxSpeed: mphToMps(20) };
      this.say(
        `Driver of ${hc}, you've passed ${sim.lastSpad ?? 'a signal'} at danger. Is everyone OK? Right. Reset your TPWS, then proceed at caution, no more than 20 mph, to the next signal${next ? ` (${next.signal.id})` : ''} and obey it.`,
      );
      return;
    }

    const ahead = sim.signalling.nextSignalAhead(sim.player.front, 400);
    if (sim.player.isStationary && ahead && ahead.signal.aspect === Aspect.RED) {
      const sig = ahead.signal;
      const after = sim.signalling.signalsAhead({ track: sig.key, s: sig.s }, 8000, 2).find((x) => x.signal.id !== sig.id);
      if (sig.failed) {
        sim.authority = { kind: 'pass-at-danger', signalId: sig.id, untilSignal: after?.signal.id ?? null, crossingId: null, maxSpeed: mphToMps(20) };
        this.say(
          `${sig.id} has failed at red. I'm authorising you to pass ${sig.id} at danger. Use the TPWS train stop override, then proceed at caution, no more than 20 mph, to the next signal and obey it.`,
        );
        return;
      }
      const lcReason = [...sig.held].find((r) => r.startsWith('lc:'));
      const lc = lcReason ? sim.crossings.byId.get(lcReason.slice(3)) : null;
      if (lc?.failure) {
        sim.authority = { kind: 'pass-at-danger', signalId: sig.id, untilSignal: after?.signal.id ?? null, crossingId: lc.id, maxSpeed: mphToMps(10) };
        this.say(
          `The barriers at ${lc.name} have failed to lower. I'm authorising you to pass ${sig.id} at danger. Use the train stop override, sound the horn, and cross ${lc.name} at no more than 10 mph, then obey the next signal.`,
        );
        return;
      }
      if (lc) {
        this.say(`${lc.name} level crossing is being lowered for you. You'll get ${sig.id} in a moment.`);
        return;
      }
      if (sig.approachHeld) {
        this.say(`${sig.id} is approach-controlled for the junction. It'll clear as you draw up to it.`);
        return;
      }
      const sec = sim.signalling.section(sig);
      if (sec.points.some((x) => !x.points.detected || x.points.state !== x.state)) {
        this.say(`I'm setting the route for another train across the junction first. You'll be next.`);
        return;
      }
      this.say(`There's a train in the section ahead of ${sig.id}. You'll get the signal when it's clear.`);
      return;
    }

    const trespasser = sim.trespassers.find((t) => !t.reported && t.seen);
    if (trespasser) {
      trespasser.reported = true;
      sim.stats.trespassReported++;
      this.say(`Thanks driver, I've got the British Transport Police on the way to the trespasser. Keep a good lookout through there.`);
      return;
    }

    this.say(`Signaller here. Nothing from me, carry on driver.`);
  }
}
