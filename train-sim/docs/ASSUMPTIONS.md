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

## Safety systems (`src/safety`, `src/sim/simulation.js`)

| # | Item | Value | Status | Notes |
| --- | --- | --- | --- | --- |
| S1 | AWS magnet position | 180 m before the signal | sourced (UK standard, ≈200 yd) | Real sites vary. |
| S2 | AWS acknowledgement time | 2.7 s | assumed (commonly quoted) | |
| S3 | AWS / TPWS / DSD intervention | emergency brake | assumed | Some stock applies full service instead. |
| S4 | Penalty reset | stop, power off, press Q | simplified | Real: stop, contact the signaller, get authority, then reset. See REALISM_VS_FUN. |
| S5 | DSD | warning, then brake after 3 s | assumed | Real timings differ by fleet. |
| S6 | Vigilance | every 60 s while moving | assumed | |
| S7 | TPWS | train stop at red only (M1) | simplified | OSS overspeed loops come in M3. |
| S8 | Overspeed tolerance | 1 mph before it counts | game choice | |
| S9 | Doors open only alongside a platform | enforced | game choice | Real trains can be released off the platform, which is a serious incident. |
| S10 | Door timings | open 3 s, close 5 s | assumed | |

## Signalling (`src/signals`)

| # | Item | Value | Status | Notes |
| --- | --- | --- | --- | --- |
| G1 | Overlap | 180 m | sourced (UK standard full overlap) | Restricted overlaps exist at some signals. |
| G2 | Lamp order (4-aspect) | bottom to top: R, Y, G, Y | sourced (UK practice) | |
| G3 | Signal placement | left of the line, 2.3 m from track centre, lowest lamp 3.2 m above rail | assumed | Real sighting varies a lot (gantries, right-hand placement where sighting demands). |
| G4 | Signal positions on the real route | unknown | **open** | Not in OSM for this area. Biggest open question for M2. |
| G5 | Permanent speed boards | black figures on white | assumed | Check the real style; warning boards for reductions come in M3. |

## Track and scenery (`src/render`)

| # | Item | Value | Status |
| --- | --- | --- | --- |
| R1 | Track centres (two tracks) | 3.4 m | assumed (standard 6-foot) |
| R2 | Sleeper spacing | 650 mm | assumed |
| R3 | Third rail | 1.2 m from track centre, top 75 mm above running rails | assumed |
| R4 | Platform height / edge | 915 mm above rail / 1.45 m from track centre | sourced (UK standard height) / assumed |
| R5 | Landscape | random trees, hedges, distant hills | placeholder until M5 |

## Test track (`public/data/routes/test-track.json`)

| # | Item | Status |
| --- | --- | --- |
| X1 | Everything: layout, gradients, 50 mph restriction, signal TT1–TT4, platforms A and B, the train ahead | fictional |

## Real route (`docs/ROUTE_RESEARCH.md`, `tools/research/route-features.json`)

| # | Item | Status | Verify against |
| --- | --- | --- | --- |
| P1 | Feature positions (≈ km from Chichester) | approximate (straight-line, ±0.2 km) | Sectional Appendix mileages, OS maps |
| P2 | Level crossing types | from OSM tags | Network Rail level crossing data, site visits / videos |
| P3 | Yapton crossing is now full-barrier CCTV | OSM agrees with Network Rail's plan | confirm completion |
| P4 | Speed limits | from OSM `maxspeed` | Sectional Appendix |
| P5 | Which OSM bridges cross the Arun | unknown | OS map |
| P6 | Junction layouts (Barnham, Ford, Arundel) | from OSM junction nodes and Wikipedia | OpenRailwayMap track layout, signalling diagrams |
