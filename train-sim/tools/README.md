# Tools

Node scripts for building and checking route data. They run outside the browser and aren't
part of the built game.

## Rebuilding the West Sussex route

```sh
node tools/fetch-osm.mjs        # OpenStreetMap layers → tools/research/osm-cache/
node tools/fetch-terrain.mjs    # elevation tiles      → tools/research/terrain-cache/
node tools/build-route.mjs      # both caches          → public/data/routes/west-sussex/
npm run validate:routes
npm test                        # includes headless runs of the real services
```

Both caches are committed, so `build-route.mjs` works offline straight after a clone. The fetch
scripts only download what's missing (`--refresh` on `fetch-osm.mjs` re-downloads everything).
Behind an HTTP proxy, run the fetch scripts with `NODE_USE_ENV_PROXY=1` so Node's `fetch` uses it.

The public Overpass servers are busy and often time out; `lib/overpass.mjs` tries several
mirrors with back-off and splits the corridor into chunks. A full download can take an hour on a
bad day. Don't run it in a loop.

## Scripts

| Script | What it does |
| --- | --- |
| `fetch-osm.mjs` | Rail, platforms, level crossings, buildings and roads near the line, plus stations, rivers, woods and landmarks for the wider area. |
| `fetch-terrain.mjs` | Terrarium-encoded elevation tiles (zoom 12, about 30 m) covering the route. |
| `build-route.mjs` | The route builder. Finds each line through the OSM rail graph, makes a double-track centreline, adds chainage, speeds, gradients (from the terrain, bridges spanned), stations, platforms, stop markers, points, crossings and structures; generates signals and timetables; writes `route.json`, `terrain.bin` and `scenery.json`. `DUMP_ROUTE=some/file.json` also saves the route before the timetable is added, for debugging. |
| `validate-route.mjs` | `npm run validate:routes`: checks every route file with the game's own validator. |
| `osm-crossings.mjs` | `npm run osm:crossings [south,west,north,east]`: lists level crossings from OpenStreetMap with the road each carries. Handy for checking crossings by hand. |
| `lib/geo.mjs` | Projection, polylines, smoothing, nearest-point, simplification. |
| `lib/railgraph.mjs` | The OSM rail network as a graph: shortest paths, nearby ways, centrelines. |
| `lib/dem.mjs` | Reads elevation from the cached tiles. |
| `lib/timetable.mjs` | The services you can drive and the hourly pattern of other trains, timed by driving them headless. |
| `research/route-features.json` | Hand-gathered stations, junctions, crossings, bridges and speeds. The builder uses it for crossing names. See `docs/ROUTE_RESEARCH.md`. |

## Changing the route

- **Signals:** `generateSignals` in `build-route.mjs`. The rules are in `docs/ASSUMPTIONS.md`
  (G4). If you find real signal positions, replace the generator with a list.
- **Junction speeds and feathers:** `JUNCTION_SPEEDS` and `DIVERGING`.
- **Services and traffic:** `SERVICES` and `trafficPattern` in `lib/timetable.mjs`.
- **The corridor:** `CHUNKS` in `fetch-osm.mjs`, `TERRAIN_BOUNDS` in `fetch-terrain.mjs`, and
  the waypoints each line is routed through in `build-route.mjs`.

## Licences

OpenStreetMap data is © OpenStreetMap contributors and licensed under the ODbL: keep the credit
if you publish anything derived from it. Elevation tiles: Mapzen/Tilezen terrain tiles, see
<https://github.com/tilezen/joerd/blob/master/docs/attribution.md>.
