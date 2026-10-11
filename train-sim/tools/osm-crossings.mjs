#!/usr/bin/env node
/**
 * List the level crossings OpenStreetMap knows about in a box, with the road or path each one
 * carries. This is how docs/ROUTE_RESEARCH.md was built; re-run it to check for changes.
 *
 *   node tools/osm-crossings.mjs                        # Chichester – Amberley default box
 *   node tools/osm-crossings.mjs 50.79,-0.79,50.94,-0.52 # south,west,north,east
 *
 * Data © OpenStreetMap contributors, ODbL. The public Overpass servers are busy and sometimes
 * time out; the script tries a few mirrors. Be gentle: don't run it in a loop.
 */

const bbox = process.argv[2] ?? '50.79,-0.79,50.94,-0.52';
if (!/^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/.test(bbox)) {
  console.error('Bounding box must be south,west,north,east in decimal degrees');
  process.exit(2);
}

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const query = `[out:json][timeout:60];
node["railway"~"^(level_crossing|crossing)$"](${bbox})->.lc;
.lc out body;
way(bn.lc)["highway"];
out body;`;

async function overpass(q) {
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }) });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) return JSON.parse(text);
      console.error(`${url}: HTTP ${res.status}, trying the next mirror`);
    } catch (err) {
      console.error(`${url}: ${err.message}, trying the next mirror`);
    }
  }
  throw new Error('All Overpass mirrors failed. Try again in a few minutes.');
}

/** What the OSM barrier tags mean on a UK crossing. */
function describe(tags) {
  const barrier = tags['crossing:barrier'] ?? tags.barrier;
  if (tags.railway === 'crossing') return barrier === 'gate' ? 'footpath crossing with gates' : 'footpath / bridleway crossing';
  switch (barrier) {
    case 'double_half':
      return 'full barrier (a half barrier each side of each carriageway)';
    case 'full':
      return 'full barrier';
    case 'half':
      return 'automatic half barrier (AHB)';
    case 'gate':
    case 'gates':
      return 'gated';
    case 'no':
      return 'open crossing, no barriers';
    default:
      return 'road crossing, barrier type not tagged';
  }
}

let data;
try {
  data = await overpass(query);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const nodes = data.elements.filter((e) => e.type === 'node' && e.tags);
const ways = data.elements.filter((e) => e.type === 'way' && e.tags);

// Each crossing is usually two nodes (one per track) a few metres apart: group them.
const groups = [];
for (const n of nodes.sort((a, b) => a.lon - b.lon)) {
  const near = groups.find((g) => Math.hypot((g.lat - n.lat) * 111_000, (g.lon - n.lon) * 70_000) < 25);
  if (near) near.ids.push(n.id);
  else groups.push({ lat: n.lat, lon: n.lon, ids: [n.id], tags: n.tags });
}

console.log(`| lat, lon | road / path | type | lights | OSM nodes |`);
console.log(`| --- | --- | --- | --- | --- |`);
for (const g of groups) {
  const road = ways.find((w) => g.ids.some((id) => w.nodes?.includes(id)));
  const name = road ? [road.tags.name, road.tags.ref, road.tags.prow_ref].filter(Boolean).join(' ') || road.tags.highway : '?';
  const lights = g.tags['crossing:light'] === 'yes' ? 'yes' : '';
  console.log(`| ${g.lat.toFixed(5)}, ${g.lon.toFixed(5)} | ${name} | ${describe(g.tags)} | ${lights} | ${g.ids.join(', ')} |`);
}
console.log(`\n${groups.length} crossings. Data © OpenStreetMap contributors (ODbL).`);
