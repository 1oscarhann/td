# Milestone plan

Each milestone ends with something you can drive. Nothing later needs a rewrite of anything
earlier: the simulation core (physics, signalling, safety systems) is already route-agnostic and
tested, and every route feature is data in a JSON file.

## M1: Test track foundations ✅ (this commit)

Straight 8.5 km double-track test line, one train, the bones of everything.

- Fixed-timestep loop (60 Hz physics, rendering interpolated), decoupled from frame rate.
- Class 377/4 physics: mass, traction curve (constant force, then constant power), Davis
  resistance, gradients, notched brake with brake-cylinder lag, emergency brake, roll-back.
- Combined power/brake controller: EB, B3–B1, OFF, P1–P4.
- Four-aspect automatic signalling with overlaps, driven by train occupancy. A scripted train
  ahead holds the first signal at red, then clears it R → Y → YY → G.
- AWS (magnet 180 m before each signal, horn/bell, 2.7 s acknowledgement, sunflower),
  TPWS train stop (SPAD → emergency brake), dead man's handle (hold / vigilance / off), DRA,
  doors with traction interlock, penalty brake latch and reset.
- HUD: speedometer with line-speed marker, brake gauge, controller position, AWS sunflower,
  TPWS panel, DRA, DSD, doors, clock, message log, driving aid.
- Synthesised sound: inverter whine, rolling noise, brake air, AWS horn and bell, horn, buzzers.
- Run objective (stop at Platform B), score, best runs and settings in localStorage.
- 82 Vitest tests, including a headless "careful driver" completing the run.

## M2: The real line, part 1: Chichester → Barnham → Ford (the MVP)

- `tools/osm-to-route.mjs`: pull the track centreline from OpenStreetMap, project to local
  metres, compute chainage, snap stations/crossings/bridges onto it (seed data is already in
  `tools/research/route-features.json`).
- Gradient profile from open elevation data (OS Terrain 50), smoothed. Flat coastal plain, so
  this is mostly about the climb to the Arun bridge at Ford.
- Real speed limits (OSM as a first pass, flagged until checked), permanent speed boards.
- Signals placed to a plausible four-aspect layout (real positions are the big unknown; see
  ASSUMPTIONS), platform starting signals, AWS/TPWS at each.
- Station stops: stop markers by train length, door side, dwell, "right away" (on this route
  the driver closes the doors and departs on a proceed aspect), timetable with arrival and
  departure times, punctuality on the HUD.
- Other trains: AI drivers that obey signals, Down-line traffic coming the other way.
- Level crossings appear as scenery with working lights, no logic yet.

## M3: Rules and protection

- TPWS overspeed sensors (OSS) on the approach to red signals and big speed reductions.
- AWS for permanent speed restrictions (warning boards with magnets).
- Overspeed penalties, SPAD consequences (configurable: penalty or end of run).
- DRA prompts, start-up and shut-down procedure (optional), signaller contact after a penalty.

## M4: Junctions and route setting

- Interlocking-lite: routes, points (normal/reverse), locking, flank protection.
- Junction signals with route indicators (feathers), approach control on diverging routes.
- Barnham Junction: trailing for Up trains from Chichester, facing on the Down (route a train to
  Bognor Regis on the drive back).
- Ford Junction (straight on; the Littlehampton west curve diverges) and **Arundel Junction**
  (diverge north onto the Arun Valley line). Junction speed restrictions.
- Extend to Arundel and Amberley. Reversible: drive Amberley → Chichester on the Down line.

## M5: Level crossings and scenery

- Barrier sequence (amber, red flashers, barriers lower, crossing proved clear), interlocked
  with the protecting signal; failure states (barriers fail to lower, obstruction) with the
  matching driver procedure. AHB at Woodhorn Lane behaves differently (no protecting signal).
- Footpath crossings with whistle boards: the horn finally earns its keep.
- Terrain from elevation data, the chalk South Downs, the Arun valley and floodplain, Arun
  bridges, North Stoke tunnel, Arundel Castle on the skyline, Amberley chalk pits.

## M6: Sound

Swap synth voices for recorded samples (Howler.js), passing-train Doppler, PA announcements.

## M7: Scoring, polish, gamepad

Timetable punctuality, ride comfort (jerk), safety record, career/progression, Gamepad API
controls, rebindable keys, performance work (LOD, chunked terrain), save/resume.

## Later

Weather and low adhesion (autumn leaf fall: the Arun valley is a classic low-adhesion site;
rain; wheel-slide protection and sanders), time of day and night running, random signal
failures, trespass events, PA announcements, disruption.
