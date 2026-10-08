import { BALANCE } from '../config/balance.js';
import { T } from '../world/grid.js';
import { S } from '../planes/states.js';
import { Plane, resetPlaneIds } from '../planes/plane.js';
import { PAX_STATE } from '../passengers/passengerManager.js';

export const SAVE_VERSION = 1;
const KEYS = { auto: BALANCE.autosaveKey, manual: `${BALANCE.autosaveKey}-manual` };

// Versioned JSON saves in localStorage. Infrastructure, money, the clock,
// rating, contracts and the timetable are saved exactly; moving traffic is
// saved coarsely (airborne planes return to the hold, planes on the ground
// return to their stands) so a save never captures a half-finished manoeuvre.

export function serialize(game) {
  const g = game;
  const grid = g.grid;
  const taxi = [], terminal = [];
  for (let i = 0; i < grid.type.length; i++) {
    if (grid.type[i] === T.TAXI) taxi.push(i);
    else if (grid.type[i] === T.TERMINAL) terminal.push(i);
  }
  const keepFlight = (f) => !((f.status === 'departed' || f.status === 'diverted') && g.clock.abs - (f.pushedAt ?? f.std) > 180);
  const flights = g.flights.list.filter(keepFlight).map((f) => {
    const rest = { ...f };
    delete rest.lounge;
    // passengers already in the terminal come back as people waiting in a lounge
    rest.waitingPax = g.passengers.byFlight.get(f.id) ? [...g.passengers.byFlight.get(f.id)].filter((p) => p.dep && p.state !== PAX_STATE.ANGRY && p.state !== PAX_STATE.LEAVING).length : 0;
    return rest;
  });
  const planes = [...g.planes.values()]
    .filter((p) => ![S.DEPARTED, S.DIVERTED, S.TAKEOFF].includes(p.state))
    .map((p) => ({
      id: p.id,
      flightId: p.flight.id,
      state: p.state,
      x: p.pos.x,
      z: p.pos.z,
      alt: p.alt,
      yaw: p.yaw,
      fuel: p.fuel,
      fuelMax: p.fuelMax,
      standId: p.standId,
      runwayId: p.runwayId,
      holdingTime: p.holdingTime,
      goArounds: p.goArounds,
      spawnedAt: p.spawnedAt,
      ta: p.turnaround ? { phase: p.turnaround.phase, paxOnboard: p.turnaround.paxOnboard, deplaneLeft: p.turnaround.deplaneLeft, serviceLeft: p.turnaround.serviceLeft } : null,
    }));
  return {
    format: 'holding-pattern',
    version: SAVE_VERSION,
    savedAt: Date.now(),
    clock: g.clock.toJSON(),
    economy: g.economy.toJSON(),
    rating: g.rating.toJSON(),
    ops: g.ops.toJSON(),
    contracts: g.contracts.toJSON(),
    scheduler: { operational: g.scheduler.operational, firstFlightDone: g.scheduler.firstFlightDone, generatedDays: [...g.scheduler.generatedDays] },
    world: {
      taxi,
      terminal,
      runways: grid.runways.map((r) => ({ id: r.id, sx: r.sx, sz: r.sz, ex: r.ex, ez: r.ez, cost: r.cost })),
      stands: grid.stands.map((s) => ({ id: s.id, tx: s.tx, tz: s.tz, size: s.size, rot: s.rot, gate: s.gate, cost: s.cost, number: s.number })),
      rooms: grid.rooms.map((r) => ({ id: r.id, type: r.type, tx: r.tx, tz: r.tz, rot: r.rot, cost: r.cost })),
      nextId: grid.nextId,
      standNumbers: grid.standNumbers,
    },
    flights,
    flightsNextId: g.flights.nextId,
    planes,
    queue: [...g.atc.queue],
    paxStats: g.passengers.stats,
    camera: { x: g.camera.goal.x, z: g.camera.goal.z, az: g.camera.goal.az, pol: g.camera.goal.pol, dist: g.camera.goal.dist },
    tutorial: g.tutorial?.toJSON?.() ?? null,
    milestones: g.milestones?.toJSON?.() ?? null,
  };
}

