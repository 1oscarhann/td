# Route research: Chichester → Amberley

Gathered 11 October 2026 from OpenStreetMap (via Overpass), Wikipedia, Network Rail and local
press. Machine-readable version: [`tools/research/route-features.json`](../tools/research/route-features.json).
Re-check level crossings any time with `npm run osm:crossings`.

**Nothing here is survey-grade.** OpenStreetMap is volunteer-mapped. The authoritative source
for speeds, signals and crossings is Network Rail's Sectional Appendix.

## Two corrections to the original brief

1. **The Arun Valley line does not leave the coast line at Ford Junction.** It leaves at
   **Arundel Junction**, about 1 km east of Ford station and over the River Arun. Ford Junction
   is where the *Littlehampton west curve* leaves. Order heading east: Ford station → Ford Road
   level crossing → River Arun bridge → Ford Junction (go straight on) → Arundel Junction
   (diverge north). Historically the west curve opened in 1863, the east curve in 1887, and the
   eastern connection became Arundel Junction.
2. **Barnham Junction faces the other way.** The Bognor Regis branch leaves at the west end of
   Barnham station and points towards Ford/London. Driving east from Chichester the points are
   *trailing*: you can't be routed to Bognor without reversing. On the drive back (westbound,
   the Down line) it's a *facing* junction and routing a train to Bognor works.

## Stations (approximate distance from Chichester)

| Station | CRS | ≈ km | Level crossing at the station? |
| --- | --- | --- | --- |
| Chichester | CCH | 0 | **Yes, two**: Stockbridge Road and Basin Road, both just east of the station |
| Barnham | BAA | 9.95 | No road crossing; a public footpath (WSx/323) crosses just west |
| Ford | FOD | 14.3 | **Yes**: Ford Road, at the east end, between the platforms and the Arun bridge |
| Arundel | ARU | 17.9 | No |
| Amberley | AMY | 23.5 | No |

About 23.5 km (14.6 miles) in all, so a 20 to 25 minute drive with stops.

## Road level crossings on the route

| ≈ km | Crossing | Road | Type (OSM) |
| --- | --- | --- | --- |
| 0.05 | Stockbridge Road | primary road | full barrier, lights |
| 0.14 | Basin Road | | full barrier, lights |
| 1.12 | Whyke Road | B2145 | full barrier, lights |
| 3.17 | Drayton | Drayton Lane B2144 | full barrier, lights |
| 5.33 | Woodhorn Lane | | **automatic half barrier (AHB)** |
| 7.89 | Woodgate | A29 Westergate St / Lidsey Rd | full barrier, lights (notorious queues) |
| 12.2 | Yapton | Yapton Lane B2132 | full barrier, lights (was AHB; Network Rail upgraded it to CCTV full barriers, confirm done) |
| 14.35 | Ford | Ford Road | full barrier |

"Full barrier" here is OSM's `double_half`: a half barrier each side of each carriageway, which
closes the whole road (UK MCB-type). Exactly which control system each uses (CCTV, obstacle
detection) isn't in OSM.

Plus, between stations: farm-track (probably user-worked) crossings at ≈7.5 and 8.8 km; at
Arundel Junction; and three on the Arun Valley line (≈16.3, 17.2, 20.4 km). Footpath and
bridleway crossings at ≈3.7, 9.5, 10.2, 10.9, 11.5, 11.8 (Maypole Lane bridleway), 12.9, 13.6,
19.0, 20.0 and 21.0 km. Footpath crossings usually have whistle boards: sound the horn.

Not on the route: Lyminster and Toddington crossings are east of Arundel Junction towards
Angmering.

## River Arun and structures

- **Ford river bridge** (≈14.6 km): the coast line climbs over the Arun just east of Ford station.
- **Black Rabbit bridge** (just north of Arundel, near Offham) and **Peppering bridge**
  (towards Burpham) carry the Arun Valley line over the river; both were replaced in 2009.
- OSM marks eight main-line bridges between Arundel and Amberley (one tagged as a viaduct, at
  ≈50.879 N). Which cross the river, side channels or roads needs checking.
- **North Stoke Tunnel**, 83 yd (76 m), between Arundel and Amberley.

## Speed limits (OSM, unverified)

| Section | mph |
| --- | --- |
| Chichester → Barnham approach | 75 |
| Barnham station area | 55 |
| East of Barnham → Ford | 75 |
| Ford station east end and the Arun bridge | 40 |
| Ford Junction → Arundel Junction | 30 |
| Arun Valley line | 75 |
| Barnham Junction, Bognor branch turnout | 20 |
| Ford Junction, Littlehampton west curve | 40 |

