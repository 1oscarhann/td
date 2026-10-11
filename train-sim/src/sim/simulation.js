import { mphToMps, mpsToMph, parseClock, pickInRange } from '../core/units.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';
import { CLASS_377_4 } from '../physics/trainSpec.js';
import { Controller } from '../physics/controller.js';
import { Train } from '../physics/train.js';
import { Aspect } from '../signals/aspects.js';
import { SignalSystem } from '../signals/signalSystem.js';
import { AWS } from '../safety/aws.js';
import { TPWS } from '../safety/tpws.js';
import { DSD } from '../safety/dsd.js';
import { ScriptedTrain } from './aiTrain.js';
import { Doors } from './doors.js';
import { scoreRun } from './scoring.js';

/** AWS magnets sit this far before their signal (UK standard 180 m, about 200 yards). */
export const AWS_MAGNET_DISTANCE_M = 180;

/** Small margin over the limit before we call it overspeeding, so speedo jitter doesn't count. */
const OVERSPEED_MARGIN_MPS = mphToMps(1);

const PENALTY_TEXT = Object.freeze({
  aws: 'AWS warning not acknowledged',
  tpws: 'TPWS train stop: signal passed at danger',
  dsd: "driver's safety device released",
});

/**
 * Something that happened, for the HUD log and the audio.
 * @typedef {object} SimEvent
 * @property {string} type
 * @property {string} text
 * @property {number} time sim seconds
 * @property {Record<string, unknown>} [data]
 */

/**
 * The whole simulation, with no DOM, WebGL or audio in sight: the browser shell (main.js) feeds
 * it input and draws its state. That's what lets the tests drive a whole run headless.
 */
export class Simulation {
  /**
   * @param {import('../route/route.js').Route} route
   * @param {{ settings?: import('../core/settings.js').Settings, rng?: () => number, spec?: import('../physics/trainSpec.js').TrainSpec }} [opts]
   */
  constructor(route, { settings = DEFAULT_SETTINGS, rng = Math.random, spec = CLASS_377_4 } = {}) {
    this.route = route;
    this.spec = spec;
    const start = route.data.trains.player;
    this.trackId = /** @type {string} */ (start.track);
    this.dir = route.track(this.trackId).dir;
    this.controller = new Controller(spec, start.notch ?? 'B3');
    this.train = new Train(spec, { position: start.frontPosition, dir: this.dir, brakeDemand: this.controller.brakeDemand });

    this.aws = new AWS();
    this.tpws = new TPWS();
    this.dsd = new DSD({ mode: settings.dsdMode });
    this.doors = new Doors();
    this.draSet = false;
    /** @type {null | 'aws' | 'tpws' | 'dsd'} latched emergency brake, until stopped and reset */
    this.penalty = null;

    this.time = 0;
    this.clockStart = parseClock(route.data.startTime ?? '09:00:00');
    this.held = { hornHigh: false, hornLow: false, dsd: false };
    this.dsdPressed = false;

    this.ai = (route.data.trains.ai ?? []).map(
      (/** @type {any} */ cfg) =>
        new ScriptedTrain({
          id: cfg.id,
          track: cfg.track,
          dir: route.track(cfg.track).dir,
          frontPosition: cfg.frontPosition,
          lengthM: cfg.lengthM ?? spec.lengthM,
          departAtS: pickInRange(cfg.departAt ?? 0, rng),
          accelMps2: cfg.accelMps2 ?? 0.5,
          maxSpeedMps: mphToMps(cfg.maxSpeedMph ?? 60),
        }),
    );

    // Milestone 1 signals the player's track only. Each track gets its own SignalSystem later.
    this.signalling = new SignalSystem(route.signalsOnTrack(this.trackId), {
      overlapM: route.data.signalling?.overlapM ?? 180,
      endOfLine: route.data.signalling?.endOfLine ?? 'open',
      lineEnd: this.dir > 0 ? route.length : 0,
    });
    this.awsMagnets = this.signalling.signals
      .filter((s) => s.aws !== false)
      .map((s) => ({ signalId: s.id, position: s.position - this.dir * AWS_MAGNET_DISTANCE_M }));

    /** @type {SimEvent[]} */
    this.events = [];
    this.stats = { maxSpeed: 0, spads: 0, penalties: 0, overspeedS: 0 };
    this.overspeed = false;
    /** @type {null | { score: number, breakdown: { label: string, points: number }[], timeS: number, stopErrorM: number }} */
    this.result = null;

    this.signalling.update(this.occupants());
  }