// Upgrade older saves step by step to the current version.
const MIGRATIONS = {
  // 1 -> 2: example for the future
};

export function migrate(data) {
  if (!data || data.format !== 'holding-pattern') throw new Error('Not a Holding Pattern save');
  let v = data.version | 0;
  if (v > SAVE_VERSION) throw new Error('Save is from a newer version');
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (step) data = step(data);
    v++;
    data.version = v;
  }
  return data;
}

export function restore(game, raw) {
  const data = migrate(raw);
  const g = game;
  g.resetWorld();
  const grid = g.grid;
  const W = data.world;
  // infrastructure (no charge)
  for (const r of W.runways) grid.placeRunway(r.sx, r.sz, r.ex, r.ez, r.cost, r.id);
  grid.setTiles(W.taxi.map((i) => [grid.txOf(i), grid.tzOf(i)]), T.TAXI);
  grid.setTiles(W.terminal.map((i) => [grid.txOf(i), grid.tzOf(i)]), T.TERMINAL);
  for (const s of W.stands) grid.placeStand(s.tx, s.tz, s.size, s.rot, s.gate, s.cost, s.id, s.number);
  for (const r of W.rooms) grid.placeRoom(r.type, r.tx, r.tz, r.rot, r.cost, r.id);
  grid.nextId = Math.max(grid.nextId, W.nextId || 1);
  grid.standNumbers = W.standNumbers || grid.standNumbers;
  g.graph.refresh();
  g.terminal.refresh();
  // systems
  g.clock.load(data.clock);
  g.economy.load(data.economy);
  g.rating.load(data.rating);
  g.ops.load(data.ops);
  g.contracts.load(data.contracts);
  g.scheduler.operational = data.scheduler.operational;
  g.scheduler.firstFlightDone = data.scheduler.firstFlightDone;
  g.scheduler.generatedDays = new Set(data.scheduler.generatedDays);
  g.flights.list = data.flights.map((f) => ({ ...f, lounge: null }));
  g.flights.nextId = data.flightsNextId;
  for (const f of g.flights.list) g.flights.numbers.add(f.inNo.replace(' ', ''));
  if (data.paxStats) g.passengers.stats = { ...g.passengers.stats, ...data.paxStats };
  // traffic
  resetPlaneIds(Math.max(1, ...data.planes.map((p) => p.id + 1)));
  const byId = new Map(g.flights.list.map((f) => [f.id, f]));
  const front = [];
  for (const sp of data.planes) {
    const f = byId.get(sp.flightId);
    if (!f) continue;
    restorePlane(g, sp, f, front);
  }
  // landing order: anyone who was mid-approach first, then the saved queue
  const order = [...front, ...data.queue.filter((id) => !front.includes(id))];
  g.atc.queue = order.filter((id) => g.planes.has(id) && g.planes.get(id).state !== S.PARKED);
  for (const p of g.planes.values()) if ((p.state === S.HOLDING || p.state === S.INBOUND) && !g.atc.queue.includes(p.id)) g.atc.queue.push(p.id);
  // passengers who were in the terminal wait in a lounge again
  for (const f of g.flights.list) {
    const n = f.waitingPax || 0;
    if (n > 0 && f.status !== 'departed' && f.status !== 'diverted') g.passengers.restoreWaiting(f, n);
    delete f.waitingPax;
  }
  if (data.camera) Object.assign(g.camera.goal, data.camera);
  g.tutorial?.load?.(data.tutorial);
  g.milestones?.load?.(data.milestones);
  g.events.emit('loaded');
  g.events.emit('queueChanged');
  g.events.emit('speed');
}

