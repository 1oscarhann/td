import * as THREE from 'three';

// Blocky segment font for painted markings (runway numbers, stand labels).
// Segments: a top, b top-right, c bottom-right, d bottom, e bottom-left,
// f top-left, g middle. Text lies flat on XZ, reading along +X with the top of
// the glyphs toward -Z.
const SEG = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  S: 'afgcd', G: 'afedc', L: 'fed', R: 'abcefg', C: 'afed', M: 'abcef', A: 'abcefg',
};

export function segText(str, height = 1, stroke = 0.16) {
  const w = height * 0.56;
  const gap = height * 0.22;
  const t = height * stroke;
  const parts = [];
  let x = 0;
  const box = (cx, cz, sx, sz) => {
    const g = new THREE.PlaneGeometry(sx, sz);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, 0, cz);
    parts.push(g);
  };
  for (const ch of String(str)) {
    const segs = SEG[ch];
    if (segs) {
      const h2 = height / 2;
      if (segs.includes('a')) box(x + w / 2, -h2 + t / 2, w, t);
      if (segs.includes('g')) box(x + w / 2, 0, w, t);
      if (segs.includes('d')) box(x + w / 2, h2 - t / 2, w, t);
      if (segs.includes('f')) box(x + t / 2, -h2 / 2, t, h2 + t);
      if (segs.includes('e')) box(x + t / 2, h2 / 2, t, h2 + t);
      if (segs.includes('b')) box(x + w - t / 2, -h2 / 2, t, h2 + t);
      if (segs.includes('c')) box(x + w - t / 2, h2 / 2, t, h2 + t);
      if (ch === 'M') box(x + w / 2, -h2 / 2, t, h2);
    }
    x += w + gap;
  }
  const width = x - gap;
  for (const p of parts) p.translate(-width / 2, 0, 0);
  return parts;
}