  // ── read-only views for the HUD, renderer and audio ─────────────────────────

  /** Wall-clock time of day in seconds since midnight. */
  get clock() {
    return this.clockStart + this.time;
  }

  /** The speed limit that applies to the whole train right now (m/s). */
  get lineSpeed() {
    return this.route.speedLimitOver(this.train.rearPosition, this.train.position);
  }

  get nextSignal() {
    return this.signalling.nextSignalAhead(this.train.position);
  }

  /** Deceleration being demanded: the driver's brake, or the emergency brake if a penalty is latched. */
  get brakeDemand() {
    return Math.max(this.controller.brakeDemand, this.penalty ? this.spec.brake.emergencyMps2 : 0);
  }

  /** Why power is cut off, or null if it isn't. */
  get tractionInhibitReason() {
    if (this.penalty) return 'Penalty brake';
    if (!this.doors.closedAndLocked) return 'Doors not closed';
    if (this.draSet) return 'DRA set';
    return null;
  }

  /** @returns {{ front: number, rear: number }[]} everything on the player's track */
  occupants() {
    return [this.train, ...this.ai.filter((t) => t.track === this.trackId)].map((t) => ({
      front: t.position,
      rear: t.rearPosition,
    }));
  }

  /**
   * @param {string} type
   * @param {string} text
   * @param {Record<string, unknown>} [data]
   */
  emit(type, text, data) {
    this.events.push({ type, text, time: this.time, data });
  }

  /** Hand over (and forget) everything that happened since the last call. */
  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  // ── driver input, applied once per rendered frame ───────────────────────────

  /** @param {import('../core/input.js').DriverInput} input */
  applyInput(input) {
    if (input.notchSteps && this.controller.move(input.notchSteps)) {
      const reason = this.tractionInhibitReason;
      if (this.controller.isPower && reason) this.emit('traction-inhibited', `No power: ${reason}`);
    }
    this.held.hornHigh = input.hornHigh;
    this.held.hornLow = input.hornLow;
    this.held.dsd = input.dsdHeld;
    if (input.dsdPressed) this.dsdPressed = true;
    if (input.awsAck) this.pressAwsButton();
    if (input.doorsToggle) this.pressDoorButton();
    if (input.draToggle) {
      this.draSet = !this.draSet;
      this.emit('dra', this.draSet ? 'DRA set: traction power isolated' : 'DRA released');
    }
  }

  /** Q: acknowledge an AWS warning, or reset a penalty brake once stopped. */
  pressAwsButton() {
    if (this.aws.acknowledge()) {
      this.emit('aws-ack', 'AWS warning acknowledged');
      return;
    }
    if (!this.penalty) return;
    if (!this.train.isStationary) {
      this.emit('message', 'Penalty brake: wait until the train has stopped, then press Q to reset');
      return;
    }
    if (this.controller.isPower) {
      this.emit('message', 'Take power off before resetting the penalty brake');
      return;
    }
    this.aws.clearPenalty();
    this.tpws.clear();
    this.dsd.clearPenalty();
    this.penalty = null;
    this.emit('penalty-reset', 'Penalty brake reset');
  }

  pressDoorButton() {
    const platform = this.route.platformAlongside(this.trackId, this.train.rearPosition, this.train.position);
    const result = this.doors.toggle(this.train.isStationary && platform !== null);
    if (result === 'refused') {
      this.emit('message', this.train.isStationary ? 'No platform alongside the whole train: doors stay shut' : 'Doors only open at a stand');
    } else {
      this.emit('doors', result === 'opening' ? 'Doors opening' : 'Doors closing', { state: result });
    }
  }

  // ── one fixed physics step ──────────────────────────────────────────────────

