# Tools

Node scripts for building and checking route data. They run outside the browser and aren't
part of the built game.

| Script | What it does |
| --- | --- |
| `validate-route.mjs` | `npm run validate:routes`: checks every route JSON with the game's own validator. |
| `osm-crossings.mjs` | `npm run osm:crossings [south,west,north,east]`: lists level crossings from OpenStreetMap with the road each carries. Public Overpass servers are busy, so it tries mirrors; don't run it in a loop. |
| `research/route-features.json` | Stations, junctions, crossings, bridges and speeds for Chichester → Amberley, gathered for Milestone 2. See `docs/ROUTE_RESEARCH.md`. |

Planned for Milestone 2: `osm-to-route.mjs` (track centreline from OSM → `alignment.points`
with chainage, features snapped onto it) and an elevation sampler for the gradient profile.

OpenStreetMap data is © OpenStreetMap contributors and licensed under the ODbL: keep the credit
if you publish anything derived from it.
