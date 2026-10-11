/**
 * UK colour-light signal aspects.
 */
export const Aspect = Object.freeze({
  RED: 'R',
  YELLOW: 'Y',
  DOUBLE_YELLOW: 'YY',
  GREEN: 'G',
});

/** What each aspect tells the driver. */
export const ASPECT_INFO = Object.freeze({
  R: { name: 'Danger', meaning: 'Stop at this signal.' },
  Y: { name: 'Caution', meaning: 'The next signal is at danger: be ready to stop at it.' },
  YY: { name: 'Preliminary caution', meaning: 'The next signal is showing a single yellow.' },
  G: { name: 'Clear', meaning: 'The next signal is showing a proceed aspect.' },
});

/**
 * Aspect a signal shows when its own section is clear, given the aspect of the next signal.
 * Four-aspect: R → Y → YY → G. Three-aspect signals have no double yellow: R → Y → G.
 * @param {string | null} next aspect of the next signal, or null if the line beyond is open and clear
 * @param {'3' | '4'} [kind]
 */
export function aspectBehind(next, kind = '4') {
  if (next === Aspect.RED) return Aspect.YELLOW;
  if (next === Aspect.YELLOW && kind === '4') return Aspect.DOUBLE_YELLOW;
  return Aspect.GREEN;
}

/**
 * Anything except green gives the AWS warning horn.
 * @param {string} aspect
 */
export const isCautionary = (aspect) => aspect !== Aspect.GREEN;
