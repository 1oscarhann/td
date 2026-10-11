import * as THREE from 'three';

/** Track geometry constants (metres). */
export const TRACK = Object.freeze({
  railCentre: 0.7525, // half of 1435 mm gauge + half a railhead
  railHeadWidth: 0.07,
  railHeight: 0.17, // railhead above the sleeper tops
  bedHalfWidth: 2.4, // ballast bed, toe to toe, is 4.8 m
  bedTopHalfWidth: 1.6,
  bedDepth: 0.45, // toe of the ballast below the sleeper tops
  conductorRailOffset: 1.2, // third rail centre from track centre
  conductorRailRise: 0.075, // its top sits 75 mm above the running rails
});

/**
 * Sweep a cross-section along the alignment, like squeezing toothpaste along the track. Works on
 * curves because every slice is placed with the alignment. One function builds ballast, rails,
 * the third rail and platforms.
 *
 * @param {import('./coords.js').WorldMapper} mapper
 * @param {object} o
 * @param {number} o.from chainage to start at
 * @param {number} o.to chainage to finish at
 * @param {number} o.lateral centre of the profile, metres right of increasing chainage
 * @param {[number, number][]} o.profile cross-section as [lateral, height] points, left to right
 * @param {number} [o.step] metres between slices
 * @param {number} [o.vRepeat] metres of track per texture repeat along the line
 */
export function sweepProfile(mapper, { from, to, lateral, profile, step = 5, vRepeat = 1 }) {
  const slices = Math.max(1, Math.ceil((to - from) / step));
  const n = profile.length;
  const positions = new Float32Array((slices + 1) * n * 3);
  const uvs = new Float32Array((slices + 1) * n * 2);
  const minLat = profile[0][0];
  const span = profile[n - 1][0] - minLat || 1;
  const v = new THREE.Vector3();
  for (let i = 0; i <= slices; i++) {
    const s = from + ((to - from) * i) / slices;
    for (let j = 0; j < n; j++) {
      const [lat, h] = profile[j];
      mapper.point(s, lateral + lat, h, v);
      const k = i * n + j;
      positions.set([v.x, v.y, v.z], k * 3);
      uvs.set([(lat - minLat) / span, s / vRepeat], k * 2);
    }
  }
  const index = [];
  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      const b = a + n;
      index.push(a, a + 1, b, a + 1, b + 1, b); // counter-clockwise seen from above/outside
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/**
 * @param {number} halfWidth
 * @param {number} top
 * @param {number} bottom
 * @returns {[number, number][]} a box-shaped profile with sides and a top
 */
const boxProfile = (halfWidth, top, bottom) => [
  [-halfWidth, bottom],
  [-halfWidth, top],
  [halfWidth, top],
  [halfWidth, bottom],
];

/**
 * Ballast, sleepers, running rails and the third rail for every track in the route.
 * @param {import('../route/route.js').Route} route
 * @param {import('./coords.js').WorldMapper} mapper
 * @param {{ ballast: THREE.Texture }} textures
 */
export function buildTrack(route, mapper, textures) {
  const group = new THREE.Group();
  group.name = 'track';
  const from = 0;
  const to = route.length;
  const ballastMat = new THREE.MeshLambertMaterial({ map: textures.ballast });
  const railMat = new THREE.MeshLambertMaterial({ color: 0x8a8580 });
  const conductorMat = new THREE.MeshLambertMaterial({ color: 0x6b6660 });
  const sleeperTop = -TRACK.railHeight;

  for (const track of route.tracks.values()) {
    const bed = sweepProfile(mapper, {
      from,
      to,
      lateral: track.offset,
      profile: [
        [-TRACK.bedHalfWidth, sleeperTop - TRACK.bedDepth],
        [-TRACK.bedTopHalfWidth, sleeperTop],
        [TRACK.bedTopHalfWidth, sleeperTop],
        [TRACK.bedHalfWidth, sleeperTop - TRACK.bedDepth],
      ],
      step: 10,
      vRepeat: 2.6,
    });
    // The texture spans the whole bed, so stretch u across the full 4.8 m rather than per face.
    group.add(new THREE.Mesh(bed, ballastMat));

    for (const side of [-1, 1]) {
      const rail = sweepProfile(mapper, {
        from,
        to,
        lateral: track.offset + side * TRACK.railCentre,
        profile: boxProfile(TRACK.railHeadWidth / 2, 0, sleeperTop),
        step: 10,
      });
      group.add(new THREE.Mesh(rail, railMat));
    }

    const conductorSide = track.conductorRail === 'left' ? -1 : 1;
    const third = sweepProfile(mapper, {
      from,
      to,
      lateral: track.offset + conductorSide * TRACK.conductorRailOffset,
      profile: boxProfile(0.04, TRACK.conductorRailRise, sleeperTop + 0.05),
      step: 10,
    });
    group.add(new THREE.Mesh(third, conductorMat));
  }
  return group;
}
