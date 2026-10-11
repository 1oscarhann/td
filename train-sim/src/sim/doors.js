/**
 * Passenger doors. Opening takes a few seconds; closing takes longer (warning beeps, then the
 * doors close and lock). Traction is interlocked: no power unless every door is closed and locked.
 */
export class Doors {
  /** @param {{ openTimeS?: number, closeTimeS?: number }} [opts] */
  constructor({ openTimeS = 3, closeTimeS = 5 } = {}) {
    this.openTimeS = openTimeS;
    this.closeTimeS = closeTimeS;
    /** @type {'closed' | 'opening' | 'open' | 'closing'} */
    this.state = 'closed';
    this.timer = 0;
  }

  get closedAndLocked() {
    return this.state === 'closed';
  }

  /**
   * Driver pressed the door button.
   * @param {boolean} canOpen train is stopped alongside a platform
   * @returns {'opening' | 'closing' | 'refused'}
   */
  toggle(canOpen) {
    if (this.state === 'closed' || this.state === 'closing') {
      if (!canOpen) return 'refused';
      this.state = 'opening';
      this.timer = 0;
      return 'opening';
    }
    this.state = 'closing';
    this.timer = 0;
    return 'closing';
  }

  /**
   * @param {number} dt
   * @returns {'open' | 'closed' | null} the state reached this step, if one was
   */
  update(dt) {
    if (this.state !== 'opening' && this.state !== 'closing') return null;
    this.timer += dt;
    const duration = this.state === 'opening' ? this.openTimeS : this.closeTimeS;
    if (this.timer < duration) return null;
    this.state = this.state === 'opening' ? 'open' : 'closed';
    return this.state;
  }
}
