import { describe, expect, it } from 'vitest';
import { CLASS_377_4 } from '../src/physics/trainSpec.js';
import { Train } from '../src/physics/train.js';
import { Controller, NOTCHES } from '../src/physics/controller.js';
import { stoppingDistance } from '../src/physics/braking.js';
import { mphToMps, mpsToMph, oneInToPermille } from '../src/core/units.js';

const DT = 1 / 60;

/**
 * Run a train with fixed controls for `seconds`, or until `until(train)` is true.
 * @param {Train} train
 * @param {{ powerDemand?: number, brakeDemand?: number, gradientPermille?: number }} controls
 * @param {number} seconds
 * @param {(t: Train) => boolean} [until]
 */
function run(train, { powerDemand = 0, brakeDemand = 0, gradientPermille = 0 }, seconds, until = () => false) {
  let t = 0;
  while (t < seconds && !until(train)) {
    train.step(DT, { powerDemand, brakeDemand, gradientPermille });
    t += DT;
  }
  return t;
}

/** A train already moving at `mph` with nothing applied. */
function trainAt(mph) {
  const train = new Train(CLASS_377_4);
  train.velocity = mphToMps(mph);
  return train;
}

describe('Train physics: traction', () => {
  it('stays put on level track with nothing applied', () => {
    const train = new Train(CLASS_377_4, { position: 100 });
    run(train, {}, 30);
    expect(train.position).toBe(100);
    expect(train.speed).toBe(0);
  });

  it('pulls away at about max tractive effort ÷ effective mass once power has built up', () => {
    const train = new Train(CLASS_377_4);
    run(train, { powerDemand: 1 }, 3); // ramp takes ~1.7 s
    const expected = CLASS_377_4.traction.maxTractiveEffortN / train.effectiveMass;
    expect(train.acceleration).toBeGreaterThan(expected * 0.9);
    expect(train.acceleration).toBeLessThan(expected);
  });

  it('ramps traction up gently rather than snatching', () => {
    const train = new Train(CLASS_377_4);
    run(train, { powerDemand: 1 }, 0.5);
    expect(train.tractionLevel).toBeCloseTo(0.3, 1);
  });

  it('reaches 60 mph in a plausible time for an EMU', () => {
    const train = new Train(CLASS_377_4);
    const t = run(train, { powerDemand: 1 }, 300, (tr) => tr.speed >= mphToMps(60));
    expect(t).toBeGreaterThan(40);
    expect(t).toBeLessThan(90);
  });

  it('never exceeds 100 mph on full power', () => {
    const train = new Train(CLASS_377_4);
    run(train, { powerDemand: 1 }, 900);
    expect(mpsToMph(train.speed)).toBeLessThanOrEqual(100.01);
    expect(mpsToMph(train.speed)).toBeGreaterThan(97);
  });

  it('lower power notches accelerate more slowly', () => {
    const p1 = new Train(CLASS_377_4);
    const p4 = new Train(CLASS_377_4);
    run(p1, { powerDemand: 0.25 }, 20);
    run(p4, { powerDemand: 1 }, 20);
    expect(p1.speed).toBeLessThan(p4.speed * 0.4);
  });
});

describe('Train physics: coasting and gradients', () => {
  it('coasts a long way: resistance alone slows it gently', () => {
    const train = trainAt(75);
    run(train, {}, 10);
    expect(train.acceleration).toBeLessThan(0);
    expect(train.acceleration).toBeGreaterThan(-0.1);
  });

  it('slows down more uphill than on the level', () => {
    const level = trainAt(60);
    const uphill = trainAt(60);
    run(level, {}, 30);
    run(uphill, { gradientPermille: oneInToPermille(100) }, 30);
    expect(uphill.speed).toBeLessThan(level.speed - 1);
  });

  it('rolls backwards on a steep climb with brakes released', () => {
    const train = new Train(CLASS_377_4, { position: 500 });
    run(train, { gradientPermille: oneInToPermille(50) }, 10);
    expect(train.velocity).toBeLessThan(0);
    expect(train.position).toBeLessThan(500);
  });

  it('holds on that climb with the brakes applied', () => {
    const train = new Train(CLASS_377_4, { position: 500 });
    train.bcPressure = 3; // already applied, as when stood at a platform
    run(train, { brakeDemand: 0.9, gradientPermille: oneInToPermille(50) }, 30);
    expect(train.position).toBeCloseTo(500, 3);
  });
});

