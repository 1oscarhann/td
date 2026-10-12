/**
 * Timetables for the generated route. Running times come from driving each service with the
 * game's own AI driver over the real network (signals, junctions and crossings working), then
 * adding a 5 % performance allowance and rounding to the half minute, like a real working
 * timetable. Headcodes and departure times are made up (A).
 */
import { Network } from '../../src/route/network.js';
import { Signalling } from '../../src/signals/signalling.js';
import { Interlocking } from '../../src/signals/interlocking.js';
import { CrossingManager } from '../../src/sim/crossings.js';
import { Vehicle } from '../../src/sim/vehicle.js';
import { AIDriver } from '../../src/sim/aiDriver.js';
import { CLASS_377_4 } from '../../src/physics/trainSpec.js';
import { formatClock, parseClock } from '../../src/core/units.js';

/** Services the player can drive. */
export const SERVICES = [
  {
    id: '2H14',
    name: 'Chichester → Amberley',
    description: 'The full route: West Coastway to Ford, over the Arun, through Arundel Junction and up the Arun Valley.',
    dep: '09:12:00',
    plan: { 'FJ-U': 'N', 'AJ-U': 'N' },
    calls: ['CCH-UP', 'BAA-UP', 'FOD-UP', 'ARU-UP', 'AMY-UP'],
  },
  {
    id: '2H35',
    name: 'Amberley → Chichester',
    description: 'The same line back: down the Arun Valley, through Arundel Junction, Ford and Barnham to Chichester.',
    dep: '09:35:00',
    plan: { 'BJ-D': 'N' },
    calls: ['AMY-DOWN', 'ARU-DOWN', 'FOD-DOWN', 'BAA-DOWN', 'CCH-DOWN'],
  },
  {
    id: '2H47',
    name: 'Amberley → Bognor Regis',
    description: 'Routed through Barnham Junction onto the Bognor branch, ending at the buffer stops.',
    dep: '09:47:00',
    plan: { 'BJ-D': 'R' },
    calls: ['AMY-DOWN', 'ARU-DOWN', 'FOD-DOWN', 'BAA-DOWN', 'BOG-DOWN'],
  },
  {
    id: '2C09',
    name: 'Chichester → Ford (short run)',
    description: 'The MVP section: flat coastal plain, five level crossings, two stops.',
    dep: '09:09:00',
    plan: { 'FJ-U': 'N' },
    calls: ['CCH-UP', 'BAA-UP', 'FOD-UP'],
  },
  {
    id: '2B30',
    name: 'Bognor Regis → Amberley',
    description: 'Off the Bognor branch through Barnham Junction (trailing), then up to Amberley.',
    dep: '09:30:00',
    plan: { 'FJ-U': 'N', 'AJ-U': 'N' },
    calls: ['BOG-UP', 'BAA-UP', 'FOD-UP', 'ARU-UP', 'AMY-UP'],
  },
];

/**
 * The repeating pattern of other trains, minutes past each hour (A: loosely modelled on
 * Southern's off-peak pattern: coastway stoppers each way, Arun Valley trains to and from
 * Bognor and Chichester).
 * @param {any} route
 */
export function trafficPattern(route) {
  const main = route.lines.find((/** @type {any} */ l) => l.id === 'main');
  const coast = route.lines.find((/** @type {any} */ l) => l.id === 'coast');
  const lenOf = (/** @type {any} */ l) => {
    let len = 0;
    const p = l.alignment.points;
    for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    return len;
  };
  const mainLen = lenOf(main);
  const coastLen = lenOf(coast);
  const westUp = { line: 'main', track: 'UP', position: 150 };
  const northDown = { line: 'main', track: 'DOWN', position: Math.round(mainLen - 150) };
  const eastUp = { line: 'coast', track: 'UP', position: Math.round(coastLen - 150) };
  const coastUp = (/** @type {string} */ id, /** @type {string} */ at) => ({
    id,
    name: 'Coastway stopper to Brighton',
    appear: at,
    entry: westUp,
    speedMph: 40,
    plan: { 'FJ-U': 'N', 'AJ-U': 'R' },
    calls: [{ platform: 'CCH-UP' }, { platform: 'BAA-UP' }, { platform: 'FOD-UP' }],
  });
  const coastDown = (/** @type {string} */ id, /** @type {string} */ at) => ({
    id,
    name: 'Coastway stopper to Portsmouth',
    appear: at,
    entry: eastUp,
    speedMph: 60,
    plan: { 'BJ-D': 'N' },
    calls: [{ platform: 'FOD-DOWN' }, { platform: 'BAA-DOWN' }, { platform: 'CCH-DOWN' }],
  });
  return [
    coastUp('1W03', '00:03:00'),
    coastUp('1W33', '00:33:00'),
    coastDown('1E18', '00:18:00'),
    coastDown('1E48', '00:48:00'),
    {
      id: '2V08',
      name: 'Arun Valley train to Bognor Regis',
      appear: '00:08:00',
      entry: northDown,
      speedMph: 60,
      plan: { 'BJ-D': 'R' },
      calls: ['AMY-DOWN', 'ARU-DOWN', 'FOD-DOWN', 'BAA-DOWN', 'BOG-DOWN'].map((platform) => ({ platform })),
      terminates: true,
    },
    {
      id: '2V38',
      name: 'Arun Valley train to Portsmouth',
      appear: '00:38:00',
      entry: northDown,
      speedMph: 60,
      plan: { 'BJ-D': 'N' },
      calls: ['AMY-DOWN', 'ARU-DOWN', 'FOD-DOWN', 'BAA-DOWN', 'CCH-DOWN'].map((platform) => ({ platform })),
    },
    {
      id: '2U25',
      name: 'Bognor Regis to London Victoria',
      appear: '00:25:00',
      entry: null, // starts in the Bognor platform: filled in below
      startsAtPlatform: 'BOG-UP',
      speedMph: 0,
      plan: { 'FJ-U': 'N', 'AJ-U': 'N' },
      calls: ['BAA-UP', 'FOD-UP', 'ARU-UP', 'AMY-UP'].map((platform) => ({ platform })),
    },
    {
      id: '2U45',
      name: 'Portsmouth to London Victoria',
      appear: '00:45:00',
      entry: westUp,
      speedMph: 40,
      plan: { 'FJ-U': 'N', 'AJ-U': 'N' },
      calls: ['CCH-UP', 'BAA-UP', 'FOD-UP', 'ARU-UP', 'AMY-UP'].map((platform) => ({ platform })),
    },
  ];
}

