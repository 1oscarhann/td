/**
 * A scripted train: waits, then accelerates to a cruising speed and keeps going. It exists to
 * give the signals something to protect in Milestone 1. AI drivers that obey signals and call at
 * stations come with the real route in Milestone 2.
 */
export class ScriptedTrain {
  /**
   * @param {object} o
   * @param {string} o.id headcode, e.g. "1A23"
   * @param {string} o.track
   * @param {1 | -1} o.dir
   * @param {number} o.frontPosition
   * @param {number} o.lengthM
   * @param {number} o.departAtS sim time it sets off
   * @param {number} o.accelMps2
   * @param {number} o.maxSpeedMps
   */
  constructor({ id, track, dir, frontPosition, lengthM, departAtS, accelMps2, maxSpeedMps }) {
    this.id = id;
    this.track = track;
    this.dir = dir;
    this.position = frontPosition;
    this.prevPosition = frontPosition;
    this.lengthM = lengthM;
    this.departAtS = departAtS;
    this.accelMps2 = accelMps2;
    this.maxSpeedMps = maxSpeedMps;
    this.velocity = 0;
  }

  get rearPosition() {
    return this.position - this.dir * this.lengthM;
  }

  /**
   * @param {number} dt
   * @param {number} time sim time after this step
   */
  update(dt, time) {
    this.prevPosition = this.position;
    if (time < this.departAtS) return;
    const vNew = Math.min(this.maxSpeedMps, this.velocity + this.accelMps2 * dt);
    this.position += this.dir * 0.5 * (this.velocity + vNew) * dt;
    this.velocity = vNew;
  }
}
