import { formatClock, mphToMps, mpsToMph, parseClock, pickInRange } from '../core/units.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';
import { CLASS_377_4 } from '../physics/trainSpec.js';
import { Aspect } from '../signals/aspects.js';
import { Signalling } from '../signals/signalling.js';
import { Interlocking } from '../signals/interlocking.js';
import { AWS } from '../safety/aws.js';
import { TPWS } from '../safety/tpws.js';
import { DSD } from '../safety/dsd.js';
import { Vehicle } from './vehicle.js';
import { AIDriver } from './aiDriver.js';
import { Doors } from './doors.js';
import { Journey } from './journey.js';
import { CrossingManager } from './crossings.js';
import { buildTrackside, itemsIn } from './trackside.js';
import { Environment, hornQuietPeriod } from './environment.js';
import { Signaller } from './signaller.js';
import { Failures } from './failures.js';
import { scoreJourney } from './scoring.js';

export { AWS_MAGNET_DISTANCE_M } from './trackside.js';

/** Small margin over the limit before it counts as overspeeding, so speedo jitter doesn't count. */
const OVERSPEED_MARGIN_MPS = mphToMps(1);
/** How long the TPWS train stop override lasts once pressed (s). */
export const TSO_DURATION_S = 20;
/** The signaller gives you 20 mph; we allow 2 mph before it counts as a breach. */
const CAUTION_MARGIN_MPS = mphToMps(2);

const PENALTY_TEXT = Object.freeze({
  aws: 'AWS warning not acknowledged',
  tpws: 'TPWS train stop: signal passed at danger',
  oss: 'TPWS overspeed sensor tripped',
  dsd: "driver's safety device released",
});

/**
 * Something that happened, for the HUD log, the audio and the PA.
 * @typedef {object} SimEvent
 * @property {string} type
 * @property {string} text
 * @property {number} time sim seconds
 * @property {any} [data]
 */

/**
 * @typedef {object} SimOptions
 * @property {import('../core/settings.js').Settings} [settings]
 * @property {() => number} [rng]
 * @property {import('../physics/trainSpec.js').TrainSpec} [spec]
 * @property {string} [serviceId] which service to drive (default: the first)
 * @property {number} [startCall] start from this stop on the service (resume)
 * @property {number} [timeShiftS] move the whole timetable by this many seconds (time of day)
 * @property {import('./environment.js').Weather} [weather]
 * @property {import('./environment.js').Season} [season]
 */

/**
 * The whole simulation, with no DOM, WebGL or audio in sight: the browser shell (main.js) feeds
 * it input and draws its state. That's what lets the tests drive whole journeys headless.
 */
