#!/usr/bin/env node
/**
 * Download everything the route builder needs from OpenStreetMap into tools/research/osm-cache.
 * Safe to re-run: cached answers are reused unless you pass --refresh.
 *
 *   NODE_USE_ENV_PROXY=1 node tools/fetch-osm.mjs      (the env var only matters behind a proxy)
 *
 * Data © OpenStreetMap contributors, ODbL.
 */
import { fileURLToPath } from 'node:url';
import { overpass } from './lib/overpass.mjs';

const cacheDir = fileURLToPath(new URL('./research/osm-cache', import.meta.url));
const refresh = process.argv.includes('--refresh');

/** The corridor in chunks: big single queries time out on the public servers. */
export const CHUNKS = {
  chichester: '50.82,-0.80,50.84,-0.70',
  barnham: '50.82,-0.70,50.84,-0.60',
  ford: '50.80,-0.60,50.84,-0.535',
  arundel: '50.835,-0.565,50.875,-0.525',
  amberley: '50.865,-0.56,50.91,-0.525',
  bognor: '50.775,-0.70,50.832,-0.635',
};

/** Wider box for scenery that can be seen from a distance. */
const AREA = '50.77,-0.81,50.92,-0.50';

const layers = [
  ...Object.entries(CHUNKS).map(([name, bbox]) => ({
    label: `rail-${name}`,
    q: `[out:json][timeout:60];way["railway"="rail"][!"service"](${bbox});out geom;`,
  })),
  ...Object.entries(CHUNKS).map(([name, bbox]) => ({
    label: `platforms-${name}`,
    q: `[out:json][timeout:60];(way["railway"="platform"](${bbox});way["public_transport"="platform"]["train"="yes"](${bbox}););out geom;`,
  })),
  ...Object.entries(CHUNKS).map(([name, bbox]) => ({
    label: `crossings-${name}`,
    q: `[out:json][timeout:60];node["railway"~"^(level_crossing|crossing)$"](${bbox})->.lc;.lc out body;way(bn.lc)["highway"];out geom;`,
  })),
  ...Object.entries(CHUNKS).map(([name, bbox]) => ({
    label: `buildings-${name}`,
    q: `[out:json][timeout:90];way["railway"="rail"][!"service"](${bbox})->.r;way["building"](around.r:180);out geom;`,
  })),
  ...Object.entries(CHUNKS).map(([name, bbox]) => ({
    label: `roads-${name}`,
    q: `[out:json][timeout:90];way["railway"="rail"][!"service"](${bbox})->.r;way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"](around.r:400);out geom;`,
  })),
  {
    label: 'stations',
    q: `[out:json][timeout:60];node["railway"~"^(station|halt)$"](${AREA});out body;`,
  },
  {
    label: 'water',
    q: `[out:json][timeout:90];(way["waterway"="river"](${AREA});way["natural"="water"]["water"="river"](${AREA}););out geom;`,
  },
  {
    label: 'woods',
    q: `[out:json][timeout:120];(way["natural"="wood"](${AREA});way["landuse"="forest"](${AREA}););out geom;`,
  },
  {
    label: 'landmarks',
    q: `[out:json][timeout:60];(nwr["historic"="castle"](${AREA});nwr["building"="cathedral"](${AREA});nwr["amenity"="place_of_worship"]["name"~"Cathedral"](${AREA}););out center tags;`,
  },
];

let failed = 0;
for (const { label, q } of layers) {
  try {
    const data = await overpass(q, { cacheDir, label, refresh });
    console.log(`✓ ${label}: ${data.elements.length} elements`);
  } catch (err) {
    failed++;
    console.error(`✗ ${label}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
