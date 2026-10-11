import * as THREE from 'three';
import { mpsToMph } from '../core/units.js';
import { makeLabelTexture, seededRandom } from './textures.js';
import { sweepProfile } from './trackMesh.js';

/** UK standard platform height above the rail. */
const PLATFORM_HEIGHT = 0.915;
/** Platform edge distance from track centre (A). */
const PLATFORM_EDGE = 1.45;
const PLATFORM_DEPTH = 4;
/** Ground (field) level below the railhead. */
export const GROUND_LEVEL = -0.65;

export const SKY = Object.freeze({ top: 0x6f9fd8, horizon: 0xc9dbe8 });

/** Gradient sky dome that follows the camera. */
export function buildSky() {
  const geo = new THREE.SphereGeometry(8000, 32, 16);
  const top = new THREE.Color(SKY.top);
  const horizon = new THREE.Color(SKY.horizon);
  const colours = [];
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / 8000);
    const c = horizon.clone().lerp(top, Math.pow(t, 0.6));
    colours.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  return sky;
}

/**
 * A big flat field that follows the camera, with the texture shifted so the grass stays put.
 * Fine for the flat coastal plain; real terrain arrives with the real route.
 * @param {THREE.Texture} grass
 */
export function buildGround(grass) {
  const size = 12000;
  grass.repeat.set(size / 12, size / 12);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: grass }));
  ground.rotation.x = -Math.PI / 2;
  ground.userData.follow = (/** @type {THREE.Vector3} */ cam, /** @type {number} */ height) => {
    const snap = 12; // move in whole texture tiles so the grass doesn't swim
    ground.position.set(Math.round(cam.x / snap) * snap, height, Math.round(cam.z / snap) * snap);
  };
  return ground;
}

/**
 * Trees, hedgerows, lineside fencing and distant hills, scattered with a fixed seed.
 * @param {import('../route/route.js').Route} route
 * @param {import('./coords.js').WorldMapper} mapper
 */
