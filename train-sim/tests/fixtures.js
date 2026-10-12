/**
 * A small junction for tests:
 *
 *   main line, straight east 0 → 5000 m, Up (eastbound) and Down tracks.
 *   branch "br" leaves at main 2500 m, curving north-east, ending at buffer stops after ~1.6 km.
 *   J-U: facing points on main/UP at 2500: reverse → br/DOWN (towards the buffers).
 *   J-D: trailing points where br/UP joins main/DOWN at 2500.
 */
export function junctionRoute() {
  return {
    id: 'junction-test',
    name: 'Junction test',
    version: 2,
    lines: [
      {
        id: 'main',
        alignment: { points: [[0, 0], [5000, 0]] },
        lineSpeedMph: 75,
        ends: { start: 'open', end: 'open' },
        tracks: [
          { id: 'UP', offset: -1.7, dir: 1 },
          { id: 'DOWN', offset: 1.7, dir: -1 },
        ],
        speedLimits: [],
        gradients: [],
      },
      {
        id: 'br',
        alignment: { points: [[2500, 0], [2600, 20], [3600, 1200]] },
        lineSpeedMph: 30,
        ends: { start: 'junction', end: 'buffers' },
        tracks: [
          { id: 'DOWN', offset: -1.7, dir: 1 },
          { id: 'UP', offset: 1.7, dir: -1 },
        ],
        speedLimits: [],
        gradients: [],
      },
    ],
    points: [
      { id: 'J-U', type: 'facing', at: { line: 'main', track: 'UP', position: 2500 }, other: { line: 'br', track: 'DOWN', position: 0 } },
      { id: 'J-D', type: 'trailing', at: { line: 'main', track: 'DOWN', position: 2500 }, other: { line: 'br', track: 'UP', position: 0 } },
    ],
    signals: [
      { id: 'S1', line: 'main', track: 'UP', position: 1000 },
      { id: 'S2', line: 'main', track: 'UP', position: 2200, feather: { points: 'J-U', state: 'R', side: 'left' }, approachControl: true },
      { id: 'S3', line: 'main', track: 'UP', position: 3600 },
      { id: 'B1', line: 'br', track: 'DOWN', position: 900 },
      { id: 'D1', line: 'main', track: 'DOWN', position: 4000 },
      { id: 'D2', line: 'main', track: 'DOWN', position: 2800 },
      { id: 'D3', line: 'main', track: 'DOWN', position: 1000 },
      { id: 'BU1', line: 'br', track: 'UP', position: 700 },
    ],
    stations: [{ id: 'X', name: 'Exe', line: 'main', position: 600 }],
    platforms: [{ id: 'X1', station: 'X', name: 'Exe', line: 'main', track: 'UP', from: 400, to: 640, side: 'left', stopMarkers: [{ cars: 4, position: 620 }] }],
    services: [{ id: 'S', headcode: '2X01', name: 'Test', plan: {}, calls: [{ platform: 'X1', dep: '10:00:00' }, { platform: 'X1', arr: '10:10:00' }] }],
  };
}
