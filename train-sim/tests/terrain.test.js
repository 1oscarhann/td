import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Route } from '../src/route/route.js';
import { FORMATION, Terrain, buildTerrainMesh } from '../src/render/terrain.js';

const dir = new URL('../public/data/routes/west-sussex/', import.meta.url);
const data = JSON.parse(readFileSync(new URL('route.json', dir), 'utf8'));
const scenery = JSON.parse(readFileSync(new URL('scenery.json', dir), 'utf8'));
const bin = readFileSync(new URL('terrain.bin', dir));

describe('terrain around the real route', () => {
  const terrain = new Terrain(data.scenery.terrainHeader, new Int16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2));
  const route = new Route(data);
  const group = buildTerrainMesh(terrain, route.network, data.lines, scenery.riverAreas ?? [], new THREE.Texture());

  it('never buries the track, cuttings included', () => {
    const buried = [];
    for (const line of route.network.lines.values()) {
      const structures = data.lines.find((/** @type {any} */ l) => l.id === line.id).structures ?? [];
      for (let s = 0; s <= line.length; s += 5) {
        if (structures.some((/** @type {any} */ st) => s >= st.from - 10 && s <= st.to + 10)) continue;
        const p = line.alignment.pointAt(s);
        const over = terrain.height(p.x, p.y) - (line.elevationAt(s) + FORMATION);
        if (over > 0.3) buried.push(`${line.id}@${Math.round(s)}: ${over.toFixed(1)} m`);
      }
    }
    expect(buried).toEqual([]);
  });

  it('meets the coarse grid without gaps where the corridor ends', () => {
    const [coarse, corridor] = group.children.map((m) => /** @type {THREE.Mesh} */ (m));
    expect(corridor.name).toBe('terrain corridor');
    // Every corridor vertex that is also a corner of a coarse cell still being drawn sits exactly on it.
    const pos = corridor.geometry.getAttribute('position');
    const { x0, y0, spacing } = terrain.h;
    const coarsePos = coarse.geometry.getAttribute('position');
    const drawn = new Set(/** @type {ArrayLike<number>} */ (coarse.geometry.index?.array ?? []));
    const nx = terrain.h.nx;
    let checked = 0;
    for (let v = 0; v < pos.count; v++) {
      const i = (pos.getX(v) - x0) / spacing;
      const j = (-pos.getZ(v) - y0) / spacing;
      if (Math.abs(i - Math.round(i)) > 1e-6 || Math.abs(j - Math.round(j)) > 1e-6) continue;
      const c = Math.round(j) * nx + Math.round(i);
      if (!drawn.has(c)) continue;
      expect(pos.getY(v)).toBeCloseTo(coarsePos.getY(c), 3);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });
});