/**
 * Drive a service headless and return arrival times (s after departure) at each stop.
 * @param {any} route
 * @param {string[]} platformIds
 * @param {Record<string, 'N' | 'R'>} plan
 */
export function runningTimes(route, platformIds, plan) {
  const network = new Network(route);
  const signalling = new Signalling(network, route.signals);
  const interlocking = new Interlocking(network, signalling);
  const crossings = new CrossingManager(network, signalling, route.levelCrossings);
  const platforms = new Map(route.platforms.map((/** @type {any} */ p) => [p.id, p]));
  const stopFor = (/** @type {string} */ id) => {
    const p = platforms.get(id);
    const m = p.stopMarkers.find((/** @type {any} */ x) => x.cars === 4) ?? p.stopMarkers[0];
    return { track: `${p.line}/${p.track}`, s: m.position };
  };
  const vehicle = new Vehicle(network, { id: 'timing', spec: CLASS_377_4, front: stopFor(platformIds[0]), notch: 'OFF', plan });
  const driver = new AIDriver(vehicle, {
    calls: platformIds.slice(1).map((id) => ({ stop: stopFor(id), dep: -Infinity, station: id })),
    terminates: true,
    dwellS: 0,
  });
  const dt = 1 / 20;
  /** @type {number[]} */
  const arrivals = [];
  let time = 0;
  let lastState = driver.state;
  for (let step = 0; step < 20 * 3600 && driver.state !== 'finished'; step++) {
    time += dt;
    if (step % 10 === 0) interlocking.update(time, [vehicle.routing()]);
    crossings.update(dt, [vehicle]);
    /** @type {Map<string, [number, number][]>} */
    const occ = new Map();
    for (const p of vehicle.body()) occ.set(p.track, [...(occ.get(p.track) ?? []), [Math.min(p.from, p.to), Math.max(p.from, p.to)]]);
    signalling.update(occ, [vehicle.front]);
    driver.update(dt, 0, signalling, () => null);
    vehicle.step(dt, { powerDemand: vehicle.controller.powerDemand, brakeDemand: vehicle.controller.brakeDemand });
    if (driver.state === 'dwelling' && lastState === 'running') arrivals.push(time);
    lastState = driver.state;
  }
  if (arrivals.length !== platformIds.length - 1) throw new Error(`Timing run for ${platformIds.join(' → ')} only reached ${arrivals.length} stops`);
  return arrivals;
}

const DWELL_S = 60; // booked time at each intermediate stop, doors included (A)
const ALLOWANCE = 1.05; // performance allowance (A)
const roundUp30 = (/** @type {number} */ s) => Math.ceil(s / 30) * 30;

/**
 * @param {any} route the assembled route (without services)
 * @returns {{ services: any[], traffic: any[] }}
 */
export function timetableServices(route) {
  const services = SERVICES.map((svc) => {
    const arrivals = runningTimes(route, svc.calls, svc.plan);
    const calls = [{ platform: svc.calls[0], dep: svc.dep }];
    let clock = parseClock(svc.dep);
    let prevArrRun = 0;
    svc.calls.slice(1).forEach((platform, i) => {
      // Leg time: from the previous stop's departure (the run includes dwell 0 at stops).
      const leg = arrivals[i] - prevArrRun;
      prevArrRun = arrivals[i];
      const arr = clock + roundUp30(leg * ALLOWANCE + 15);
      const last = i === svc.calls.length - 2;
      calls.push(last ? { platform, arr: formatClock(arr) } : { platform, arr: formatClock(arr), dep: formatClock(arr + DWELL_S) });
      clock = arr + DWELL_S;
    });
    console.log(`  ${svc.id} ${svc.name}: ${calls.map((c) => `${c.platform.split('-')[0]} ${(c.dep ?? c.arr).slice(0, 5)}`).join(', ')}`);
    return { id: svc.id, headcode: svc.id, name: svc.name, description: svc.description, plan: svc.plan, calls };
  });

  const platforms = new Map(route.platforms.map((/** @type {any} */ p) => [p.id, p]));
  const traffic = trafficPattern(route).map((t) => {
    if (!t.startsAtPlatform) return t;
    const p = platforms.get(t.startsAtPlatform);
    const m = p.stopMarkers.find((/** @type {any} */ x) => x.cars === 4) ?? p.stopMarkers[0];
    return { ...t, entry: { line: p.line, track: p.track, position: m.position }, startsAtPlatform: true };
  });
  return { services, traffic };
}
