// Fixed palettes from the art direction. Build mode is a sunny toy diorama;
// radar mode is a dark scope. Keep the spec hex values exactly as given.

export const BUILD = {
  grass: 0x8fbf7a,
  tarmac: 0x5b6270,
  paint: 0xf7f5ef,
  glass: 0x9cd3e8,
  concrete: 0xd9d4cb,
  hivis: 0xf2a541,
  sky: 0xbfe3f2,
};

export const RADAR = {
  bg: 0x071a14,
  green: 0x39e58c,
  amber: 0xffb547,
  red: 0xff5a5f,
};

export const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

// Supporting tones derived from the palette (shades for depth, never new hues).
export const TONES = {
  grassDark: 0x7aae66,
  grassLight: 0x9fcb8a,
  tarmacDark: 0x4c5260,
  tarmacLight: 0x6b7280,
  concreteDark: 0xb9b3a8,
  floor: 0xeae6de,
  metal: 0xc6cbd2,
  dark: 0x2a2f38,
  tyre: 0x22252b,
  window: 0x1f2a36,
  road: 0x6a6f78,
  treeA: 0x5f9a58,
  treeB: 0x6fae62,
  treeC: 0x4e8a52,
  trunk: 0x8a6a4f,
  skin: [0xf1c7a5, 0xd9a07b, 0xb07a55, 0x8a5a3c, 0xf6d6bd, 0x6e4630],
  shirts: [0xe4572e, 0x2e86ab, 0xf2a541, 0x7bc67b, 0xa06cd5, 0xf25f8a, 0x3b3b58, 0xffffff, 0x4ecdc4, 0xffd23f, 0x1f3a5f, 0xc0392b],
};
