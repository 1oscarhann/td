import { describe, expect, it } from 'vitest';
import { AWS } from '../src/safety/aws.js';
import { TPWS } from '../src/safety/tpws.js';
import { DSD } from '../src/safety/dsd.js';
import { Aspect } from '../src/signals/aspects.js';

/** Call fn every 1/60 s for `seconds`; returns true if it ever returned true. */
function tick(seconds, fn) {
  let fired = false;
  for (let t = 0; t < seconds; t += 1 / 60) fired = fn(1 / 60) || fired;
  return fired;
}

describe('AWS', () => {
  it('rings the bell for green and leaves the sunflower black', () => {
    const aws = new AWS();
    expect(aws.passMagnet(Aspect.GREEN)).toBe('bell');
    expect(aws.hornSounding).toBe(false);
    expect(aws.sunflower).toBe(false);
  });

  it('sounds the horn for any caution, until acknowledged', () => {
    const aws = new AWS();
    for (const aspect of [Aspect.DOUBLE_YELLOW, Aspect.YELLOW, Aspect.RED]) {
      expect(aws.passMagnet(aspect)).toBe('horn');
      expect(aws.hornSounding).toBe(true);
      expect(aws.acknowledge()).toBe(true);
      expect(aws.hornSounding).toBe(false);
      expect(aws.sunflower).toBe(true);
    }
  });

  it('acknowledging with no warning does nothing', () => {
    expect(new AWS().acknowledge()).toBe(false);
  });

  it('brakes the train if not acknowledged within 2.7 s', () => {
    const aws = new AWS();
    aws.passMagnet(Aspect.YELLOW);
    expect(tick(2.6, (dt) => aws.update(dt))).toBe(false);
    expect(tick(0.2, (dt) => aws.update(dt))).toBe(true);
    expect(aws.penalty).toBe(true);
    expect(aws.hornSounding).toBe(true); // still blaring until you press the button
    aws.acknowledge();
    expect(aws.penalty).toBe(true); // ...and the brake stays on until reset
    aws.clearPenalty();
    expect(aws.penalty).toBe(false);
  });

  it('the next green resets the sunflower', () => {
    const aws = new AWS();
    aws.passMagnet(Aspect.YELLOW);
    aws.acknowledge();
    aws.passMagnet(Aspect.GREEN);
    expect(aws.sunflower).toBe(false);
  });
});

describe('TPWS train stop', () => {
  it('only intervenes at red', () => {
    const tpws = new TPWS();
    expect(tpws.passSignal('S1', Aspect.YELLOW)).toBe(false);
    expect(tpws.brakeDemand).toBe(false);
    expect(tpws.passSignal('S2', Aspect.RED)).toBe(true);
    expect(tpws.brakeDemand).toBe(true);
    expect(tpws.lastIntervention).toEqual({ type: 'TSS', signalId: 'S2' });
    tpws.clear();
    expect(tpws.brakeDemand).toBe(false);
  });
});

describe("DSD (dead man's handle)", () => {
  it("hold mode: fine while held, penalty 3 s after letting go on the move", () => {
    const dsd = new DSD({ mode: 'hold' });
    expect(tick(10, (dt) => dsd.update(dt, { held: true, pressed: false, active: true }))).toBe(false);
    expect(tick(2.9, (dt) => dsd.update(dt, { held: false, pressed: false, active: true }))).toBe(false);
    expect(dsd.warning).toBe(true);
    expect(tick(0.2, (dt) => dsd.update(dt, { held: false, pressed: false, active: true }))).toBe(true);
    expect(dsd.penalty).toBe(true);
  });

  it('hold mode: grabbing it again during the warning cancels it', () => {
    const dsd = new DSD({ mode: 'hold' });
    tick(2, (dt) => dsd.update(dt, { held: false, pressed: false, active: true }));
    dsd.update(1 / 60, { held: true, pressed: false, active: true });
    expect(dsd.warning).toBe(false);
    expect(tick(2.5, (dt) => dsd.update(dt, { held: false, pressed: false, active: true }))).toBe(false);
  });

  it("hold mode: doesn't care when standing with no power", () => {
    const dsd = new DSD({ mode: 'hold' });
    expect(tick(30, (dt) => dsd.update(dt, { held: false, pressed: false, active: false }))).toBe(false);
    expect(dsd.warning).toBe(false);
  });

  it('vigilance mode: buzzes after 60 s, a tap resets it', () => {
    const dsd = new DSD({ mode: 'vigilance' });
    const drive = (/** @type {number} */ dt) => dsd.update(dt, { held: false, pressed: false, active: true });
    tick(59.9, drive);
    expect(dsd.warning).toBe(false);
    tick(1, drive);
    expect(dsd.warning).toBe(true);
    dsd.update(1 / 60, { held: false, pressed: true, active: true });
    expect(dsd.warning).toBe(false);
    expect(tick(59, drive)).toBe(false);
  });

  it('vigilance mode: ignoring it applies the brake', () => {
    const dsd = new DSD({ mode: 'vigilance' });
    expect(tick(64, (dt) => dsd.update(dt, { held: false, pressed: false, active: true }))).toBe(true);
  });

  it('off mode never intervenes', () => {
    const dsd = new DSD({ mode: 'off' });
    expect(tick(300, (dt) => dsd.update(dt, { held: false, pressed: false, active: true }))).toBe(false);
  });
});
