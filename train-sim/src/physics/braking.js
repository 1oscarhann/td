/**
 * Braking-distance maths. Used by the HUD driving aid now, and later by TPWS overspeed sensors,
 * AI drivers and scoring.
 *
 * The core idea: at a steady deceleration a, stopping from speed v takes v² / 2a metres. Brakes
 * also take a moment to build up, during which the train keeps going at roughly full speed.
 */

/**
 * Distance to stop from `speed` at a steady deceleration, after `delay` seconds of brake build-up
 * (assumed to be at full speed, which errs on the safe side): d = v·t + v² / 2a.
 * @param {number} speed m/s
 * @param {number} decel m/s²
 * @param {number} [delay] s
 */
export function stoppingDistance(speed, decel, delay = 0) {
  if (speed <= 0) return 0;
  if (decel <= 0) return Infinity;
  return speed * delay + (speed * speed) / (2 * decel);
}

/**
 * Highest speed you can be doing and still stop within `distance`. Inverse of stoppingDistance.
 * @param {number} distance m
 * @param {number} decel m/s²
 * @param {number} [delay] s
 */
export function maxSpeedForDistance(distance, decel, delay = 0) {
  if (distance <= 0 || decel <= 0) return 0;
  // Solve v² / 2a + v·t − d = 0 for the positive root.
  return decel * (-delay + Math.sqrt(delay * delay + (2 * distance) / decel));
}

/**
 * Steady deceleration needed to stop from `speed` in exactly `distance`.
 * @param {number} speed m/s
 * @param {number} distance m
 */
export function requiredDeceleration(speed, distance) {
  if (speed <= 0) return 0;
  if (distance <= 0) return Infinity;
  return (speed * speed) / (2 * distance);
}
