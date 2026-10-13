/**
 * Geometry helpers for the route builder: a local flat projection, polylines, smoothing and
 * nearest-point queries.
 */

const R = 6371000;

/**
 * Equirectangular projection around an origin: plenty accurate over 30 km.
 * @param {number} lat0
 * @param {number} lon0
 */
export function makeProjection(lat0, lon0) {
  const k = (Math.PI / 180) * R;
  const cos0 = Math.cos((lat0 * Math.PI) / 180);
  return {
    lat0,
    lon0,
    /** @returns {[number, number]} x east, y north (m) */
    project: (/** @type {number} */ lat, /** @type {number} */ lon) => [(lon - lon0) * cos0 * k, (lat - lat0) * k],
    /** @returns {[number, number]} lat, lon */
    unproject: (/** @type {number} */ x, /** @type {number} */ y) => [lat0 + y / k, lon0 + x / (cos0 * k)],
  };
}

/** @param {[number, number]} a @param {[number, number]} b */
export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Cumulative lengths along a polyline. @param {[number, number][]} pts */
export function cumulative(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
  return c;
}

/**
 * Point at distance s along a polyline (clamped), with unit tangent.
 * @param {[number, number][]} pts
 * @param {number[]} cum
 * @param {number} s
 */
export function pointAlong(pts, cum, s) {
  let lo = 0;
  let hi = cum.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  const a = pts[lo];
  const b = pts[lo + 1];
  const len = cum[lo + 1] - cum[lo] || 1;
  const t = Math.min(1, Math.max(0, (s - cum[lo]) / len));
  return { p: /** @type {[number, number]} */ ([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]), t: /** @type {[number, number]} */ ([(b[0] - a[0]) / len, (b[1] - a[1]) / len]) };
}

/**
 * Resample a polyline every `step` metres.
 * @param {[number, number][]} pts
 * @param {number} step
 */
export function resample(pts, step) {
  const cum = cumulative(pts);
  const total = cum[cum.length - 1];
  const n = Math.max(1, Math.round(total / step));
  /** @type {[number, number][]} */
  const out = [];
  for (let i = 0; i <= n; i++) out.push(pointAlong(pts, cum, (total * i) / n).p);
  return out;
}

/**
 * Moving-average smoothing with a window of ±k points; the ends stay put.
 * @param {[number, number][]} pts
 * @param {number} k
 */
export function smooth(pts, k) {
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const r = Math.min(k, i, pts.length - 1 - i);
    let x = 0;
    let y = 0;
    for (let j = i - r; j <= i + r; j++) {
      x += pts[j][0];
      y += pts[j][1];
    }
    const n = 2 * r + 1;
    return /** @type {[number, number]} */ ([x / n, y / n]);
  });
}

/**
 * Project a point onto a polyline: chainage, signed lateral offset (+ = right of travel) and distance.
 * @param {[number, number][]} pts
 * @param {number[]} cum
 * @param {[number, number]} q
 */
export function projectOnto(pts, cum, q) {
  let best = { s: 0, lateral: 0, d: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.min(1, Math.max(0, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2));
    const px = a[0] + dx * t;
    const py = a[1] + dy * t;
    const d = Math.hypot(q[0] - px, q[1] - py);
    if (d < best.d) {
      const len = Math.sqrt(len2);
      // Right of travel: cross product sign (tangent × offset) negative means right.
      const cross = (dx * (q[1] - py) - dy * (q[0] - px)) / len;
      best = { s: cum[i] + t * len, lateral: -cross, d };
    }
  }
  return best;
}

/**
 * Point-in-polygon (ray casting).
 * @param {[number, number]} q
 * @param {[number, number][]} poly
 */
export function inPolygon(q, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Douglas–Peucker simplification.
 * @param {[number, number][]} pts
 * @param {number} tolerance metres
 * @returns {[number, number][]}
 */
export function simplify(pts, tolerance) {
  if (pts.length < 3) return pts;
  // A closed ring (first point = last) has a zero-length baseline: simplify each half instead.
  if (pts.length > 4 && dist(pts[0], pts[pts.length - 1]) < 1e-6) {
    const mid = Math.floor(pts.length / 2);
    return [...simplify(pts.slice(0, mid + 1), tolerance).slice(0, -1), ...simplify(pts.slice(mid), tolerance)];
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  /** @type {[number, number][]} */
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = /** @type {[number, number]} */ (stack.pop());
    let maxD = 0;
    let idx = -1;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Polygon area (m², absolute). @param {[number, number][]} poly */
export function area(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a / 2);
}
