import { describe, expect, it } from 'vitest';
import { Network } from '../src/route/network.js';
import { TrainPath } from '../src/route/trainPath.js';
import { Signalling } from '../src/signals/signalling.js';
import { Interlocking, POINTS_THROW_S } from '../src/signals/interlocking.js';
import { Aspect, aspectBehind, isCautionary } from '../src/signals/aspects.js';
import { validateRoute } from '../src/route/validate.js';
import { mphToMps } from '../src/core/units.js';
import { junctionRoute } from './fixtures.js';

const net = () => new Network(junctionRoute());
const { RED: R, YELLOW: Y, DOUBLE_YELLOW: YY, GREEN: G } = Aspect;

describe('aspect sequence rules', () => {
  it('4-aspect steps R → Y → YY → G; 3-aspect has no double yellow', () => {
    expect([R, Y, YY, G, null].map((a) => aspectBehind(a))).toEqual([Y, YY, G, G, G]);
    expect(aspectBehind(R, '3')).toBe(Y);
    expect(aspectBehind(Y, '3')).toBe(G);
  });

  it('AWS treats everything but green as a caution', () => {
    expect([R, Y, YY, G].map(isCautionary)).toEqual([true, true, true, false]);
  });
});

describe('Network.walk', () => {
  it('the fixture is a valid route', () => {
    expect(validateRoute(junctionRoute())).toEqual([]);
  });

  it('goes straight on through facing points set normal', () => {
    const n = net();
    expect(n.walk('main/UP', 2000, 1000)).toMatchObject({ track: 'main/UP', s: 3000, walked: 1000, end: null });
  });

  it('turns onto the branch when the points are reverse', () => {
    const n = net();
    n.points.get('J-U').state = 'R';
    expect(n.walk('main/UP', 2000, 1000)).toMatchObject({ track: 'br/DOWN', s: 500 });
  });

  it('can follow a planned setting instead of the actual one', () => {
    const n = net();
    expect(n.walk('main/UP', 2000, 1000, { decide: () => 'R' })).toMatchObject({ track: 'br/DOWN', s: 500 });
  });

  it('comes off the branch onto the main line through trailing points', () => {
    const n = net();
    const seen = [];
    const res = n.walk('br/UP', 300, 500, { onPoints: (p, state) => seen.push([p.id, state]) });
    expect(res).toMatchObject({ track: 'main/DOWN', s: 2300 });
    expect(seen).toEqual([['J-D', 'R']]);
  });

  it('notes trailing points passed on the main line need to be normal', () => {
    const n = net();
    const seen = [];
    n.walk('main/DOWN', 3000, 1000, { onPoints: (p, state) => seen.push([p.id, state]) });
    expect(seen).toEqual([['J-D', 'N']]);
  });

  it('stops at buffer stops and at open ends', () => {
    const n = net();
    const len = n.line('br').length;
    expect(n.walk('br/DOWN', 100, 5000)).toMatchObject({ track: 'br/DOWN', s: len, end: 'buffers' });
    expect(n.walk('main/UP', 4500, 2000)).toMatchObject({ s: 5000, end: 'open' });
  });

  it('measures distance across a junction', () => {
    const n = net();
    n.points.get('J-U').state = 'R';
    expect(n.distanceTo({ track: 'main/UP', s: 2000 }, { track: 'br/DOWN', s: 300 }, 2000)).toBeCloseTo(800);
    expect(n.distanceTo({ track: 'main/UP', s: 2000 }, { track: 'main/UP', s: 3000 }, 2000)).toBeNull();
  });

  it('finds the next speed change, including a slower branch', () => {
    const n = net();
    expect(n.nextSpeedChange({ track: 'main/UP', s: 2000 }, 3000)).toBeNull();
    n.points.get('J-U').state = 'R';
    const ch = n.nextSpeedChange({ track: 'main/UP', s: 2000 }, 3000);
    expect(ch?.distance).toBeCloseTo(500);
    expect(ch?.value).toBeCloseTo(mphToMps(30));
  });
});

