const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} tag
 * @param {Record<string, string | number>} attrs
 */
function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * An analogue cab gauge drawn in SVG: ticks, numbers, one or more needles and an optional
 * "bug" (a marker on the rim, used for the line speed on the speedometer).
 *
 * @param {object} o
 * @param {number} o.min
 * @param {number} o.max
 * @param {number} o.major value between numbered ticks
 * @param {number} o.minor value between small ticks
 * @param {string} o.label
 * @param {string} o.unit
 * @param {string[]} o.needles colours, one per needle
 * @param {(v: number) => string} [o.format] tick label text
 */
export function createDial({ min, max, major, minor, label, unit, needles, format = (v) => String(v) }) {
  const size = 200;
  const c = size / 2;
  const r = 88;
  const sweepStart = -135;
  const sweepEnd = 135;
  const angleOf = (/** @type {number} */ v) => sweepStart + ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * (sweepEnd - sweepStart);
  const polar = (/** @type {number} */ deg, /** @type {number} */ radius) => {
    const a = (deg * Math.PI) / 180;
    return [c + radius * Math.sin(a), c - radius * Math.cos(a)];
  };

  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, class: 'dial', role: 'img', 'aria-label': label });
  svg.append(el('circle', { cx: c, cy: c, r: r + 8, class: 'dial-bezel' }), el('circle', { cx: c, cy: c, r, class: 'dial-face' }));

  for (let v = min; v <= max + 1e-9; v += minor) {
    const isMajor = Math.abs((v - min) / major - Math.round((v - min) / major)) < 1e-6;
    const [x1, y1] = polar(angleOf(v), r - (isMajor ? 14 : 8));
    const [x2, y2] = polar(angleOf(v), r - 2);
    svg.append(el('line', { x1, y1, x2, y2, class: isMajor ? 'tick major' : 'tick' }));
    if (isMajor) {
      const [tx, ty] = polar(angleOf(v), r - 27);
      const text = el('text', { x: tx, y: ty, class: 'tick-label' });
      text.textContent = format(Math.round(v * 100) / 100);
      svg.append(text);
    }
  }

  const labelText = el('text', { x: c, y: c - 30, class: 'dial-label' });
  labelText.textContent = label;
  const unitText = el('text', { x: c, y: c + 52, class: 'dial-unit' });
  unitText.textContent = unit;
  const digital = el('text', { x: c, y: c + 36, class: 'dial-digital' });
  svg.append(labelText, unitText, digital);

  const bug = el('path', { d: `M ${c} ${c - r - 6} l -6 -9 h 12 z`, class: 'dial-bug' });
  bug.style.display = 'none';
  svg.append(bug);

  const needleEls = needles.map((colour) => {
    const g = el('g', { class: 'needle' });
    g.append(el('path', { d: `M ${c - 3} ${c + 14} L ${c} ${c - r + 10} L ${c + 3} ${c + 14} z`, fill: colour }));
    svg.append(g);
    return g;
  });
  svg.append(el('circle', { cx: c, cy: c, r: 7, class: 'dial-hub' }));

  return {
    el: svg,
    /** @param {number} i @param {number} v */
    setNeedle(i, v) {
      needleEls[i].setAttribute('transform', `rotate(${angleOf(v).toFixed(2)} ${c} ${c})`);
    },
    /** @param {number | null} v */
    setBug(v) {
      if (v === null) {
        bug.style.display = 'none';
        return;
      }
      bug.style.display = '';
      bug.setAttribute('transform', `rotate(${angleOf(v).toFixed(2)} ${c} ${c})`);
    },
    /** @param {string} text */
    setDigital(text) {
      if (digital.textContent !== text) digital.textContent = text;
    },
  };
}
