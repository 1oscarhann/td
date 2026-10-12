import { mphToMps } from '../core/units.js';
import { Aspect } from '../signals/aspects.js';
import { maxSpeedForDistance } from '../physics/braking.js';

/** Deceleration the AI plans its stops around (m/s²): brake step 2 with something in reserve. */
const PLAN_DECEL = 0.45;
/** How often the AI looks ahead (s). Between looks it just counts the distance down. */
const LOOK_EVERY_S = 0.25;
const LOOKAHEAD_M = 3000;

/**
 * @typedef {object} AICall
 * @property {import('../route/network.js').TrackPos} stop where the front should stop
 * @property {number} dep departure time, seconds since midnight
 * @property {string} station
 */

/**
 * A competent, slightly cautious driver for the other trains: keeps to the line speed, brakes
 * for red signals and lower limits on a plan of 0.45 m/s², calls at its booked stations,
 * waits for departure time, and leaves when the signal clears.
 */
export class AIDriver {
  /**
   * @param {import('./vehicle.js').Vehicle} vehicle
   * @param {{ calls?: AICall[], maxSpeedMps?: number, dwellS?: number, terminates?: boolean, holdS?: number }} [opts]
   *   holdS: wait this long before setting off (a train standing in a section at the start)
   */
  constructor(vehicle, { calls = [], maxSpeedMps = mphToMps(100), dwellS = 35, terminates = false, holdS = 0 } = {}) {
    this.v = vehicle;
    this.calls = calls;
    this.maxSpeed = maxSpeedMps;
    this.dwellS = dwellS;
    this.terminates = terminates;
    /** @type {'holding' | 'running' | 'dwelling' | 'closing' | 'finished'} */
    this.state = holdS > 0 ? 'holding' : 'running';
    this.holdS = holdS;
    this.timer = 0;
    this.lookTimer = 0;
    this.target = 0;
    /** Time we finished our last call, for removing terminating trains. */
    this.finishedAt = 0;
    /** Waiting at a red: which signal, for how long. */
    this.waiting = { signalId: '', time: 0 };
    /** Signaller's permission to pass a failed signal, and the caution that goes with it. */
    /** @type {null | { signalId: string, maxSpeed: number, until: string | null }} */
    this.authority = null;
  }

  /**
   * Signed distance to a stop marker (negative if we've just run past it), or null if it's not
   * on the route ahead within look-ahead range.
   * @param {AICall} call
   */
  distanceToStop(call) {
    const front = this.v.front;
    if (front.track === call.stop.track) {
      const t = this.v.network.track(front.track);
      const d = t.u(call.stop.s) - t.u(front.s);
      if (d > -40 && d < LOOKAHEAD_M) return d;
    }
    return this.v.network.distanceTo(front, call.stop, LOOKAHEAD_M);
  }

  get nextCall() {
    return this.calls[0] ?? null;
  }

  /**
   * @param {number} dt
   * @param {number} clock seconds since midnight
   * @param {import('../signals/signalling.js').Signalling} signalling
   * @param {(sig: import('../signals/signalling.js').SignalState) => number | null} [canPassAtDanger]
   *   the signaller: max speed (m/s) if this red signal may be passed (failure), else null
   */
  update(dt, clock, signalling, canPassAtDanger = () => null) {
    const v = this.v;
    const net = v.network;
    if (this.state === 'finished') {
      v.controller.set('B3');
      return;
    }
    if (this.state === 'holding') {
      v.controller.set('B3');
      this.timer += dt;
      if (this.timer >= this.holdS) {
        this.state = 'running';
        this.timer = 0;
      }
      return;
    }
    if (this.state === 'dwelling') {
      v.controller.set('B3');
      v.readyToStart = false;
      this.timer += dt;
      const call = /** @type {AICall} */ (this.nextCall);
      if (this.timer >= this.dwellS && clock >= call.dep) {
        this.state = 'closing';
        this.timer = 0;
      }
      return;
    }
    if (this.state === 'closing') {
      v.controller.set('B3');
      this.timer += dt;
      if (this.timer >= 6) {
        this.calls.shift();
        v.readyToStart = true;
        if (this.terminates && this.calls.length === 0) {
          this.state = 'finished';
          this.finishedAt = clock;
          return;
        }
        this.state = 'running';
        this.lookTimer = 0;
      }
      return;
    }

    // Running: work out the speed we should be doing.
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = LOOK_EVERY_S;
      const front = v.front;
      let target = Math.min(this.maxSpeed, net.speedLimitOver(v.body())) - mphToMps(1);
      const change = net.nextSpeedChange(front, LOOKAHEAD_M);
      if (change && change.value < target) {
        target = Math.min(target, Math.sqrt(change.value ** 2 + 2 * PLAN_DECEL * Math.max(0, change.distance - 60)));
      }
      if (this.authority) target = Math.min(target, this.authority.maxSpeed);
      const ahead = signalling.signalsAhead(front, LOOKAHEAD_M, 3);
      if (this.authority?.until && !ahead.some((x) => x.signal.id === this.authority?.until)) this.authority = null;
      for (const { signal, distance } of ahead) {
        if (signal.aspect !== Aspect.RED || this.authority?.signalId === signal.id) continue;
        target = Math.min(target, maxSpeedForDistance(Math.max(0, distance - 30), PLAN_DECEL, 1.5));
        // Stood at a red that won't clear? Ask the signaller after a minute.
        if (distance < 90 && v.isStationary) {
          if (this.waiting.signalId !== signal.id) this.waiting = { signalId: signal.id, time: 0 };
          this.waiting.time += LOOK_EVERY_S;
          const speed = this.waiting.time > 60 ? canPassAtDanger(signal) : null;
          if (speed !== null) {
            const after = signalling.signalsAhead({ track: signal.key, s: signal.s }, LOOKAHEAD_M, 2).find((x) => x.signal.id !== signal.id);
            this.authority = { signalId: signal.id, maxSpeed: speed, until: after?.signal.id ?? null };
            target = speed;
          }
        }
        break;
      }
      this.target = Math.max(0, target);
    }

    // The next stop is checked every step: stopping on the marker needs precision.
    const call = this.nextCall;
    if (call) {
      const d = this.distanceToStop(call);
      if (d !== null) {
        if (d < 2 && v.speed < 0.05) {
          this.state = 'dwelling';
          this.timer = 0;
          v.readyToStart = false;
          v.controller.set('B3');
          return;
        }
        if (d < -25) {
          this.calls.shift(); // overshot badly: give up on this stop
        } else {
          this.target = Math.min(this.target, d < 1 ? 0 : Math.max(0.6, maxSpeedForDistance(d - 0.5, PLAN_DECEL, 0.8)));
        }
      }
    }

    const speed = v.speed;
    const t = this.target;
    let notch = 'OFF';
    if (t <= 0.01 && speed < 0.3) notch = 'B3';
    else if (speed > t + 2.5) notch = 'B3';
    else if (speed > t + 1) notch = 'B2';
    else if (speed > t + 0.3) notch = 'B1';
    else if (speed < t - 3) notch = 'P4';
    else if (speed < t - 1) notch = 'P2';
    v.controller.set(notch);
  }
}
