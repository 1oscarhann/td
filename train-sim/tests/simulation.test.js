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
 * @param {number} [o.holdS] how long the train ahead waits before leaving
 * @param {string} [o.dsdMode]
 * @param {any} [o.env]
 */
function makeSim({ holdS = 30, dsdMode = 'off', env = {}, crossings = true } = {}) {
  const data = routeData();
  data.traffic[0].holdS = holdS;
  if (!crossings) data.levelCrossings = [];
  return new Simulation(new Route(data), { settings: { ...DEFAULT_SETTINGS, dsdMode: /** @type {any} */ (dsdMode), failures: 'off' }, ...env });
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

/** Shut the doors and wait for them to lock. */
function closeDoors(sim) {
  drive(sim, DT, { doorsToggle: true });
  drive(sim, 6);
}

describe('Simulation', () => {
  it('starts at Platform A with doors open, brakes on, and TT1 red behind the train ahead', () => {
    const sim = makeSim();
    expect(sim.controller.notch).toBe('B3');
    expect(sim.player.front).toEqual({ track: 'main/UP', s: 320 });
    expect(sim.doors.state).toBe('open');
    drive(sim, 0.5);
    expect(sim.ai).toHaveLength(1);
    expect(sim.signalling.aspectOf('TT1')).toBe(Aspect.RED);
    expect(sim.nextSignal).toMatchObject({ signal: { id: 'TT1' }, distance: 2180 });
  });

  it('steps TT1 through Y, YY and G as the train ahead pulls away', () => {
    const sim = makeSim({ holdS: 1, crossings: false });
    const seen = [];
    drive(sim, 600, {}, (s) => {
      const a = s.signalling.aspectOf('TT1');
      if (seen[seen.length - 1] !== a) seen.push(a);
      return a === Aspect.GREEN;
    });
    expect(seen).toEqual([Aspect.RED, Aspect.YELLOW, Aspect.DOUBLE_YELLOW, Aspect.GREEN]);
  });

  it('keeps TT1 at red until Test Lane barriers are down and proved, then clears it', () => {
    const sim = makeSim({ holdS: 1 });
    const lc = sim.crossings.byId.get('TLANE');
    expect(lc.protectingSignals).toEqual(['TT1', 'TD2']);
    drive(sim, 200);
    expect(lc.state).toBe('open'); // nobody needs it: the player is still loading
    expect(sim.signalling.aspectOf('TT1')).toBe(Aspect.RED);
    closeDoors(sim); // departure time has passed, so this gives the right away and calls the crossing
    let clearedWhileUnsafe = false;
    drive(sim, 600, {}, (s) => {
      if (s.signalling.aspectOf('TT1') !== Aspect.RED && !lc.safe) clearedWhileUnsafe = true;
      return s.signalling.aspectOf('TT1') === Aspect.GREEN;
    });
    expect(clearedWhileUnsafe).toBe(false);
  });

  it('cuts traction while the doors are open or the DRA is set', () => {
    const sim = makeSim();
    const events = drive(sim, DT, { notchSteps: 8 });
    expect(sim.controller.notch).toBe('P4');
    expect(types(events)).toContain('traction-inhibited');
    drive(sim, 3);
    expect(sim.player.speed).toBe(0);
    drive(sim, DT, { draToggle: true });
    closeDoors(sim);
    expect(sim.doors.state).toBe('closed');
    drive(sim, 3);
    expect(sim.player.speed).toBe(0); // DRA still holding it
    drive(sim, DT, { draToggle: true });
    drive(sim, 5);
    expect(sim.player.speed).toBeGreaterThan(0);
  });

  it('refuses to open the doors on the move or away from a platform', () => {
    const sim = makeSim();
    closeDoors(sim);
    sim.controller.set('P4');
    drive(sim, 25);
    const events = drive(sim, DT, { doorsToggle: true });
    expect(sim.doors.state).toBe('closed');
    expect(events.at(-1)?.text).toMatch(/at a stand/);
  });

  it('gives the right away only after departure time with doors shut, and records starting without it', () => {
    const sim = makeSim();
    closeDoors(sim);
    expect(sim.journey.current.raGiven).toBe(false); // too early: 90 s before departure
    sim.controller.set('P4');
    const events = drive(sim, 10);
    expect(types(events)).toContain('no-right-away');
  });

  /** Power up to `mph`, then coast. */
  const cruise = (/** @type {number} */ mph, extra = {}) => (/** @type {Simulation} */ s) => {
    s.controller.set(s.player.speed < mphToMps(mph) ? 'P4' : 'OFF');
    return extra;
  };

  it('TPWS overspeed sensor stops a train charging at a red signal before it gets there', () => {
    const sim = makeSim({ holdS: 9999 }); // the train ahead never leaves, so TT1 stays red
    closeDoors(sim);
    const events = drive(sim, 400, cruise(75, { awsAck: true }), (s) => s.penalty !== null && s.player.isStationary);
    expect(types(events)).toContain('tpws-oss');
    expect(sim.penalty).toBe('oss');
  });

  it('a SPAD: AWS horn, TPWS emergency brake, and no reset until the signaller says so', () => {
    const sim = makeSim({ holdS: 9999 });
    closeDoors(sim);
    // 40 mph is under the overspeed sensor's set speed, but too fast to stop if you don't brake.
    const events = drive(sim, 400, (s) => ({ ...cruise(40)(s), awsAck: s.aws.hornSounding }), (s) => s.penalty !== null && s.player.isStationary);
    expect(types(events)).toEqual(expect.arrayContaining(['aws-horn', 'aws-ack', 'spad', 'penalty']));
    expect(sim.stats.spads).toBe(1);
    expect(sim.penalty).toBe('tpws');
    sim.controller.set('B3');
    const refused = drive(sim, DT, { awsAck: true });
    expect(refused.at(-1)?.text).toMatch(/call the signaller/);
    drive(sim, DT, { radio: true });
    const reply = drive(sim, 8);
    expect(types(reply)).toContain('signaller');
    expect(sim.authority?.kind).toBe('caution');
    const reset = drive(sim, DT, { awsAck: true });
    expect(types(reset)).toContain('penalty-reset');
  });

  it('applies the emergency brake if an AWS warning is ignored', () => {
    const sim = makeSim({ holdS: 9999 });
    closeDoors(sim);
    const events = drive(sim, 300, cruise(25), (s) => s.penalty !== null);
    expect(types(events)).toContain('aws-horn');
    expect(sim.penalty).toBe('aws');
  });

  it("applies the emergency brake if the dead man's handle is let go on the move", () => {
    const sim = makeSim({ dsdMode: 'hold' });
    closeDoors(sim);
    sim.controller.set('P2');
    drive(sim, 10, { dsdHeld: true });
    expect(sim.penalty).toBeNull();
    drive(sim, 4, { dsdHeld: false });
    expect(sim.penalty).toBe('dsd');
  });

  it('a failed signal: the signaller authorises passing it, the override stops TPWS tripping', () => {
    const sim = makeSim({ holdS: 1 });
    sim.signalling.get('TT3').failed = true;
    closeDoors(sim);
    drive(sim, 120);
    // Teleport-free: drive up to TT3 carefully and stop.
    const events = drive(
      sim,
      900,
      (s) => {
        const next = s.nextSignal;
        const d = next ? next.distance : 9999;
        const red = next?.signal.aspect === Aspect.RED;
        const target = red ? maxSpeedForDistance(Math.max(0, d - 40), 0.5, 1) : mphToMps(40);
        s.controller.set(s.player.speed > target + 0.5 ? 'B3' : s.player.speed < target - 1 ? 'P3' : 'OFF');
        return { awsAck: s.aws.hornSounding };
      },
      (s) => s.player.isStationary && s.nextSignal?.signal.id === 'TT3' && s.nextSignal.distance < 60 && s.time > 200,
    );
    expect(types(events)).not.toContain('spad');
    drive(sim, DT, { radio: true });
    drive(sim, 8);
    expect(sim.authority).toMatchObject({ kind: 'pass-at-danger', signalId: 'TT3' });
    drive(sim, DT, { tso: true }); // the override lasts 20 s, so press it just before moving off
    sim.controller.set('P3');
    const passing = drive(sim, 60, { awsAck: true }, (s) => s.nextSignal?.signal.id === 'TT4');
    expect(types(passing)).toContain('passed-at-danger');
    expect(types(passing)).toContain('tpws-override');
    expect(sim.stats.spads).toBe(0);
    expect(sim.penalty).toBeNull();
  });

  it('wheels slide on leaf mulch in the wet', () => {
    const data = routeData();
    data.leafZones = [{ line: 'main', from: 0, to: 8500 }];
    const sim = new Simulation(new Route(data), { settings: { ...DEFAULT_SETTINGS, dsdMode: 'off', failures: 'off' }, weather: 'rain', season: 'autumn' });
    closeDoors(sim);
    sim.controller.set('P4');
    const events = drive(sim, 5);
    expect(types(events)).toContain('wheel-slip');
  });

  it('a careful driver completes the run', () => {
    const sim = makeSim({ holdS: 20 });
    const decel = 0.5;
    const driver = (/** @type {Simulation} */ s) => {
      const input = { awsAck: s.aws.hornSounding, hornHigh: false, doorsToggle: false };
      const call = s.journey.current;
      // At the origin: shut the doors at departure time and wait for the right away.
      if (call?.status === 'arrived') {
        if (s.doors.state === 'open' && s.clock >= call.dep - 8) input.doorsToggle = true;
        if (!call.raGiven) {
          s.controller.set('B3');
          return input;
        }
      }
      const front = s.player.front;
      let target = s.lineSpeed - mphToMps(2);
      const change = s.network.nextSpeedChange(front, 3000);
      if (change && change.value < target) target = Math.min(target, Math.sqrt(change.value ** 2 + 2 * 0.4 * Math.max(0, change.distance - 80)));
      for (const { signal, distance } of s.signalling.signalsAhead(front, 3000, 3)) {
        if (signal.aspect === Aspect.RED) {
          target = Math.min(target, maxSpeedForDistance(Math.max(0, distance - 25), decel, 1));
          break;
        }
      }
      if (call?.status === 'pending') {
        const d = s.journey.toStop(call, front);
        target = Math.min(target, d < 0.4 ? 0 : Math.max(0.6, maxSpeedForDistance(d - 0.4, decel, 1)));
        if (s.player.isStationary && d < 1.5 && s.doors.state === 'closed') input.doorsToggle = true;
      }
      // Sound the horn for the footpath crossing.
      input.hornHigh = s.whistlePending.size > 0;
      const speed = s.player.speed;
      s.controller.set(target < 0.05 && speed < 0.2 ? 'B3' : speed > target + 2 ? 'B3' : speed > target + 0.3 ? 'B2' : speed < target - 1 ? 'P4' : 'OFF');
      return input;
    };
    const events = drive(sim, 1500, driver, (s) => s.result !== null);
    expect(sim.result).not.toBeNull();
    expect(types(events)).not.toContain('spad');
    expect(types(events)).not.toContain('penalty');
    expect(sim.stats.whistleMissed).toBe(0);
    const arrival = sim.journey.calls.at(-1);
    expect(Math.abs(arrival.stopErrorM)).toBeLessThan(5);
    expect(sim.result.score).toBeGreaterThan(900);
  });
});