export function buildLandscape(route, mapper) {
  const rnd = seededRandom(route.data.scenery?.seed ?? 1);
  const group = new THREE.Group();
  group.name = 'landscape';
  const tmp = new THREE.Object3D();
  const v = new THREE.Vector3();
  const length = route.length;
  const offsets = [...route.tracks.values()].map((t) => t.offset);
  const corridorLeft = Math.min(...offsets) - 6;
  const corridorRight = Math.max(...offsets) + 6;

  // Trees: a trunk and a crown, as two instanced meshes (one draw call each).
  const treeCount = Math.round(length / 12);
  const crownGeo = new THREE.IcosahedronGeometry(1, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 1, 5);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x3f5f2a, flatShading: true }), treeCount);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x4a3a2a }), treeCount);
  const crownColour = new THREE.Color();
  for (let i = 0; i < treeCount; i++) {
    const s = -600 + rnd() * (length + 1200);
    const side = rnd() < 0.5 ? -1 : 1;
    // Cluster most trees near the line (hedgerow trees), a few far out in the fields.
    const dist = rnd() < 0.75 ? 9 + rnd() * 40 : 50 + rnd() * 450;
    const lateral = side < 0 ? corridorLeft - dist : corridorRight + dist;
    const height = 5 + rnd() * 9;
    mapper.point(s, lateral, GROUND_LEVEL, v);
    tmp.position.set(v.x, v.y + height * 0.3, v.z);
    tmp.scale.set(1, height * 0.6, 1);
    tmp.rotation.set(0, 0, 0);
    tmp.updateMatrix();
    trunks.setMatrixAt(i, tmp.matrix);
    const r = height * (0.28 + rnd() * 0.12);
    tmp.position.set(v.x, v.y + height * 0.62, v.z);
    tmp.scale.set(r * (0.9 + rnd() * 0.3), r * (1 + rnd() * 0.5), r * (0.9 + rnd() * 0.3));
    tmp.rotation.set(0, rnd() * Math.PI, 0);
    tmp.updateMatrix();
    crowns.setMatrixAt(i, tmp.matrix);
    crowns.setColorAt(i, crownColour.setHSL(0.22 + rnd() * 0.08, 0.35 + rnd() * 0.2, 0.22 + rnd() * 0.1));
  }
  group.add(trunks, crowns);

  // Hedgerows along field edges parallel to the line, in long broken runs.
  const hedgeMat = new THREE.MeshLambertMaterial({ color: 0x35512a });
  for (const side of [-1, 1]) {
    let s = -500;
    while (s < length + 500) {
      const run = 150 + rnd() * 400;
      const lateral = side < 0 ? corridorLeft - 14 - rnd() * 6 : corridorRight + 14 + rnd() * 6;
      const geo = sweepProfile(mapper, {
        from: s,
        to: s + run,
        lateral,
        profile: [
          [-1.2, GROUND_LEVEL],
          [-0.8, GROUND_LEVEL + 1.8 + rnd()],
          [0.8, GROUND_LEVEL + 1.8 + rnd()],
          [1.2, GROUND_LEVEL],
        ],
        step: 25,
      });
      group.add(new THREE.Mesh(geo, hedgeMat));
      s += run + 30 + rnd() * 200;
    }
  }

  // Post-and-wire lineside fence on both sides, posts every 3 m.
  const postsPerSide = Math.ceil(length / 3);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), new THREE.MeshLambertMaterial({ color: 0x6b5a45 }), postsPerSide * 2);
  let k = 0;
  for (const lateral of [corridorLeft, corridorRight]) {
    for (let i = 0; i < postsPerSide; i++) {
      mapper.point(i * 3, lateral, GROUND_LEVEL + 0.6, v);
      tmp.position.copy(v);
      tmp.scale.set(1, 1, 1);
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      posts.setMatrixAt(k++, tmp.matrix);
    }
    const wire = sweepProfile(mapper, {
      from: 0,
      to: length,
      lateral,
      profile: [
        [0, GROUND_LEVEL + 0.85],
        [0, GROUND_LEVEL + 1.1],
      ],
      step: 50,
    });
    group.add(new THREE.Mesh(wire, new THREE.MeshBasicMaterial({ color: 0x555555, side: THREE.DoubleSide })));
  }
  group.add(posts);

  // Distant hills: on the real route the South Downs rise to the north of the coastal plain.
  const hillSide = route.data.scenery?.hills === 'right' ? 1 : -1;
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x6f8a6a, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const s = -2000 + (i / 8) * (length + 4000) + (rnd() - 0.5) * 800;
    const lateral = hillSide * (3500 + rnd() * 2500);
    mapper.point(s, lateral, GROUND_LEVEL - 10, v);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    hill.position.copy(v);
    hill.scale.set(1400 + rnd() * 1600, 120 + rnd() * 110, 900 + rnd() * 700);
    hill.rotation.y = rnd() * Math.PI;
    group.add(hill);
  }
  return group;
}

/**
 * Platforms with yellow safety lines, nameboards and stop markers.
 * @param {import('../route/route.js').Route} route
 * @param {import('./coords.js').WorldMapper} mapper
 * @param {THREE.Texture} paving
 */
