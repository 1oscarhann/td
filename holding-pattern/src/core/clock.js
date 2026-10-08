import { BALANCE } from '../config/balance.js';

// In-game clock. `abs` is in-game minutes since 00:00 on day 1; everything that
// is scheduled (flights, contracts, offers) uses absolute minutes.
export class Clock {
  constructor(events) {
    this.events = events;
    this.reset();
  }

  reset() {
    this.abs = BALANCE.time.startHour * 60;
    this.speedIndex = 0;
    this.paused = false;
    this.lastHour = Math.floor(this.abs / 60);
    this.lastDay = this.day;
  }

  get day() {
    return Math.floor(this.abs / 1440) + 1;
  }
  get minute() {
    return this.abs % 1440;
  }
  get hour() {
    return this.minute / 60;
  }
  get speed() {
    return this.paused ? 0 : BALANCE.time.speeds[this.speedIndex];
  }

  setSpeed(i) {
    this.speedIndex = Math.max(0, Math.min(BALANCE.time.speeds.length - 1, i));
    this.paused = false;
    this.events.emit('speed');
  }
  togglePause() {
    this.paused = !this.paused;
    this.events.emit('speed');
  }

  // Advance by simulation seconds; fires hour/day events in order.
  advance(simSec) {
    this.abs += simSec * BALANCE.time.gameMinPerSec;
    const h = Math.floor(this.abs / 60);
    while (this.lastHour < h) {
      this.lastHour++;
      const day = Math.floor((this.lastHour * 60) / 1440) + 1;
      if (day !== this.lastDay) {
        const ended = this.lastDay;
        this.lastDay = day;
        this.events.emit('dayEnd', ended);
        this.events.emit('dayStart', day);
      }
      this.events.emit('hour', this.lastHour % 24, day);
    }
  }

  // Seconds of simulation until an absolute minute.
  secondsUntil(absMin) {
    return (absMin - this.abs) / BALANCE.time.gameMinPerSec;
  }

  toJSON() {
    return { abs: this.abs, speedIndex: this.speedIndex };
  }
  load(d) {
    this.abs = d.abs;
    this.speedIndex = d.speedIndex || 0;
    this.lastHour = Math.floor(this.abs / 60);
    this.lastDay = this.day;
  }
}
