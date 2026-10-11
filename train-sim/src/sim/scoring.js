/**
 * Milestone 1 scoring. Deliberately simple; Milestone 7 replaces it with punctuality against a
 * timetable, ride comfort (jerk) and a fuller safety record.
 */

export const SCORE_RULES = Object.freeze({
  base: 1000,
  perMetreOffMarker: 20, // after the first metre
  perSpad: 500,
  perPenaltyBrake: 200,
  perSecondOverspeed: 10,
});

/**
 * @param {{ spads: number, penalties: number, overspeedS: number }} stats
 * @param {number} stopErrorM distance from the stop marker (any sign)
 * @returns {{ score: number, breakdown: { label: string, points: number }[] }}
 */
export function scoreRun(stats, stopErrorM) {
  const r = SCORE_RULES;
  const breakdown = [
    { label: 'Run completed', points: r.base },
    { label: `Stop accuracy (${Math.abs(stopErrorM).toFixed(1)} m off the marker)`, points: -Math.round(Math.max(0, Math.abs(stopErrorM) - 1) * r.perMetreOffMarker) },
    { label: `SPADs × ${stats.spads}`, points: -stats.spads * r.perSpad },
    { label: `Penalty brakes × ${stats.penalties}`, points: -stats.penalties * r.perPenaltyBrake },
    { label: `Overspeed (${stats.overspeedS.toFixed(0)} s)`, points: -Math.round(stats.overspeedS * r.perSecondOverspeed) },
  ];
  const score = Math.max(0, breakdown.reduce((sum, b) => sum + b.points, 0));
  return { score, breakdown };
}
