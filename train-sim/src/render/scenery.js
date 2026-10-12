import * as THREE from 'three';
import { makeLabelTexture, seededRandom } from './textures.js';
import { sweepProfile, TRACK } from './trackMesh.js';
import { FORMATION } from './terrain.js';

/** UK standard platform height above the rail. */
const PLATFORM_HEIGHT = 0.915;
/** Platform edge distance from track centre (A). */
const PLATFORM_EDGE = 1.45;
const PLATFORM_DEPTH = 4.5;
/** Ground (field) level below the railhead, for the flat test track. */
export const GROUND_LEVEL = FORMATION;

/** Sky colours by time of day; the renderer blends between them. */
export const SKY = Object.freeze({ top: 0x6f9fd8, horizon: 0xc9dbe8 });

/** Gradient sky dome that follows the camera. Colours are updated by the renderer. */
export function buildSky() {
  const geo = new THREE.SphereGeometry(9000, 32, 16);
  const pos = geo.getAttribute('position');
  const t = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) t[i] = Math.max(0, pos.getY(i) / 9000);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  sky.userData.heights = t;
  sky.userData.paint = (/** @type {THREE.Color} */ top, /** @type {THREE.Color} */ horizon) => {
    const colour = geo.getAttribute('color');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(horizon).lerp(top, Math.pow(t[i], 0.6));
      colour.setXYZ(i, c.r, c.g, c.b);
    }
    colour.needsUpdate = true;
  };
  sky.userData.paint(new THREE.Color(SKY.top), new THREE.Color(SKY.horizon));
  return sky;
}

/**
 * A big flat field that follows the camera (test track only; real routes have terrain).
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
 * Procedural trees, hedgerows, fencing and distant hills for routes without real scenery data.
 * @param {import('../route/network.js').Network} network
 * @param {import('./coords.js').WorldMapper} mapper
 * @param {any} sceneryData
 */
export function buildLandscape(network, mapper, sceneryData) {
  const rnd = seededRandom(sceneryData?.seed ?? 1);
  const group = new THREE.Group();
  group.name = 'landscape';
  const tmp = new THREE.Object3D();
  const v = new THREE.Vector3();
  const lines = [...network.lines.values()];
  const totalLength = lines.reduce((a, l) => a + l.length, 0);

  const treeCount = Math.round(totalLength / 12);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), treeCount);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.25, 1, 5), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }), treeCount);
  const colour = new THREE.Color();
  for (let i = 0; i < treeCount; i++) {
    const line = lines[Math.floor(rnd() * lines.length)];
    const s = -600 + rnd() * (line.length + 1200);
    const side = rnd() < 0.5 ? -1 : 1;
    const dist = rnd() < 0.75 ? 13 + rnd() * 40 : 55 + rnd() * 450;
    const height = 5 + rnd() * 9;
    mapper.point(line.id, s, side * dist, GROUND_LEVEL, v);
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
    crowns.setColorAt(i, colour.setHSL(0.22 + rnd() * 0.08, 0.35 + rnd() * 0.2, 0.22 + rnd() * 0.1));
  }
  group.add(trunks, crowns);

  const hedgeMat = new THREE.MeshLambertMaterial({ color: 0x35512a });
  for (const line of lines) {
    for (const side of [-1, 1]) {
      let s = -500;
      while (s < line.length + 500) {
        const run = 150 + rnd() * 400;
        const geo = sweepProfile(mapper, {
          line: line.id,
          from: s,
          to: s + run,
          lateral: side * (22 + rnd() * 6),
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
  }

  const hillSide = sceneryData?.hills === 'right' ? 1 : -1;
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x6f8a6a, flatShading: true });
  const main = lines[0];
  for (let i = 0; i < 9; i++) {
    const s = -2000 + (i / 8) * (main.length + 4000) + (rnd() - 0.5) * 800;
    mapper.point(main.id, s, hillSide * (3500 + rnd() * 2500), GROUND_LEVEL - 10, v);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    hill.position.copy(v);
    hill.scale.set(1400 + rnd() * 1600, 120 + rnd() * 110, 900 + rnd() * 700);
    hill.rotation.y = rnd() * Math.PI;
    group.add(hill);
  }
  return group;
}

/**
 * Lineside fence posts along every line.
 * @param {import('../route/network.js').Network} network
 * @param {import('./coords.js').WorldMapper} mapper
 */
export function buildFences(network, mapper) {
  const group = new THREE.Group();
  const lines = [...network.lines.values()];
  const count = lines.reduce((a, l) => a + Math.ceil(l.length / 3) * 2, 0);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), new THREE.MeshLambertMaterial({ color: 0x6b5a45 }), count);
  const tmp = new THREE.Object3D();
  const v = new THREE.Vector3();
  let k = 0;
  for (const line of lines) {
    const offsets = [...line.data.tracks.map((/** @type {any} */ t) => t.offset)];
    const lo = Math.min(...offsets) - 7.5;
    const hi = Math.max(...offsets) + 7.5;
    for (const lateral of [lo, hi]) {
      for (let s = 0; s < line.length; s += 3) {
        mapper.point(line.id, s, lateral, GROUND_LEVEL + 0.6, v);
        tmp.position.copy(v);
        tmp.updateMatrix();
        posts.setMatrixAt(k++, tmp.matrix);
      }
      const wire = sweepProfile(mapper, { line: line.id, from: 0, to: line.length, lateral, profile: [[0, GROUND_LEVEL + 0.85], [0, GROUND_LEVEL + 1.1]], step: 50 });
      group.add(new THREE.Mesh(wire, new THREE.MeshBasicMaterial({ color: 0x555555, side: THREE.DoubleSide })));
    }
  }
  posts.count = k;
  group.add(posts);
  return group;
}

