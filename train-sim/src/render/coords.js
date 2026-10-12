import * as THREE from 'three';

/**
 * Turns network positions into Three.js world positions.
 *
 * Route files use map metres (x = east, y = north) and chainage along each line. Three.js is
 * y-up, so map x → world x, map y → world −z, and height comes from each line's gradient
 * profile. Heights are measured from the top of the rail: 0 is railhead level.
 */
export class WorldMapper {
  /** @param {import('../route/network.js').Network} network */
  constructor(network) {
    this.network = network;
  }

  /**
   * A point beside a line.
   * @param {string} lineId
   * @param {number} s chainage
   * @param {number} [lateral] metres right of increasing chainage
   * @param {number} [height] metres above the railhead
   * @param {THREE.Vector3} [out]
   */
  point(lineId, s, lateral = 0, height = 0, out = new THREE.Vector3()) {
    const line = this.network.line(lineId);
    const p = line.alignment.pointAt(s, lateral);
    return out.set(p.x, line.elevationAt(s) + height, -p.y);
  }

  /**
   * A point relative to a track: `lateral` is measured from that track's centre.
   * @param {import('../route/network.js').TrackPos} pos
   * @param {number} [lateral]
   * @param {number} [height]
   * @param {THREE.Vector3} [out]
   */
  onTrack(pos, lateral = 0, height = 0, out = new THREE.Vector3()) {
    const t = this.network.track(pos.track);
    return this.point(t.line.id, pos.s, t.offset + lateral, height, out);
  }

  /**
   * Rotation about the vertical axis that turns an object's local +Z to face along a line
   * (dir +1: towards increasing chainage).
   * @param {string} lineId
   * @param {number} s
   * @param {number} dir
   */
  yaw(lineId, s, dir) {
    const { tx, ty } = this.network.line(lineId).alignment.pointAt(s);
    return Math.atan2(dir * tx, -dir * ty);
  }

  /**
   * Yaw facing along a track's direction of travel (or against it with flip = true).
   * @param {import('../route/network.js').TrackPos} pos
   * @param {boolean} [flip]
   */
  yawOnTrack(pos, flip = false) {
    const t = this.network.track(pos.track);
    return this.yaw(t.line.id, pos.s, flip ? -t.dir : t.dir);
  }

  /**
   * Map (x east, y north) and a height to a world vector.
   * @param {number} x
   * @param {number} y
   * @param {number} h
   * @param {THREE.Vector3} [out]
   */
  map(x, y, h, out = new THREE.Vector3()) {
    return out.set(x, h, -y);
  }
}