export class Simulation {
  /**
   * @param {import('../route/route.js').Route} route
   * @param {SimOptions} [opts]
   */
  constructor(route, { settings = DEFAULT_SETTINGS, rng = Math.random, spec = CLASS_377_4, serviceId, startCall = 0, timeShiftS = 0, weather = 'clear', season = 'summer' } = {}) {
    this.route = route;
    this.network = route.network;
    this.network.reset();
    this.spec = spec;
    this.settings = settings;
    this.rng = rng;
    const data = route.data;
    this.service = route.service(serviceId ?? route.services[0].id);

    this.signalling = new Signalling(this.network, data.signals ?? [], { overlapM: data.signalling?.overlapM ?? 180 });
    this.interlocking = new Interlocking(this.network, this.signalling);
    this.crossings = new CrossingManager(this.network, this.signalling, data.levelCrossings ?? []);
    this.trackside = buildTrackside(this.network, this.signalling, data.levelCrossings ?? []);
    this.env = new Environment({ weather, season, leafZones: data.leafZones ?? [] });

    // The timetable, shifted to the chosen time of day.
    const t = (/** @type {string | undefined} */ v) => (v ? parseClock(v) + timeShiftS : null);
    /** @type {import('./journey.js').Call[]} */
    const calls = this.service.calls.map((/** @type {any} */ c) => {
      const platform = route.platform(c.platform);
      const station = c.station ?? platform.station;
      return {
        station,
        name: route.stationName(station),
        platform,
        stop: route.stopFor(c.platform, spec.cars),
        arr: t(c.arr),
        dep: t(c.dep),
        status: 'pending',
        actualArr: null,
        actualDep: null,
        stopErrorM: null,
        raGiven: false,
        startedWithoutRA: false,
      };
    });
    const k = Math.min(Math.max(0, startCall), calls.length - 2);
    this.startCall = k;
    const mine = calls.slice(k);
    const origin = mine[0];
    origin.arr = null;
    origin.status = 'arrived';
    this.journey = new Journey(this.network, mine);
    this.timeShiftS = timeShiftS;
    this.clockStart = (origin.dep ?? 0) - 90;
    this.time = 0;

    this.player = new Vehicle(this.network, { id: this.service.headcode ?? this.service.id, spec, front: origin.stop, notch: 'B3', plan: this.service.plan ?? {} });
    this.controller = this.player.controller;
    this.train = this.player.physics;
    this.doors = new Doors();
    this.doors.state = 'open'; // passengers boarding at the origin

    this.aws = new AWS();
    this.tpws = new TPWS();
    this.dsd = new DSD({ mode: settings.dsdMode });
    this.draSet = false;
    /** @type {null | 'aws' | 'tpws' | 'oss' | 'dsd'} latched emergency brake, until stopped and reset */
    this.penalty = null;
    this.spadPending = false;
    this.spadAuthorised = true;
    /** @type {string | null} */
    this.lastSpad = null;
    /** @type {import('./signaller.js').Authority | null} */
    this.authority = null;
    this.tsoUntil = -1;
    /** Temporary speed limits imposed during the run (failed AHB, etc.). */
    /** @type {{ id: string, line: string, from: number, to: number, maxSpeed: number, reason: string }[]} */
    this.limits = [];

    this.held = { hornHigh: false, hornLow: false, dsd: false };
    this.dsdPressed = false;
    this.hornLastSounded = -Infinity;
    /** @type {Map<string, number>} crossing id → time we passed its whistle board */
    this.whistlePending = new Map();
    /** @type {import('./failures.js').Trespasser[]} */
    this.trespassers = [];

    /** @type {{ vehicle: Vehicle, driver: AIDriver, def: any }[]} */
    this.ai = [];
    this.pendingTraffic = this.scheduleTraffic();

    this.signaller = new Signaller(this);
    this.failures = new Failures(this, { frequency: settings.failures ?? 'rare', rng });

    /** @type {SimEvent[]} */
    this.events = [];
    this.stats = {
      maxSpeed: 0,
      spads: 0,
      penalties: 0,
      overspeedS: 0,
      whistleMissed: 0,
      whistleSounded: 0,
      harshEvents: 0,
      cautionBreaches: 0,
      nearMisses: 0,
      trespassReported: 0,
      bufferStopHit: false,
      collision: false,
    };
    this.overspeed = false;
    this.cautionBreached = false;
    /** @type {null | { score: number, grade: string, breakdown: { label: string, points: number }[], timeS: number, ended?: string }} */
    this.result = null;
    /** @type {Set<string>} */
    this.announced = new Set();
    this.smoothAccel = 0;
    this.harshCooldown = 0;
    this.lastSlide = false;
    this.lastSlip = false;
    this.interlockTimer = 0;
    /** @type {import('./journey.js').Call | null} */
    this.lastCall = origin;

    this.spawnTraffic();
    this.interlocking.update(0, this.vehicles().map((v) => v.routing()));
    this.crossings.update(0, this.vehicles());
    this.refreshSignals();
  }

  // ── read-only views for the HUD, renderer and audio ─────────────────────────

  /** Time of day in seconds since midnight. */
  get clock() {
    return this.clockStart + this.time;
  }

  /** @returns {Vehicle[]} */
  vehicles() {
    return [this.player, ...this.ai.map((a) => a.vehicle)];
  }

  get trackId() {
    return this.player.front.track;
  }

  /** The speed limit for the whole train right now, including any caution the signaller set (m/s). */
  get lineSpeed() {
    const body = this.player.body();
    let limit = this.network.speedLimitOver(body);
    for (const l of this.limits) {
      if (body.some((p) => this.network.track(p.track).line.id === l.line && Math.max(p.from, p.to) >= l.from && Math.min(p.from, p.to) <= l.to)) {
        limit = Math.min(limit, l.maxSpeed);
      }
    }
    if (this.authority) limit = Math.min(limit, this.authority.maxSpeed);
    return limit;
  }

