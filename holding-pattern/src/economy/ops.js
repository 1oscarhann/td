import { BALANCE } from '../config/balance.js';
import { AIRLINES } from '../config/airlines.js';
import { money } from '../core/math.js';

const TA = BALANCE.turnaround;

// Turns what happens at the airport into money, flight statuses, rating
// samples and the end-of-day books.
export class Operations {
  constructor(game) {
    this.game = game;
    this.reset();
    const ev = game.events;
    ev.on('landed', (p) => this.onLanded(p));
    ev.on('pushback', (p) => this.onPushback(p));
    ev.on('takeoff', (p) => this.onTakeoff(p));
    ev.on('diverted', (p) => this.onDiverted(p));
    ev.on('paxBoarded', (f) => this.paxFee(f));
    ev.on('paxExited', (f) => this.paxFee(f));
    ev.on('dayEnd', (day) => this.closeDay(day));
  }

  reset() {
    this.stats = { landings: 0, departures: 0, diversions: 0, goArounds: 0, passengers: 0, onTime: 0, jets: 0 };
    this.today = { landings: 0, departures: 0, diversions: 0, onTime: 0, passengers: 0 };
    this.bankrupt = false;
  }

  mult(f) {
    return AIRLINES[f.airline]?.feeMult ?? 1;
  }

  onLanded(p) {
    const f = p.flight;
    f.landedAt = this.game.clock.abs;
    f.status = 'landed';
    const fee = Math.round(BALANCE.fees.landing[p.cls] * this.mult(f));
    this.game.economy.earn(fee, 'landing fees');
    this.stats.landings++;
    this.today.landings++;
    if (p.cls !== 'small') this.stats.jets++;
    this.game.events.emit('statsChanged', this.stats);
  }

  paxFee(f) {
    this.game.economy.earn(BALANCE.fees.perPassenger * this.mult(f), 'passenger fees', true);
    this.stats.passengers++;
    this.today.passengers++;
    if (this.stats.passengers % 50 === 0) this.game.events.emit('statsChanged', this.stats);
  }

  onPushback(p) {
    const f = p.flight;
    f.pushedAt = this.game.clock.abs;
    f.delayMin = Math.max(0, f.pushedAt - f.std);
    f.onTime = f.delayMin <= TA.onTimeGraceMin;
  }

  onTakeoff(p) {
    const f = p.flight;
    f.status = 'departed';
    this.stats.departures++;
    this.today.departures++;
    if (f.onTime) {
      this.stats.onTime++;
      this.today.onTime++;
    }
    // the flight's score: how happy its passengers were and whether it left on time
    const pax = this.game.passengers;
    let happy = f.depBoarded ? f.depHappy / f.depBoarded : pax.averageHappiness() ?? 75;
    // passengers who missed it drag the score down
    const total = f.depBoarded + f.depMissed;
    if (total) happy = (happy * f.depBoarded + Math.max(0, happy - BALANCE.passengers.missedFlightHit) * f.depMissed) / total;
    f.score = { happiness: happy, onTime: !!f.onTime };
    this.game.rating.flight(f.score);
    this.game.contracts.flightDeparted(f, f.onTime);
    this.game.events.emit('flightDeparted', f);
  }

  onDiverted(p) {
    const f = p.flight;
    f.status = 'diverted';
    this.stats.diversions++;
    this.today.diversions++;
    this.game.rating.diversion();
    this.game.contracts.flightDiverted(f);
    this.game.ui?.toast(`${f.inNo} diverted: out of fuel`, { kind: 'bad', icon: 'fuel', sub: `Lost the landing fee · rating hit` });
  }

  closeDay(day) {
    const g = this.game;
    const sum = g.economy.closeDay(day, g.grid);
    sum.ops = this.today;
    this.today = { landings: 0, departures: 0, diversions: 0, onTime: 0, passengers: 0 };
    g.events.emit('daySummary', sum);
    if (g.economy.money < 0) {
      const left = BALANCE.bankruptcyDays - g.economy.negDays;
      if (left <= 0) {
        this.bankrupt = true;
        g.events.emit('bankrupt', sum);
      } else {
        g.ui?.toast(`You're in the red (${money(g.economy.money)})`, { kind: 'bad', icon: 'coin', sub: `${left} more day${left === 1 ? '' : 's'} in debt and the airport goes bankrupt`, ms: 7000 });
      }
    }
  }

  toJSON() {
    return { stats: this.stats, today: this.today };
  }

  load(d) {
    this.stats = { ...this.stats, ...(d.stats || {}) };
    this.today = { ...this.today, ...(d.today || {}) };
  }
}
