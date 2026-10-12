import { formatClock } from '../core/units.js';

/**
 * @typedef {object} Call a booked stop on the player's service
 * @property {string} station station id, e.g. "BAA"
 * @property {string} name
 * @property {any} platform platform def from the route
 * @property {import('../route/network.js').TrackPos} stop where the front of a 4-car train stops
 * @property {number | null} arr booked arrival (s since midnight); null at the origin
 * @property {number | null} dep booked departure; null at the destination
 * @property {'pending' | 'arrived' | 'departed' | 'missed'} status
 * @property {number | null} actualArr
 * @property {number | null} actualDep
 * @property {number | null} stopErrorM + = overran the marker
 * @property {boolean} raGiven
 * @property {boolean} startedWithoutRA
 */

/** "Right time" on UK railways: up to 59 s late still counts as on time. */
export const RIGHT_TIME_S = 59;
/** Minimum time doors stay open at an intermediate stop (A). */
export const MIN_DWELL_S = 20;

/**
 * The player's progress through their timetable: arrivals, dwell, "right away", departures and
 * punctuality.
 */
export class Journey {
  /**
   * @param {import('../route/network.js').Network} network
   * @param {Call[]} calls
   */
  constructor(network, calls) {
    this.network = network;
    this.calls = calls;
    this.complete = false;
  }

  /** The call we're at or heading for. */
  get current() {
    return this.calls.find((c) => c.status === 'pending' || c.status === 'arrived') ?? null;
  }

  get destination() {
    return this.calls[this.calls.length - 1] ?? null;
  }

  /**
   * Is the whole train alongside this call's platform?
   * @param {Call} call
   * @param {import('../route/network.js').Piece[]} body
   */
  alongside(call, body) {
    const p = call.platform;
    const key = `${p.line}/${p.track}`;
    return body.every((piece) => piece.track === key && Math.min(piece.from, piece.to) >= p.from - 0.5 && Math.max(piece.from, piece.to) <= p.to + 0.5);
  }

  /**
   * Signed distance from the front to a call's stop marker (+ = still to go).
   * @param {Call} call
   * @param {import('../route/network.js').TrackPos} front
   */
  toStop(call, front) {
    if (front.track === call.stop.track) {
      const t = this.network.track(front.track);
      return t.u(call.stop.s) - t.u(front.s);
    }
    const ahead = this.network.distanceTo(front, call.stop, 30000);
    return ahead ?? Infinity;
  }

  /**
   * @param {{ clock: number, vehicle: import('./vehicle.js').Vehicle, doors: import('./doors.js').Doors, emit: (type: string, text: string, data?: any) => void }} ctx
   */
  update({ clock, vehicle, doors, emit }) {
    const call = this.current;
    if (!call || this.complete) return;
    const body = vehicle.body();

    if (call.status === 'pending') {
      if (vehicle.isStationary && doors.state === 'open' && this.alongside(call, body)) {
        call.status = 'arrived';
        call.actualArr = clock;
        call.stopErrorM = -this.toStop(call, vehicle.front);
        const late = call.arr === null ? 0 : clock - call.arr;
        const lateText = call.arr === null ? '' : late <= RIGHT_TIME_S ? (late < -60 ? ` (${Math.round(-late / 60)} min early)` : ' (right time)') : ` (${Math.floor(late / 60)} min late)`;
        emit('arrived', `Arrived ${call.name} ${formatClock(clock).slice(0, 5)}${lateText}`, { station: call.station });
        if (call === this.destination) {
          this.complete = true;
          emit('journey-complete', `Journey complete at ${call.name}`);
        }
        return;
      }
      // Ran past the platform without stopping.
      const p = call.platform;
      const t = this.network.track(`${p.line}/${p.track}`);
      if (vehicle.front.track === t.key) {
        const farEnd = t.dir > 0 ? p.to : p.from;
        if (t.u(vehicle.front.s) - t.u(farEnd) > 40 && !vehicle.isStationary) {
          call.status = 'missed';
          emit('missed-stop', `Missed booked stop at ${call.name}`, { station: call.station });
        }
      }
      return;
    }

    // Arrived: wait for departure time, doors closed, then "right away".
    if (!call.raGiven && doors.closedAndLocked && call.dep !== null && clock >= call.dep && (call.actualArr === null || clock - call.actualArr >= MIN_DWELL_S)) {
      call.raGiven = true;
      emit('right-away', `Right away from ${call.name}`);
    }
    if (!vehicle.isStationary && vehicle.speed > 0.5) {
      call.status = 'departed';
      call.actualDep = clock;
      if (!call.raGiven) {
        call.startedWithoutRA = true;
        emit('no-right-away', `Started from ${call.name} without the right away`);
      }
    }
  }

  /** Ready to go: doors shut and the right away given (or not at a stop). */
  readyToStart(doorsClosed = true) {
    const call = this.current;
    if (!doorsClosed) return false;
    if (!call || call.status !== 'arrived') return true;
    return call.raGiven;
  }
}