  get nextSignal() {
    return this.signalling.nextSignalAhead(this.player.front, 6000);
  }

  get brakeDemand() {
    return Math.max(this.controller.brakeDemand, this.penalty ? this.spec.brake.emergencyMps2 : 0);
  }

  get tractionInhibitReason() {
    if (this.penalty) return 'Penalty brake';
    if (!this.doors.closedAndLocked) return 'Doors not closed';
    if (this.draSet) return 'DRA set';
    return null;
  }

  get tsoActive() {
    return this.time < this.tsoUntil;
  }

  /**
   * @param {string} type
   * @param {string} text
   * @param {any} [data]
   */
  emit(type, text, data) {
    this.events.push({ type, text, time: this.time, data });
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** @param {{ id: string, line: string, from: number, to: number, maxSpeed: number, reason: string }} limit */
  addLimit(limit) {
    this.removeLimit(limit.id);
    this.limits.push(limit);
  }

  /** @param {string} id */
  removeLimit(id) {
    this.limits = this.limits.filter((l) => l.id !== id);
  }

  // ── AI traffic ──────────────────────────────────────────────────────────────

  /**
   * Turn the route's repeating traffic pattern into concrete trains for the next few hours.
   * Pattern times are minutes past the hour.
   */
  scheduleTraffic() {
    /** @type {{ at: number, def: any }[]} */
    const list = [];
    const pattern = this.route.data.traffic ?? [];
    const from = this.clockStart - 30;
    const to = this.clockStart + 3 * 3600;
    for (const def of pattern) {
      const offset = parseClock(def.appear);
      if (def.once) {
        const at = offset + this.timeShiftS;
        if (at >= from && at <= to) list.push({ at, def });
        continue;
      }
      for (let h = Math.floor(from / 3600) - 1; h <= Math.ceil(to / 3600); h++) {
        const at = h * 3600 + (offset % 3600);
        if (at >= from && at <= to) list.push({ at, def });
      }
    }
    return list.sort((a, b) => a.at - b.at);
  }

  /** Is the line near a spawn point free? */
  entryClear(/** @type {import('../route/network.js').TrackPos} */ entry) {
    const t = this.network.track(entry.track);
    const lo = t.u(entry.s) - this.spec.lengthM - 400;
    const hi = t.u(entry.s) + 600;
    for (const v of this.vehicles()) {
      for (const p of v.body()) {
        if (p.track !== entry.track) continue;
        const a = Math.min(t.u(p.from), t.u(p.to));
        const b = Math.max(t.u(p.from), t.u(p.to));
        if (b > lo && a < hi) return false;
      }
    }
    return true;
  }

  spawnTraffic() {
    while (this.pendingTraffic.length && this.pendingTraffic[0].at <= this.clock) {
      const next = this.pendingTraffic[0];
      const def = next.def;
      const entry = { track: `${def.entry.line}/${def.entry.track}`, s: def.entry.position };
      if (!this.entryClear(entry)) {
        next.at = this.clock + 20; // try again shortly
        this.pendingTraffic.sort((a, b) => a.at - b.at);
        return;
      }
      this.pendingTraffic.shift();
      const vehicle = new Vehicle(this.network, {
        id: `${def.id}-${Math.round(next.at)}`,
        spec: this.spec,
        front: entry,
        notch: 'OFF',
        plan: def.plan ?? {},
        speed: mphToMps(def.speedMph ?? 0),
      });
      vehicle.headcode = def.id;
      vehicle.description = def.name ?? def.id;
      const calls = (def.calls ?? []).map((/** @type {any} */ c) => ({
        stop: this.route.stopFor(c.platform, this.spec.cars),
        dep: -Infinity,
        station: this.route.platform(c.platform).station,
      }));
      const driver = new AIDriver(vehicle, {
        calls,
        terminates: !!def.terminates,
        dwellS: def.dwellS ?? 35,
        holdS: def.holdS === undefined ? 0 : pickInRange(def.holdS, this.rng),
        maxSpeedMps: mphToMps(def.maxSpeedMph ?? 100),
      });
      if (def.startsAtPlatform) {
        driver.state = 'dwelling';
        driver.timer = 0;
      }
      this.ai.push({ vehicle, driver, def });
    }
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
    if (input.hornHigh || input.hornLow) this.hornLastSounded = this.time;
    this.held.dsd = input.dsdHeld;
    if (input.dsdPressed) this.dsdPressed = true;
    if (input.awsAck) this.pressAwsButton();
    if (input.doorsToggle) this.pressDoorButton();
    if (input.draToggle) {
      this.draSet = !this.draSet;
      this.emit('dra', this.draSet ? 'DRA set: traction power isolated' : 'DRA released');
    }
    if (input.tso) {
      this.tsoUntil = this.time + TSO_DURATION_S;
      this.emit('tso', 'TPWS train stop override: active for 20 seconds');
    }
    if (input.radio) this.signaller.call();
  }

  /** Q: acknowledge an AWS warning, or reset a penalty brake once stopped. */
  pressAwsButton() {
    if (this.aws.acknowledge()) {
      this.emit('aws-ack', 'AWS warning acknowledged');
      return;
    }
    if (!this.penalty) return;
    if (!this.player.isStationary) {
      this.emit('message', 'Penalty brake: wait until the train has stopped, then press Q to reset');
      return;
    }
    if (this.controller.isPower) {
      this.emit('message', 'Take power off before resetting the penalty brake');
      return;
    }
    if (this.spadPending || !this.spadAuthorised) {
      this.emit('message', "You've passed a signal at danger: call the signaller (C) before you move");
      return;
    }
    this.aws.clearPenalty();
    this.tpws.clear();
    this.dsd.clearPenalty();
    this.penalty = null;
    this.emit('penalty-reset', 'Penalty brake reset');
  }

  pressDoorButton() {
    const call = this.journey.current;
    const atPlatform = this.atAnyPlatform();
    const result = this.doors.toggle(this.player.isStationary && atPlatform);
    if (result === 'refused') {
      this.emit('message', this.player.isStationary ? 'No platform alongside the whole train: doors stay shut' : 'Doors only open at a stand');
      return;
    }
    if (result === 'closing' && call?.status === 'arrived' && call.dep !== null && this.clock < call.dep - 15) {
      this.emit('message', `Closing early: booked departure is ${formatClock(call.dep).slice(0, 5)}`);
    }
    this.emit('doors', result === 'opening' ? 'Doors opening' : 'Doors closing', { state: result });
  }

  /** Whole train alongside some platform on its track. */
  atAnyPlatform() {
    const body = this.player.body();
    for (const p of this.route.platforms.values()) {
      const key = `${p.line}/${p.track}`;
      if (body.every((piece) => piece.track === key && Math.min(piece.from, piece.to) >= p.from - 0.5 && Math.max(piece.from, piece.to) <= p.to + 0.5)) return true;
    }
    return false;
  }

  // ── one fixed physics step ──────────────────────────────────────────────────

  /** @param {number} dt seconds */
  step(dt) {
    if (this.result?.ended) return;
    this.time += dt;
    const clock = this.clock;

    // 1. Signalling and crossings react to where everything is.
    this.spawnTraffic();
    this.interlockTimer -= dt;
    if (this.interlockTimer <= 0) {
      this.interlockTimer = 0.5;
      this.interlocking.update(this.time, this.vehicles().map((v) => v.routing()));
    }
    this.player.readyToStart = this.journey.readyToStart(this.doors.closedAndLocked) && !this.draSet;
    this.crossings.update(dt, this.vehicles());
    this.refreshSignals();

    // 2. Other trains.
    for (const a of this.ai) {
      a.driver.update(dt, clock, this.signalling, (sig) => this.failureAuthority(sig));
      a.vehicle.step(dt, {
        powerDemand: a.vehicle.controller.powerDemand,
        brakeDemand: a.vehicle.controller.brakeDemand,
        adhesion: this.env.adhesionAt(a.vehicle.front, this.network),
      });
    }
    this.ai = this.ai.filter((a) => !a.vehicle.leftNetwork && !(a.driver.state === 'finished' && clock - a.driver.finishedAt > 180));

    // 3. Safety systems on timers.
    if (this.aws.update(dt)) this.applyPenalty('aws');
    const active = !this.player.isStationary || this.controller.isPower;
    if (this.dsd.update(dt, { held: this.held.dsd, pressed: this.dsdPressed, active })) this.applyPenalty('dsd');
    this.dsdPressed = false;

    // 4. The player's train.
    this.player.step(dt, {
      powerDemand: this.tractionInhibitReason ? 0 : this.controller.powerDemand,
      brakeDemand: this.brakeDemand,
      adhesion: this.env.adhesionAt(this.player.middle(), this.network),
    });
    this.checkGrip();
    this.checkComfort(dt);

    // 5. Anything the front ran over.
    for (const piece of this.player.lastPieces) {
      for (const item of itemsIn(this.trackside, this.network, piece)) this.passItem(item);
    }

    // 6. Doors, timetable, speed, trespassers, the radio, random failures.
    const doorState = this.doors.update(dt);
    if (doorState) this.emit('doors', doorState === 'open' ? 'Doors open' : 'Doors closed and locked', { state: doorState });
    const before = this.journey.current;
    const beforeStatus = before?.status;
    this.journey.update({ clock, vehicle: this.player, doors: this.doors, emit: (type, text, d) => this.emit(type, text, d) });
    if (before && beforeStatus === 'arrived' && before.status === 'departed') {
      this.emit('departed', `Departed ${before.name}`, { station: before.station, callIndex: this.startCall + this.journey.calls.indexOf(before), next: this.journey.current?.name ?? null });
    }
    this.checkAnnouncements();
    this.updateSpeedChecks(dt);
    this.updateTrespassers(dt);
    this.signaller.update();
    this.failures.update(dt);
    this.checkEndings();
  }

  /**
   * Would the signaller let a train past this red signal? Only for failures: a failed signal
   * (20 mph to the next signal) or a crossing whose barriers won't lower (10 mph over it).
   * @param {import('../signals/signalling.js').SignalState} sig
   * @returns {number | null} max speed, m/s
   */
  failureAuthority(sig) {
    if (sig.failed) return mphToMps(20);
    for (const reason of sig.held) {
      if (!reason.startsWith('lc:')) return null;
      if (!this.crossings.byId.get(reason.slice(3))?.failure) return null;
    }
    return sig.held.size ? mphToMps(10) : null;
  }

  /** Occupancy of every track, then all aspects. */
  refreshSignals() {
    /** @type {Map<string, [number, number][]>} */
    const occ = new Map();
    for (const v of this.vehicles()) {
      for (const p of v.body()) {
        const list = occ.get(p.track) ?? [];
        list.push([Math.min(p.from, p.to), Math.max(p.from, p.to)]);
        occ.set(p.track, list);
      }
    }
    this.signalling.update(occ, this.vehicles().map((v) => v.front));
  }

  /**
   * @param {import('./trackside.js').TracksideItem} item
   */
  passItem(item) {
    const speed = this.player.speed;
    switch (item.kind) {
      case 'aws': {
        const aspect = item.psr ? Aspect.YELLOW : this.signalling.aspectOf(/** @type {string} */ (item.signalId));
        if (this.aws.passMagnet(aspect) === 'bell') this.emit('aws-bell', `AWS bell: ${item.signalId} clear`);
        else this.emit('aws-horn', item.psr ? 'AWS warning: speed restriction ahead, press Q' : `AWS warning for ${item.signalId}: press Q`, { signalId: item.signalId });
        break;
      }
      case 'tss': {
        const sig = this.signalling.get(/** @type {string} */ (item.signalId));
        this.passSignal(sig);
        break;
      }
      case 'oss': {
        if (item.signalId && this.signalling.aspectOf(item.signalId) !== Aspect.RED) break;
        if (item.signalId && this.tsoActive && this.authority?.signalId === item.signalId) break;
        if (speed > /** @type {number} */ (item.setSpeed)) {
          this.emit('tpws-oss', `TPWS overspeed: ${Math.round(mpsToMph(speed))} mph over a ${Math.round(mpsToMph(/** @type {number} */ (item.setSpeed)))} mph sensor`);
          this.applyPenalty('oss');
        }
        break;
      }
      case 'whistle':
        this.whistlePending.set(/** @type {string} */ (item.crossingId), this.time);
        break;
      case 'crossing':
        this.passCrossing(/** @type {string} */ (item.crossingId));
        break;
      default:
        break;
    }
  }

  /** @param {import('../signals/signalling.js').SignalState} sig */
  passSignal(sig) {
    if (this.authority && this.authority.untilSignal === sig.id) {
      this.authority = null;
      this.emit('authority-ended', `Passed ${sig.id}: caution authority ends, normal working`);
    }
    if (sig.aspect !== Aspect.RED) return;
    const authorised = this.authority?.kind === 'pass-at-danger' && this.authority.signalId === sig.id;
    if (!authorised) {
      this.stats.spads++;
      this.lastSpad = sig.id;
      this.spadPending = true;
      this.spadAuthorised = false;
      this.emit('spad', `SPAD: ${sig.id} passed at danger`, { signalId: sig.id });
      if (this.settings.spadEndsRun) this.endRun(`SPAD at ${sig.id}`);
    } else {
      this.emit('passed-at-danger', `Passing ${sig.id} at danger with the signaller's authority`);
    }
    if (sig.tpws === false) return;
    if (this.tsoActive) {
      this.emit('tpws-override', 'TPWS train stop overridden');
      this.tsoUntil = -1;
      return;
    }
    if (this.tpws.passSignal(sig.id, sig.aspect)) this.applyPenalty('tpws');
  }

  /** @param {string} id */
  passCrossing(id) {
    const lc = this.crossings.byId.get(id);
    if (!lc) return;
    const boardAt = this.whistlePending.get(id);
    if (boardAt !== undefined) {
      this.whistlePending.delete(id);
      if (this.hornLastSounded >= boardAt) this.stats.whistleSounded++;
      else if (!hornQuietPeriod(this.clock)) {
        this.stats.whistleMissed++;
        this.emit('whistle-missed', `Horn not sounded for ${lc.name}`);
      }
    }
    if (lc.failure) {
      if (this.player.speed > mphToMps(10) + CAUTION_MARGIN_MPS) {
        this.stats.cautionBreaches++;
        this.emit('caution-breach', `Over ${lc.name} at ${Math.round(mpsToMph(this.player.speed))} mph with the barriers failed (max 10)`);
      }
      if (this.time - this.hornLastSounded > 30) {
        this.stats.whistleMissed++;
        this.emit('whistle-missed', `Sound the horn over a failed crossing (${lc.name})`);
      }
    }
  }

  /** @param {'aws' | 'tpws' | 'oss' | 'dsd'} reason */
  applyPenalty(reason) {
    if (this.penalty) return;
    this.penalty = reason;
    if (reason !== 'tpws' || !this.spadPending) this.stats.penalties++;
    this.emit('penalty', `Emergency brake: ${PENALTY_TEXT[reason]}. Stop, then press Q to reset.`, { reason });
  }

  checkGrip() {
    const t = this.train;
    if (t.sliding && !this.lastSlide) this.emit('wheel-slide', 'Wheel slide: WSP working, low adhesion');
    if (t.slipping && !this.lastSlip) this.emit('wheel-slip', 'Wheel spin: ease off the power');
    this.lastSlide = t.sliding;
    this.lastSlip = t.slipping;
  }

  /**
   * Passengers notice jerk (how suddenly acceleration changes) more than braking itself.
   * @param {number} dt
   */
  checkComfort(dt) {
    const k = 1 - Math.exp(-dt / 0.4);
    const before = this.smoothAccel;
    this.smoothAccel += (this.train.acceleration - this.smoothAccel) * k;
    const jerk = (this.smoothAccel - before) / dt;
    this.harshCooldown -= dt;
    const harsh = (Math.abs(jerk) > 1.2 && this.player.speed > 1) || (this.controller.isEmergency && this.player.speed > mphToMps(5) && !this.penalty);
    if (harsh && this.harshCooldown <= 0) {
      this.stats.harshEvents++;
      this.harshCooldown = 6;
      this.emit('harsh', 'That was rough on the passengers');
    }
  }

  checkAnnouncements() {
    const call = this.journey.current;
    if (!call || call.status !== 'pending') return;
    const key = `approach:${call.station}`;
    if (this.announced.has(key)) return;
    const d = this.journey.toStop(call, this.player.front);
    if (d < 1500) {
      this.announced.add(key);
      const isLast = call === this.journey.destination;
      this.emit('approaching', `Approaching ${call.name}${isLast ? ' (terminates)' : ''}`, { station: call.station, name: call.name, last: isLast });
    }
  }

  /** @param {number} dt */
  updateSpeedChecks(dt) {
    const speed = this.player.speed;
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, speed);
    const limit = this.lineSpeed;
    const over = speed > limit + OVERSPEED_MARGIN_MPS;
    if (over !== this.overspeed) {
      this.overspeed = over;
      if (over) this.emit('overspeed', `Overspeed: limit is ${Math.round(mpsToMph(limit))} mph`);
    }
    if (over) this.stats.overspeedS += dt;
    const cautionLimit = this.authority?.maxSpeed;
    const breach = cautionLimit !== undefined && speed > cautionLimit + CAUTION_MARGIN_MPS;
    if (breach && !this.cautionBreached) {
      this.stats.cautionBreaches++;
      this.emit('caution-breach', `Too fast under caution: max ${Math.round(mpsToMph(cautionLimit))} mph`);
    }
    this.cautionBreached = breach;
  }

