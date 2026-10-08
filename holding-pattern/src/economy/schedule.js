import { BALANCE } from '../config/balance.js';
import { PLANE_TYPES } from '../config/planeTypes.js';
import { rand, weightedPick, clamp } from '../core/math.js';

const SC = BALANCE.schedule;

// Builds each day's timetable from what the airport can handle (stand sizes,
// runway length, rating), plus flights from accepted contracts.
export class Scheduler {
  constructor(game) {
    this.game = game;
    this.operational = false;
    this.firstFlightDone = false;
    this.generatedDays = new Set();
    game.events.on('dayStart', (day) => this.generateDay(day));
    game.events.on('gridChanged', () => (this.checkT = 0));
    this.checkT = 0;
  }

  reset() {
    this.operational = false;
    this.firstFlightDone = false;
    this.generatedDays.clear();
    this.checkT = 0;
  }

  // Is there a runway, a stand that fits something, and a taxi route between them?
  checkOperational() {
    const g = this.game;
    if (!g.flights.capableClasses().length) return false;
    g.graph.refresh();
    const starts = [];
    for (const r of g.grid.runways) for (const a of g.graph.accessNodes(r.id)) starts.push(a.node.id);
    if (!starts.length) return false;
    const seen = new Set(starts);
    const q = [...starts];
    while (q.length) {
      const c = q.pop();
      const n = g.graph.nodes.get(c);
      if (n.kind === 'stand') return true;
      for (const e of n.edges) {
        if (!seen.has(e.to)) {
          seen.add(e.to);
          q.push(e.to);
        }
      }
    }
    return false;
  }

  update(dt) {
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 2;
    const ok = this.checkOperational();
    if (ok && !this.operational) {
      this.operational = true;
      this.game.events.emit('operational');
      if (!this.firstFlightDone) this.scheduleFirstFlight();
    }
    this.operational = ok;
  }

  // the very first flight: a little Puffin prop, soon after opening
  scheduleFirstFlight() {
    this.firstFlightDone = true;
    const g = this.game;
    const now = g.clock.abs;
    const cls = g.flights.capableClasses()[0] || 'small';
    const sta = now + SC.firstFlightDelayMin + g.flights.constructor.leadMinutes();
    const f = g.flights.makeFlight({ airline: 'puffin', cls, sta });
    f.first = true;
    g.events.emit('firstFlight', f);
    // and the rest of today's timetable from a couple of hours out
    this.generateDay(g.clock.day, g.clock.minute + 150, true);
  }

  // flights for one day; `fromMinute` limits a part-day (when opening mid-day)
  generateDay(day, fromMinute = 0, force = false) {
    const g = this.game;
    if (this.generatedDays.has(day) && !force) return;
    this.generatedDays.add(day);
    const dayStart = (day - 1) * 1440;
    const start = dayStart + Math.max(fromMinute, SC.firstHour * 60);
    const end = dayStart + SC.lastHour * 60;
    let made = 0;
    // contract flights first
    for (const c of g.contracts.activeOn(day)) {
      made += this.place(c.perDay, start, end, () => ({ airline: c.airline, cls: c.cls, contractId: c.id }), fromMinute > 0 ? (end - start) / ((SC.lastHour - SC.firstHour) * 60) : 1);
    }
    if (!this.operational && !this.checkOperational()) return made;
    const classes = g.flights.capableClasses();
    if (!classes.length) return made;
    const stars = g.rating.value;
    let n = Math.round(SC.baseFlights + SC.perStar * (stars - 1));
    // can't schedule more than the stands can turn round (contract flights count too)
    const cap = g.grid.stands.length * SC.maxPerStandPerDay - made;
    n = Math.max(0, Math.min(n, cap));
    const pickFlight = () => {
      const cls = weightedPick(classes, (c) => {
        const t = PLANE_TYPES[c];
        // bigger planes become more common as the rating climbs
        return 1 + Math.max(0, stars - t.unlock) * 1.4 * (t.wake + 1);
      });
      const airlines = g.flights.airlinesFor(cls);
      const a = weightedPick(airlines, (al) => (al.id === 'puffin' ? 1.2 : 1));
      return { airline: a?.id || 'puffin', cls };
    };
    const frac = fromMinute > 0 ? clamp((end - start) / ((SC.lastHour - SC.firstHour) * 60), 0, 1) : 1;
    made += this.place(n, start, end, pickFlight, frac);
    g.events.emit('scheduleGenerated', day, made);
    return made;
  }

  // spread `count` (scaled by frac) arrivals across the window with morning and
  // evening banks
  place(count, start, end, make, frac = 1) {
    const g = this.game;
    const n = Math.round(count * frac);
    if (n <= 0 || end - start < 45) return 0;
    for (let i = 0; i < n; i++) {
      let u = (i + rand(0.15, 0.85)) / n;
      u = u + 0.08 * Math.sin(u * Math.PI * 2); // gentle banks
      const sta = start + clamp(u, 0, 1) * (end - start);
      g.flights.makeFlight({ ...make(), sta: Math.round(sta) });
    }
    return n;
  }
}
