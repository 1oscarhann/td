#!/usr/bin/env python3
"""Procedural pixel art for Night Shift.

Generates every tile and prop as a PNG using ONE fixed palette (12 colours:
a dark teal/grey ramp plus two dirty accents), then a normal map for each one
from its brightness, then a Godot CanvasTexture (.tres) pairing the two.

    python3 tools/gen_tiles.py          # run from the night-shift/ folder (or anywhere)

Standard library only (zlib + struct), so it runs without installing anything.
Output is deterministic: the same seeds give the same art every run.

Nothing is flat colour: every material is a brightness field (periodic value
noise + per-pixel noise + grime + cracks) that is quantised onto a short ramp
of palette colours with 4x4 ordered (Bayer) dithering.
"""
import math
import os
import random
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art")
T = 16  # tile size
VARIANTS = 3  # rows in the tile atlas

# ----------------------------------------------------------------------- palette
# 0-9: dark teal/grey ramp, darkest to lightest. 10-11: accents (signs, crisps,
# wood, rust). Keep it at 12: changing the palette changes the whole game's look.
PALETTE = [
    (11, 16, 19),     # 0  near black
    (19, 28, 32),     # 1
    (29, 40, 45),     # 2
    (39, 54, 59),     # 3
    (51, 69, 74),     # 4
    (67, 88, 91),     # 5
    (87, 109, 109),   # 6
    (111, 133, 130),  # 7
    (142, 161, 155),  # 8
    (180, 194, 184),  # 9  pale (paper, highlights)
    (107, 90, 58),    # 10 dirty ochre (wood, cardboard, packets)
    (110, 58, 50),    # 11 rust red (packets, rust)
]

BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
]


def bayer(x, y):
    return (BAYER4[y % 4][x % 4] + 0.5) / 16.0 - 0.5  # -0.5 .. 0.5


def quantise(v, ramp, x, y, dither=0.9):
    """Map brightness v (0..1) onto a list of palette indices, ordered-dithered."""
    t = max(0.0, min(1.0, v)) * (len(ramp) - 1) + bayer(x, y) * dither
    return ramp[max(0, min(len(ramp) - 1, int(round(t))))]


class Noise:
    """Periodic value noise: tiles seamlessly every `period` pixels."""

    def __init__(self, seed, cells, period):
        rng = random.Random(seed)
        self.cells = cells
        self.period = period
        self.grid = [[rng.random() for _ in range(cells)] for _ in range(cells)]

    def __call__(self, x, y):
        fx = (x % self.period) / self.period * self.cells
        fy = (y % self.period) / self.period * self.cells
        x0, y0 = int(fx), int(fy)
        tx, ty = fx - x0, fy - y0
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        c = self.cells
        a = self.grid[y0 % c][x0 % c]
        b = self.grid[y0 % c][(x0 + 1) % c]
        d = self.grid[(y0 + 1) % c][x0 % c]
        e = self.grid[(y0 + 1) % c][(x0 + 1) % c]
        return (a + (b - a) * tx) + ((d + (e - d) * tx) - (a + (b - a) * tx)) * ty


# ------------------------------------------------------------------------ images
class Img:
    """Indexed image: each pixel is a palette index, or None (transparent)."""

    def __init__(self, w, h, fill=None):
        self.w, self.h = w, h
        self.px = [[fill] * w for _ in range(h)]

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def get(self, x, y):
        return self.px[y][x]

    def rect(self, x0, y0, w, h, c):
        for y in range(y0, y0 + h):
            for x in range(x0, x0 + w):
                self.set(x, y, c)

    def blit(self, other, ox, oy):
        for y in range(other.h):
            for x in range(other.w):
                if other.px[y][x] is not None:
                    self.set(ox + x, oy + y, other.px[y][x])


