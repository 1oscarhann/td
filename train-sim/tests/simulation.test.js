import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Route } from '../src/route/route.js';
import { Simulation } from '../src/sim/simulation.js';
import { emptyInput } from '../src/core/input.js';
import { Aspect } from '../src/signals/aspects.js';
import { DEFAULT_SETTINGS } from '../src/core/settings.js';
import { mphToMps } from '../src/core/units.js';
import { maxSpeedForDistance } from '../src/physics/braking.js';

const DT = 1 / 60;
const routeData = () => JSON.parse(readFileSync(new URL('../public/data/routes/test-track.json', import.meta.url), 'utf8'));

/**
 * @param {object} [o]
 * @param {number} [o.departAt] when the train ahead leaves
 * @param {string} [o.dsdMode]
 */
function makeSim({ departAt = 30, dsdMode = 'off' } = {}) {
  const data = routeData();
  data.trains.ai[0].departAt = departAt;
  return new Simulation(new Route(data), { settings: { ...DEFAULT_SETTINGS, dsdMode: /** @type {any} */ (dsdMode) } });
}

/** Run `seconds` of sim, applying `input` (partial DriverInput or a function of the sim) each frame. */
function drive(sim, seconds, input = {}, until = () => false) {
  const events = [];
  for (let t = 0; t < seconds && !until(sim); t += DT) {
    sim.applyInput({ ...emptyInput(), ...(typeof input === 'function' ? input(sim) : input) });
    sim.step(DT);
    events.push(...sim.drainEvents());
  }
  return events;
}

const types = (events) => events.map((e) => e.type);

describe('Simulation', () => {
  it('starts stood at Platform A with the brakes on and signals sequenced behind the train ahead', () => {
    const sim = makeSim();
    expect(sim.controller.notch).toBe('B3');
    expect(sim.train.position).toBe(320);
    expect(sim.signalling.signals.map((s) => s.aspect)).toEqual([Aspect.RED, Aspect.GREEN, Aspect.GREEN, Aspect.GREEN]);
    expect(sim.nextSignal).toMatchObject({ signal: { id: 'TT1' }, distance: 2180 });
  });

  it('steps TT1 through Y, YY and G as the train ahead pulls away', () => {
    const sim = makeSim({ departAt: 0 });
    const seen = new Set();
    drive(sim, 400, {}, (s) => {
      seen.add(s.signalling.aspectOf('TT1'));
      return false;
    });
    expect([...seen]).toEqual([Aspect.RED, Aspect.YELLOW, Aspect.DOUBLE_YELLOW, Aspect.GREEN]);
  });

  it('cuts traction while the doors are open or the DRA is set', () => {
    const sim = makeSim();
    drive(sim, 1 / 60, { doorsToggle: true });
    expect(sim.doors.state).toBe('opening');
    const events = drive(sim, 1 / 60, { notchSteps: 8 }); // straight to P4
    expect(sim.controller.notch).toBe('P4');
    expect(types(events)).toContain('traction-inhibited');
    drive(sim, 3);
    expect(sim.train.speed).toBe(0);

    drive(sim, 1 / 60, { draToggle: true });
    expect(sim.draSet).toBe(true);
    drive(sim, 1 / 60, { doorsToggle: true });
    drive(sim, 7);
    expect(sim.doors.state).toBe('closed');
    expect(sim.train.speed).toBe(0); // DRA still holding it

    drive(sim, 1 / 60, { draToggle: true });
    drive(sim, 5);
    expect(sim.train.speed).toBeGreaterThan(0);
  });

  it('refuses to open the doors on the move or away from a platform', () => {
    const sim = makeSim();
    drive(sim, 20, { notchSteps: 0 }, () => false);
    sim.controller.set('P4');
    drive(sim, 15);
    const events = drive(sim, 0.1, { doorsToggle: true });
    expect(sim.doors.state).toBe('closed');
    expect(events.at(-1)?.text).toMatch(/at a stand/);
  });

  it('a SPAD at full power: AWS horn, TPWS emergency brake, penalty reset after stopping', () => {
    const sim = makeSim({ departAt: 9999 }); // the train ahead never leaves, so TT1 stays red
    sim.controller.set('P4');
    const events = drive(sim, 300, (s) => ({ awsAck: s.aws.hornSounding }), (s) => s.penalty !== null && s.train.isStationary);
    expect(types(events)).toEqual(expect.arrayContaining(['aws-horn', 'aws-ack', 'spad', 'penalty']));
    expect(sim.stats.spads).toBe(1);
    expect(sim.penalty).toBe('tpws');
    expect(sim.train.position).toBeGreaterThan(2500);

    // Can't reset with power still selected; can once it's off.
    drive(sim, 0.1, { awsAck: true });
    expect(sim.penalty).toBe('tpws');
    sim.controller.set('B3');
    const reset = drive(sim, 0.1, { awsAck: true });
    expect(types(reset)).toContain('penalty-reset');
    expect(sim.penalty).toBeNull();
  });

  it('applies the emergency brake if an AWS warning is ignored', () => {
    const sim = makeSim({ departAt: 9999 });
    sim.controller.set('P4');
    const events = drive(sim, 200, {}, (s) => s.penalty !== null);
    expect(types(events)).toContain('aws-horn');
    expect(sim.penalty).toBe('aws');
  });

  it("applies the emergency brake if the dead man's handle is let go on the move", () => {
    const sim = makeSim({ dsdMode: 'hold' });
    sim.controller.set('P2');
    drive(sim, 10, { dsdHeld: true });
    expect(sim.penalty).toBeNull();
    drive(sim, 4, { dsdHeld: false });
    expect(sim.penalty).toBe('dsd');
  });

  it('a careful driver can complete the run with a full score', () => {
    const sim = makeSim({ departAt: 20 });
    const decel = 0.6; // plan stops in brake step 2 and leave step 3 in reserve
    const marker = 7625;

    /** A deliberately simple driver: hold line speed, stop for reds, stop at the marker. */
    const driver = (/** @type {Simulation} */ s) => {
      const input = { dsdHeld: true, awsAck: s.aws.hornSounding };
      const front = s.train.position;
      let target = s.lineSpeed - mphToMps(2);
      // Slow for a speed restriction early enough.
      const change = s.route.speedLimits.nextChange(front, 1);
      if (change && change.value < target) {
        target = Math.min(target, Math.sqrt(change.value ** 2 + 2 * 0.4 * Math.max(0, change.position - front - 50)));
      }
      const next = s.nextSignal;
      if (next && next.signal.aspect === Aspect.RED) target = Math.min(target, maxSpeedForDistance(next.distance - 25, decel, 1));
      if (front < marker - 0.5) target = Math.min(target, Math.max(0.6, maxSpeedForDistance(marker - front - 0.5, decel, 1)));
      else target = 0;

      const speed = s.train.speed;
      const want = speed > target + 0.3 ? (speed > target + 2 ? 'B3' : 'B2') : speed < target - 1 ? 'P4' : 'OFF';
      if (target === 0 && s.train.isStationary) {
        s.controller.set('B3');
        return { ...input, doorsToggle: s.doors.state === 'closed' };
      }
      s.controller.set(want);
      return input;
    };

    const events = drive(sim, 900, driver, (s) => s.result !== null);
    expect(sim.result).not.toBeNull();
    expect(types(events)).not.toContain('spad');
    expect(types(events)).not.toContain('penalty');
    expect(Math.abs(sim.result.stopErrorM)).toBeLessThan(10);
    expect(sim.result.score).toBeGreaterThan(800);
  });
});
