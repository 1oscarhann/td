import { RIGHT_TIME_S } from './journey.js';

/**
 * Scoring for a whole journey. Each line in the breakdown says what it was for, so the result
 * screen can explain itself.
 */
export const SCORE_RULES = Object.freeze({
  base: 1000,
  perCallOnTime: 50, // arrival within 59 s of booked
  perMinuteLate: 40,
  perfectStopBonus: 20, // within 1 m of the marker
  perMetreOffMarker: 10, // beyond the first metre, capped per stop
  maxStopPenalty: 150,
  perMissedStop: 300,
  perSpad: 500,
  perPenaltyBrake: 150, // AWS / DSD / TPWS overspeed interventions (SPADs are counted separately)
  perSecondOverspeed: 5,
  perStartWithoutRA: 150,
  perWhistleMissed: 25,
  perHarshEvent: 15, // jerky driving: passengers falling over
  perCautionBreach: 100, // too fast under the signaller's authority
  perNearMiss: 75,
  perTrespassReported: 25,
  bufferStopHit: 400,
  collision: 1000,
});

/**
 * @typedef {object} RunStats
 * @property {number} spads
 * @property {number} penalties
 * @property {number} overspeedS
 * @property {number} whistleMissed
 * @property {number} whistleSounded
 * @property {number} harshEvents
 * @property {number} cautionBreaches
 * @property {number} nearMisses
 * @property {number} trespassReported
 * @property {boolean} bufferStopHit
 * @property {boolean} collision
 * @property {number} maxSpeed
 */

/**
 * @param {import('./journey.js').Call[]} calls
 * @param {RunStats} stats
 * @returns {{ score: number, grade: string, breakdown: { label: string, points: number }[] }}
 */
export function scoreJourney(calls, stats) {
  const r = SCORE_RULES;
  /** @type {{ label: string, points: number }[]} */
  const breakdown = [{ label: 'Journey completed', points: r.base }];
  for (const call of calls) {
    if (call.status === 'missed') {
      breakdown.push({ label: `${call.name}: missed the stop`, points: -r.perMissedStop });
      continue;
    }
    if (call.arr !== null && call.actualArr !== null) {
      const late = call.actualArr - call.arr;
      if (late <= RIGHT_TIME_S) breakdown.push({ label: `${call.name}: right time`, points: r.perCallOnTime });
      else {
        const mins = Math.ceil((late - RIGHT_TIME_S) / 60);
        breakdown.push({ label: `${call.name}: ${mins} min late`, points: -mins * r.perMinuteLate });
      }
    }
    if (call.stopErrorM !== null && call.arr !== null) {
      const err = Math.abs(call.stopErrorM);
      if (err <= 1) breakdown.push({ label: `${call.name}: stopped on the marker`, points: r.perfectStopBonus });
      else breakdown.push({ label: `${call.name}: ${err.toFixed(1)} m off the marker`, points: -Math.min(r.maxStopPenalty, Math.round((err - 1) * r.perMetreOffMarker)) });
    }
    if (call.startedWithoutRA) breakdown.push({ label: `${call.name}: started without the right away`, points: -r.perStartWithoutRA });
  }
  const add = (/** @type {number} */ n, /** @type {string} */ label, /** @type {number} */ each) => {
    if (n > 0) breakdown.push({ label: `${label} × ${n}`, points: -n * each });
  };
  add(stats.spads, 'SPADs', r.perSpad);
  add(stats.penalties, 'Penalty brakes', r.perPenaltyBrake);
  if (stats.overspeedS >= 1) breakdown.push({ label: `Overspeed (${Math.round(stats.overspeedS)} s)`, points: -Math.round(stats.overspeedS * r.perSecondOverspeed) });
  add(stats.whistleMissed, 'Horn not sounded at whistle boards', r.perWhistleMissed);
  add(stats.harshEvents, 'Harsh braking or snatching', r.perHarshEvent);
  add(stats.cautionBreaches, 'Too fast under caution', r.perCautionBreach);
  add(stats.nearMisses, 'Near misses', r.perNearMiss);
  if (stats.trespassReported > 0) breakdown.push({ label: `Trespass reported × ${stats.trespassReported}`, points: stats.trespassReported * r.perTrespassReported });
  if (stats.bufferStopHit) breakdown.push({ label: 'Hit the buffer stops', points: -r.bufferStopHit });
  if (stats.collision) breakdown.push({ label: 'Collision', points: -r.collision });

  const score = Math.max(0, breakdown.reduce((sum, b) => sum + b.points, 0));
  const max = r.base + calls.filter((c) => c.arr !== null).length * (r.perCallOnTime + r.perfectStopBonus);
  const pct = score / max;
  const grade = stats.spads > 0 || stats.collision ? 'D' : pct >= 0.95 ? 'A' : pct >= 0.85 ? 'B' : pct >= 0.7 ? 'C' : 'D';
  return { score, grade, breakdown };
}
