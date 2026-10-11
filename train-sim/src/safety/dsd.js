/**
 * DSD: Driver's Safety Device, the "dead man's handle".
 *
 * Modes (a realism vs fun choice, picked in settings):
 *  - 'hold'      realistic: keep Space held whenever the train is moving or power is on. Let go
 *                and a buzzer sounds; after `graceS` the emergency brake goes on.
 *  - 'vigilance' what most PC sims do: every `intervalS` of driving a buzzer sounds and you tap
 *                Space within `graceS`. Real Electrostars have this on top of the pedal.
 *  - 'off'
 */
export class DSD {
  /** @param {{ mode?: 'hold' | 'vigilance' | 'off', graceS?: number, intervalS?: number }} [opts] */
  constructor({ mode = 'hold', graceS = 3, intervalS = 60 } = {}) {
    this.mode = mode;
    this.graceS = graceS;
    this.intervalS = intervalS;
    this.warning = false;
    this.penalty = false;
    this.timer = 0;
    this.sinceAck = 0;
  }

  /**
   * @param {number} dt
   * @param {{ held: boolean, pressed: boolean, active: boolean }} s active = moving or power selected
   * @returns {boolean} true on the step the penalty brake is triggered
   */
  update(dt, { held, pressed, active }) {
    if (this.penalty || this.mode === 'off') {
      this.warning = false;
      return false;
    }
    if (this.mode === 'hold') {
      if (held || !active) return this.calm();
    } else {
      if (pressed || !active) {
        this.sinceAck = 0;
        return this.calm();
      }
      this.sinceAck += dt;
      if (this.sinceAck < this.intervalS) return this.calm();
    }
    this.warning = true;
    this.timer += dt;
    if (this.timer < this.graceS) return false;
    this.penalty = true;
    this.warning = false;
    return true;
  }

  /** @returns {false} */
  calm() {
    this.warning = false;
    this.timer = 0;
    return false;
  }

  clearPenalty() {
    this.penalty = false;
    this.warning = false;
    this.timer = 0;
    this.sinceAck = 0;
  }
}
