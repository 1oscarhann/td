# Holding Pattern: airport tycoon

A 3D toy-diorama airport tycoon for the browser. Start with a grass field and one
tiny prop plane, grow it into a busy hub. Build runways, taxiways, stands, gates
and a terminal by day; run the landing queue on the radar when the sky fills up.

Three.js + Vite, plain JavaScript modules. Every model is built in code: no model
files, no textures, no downloaded assets. All airlines are fictional.

## Run it

```bash
cd holding-pattern
npm install
npm run dev        # http://localhost:5173
```

`npm run build` writes a static build to `dist/` (open it with any static server,
e.g. `npx vite preview`).

Needs a browser with WebGL 2 (current Chrome, Edge, Firefox or Safari).

## How to play

1. **Runway**: drag a straight line. It must be at least 60 tiles (small props);
   regional jets need 90 and narrowbodies 110. Planes land and take off in the
   direction you dragged (the ghost shows arrows).
2. **Taxiway**: drag from the runway's side or end. Put one near the start of the
   runway so departures don't have to backtrack along it, and an exit roughly a
   third of the way down for arrivals.
3. **Terminal**: drag a rectangle of floor. Entrances open on its south side.
4. **Stands and gates** (S/M/L): the back must face a taxiway. A gate's nose must
   touch the terminal and gets a jet bridge; a remote stand makes passengers walk
   across the apron. Stands facing each other across one taxiway need a tile of
   space so tails can swing.
5. **Rooms** inside the terminal: check-in desks and security lanes (their open
   ends need free floor) and gate lounges near your gates.
6. Flights start arriving once a runway, a taxiway route and a stand exist.

Inbound flights appear on the radar edge with a fuel timer and join the **landing
queue** (right). Drag rows to change the landing order; with two runways you can
pick one per flight. Amber fuel is low, red must land next or it diverts (lost
fee, big rating hit). If the runway is blocked at the decision point a plane goes
around and rejoins the back of the queue. Leave it alone and the queue runs in
arrival order, so the game is playable without micromanagement.

Money comes from landing fees, per-passenger fees and contract bonuses; wages for
desks and lanes are paid at midnight. Three days in the red is bankruptcy. Your
rating (1–5★) follows passenger happiness, on-time departures and diversions; it
unlocks regional jets at 2★, narrowbodies at 3★ and better contracts.

### Controls

| Input | Action |
| --- | --- |
| Drag (no tool) | Orbit the camera |
| Right-drag / WASD / arrows | Pan |
| Scroll / pinch | Zoom |
| Q / E | Rotate a stand or room while placing (otherwise rotate the camera) |
| Click a plane (or radar blip) | Flight card |
| R | Radar mode |
| Space | Pause |
| 1 / 2 / 3 | Speed 1× / 2× / 4× |
| C | Contracts |
| B | Fold the departures board |
| Esc | Stop building, close dialogs, pause menu |

Debug: **Shift+P** spawns an inbound flight now (Shift+Ctrl+P ignores rating
unlocks), **Shift+M** adds £100,000.

## Code map

| Folder | What lives there |
| --- | --- |
| `src/config/` | `balance.js` (every number: costs, fees, wages, speeds, timings), palettes, airlines, plane classes |
| `src/core/` | event bus, clock, maths helpers |
| `src/render/` | renderer + post (tilt-shift, tone mapping, radar look), orbit camera, materials, geometry helpers, segment font |
| `src/world/` | tile grid, ground, scenery (trees, road, car park, control tower) |
| `src/build/` | build tools, placement rules, ghost previews, runway/taxiway/stand meshes |
| `src/terminal/` | terminal model and mesh, room furniture, jet bridges |
| `src/pathfinding/` | taxi graph, A*, per-node reservation queues, flow fields |
| `src/planes/` | procedural models and livery shader, plane state machine, paths, Dubins approach curves, turnarounds, ground vehicles |
| `src/passengers/` | instanced passengers and their journey |
| `src/atc/` | landing queue, sequencing and runway locks, radar mode |
| `src/economy/` | money, flights, schedule generator, contracts, operations |
| `src/rating/` | rating and milestones |
| `src/save/` | versioned localStorage saves |
| `src/ui/` | HUD, build menu, queue panel, flight card, departures board, menus, tutorial |

### How taxiing stays safe

Routes come from A* on the taxiway graph. A plane reserves its whole route by
joining the back of a queue on every node, and only rolls into a node when it is
first in that node's queue. New routes always join at the back, so a plane only
ever waits for planes that reserved before it: waits can't loop, so there are no
head-on deadlocks, yet planes going the same way can follow each other. Nodes a
plane occupies the moment it starts (its pushback area, the runway exit it rolls
onto) must have nobody else queued. Turns also reserve the tiles a long fuselage
swings across. Each runway is a single lock for landing, take-off and crossing.
