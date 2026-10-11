import { Aspect } from '../signals/aspects.js';

/**
 * TPWS: Train Protection and Warning System.
 *
 * Milestone 1 has the Train Stop System: loops at a signal fire the emergency brake if the
 * train passes it at red. That's a SPAD (Signal Passed At Danger), the most serious mistake a
 * driver can make. The Overspeed Sensor System (loops on the approach to red signals and speed
 * restrictions that brake you if you're too fast) arrives in Milestone 3.
 */
export class TPWS {
  constructor() {
    this.brakeDemand = false;
    /** @type {{ type: 'TSS', signalId: string } | null} */
    this.lastIntervention = null;
  }

  /**
   * The front of the train just passed a signal fitted with TPWS.
   * @param {string} signalId
   * @param {string} aspect what it was showing as we passed
   * @returns {boolean} true if TPWS intervened
   */
  passSignal(signalId, aspect) {
    if (aspect !== Aspect.RED) return false;
    this.brakeDemand = true;
    this.lastIntervention = { type: 'TSS', signalId };
    return true;
  }

  clear() {
    this.brakeDemand = false;
  }
}
