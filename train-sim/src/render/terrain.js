import * as THREE from 'three';

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

/** The fine mesh near the railway has this many cells per coarse cell, each way. */
const FINE = 5;
/** Coarse cells with a corner this close to a track are cut out and drawn with the fine mesh (m). */
const CORRIDOR_M = 55;
/** Formation level out to here; the cutting or embankment slope ends at CORRIDOR_M (m). */
const FORMATION_HALF_WIDTH_M = 30;

/**
 * Height field from the route's terrain file, graded around the railway: within a few metres of
 * a track the ground sits at formation level (so the line runs on embankments and through
 * cuttings), blending back to the real terrain further out. Bridges and tunnels are left alone.
 *
 * The terrain is drawn as a coarse grid (the file's own spacing) with the corridor along the
 * railway cut out and redrawn five times finer: a 75 m grid can't show a cutting, it just buries
 * the track. `height()` gives the surface as drawn, for sitting scenery on it.
 */
export class Terrain {
  /**
   * @param {TerrainHeader} header
   * @param {Int16Array} decimetres
   */
  constructor(header, decimetres) {
    this.h = header;
    this.raw = decimetres;
    /** @type {Float32Array | null} coarse vertex heights as drawn */
    this.coarse = null;
    /** @type {Float32Array | null} fine vertex heights as drawn (NaN outside the corridor) */
    this.fine = null;
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

  /**
   * Ground height (m) as drawn: the fine corridor mesh where there is one, else the coarse grid.
   * Before the mesh is built, the raw terrain.
   * @param {number} x
   * @param {number} y
   */
  height(x, y) {
    if (!this.coarse) return this.rawHeight(x, y);
    const { x0, y0, spacing, nx, ny } = this.h;
    if (this.fine) {
      const s = spacing / FINE;
      const fnx = (nx - 1) * FINE + 1;
      const fny = (ny - 1) * FINE + 1;
      const h = triangleHeight(this.fine, fnx, fny, (x - x0) / s, (y - y0) / s);
      if (!Number.isNaN(h)) return h;
    }
    return triangleHeight(this.coarse, nx, ny, (x - x0) / spacing, (y - y0) / spacing);
  }
}

/**
 * Height on a grid triangulated the way the meshes are (each cell split from its (i+1, j)
 * corner to its (i, j+1) corner). NaN if a corner is missing.
 * @param {Float32Array} grid
 * @param {number} nx
 * @param {number} ny
 * @param {number} fx grid coordinates
 * @param {number} fy
 */
function triangleHeight(grid, nx, ny, fx, fy) {
  fx = Math.min(nx - 1.0001, Math.max(0, fx));
  fy = Math.min(ny - 1.0001, Math.max(0, fy));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const a = grid[j * nx + i];
  const b = grid[j * nx + i + 1];
  const c = grid[(j + 1) * nx + i];
  const d = grid[(j + 1) * nx + i + 1];
  if (tx + ty <= 1) return a + (b - a) * tx + (c - a) * ty;
  return d + (c - d) * (1 - tx) + (b - d) * (1 - ty);
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

/** Cheap repeatable noise in [0, 1) for a map point. */
const noise = (/** @type {number} */ x, /** @type {number} */ y) => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * Build the terrain: a coarse grid with the railway corridor cut out, and a fine mesh in the
 * corridor. Also fills in `terrain.coarse` and `terrain.fine` so `terrain.height()` matches.
 * @param {Terrain} terrain
 * @param {import('../route/network.js').Network} network
 * @param {any[]} lineData
 * @param {[number, number][][]} waterAreas polygons in map metres
 * @param {THREE.Texture} grass
 */
export function buildTerrainMesh(terrain, network, lineData, waterAreas, grass) {
  const { x0, y0, spacing, nx, ny } = terrain.h;
  // Spatial hash of track samples (60 m cells, so a 3 × 3 search finds anything within 60 m).
  const cell = 60;
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
  const inWater = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ slack) =>
    waterBoxes.some((b) => x >= b.minX - slack && x <= b.maxX + slack && y >= b.minY - slack && y <= b.maxY + slack && pointInOrNear(x, y, b.poly, slack));

  const field = new THREE.Color();
  const chalkColour = new THREE.Color(0x8f9a62);
  // Low-frequency patchwork: different crops in different fields.
  const patch = (/** @type {number} */ x, /** @type {number} */ y) => {
    const a = Math.sin(x * 0.0021 + 1.3) * Math.cos(y * 0.0017 - 0.4);
    const b = Math.sin(x * 0.0063 - y * 0.0049);
    return (a + 0.5 * b + 1.5) / 3;
  };
  /** Colour: field patchwork on the plain, paler chalk downland higher up, mud by the river. */
  const colourAt = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ h, /** @type {boolean} */ wet) => {
    const p = patch(x, y);
    field.setHSL(0.22 + p * 0.06, 0.32 + p * 0.15, 0.27 + p * 0.07 + (noise(x, y) - 0.5) * 0.02);
    field.lerp(chalkColour, Math.min(1, Math.max(0, (h - 40) / 80)) * 0.5);
    if (wet) field.set(0x5d5a48);
    return field;
  };

