/**
 * Where a train is on the network: the stretch of track its body covers, which can span a
 * junction (front on the branch, rear still on the main line).
 *
 * It's kept as a list of pieces in travel order, rear-most first; the last piece ends at the
 * front. Moving forward walks the network from the front and appends what it covers; old pieces
 * behind the rear are trimmed away.
 */
export class TrainPath {
  /**
   * @param {import('./network.js').Network} network
   * @param {{ track: string, s: number, length: number }} start front position and train length
   */
  constructor(network, { track, s, length }) {
    this.network = network;
    this.length = length;
    const t = network.track(track);
    // Lay the train out behind its front on the same track (spawn points are chosen so it fits).
    const back = Math.min(length + 50, Math.max(0, t.u(s) - t.u(t.entryS)));
    /** @type {import('./network.js').Piece[]} */
    this.pieces = [{ track, from: s - t.dir * back, to: s }];
    /** Front at the start of the last step, for smooth rendering. */
    this.prevFront = { track, s };
  }

  /** @returns {import('./network.js').TrackPos} */
  get front() {
    const last = this.pieces[this.pieces.length - 1];
    return { track: last.track, s: last.to };
  }

  /**
   * Move the front forward along the network.
   * @param {number} distance metres, ≥ 0
   * @param {import('./network.js').WalkOptions['decide']} [decide] how to take facing points
   * @returns {{ pieces: import('./network.js').Piece[], end: null | 'open' | 'buffers', moved: number }}
   *   the track covered this move (for detecting signals, magnets and crossings) and whether we hit the end
   */
  advance(distance, decide) {
    const f = this.front;
    /** @type {import('./network.js').Piece[]} */
    const covered = [];
    const res = this.network.walk(f.track, f.s, distance, {
      decide,
      onPiece: (piece) => {
        covered.push(piece);
      },
    });
    for (const piece of covered) {
      const last = this.pieces[this.pieces.length - 1];
      if (last.track === piece.track && Math.abs(last.to - piece.from) < 1e-6) last.to = piece.to;
      else this.pieces.push({ ...piece });
    }
    this.trim();
    return { pieces: covered, end: res.end, moved: res.walked };
  }

  /**
   * Move the front backwards (rolling back). Follows the path the train came along.
   * @param {number} distance metres, ≥ 0
   */
  retreat(distance) {
    let remaining = distance;
    while (remaining > 1e-9) {
      const last = this.pieces[this.pieces.length - 1];
      const len = Math.abs(last.to - last.from);
      if (len > remaining || this.pieces.length === 1) {
        const t = this.network.track(last.track);
        last.to -= t.dir * remaining;
        if (this.pieces.length === 1 && t.u(last.to) < t.u(last.from) + this.length) {
          // Rolled back past where we know the history: extend the rear on the same track.
          last.from = last.to - t.dir * (this.length + 50);
        }
        remaining = 0;
      } else {
        this.pieces.pop();
        remaining -= len;
      }
    }
  }

  /** Drop history more than a train length (plus a margin) behind the front. */
  trim() {
    let keep = this.length + 50;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      const len = Math.abs(p.to - p.from);
      if (len >= keep) {
        const t = this.network.track(p.track);
        p.from = p.to - t.dir * keep;
        this.pieces.splice(0, i);
        return;
      }
      keep -= len;
    }
  }

  /**
   * The position `distance` metres behind the front, following the train's own path.
   * @param {number} distance
   * @returns {import('./network.js').TrackPos}
   */
  behind(distance) {
    let remaining = distance;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      const len = Math.abs(p.to - p.from);
      const t = this.network.track(p.track);
      if (len >= remaining || i === 0) return { track: p.track, s: p.to - t.dir * remaining };
      remaining -= len;
    }
    return this.front;
  }

  /** The rear of the train. */
  get rear() {
    return this.behind(this.length);
  }

  /**
   * The track under the train, as pieces in travel order (rear first).
   * @returns {import('./network.js').Piece[]}
   */
  body() {
    /** @type {import('./network.js').Piece[]} */
    const out = [];
    let remaining = this.length;
    for (let i = this.pieces.length - 1; i >= 0 && remaining > 1e-9; i--) {
      const p = this.pieces[i];
      const t = this.network.track(p.track);
      const len = Math.abs(p.to - p.from);
      const take = i === 0 ? remaining : Math.min(len, remaining);
      out.unshift({ track: p.track, from: p.to - t.dir * take, to: p.to });
      remaining -= take;
    }
    return out;
  }
}