describe('TrainPath', () => {
  it('spans a junction: front on the branch, rear on the main line', () => {
    const n = net();
    n.points.get('J-U').state = 'R';
    const path = new TrainPath(n, { track: 'main/UP', s: 2450, length: 80 });
    path.advance(50);
    expect(path.front).toEqual({ track: 'br/DOWN', s: 0 });
    path.advance(30);
    expect(path.front.track).toBe('br/DOWN');
    expect(path.front.s).toBeCloseTo(30);
    const body = path.body();
    expect(body.map((p) => p.track)).toEqual(['main/UP', 'br/DOWN']);
    expect(body[0].from).toBeCloseTo(2450);
    expect(path.rear).toEqual({ track: 'main/UP', s: 2450 });
  });

  it('rolls back the way it came', () => {
    const n = net();
    n.points.get('J-U').state = 'R';
    const path = new TrainPath(n, { track: 'main/UP', s: 2450, length: 80 });
    path.advance(100);
    n.points.get('J-U').state = 'N'; // even if the points move behind it
    path.retreat(70);
    expect(path.front.track).toBe('main/UP');
    expect(path.front.s).toBeCloseTo(2480);
  });

  it('keeps only about a train length of history', () => {
    const n = net();
    const path = new TrainPath(n, { track: 'main/UP', s: 500, length: 80 });
    for (let i = 0; i < 100; i++) path.advance(10);
    const span = path.pieces.reduce((sum, p) => sum + Math.abs(p.to - p.from), 0);
    expect(span).toBeLessThanOrEqual(130.001);
    expect(path.behind(80)).toEqual({ track: 'main/UP', s: 1420 });
  });
});

describe('Signalling on a network', () => {
  /** @param {Network} n */
  const sigs = (n) => new Signalling(n, junctionRoute().signals);
  const occ = (/** @type {Record<string, [number, number][]>} */ o) => new Map(Object.entries(o));

  it('sections follow the points and end at the next signal on whichever line', () => {
    const n = net();
    const s = sigs(n);
    expect(s.section(s.get('S2')).next?.id).toBe('S3');
    n.points.get('J-U').state = 'R';
    n.version++;
    const sec = s.section(s.get('S2'));
    expect(sec.next?.id).toBe('B1');
    expect(sec.pieces.map((p) => p.track)).toEqual(['main/UP', 'br/DOWN']);
  });

  it('a train on the branch holds the junction signal at red only when routed that way', () => {
    const n = net();
    const s = sigs(n);
    const busy = occ({ 'br/DOWN': [[300, 380]] });
    s.update(busy, []);
    expect(s.aspectOf('S2')).toBe(G); // straight on: the branch train doesn't matter
    n.points.get('J-U').state = 'R';
    n.version++;
    s.update(busy, [{ track: 'main/UP', s: 2100 }]);
    expect(s.aspectOf('S2')).toBe(R);
  });

  it('lights the feather and approach-controls the diverging route', () => {
    const n = net();
    const s = sigs(n);
    n.points.get('J-U').state = 'R';
    n.version++;
    s.update(occ({}), [{ track: 'main/UP', s: 1500 }]); // 700 m away: held
    expect(s.aspectOf('S2')).toBe(R);
    expect(s.get('S2').approachHeld).toBe(true);
    expect(s.aspectOf('S1')).toBe(Y);
    s.update(occ({}), [{ track: 'main/UP', s: 2000 }]); // 200 m: released
    expect(s.aspectOf('S2')).not.toBe(R);
    expect(s.get('S2').featherLit).toBe('left');
    // B1's section runs to the buffers, so B1 shows yellow and S2 double yellow.
    expect(s.aspectOf('B1')).toBe(Y);
    expect(s.aspectOf('S2')).toBe(YY);
  });

  it('no feather and no approach control on the straight route', () => {
    const n = net();
    const s = sigs(n);
    s.update(occ({}), []);
    expect(s.aspectOf('S2')).toBe(G);
    expect(s.get('S2').featherLit).toBeNull();
  });

  it('points moving or set against the route hold the signal at red', () => {
    const n = net();
    const s = sigs(n);
    n.points.get('J-D').state = 'R'; // set for a train off the branch
    n.version++;
    s.update(occ({}), []);
    expect(s.aspectOf('D2')).toBe(R); // can't run along the main past points set the other way
    expect(s.aspectOf('BU1')).toBe(G);
    n.points.get('J-U').moving = 'R';
    s.update(occ({}), []);
    expect(s.aspectOf('S2')).toBe(R);
  });

  it('finds signals ahead across a junction', () => {
    const n = net();
    n.points.get('J-U').state = 'R';
    const s = sigs(n);
    const ahead = s.signalsAhead({ track: 'main/UP', s: 2000 }, 3000, 3);
    expect(ahead.map((x) => x.signal.id)).toEqual(['S2', 'B1']);
    expect(ahead[1].distance).toBeCloseTo(1400); // 500 m to the junction + 900 m up the branch
  });

  it('held signals stay red until released', () => {
    const n = net();
    const s = sigs(n);
    s.hold('S3', 'lc:test', true);
    s.update(occ({}), []);
    expect(s.aspectOf('S3')).toBe(R);
    s.hold('S3', 'lc:test', false);
    s.update(occ({}), []);
    expect(s.aspectOf('S3')).toBe(G);
  });
});

