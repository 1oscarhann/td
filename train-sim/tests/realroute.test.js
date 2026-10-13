import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Route } from '../src/route/route.js';
import { Simulation } from '../src/sim/simulation.js';
import { emptyInput } from '../src/core/input.js';
import { DEFAULT_SETTINGS } from '../src/core/settings.js';
import { autopilot } from './autopilot.js';

const data = JSON.parse(readFileSync(new URL('../public/data/routes/west-sussex/route.json', import.meta.url), 'utf8'));

/** Drive a whole service with the autopilot, AI traffic and all. */
function driveService(serviceId, { seconds = 3600, ...opts } = {}) {
  const sim = new Simulation(new Route(data), { settings: { ...DEFAULT_SETTINGS, failures: 'off' }, serviceId, rng: () => 0.5, ...opts });
  const events = [];
  const dt = 1 / 30;
  for (let t = 0; t < seconds && !sim.result; t += dt) {
    sim.applyInput({ ...emptyInput(), ...autopilot(sim) });
    sim.step(dt);
    events.push(...sim.drainEvents());
  }
  return { sim, events, types: events.map((e) => e.type) };
}

describe('the real route: West Sussex', () => {
  it('is a valid route with the junctions, stations and services we expect', () => {
    const route = new Route(data);
    expect([...route.network.lines.keys()]).toEqual(['main', 'bognor', 'littlehampton', 'coast']);
    expect([...route.network.points.keys()].sort()).toEqual(['AJ-D', 'AJ-U', 'BJ-D', 'BJ-U', 'FJ-D', 'FJ-U']);
    expect(route.services.map((s) => s.id)).toEqual(expect.arrayContaining(['2H14', '2H35', '2H47']));
    const main = route.network.line('main');
    expect(main.length).toBeGreaterThan(24000);
    expect(main.length).toBeLessThan(27000);
  });

  it.each(['2H14', '2H35', '2H47'])('service %s can be driven start to finish through the traffic', (id) => {
    const { sim, types } = driveService(id);
    expect(sim.result?.ended).toBeUndefined();
    expect(sim.result).not.toBeNull();
    expect(types).not.toContain('spad');
    expect(types).not.toContain('collision');
    expect(sim.journey.calls.every((c) => c.status !== 'missed')).toBe(true);
  });

  it('generated signals stand clear of the platforms on their own track', () => {
    const inside = data.signals.filter((sig) => data.platforms.some((p) => p.line === sig.line && p.track === sig.track && sig.position > p.from && sig.position < p.to));
    expect(inside.map((s) => s.id)).toEqual([]);
  });

  it('the Barnham Down starter carries the Bognor feather, lit for 2H47', () => {
    const starter = data.signals.find((s) => s.feather?.points === 'BJ-D');
    expect(starter.kind).toBe('starting');
    const sim = new Simulation(new Route(data), { settings: { ...DEFAULT_SETTINGS, failures: 'off' }, serviceId: '2H47', startCall: 3, rng: () => 0.5 });
    expect(sim.journey.current?.station).toBe('BAA');
    let lit = null;
    for (let t = 0; t < 300 && !lit && !sim.result; t += 1 / 30) {
      sim.applyInput({ ...emptyInput(), ...autopilot(sim) });
      sim.step(1 / 30);
      sim.drainEvents();
      lit = sim.signalling.signals.get(starter.id).featherLit || null;
    }
    expect(lit).toBe('left');
  });

  it('routes 2H47 through Barnham Junction onto the Bognor branch', () => {
    const { sim } = driveService('2H47');
    expect(sim.player.front.track).toBe('bognor/DOWN');
  });
});
