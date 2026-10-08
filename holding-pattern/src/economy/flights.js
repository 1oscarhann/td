import { BALANCE } from '../config/balance.js';
import { AIRLINES, PLACES } from '../config/airlines.js';
import { PLANE_TYPES } from '../config/planeTypes.js';
import { pick, rand, randInt, clamp } from '../core/math.js';

const T = BALANCE.time;

// A flight is one rotation: an inbound leg that lands here and an outbound leg
// that leaves on the same aircraft. Times are absolute in-game minutes.
export class Flights {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.list = [];
    this.nextId = 1;
    this.numbers = new Set();
  }

  // in-game minutes from appearing on the radar edge to touching down
  static leadMinutes() {
    const F = BALANCE.flight;
    const sec = (F.radarRadius - F.holdingFixDistance) / F.inboundSpeed + 48;
    return sec * T.gameMinPerSec;
  }

  flightNumber(code) {
    for (let i = 0; i < 200; i++) {
      const n = randInt(50, 449) * 2;
      const key = `${code}${n}`;
      if (!this.numbers.has(key)) {
        this.numbers.add(key);
        return n;
      }
    }
    return randInt(100, 998);
  }

  makeFlight({ airline, cls, sta, contractId = null, std = null }) {
    const a = AIRLINES[airline];
    const type = PLANE_TYPES[cls];
    const n = this.flightNumber(a.code);
    const from = pick(PLACES);
    let to = pick(PLACES);
    if (to === from) to = pick(PLACES);
    const turn = BALANCE.turnaround.scheduledMin[cls] + a.turnaroundAdjMin;
    const lf = () => clamp(rand(a.loadFactor[0], a.loadFactor[1]), 0, 1);
    const f = {
      id: this.nextId++,
      airline,
      airlineName: a.name,
      code: a.code,
      cls,
      className: type.name,
      inNo: `${a.code} ${String(n).padStart(3, '0')}`,
      outNo: `${a.code} ${String(n + 1).padStart(3, '0')}`,
      from,
      to,
      sta,
      std: std ?? sta + turn,
      spawnAt: sta - Flights.leadMinutes() + rand(-BALANCE.schedule.jitterMin, BALANCE.schedule.jitterMin),
      status: 'scheduled',
      planeId: null,
      standId: null,
      arrPax: Math.round(type.seats * lf()),
      depBooked: Math.round(type.seats * lf()),
      depSpawned: 0,
      depBoarded: 0,
      depMissed: 0,
      depHappy: 0,
      landedAt: null,
      pushedAt: null,
      contractId,
    };
    this.list.push(f);
    this.list.sort((x, y) => x.std - y.std);
    this.game.events.emit('flightsChanged');
    return f;
  }

  get(id) {
    return this.list.find((f) => f.id === id);
  }

  // what the current airport can handle
  capableClasses({ ignoreUnlocks = false } = {}) {
    const grid = this.game.grid;
    const maxRunway = Math.max(0, ...grid.runways.map((r) => r.length));
    return Object.values(PLANE_TYPES)
      .filter((t) => (ignoreUnlocks || this.game.rating.isUnlocked(t.id)) && maxRunway >= t.runway && grid.stands.some((s) => BALANCE.stands.fits[s.size].includes(t.id)))
      .map((t) => t.id);
  }

  airlinesFor(cls) {
    const stars = this.game.rating.value;
    return Object.values(AIRLINES).filter((a) => a.classes.includes(cls) && stars >= a.minRating - 0.001);
  }

  makeDebugFlight(anyClass) {
    const classes = this.capableClasses({ ignoreUnlocks: anyClass });
    if (!classes.length) return null;
    const cls = pick(classes);
    let airlines = this.airlinesFor(cls);
    if (!airlines.length || anyClass) airlines = Object.values(AIRLINES).filter((a) => a.classes.includes(cls));
    const a = pick(airlines);
    const now = this.game.clock.abs;
    const f = this.makeFlight({ airline: a.id, cls, sta: now + Flights.leadMinutes() });
    f.spawnAt = now;
    f.status = 'inbound';
    f.debug = true;
    return f;
  }

  update() {
    const now = this.game.clock.abs;
    for (const f of this.list) {
      if (f.status === 'scheduled' && now >= f.spawnAt) {
        f.status = 'inbound';
        this.game.planes.spawnInbound(f);
      }
    }
  }
}
