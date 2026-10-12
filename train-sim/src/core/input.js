/**
 * Keyboard → driver actions.
 *
 * Bindings use `KeyboardEvent.code` (the physical key), so W/S sit in the same place on AZERTY
 * and Dvorak keyboards. Taps are counted between polls, so a quick press is never lost even if
 * no physics step runs that frame. Holding W does not auto-repeat: one press moves the
 * controller one notch, like clicking a real handle through its detents.
 */

/** @type {Readonly<Record<string, string[]>>} */
/** What each action is called in the key-binding screen. */
export const ACTION_NAMES = Object.freeze({
  powerUp: 'Controller: towards power',
  powerDown: 'Controller: towards brake',
  horn: 'Horn (Shift for low tone)',
  doors: 'Doors',
  dsd: "Dead man's handle",
  awsAck: 'AWS acknowledge / reset',
  dra: 'Driver’s reminder appliance',
  tso: 'TPWS train stop override',
  radio: 'Call the signaller',
  timeWarp: 'Time warp',
  pause: 'Pause',
  assist: 'Driving aid',
});

export const DEFAULT_BINDINGS = Object.freeze({
  powerUp: ['KeyW', 'ArrowUp'],
  powerDown: ['KeyS', 'ArrowDown'],
  horn: ['KeyH'], // Shift+H for the low tone
  doors: ['KeyD'],
  dsd: ['Space'],
  awsAck: ['KeyQ'], // AWS acknowledge, and reset after a penalty brake
  dra: ['KeyR'],
  tso: ['KeyO'], // TPWS train stop override
  radio: ['KeyC'], // call the signaller
  timeWarp: ['KeyT'],
  pause: ['KeyP', 'Escape'],
  assist: ['Tab'],
});

/**
 * One frame's worth of driver input.
 * @typedef {object} DriverInput
 * @property {number} notchSteps controller notches to move (+ towards power, − towards brake)
 * @property {boolean} hornHigh
 * @property {boolean} hornLow
 * @property {boolean} dsdHeld Space is held down
 * @property {boolean} dsdPressed Space was pressed since the last poll
 * @property {boolean} awsAck
 * @property {boolean} doorsToggle
 * @property {boolean} draToggle
 * @property {boolean} pause
 * @property {boolean} assistToggle
 * @property {boolean} tso
 * @property {boolean} radio
 * @property {boolean} timeWarp
 */

/** @returns {DriverInput} */
export function emptyInput() {
  return {
    notchSteps: 0,
    hornHigh: false,
    hornLow: false,
    dsdHeld: false,
    dsdPressed: false,
    awsAck: false,
    doorsToggle: false,
    draToggle: false,
    pause: false,
    assistToggle: false,
    tso: false,
    radio: false,
    timeWarp: false,
  };
}

export class KeyboardInput {
  /**
   * @param {Window} target
   * @param {Readonly<Record<string, string[]>>} [bindings]
   */
  constructor(target, bindings = DEFAULT_BINDINGS) {
    this.target = target;
    /** @type {Map<string, string>} */
    this.codeToAction = new Map();
    this.setBindings(bindings);
    /** @type {Set<string>} key codes currently down */
    this.down = new Set();
    /** @type {Map<string, number>} presses per action since the last poll */
    this.presses = new Map();
    this.shift = false;
    /** @type {null | ((code: string) => void)} next key press goes here (for rebinding) */
    this.capture = null;
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.releaseAll = this.releaseAll.bind(this);
  }

  /**
   * Use these bindings (any action not listed keeps its default).
   * @param {Readonly<Record<string, string[]>>} bindings
   */
  setBindings(bindings) {
    this.codeToAction.clear();
    for (const [action, codes] of Object.entries({ ...DEFAULT_BINDINGS, ...bindings })) {
      for (const code of codes) this.codeToAction.set(code, action);
    }
  }

  attach() {
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.releaseAll);
  }

  detach() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.releaseAll);
    this.releaseAll();
  }

  /** @param {KeyboardEvent} e */
  onKeyDown(e) {
    this.shift = e.shiftKey;
    if (this.capture) {
      e.preventDefault();
      const done = this.capture;
      this.capture = null;
      done(e.code);
      return;
    }
    const action = this.codeToAction.get(e.code);
    if (!action || e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
    // Let menus keep their own keys (arrow keys in a dropdown, Space on a button).
    const el = /** @type {HTMLElement | null} */ (e.target);
    if (el?.closest?.('input, select, textarea, button') && action !== 'pause') return;
    e.preventDefault();
    if (!e.repeat) this.presses.set(action, (this.presses.get(action) ?? 0) + 1);
    this.down.add(e.code);
  }

  /** @param {KeyboardEvent} e */
  onKeyUp(e) {
    this.shift = e.shiftKey;
    this.down.delete(e.code);
  }

  releaseAll() {
    this.down.clear();
    this.shift = false;
  }

  /** @param {string} action */
  isHeld(action) {
    for (const code of this.down) if (this.codeToAction.get(code) === action) return true;
    return false;
  }

  /**
   * Read and clear this frame's input.
   * @returns {DriverInput}
   */
  poll() {
    const presses = (/** @type {string} */ a) => this.presses.get(a) ?? 0;
    const horn = this.isHeld('horn');
    const input = {
      notchSteps: presses('powerUp') - presses('powerDown'),
      hornHigh: horn && !this.shift,
      hornLow: horn && this.shift,
      dsdHeld: this.isHeld('dsd'),
      dsdPressed: presses('dsd') > 0,
      awsAck: presses('awsAck') > 0,
      doorsToggle: presses('doors') > 0,
      draToggle: presses('dra') > 0,
      pause: presses('pause') > 0,
      assistToggle: presses('assist') > 0,
      tso: presses('tso') > 0,
      radio: presses('radio') > 0,
      timeWarp: presses('timeWarp') > 0,
    };
    this.presses.clear();
    return input;
  }
}
