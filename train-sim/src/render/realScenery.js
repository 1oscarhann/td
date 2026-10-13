import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seededRandom } from './textures.js';

/**
 * Scenery built from OpenStreetMap data (see tools/build-route.mjs): buildings, roads, the
 * river, woodland and landmarks, all sat on the real terrain.
 */

/** Wall colours by building class: houses (brick / render), sheds, industrial, churches (flint). */
const WALLS = [
  [0x9b5a43, 0xb9a283, 0xd8cdb4, 0x8f4f3a, 0xc6b79a],
  [0x7a6e60],
  [0x9aa3a8, 0x8c949a],
  [0x8f8a80],
];
const ROOFS = [0x5a4038, 0x4a4b50, 0x6b3a2e];

/**
 * @param {{ buildings: number[][] }} data each building: [height, class, x1, y1, x2, y2, …]
 * @param {import('./terrain.js').Terrain} terrain
 */
export function buildBuildings(data, terrain) {
  const rnd = seededRandom(7);
  /** @type {THREE.BufferGeometry[]} */
  const parts = [];
  const colour = new THREE.Color();
  for (const b of data.buildings ?? []) {
    const [height, cls] = b;
    /** @type {THREE.Vector2[]} */
    const pts = [];
    for (let i = 2; i + 1 < b.length; i += 2) pts.push(new THREE.Vector2(b[i], b[i + 1]));
    if (pts.length < 3) continue;
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const base = Math.min(...pts.map((p) => terrain.height(p.x, p.y)), terrain.height(cx, cy)) - 0.3;
    let geo;
    try {
      geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: height, bevelEnabled: false });
    } catch {
      continue;
    }
    // Shape is in map x/y; extrusion goes along +z. Rotate so +z becomes up, and y → −z.
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, base, 0);
    const wall = colour.set(WALLS[cls][Math.floor(rnd() * WALLS[cls].length)]).clone();
    const roof = new THREE.Color(ROOFS[Math.floor(rnd() * ROOFS.length)]);
    const pos = geo.getAttribute('position');
    const normal = geo.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = normal.getY(i) > 0.5 ? roof : wall;
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.deleteAttribute('uv');
    parts.push(geo);
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'buildings';
  return mesh;
}

/**
 * Roads as ribbons draped on the terrain.
 * @param {{ roads: number[][] }} data each road: [class, x1, y1, …]
 * @param {import('./terrain.js').Terrain} terrain
 */
export function buildRoads(data, terrain) {
  const widths = [0, 4.5, 6, 7.5, 10];
  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const index = [];
  for (const r of data.roads ?? []) {
    const w = widths[r[0]] / 2;
    /** @type {[number, number][]} */
    const pts = [];
    for (let i = 1; i + 1 < r.length; i += 2) pts.push([r[i], r[i + 1]]);
    // Densify so the ribbon follows the ground.
    /** @type {[number, number][]} */
    const dense = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 20));
      for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
    }
    dense.push(pts[pts.length - 1]);
    if (dense.length < 2) continue;
    const start = positions.length / 3;
    for (let i = 0; i < dense.length; i++) {
      const a = dense[Math.max(0, i - 1)];
      const b = dense[Math.min(dense.length - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / len;
      const ny = (b[0] - a[0]) / len;
      const [x, y] = dense[i];
      const h = terrain.height(x, y) + 0.25;
      positions.push(x + nx * w, h, -(y + ny * w), x - nx * w, h, -(y - ny * w));
      if (i > 0) {
        const k = start + (i - 1) * 2;
        index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
  }
  if (!index.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x4a4b4d, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  mesh.name = 'roads';
  return mesh;
}

/**
 * Water: river areas as flat surfaces just above the carved river bed.
 * @param {{ riverAreas: number[][][], riverLines: number[][][] }} data
 */
export function buildWater(data) {
  const shapes = [];
  for (const poly of data.riverAreas ?? []) {
    const pts = poly.map(([x, y]) => new THREE.Vector2(x, y));
    if (pts.length < 3) continue;
    shapes.push(new THREE.Shape(pts));
  }
  const group = new THREE.Group();
  group.name = 'water';
  const mat = new THREE.MeshLambertMaterial({ color: 0x5e7782, transparent: true, opacity: 0.92 });
  if (shapes.length) {
    const geo = new THREE.ShapeGeometry(shapes);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0.6, 0);
    group.add(new THREE.Mesh(geo, mat));
  }
  // Rivers mapped only as a centreline get a 20 m ribbon.
  if (!shapes.length) {
    for (const line of data.riverLines ?? []) {
      /** @type {number[]} */
      const pos = [];
      /** @type {number[]} */
      const idx = [];
      line.forEach(([x, y], i) => {
        const a = line[Math.max(0, i - 1)];
        const b = line[Math.min(line.length - 1, i + 1)];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nx = (-(b[1] - a[1]) / len) * 10;
        const ny = ((b[0] - a[0]) / len) * 10;
        pos.push(x + nx, 0.6, -(y + ny), x - nx, 0.6, -(y - ny));
        if (i > 0) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x5e7782, side: THREE.DoubleSide })));
    }
  }
  return group;
}

/**
 * Trees: scattered through mapped woodland (denser near the line, where you'll see them), plus
 * hedgerow trees along the railway everywhere else.
 * @param {{ woods: number[][][] }} data
 * @param {import('./terrain.js').Terrain} terrain
 * @param {import('../route/network.js').Network} network
 */