def write_png(path, w, h, rgba_rows):
    raw = b"".join(b"\x00" + bytes(row) for row in rgba_rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def lum(idx):
    r, g, b = PALETTE[idx]
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0


def save(img, name, tile_wrap=0):
    """Write <name>.png, <name>_n.png (normal map) and <name>.tres (CanvasTexture).

    tile_wrap > 0: the image is a grid of tiles that each wrap on their own
    (so normals at tile edges sample their own tile, keeping tiles seamless).
    """
    folder = os.path.dirname(os.path.join(ART, name))
    os.makedirs(folder, exist_ok=True)
    base = os.path.join(ART, name)

    rows = []
    for y in range(img.h):
        row = []
        for x in range(img.w):
            c = img.px[y][x]
            row += [0, 0, 0, 0] if c is None else list(PALETTE[c]) + [255]
        rows.append(row)
    write_png(base + ".png", img.w, img.h, rows)

    # Normal map from brightness (height = palette luminance), Sobel-ish.
    wrap_h = min(tile_wrap, img.h) if tile_wrap else 0

    def height(x, y, tile_x, tile_y):
        if tile_wrap:
            x = tile_x + (x - tile_x) % tile_wrap
            y = tile_y + (y - tile_y) % wrap_h
        else:
            if x < 0 or y < 0 or x >= img.w or y >= img.h:
                return None
        c = img.px[y][x]
        return None if c is None else lum(c)

    strength = 2.2
    nrows = []
    for y in range(img.h):
        row = []
        for x in range(img.w):
            c = img.px[y][x]
            if c is None:
                row += [128, 128, 255, 0]
                continue
            h0 = lum(c)

            tile_x = (x // tile_wrap) * tile_wrap if tile_wrap else 0
            tile_y = (y // wrap_h) * wrap_h if tile_wrap else 0

            def hs(dx, dy):
                v = height(x + dx, y + dy, tile_x, tile_y)
                return h0 if v is None else v

            dx = (hs(1, 0) - hs(-1, 0)) * strength
            dy = (hs(0, 1) - hs(0, -1)) * strength
            nx, ny, nz = -dx, dy, 1.0  # Y up (OpenGL style), as Godot expects
            ln = math.sqrt(nx * nx + ny * ny + nz * nz)
            row += [int((nx / ln * 0.5 + 0.5) * 255), int((ny / ln * 0.5 + 0.5) * 255),
                    int((nz / ln * 0.5 + 0.5) * 255), 255]
        nrows.append(row)
    write_png(base + "_n.png", img.w, img.h, nrows)

    res = "res://art/" + name
    with open(base + ".tres", "w") as f:
        f.write('[gd_resource type="CanvasTexture" load_steps=3 format=3]\n\n')
        f.write('[ext_resource type="Texture2D" path="%s.png" id="1_diffuse"]\n' % res)
        f.write('[ext_resource type="Texture2D" path="%s_n.png" id="2_normal"]\n\n' % res)
        f.write('[resource]\ndiffuse_texture = ExtResource("1_diffuse")\n'
                'normal_texture = ExtResource("2_normal")\n')
    print("wrote art/%s (.png, _n.png, .tres) %dx%d" % (name, img.w, img.h))


# ----------------------------------------------------------------- detail passes
def crack(img, rng, ox, oy, w, h, steps, dark, light=None):
    """Random-walk crack inside a box. Optional light pixel beside it for depth."""
    x, y = ox + rng.randrange(w), oy + rng.randrange(h // 2)
    for _ in range(steps):
        if ox <= x < ox + w and oy <= y < oy + h:
            img.set(x, y, dark)
            if light is not None and ox <= x + 1 < ox + w and rng.random() < 0.5:
                if img.get(x + 1, y) != dark:
                    img.set(x + 1, y, light)
        y += 1
        x += rng.choice((-1, 0, 0, 1))


def material(img, ox, oy, w, h, ramp, seed, base=0.5, low=0.25, fine=0.12,
             grime=0.0, value_fn=None):
    """Fill a box with a dithered noisy material on `ramp`.
    Variant 2 of every tile (seed >= 200 above its base) is extra grimy."""
    if (seed // 100) % 10 == 2:
        grime *= 1.8
    n_low = Noise(seed, 4, 16)
    n_grime = Noise(seed + 7, 3, 16)
    rng = random.Random(seed + 13)
    for y in range(h):
        for x in range(w):
            v = base + (n_low(x, y) - 0.5) * low + (rng.random() - 0.5) * fine
            if grime:
                g = n_grime(x, y)
                if g > 0.62:
                    v -= (g - 0.62) * grime
            if value_fn:
                v = value_fn(x, y, v)
            img.set(ox + x, oy + y, quantise(v, ramp, x, y))


# ------------------------------------------------------------------------- tiles
# Atlas order MUST match TileSetBuilder constants:
# ROCK, BACK_CONCRETE, BACK_BRICK, FLOOR, CEILING, SIDE
def tile_rock(img, ox, oy, var):
    material(img, ox, oy, T, T, [0, 1, 2], seed=11 + var * 100, base=0.42, low=0.5, fine=0.25, grime=1.0)


def tile_concrete_wall(img, ox, oy, var):
    def streaks(x, y, v):
        if x == 0:
            return v - 0.35                       # panel seam
        if x in (5, 11) and y < 10:               # water stains running down
            return v - 0.18 * (1 - y / 10)
        return v
    material(img, ox, oy, T, T, [3, 4, 5, 6], seed=21 + var * 100, base=0.5, low=0.35, grime=1.4, value_fn=streaks)
    rng = random.Random(22 + var)
    for _ in range(5):                            # pits
        img.set(ox + rng.randrange(1, T), oy + rng.randrange(T), 1)
    if var == 1:
        crack(img, rng, ox + 2, oy, 12, T, 9, 1, 5)


def tile_brick_wall(img, ox, oy, var):
    rng = random.Random(31 + var)
    bricks = {}

    def brick_value(x, y, v):
        row = y // 4
        offset = 4 if row % 2 else 0
        if y % 4 == 3 or (x + offset) % 8 == 7:
            return 0.05                           # mortar
        key = (row, (x + offset) // 8)
        if key not in bricks:
            bricks[key] = rng.uniform(-0.15, 0.15)  # each brick its own shade
        v += bricks[key]
        if y % 4 == 0:
            v += 0.12                             # top edge catches light
        return v
    material(img, ox, oy, T, T, [1, 2, 3, 4, 5, 6], seed=32 + var * 100, base=0.55, low=0.25,
             fine=0.16, grime=1.2, value_fn=brick_value)
    if var == 1:                                  # a chipped corner + hairline crack
        img.set(ox + 9, oy + 4, 1)
        img.set(ox + 10, oy + 4, 1)
        img.set(ox + 9, oy + 5, 2)
        crack(img, rng, ox + 1, oy + 8, 6, 8, 6, 1)


def tile_concrete_floor(img, ox, oy, var):
    def worn_top(x, y, v):
        if y == 0:
            return 0.95                           # walking surface edge
        if y == 1:
            return v + 0.2
        if y == 2:
            return v + 0.08
        return v - y * 0.012                      # darker deeper down
    material(img, ox, oy, T, T, [3, 4, 5, 6, 7, 8], seed=41 + var * 100, base=0.5, low=0.3,
             grime=1.0, value_fn=worn_top)
    rng = random.Random(42 + var)
    for _ in range(4):                            # grit on the surface
        img.set(ox + rng.randrange(T), oy, 6)
    if var == 1:
        crack(img, rng, ox + 3, oy + 3, 10, 13, 8, 2, 6)


def tile_ceiling(img, ox, oy, var):
    def lip(x, y, v):
        if y == T - 1:
            return 0.0                            # dark lip on the underside
        if y == T - 2:
            return v - 0.2
        return v
    material(img, ox, oy, T, T, [1, 2, 3, 4], seed=51 + var * 100, base=0.5, low=0.3, grime=1.2, value_fn=lip)
    rng = random.Random(52 + var)
    img.set(ox + rng.randrange(T), oy + T - 1, 3)  # drip spots hanging off the lip
    if var == 1:
        img.set(ox + rng.randrange(T), oy + T - 1, 3)
        crack(img, rng, ox + 2, oy, 12, 12, 7, 0)


def tile_side_wall(img, ox, oy, var):
    def vertical(x, y, v):
        return v + (0.12 if x % 5 == 0 else 0.0) - (0.1 if x % 7 == 3 else 0.0)
    material(img, ox, oy, T, T, [2, 3, 4, 5, 6], seed=61 + var * 100, base=0.5, low=0.3, grime=1.0, value_fn=vertical)
    if var == 1:
        crack(img, random.Random(62), ox + 4, oy + 2, 8, 14, 10, 1)


# ------------------------------------------------------------------------- props
def prop_shelf():
    """Metal shelving with crisp packets. Fixed seed: every shelf is identical."""
    w, h = 24, 40
    img = Img(w, h)
    rng = random.Random(4242)
    for y in range(h):                            # uprights
        for x in (0, 1, w - 2, w - 1):
            img.set(x, y, quantise(0.55 + (rng.random() - 0.5) * 0.3, [4, 5, 6, 7], x, y))
    for sy in (12, 25, 38):                       # shelves
        for x in range(w):
            img.set(x, sy, quantise(0.7 + (rng.random() - 0.5) * 0.3, [5, 6, 7, 8], x, sy))
            img.set(x, sy + 1, 3)
        x = 3
        while x < w - 4:                          # packets
            ph = rng.randint(5, 8)
            col = rng.choice([10, 11, 7, 10])
            for py in range(sy - ph, sy):
                for px in range(x, x + 3):
                    c = col if rng.random() > 0.15 else 3
                    if py == sy - ph:
                        c = 9 if col == 7 else col  # crimped top
                    img.set(px, py, c)
            img.set(x + 1, sy - ph + 2, 9)        # a glint of foil
            x += 4
    save(img, "props/shelf")


def prop_vent():
    """Ceiling vent grille, 16x8. Hangs from the ceiling; slats over darkness."""
    w, h = 16, 8
    img = Img(w, h)
    for y in range(h):
        for x in range(w):
            if x in (0, w - 1) or y in (0, h - 1):
                img.set(x, y, 6 if y == 0 else 5)  # frame
            elif y % 2 == 1:
                img.set(x, y, quantise(0.6 + bayer(x, y) * 0.3, [4, 5, 6], x, y))  # slat
            else:
                img.set(x, y, 0)                   # the dark behind the slats
    img.set(2, 1, 8)
    img.set(13, 1, 8)                             # screws
    img.set(9, 4, 1)                              # a bent slat
    img.set(10, 4, 1)
    save(img, "props/vent")


def prop_pipe():
    """Wall pipe, horizontal, 16x6, tiles seamlessly left-right."""
    w, h = 16, 6
    img = Img(w, h)
    shade = [0.25, 0.75, 0.6, 0.45, 0.3, 0.1]      # round: lit top, dark underside
    rng = random.Random(71)
    for y in range(h):
        for x in range(w):
            v = shade[y] + (rng.random() - 0.5) * 0.15
            c = quantise(v, [1, 3, 4, 5, 6, 7], x, y)
            if y == 4 and x in (5, 6, 11) or (y == 3 and x == 6):
                c = 11                            # rust
            img.set(x, y, c)
    for y in range(h):                            # a bracket / joint every tile
        img.set(0, y, 2)
        img.set(1, y, 6 if y < 2 else 4)
    save(img, "props/pipe", tile_wrap=16)


def prop_cable():
    """Power cable segment, 16x3, tiles left-right. Used as a Line2D texture."""
    w, h = 16, 3
    img = Img(w, h)
    for x in range(w):
        img.set(x, 0, 4 if x % 6 else 5)
        img.set(x, 1, 2 if x % 6 else 3)
        img.set(x, 2, 0)
    save(img, "props/cable", tile_wrap=16)


def prop_panel_hole():
    """The opening behind the boards, 16x32: a frame and the first steps down."""
    w, h = 16, 32
    img = Img(w, h)
    for y in range(h):
        for x in range(w):
            if x in (0, w - 1) or y == 0:
                img.set(x, y, quantise(0.5 + bayer(x, y) * 0.4, [2, 3, 4], x, y))
            else:
                img.set(x, y, 0 if (x + y) % 7 else 1)
    for i in range(4):                            # steps going down, barely there
        img.rect(3 + i * 3, 18 + i * 3, 4, 1, 2)
    save(img, "props/panel_hole")


def prop_plank():
    """One board, 22x5. Wood grain, nail heads at each end."""
    w, h = 22, 5
    img = Img(w, h)
    rng = random.Random(81)
    grain = Noise(82, 4, 22)
    for y in range(h):
        for x in range(w):
            v = 0.55 + (grain(x * 0.5, y * 3) - 0.5) * 0.5 + (rng.random() - 0.5) * 0.15
            if y == 0:
                v += 0.25
            if y == h - 1:
                v -= 0.35
            img.set(x, y, quantise(v, [2, 10, 10, 8], x, y))
    img.set(0, 1, 1)                              # splintered end
    img.set(w - 1, 3, 1)
    for nx in (2, w - 3):
        img.set(nx, 2, 9)
        img.set(nx, 3, 6)
    save(img, "props/plank")


def prop_tube():
    """Dead fluorescent tube in its fitting, 32x6. Grey glass, one cracked end."""
    w, h = 32, 6
    img = Img(w, h)
    for x in range(w):                            # housing
        img.set(x, 0, 6)
        img.set(x, 1, 4)
    for x in range(2, w - 2):                     # tube: never lit again
        v = 0.6 + bayer(x, 2) * 0.2
        img.set(x, 2, quantise(v + 0.2, [5, 6, 7], x, 2))
        img.set(x, 3, quantise(v, [4, 5, 6], x, 3))
        img.set(x, 4, 3)
    for y in range(2, 5):                         # end caps
        img.set(1, y, 7)
        img.set(w - 2, y, 7)
    img.set(4, 3, 1)                              # blackened end (burnt out)
    img.set(5, 3, 2)
    img.set(4, 2, 2)
    img.set(22, 4, None)                          # cracked chip missing
    img.set(23, 4, 1)
    save(img, "props/tube")


def main():
    # Columns = tile type, rows = variants (0 plain, 1 cracked/chipped, 2 grimy).
    # The level picks a variant per cell so the repeat isn't obvious.
    tiles = Img(T * 6, T * VARIANTS)
    for i, fn in enumerate([tile_rock, tile_concrete_wall, tile_brick_wall,
                            tile_concrete_floor, tile_ceiling, tile_side_wall]):
        for var in range(VARIANTS):
            fn(tiles, i * T, var * T, var)
    save(tiles, "tiles/tiles", tile_wrap=T)
    prop_shelf()
    prop_vent()
    prop_pipe()
    prop_cable()
    prop_panel_hole()
    prop_plank()
    prop_tube()


if __name__ == "__main__":
    main()
