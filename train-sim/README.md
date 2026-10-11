# Coastway Driver

A first-person train driving sim in the browser: a Class 377 Electrostar on the West Coastway and
Arun Valley lines in West Sussex, Chichester → Barnham → Ford → Arundel → Amberley.

**Status: Milestone 1.** A straight 8.5 km test track with working physics, signals, AWS, TPWS,
dead man's handle, doors and a cab HUD. The real route arrives in Milestone 2; the research for
it is already in [`docs/ROUTE_RESEARCH.md`](docs/ROUTE_RESEARCH.md).

## Run it

Needs Node 22.12 or newer.

```sh
cd train-sim
npm install
npm run dev        # http://localhost:5173
npm test           # 82 unit and integration tests
npm run build      # static site in dist/
```

`npm run build` writes plain static files to `dist/` with relative paths, so you can upload the
folder anywhere on your site (`/games/train/` works as well as the root). Don't open
`dist/index.html` straight from disk: browsers block the route file on `file://`. Use
`npm run preview` or any web server.

## Controls

| Key | Does |
| --- | --- |
| `W` / `S` | Controller one notch towards power / brake (EB, B3, B2, B1, OFF, P1–P4) |
| `Space` | Dead man's handle: hold while moving (or see settings) |
| `Q` | Acknowledge AWS; reset after a penalty brake once stopped |
| `D` | Doors open/close (only at a stand, alongside a platform) |
| `R` | Driver's reminder appliance (cuts traction until released) |
| `H` / `Shift+H` | Horn, high / low tone |
| `Tab` | Driving aid on/off |
| `P` / `Esc` | Pause and settings |

## The run

You start at Test Platform A in brake step 3. A train has just left ahead, so signal TT1 is red
and steps through yellow, double yellow and green as it gets away. Drive to Test Platform B,
stop at the 4-car marker and open the doors. You're scored on stop accuracy, SPADs, penalty
brakes and overspeeding; the best 10 runs are saved in your browser.

## How it's built

```
train-sim/
├── index.html            page shell and overlays (start, pause/settings, result)
├── public/data/routes/   route JSON files (served as-is)
├── src/
│   ├── main.js           wires everything together, owns the game loop
│   ├── core/             loop, keyboard input, units, localStorage, settings
│   ├── physics/          train spec, controller, 1D train dynamics, braking maths
│   ├── signals/          aspects, automatic block signalling
│   ├── safety/           AWS, TPWS, DSD (dead man's handle)
│   ├── route/            route loading/validation, alignment, step profiles
│   ├── sim/              the simulation (no DOM), doors, scripted trains, scoring
│   ├── render/           Three.js scene, track, signals, scenery, other trains
│   ├── hud/              cab desk (SVG gauges, lamps), log, alerts, driving aid
│   └── audio/            Web Audio synthesised sounds
├── tests/                Vitest
├── tools/                route validator, OpenStreetMap crossing finder, research data
└── docs/                 milestones, assumptions, realism vs fun, route research, route format
```

Decisions, briefly:

- **The simulation has no DOM.** `src/sim/simulation.js` takes input and advances time; the
  renderer, HUD and audio only read it. That's why the tests can drive a whole run headless.
- **Fixed timestep.** Physics always steps at 1/60 s however fast your screen is, so braking
  distances don't depend on frame rate. Rendering interpolates between steps.
- **The train is a point on a line.** Position along the track (chainage), speed, and forces:
  traction (constant force, then constant power), Davis rolling + air resistance, gradient, and
  a load-weighed brake whose cylinder pressure lags behind the controller.
- **Signals are worked out, not scripted.** Each signal is red if anything is between it and the
  next signal plus a 180 m overlap; otherwise one step clearer than the next. Junctions (M4)
  add "held at red until the route is set".
- **No assets.** Textures are drawn on canvases and sounds are synthesised, so there's nothing
  to license yet. Howler.js comes in when there are real recordings (M6).
- **Everything route-specific is data.** The same code will run the real line from JSON.

## Docs

- [Milestones](docs/MILESTONES.md): what comes next.
- [Assumptions](docs/ASSUMPTIONS.md): every number that isn't sourced, to verify.
- [Realism vs fun](docs/REALISM_VS_FUN.md): the choices you need to make.
- [Route research](docs/ROUTE_RESEARCH.md): real crossings, junctions, speeds, sources.
- [Route format](docs/ROUTE_FORMAT.md): the JSON schema.

## Debugging

In `npm run dev`, the simulation is on `window.__sim`. For example, in the browser console:
`__sim.train.position = 2300` jumps you to just before TT1's AWS magnet.

Map data © OpenStreetMap contributors (ODbL).
