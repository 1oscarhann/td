# Assumptions register

Every number or rule that isn't from a source, so you can check it against Network Rail,
OpenStreetMap, OpenRailwayMap, cab-ride videos or a friendly driver. Items marked (A) in the code
point here. When you verify one, change the status and note the source.

Status: **assumed** = my best estimate; **sourced** = from a cited source but still worth a
second check; **fictional** = test-track only, never meant to be real.

## Class 377/4 train (`src/physics/trainSpec.js`)

| # | Item | Value | Status | Why / how to check |
| --- | --- | --- | --- | --- |
| T1 | Length | 81.6 m (4 × 20.4 m) | sourced (Wikipedia) | |
| T2 | Tare mass | 173.6 t | sourced (Wikipedia) | |
| T3 | Power | 1,200 kW (6 × 200 kW) | sourced (Wikipedia) | Continuous rating. Real short-term power may be higher, which would make it quicker than the sim (0–60 mph ≈ 70 s here). Compare with cab-ride videos. |
| T4 | Top speed | 100 mph | sourced (Wikipedia) | |
| T5 | Passenger load | 10 t (~130 people) | assumed | Varies by time of day; could be a setting. |
| T6 | Rotational mass allowance | +8 % | assumed | Typical EMU 6–10 %. |
| T7 | Max tractive effort | 160 kN (≈0.8 m/s² start) | assumed | Electrostar start acceleration figures welcome. |
| T8 | Power notches | P1–P4 = 25/50/75/100 % | assumed | Real Electrostar notches request acceleration rates rather than a share of effort; feel is similar. |
| T9 | Traction ramp | 0.6/s up, 1.5/s down | assumed | Jerk limiting; affects how "snatchy" pulling away feels. |
| T10 | Brake steps | B1/B2/B3 = 0.3/0.6/0.9 m/s² | assumed | ≈3/6/9 %g, typical UK EMU. Full service 75 mph → stand ≈ 624 m. |
| T11 | Emergency brake | 1.2 m/s² | assumed | ≈12 %g. 75 mph → stand ≈ 478 m. |
| T12 | Brake cylinder pressures | 1 bar per 0.3 m/s² (B3 3 bar, EB 4 bar) | assumed | Only affects the gauge reading. |
| T13 | Brake build-up / release | time constants 0.7 s / 1.2 s | assumed | |
| T14 | Main reservoir | 8 bar, constant | assumed | Not simulated yet (no compressor). |
| T15 | Running resistance (Davis) | 2,200 + 45v + 6v² N | assumed | Gives ≈0.05 m/s² coasting decel at 75 mph. |
| T16 | Load-weighed brakes | brake force scales with mass | assumed | Modern EMUs compensate for load. |
| T17 | Driver's eye | 2.65 m above rail, 1.6 m behind the front, 0.55 m left of centre | assumed | UK drivers sit on the left. |
| T18 | Traction interlocks | no power with doors open, DRA set, or a penalty brake latched | assumed (standard practice) | |

## Safety systems (`src/safety`, `src/sim/simulation.js`, `src/sim/trackside.js`)

