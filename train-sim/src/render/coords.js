import * as THREE from 'three';

/**
 * Turns route positions into Three.js world positions.
 *
 * Route files use map metres (x = east, y = north) and chainage along the alignment. Three.js is
 * y-up, so map x → world x, map y → world −z, and height comes from the gradient profile.
 * Heights are measured from the top of the rail: 0 is railhead level.
 */
export class WorldMapper {
  /** @param {import('../route/route.js').Route} route */
  constructor(route) {
    this.route = route;
  }

  /**
   * @param {number} s chainage
   * @param {number} [lateral] metres right of increasing chainage
   * @param {number} [height] metres above the railhead
   * @param {THREE.Vector3} [out]
   */
  point(s, lateral = 0, height = 0, out = new THREE.Vector3()) {
    const p = this.route.alignment.pointAt(s, lateral);
    return out.set(p.x, this.route.elevationAt(s) + height, -p.y);
  }

  /**
   * Rotation about the vertical axis that turns an object's local +Z to face along `dir`
   * (dir = +1: towards increasing chainage).
   * @param {number} s
   * @param {1 | -1} dir
   */
  yawFacing(s, dir) {
    const { tx, ty } = this.route.alignment.pointAt(s);
    return Math.atan2(dir * tx, -dir * ty);
  }
}