function restorePlane(g, sp, f, front) {
  const grid = g.grid;
  const stand = sp.standId ? grid.structures.get(sp.standId) : null;
  const airborne = [S.INBOUND, S.HOLDING, S.GO_AROUND, S.APPROACH, S.LANDING].includes(sp.state);
  const p = new Plane(g, f, { id: sp.id });
  p.holdingTime = sp.holdingTime || 0;
  p.goArounds = sp.goArounds || 0;
  p.runwayId = sp.runwayId ?? null;
  p.spawnedAt = g.simTime - 1;
  g.planes.set(p.id, p);
  f.planeId = p.id;
  if (airborne || !stand || (stand.occupiedBy && stand.occupiedBy !== p.id)) {
    // back into the hold (planes mid-approach go first)
    p.spawnAt(sp.x, sp.z, Math.max(sp.alt, 300), sp.yaw, Math.max(sp.fuel, 25));
    p.fuelMax = sp.fuelMax || p.fuel;
    p.setState(sp.state === S.INBOUND ? S.INBOUND : S.HOLDING);
    f.standId = null;
    f.status = 'inbound';
    if (sp.state === S.APPROACH || sp.state === S.LANDING) front.push(p.id);
    return;
  }
  // on the ground: parked at its stand
  p.standId = stand.id;
  const pp = p.parkingPoint(stand);
  p.pos.set(pp.x, 0, pp.z);
  p.alt = 0;
  p.yaw = stand.heading;
  p.v = 0;
  p.gearT = 1;
  p.gearTarget = 1;
  p.rpm = 0;
  stand.occupiedBy = p.id;
  stand.reservedBy = null;
  g.reservations.tryReserve(p.id, [g.graph.standNode(stand.id)?.id].filter((x) => x !== undefined), []);
  p.setState(S.PARKED);
  const ta = g.turnarounds.start(p, stand);
  p.turnaround = ta;
  const was = sp.ta;
  const departing = [S.PUSHBACK, S.TAXI_OUT, S.LINED_UP].includes(sp.state);
  if (departing) {
    ta.deplaneLeft = 0;
    ta.paxOnboard = f.depBoarded;
    ta.serviceLeft = 0;
    ta.boardingOpen = true;
    f.boardingOpenFlag = true;
    ta.next('ready');
  } else if (was) {
    ta.deplaneLeft = was.deplaneLeft ?? ta.deplaneLeft;
    ta.paxOnboard = was.paxOnboard ?? ta.paxOnboard;
    ta.serviceLeft = was.serviceLeft ?? ta.serviceLeft;
    if (was.phase === 'board' || was.phase === 'ready') ta.next('board');
    else if (was.phase === 'service') ta.next('service');
  }
  p.syncModel(0);
}

// ---------------------------------------------------------------------------
export function hasSave(slot = 'auto') {
  try {
    return !!localStorage.getItem(KEYS[slot]);
  } catch {
    return false;
  }
}

export function saveInfo(slot = 'auto') {
  try {
    const raw = localStorage.getItem(KEYS[slot]);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { savedAt: d.savedAt, day: Math.floor((d.clock?.abs ?? 0) / 1440) + 1, money: d.economy?.money, rating: d.rating?.value };
  } catch {
    return null;
  }
}

export function writeSave(game, slot = 'auto') {
  try {
    const data = serialize(game);
    localStorage.setItem(KEYS[slot], JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('[save] could not save', err);
    return false;
  }
}

export function readSave(game, slot = 'auto') {
  try {
    const raw = localStorage.getItem(KEYS[slot]);
    if (!raw) return { ok: false, error: 'No save found' };
    restore(game, JSON.parse(raw));
    return { ok: true };
  } catch (err) {
    console.warn('[save] could not load', err);
    return { ok: false, error: err.message || 'Save could not be read' };
  }
}

export function newestSlot() {
  const a = saveInfo('auto'), m = saveInfo('manual');
  if (!a && !m) return null;
  if (!a) return 'manual';
  if (!m) return 'auto';
  return m.savedAt > a.savedAt ? 'manual' : 'auto';
}
