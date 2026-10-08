import { BALANCE } from '../config/balance.js';
import { PLANE_TYPES } from '../config/planeTypes.js';
import { clamp } from '../core/math.js';

// Airport rating, 1-5 stars. Every completed (or diverted) flight pulls the
// rating toward that flight's score, so it climbs with sustained good service.
export class Rating {
  constructor(events) {
    this.events = events;
    this.reset();
  }

  reset() {
    this.value = BALANCE.rating.start;
    this.samples = []; // recent flight scores for the breakdown
    this.happiness = [];
    this.onTime = [];
    this.diversions = [];
    this.unlocked = new Set(['small']);
  }

  stars() {
    return Math.floor(this.value + 1e-6);
  }

  // record a completed departure
  flight({ happiness, onTime }) {
    const w = BALANCE.rating.weights;
    const h = clamp(happiness / 100, 0, 1);
    const score = 1 + 4 * (w.happiness * h + w.onTime * (onTime ? 1 : 0) + w.diversions * 1);
    this.push(score, BALANCE.rating.alpha);
    this.happiness.push(happiness);
    this.onTime.push(onTime ? 1 : 0);
    this.diversions.push(0);
    this.trim();
  }

  diversion() {
    this.push(1, BALANCE.rating.divertAlpha);
    this.onTime.push(0);
    this.diversions.push(1);
    this.trim();
  }

  push(score, alpha) {
    const before = this.stars();
    this.value = clamp(this.value + (score - this.value) * alpha, 1, 5);
    this.samples.push(score);
    const after = this.stars();
    this.checkUnlocks();
    if (after !== before) this.events.emit('ratingStars', after, before);
  }

  checkUnlocks() {
    for (const p of Object.values(PLANE_TYPES)) {
      if (!this.unlocked.has(p.id) && this.value >= p.unlock) {
        this.unlocked.add(p.id);
        this.events.emit('unlock', p.id);
      }
    }
  }

  trim() {
    for (const k of ['samples', 'happiness', 'onTime', 'diversions']) if (this[k].length > 60) this[k].splice(0, this[k].length - 60);
  }

  avg(list) {
    return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  }

  breakdown() {
    const h = this.avg(this.happiness);
    const o = this.avg(this.onTime);
    const d = this.diversions.reduce((a, b) => a + b, 0);
    return { happiness: h, onTime: o, diversions: d };
  }

  isUnlocked(cls) {
    return this.unlocked.has(cls);
  }

  toJSON() {
    return { value: this.value, samples: this.samples, happiness: this.happiness, onTime: this.onTime, diversions: this.diversions, unlocked: [...this.unlocked] };
  }

  load(d) {
    this.value = d.value;
    this.samples = d.samples || [];
    this.happiness = d.happiness || [];
    this.onTime = d.onTime || [];
    this.diversions = d.diversions || [];
    this.unlocked = new Set(d.unlocked || ['small']);
  }
}