## Engineer's line references

The railway's own references treat Chichester → Ford → Arundel → Horsham as **one line**: ELR
**TBH** (Three Bridges to Havant via Horsham). The coast line east of Arundel Junction towards
Brighton is **BLI** (Brighton to Littlehampton). The west curve is **FJL**. Useful when reading
the Sectional Appendix.

## Electrification

750 V DC third rail throughout (Southern Railway, 1938 on the Arun Valley line).

## How the built route compares

The route builder (`tools/build-route.mjs`) works from OSM geometry rather than this table, so
the two are independent checks on each other. Distances from Chichester station along the
built line (its chainage minus 0.47 km, where the line starts west of the station):

| Feature | Research (≈ km) | Built route (km) |
| --- | --- | --- |
| Stockbridge Road crossing | 0.05 | 0.05 |
| Basin Road crossing | 0.14 | 0.14 |
| Whyke Road crossing | 1.12 | 1.12 |
| Drayton crossing | 3.17 | 3.17 |
| Woodhorn Lane AHB | 5.33 | 5.33 |
| Woodgate crossing | 7.89 | 7.89 |
| Barnham station | 9.95 | 9.95 |
| Barnham Junction (Bognor branch) | | 9.81 |
| Yapton crossing | 12.2 | 12.18 |
| Ford station | 14.3 | 14.32 |
| Ford Road crossing | 14.35 | 14.36 |
| Ford Junction (Littlehampton west curve) | | 14.82 |
| Arundel Junction | ≈1 km east of Ford | 15.42 |
| Arundel station | 17.9 | 18.01 |
| Amberley station | 23.5 | 23.68 |

Branches as built: Barnham Junction → Bognor Regis 5.6 km; Ford Junction → Littlehampton
2.7 km; and 1.5 km of the coast line east of Arundel Junction, so trains heading for Brighton
have somewhere to go.

## Still unknown

- **Real signal positions, numbers and types.** Not in OSM for this area. The built route
  uses generated signals (rules in ASSUMPTIONS G4). Cab-ride videos would settle most of it.
- **Exact gradients.** The built route takes them from ≈30 m elevation tiles, which is a
  surface model (trees and embankments show up), filtered and smoothed. Real gradient posts
  would be better.
- **Which crossings are CCTV and which obstacle detection.** The sim treats them the same.
- **Stop-marker positions.** Generated from OSM platform ends: the 4-car marker up to 40 m
  short of the far end, longer-train markers 6 m short of it.
- **Platform sides at Barnham** (island platform): the sim opens the doors on the left everywhere.

## Sources

- OpenStreetMap contributors, via the Overpass API (ODbL): level crossings, roads, stations,
  junction nodes, bridges, `maxspeed` and `railway:ref` tags.
- [Ford railway station](https://en.wikipedia.org/wiki/Ford_railway_station), Wikipedia: level crossing east of the station, river bridge, mileage.
- [Arun Valley line](https://en.wikipedia.org/wiki/Arun_Valley_line), Wikipedia: Arundel Junction, North Stoke Tunnel, electrification.
- [Littlehampton railway station](https://en.wikipedia.org/wiki/Littlehampton_railway_station), Wikipedia: history of Ford, Littlehampton and Arundel junctions.
- [British Rail Class 377](https://en.wikipedia.org/wiki/British_Rail_Class_377), Wikipedia: mass, power, length, top speed.
- [Bridge replacements improve Arun Valley railway](https://www.networkrailmediacentre.co.uk/news/bridge-replacements-improve-arun-valley-railway), Network Rail: Black Rabbit and Peppering bridges.
- [Woodgate level crossing closed](https://www.bognor.co.uk/news/woodgate-level-crossing-closed-915535) and [Woodgate crossing could be revamped](https://www.bognor.co.uk/news/woodgate-crossing-could-be-revamped-916893), Bognor Regis Observer.
- [Yapton level crossing upgrade](https://www.sussexexpress.co.uk/news/transport/ten-days-of-road-closures-and-weekend-engineering-works-for-yapton-level-crossing-upgrade-164808), Sussex Express.
- [West Coastway half-term closures](https://www.networkrailmediacentre.co.uk/news/autumn-half-term-rail-closures-on-the-west-coastway-passengers-advised-to-plan-ahead), Network Rail: Basin Road and Stockbridge Road equipment renewals.
