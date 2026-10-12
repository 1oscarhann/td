/**
 * Turn OSM railway ways into routes: a graph of OSM nodes, shortest paths between places, and a
 * clean centreline for double track.
 */
import { cumulative, dist, pointAlong, resample, smooth } from './geo.mjs';

/**
 * @typedef {object} RailWay
 * @property {number} id
 * @property {Record<string, string>} tags
 * @property {number[]} nodes
 * @property {[number, number][]} xy projected geometry
 */

export class RailGraph {
  /**
   * @param {any[]} elements Overpass ways with `out geom`
   * @param {(lat: number, lon: number) => [number, number]} project
   */
  constructor(elements, project) {
    /** @type {Map<number, [number, number]>} node id → xy */
    this.nodes = new Map();
    /** @type {Map<number, { to: number, d: number, way: RailWay }[]>} */
    this.adj = new Map();
    /** @type {RailWay[]} */
    this.ways = [];
    for (const e of elements) {
      if (e.type !== 'way' || !e.geometry) continue;
      const xy = e.geometry.map((/** @type {any} */ g) => project(g.lat, g.lon));
      /** @type {RailWay} */
      const way = { id: e.id, tags: e.tags ?? {}, nodes: e.nodes, xy };
      this.ways.push(way);
      e.nodes.forEach((/** @type {number} */ id, /** @type {number} */ i) => this.nodes.set(id, xy[i]));
      for (let i = 1; i < e.nodes.length; i++) {
        const a = e.nodes[i - 1];
        const b = e.nodes[i];
        const d = dist(xy[i - 1], xy[i]);
        this.link(a, b, d, way);
        this.link(b, a, d, way);
      }
    }
  }

  /** @param {number} a @param {number} b @param {number} d @param {RailWay} way */
  link(a, b, d, way) {
    const list = this.adj.get(a) ?? [];
    list.push({ to: b, d, way });
    this.adj.set(a, list);
  }

  /**
   * The graph node nearest a point.
   * @param {[number, number]} q
   * @param {(id: number) => boolean} [filter]
   */
  nearest(q, filter = () => true) {
    let best = -1;
    let bestD = Infinity;
    for (const [id, p] of this.nodes) {
      const d = dist(p, q);
      if (d < bestD && filter(id)) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  /**
   * Dijkstra shortest path between nodes, with a turning penalty so it doesn't zigzag
   * across crossovers. Returns node ids.
   * @param {number} from
   * @param {number} to
   */
  path(from, to) {
    /** @type {Map<number, number>} */
    const best = new Map([[from, 0]]);
    /** @type {Map<number, number>} */
    const prev = new Map();
    /** @type {[number, number][]} cost, node */
    const queue = [[0, from]];
    while (queue.length) {
      // Small graphs: a sorted array is fine.
      queue.sort((a, b) => a[0] - b[0]);
      const [cost, node] = /** @type {[number, number]} */ (queue.shift());
      if (node === to) break;
      if (cost > (best.get(node) ?? Infinity)) continue;
      for (const e of this.adj.get(node) ?? []) {
        // Crossovers and sidings are short, slow ways: make them a little expensive.
        const speed = parseInt(e.way.tags.maxspeed ?? '60', 10) || 60;
        const penalty = speed <= 25 ? 1.6 : 1;
        const c = cost + e.d * penalty;
        if (c < (best.get(e.to) ?? Infinity)) {
          best.set(e.to, c);
          prev.set(e.to, node);
          queue.push([c, e.to]);
        }
      }
    }
    if (!prev.has(to) && from !== to) throw new Error(`No rail path between nodes ${from} and ${to}`);
    const out = [to];
    let n = to;
    while (n !== from) {
      n = /** @type {number} */ (prev.get(n));
      out.unshift(n);
    }
    return out;
  }

  /** @param {number[]} ids */
  xy(ids) {
    return ids.map((id) => /** @type {[number, number]} */ (this.nodes.get(id)));
  }

  /**
   * All way segments, for "what's near this point" questions.
   * @returns {{ a: [number, number], b: [number, number], way: RailWay }[]}
   */
  segments() {
    if (!this._segments) {
      this._segments = [];
      for (const w of this.ways) for (let i = 1; i < w.xy.length; i++) this._segments.push({ a: w.xy[i - 1], b: w.xy[i], way: w });
    }
    return this._segments;
  }

  /**
   * Ways within `radius` of a point, with distances.
   * @param {[number, number]} q
   * @param {number} radius
   */
  waysNear(q, radius) {
    /** @type {Map<RailWay, number>} */
    const found = new Map();
    for (const { a, b, way } of this.segments()) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.min(1, Math.max(0, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2));
      const d = Math.hypot(q[0] - (a[0] + dx * t), q[1] - (a[1] + dy * t));
      if (d <= radius && d < (found.get(way) ?? Infinity)) found.set(way, d);
    }
    return found;
  }

  /**
   * Signed lateral distances to every rail line crossing the normal at a point (± `reach`).
   * @param {[number, number]} p
   * @param {[number, number]} t unit tangent
   * @param {number} reach
   */
  railsAcross(p, t, reach) {
    const n = [t[1], -t[0]]; // right-hand normal
    /** @type {number[]} */
    const out = [];
    for (const { a, b } of this.segments()) {
      // Solve p + n·u = a + (b − a)·v for u (lateral) and v ∈ [0, 1].
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const det = n[0] * -ey - n[1] * -ex;
      if (Math.abs(det) < 1e-9) continue;
      const rx = a[0] - p[0];
      const ry = a[1] - p[1];
      const u = (rx * -ey - ry * -ex) / det;
      const v = (n[0] * ry - n[1] * rx) / det;
      if (v >= 0 && v <= 1 && Math.abs(u) <= reach) out.push(u);
    }
    return out;
  }

  /**
   * A centreline from a path that may run along either track: resample, move each point to
   * midway between the two running lines where there are two, then smooth.
   * @param {[number, number][]} raw
   * @param {number} step
   * @param {number} [trackSpacing]
   */
  centreline(raw, step, trackSpacing = 3.4) {
    let pts = smooth(resample(raw, step), 4);
    const cum = cumulative(pts);
    pts = pts.map((p, i) => {
      const { t } = pointAlong(pts, cum, cum[i]);
      const across = this.railsAcross(p, t, trackSpacing * 1.6).filter((u) => Math.abs(u) > 1.2);
      // The path is on one track; the other running line is about trackSpacing to one side.
      const partner = across.sort((a, b) => Math.abs(Math.abs(a) - trackSpacing) - Math.abs(Math.abs(b) - trackSpacing))[0];
      if (partner === undefined || Math.abs(Math.abs(partner) - trackSpacing) > 1.2) return p;
      const n = [t[1], -t[0]];
      return /** @type {[number, number]} */ ([p[0] + (n[0] * partner) / 2, p[1] + (n[1] * partner) / 2]);
    });
    return smooth(pts, Math.round(60 / step));
  }
}
