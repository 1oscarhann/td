/**
 * The line's path across the map: a polyline in local metres (x = east, y = north) with chainage
 * (distance along the line) starting at 0 at the first point.
 *
 * Lateral offsets are measured to the RIGHT of the direction of increasing chainage. With UK
 * left-hand running, the track for trains heading towards increasing chainage has a negative offset.
 *
 * Milestone 1 uses two points (a straight line). Milestone 2 feeds in hundreds of points from
 * OpenStreetMap; nothing here changes.
 */
export class Alignment {
  /** @param {[number, number][]} points */
  constructor(points) {
    if (!Array.isArray(points) || points.length < 2) throw new Error('Alignment needs at least two points');
    this.points = points.map(([x, y]) => ({ x, y }));
    /** Chainage at each point. */
    this.cumulative = [0];
    for (let i = 1; i < this.points.length; i++) {
      const d = Math.hypot(this.points[i].x - this.points[i - 1].x, this.points[i].y - this.points[i - 1].y);
      if (!(d > 0)) throw new Error(`Alignment points ${i - 1} and ${i} are in the same place`);
      this.cumulative.push(this.cumulative[i - 1] + d);
    }
    this.length = this.cumulative[this.cumulative.length - 1];
  }

  /**
   * Which segment a chainage falls in (clamped to the first/last segment, so positions just
   * beyond either end extend in a straight line).
   * @param {number} s
   */
  segmentIndex(s) {
    let lo = 0;
    let hi = this.cumulative.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cumulative[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /**
   * A point on (or beside) the line.
   * @param {number} s chainage
   * @param {number} [lateral] metres to the right of increasing chainage
   * @returns {{ x: number, y: number, tx: number, ty: number, heading: number }}
   *   tx, ty: unit direction of increasing chainage; heading: radians clockwise from north
   */
  pointAt(s, lateral = 0) {
    const i = this.segmentIndex(s);
    const p0 = this.points[i];
    const p1 = this.points[i + 1];
    const len = this.cumulative[i + 1] - this.cumulative[i];
    const tx = (p1.x - p0.x) / len;
    const ty = (p1.y - p0.y) / len;
    const along = s - this.cumulative[i];
    return {
      x: p0.x + tx * along + ty * lateral,
      y: p0.y + ty * along - tx * lateral,
      tx,
      ty,
      heading: Math.atan2(tx, ty),
    };
  }
}
