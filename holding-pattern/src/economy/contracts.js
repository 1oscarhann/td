import { BALANCE } from '../config/balance.js';
import { AIRLINES } from '../config/airlines.js';
import { PLANE_TYPES } from '../config/planeTypes.js';
import { pick, randInt, money } from '../core/math.js';

const CT = BALANCE.contracts;

// Airlines offer multi-day deals ("Skylark wants 6 flights a day for 7 days").
// Accepted contracts add flights to the timetable and pay bonuses for
// departures that leave on time.
export class Contracts {
  constructor(game) {
    this.game = game;
    this.reset();
    game.events.on('hour', (h, day) => {
      if (h === CT.offerHour) this.makeOffers(day);
      this.expireOffers();
    });
    game.events.on('dayEnd', (day) => this.closeFinished(day));
  }

  reset() {
    this.offers = [];
    this.active = [];
    this.history = [];
    this.nextId = 1;
  }

  makeOffers(day) {
    const g = this.game;
    const stars = g.rating.value;
    const count = 1 + (stars >= 3 ? 1 : 0) + (stars >= 4.5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const airlines = Object.values(AIRLINES).filter((a) => stars >= a.minRating - 0.001);
      const a = pick(airlines);
      const classes = a.classes.filter((c) => g.rating.isUnlocked(c));
      if (!classes.length) continue;
      const cls = pick(classes);
      const perDay = randInt(CT.perDay[0], CT.perDay[1] + (stars >= 3 ? 2 : 0));
      const days = randInt(CT.days[0], CT.days[1]);
      const mult = a.feeMult;
      this.offers.push({
        id: this.nextId++,
        airline: a.id,
        cls,
        perDay,
        days,
        bonusPerFlight: Math.round(CT.bonusPerFlight[cls] * mult),
        completionBonus: Math.round(CT.completionBonus[cls] * mult * (days / 5)),
        expiresAt: g.clock.abs + CT.expireHours * 60,
        madeOn: day,
      });
    }
    if (this.offers.length) g.events.emit('contractOffer', this.offers[this.offers.length - 1]);
  }

  expireOffers() {
    const now = this.game.clock.abs;
    this.offers = this.offers.filter((o) => o.expiresAt > now);
  }

  // what the airport is missing to fly this contract
  requirement(o) {
    const g = this.game;
    const t = PLANE_TYPES[o.cls];
    const maxRunway = Math.max(0, ...g.grid.runways.map((r) => r.length));
    const needs = [];
    if (maxRunway < t.runway) needs.push(`a ${t.runway}-tile runway`);
    if (!g.grid.stands.some((s) => BALANCE.stands.fits[s.size].includes(o.cls))) needs.push(`a ${t.stand} stand`);
    return needs.length ? `Needs ${needs.join(' and ')}` : null;
  }

  accept(id) {
    const g = this.game;
    const i = this.offers.findIndex((o) => o.id === id);
    if (i < 0) return;
    const o = this.offers.splice(i, 1)[0];
    const day = g.clock.day;
    // starts today if there's enough of the day left, otherwise tomorrow
    const startDay = g.clock.hour < 15 ? day : day + 1;
    const c = { ...o, startDay, endDay: startDay + o.days - 1, flown: 0, onTime: 0, diverted: 0 };
    this.active.push(c);
    if (startDay === day) {
      // today's share, from a couple of hours out
      const from = g.clock.minute + 120;
      const frac = Math.max(0, (BALANCE.schedule.lastHour * 60 - from) / ((BALANCE.schedule.lastHour - BALANCE.schedule.firstHour) * 60));
      g.scheduler.place(c.perDay, (day - 1) * 1440 + from, (day - 1) * 1440 + BALANCE.schedule.lastHour * 60, () => ({ airline: c.airline, cls: c.cls, contractId: c.id }), frac);
    }
    g.events.emit('contractAccepted', c);
  }

  decline(id) {
    this.offers = this.offers.filter((o) => o.id !== id);
    this.game.events.emit('contractsChanged');
  }

  activeOn(day) {
    return this.active.filter((c) => !c.done && day >= c.startDay && day <= c.endDay);
  }

  get(id) {
    return this.active.find((c) => c.id === id);
  }

  // a contract flight left: pay the on-time bonus
  flightDeparted(f, onTime) {
    const c = this.get(f.contractId);
    if (!c) return;
    c.flown++;
    if (onTime) {
      c.onTime++;
      this.game.economy.earn(c.bonusPerFlight, 'contracts');
    }
  }

  flightDiverted(f) {
    const c = this.get(f.contractId);
    if (c) {
      c.flown++;
      c.diverted++;
    }
  }

  closeFinished(day) {
    const g = this.game;
    for (const c of this.active) {
      if (c.done || day < c.endDay) continue;
      c.done = true;
      const rate = c.flown ? c.onTime / c.flown : 0;
      const name = AIRLINES[c.airline].name;
      if (rate >= CT.completionOnTime && c.flown > 0) {
        g.economy.earn(c.completionBonus, 'contracts');
        g.events.emit('contractCompleted', c, true, `${name} contract complete: ${Math.round(rate * 100)}% on time, +${money(c.completionBonus)}`);
      } else {
        g.events.emit('contractCompleted', c, false, `${name} contract ended: only ${Math.round(rate * 100)}% on time, no bonus`);
      }
      this.history.push(c);
    }
    this.active = this.active.filter((c) => !c.done);
  }

  toJSON() {
    return { offers: this.offers, active: this.active, history: this.history.slice(-20), nextId: this.nextId };
  }

  load(d) {
    this.offers = d.offers || [];
    this.active = d.active || [];
    this.history = d.history || [];
    this.nextId = d.nextId || 1;
  }
}
