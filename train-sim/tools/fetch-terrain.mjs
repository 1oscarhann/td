#!/usr/bin/env node
/**
 * Download elevation tiles for the route area into tools/research/terrain-cache.
 *
 * Source: the open "Terrain Tiles" dataset on AWS (Mapzen / Tilezen terrarium encoding). In the
 * UK these come mostly from SRTM and EU-DEM, roughly 30 m resolution, which is a surface model:
 * woods and embankments show up as bumps. Good for hills and valleys, not for gradients by itself.
 * Attribution: https://github.com/tilezen/joerd/blob/master/docs/attribution.md
 *
 *   NODE_USE_ENV_PROXY=1 node tools/fetch-terrain.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const TERRAIN_ZOOM = 12;
export const TERRAIN_BOUNDS = { south: 50.76, west: -0.82, north: 50.93, east: -0.49 };
const cacheDir = fileURLToPath(new URL('./research/terrain-cache', import.meta.url));

/** Slippy-map tile x for a longitude. */
export const tileX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
/** Slippy-map tile y for a latitude. */
export const tileY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(cacheDir, { recursive: true });
  const z = TERRAIN_ZOOM;
  const b = TERRAIN_BOUNDS;
  let fetched = 0;
  for (let x = tileX(b.west, z); x <= tileX(b.east, z); x++) {
    for (let y = tileY(b.north, z); y <= tileY(b.south, z); y++) {
      const file = join(cacheDir, `${z}-${x}-${y}.png`);
      if (existsSync(file)) continue;
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      fetched++;
      console.log(`✓ ${z}/${x}/${y}`);
    }
  }
  console.log(`${fetched} new tiles in ${cacheDir}`);
}