/**
 * Platforms with coping, yellow safety lines, canopies, lamps, nameboards and stop markers.
 * Returns the group and the lamp heads (lit at night).
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
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2f5a3f });
  const steelMat = new THREE.MeshLambertMaterial({ color: 0x3a3d40 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
  /** @type {THREE.MeshBasicMaterial} */
  const lampHeads = lampMat;

  for (const p of route.platforms.values()) {
    const track = route.network.track(`${p.line}/${p.track}`);
    const side = (p.side === 'left' ? -1 : 1) * track.dir;
    const edge = track.offset + side * PLATFORM_EDGE;
    const back = edge + side * PLATFORM_DEPTH;
    const top = PLATFORM_HEIGHT;
    const across = side < 0 ? [back, edge] : [edge, back];
    group.add(
      new THREE.Mesh(
        sweepProfile(mapper, { line: p.line, from: p.from, to: p.to, lateral: 0, profile: [[across[0], GROUND_LEVEL], [across[0], top], [across[1], top], [across[1], GROUND_LEVEL]], step: 8, vRepeat: 4 }),
        pavingMat,
      ),
    );
    group.add(new THREE.Mesh(sweepProfile(mapper, { line: p.line, from: p.from, to: p.to, lateral: edge + side * 0.25, profile: [[-0.25, top + 0.01], [0.25, top + 0.01]], step: 8 }), edgeMat));
    group.add(new THREE.Mesh(sweepProfile(mapper, { line: p.line, from: p.from, to: p.to, lateral: edge + side * 0.75, profile: [[-0.05, top + 0.015], [0.05, top + 0.015]], step: 8 }), yellowMat));

    // A canopy over the middle third, on columns.
    const mid = (p.from + p.to) / 2;
    const half = Math.min(45, (p.to - p.from) / 5);
    const canopyLat = edge + side * 2.6;
    group.add(new THREE.Mesh(sweepProfile(mapper, { line: p.line, from: mid - half, to: mid + half, lateral: canopyLat, profile: [[-2.2, top + 3.4], [-2.2, top + 3.7], [2.2, top + 3.9], [2.2, top + 3.6]], step: 6 }), canopyMat));
    for (let s = mid - half + 3; s <= mid + half - 3; s += 9) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.5, 6), steelMat);
      mapper.point(p.line, s, canopyLat + side * 1.4, top + 1.75, col.position);
      group.add(col);
    }
    // Lamp posts along the platform.
    for (let s = p.from + 8; s < p.to - 4; s += 22) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.2, 6), steelMat);
      mapper.point(p.line, s, edge + side * 3.3, top + 2.1, post.position);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), lampHeads);
      mapper.point(p.line, s, edge + side * 3.1, top + 4.2, head.position);
      head.rotation.y = mapper.yaw(p.line, s, 1);
      group.add(post, head);
    }

    // Nameboards along the platform, facing the track.
    const nameTex = makeLabelTexture([p.name], { bg: '#ffffff', fg: '#0b2a4a', width: 512, height: 96, font: 'bold 52px Arial, sans-serif', border: '#0b2a4a' });
    for (let s = p.from + 35; s < p.to - 20; s += 70) {
      const board = makeBoard(nameTex, 3, 0.56, 2.4);
      mapper.point(p.line, s, edge + side * 3.9, top, board.position);
      board.rotation.y = mapper.yaw(p.line, s, 1) + (side < 0 ? -Math.PI / 2 : Math.PI / 2);
      group.add(board);
    }
    for (const m of p.stopMarkers ?? []) {
      const tex = makeLabelTexture([String(m.cars)], { bg: '#ffffff', fg: '#000000', width: 64, height: 64, font: 'bold 44px Arial, sans-serif', border: '#000000' });
      const marker = makeBoard(tex, 0.45, 0.45, 1.3);
      mapper.point(p.line, m.position, edge + side * 0.4, top, marker.position);
      marker.rotation.y = mapper.yaw(p.line, m.position, -track.dir);
      group.add(marker);
    }
  }
  return { group, lampHeads };
}

/**
 * Lineside boards from the trackside equipment list: speed indicators (with an arrow for a
 * diverging route), warning boards, whistle boards.
 * @param {import('../route/network.js').Network} network
 * @param {import('./coords.js').WorldMapper} mapper
 * @param {Map<string, import('../sim/trackside.js').TracksideItem[]>} trackside
 */