describe('Train physics: braking', () => {
  it('lags: brake cylinder pressure takes a moment to build', () => {
    const train = trainAt(50);
    run(train, { brakeDemand: 0.9 }, 0.1);
    expect(train.bcPressure).toBeLessThan(1.5); // target 3 bar
    run(train, { brakeDemand: 0.9 }, 3);
    expect(train.bcPressure).toBeGreaterThan(2.85);
  });

  it('stops from 75 mph in step 3 within the textbook stopping distance', () => {
    const train = trainAt(75);
    const v = train.speed;
    run(train, { brakeDemand: 0.9 }, 120, (tr) => tr.isStationary);
    const lag = CLASS_377_4.brake.applyTimeConstantS;
    // Resistance helps, so the real stop is a bit shorter than the brake-only estimate...
    expect(train.position).toBeLessThan(stoppingDistance(v, 0.9, lag));
    // ...but not by much.
    expect(train.position).toBeGreaterThan(stoppingDistance(v, 0.9, lag) * 0.85);
  });

  it('the emergency brake stops shorter than full service', () => {
    const service = trainAt(75);
    const emergency = trainAt(75);
    run(service, { brakeDemand: 0.9 }, 120, (tr) => tr.isStationary);
    run(emergency, { brakeDemand: 1.2 }, 120, (tr) => tr.isStationary);
    expect(emergency.position).toBeLessThan(service.position * 0.8);
  });

  it('brakes stop the train but never push it backwards', () => {
    const train = trainAt(5);
    run(train, { brakeDemand: 1.2 }, 20);
    expect(train.velocity).toBe(0);
    expect(train.position).toBeGreaterThan(0);
  });

  it('cuts power whenever a brake is demanded', () => {
    const train = trainAt(30);
    run(train, { powerDemand: 1 }, 5);
    run(train, { powerDemand: 1, brakeDemand: 0.3 }, 2);
    expect(train.tractionLevel).toBe(0);
  });

  it('is deterministic: same inputs, same answer', () => {
    const a = new Train(CLASS_377_4);
    const b = new Train(CLASS_377_4);
    for (const t of [a, b]) {
      run(t, { powerDemand: 1 }, 40);
      run(t, { brakeDemand: 0.6, gradientPermille: 3 }, 60, (tr) => tr.isStationary);
    }
    expect(a.position).toBe(b.position);
  });
});

describe('Controller', () => {
  it('starts where asked and clamps at both ends', () => {
    const c = new Controller(CLASS_377_4, 'B3');
    expect(c.notch).toBe('B3');
    c.move(-10);
    expect(c.notch).toBe('EB');
    c.move(100);
    expect(c.notch).toBe('P4');
    expect(c.move(1)).toBe(false);
  });

  it('maps notches to demands', () => {
    const c = new Controller(CLASS_377_4);
    const seen = NOTCHES.map((n) => {
      c.set(n);
      return [n, c.powerDemand, c.brakeDemand];
    });
    expect(seen).toEqual([
      ['EB', 0, 1.2],
      ['B3', 0, 0.9],
      ['B2', 0, 0.6],
      ['B1', 0, 0.3],
      ['OFF', 0, 0],
      ['P1', 0.25, 0],
      ['P2', 0.5, 0],
      ['P3', 0.75, 0],
      ['P4', 1, 0],
    ]);
  });

  it('rejects made-up notches', () => {
    expect(() => new Controller(CLASS_377_4, 'P9')).toThrow();
  });
});