  /** @param {number} dt seconds */
  step(dt) {
    this.time += dt;

    // 1. Other trains move, then the signals react to where everything is. The player's train is
    //    still where it was at the start of the step, so these are the aspects we drive past.
    for (const t of this.ai) t.update(dt, this.time);
    this.signalling.update(this.occupants());

    // 2. Safety systems that run on timers.
    if (this.aws.update(dt)) this.applyPenalty('aws');
    const active = !this.train.isStationary || this.controller.isPower;
    if (this.dsd.update(dt, { held: this.held.dsd, pressed: this.dsdPressed, active })) this.applyPenalty('dsd');
    this.dsdPressed = false;

    // 3. The train itself.
    const before = this.train.position;
    const midTrain = this.train.position - (this.dir * this.spec.lengthM) / 2;
    this.train.step(dt, {
      powerDemand: this.tractionInhibitReason ? 0 : this.controller.powerDemand,
      brakeDemand: this.brakeDemand,
      gradientPermille: this.dir * this.route.gradientAt(midTrain),
    });

    // 4. Anything the front of the train ran over.
    this.checkPassings(before, this.train.position);

    // 5. Doors, speed checks, the objective.
    const doorState = this.doors.update(dt);
    if (doorState) this.emit('doors', doorState === 'open' ? 'Doors open' : 'Doors closed and locked', { state: doorState });
    this.updateSpeedChecks(dt);
    this.checkObjective();
  }

  /**
   * @param {number} from front chainage before the step
   * @param {number} to front chainage after it
   */
  checkPassings(from, to) {
    const u0 = this.dir * from;
    const u1 = this.dir * to;
    if (u1 <= u0) return; // AWS and TPWS only act on trains going forwards past them
    const crossed = (/** @type {number} */ chainage) => {
      const u = this.dir * chainage;
      return u > u0 && u <= u1;
    };

    for (const magnet of this.awsMagnets) {
      if (!crossed(magnet.position)) continue;
      const aspect = this.signalling.aspectOf(magnet.signalId);
      if (this.aws.passMagnet(aspect) === 'bell') this.emit('aws-bell', `AWS bell: ${magnet.signalId} clear`);
      else this.emit('aws-horn', `AWS warning for ${magnet.signalId}: press Q`, { signalId: magnet.signalId });
    }

    for (const sig of this.signalling.signals) {
      if (!crossed(sig.position)) continue;
      if (sig.aspect !== Aspect.RED) continue;
      this.stats.spads++;
      this.emit('spad', `SPAD: ${sig.id} passed at danger`, { signalId: sig.id });
      if (sig.tpws !== false && this.tpws.passSignal(sig.id, sig.aspect)) this.applyPenalty('tpws');
    }
  }

  /** @param {'aws' | 'tpws' | 'dsd'} reason */
  applyPenalty(reason) {
    if (this.penalty) return;
    this.penalty = reason;
    this.stats.penalties++;
    this.emit('penalty', `Emergency brake: ${PENALTY_TEXT[reason]}. Stop, then press Q to reset.`, { reason });
  }

  /** @param {number} dt */
  updateSpeedChecks(dt) {
    const speed = this.train.speed;
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, speed);
    const limit = this.lineSpeed;
    const over = speed > limit + OVERSPEED_MARGIN_MPS;
    if (over !== this.overspeed) {
      this.overspeed = over;
      if (over) this.emit('overspeed', `Overspeed: limit is ${Math.round(mpsToMph(limit))} mph`);
    }
    if (over) this.stats.overspeedS += dt;
  }

  checkObjective() {
    const obj = this.route.data.objective;
    if (this.result || !obj || this.doors.state !== 'open' || !this.train.isStationary) return;
    const platform = this.route.platformAlongside(this.trackId, this.train.rearPosition, this.train.position);
    if (!platform || platform.id !== obj.platform) return;
    const marker = (platform.stopMarkers ?? []).find((/** @type {any} */ m) => m.cars === this.spec.cars) ?? platform.stopMarkers?.[0];
    const stopErrorM = marker ? this.dir * (this.train.position - marker.position) : 0;
    const { score, breakdown } = scoreRun(this.stats, stopErrorM);
    this.result = { score, breakdown, timeS: this.time, stopErrorM };
    this.emit('run-complete', `Run complete at ${platform.name}: ${score} points`, { result: this.result });
  }
}
