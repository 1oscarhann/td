import { mphToMps } from '../src/core/units.js';
import { Aspect } from '../src/signals/aspects.js';
import { maxSpeedForDistance } from '../src/physics/braking.js';

/**
 * A careful, rule-following driver for tests: shuts the doors at departure time, waits for the
 * right away, keeps under the limit, stops for red signals, sounds the horn at whistle boards,
 * acknowledges AWS, keeps the dead man's handle held and opens the doors on the marker.
 * @param {import('../src/sim/simulation.js').Simulation} s
 * @returns {Partial<import('../src/core/input.js').DriverInput>}
 */
export function autopilot(s) {
  const input = { awsAck: s.aws.hornSounding, hornHigh: false, doorsToggle: false, dsdHeld: true, radio: false };
  const call = s.journey.current;
  if (call?.status === 'arrived') {
    if (s.doors.state === 'open' && call.dep !== null && s.clock >= call.dep - 8) input.doorsToggle = true;
    if (!call.raGiven) {
      s.controller.set('B3');
      return input;
    }
  }
  const front = s.player.front;
  let target = s.lineSpeed - mphToMps(2);
  const change = s.network.nextSpeedChange(front, 3000);
  if (change && change.value < target) target = Math.min(target, Math.sqrt(change.value ** 2 + 2 * 0.4 * Math.max(0, change.distance - 80)));
  for (const { signal, distance } of s.signalling.signalsAhead(front, 3000, 3)) {
    if (signal.aspect === Aspect.RED) {
      target = Math.min(target, maxSpeedForDistance(Math.max(0, distance - 25), 0.5, 1));
      break;
    }
  }
  if (call?.status === 'pending') {
    const d = s.journey.toStop(call, front);
    if (Number.isFinite(d)) {
      target = Math.min(target, d < 0.4 ? 0 : Math.max(0.6, maxSpeedForDistance(d - 0.4, 0.5, 1)));
      if (s.player.isStationary && d < 1.5 && s.doors.state === 'closed') input.doorsToggle = true;
    }
  }
  input.hornHigh = s.whistlePending.size > 0 && Math.floor(s.time) % 4 === 0;
  if (s.penalty && s.player.isStationary) input.awsAck = true;
  const speed = s.player.speed;
  s.controller.set(target < 0.05 && speed < 0.2 ? 'B3' : speed > target + 2 ? 'B3' : speed > target + 0.3 ? 'B2' : speed < target - 1 ? 'P4' : 'OFF');
  return input;
}