  /** @param {number} dt */
  updateTrespassers(dt) {
    for (const tp of this.trespassers) {
      if (tp.state === 'gone') continue;
      const d = this.network.distanceTo(this.player.front, { track: tp.track, s: tp.s }, 6000);
      if (tp.state === 'clearing') {
        tp.lateral -= dt * 2.5;
        if (tp.lateral < -9) tp.state = 'gone';
        continue;
      }
      tp.lateral = -2 + 2 * Math.sin(this.time * 0.3);
      if (d === null) {
        tp.state = 'gone';
        continue;
      }
      if (d < 900) tp.seen = true;
      if (d < 900 && this.time - this.hornLastSounded < 1) {
        tp.warned = true;
        tp.state = 'clearing';
        this.emit('trespass-clear', 'The trespasser has heard you and is getting off the line');
      } else if (d < 120) {
        tp.state = 'clearing';
        tp.lateral = -4;
        this.stats.nearMisses++;
        this.emit('near-miss', 'Near miss! Sound the horn as soon as you see someone on the line, and call the signaller (C)');
      } else if (tp.seen && !this.announced.has(`trespass:${tp.s}`)) {
        this.announced.add(`trespass:${tp.s}`);
        this.emit('trespass', 'Person on the line ahead! Sound the horn (H) and be ready to stop');
      }
    }
  }