export function buildPlatforms(route, mapper, paving) {
  const group = new THREE.Group();
  group.name = 'platforms';
  const pavingMat = new THREE.MeshLambertMaterial({ map: paving });
  const edgeMat = new THREE.MeshLambertMaterial({ color: 0xc8c2b6 });
  const yellowMat = new THREE.MeshBasicMaterial({ color: 0xf2c200 });

  for (const p of route.data.platforms ?? []) {
    const track = route.track(p.track);
    // "left" means on the driver's left for trains using that track.
    const side = (p.side === 'left' ? -1 : 1) * track.dir;
    const edge = track.offset + side * PLATFORM_EDGE;
    const back = edge + side * PLATFORM_DEPTH;
    const top = PLATFORM_HEIGHT; // heights are measured from the railhead
    const across = side < 0 ? [back, edge] : [edge, back];
    const body = sweepProfile(mapper, {
      from: p.from,
      to: p.to,
      lateral: 0,
      profile: [
        [across[0], GROUND_LEVEL],
        [across[0], top],
        [across[1], top],
        [across[1], GROUND_LEVEL],
      ],
      step: 10,
      vRepeat: 4,
    });
    group.add(new THREE.Mesh(body, pavingMat));
    // Coping stones and the yellow line 0.7 m back from the edge.
    const coping = sweepProfile(mapper, { from: p.from, to: p.to, lateral: edge + side * 0.25, profile: [[-0.25, top + 0.01], [0.25, top + 0.01]], step: 10 });
    group.add(new THREE.Mesh(coping, edgeMat));
    const line = sweepProfile(mapper, { from: p.from, to: p.to, lateral: edge + side * 0.75, profile: [[-0.05, top + 0.015], [0.05, top + 0.015]], step: 10 });
    group.add(new THREE.Mesh(line, yellowMat));

    // Nameboards along the platform, facing the track.
    const nameTex = makeLabelTexture([p.name], { bg: '#ffffff', fg: '#0b2a4a', width: 512, height: 96, font: 'bold 52px Arial, sans-serif', border: '#0b2a4a' });
    for (let s = p.from + 40; s < p.to - 20; s += 90) {
      const board = makeBoard(nameTex, 3, 0.56, 2.4);
      mapper.point(s, edge + side * 3.5, top, board.position);
      board.rotation.y = mapper.yawFacing(s, 1) + (side < 0 ? -Math.PI / 2 : Math.PI / 2); // face the track
      group.add(board);
    }

    // Stop markers: white boards on the platform edge where the front of the train should stop.
    for (const m of p.stopMarkers ?? []) {
      const tex = makeLabelTexture([String(m.cars)], { bg: '#ffffff', fg: '#000000', width: 64, height: 64, font: 'bold 44px Arial, sans-serif', border: '#000000' });
      const marker = makeBoard(tex, 0.45, 0.45, 1.3);
      mapper.point(m.position, edge + side * 0.4, top, marker.position);
      marker.rotation.y = mapper.yawFacing(m.position, /** @type {1 | -1} */ (-track.dir));
      group.add(marker);
    }
  }
  return group;
}

/**
 * Permanent speed indicators: the line speed in figures, at the start of each new limit, on the
 * driver's side (A: drawn as black figures on white; check the real style for the route).
 * @param {import('../route/route.js').Route} route
 * @param {import('./coords.js').WorldMapper} mapper
 * @param {string} trackId
 */
export function buildSpeedBoards(route, mapper, trackId) {
  const group = new THREE.Group();
  group.name = 'speed boards';
  const track = route.track(trackId);
  const dir = track.dir;
  let s = dir > 0 ? 0 : route.length;
  let guard = 0;
  while (guard++ < 1000) {
    const change = route.speedLimits.nextChange(s, dir);
    if (!change || change.position < 0 || change.position > route.length) break;
    const mph = Math.round(mpsToMph(route.speedLimitAt(change.position + dir * 0.5)));
    const tex = makeLabelTexture([String(mph)], { bg: '#ffffff', fg: '#000000', width: 128, height: 128, font: 'bold 84px Arial, sans-serif', border: '#000000' });
    const board = makeBoard(tex, 0.7, 0.7, 2.2);
    mapper.point(change.position, track.offset - dir * 2.4, 0, board.position);
    board.rotation.y = mapper.yawFacing(change.position, /** @type {1 | -1} */ (-dir));
    group.add(board);
    s = change.position + dir * 0.01;
  }
  return group;
}

/**
 * A flat sign on a post.
 * @param {THREE.Texture} tex
 * @param {number} w
 * @param {number} h
 * @param {number} height of the sign's centre above its base
 */
function makeBoard(tex, w, h, height) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.y = height;
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: 0x555555 }));
  backing.position.set(0, height, -0.01);
  backing.rotation.y = Math.PI;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, height, 0.06), new THREE.MeshLambertMaterial({ color: 0x777777 }));
  post.position.set(0, height / 2 - h / 2, -0.04);
  g.add(face, backing, post);
  return g;
}
