import { isCautionary } from '../signals/aspects.js';

/**
 * AWS: Automatic Warning System.
 *
 * A magnet between the rails about 180 m before each signal tells the cab what the signal shows:
 *  - green: a bell rings. Nothing to do.
 *  - anything else: a warning horn sounds until the driver presses the AWS acknowledge button
 *    (Q here). Miss it for 2.7 s and the brakes go on; the train must stop before it can be reset.
 * After an acknowledged warning, the "sunflower" indicator turns black-and-yellow as a reminder
 * that you're running under caution. The next green resets it to black.
 */
export class AWS {
  /** @param {{ ackTimeoutS?: number }} [opts] */
  constructor({ ackTimeoutS = 2.7 } = {}) {
    this.ackTimeoutS = ackTimeoutS;
    /** @type {'idle' | 'warning'} warning = horn sounding */
    this.state = 'idle';
    this.timer = 0;
    this.sunflower = false;
    this.penalty = false;
  }

  get hornSounding() {
    return this.state === 'warning';
  }

  /**
   * The train's front just passed an AWS magnet.
   * @param {string} aspect of the signal the magnet belongs to
   * @returns {'bell' | 'horn'}
   */
  passMagnet(aspect) {
    if (!isCautionary(aspect)) {
      this.sunflower = false;
      return 'bell';
    }
    this.state = 'warning';
    this.timer = 0;
    return 'horn';
  }

  /** @returns {boolean} true if this press silenced a warning */
  acknowledge() {
    if (this.state !== 'warning') return false;
    this.state = 'idle';
    this.sunflower = true;
    return true;
  }

  /**
   * @param {number} dt
   * @returns {boolean} true on the step the penalty brake is triggered
   */
  update(dt) {
    if (this.state !== 'warning' || this.penalty) return false;
    this.timer += dt;
    if (this.timer < this.ackTimeoutS) return false;
    this.penalty = true; // the horn keeps sounding until acknowledged
    return true;
  }

  clearPenalty() {
    this.penalty = false;
  }
}
