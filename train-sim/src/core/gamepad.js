/**
 * Gamepad controls (standard mapping: Xbox / PlayStation layouts), merged with the keyboard.
 *
 *   D-pad up / down, or right / left trigger   controller one notch to power / brake
 *   A / Cross        AWS acknowledge, reset        B / Circle      horn (hold; with LB: low tone)
 *   X / Square       doors                         Y / Triangle    DRA
 *   RB (R1)          dead man's handle (hold)      LB (L1)         TPWS train stop override
 *   View / Share     call the signaller            Menu / Options  pause
 *   Right stick click  time warp
 */

const B = Object.freeze({ A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, RSTICK: 11, UP: 12, DOWN: 13 });

export class GamepadInput {
  constructor() {
    /** @type {boolean[]} buttons down last poll */
    this.prev = [];
    this.connected = false;
  }

  /**
   * Read the first connected pad and return its contribution to this frame's input.
   * @returns {Partial<import('./input.js').DriverInput> | null}
   */
  poll() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected);
    this.connected = !!pad;
    if (!pad) return null;
    const down = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    const edge = (/** @type {number} */ i) => !!down[i] && !this.prev[i];
    const held = (/** @type {number} */ i) => !!down[i];
    this.prev = down;
    return {
      notchSteps: (edge(B.UP) || edge(B.RT) ? 1 : 0) - (edge(B.DOWN) || edge(B.LT) ? 1 : 0),
      awsAck: edge(B.A),
      hornHigh: held(B.B) && !held(B.LB),
      hornLow: held(B.B) && held(B.LB),
      doorsToggle: edge(B.X),
      draToggle: edge(B.Y),
      dsdHeld: held(B.RB),
      dsdPressed: edge(B.RB),
      tso: edge(B.LB) && !held(B.B),
      radio: edge(B.VIEW),
      pause: edge(B.MENU),
      timeWarp: edge(B.RSTICK),
    };
  }
}

/**
 * Combine keyboard and gamepad input for a frame.
 * @param {import('./input.js').DriverInput} keys
 * @param {Partial<import('./input.js').DriverInput> | null} pad
 * @returns {import('./input.js').DriverInput}
 */
export function mergeInput(keys, pad) {
  if (!pad) return keys;
  /** @type {any} */
  const out = { ...keys };
  for (const [k, v] of Object.entries(pad)) {
    if (typeof v === 'number') out[k] = (out[k] ?? 0) + v;
    else if (v) out[k] = true;
  }
  return out;
}
