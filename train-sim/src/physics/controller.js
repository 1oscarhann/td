import { clamp } from '../core/units.js';

/**
 * Combined power/brake controller (CPBC): one handle, pushed forward for power and pulled back
 * for brake, with clicks (notches) in between. From fully back to fully forward:
 * emergency, brake steps 3–1, off, power 1–4.
 */
export const NOTCHES = Object.freeze(['EB', 'B3', 'B2', 'B1', 'OFF', 'P1', 'P2', 'P3', 'P4']);

const OFF_INDEX = NOTCHES.indexOf('OFF');

export class Controller {
  /**
   * @param {import('./trainSpec.js').TrainSpec} spec
   * @param {string} [notch] starting position
   */
  constructor(spec, notch = 'OFF') {
    this.spec = spec;
    this.index = OFF_INDEX;
    this.set(notch);
  }

  get notch() {
    return NOTCHES[this.index];
  }

  /** @param {string} notch */
  set(notch) {
    const i = NOTCHES.indexOf(notch);
    if (i < 0) throw new Error(`Unknown controller notch "${notch}"`);
    this.index = i;
  }

  /**
   * @param {number} steps positive = towards power
   * @returns {boolean} whether the handle moved
   */
  move(steps) {
    const before = this.index;
    this.index = clamp(this.index + Math.trunc(steps), 0, NOTCHES.length - 1);
    return this.index !== before;
  }

  get isPower() {
    return this.index > OFF_INDEX;
  }

  get isBrake() {
    return this.index < OFF_INDEX;
  }

  get isEmergency() {
    return this.index === 0;
  }

  /** Share of maximum tractive effort requested, 0..1. */
  get powerDemand() {
    return this.isPower ? this.spec.traction.powerNotches[this.index - OFF_INDEX - 1] : 0;
  }

  /** Deceleration requested, m/s². */
  get brakeDemand() {
    if (this.isEmergency) return this.spec.brake.emergencyMps2;
    if (this.isBrake) return this.spec.brake.serviceStepsMps2[OFF_INDEX - this.index - 1];
    return 0;
  }
}