export function buildTrees(data, terrain, network) {
  const rnd = seededRandom(99);
  /** @type {[number, number, number][]} x, y, height */
  const trees = [];
  // Line samples, to keep woodland trees off the track and thin them out far away.
  /** @type {[number, number][]} */
  const samples = [];
  for (const line of network.lines.values()) {
    for (let s = 0; s <= line.length; s += 40) {
      const p = line.alignment.pointAt(s);
      samples.push([p.x, p.y]);
    }
  }
  const distToLine = (/** @type {number} */ x, /** @type {number} */ y) => {
    let d = Infinity;
    for (const [sx, sy] of samples) d = Math.min(d, Math.abs(sx - x) + Math.abs(sy - y));
    return d;
  };
  const MAX = 26000;
  for (const poly of data.woods ?? []) {
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const near = distToLine((minX + maxX) / 2, (minY + maxY) / 2);
    const spacing = near < 600 ? 9 : near < 2000 ? 16 : 28;
    for (let x = minX; x < maxX && trees.length < MAX; x += spacing) {
      for (let y = minY; y < maxY && trees.length < MAX; y += spacing) {
        const px = x + (rnd() - 0.5) * spacing;
        const py = y + (rnd() - 0.5) * spacing;
        if (!inPoly(px, py, poly)) continue;
        if (distToLine(px, py) < 14) continue;
        trees.push([px, py, 8 + rnd() * 11]);
      }
    }
  }
  // Hedgerow trees along the line.
  for (const line of network.lines.values()) {
    for (let s = 0; s < line.length && trees.length < MAX + 4000; s += 14) {
      if (rnd() < 0.45) continue;
      const side = rnd() < 0.5 ? -1 : 1;
      const p = line.alignment.pointAt(s, side * (14 + rnd() * 35));
      trees.push([p.x, p.y, 6 + rnd() * 9]);
    }
  }
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), trees.length);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.25, 1, 5), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }), trees.length);
  const tmp = new THREE.Object3D();
  const c = new THREE.Color();
  trees.forEach(([x, y, h], i) => {
    const g = terrain.height(x, y);
    tmp.position.set(x, g + h * 0.3, -y);
    tmp.scale.set(1, h * 0.6, 1);
    tmp.rotation.set(0, 0, 0);
    tmp.updateMatrix();
    trunks.setMatrixAt(i, tmp.matrix);
    const r = h * (0.28 + rnd() * 0.12);
    tmp.position.set(x, g + h * 0.62, -y);
    tmp.scale.set(r * (0.9 + rnd() * 0.3), r * (1 + rnd() * 0.5), r * (0.9 + rnd() * 0.3));
    tmp.rotation.set(0, rnd() * Math.PI, 0);
    tmp.updateMatrix();
    crowns.setMatrixAt(i, tmp.matrix);
    crowns.setColorAt(i, c.setHSL(0.22 + rnd() * 0.08, 0.3 + rnd() * 0.2, 0.2 + rnd() * 0.1));
  });
  const group = new THREE.Group();
  group.name = 'trees';
  group.add(trunks, crowns);
  group.userData.crowns = crowns;
  return group;
}

/**
 * Landmarks you can see from the train: Arundel Castle on its hill, the two cathedrals, Amberley
 * Castle. Simple shapes at their real positions.
 * @param {{ name: string, kind: string, x: number, y: number }[]} landmarks
 * @param {import('./terrain.js').Terrain} terrain
 */
export function buildLandmarks(landmarks, terrain) {
  const group = new THREE.Group();
  group.name = 'landmarks';
  const stone = new THREE.MeshLambertMaterial({ color: 0xa79e8c });
  const flint = new THREE.MeshLambertMaterial({ color: 0x8c877c });
  const roof = new THREE.MeshLambertMaterial({ color: 0x55595c });
  const copper = new THREE.MeshLambertMaterial({ color: 0x6f9a86 });
  for (const lm of landmarks) {
    const g = new THREE.Group();
    const h0 = terrain.height(lm.x, lm.y);
    if (lm.kind === 'castle') {
      const big = /Arundel/.test(lm.name);
      const keep = new THREE.Mesh(new THREE.CylinderGeometry(big ? 14 : 8, big ? 15 : 8, big ? 22 : 12, 16), stone);
      keep.position.y = big ? 11 : 6;
      g.add(keep);
      for (const [dx, dz, w, d] of big
        ? [[45, 0, 80, 10], [-10, 30, 10, 70], [90, 30, 10, 60], [45, 60, 90, 10]]
        : [[0, 0, 40, 6], [0, 35, 40, 6], [-18, 17, 6, 40], [18, 17, 6, 40]]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, big ? 14 : 8, d), stone);
        wall.position.set(dx, big ? 7 : 4, dz);
        g.add(wall);
      }
      if (big) {
        for (const [dx, dz] of [[90, 0], [90, 60], [0, 60]]) {
          const tower = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 24, 12), stone);
          tower.position.set(dx, 12, dz);
          g.add(tower);
        }
      }
    } else {
      // Cathedral: a long nave with a spire (Chichester's is 84 m; Arundel's has a flèche).
      const chichester = /Chichester|Holy Trinity/.test(lm.name);
      const nave = new THREE.Mesh(new THREE.BoxGeometry(18, 22, 100), flint);
      nave.position.y = 11;
      const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 12, 8, 4, 1, false, Math.PI / 4), roof);
      ridge.scale.set(1, 1, 8.3);
      ridge.position.y = 26;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(14, chichester ? 40 : 30, 14), flint);
      tower.position.set(0, chichester ? 20 : 15, 10);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(chichester ? 7 : 5, chichester ? 44 : 22, 8), chichester ? copper : roof);
      spire.position.set(0, chichester ? 62 : 41, 10);
      g.add(nave, ridge, tower, spire);
    }
    g.position.set(lm.x, h0, -lm.y);
    g.rotation.y = 0.2;
    group.add(g);
  }
  return group;
}

/** @param {number} x @param {number} y @param {number[][]} poly */
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
