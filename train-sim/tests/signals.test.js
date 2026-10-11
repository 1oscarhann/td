import { describe, expect, it } from 'vitest';
import { Aspect, aspectBehind, isCautionary } from '../src/signals/aspects.js';
import { SignalSystem } from '../src/signals/signalSystem.js';

const { RED: R, YELLOW: Y, DOUBLE_YELLOW: YY, GREEN: G } = Aspect;

/** Five 4-aspect signals 1 km apart, reading towards increasing chainage. */
function upLine(opts = {}) {
  const signals = [1000, 2000, 3000, 4000, 5000].map((position, i) => ({
    id: `S${i + 1}`,
    track: 'UP',
    position,
    dir: /** @type {1} */ (1),
  }));
  return new SignalSystem(signals, { overlapM: 180, lineEnd: 6000, ...opts });
}

const aspects = (/** @type {SignalSystem} */ sys) => sys.signals.map((s) => s.aspect);
const trainAt = (/** @type {number} */ front, length = 80) => ({ front, rear: front - length });

describe('aspect sequence rules', () => {
  it('4-aspect steps R → Y → YY → G', () => {
    expect(aspectBehind(R)).toBe(Y);
    expect(aspectBehind(Y)).toBe(YY);
    expect(aspectBehind(YY)).toBe(G);
    expect(aspectBehind(G)).toBe(G);
    expect(aspectBehind(null)).toBe(G);
  });

  it('3-aspect has no double yellow', () => {
    expect(aspectBehind(R, '3')).toBe(Y);
    expect(aspectBehind(Y, '3')).toBe(G);
  });

  it('AWS treats everything but green as a caution', () => {
    expect([R, Y, YY, G].map(isCautionary)).toEqual([true, true, true, false]);
  });
});

describe('SignalSystem', () => {
  it('is all green on an empty line', () => {
    const sys = upLine();
    sys.update([]);
    expect(aspects(sys)).toEqual([G, G, G, G, G]);
  });

  it('shows the classic sequence behind a train', () => {
    const sys = upLine();
    sys.update([trainAt(4500)]); // in S4's section
    expect(aspects(sys)).toEqual([G, YY, Y, R, G]);
  });

  it('keeps a signal red until the train clears the overlap beyond the next signal', () => {
    const sys = upLine();
    sys.update([trainAt(2150)]); // rear at 2070: past S2 but inside S1's 180 m overlap
    expect(sys.aspectOf('S1')).toBe(R);
    sys.update([trainAt(2300)]); // rear at 2220: overlap clear
    expect(sys.aspectOf('S1')).toBe(Y);
  });

  it('a train standing right at a signal does not occupy its section', () => {
    const sys = upLine();
    sys.update([trainAt(3000)]);
    expect(sys.aspectOf('S3')).toBe(G);
    expect(sys.aspectOf('S2')).toBe(R);
  });

  it('turns red behind a train as soon as its front passes', () => {
    const sys = upLine();
    sys.update([trainAt(1000.01)]);
    expect(sys.aspectOf('S1')).toBe(R);
  });

  it('can be held at danger by the signaller', () => {
    const sys = upLine();
    sys.setHeld('S3', true);
    sys.update([]);
    expect(aspects(sys)).toEqual([YY, Y, R, G, G]);
    sys.setHeld('S3', false);
    sys.update([]);
    expect(aspects(sys)).toEqual([G, G, G, G, G]);
  });

  it('the last signal before buffer stops shows caution at best', () => {
    const sys = upLine({ endOfLine: 'stop' });
    sys.update([]);
    expect(aspects(sys)).toEqual([G, G, G, YY, Y]);
  });

  it('ignores trains that have left the modelled line', () => {
    const sys = upLine();
    sys.update([trainAt(7000)]);
    expect(aspects(sys)).toEqual([G, G, G, G, G]);
  });

  it('works the same for trains running towards decreasing chainage', () => {
    const signals = [5000, 4000, 3000].map((position, i) => ({ id: `D${i + 1}`, track: 'DOWN', position, dir: /** @type {-1} */ (-1) }));
    const sys = new SignalSystem(signals, { lineEnd: 0 });
    sys.update([{ front: 2500, rear: 2580 }]); // in D3's section, heading for 0
    expect(sys.signals.map((s) => s.id)).toEqual(['D1', 'D2', 'D3']);
    expect(aspects(sys)).toEqual([YY, Y, R]);
    expect(sys.nextSignalAhead(4500)).toMatchObject({ signal: { id: 'D2' }, distance: 500 });
  });

  it('finds the next signal ahead, including one we are standing at', () => {
    const sys = upLine();
    expect(sys.nextSignalAhead(1500)).toMatchObject({ signal: { id: 'S2' }, distance: 500 });
    expect(sys.nextSignalAhead(2000)).toMatchObject({ signal: { id: 'S2' }, distance: 0 });
    expect(sys.nextSignalAhead(5500)).toBeNull();
  });

  it('refuses signals that read in different directions', () => {
    expect(
      () =>
        new SignalSystem([
          { id: 'A', track: 'X', position: 0, dir: 1 },
          { id: 'B', track: 'X', position: 10, dir: -1 },
        ]),
    ).toThrow();
  });
});