describe('Interlocking', () => {
  const train = (/** @type {string} */ id, /** @type {string} */ track, /** @type {number} */ s, plan = {}) => ({
    id,
    front: { track, s },
    body: [{ track, from: s - 80, to: s }],
    plan: new Map(Object.entries(plan)),
  });

  it('sets points for an approaching train, then they take a few seconds to move', () => {
    const n = net();
    const s = new Signalling(n, junctionRoute().signals);
    const il = new Interlocking(n, s);
    const moved = il.update(0, [train('A', 'main/UP', 1500, { 'J-U': 'R' })]);
    expect(moved).toEqual([{ points: 'J-U', to: 'R', for: 'A' }]);
    expect(n.points.get('J-U').detected).toBe(false);
    il.update(POINTS_THROW_S + 0.1, [train('A', 'main/UP', 1500, { 'J-U': 'R' })]);
    expect(n.points.get('J-U').state).toBe('R');
  });

  it("won't move points under a train", () => {
    const n = net();
    const s = new Signalling(n, junctionRoute().signals);
    const il = new Interlocking(n, s);
    const onPoints = { id: 'B', front: { track: 'main/UP', s: 2530 }, body: [{ track: 'main/UP', from: 2450, to: 2530 }], plan: new Map() };
    expect(il.update(0, [onPoints, train('A', 'main/UP', 1800, { 'J-U': 'R' })])).toEqual([]);
  });

  it('the nearest train gets its way', () => {
    const n = net();
    const s = new Signalling(n, junctionRoute().signals);
    const il = new Interlocking(n, s);
    const moved = il.update(0, [train('far', 'main/UP', 300, { 'J-U': 'N' }), train('near', 'main/UP', 1900, { 'J-U': 'R' })]);
    expect(moved[0]).toMatchObject({ points: 'J-U', for: 'near' });
  });

  it('a train approaching a junction signal cleared the wrong way still gets its route', () => {
    const n = net();
    const s = new Signalling(n, junctionRoute().signals);
    const il = new Interlocking(n, s);
    s.update(new Map(), []);
    expect(s.aspectOf('S2')).not.toBe(R); // cleared for the straight route, nobody asked
    const a = train('A', 'main/UP', 1900, { 'J-U': 'R' }); // 300 m from S2, inside approach locking
    expect(il.update(0, [a])).toEqual([{ points: 'J-U', to: 'R', for: 'A' }]);
  });

  it('approach locking keeps the route for a train given a cleared signal', () => {
    const n = net();
    const s = new Signalling(n, junctionRoute().signals);
    const il = new Interlocking(n, s);
    s.update(new Map(), []);
    expect(s.aspectOf('D2')).not.toBe(R); // reads over J-D, set for the main line
    const main = train('M', 'main/DOWN', 3500); // 700 m from D2, wants the main line
    main.body = [{ track: 'main/DOWN', from: 3580, to: 3500 }];
    const branch = train('C', 'br/UP', 300); // nearer the points, wants to come off the branch
    expect(il.update(0, [main, branch])).toEqual([]);
  });

  it('a branch train coming off gets the trailing points reversed', () => {
    const n = net();
    const s = new Signalling(n, junctionRoute().signals);
    const il = new Interlocking(n, s);
    expect(il.update(0, [train('C', 'br/UP', 900)])).toEqual([{ points: 'J-D', to: 'R', for: 'C' }]);
  });
});