  // ── coarse grid ──
  const coarse = new Float32Array(nx * ny);
  const nearCorridor = new Uint8Array(nx * ny);
  const coarseWet = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * spacing;
      const y = y0 + j * spacing;
      let h = terrain.rawHeight(x, y);
      const { t, d } = nearestTrack(x, y);
      if (t && !t.free) {
        // Formation level near the line, blending to the natural ground by 110 m.
        const k = Math.min(1, Math.max(0, (d - FORMATION_HALF_WIDTH_M) / 80));
        h = t.h * (1 - k) + h * k;
      } else if (t && t.free && d < 25) {
        h = Math.min(h, t.h - 3); // keep the ground clear under bridges
      }
      const wet = inWater(x, y, spacing * 0.6);
      if (wet) h = Math.min(h, 0);
      coarse[j * nx + i] = h;
      coarseWet[j * nx + i] = wet ? 1 : 0;
      nearCorridor[j * nx + i] = d < CORRIDOR_M ? 1 : 0;
    }
  }
  // A coarse cell is cut out if any corner is near a track (every cell the line passes through
  // has a corner within 53 m of it).
  const cut = new Uint8Array((nx - 1) * (ny - 1));
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      cut[j * (nx - 1) + i] = nearCorridor[a] | nearCorridor[a + 1] | nearCorridor[a + nx] | nearCorridor[a + nx + 1];
    }
  }
  terrain.coarse = coarse;
  const coarseAt = (/** @type {number} */ x, /** @type {number} */ y) => triangleHeight(coarse, nx, ny, (x - x0) / spacing, (y - y0) / spacing);

  /** @type {THREE.Mesh[]} */
  const meshes = [];
  const material = new THREE.MeshLambertMaterial({ map: grass, vertexColors: true });
  grass.repeat.set(1, 1);
  const finish = (/** @type {Float32Array} */ positions, /** @type {Float32Array} */ colours, /** @type {Float32Array} */ uvs, /** @type {number[]} */ index, /** @type {string} */ name) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    meshes.push(mesh);
  };

  {
    const positions = new Float32Array(nx * ny * 3);
    const colours = new Float32Array(nx * ny * 3);
    const uvs = new Float32Array(nx * ny * 2);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = j * nx + i;
        const x = x0 + i * spacing;
        const y = y0 + j * spacing;
        const h = coarse[v];
        positions.set([x, h, -y], v * 3);
        uvs.set([x / 12, y / 12], v * 2);
        const c = colourAt(x, y, h, coarseWet[v] === 1);
        colours.set([c.r, c.g, c.b], v * 3);
      }
    }
    /** @type {number[]} */
    const index = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (cut[j * (nx - 1) + i]) continue;
        const a = j * nx + i;
        index.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
      }
    }
    finish(positions, colours, uvs, index, 'terrain');
  }

  // ── fine corridor mesh ──
  const fs = spacing / FINE;
  const fnx = (nx - 1) * FINE + 1;
  const fny = (ny - 1) * FINE + 1;
  const fine = new Float32Array(fnx * fny).fill(NaN);
  const isCut = (/** @type {number} */ ci, /** @type {number} */ cj) => ci >= 0 && cj >= 0 && ci < nx - 1 && cj < ny - 1 && cut[cj * (nx - 1) + ci] === 1;
  // On the edge of a cell that's still drawn coarse, the fine mesh must match it exactly.
  const touchesKept = (/** @type {number} */ fi, /** @type {number} */ fj) => {
    const cis = fi % FINE === 0 ? [fi / FINE - 1, fi / FINE] : [Math.floor(fi / FINE)];
    const cjs = fj % FINE === 0 ? [fj / FINE - 1, fj / FINE] : [Math.floor(fj / FINE)];
    for (const ci of cis) for (const cj of cjs) if (ci >= 0 && cj >= 0 && ci < nx - 1 && cj < ny - 1 && !isCut(ci, cj)) return true;
    return false;
  };
  /** @type {Map<number, number>} fine grid index → vertex number */
  const vertexOf = new Map();
  /** @type {number[]} */
  const fPos = [];
  /** @type {number[]} */
  const fCol = [];
  /** @type {number[]} */
  const fUv = [];
  const fineVertex = (/** @type {number} */ fi, /** @type {number} */ fj) => {
    const g = fj * fnx + fi;
    const known = vertexOf.get(g);
    if (known !== undefined) return known;
    const x = x0 + fi * fs;
    const y = y0 + fj * fs;
    const c = coarseAt(x, y);
    let h = c;
    let wet = false;
    if (!touchesKept(fi, fj)) {
      const { t, d } = nearestTrack(x, y);
      if (t && !t.free) {
        if (d <= FORMATION_HALF_WIDTH_M) h = t.h;
        else if (d < CORRIDOR_M) {
          const k = (d - FORMATION_HALF_WIDTH_M) / (CORRIDOR_M - FORMATION_HALF_WIDTH_M);
          h = t.h + (c - t.h) * k * k * (3 - 2 * k);
        }
      } else if (t && t.free && d < 25) {
        h = Math.min(c, t.h - 3);
      }
      wet = (!t || t.free || d > FORMATION_HALF_WIDTH_M) && inWater(x, y, fs * 0.6);
      if (wet) h = Math.min(h, 0);
    }
    fine[g] = h;
    const n = fPos.length / 3;
    vertexOf.set(g, n);
    fPos.push(x, h, -y);
    fUv.push(x / 12, y / 12);
    const col = colourAt(x, y, h, wet);
    fCol.push(col.r, col.g, col.b);
    return n;
  };
  /** @type {number[]} */
  const fIndex = [];
  for (let cj = 0; cj < ny - 1; cj++) {
    for (let ci = 0; ci < nx - 1; ci++) {
      if (!isCut(ci, cj)) continue;
      for (let dj = 0; dj < FINE; dj++) {
        for (let di = 0; di < FINE; di++) {
          const fi = ci * FINE + di;
          const fj = cj * FINE + dj;
          const a = fineVertex(fi, fj);
          const b = fineVertex(fi + 1, fj);
          const c = fineVertex(fi, fj + 1);
          const d = fineVertex(fi + 1, fj + 1);
          fIndex.push(a, b, c, b, d, c);
        }
      }
    }
  }
  terrain.fine = fine;
  if (fIndex.length) finish(new Float32Array(fPos), new Float32Array(fCol), new Float32Array(fUv), fIndex, 'terrain corridor');

  const group = new THREE.Group();
  group.name = 'terrain';
  group.add(...meshes);
  return group;
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
