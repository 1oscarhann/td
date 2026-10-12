import * as THREE from 'three';
import { seededRandom } from './textures.js';

/** Formation (ground under the ballast) below the railhead. */
export const FORMATION = -0.65;

/**
 * @typedef {object} TerrainHeader
 * @property {number} x0 south-west corner, map metres
 * @property {number} y0
 * @property {number} spacing metres between samples
 * @property {number} nx
 * @property {number} ny
 */

/**
 * Height field from the route's terrain file, graded around the railway: within a few metres of
 * a track the ground sits at formation level (so the line runs on embankments and through
 * cuttings), blending back to the real terrain further out. Bridges and tunnels are left alone.
 */
export class Terrain {
  /**
   * @param {TerrainHeader} header
   * @param {Int16Array} decimetres
   */
  constructor(header, decimetres) {
    this.h = header;
    this.raw = decimetres;
  }

  /**
   * Raw terrain height (m) at a map point, bilinear.
   * @param {number} x
   * @param {number} y
   */
  rawHeight(x, y) {
    const { x0, y0, spacing, nx, ny } = this.h;
    const fx = Math.min(nx - 1.001, Math.max(0, (x - x0) / spacing));
    const fy = Math.min(ny - 1.001, Math.max(0, (y - y0) / spacing));
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const at = (/** @type {number} */ a, /** @type {number} */ b) => this.raw[b * nx + a] / 10;
    return at(i, j) * (1 - tx) * (1 - ty) + at(i + 1, j) * tx * (1 - ty) + at(i, j + 1) * (1 - tx) * ty + at(i + 1, j + 1) * tx * ty;
  }
}

/**
 * Samples along every line, for grading the terrain near the railway.
 * @param {import('../route/network.js').Network} network
 * @param {any[]} lineData route lines (for structures)
 */
function trackSamples(network, lineData) {
  /** @type {{ x: number, y: number, h: number, free: boolean }[]} */
  const out = [];
  for (const line of network.lines.values()) {
    const structures = lineData.find((l) => l.id === line.id)?.structures ?? [];
    for (let s = 0; s <= line.length; s += 8) {
      const p = line.alignment.pointAt(s);
      // On a bridge or in a tunnel the ground does its own thing.
      const free = structures.some((/** @type {any} */ st) => s >= st.from - 6 && s <= st.to + 6);
      out.push({ x: p.x, y: p.y, h: line.elevationAt(s) + FORMATION, free });
    }
  }
  return out;
}

/**
 * Build the terrain mesh.
 * @param {Terrain} terrain
 * @param {import('../route/network.js').Network} network
 * @param {any[]} lineData
 * @param {[number, number][][]} waterAreas polygons in map metres
 * @param {THREE.Texture} grass
 */
export function buildTerrainMesh(terrain, network, lineData, waterAreas, grass) {
  const { x0, y0, spacing, nx, ny } = terrain.h;
  // Spatial hash of track samples (50 m cells).
  const cell = 50;
  /** @type {Map<string, ReturnType<typeof trackSamples>>} */
  const hash = new Map();
  for (const t of trackSamples(network, lineData)) {
    const key = `${Math.floor(t.x / cell)},${Math.floor(t.y / cell)}`;
    const list = hash.get(key) ?? [];
    list.push(t);
    hash.set(key, list);
  }
  const nearestTrack = (/** @type {number} */ x, /** @type {number} */ y) => {
    let best = null;
    let bestD = Infinity;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const t of hash.get(`${cx + i},${cy + j}`) ?? []) {
          const d = Math.hypot(t.x - x, t.y - y);
          if (d < bestD) {
            bestD = d;
            best = t;
          }
        }
      }
    }
    return { t: best, d: bestD };
  };
  const waterBoxes = waterAreas.map((poly) => {
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    return { poly, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  });
  const inWater = (/** @type {number} */ x, /** @type {number} */ y) =>
    waterBoxes.some((b) => x >= b.minX - spacing && x <= b.maxX + spacing && y >= b.minY - spacing && y <= b.maxY + spacing && pointInOrNear(x, y, b.poly, spacing * 0.6));

  const positions = new Float32Array(nx * ny * 3);
  const colours = new Float32Array(nx * ny * 3);
  const uvs = new Float32Array(nx * ny * 2);
  const rnd = seededRandom(31);
  const field = new THREE.Color();
  // Low-frequency patchwork: different crops in different fields.
  const patch = (/** @type {number} */ x, /** @type {number} */ y) => {
    const a = Math.sin(x * 0.0021 + 1.3) * Math.cos(y * 0.0017 - 0.4);
    const b = Math.sin(x * 0.0063 - y * 0.0049);
    return (a + 0.5 * b + 1.5) / 3;
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * spacing;
      const y = y0 + j * spacing;
      let h = terrain.rawHeight(x, y);
      const { t, d } = nearestTrack(x, y);
      if (t && !t.free) {
        // Grade: formation level within 30 m, blending to the natural ground by 110 m. (The grid
        // is 75 m, so anything tighter would leave the line buried between samples.)
        const k = Math.min(1, Math.max(0, (d - 30) / 80));
        h = t.h * (1 - k) + h * k;
      } else if (t && t.free && d < 25) {
        h = Math.min(h, t.h - 3); // keep the ground clear under bridges
      }
      const wet = inWater(x, y);
      if (wet) h = Math.min(h, 0);
      const k = (j * nx + i) * 3;
      positions[k] = x;
      positions[k + 1] = h;
      positions[k + 2] = -y;
      uvs[(j * nx + i) * 2] = x / 12;
      uvs[(j * nx + i) * 2 + 1] = y / 12;
      // Colour: field patchwork on the plain, paler chalk downland higher up, mud by the river.
      const p = patch(x, y);
      field.setHSL(0.22 + p * 0.06, 0.32 + p * 0.15, 0.27 + p * 0.07 + (rnd() - 0.5) * 0.02);
      const chalk = Math.min(1, Math.max(0, (h - 40) / 80));
      field.lerp(new THREE.Color(0x8f9a62), chalk * 0.5);
      if (wet) field.set(0x5d5a48);
      colours[k] = field.r;
      colours[k + 1] = field.g;
      colours[k + 2] = field.b;
    }
  }
  const index = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  grass.repeat.set(1, 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: grass, vertexColors: true }));
  mesh.name = 'terrain';
  return mesh;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {[number, number][]} poly
 * @param {number} slack treat points this close to the edge as inside
 */
function pointInOrNear(x, y, poly, slack) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (inside) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2));
    if (Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) < slack) return true;
  }
  return false;
}

/**
 * Fetch and decode a terrain file.
 * @param {string} url
 * @param {TerrainHeader} header
 */
export async function loadTerrain(url, header) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load terrain ${url} (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  return new Terrain(header, new Int16Array(buf));
}
