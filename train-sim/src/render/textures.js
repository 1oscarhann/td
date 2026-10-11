import * as THREE from 'three';

/**
 * Textures drawn on canvases at startup, so the game ships with no image files (and no licensing
 * questions). Swap these for photo textures later if you like.
 */

/** Seeded random numbers, so scenery and textures come out the same every load. */
export function seededRandom(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} w
 * @param {number} h
 * @param {(ctx: CanvasRenderingContext2D) => void} draw
 */
function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(/** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Speckled stones: shades of grey-brown dots.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {() => number} rnd
 * @param {number} count
 */
function speckle(ctx, w, h, rnd, count) {
  for (let i = 0; i < count; i++) {
    const v = 70 + rnd() * 90;
    ctx.fillStyle = `rgb(${v + 12},${v + 6},${v})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
  }
}

/**
 * Ballast with concrete sleepers. One tile is 4.8 m across (the whole ballast bed) and 2.6 m
 * along (four sleepers at the UK-typical 650 mm spacing).
 */
export function makeBallastTexture() {
  const rnd = seededRandom(7);
  const tex = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#6f6a62';
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, rnd, 9000);
    // Sleepers are 2.6 m long, centred on the 4.8 m bed; 4 per tile.
    const x0 = (256 * (4.8 - 2.6)) / 2 / 4.8;
    const x1 = 256 - x0;
    for (let i = 0; i < 4; i++) {
      const y = i * 64 + 18;
      ctx.fillStyle = '#9d9a92';
      ctx.fillRect(x0, y, x1 - x0, 24);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x0, y + 22, x1 - x0, 3);
    }
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function makeGrassTexture() {
  const rnd = seededRandom(11);
  const tex = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#5d7a3a';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 14000; i++) {
      const g = 90 + rnd() * 70;
      ctx.fillStyle = `rgba(${g * 0.55},${g},${g * 0.35},0.6)`;
      ctx.fillRect(rnd() * 256, rnd() * 256, 1, 2 + rnd() * 3);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function makePavingTexture() {
  const rnd = seededRandom(3);
  const tex = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#a8a39a';
    ctx.fillRect(0, 0, 128, 128);
    speckle(ctx, 128, 128, rnd, 1500);
    ctx.strokeStyle = 'rgba(60,55,50,0.35)';
    for (let i = 0; i <= 128; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 128);
      ctx.moveTo(0, i);
      ctx.lineTo(128, i);
      ctx.stroke();
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Soft round blob for lamp glows. */
export function makeGlowTexture() {
  return canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.2)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

/**
 * A sign: text on a coloured plate, with an optional border.
 * @param {string[]} lines
 * @param {{ bg?: string, fg?: string, border?: string, width?: number, height?: number, font?: string }} [o]
 */
export function makeLabelTexture(lines, { bg = '#ffffff', fg = '#111111', border, width = 256, height = 128, font = 'bold 64px "Helvetica Neue", Arial, sans-serif' } = {}) {
  const tex = canvasTexture(width, height, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = Math.max(4, height * 0.06);
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);
    }
    ctx.fillStyle = fg;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const step = height / (lines.length + 1);
    lines.forEach((line, i) => ctx.fillText(line, width / 2, step * (i + 1), width * 0.92));
  });
  tex.anisotropy = 4;
  return tex;
}