| # | Item | Value | Status | Notes |
| --- | --- | --- | --- | --- |
| S1 | AWS magnet position | 180 m before the signal | sourced (UK standard, ≈200 yd) | Real sites vary. |
| S2 | AWS acknowledgement time | 2.7 s | assumed (commonly quoted) | |
| S3 | AWS / TPWS / DSD intervention | emergency brake | assumed | Some stock applies full service instead. |
| S4 | Penalty reset | stop, power off, press Q; after a SPAD the signaller must be called first | simplified | Real procedure has more steps (and a relief driver). |
| S5 | DSD | warning, then brake after 3 s | assumed | Real timings differ by fleet. |
| S6 | Vigilance | every 60 s while moving | assumed | |
| S7 | TPWS OSS at signals | loops 150 m before; set speed √(2 × 1 m/s² × (150 m + 60 % of the overlap)) ≈ 51 mph | assumed | Real set speeds are calculated per site; this keeps a train at the set speed able to stop within the overlap. |
| S8 | TPWS OSS at speed restrictions | 300 m before a drop of a third or more; set speed: (new limit × 1.1 + 5 mph), plus what 0.9 m/s² takes off over 300 m | assumed | Real sites: only where the approach speed is 60 mph+ and the drop is big enough. |
| S9 | AWS at speed restrictions | warning board and magnet where the limit drops by a third or more | sourced (UK rule) | Distance from the board is a fixed brake curve here. |
| S10 | Train stop override | 20 s | assumed | Real TSO times out after about 20 s. |
| S11 | Overspeed tolerance | 1 mph before it counts | game choice | |
| S12 | Doors open only alongside a platform | enforced | game choice | Real trains can be released off the platform, which is a serious incident. |
| S13 | Door timings | open 3 s, close 5 s | assumed | |
| S14 | Authority to pass at danger | 20 mph to the next signal (10 mph over a failed crossing) | assumed (Rule Book style) | Real wording and limits are in the Rule Book module TW1/TW8. |

## Signalling (`src/signals`, `tools/build-route.mjs` → `generateSignals`)

| # | Item | Value | Status | Notes |
| --- | --- | --- | --- | --- |
| G1 | Overlap | 180 m | sourced (UK standard full overlap) | Restricted overlaps exist at some signals. |
| G2 | Lamp order (4-aspect) | bottom to top: R, Y, G, Y | sourced (UK practice) | |
| G3 | Signal placement | left of the line, 2.3 m from track centre, lowest lamp 3.2 m above rail | assumed | Real sighting varies (gantries, right-hand placement). |
| G4 | **Signal positions and IDs on the real route** | **generated**: a starting signal at each platform end, protecting signals before full-barrier crossings, junction signals before facing points, controlled signals before trailing points, automatic signals filling gaps longer than 1,650 m. IDs use made-up prefixes (CH, BN, FD, AL, AY, BR, LH, AJ). | **generated** | Not in OSM for this area. Biggest open question. Real IDs on this route are Lancing/Three Bridges ROC panel numbers. |
| G5 | Permanent speed boards | black figures on white | assumed | |
| G6 | Approach control | junction signals for routes of 40 mph or less stay red until the train is within 250 m | assumed | Real approach release uses a timed track section; 250 m is a stand-in. |
| G7 | Feathers | which route at each junction gets the feather (see J2) | assumed | |
| G8 | Points | 5 s to move; locked with a train within 40 m (track locking) or 1,600 m on the approach to a signal reading over them (approach locking) | assumed | Typical figures; real approach locking is timed. |

## Junctions (`tools/build-route.mjs`)

| # | Item | Value | Status | Notes |
| --- | --- | --- | --- | --- |
| J1 | Junction speeds | Barnham → Bognor 20 mph, Ford → Littlehampton 40 mph, Arundel Jn → Brighton 30 mph (first 250–300 m of the branch) | assumed / OSM where tagged | Check against the Sectional Appendix. |
| J2 | Diverging route | Barnham: Bognor branch, left (Down). Ford Jn: Littlehampton west curve, right (Up). Arundel Jn: the Arun Valley line, left (Up; our "main" line continues that way) | from geography | |
| J3 | Flat crossings | Up trains to/from the branches cross the Down main (`crosses` on the points) | recorded, **not interlocked** | Timetable keeps trains apart; see MILESTONES. |

## Level crossings (`src/sim/crossings.js`)

| # | Item | Value | Status | Notes |
| --- | --- | --- | --- | --- |
| L1 | Full barrier sequence | amber 3 s, red 4 s, barriers lower 8 s, prove 8 s, then the signal clears; raise 6 s | assumed | Real MCB-CCTV crossings need a signaller to check the camera, which can take longer. |
| L2 | Full barrier strike-in | 3,500 m ahead of the train, or when it's ready to leave a station nearby | assumed | Real crossings are called by the signaller or by track circuits. |
| L3 | AHB warning | starts 32 s before the train arrives (at line speed) | assumed (≈27 s minimum in standards) | |
| L4 | Whistle boards | 320 m before footpath, bridleway and farm crossings | assumed | |
| L5 | Crossing types | from OSM tags (`crossing:barrier`, `crossing:light`, highway type) | from OSM | Verify each against Network Rail's level crossing data. |