describe('Flat crossings (diamonds)', () => {
  // As the fixture, but the branch route off the Up line cuts across the Down line at 2500 m.
  const diamondRoute = () => {
    const data = junctionRoute();
    data.points[0].crosses = ['main/DOWN'];
    return data;
  };
  const setup = () => {
    const data = diamondRoute();
    const n = new Network(data);
    const s = new Signalling(n, data.signals);
    return { n, s, il: new Interlocking(n, s) };
  };
  /** @param {string} id @param {string} track @param {number} front @param {number} rear */
  const train = (id, track, front, rear, plan = {}) => ({
    id,
    front: { track, s: front },
    body: [{ track, from: rear, to: front }],
    plan: new Map(Object.entries(plan)),
  });
  const occ = (/** @type {Record<string, [number, number][]>} */ o) => new Map(Object.entries(o));

  it('holds the Down line signal at red while the route across it is set', () => {
    const { n, s } = setup();
    s.update(occ({}), []);
    expect(s.aspectOf('D2')).not.toBe(R);
    n.points.get('J-U').state = 'R';
    n.version++;
    s.update(occ({}), []);
    expect(s.aspectOf('D2')).toBe(R);
  });

  it("won't signal a train across the diamond while the Down line is occupied there", () => {
    const { n, s } = setup();
    n.points.get('J-U').state = 'R';
    n.version++;
    const upFront = [{ track: 'main/UP', s: 2100 }]; // inside S2's approach release
    s.update(occ({ 'main/UP': [[2020, 2100]] }), upFront);
    expect(s.aspectOf('S2')).not.toBe(R);
    s.update(occ({ 'main/UP': [[2020, 2100]], 'main/DOWN': [[2490, 2570]] }), upFront);
    expect(s.aspectOf('S2')).toBe(R);
  });

  it('a Down train past its last signal keeps the points from being reversed across its path', () => {
    const { s, il } = setup();
    s.update(occ({}), []);
    const down = train('D', 'main/DOWN', 2700, 2780); // past D2 (2800), heading for the diamond
    const up = train('U', 'main/UP', 2400, 2320, { 'J-U': 'R' }); // nearer, wants the branch
    expect(il.update(0, [down, up])).toEqual([]);
  });

  it('a Down train given a clear signal over the diamond keeps it', () => {
    const { s, il } = setup();
    s.update(occ({}), []);
    expect(s.aspectOf('D2')).not.toBe(R);
    const down = train('D', 'main/DOWN', 3500, 3580); // 700 m from D2
    const up = train('U', 'main/UP', 2300, 2220, { 'J-U': 'R' });
    expect(il.update(0, [down, up])).toEqual([]);
  });

  it('a Down train nearest the diamond gets the points put back to normal', () => {
    const { n, s, il } = setup();
    n.points.get('J-U').state = 'R';
    n.version++;
    s.update(occ({}), []);
    const down = train('D', 'main/DOWN', 3000, 3080);
    expect(il.update(0, [down])).toEqual([{ points: 'J-U', to: 'N', for: 'D' }]);
  });

  it('with the Down line clear, the branch train gets its route', () => {
    const { s, il } = setup();
    s.update(occ({}), []);
    const up = train('U', 'main/UP', 2000, 1920, { 'J-U': 'R' });
    expect(il.update(0, [up])).toEqual([{ points: 'J-U', to: 'R', for: 'U' }]);
  });
});

describe('route validation of diamonds', () => {
  it('accepts a diamond on the same line and rejects one elsewhere', () => {
    const ok = junctionRoute();
    ok.points[0].crosses = ['main/DOWN'];
    expect(validateRoute(ok)).toEqual([]);
    const bad = junctionRoute();
    bad.points[0].crosses = ['br/UP'];
    expect(validateRoute(bad).join(' ')).toMatch(/crosses/);
  });
});
