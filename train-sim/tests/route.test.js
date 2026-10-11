import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StepProfile } from '../src/route/profile.js';
import { Alignment } from '../src/route/alignment.js';
import { Route, RouteError } from '../src/route/route.js';
import { validateRoute } from '../src/route/validate.js';
import { mphToMps } from '../src/core/units.js';

const testTrack = () => JSON.parse(readFileSync(new URL('../public/data/routes/test-track.json', import.meta.url), 'utf8'));

describe('StepProfile', () => {
  const limits = new StepProfile(
    [
      { from: 0, to: 1000, value: 75 },
      { from: 400, to: 600, value: 40 },
      { from: 1000, to: 2000, value: 90 },
    ],
    { defaultValue: 20, combine: Math.min },
  );

  it('looks up values, with the lowest winning where they overlap', () => {
    expect(limits.valueAt(-5)).toBe(20);
    expect(limits.valueAt(0)).toBe(75);
    expect(limits.valueAt(399.9)).toBe(75);
    expect(limits.valueAt(400)).toBe(40);
    expect(limits.valueAt(600)).toBe(75);
    expect(limits.valueAt(1500)).toBe(90);
    expect(limits.valueAt(2000)).toBe(20);
  });

  it('finds the lowest value under a whole train', () => {
    expect(limits.minBetween(300, 380)).toBe(75);
    expect(limits.minBetween(550, 630)).toBe(40); // front past the end, rear still in it
    expect(limits.minBetween(630, 550)).toBe(40); // either order
    expect(limits.minBetween(320, 400)).toBe(40); // front just reaching the board
  });

  it('finds the next change in either direction', () => {
    expect(limits.nextChange(100, 1)).toEqual({ position: 400, value: 40 });
    expect(limits.nextChange(700, -1)).toEqual({ position: 600, value: 40 });
    expect(limits.nextChange(2500, 1)).toBeNull();
  });

  it('integrates, which gives height from gradients', () => {
    const grades = new StepProfile([
      { from: 0, to: 1000, value: 5 },
      { from: 1000, to: 2000, value: -2 },
    ]);
    expect(grades.integral(1000) / 1000).toBeCloseTo(5);
    expect(grades.integral(1500) / 1000).toBeCloseTo(4);
    expect(grades.integral(-100)).toBe(0);
  });

  it('rejects back-to-front segments', () => {
    expect(() => new StepProfile([{ from: 10, to: 5, value: 1 }])).toThrow();
  });
});

describe('Alignment', () => {
  it('measures chainage along the polyline', () => {
    const a = new Alignment([
      [0, 0],
      [300, 400],
      [300, 1000],
    ]);
    expect(a.length).toBe(1100);
    expect(a.pointAt(250)).toMatchObject({ x: 150, y: 200 });
    expect(a.pointAt(800)).toMatchObject({ x: 300, y: 700 });
  });

  it('puts positive lateral offsets on the right', () => {
    const east = new Alignment([
      [0, 0],
      [100, 0],
    ]);
    const p = east.pointAt(50, 2);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(-2); // heading east, right is south
    expect(p.heading).toBeCloseTo(Math.PI / 2);
  });

  it('extends straight beyond the ends', () => {
    const a = new Alignment([
      [0, 0],
      [0, 100],
    ]);
    expect(a.pointAt(150).y).toBeCloseTo(150);
    expect(a.pointAt(-20).y).toBeCloseTo(-20);
  });

  it('refuses duplicate points', () => {
    expect(
      () =>
        new Alignment([
          [0, 0],
          [0, 0],
        ]),
    ).toThrow();
  });
});

describe('route files', () => {
  it('the test track is valid', () => {
    expect(validateRoute(testTrack())).toEqual([]);
  });

  it('reports problems in plain English', () => {
    const bad = testTrack();
    bad.signals[0].track = 'NOPE';
    bad.signals[1].id = bad.signals[0].id;
    bad.gradients[0].permille = 400;
    bad.platforms[0].stopMarkers[0].position = 9999;
    const problems = validateRoute(bad);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown track "NOPE"'),
        expect.stringContaining('id used twice'),
        expect.stringContaining('gradients[0].permille'),
        expect.stringContaining('stop marker'),
      ]),
    );
    expect(() => new Route(bad)).toThrow(RouteError);
  });

  it('exposes gradients, heights and speed limits', () => {
    const route = new Route(testTrack());
    expect(route.length).toBe(8500);
    expect(route.gradientAt(3500)).toBe(5);
    expect(route.elevationAt(4200)).toBeCloseTo(5 + 6); // start height + 1200 m at 1 in 200
    expect(route.speedLimitAt(100)).toBeCloseTo(mphToMps(75));
    expect(route.speedLimitAt(6000)).toBeCloseTo(mphToMps(50));
    expect(route.speedLimitOver(6380, 6460)).toBeCloseTo(mphToMps(50)); // rear still in the restriction
  });

  it('knows which platform a train is alongside', () => {
    const route = new Route(testTrack());
    expect(route.platformAlongside('UP', 7540, 7622)?.id).toBe('PB');
    expect(route.platformAlongside('UP', 7600, 7682)).toBeNull(); // front overhangs the end
  });
});