## Weather and adhesion (`src/sim/environment.js`)

| # | Item | Value | Status | Notes |
| --- | --- | --- | --- | --- |
| E1 | Adhesion μ | clear 0.25, overcast 0.22, fog 0.15, rain 0.12 | assumed (typical published ranges) | Dry steel 0.25–0.35, wet 0.10–0.15. |
| E2 | Leaf contamination | 0.06 dry, 0.035 wet, in autumn, along stretches within 40 m of woodland | assumed | Railhead treatment trains don't exist here. |
| E3 | Sanding | after 0.6 s of slip or slide | assumed | |
| E4 | Sun | elevation from latitude 50.84° N, season and clock (BST in summer) | approximate | |

## Timetable and other trains (`tools/lib/timetable.mjs`, `src/sim/aiDriver.js`)

| # | Item | Value | Status | Notes |
| --- | --- | --- | --- | --- |
| A1 | Headcodes and times | made up, loosely on Southern's off-peak pattern | **fictional** | |
| A2 | Running times | timed by driving each service headless, +5 %, rounded up to 30 s | generated | |
| A3 | Dwell | 60 s booked at each intermediate stop | assumed | |
| A4 | AI braking | plans at 0.45 m/s² | assumed | Real drivers brake earlier and gentler. |

## Track and scenery (`src/render`, `tools/build-route.mjs`)

| # | Item | Value | Status |
| --- | --- | --- | --- |
| R1 | Track centres (two tracks) | 3.4 m | assumed (standard 6-foot) |
| R2 | Sleeper spacing | 650 mm | assumed |
| R3 | Third rail | 1.2 m from track centre, top 75 mm above running rails | assumed |
| R4 | Platform height / edge | 915 mm above rail / 1.45 m from track centre | sourced (UK standard height) / assumed |
| R5 | Platform side | left of the driver everywhere | assumed; wrong for island platforms (check Barnham) |
| R6 | Track alignment | OSM ways, averaged across the two tracks and smoothed over ±30 m | from OSM; good to a few metres |
| R7 | Gradients | from 30 m elevation tiles (zoom 12), low-percentile filter, bridges spanned, smoothed into 400 m steps | approximate: real gradient posts would be better |
| R8 | Terrain | 75 m grid, flattened to formation level within 30 m of the track and blended out to 110 m | approximate |
| R9 | Buildings | OSM footprints within 180 m of the line; height from `height`, else `building:levels` × 3 m + 1.5 m, else by type (houses 7.5 m, sheds 3 m, industrial and retail 8 m, churches 16 m) | footprints from OSM, heights mostly assumed |

## Test track (`public/data/routes/test-track.json`)

| # | Item | Status |
| --- | --- | --- |
| X1 | Everything: layout, gradients, 40 mph restriction, signals TT1–TT4 / TD1–TD3, platforms A and B, crossings, the train ahead | fictional |

## Real route (`docs/ROUTE_RESEARCH.md`, `tools/research/route-features.json`)

| # | Item | Status | Verify against |
| --- | --- | --- | --- |
| P1 | Feature positions | from OSM geometry, projected (equirectangular, accurate to well under 0.1 % here) | OS maps, Sectional Appendix mileages |
| P2 | Level crossing types | from OSM tags | Network Rail level crossing data, site visits / videos |
| P3 | Yapton crossing is now full-barrier CCTV | OSM agrees with Network Rail's plan | confirm completion |
| P4 | Speed limits | from OSM `maxspeed` | Sectional Appendix |
| P5 | Junction layouts (Barnham, Ford, Arundel) | from OSM track geometry | OpenRailwayMap track layout, signalling diagrams |