export function buildBoards(network, mapper, trackside) {
  const group = new THREE.Group();
  group.name = 'boards';
  /** @type {Map<string, THREE.Texture>} */
  const cache = new Map();
  const tex = (/** @type {string} */ key, /** @type {() => THREE.Texture} */ make) => {
    if (!cache.has(key)) cache.set(key, make());
    return /** @type {THREE.Texture} */ (cache.get(key));
  };
  for (const [key, items] of trackside) {
    const t = network.track(key);
    for (const item of items) {
      let board = null;
      if (item.kind === 'speed') {
        const label = item.diverging ? `${item.mph} ${item.diverging === 'left' ? '◀' : '▶'}` : String(item.mph);
        board = makeBoard(tex(`s${label}`, () => makeLabelTexture([label], { width: 128, height: 128, font: `bold ${item.diverging ? 60 : 84}px Arial, sans-serif`, border: '#000' })), 0.75, 0.75, 2.2);
      } else if (item.kind === 'warning') {
        board = makeBoard(tex(`w${item.mph}`, () => makeLabelTexture([String(item.mph)], { bg: '#f2c400', width: 128, height: 128, font: 'bold 80px Arial, sans-serif', border: '#000' })), 0.75, 0.75, 2.2);
      } else if (item.kind === 'whistle') {
        board = makeBoard(tex('sw', () => makeLabelTexture(['SW'], { width: 128, height: 128, font: 'bold 70px Arial, sans-serif', border: '#000' })), 0.6, 0.6, 1.8);
      }
      if (!board) continue;
      mapper.point(t.line.id, item.s, t.offset - t.dir * 2.6, 0, board.position);
      board.rotation.y = mapper.yaw(t.line.id, item.s, -t.dir);
      group.add(board);
    }
  }
  return group;
}

/**
 * Bridges (girders and piers) and tunnels (portals and a dark bore).
 * @param {import('../route/route.js').Route} route
 * @param {import('./coords.js').WorldMapper} mapper
 */
export function buildStructures(route, mapper) {
  const group = new THREE.Group();
  group.name = 'structures';
  const girderMat = new THREE.MeshLambertMaterial({ color: 0x4f5a52 });
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8b8378 });
  const boreMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, side: THREE.BackSide });
  const portalMat = new THREE.MeshLambertMaterial({ color: 0x7d6f5c });
  for (const lineData of route.data.lines) {
    const line = route.network.line(lineData.id);
    const offsets = lineData.tracks.map((/** @type {any} */ t) => t.offset);
    const lo = Math.min(...offsets) - 2.9;
    const hi = Math.max(...offsets) + 2.9;
    for (const st of lineData.structures ?? []) {
      if (st.type === 'bridge') {
        for (const lateral of [lo, hi]) {
          group.add(new THREE.Mesh(sweepProfile(mapper, { line: line.id, from: st.from - 2, to: st.to + 2, lateral, profile: [[-0.25, -1.4], [-0.25, 1.1], [0.25, 1.1], [0.25, -1.4]], step: 4 }), girderMat));
        }
        group.add(new THREE.Mesh(sweepProfile(mapper, { line: line.id, from: st.from - 2, to: st.to + 2, lateral: (lo + hi) / 2, profile: [[lo - (lo + hi) / 2, -1.2], [hi - (lo + hi) / 2, -1.2]], step: 4 }), girderMat));
        const span = st.to - st.from;
        const piers = Math.max(0, Math.floor(span / 18));
        for (let i = 0; i <= piers + 1; i++) {
          const s = st.from + (span * i) / (piers + 1);
          const pier = new THREE.Mesh(new THREE.BoxGeometry(hi - lo, 14, 1.6), pierMat);
          mapper.point(line.id, s, (lo + hi) / 2, -8.4, pier.position);
          pier.rotation.y = mapper.yaw(line.id, s, 1);
          group.add(pier);
        }
      } else if (st.type === 'tunnel') {
        const bore = sweepProfile(mapper, {
          line: line.id,
          from: st.from,
          to: st.to,
          lateral: (lo + hi) / 2,
          profile: Array.from({ length: 13 }, (_, i) => {
            const a = Math.PI * (i / 12);
            return /** @type {[number, number]} */ ([-Math.cos(a) * 5.2, -0.6 + Math.sin(a) * 6.5]);
          }),
          step: 4,
        });
        group.add(new THREE.Mesh(bore, boreMat));
        // Portals: a stone face with an arch-shaped hole (pillars and a lintel around the bore).
        for (const s of [st.from, st.to]) {
          const portal = new THREE.Group();
          const left = new THREE.Mesh(new THREE.BoxGeometry(6, 12, 1.5), portalMat);
          left.position.set(-8.3, 5.4, 0);
          const right = left.clone();
          right.position.x = 8.3;
          const top = new THREE.Mesh(new THREE.BoxGeometry(22.6, 5.4, 1.5), portalMat);
          top.position.set(0, 8.7, 0);
          portal.add(left, right, top);
          mapper.point(line.id, s, (lo + hi) / 2, -0.6, portal.position);
          portal.rotation.y = mapper.yaw(line.id, s, 1);
          group.add(portal);
        }
      }
    }
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
export function makeBoard(tex, w, h, height) {
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

export { TRACK };
