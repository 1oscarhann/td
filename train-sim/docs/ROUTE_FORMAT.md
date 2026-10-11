# Route file format

Routes live in `public/data/routes/*.json`. `npm run validate:routes` checks them with the same
code the game uses, so if it passes, the game loads it.

Conventions:

- **Positions** are chainage: metres along the line from the start of the route. (UK railways
  use miles and chains from London; a tool will convert in M2.)
- **Speeds** are mph. **Gradients** are per-mille (‰), positive = rising towards increasing
  chainage. 1 in 200 = 5‰, 1 in 100 = 10‰.
- **Lateral offsets** are metres to the right of the direction of increasing chainage.
- **"left"/"right"** on platforms means as seen by a driver using that track.

```jsonc
{
  "id": "test-track",                 // used as the key for saved scores
  "name": "Test Track",
  "startTime": "09:00:00",            // clock at the start of the run
  "lineSpeedMph": 75,                 // anywhere not covered by speedLimits
  "alignment": {
    "points": [[0, 0], [8500, 0]],    // [x east, y north] in metres; any number of points
    "startElevationM": 5
  },
  "tracks": [
    // dir 1 = trains run towards increasing chainage. UK left-hand running puts that track on
    // the left, so a negative offset.
    { "id": "UP", "offset": -1.7, "dir": 1, "conductorRail": "right" }
  ],
  "gradients":   [{ "from": 3000, "to": 4200, "permille": 5 }],
  "speedLimits": [{ "from": 5900, "to": 6400, "mph": 50 }],   // lowest wins where they overlap
  "signalling":  { "overlapM": 180, "endOfLine": "open" },    // or "stop" for buffer stops
  "signals": [
    // Read by trains on that track. aws/tpws default to true, aspects to "4".
    { "id": "TT1", "track": "UP", "position": 2500, "aspects": "4", "aws": true, "tpws": true }
  ],
  "platforms": [
    { "id": "PB", "name": "Test Platform B", "track": "UP", "from": 7400, "to": 7640,
      "side": "left", "stopMarkers": [{ "cars": 4, "position": 7625 }] }
  ],
  "levelCrossings": [],               // M5
  "junctions": [],                    // M4
  "trains": {
    "player": { "track": "UP", "frontPosition": 320, "notch": "B3" },
    "ai": [
      // departAt: seconds, or [min, max] for a random time each run
      { "id": "1A23", "track": "UP", "frontPosition": 2900, "departAt": [25, 70],
        "accelMps2": 0.55, "maxSpeedMph": 60 }
    ]
  },
  "objective": { "platform": "PB" },  // stop here with the doors open to finish
  "scenery": { "seed": 1377, "hills": "left" }
}
```

Fields planned for later milestones (the validator will learn them as they arrive):

- `levelCrossings`: `{ id, name, position, type: "MCB-CCTV" | "MCB-OD" | "AHB" | "UWC" | "footpath", protectingSignals: [...], whistleBoard? }`
- `junctions`: `{ id, name, points: [{ id, position, normal: track, reverse: track }], routes: [...] }`
- `stations` and `timetable`: arrival/departure times per stop.
- `assumptions`: per-route list of IDs from docs/ASSUMPTIONS.md that apply.
