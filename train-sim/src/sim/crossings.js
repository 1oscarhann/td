/**
 * Level crossings.
 *
 * Types (from the route file):
 * - 'MCB' manually controlled / CCTV / obstacle-detection full barriers. Protected by signals:
 *   the protecting signal can't clear until the barriers are down and the crossing is proved clear.
 * - 'AHB' automatic half barriers. Train-operated, no protecting signal: the barriers start
 *   dropping about 27 s before the train arrives.
 * - 'FP' footpath, 'BW' bridleway, 'UWC' user-worked (farm) crossings: nothing automatic. The
 *   driver sounds the horn at the whistle board.
 *
 * Sequence for barriers: amber light (3 s), red lights flash, barriers lower, then (MCB) the
 * crossing is checked clear before the signal can clear. They rise once the last train is over.
 */

/** Seconds for each stage (A). */
export const LC_TIMING = Object.freeze({
  amber: 3,
  redBeforeLower: 4,
  lower: 8,
  prove: 8, // CCTV check or obstacle detection scan
  raise: 6,
});

/** How far ahead a train calls a full-barrier crossing (m) (A). */
const MCB_CALL_M = 3500;
/** AHB strike-in: the barriers want ~27 s of warning; we trigger at 32 s away (A). */
const AHB_WARNING_S = 32;

/**
 * @typedef {'open' | 'amber' | 'red' | 'lowering' | 'down' | 'proved' | 'raising'} CrossingState
 */

export class LevelCrossing {
  /** @param {any} def from the route file */
  constructor(def) {
    this.def = def;
    this.id = /** @type {string} */ (def.id);
    this.name = def.name ?? def.id;
    /** @type {string} */
    this.type = def.type;
    /** @type {CrossingState} */
    this.state = 'open';
    this.timer = 0;
    /** 0 = barriers up, 1 = down. */
    this.barrier = 0;
    /** @type {null | 'stuck-up'} */
    this.failure = null;
    /** Signals that must stay red until this crossing is proved (filled in by the manager). */
    /** @type {string[]} */
    this.protectingSignals = [];
    this.closedFor = 0;
  }

  get hasBarriers() {
    return this.type === 'MCB' || this.type === 'AHB';
  }

  /** Red road lights showing. */
  get redLights() {
    return this.state !== 'open' && this.state !== 'amber' && this.state !== 'raising';
  }

  get amberLight() {
    return this.state === 'amber';
  }

  /** Safe for a train: barriers down (and, for full barriers, checked clear). */
  get safe() {
    if (!this.hasBarriers) return true;
    if (this.failure) return false;
    return this.type === 'MCB' ? this.state === 'proved' : this.state === 'down';
  }

  /**
   * @param {number} dt
   * @param {boolean} called a train needs it closed
   */
  update(dt, called) {
    if (!this.hasBarriers) return;
    this.timer += dt;
    const stuck = this.failure === 'stuck-up';
    switch (this.state) {
      case 'open':
        if (called) this.go('amber');
        break;
      case 'amber':
        if (this.timer >= LC_TIMING.amber) this.go('red');
        break;
      case 'red':
        if (this.timer >= LC_TIMING.redBeforeLower) this.go('lowering');
        break;
      case 'lowering':
        if (!stuck) this.barrier = Math.min(1, this.timer / LC_TIMING.lower);
        if (this.timer >= LC_TIMING.lower && !stuck) this.go('down');
        if (!called && this.timer >= LC_TIMING.lower) this.go('raising');
        break;
      case 'down':
        if (!called) this.go('raising');
        else if (this.type === 'MCB' && this.timer >= LC_TIMING.prove) this.go('proved');
        break;
      case 'proved':
        if (!called) this.go('raising');
        break;
      case 'raising':
        this.barrier = Math.max(0, this.barrier - dt / LC_TIMING.raise);
        if (called) this.go('red');
        else if (this.barrier <= 0) this.go('open');
        break;
    }
    if (this.state !== 'open') this.closedFor += dt;
    else this.closedFor = 0;
  }

  /** @param {CrossingState} state */
  go(state) {
    this.state = state;
    this.timer = 0;
  }
}

/**
 * Runs every crossing: decides which are needed, and holds protecting signals at red until
 * their crossing is safe.
 */
export class CrossingManager {
  /**
   * @param {import('../route/network.js').Network} network
   * @param {import('../signals/signalling.js').Signalling} signalling
   * @param {any[]} defs
   */
  constructor(network, signalling, defs) {
    this.network = network;
    this.signalling = signalling;
    /** @type {LevelCrossing[]} */
    this.crossings = defs.map((d) => new LevelCrossing(d));
    /** @type {Map<string, LevelCrossing>} */
    this.byId = new Map(this.crossings.map((c) => [c.id, c]));
    for (const lc of this.crossings) {
      if (lc.type !== 'MCB') continue;
      lc.protectingSignals = lc.def.protectingSignals ?? this.findProtectingSignals(lc);
    }
  }

  /**
   * The last signal before the crossing on each track of its line.
   * @param {LevelCrossing} lc
   */
  findProtectingSignals(lc) {
    /** @type {string[]} */
    const out = [];
    for (const t of this.network.tracks.values()) {
      if (t.line.id !== lc.def.line) continue;
      const list = this.signalling.byTrack.get(t.key) ?? [];
      let best = null;
      for (const sig of list) {
        const d = t.u(lc.def.position) - t.u(sig.s);
        if (d > 0 && d < 3000 && (!best || d < best.d)) best = { id: sig.id, d };
      }
      if (best) out.push(best.id);
    }
    return out;
  }

  /**
   * @param {number} dt
   * @param {import('./vehicle.js').Vehicle[]} vehicles
   */
  update(dt, vehicles) {
    /** @type {Set<string>} */
    const called = new Set();
    for (const v of vehicles) {
      // Anything under the train keeps its crossing shut.
      for (const piece of v.body()) {
        const t = this.network.track(piece.track);
        for (const lc of this.crossings) {
          if (lc.def.line !== t.line.id) continue;
          const lo = Math.min(piece.from, piece.to) - 5;
          const hi = Math.max(piece.from, piece.to) + 5;
          if (lc.def.position >= lo && lc.def.position <= hi) called.add(lc.id);
        }
      }
      // Ahead of the train, along its booked route.
      const speed = v.speed;
      const moving = speed > 0.5 || v.readyToStart;
      if (!moving) continue;
      const reach = Math.max(MCB_CALL_M, speed * AHB_WARNING_S + 50);
      this.network.walk(v.front.track, v.front.s, reach, {
        decide: (p) => v.plan.get(p.id) ?? p.state,
        onPiece: (piece, before) => {
          const t = this.network.track(piece.track);
          for (const lc of this.crossings) {
            if (lc.def.line !== t.line.id || !lc.hasBarriers) continue;
            const u = t.u(lc.def.position);
            if (u <= t.u(piece.from) || u > t.u(piece.to)) continue;
            const d = before + (u - t.u(piece.from));
            if (lc.type === 'MCB' ? d <= MCB_CALL_M : d <= Math.max(speed, 3) * AHB_WARNING_S + 30) called.add(lc.id);
          }
          return false;
        },
      });
    }
    for (const lc of this.crossings) {
      lc.update(dt, called.has(lc.id));
      for (const id of lc.protectingSignals) this.signalling.hold(id, `lc:${lc.id}`, !lc.safe);
    }
  }
}
