# Coastway Driver

A first-person train driving sim in the browser: a Class 377 Electrostar on the West Coastway and
Arun Valley lines in West Sussex, Chichester → Barnham → Ford → Arundel → Amberley, and back.

Track, stations, platforms, level crossings, buildings, rivers and terrain come from
OpenStreetMap and open elevation data. Signals, gradients and timetables are generated to fit
(the real signal positions aren't public); [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) lists
everything that's made up so you can check it.

## Run it

Needs Node 22.12 or newer.

```sh
cd train-sim
npm install
npm run dev              # http://localhost:5173
npm test                 # unit tests, plus headless runs of real services through traffic
npm run build            # static site in dist/
npm run validate:routes  # check every route file
```

`npm run build` writes plain static files to `dist/` with relative paths, so you can upload the
folder anywhere on your site (`/games/train/` works as well as the root). Don't open
`dist/index.html` straight from disk: browsers block the route files on `file://`. Use
`npm run preview` or any web server.

Add `?route=test-track` to the URL to start on the practice track.

## What you can drive

| Service | Route | Notes |
| --- | --- | --- |
| 2H14 | Chichester → Amberley | The whole line: Barnham, Ford, over the Arun, the feather at Arundel Junction, up the valley |
| 2H35 | Amberley → Chichester | The same in reverse, on the Down line |
| 2H47 | Amberley → Bognor Regis | Routed through the facing points at Barnham Junction (20 mph turnout) |
| 2C09 | Chichester → Ford | The short one (the original MVP) |
| 2B30 | Bognor Regis → Amberley | Joins the main line at Barnham |
| 2T01 | Test track | 8.5 km practice line with a red signal, three crossing types and a speed restriction |

Pick a time of day (sun position and darkness follow the clock), the weather (rain and fog cut
visibility and grip) and the season (autumn puts leaves on the rail in wooded cuttings).

## Controls

| Key | Gamepad | Does |
| --- | --- | --- |
| `W` / `S` | D-pad, triggers | Controller one notch towards power / brake (EB, B3, B2, B1, OFF, P1–P4) |
| `Space` | RB | Dead man's handle: hold while moving (or see settings) |
| `Q` | A | Acknowledge AWS; reset after a penalty brake once stopped |
| `D` | X | Doors open/close (only at a stand, alongside a platform) |
| `R` | Y | Driver's reminder appliance (cuts traction until released) |
| `H` / `Shift+H` | B | Horn, high / low tone |
| `C` | View | Call the signaller on the cab radio (stuck at a red, after a SPAD) |
| `O` | LB | TPWS train stop override, for passing a red with authority |
| `T` | Right stick | Time warp ×1 / ×2 / ×4 |
| `Tab` | | Driving aid on/off |
| `P` / `Esc` | Menu | Pause, settings and key bindings |

Every key can be rebound in the pause menu.

## A run

1. You start in the platform with the doors open. At departure time press `D` to close them.
2. Wait for the right away (two bells), then go when the starting signal clears. At Chichester
   it won't clear until the Stockbridge Road and Basin Road barriers are down and proved.
3. Hold `Space`. Acknowledge every AWS horn with `Q` within 2.7 s.
4. Obey the signals. A single yellow means the next one is red: be ready to stop. A feather
   (a row of white lights) means the route is set for a diverging line; slow down for the
   junction limit. Junction signals with approach control stay red until you're within 250 m,
   which makes sure you've slowed down, then step up.
5. Sound the horn at whistle boards before footpath and farm crossings.
6. Stop at the 4-car marker, open the doors, and repeat.

You're scored on punctuality (within 59 s counts as right time), stopping accuracy, smooth
braking, and safety: SPADs, penalty brakes, overspeeding, missed whistles. Grades A to D; the
best 10 runs per service are saved in your browser. A run in progress is saved at each departure
so you can resume it.

## What's simulated

- **Physics:** a 1D model with traction (constant force, then constant power), Davis rolling and
  air resistance, gradients, a load-weighed brake whose cylinder pressure lags the controller,
  wheel–rail adhesion with wheel-slide protection, wheelspin and sanding.
- **Signalling:** four-aspect colour lights worked out from track occupancy on the set route,
  with 180 m overlaps, junction route indicators, approach control, and signals held at red by
  level crossings and by points that are moving or locked against you.
- **Interlocking:** points are set for each train's booked route, take 5 s to move, and are
  locked once a train is close or on them.
- **Safety systems:** AWS (signals and speed restrictions), TPWS (train stop at reds, overspeed
  sensors before reds and big speed drops, train stop override), dead man's handle, DRA.
- **Level crossings:** full barriers (amber, red, barriers down, crossing proved, then the
  signal clears), automatic half barriers (no signal, just a timed warning), footpath and farm
  crossings with whistle boards. Barriers can fail to lower.
- **The signaller:** call on the radio when you're held at a red, after a SPAD, or at a failed
  crossing, and you'll get authority to pass at danger at caution.
- **Other trains:** AI-driven trains on an hourly pattern loosely modelled on Southern's:
  Coastway stoppers (which turn off for Brighton at Arundel Junction), Arun Valley trains, and
  Bognor Regis trains through Barnham Junction. They follow the same signals you do.
- **Random events (setting):** signal failures, crossing failures, trespassers.
- **Sound and PA:** synthesised traction, wheels, brakes, AWS, horn, passing trains, plus
  station announcements read by the browser's speech synthesis.

## How it's built

```
train-sim/
├── index.html                 page shell and overlays (start, pause/settings, result)
├── public/data/routes/        route data, served as-is
│   ├── test-track.json
│   └── west-sussex/           route.json, terrain.bin (heightmap), scenery.json (buildings etc.)
├── src/
│   ├── main.js                wires everything together, owns the game loop
│   ├── core/                  loop, keyboard and gamepad input, units, localStorage, settings
│   ├── physics/               train spec, controller, 1D train dynamics, braking maths
│   ├── route/                 the track network (lines, tracks, points), train paths, loading, validation
│   ├── signals/               aspects, signalling, interlocking
│   ├── safety/                AWS, TPWS, DSD (dead man's handle)
│   ├── sim/                   the simulation (no DOM): vehicles, AI drivers, crossings, journey,
│   │                          signaller, weather, failures, scoring
│   ├── render/                Three.js: terrain, track, signals, crossings, trains, scenery, sky
│   ├── hud/                   cab desk (SVG gauges, lamps), radio, timetable, alerts, driving aid
│   └── audio/                 Web Audio synthesis, PA announcements
├── tests/                     Vitest
├── tools/                     route builder: OpenStreetMap + elevation → route files (see tools/README.md)
└── docs/                      milestones, assumptions, realism vs fun, route research, route format
```

Decisions, briefly:

- **The simulation has no DOM.** `src/sim/simulation.js` takes input and advances time; the
  renderer, HUD and audio only read it. That's why the tests can drive whole services headless.
- **Fixed timestep.** Physics always steps at 1/60 s however fast your screen is, so braking
  distances don't depend on frame rate. Rendering interpolates between steps; time warp just
  runs more steps per frame.
- **A track network, not a single line.** Each line has its own chainage and alignment. Tracks
  join at points; a train's position is a path of pieces that can span a junction, so a train
  half over the points occupies both routes.
- **Signals are worked out, not scripted.** A signal is red if anything is in its section (to
  the next signal along the route that's set, plus the overlap), or something holds it;
  otherwise it's one step clearer than the next one.
- **Everything route-specific is data.** The route builder generates the real line's JSON; the
  same code runs the hand-written test track.
- **No assets.** Textures are drawn on canvases and sounds are synthesised, so there's nothing
  to license. Drop recordings in `public/audio/` with a `samples.json` to replace the synth
  voices (see `src/audio/audio.js`). Howler.js isn't needed: the Web Audio API does it all.

## Docs

- [Milestones](docs/MILESTONES.md): what's done, and what could come next.
- [Assumptions](docs/ASSUMPTIONS.md): every number that isn't sourced, to verify.
- [Realism vs fun](docs/REALISM_VS_FUN.md): where they clash and what the settings do.
- [Route research](docs/ROUTE_RESEARCH.md): real crossings, junctions, speeds, sources.
- [Route format](docs/ROUTE_FORMAT.md): the JSON schema.
- [Tools](tools/README.md): rebuilding the route from OpenStreetMap.

## Debugging

In `npm run dev`, the simulation is on `window.__sim` and the 3D view on `window.__view`. In the
browser console, for example:

```js
__sim.player.front                       // { track: 'main/UP', s: 1234.5 }
__sim.signalling.signalsAhead(__sim.player.front, 3000, 3)
__sim.crossings.crossings.map((c) => `${c.name}: ${c.state}`)
```

Map data © OpenStreetMap contributors (ODbL). Terrain: Mapzen/Tilezen terrain tiles (SRTM,
EU-DEM and others; see their attribution).