  checkEndings() {
    const p = this.player;
    if (p.bufferImpact > 0 && !this.stats.bufferStopHit) {
      if (p.bufferImpact > mphToMps(3)) {
        this.stats.bufferStopHit = true;
        this.emit('buffers', `Hit the buffer stops at ${Math.round(mpsToMph(p.bufferImpact))} mph`);
      }
      p.bufferImpact = 0;
    }
    if (p.leftNetwork && !this.result) {
      p.physics.velocity = 0;
      this.endRun('Ran off the end of the modelled route');
      return;
    }
    // Collision: our front inside another train's body.
    const f = p.front;
    for (const a of this.ai) {
      for (const piece of a.vehicle.body()) {
        if (piece.track !== f.track) continue;
        const lo = Math.min(piece.from, piece.to);
        const hi = Math.max(piece.from, piece.to);
        if (f.s > lo + 0.5 && f.s < hi - 0.5 && !this.stats.collision) {
          this.stats.collision = true;
          p.physics.velocity = 0;
          a.vehicle.physics.velocity = 0;
          this.emit('collision', `Collision with ${a.def.id}`);
          this.endRun('Collision');
          return;
        }
      }
    }
    if (this.journey.complete && !this.result) {
      const { score, grade, breakdown } = scoreJourney(this.journey.calls, this.stats);
      this.result = { score, grade, breakdown, timeS: this.time };
      this.emit('run-complete', `Journey complete: ${score} points (${grade})`, { result: this.result });
    }
  }

  /** @param {string} reason */
  endRun(reason) {
    if (this.result) return;
    const { breakdown } = scoreJourney(this.journey.calls, this.stats);
    this.result = { score: 0, grade: '—', breakdown: [{ label: `Run ended: ${reason}`, points: 0 }, ...breakdown.slice(1)], timeS: this.time, ended: reason };
    this.emit('run-ended', `Run ended: ${reason}`, { result: this.result });
  }

  /** For the HUD: describe the next booked stop. */
  get nextStop() {
    const call = this.journey.current;
    if (!call) return null;
    return { call, distance: call.status === 'pending' ? this.journey.toStop(call, this.player.front) : 0 };
  }
}
