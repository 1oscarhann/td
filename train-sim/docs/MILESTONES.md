# Milestone plan

Each milestone ended with something you can drive. Status as of this commit: **M1 to M7 and
the "later" list are built.** What's left is mostly verification against real-world sources
(see [ASSUMPTIONS](ASSUMPTIONS.md)) and polish.

## M1: Test track foundations ✅

Straight 8.5 km double-track test line, one train, the bones of everything.

- Fixed-timestep loop (60 Hz physics, rendering interpolated), decoupled from frame rate.
- Class 377/4 physics: mass, traction curve (constant force, then constant power), Davis
  resistance, gradients, notched brake with brake-cylinder lag, emergency brake, roll-back.
- Combined power/brake controller: EB, B3–B1, OFF, P1–P4.
- Four-aspect signalling driven by train occupancy; AWS, TPWS train stop, dead man's handle,
  DRA, doors with traction interlock, penalty brake latch and reset.
- HUD, synthesised sound, score, best runs and settings in localStorage.

## M2: The real line, Chichester → Ford (the MVP) ✅

- `tools/fetch-osm.mjs` + `tools/build-route.mjs`: track centrelines from OpenStreetMap (a
  shortest path through the rail graph between fixed waypoints, averaged into a double-track
  centreline and smoothed), projected to local metres, with chainage.
- Gradients from open elevation tiles (`tools/fetch-terrain.mjs`), sampled along the line,
  with bridges and cuttings bridged over and the result smoothed into 400 m steps.
- Speed limits from OSM `maxspeed`, platforms, stations and stop markers from OSM.
- Generated four-aspect signalling (see ASSUMPTIONS G4), AWS and TPWS at each signal.
- Station stops: stop markers, doors, dwell, right away, timetable with punctuality.
- Other trains: AI drivers that obey signals, both directions.

## M3: Rules and protection ✅

- TPWS overspeed sensors 150 m before signals and 300 m before big speed reductions; train stop
  override for passing a red with authority.
- AWS for permanent speed restrictions (warning boards with magnets).
- Overspeed and SPAD penalties (SPAD can end the run: setting).
- Cab radio to the signaller: authority to pass a red at caution, required after a SPAD.

## M4: Junctions and route setting ✅

- A track network: lines, tracks, facing and trailing points; trains that span junctions.
- Interlocking: points set for each train's booked route, 5 s to move, track and approach
  locking; signals held at red while points move or are set against them.
- Junction signals with feathers and approach control.
- Barnham Junction (Bognor branch: facing on the Down, trailing on the Up), Ford Junction
  (Littlehampton west curve), Arundel Junction (the Arun Valley line), with junction speeds.
- The whole line to Amberley, both directions, plus Bognor Regis.

## M5: Level crossings and scenery ✅

- Full barrier crossings: amber, red, barriers down, proved clear, protecting signal released;
  raised once the train is clear. Automatic half barriers with timed warnings. Footpath,
  bridleway and farm crossings with whistle boards.
- Failure: barriers stuck up; the signal stays red and the signaller authorises you over at
  10 mph after a check.
- Terrain from elevation tiles, graded around the track; buildings, roads, rivers and woods
  from OSM; bridges, tunnel portals, platforms with canopies and nameboards; landmarks.

## M6: Sound ✅

- Passing-train sound, right-away bells, PA announcements (speech synthesis: departures and
  approaching each stop).
- Recorded samples can replace any synth voice via `public/audio/samples.json`. Howler.js
  turned out to be unnecessary: Web Audio plays samples fine.

## M7: Scoring, polish, gamepad ✅

- Scoring: punctuality, stop accuracy, ride comfort (jerk), safety record, whistles; grades A–D.
- Gamepad API controls, rebindable keys, save/resume at each departure, time warp.

## Later ✅ (first versions)

- Weather (clear, overcast, rain, fog) affecting visibility and adhesion.
- Autumn leaf fall: low adhesion in wooded stretches, with wheel-slide protection and sanding.
- Time of day: sun position by season and clock, darkness, headlights, platform lamps.
- Random signal failures, crossing failures and trespassers (frequency setting).

## Next, if you want it

- **Verify the generated signalling** against the Sectional Appendix or cab-ride videos and
  replace generated signals with real positions and IDs (it's data: edit `generateSignals` in
  `tools/build-route.mjs`, or hand-edit `route.json`).
- **Flat junction conflicts:** the `crosses` field on trailing points (an Up train crossing the
  Down line at Barnham, Ford and Arundel junctions) is recorded but not yet interlocked, so an
  AI train could in theory be routed across another's path. Hasn't happened in testing because
  the timetable keeps them apart.
- Littlehampton services (the branch is built but nothing is booked on it).
- Recorded sounds; a modelled cab interior; LOD for distant buildings.
- Degraded working: driving on a caution aspect through a section of failed signals.
