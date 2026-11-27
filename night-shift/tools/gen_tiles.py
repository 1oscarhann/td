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
# wood, rust). The environment uses only these 12. 12-15 are reserved for the
# player character (skin, hair, a dulled hi-vis stripe).
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
    # 12-15: character-only colours (the player), muted to sit in the palette.
    (150, 121, 101),  # 12 skin
    (112, 88, 75),    # 13 skin shadow
    (45, 36, 33),     # 14 hair
    (150, 152, 80),   # 15 hi-vis stripe (dulled)
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
    """Fill a box with a dithered noisy material on `ramp`."""
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
# Atlas columns MUST match TileSetBuilder constants:
#   0 ROCK  1 BACK_CONCRETE  2 BACK_BRICK  3 FLOOR  4 CEILING  5 SIDE
#   6 BACK_CONCRETE_LOW  7 BACK_BRICK_LOW    (wall cells sitting on the floor)
#   8 BACK_CONCRETE_HIGH 9 BACK_BRICK_HIGH   (wall cells under the ceiling)
# Rows are variants: 0 plain, 1 hairline crack / chip, 2 faint stain.
#
# Subtle on purpose: small, low-contrast noise on 2-3 step ramps. Grime lives
# only where it would collect (the LOW/HIGH edge tiles, and the decal under
# props), never across the middle of a wall. Floors are darker than walls.

def grime_edge(where):
    """Value offset for edge grime: darkens towards the floor or ceiling edge."""
    def fn(x, y, v):
        if where == "low":
            d = (y - 9) / 7.0                     # bottom 7 rows
        elif where == "high":
            d = (5 - y) / 5.0                     # top 5 rows
        else:
            return v
        return v - max(0.0, d) * 0.55
    return fn


def chain(*fns):
    def fn(x, y, v):
        for f in fns:
            if f:
                v = f(x, y, v)
        return v
    return fn


def tile_rock(img, ox, oy, var):
    material(img, ox, oy, T, T, [0, 1], seed=11 + var * 100, base=0.35, low=0.25, fine=0.1)


def tile_concrete_wall(img, ox, oy, var, edge=None):
    def seam(x, y, v):
        if x == 0:
            return v - 0.45                       # panel seam, one step darker
        if var == 2 and x in (6, 7) and y < 9:
            return v - 0.25 * (1 - y / 9)         # faint water stain
        return v
    material(img, ox, oy, T, T, [3, 4, 5], seed=21 + var * 100, base=0.6, low=0.16,
             fine=0.08, value_fn=chain(seam, grime_edge(edge)))
    if var == 1:
        crack(img, random.Random(22), ox + 4, oy + 2, 8, 10, 5, 3)


def tile_brick_wall(img, ox, oy, var, edge=None):
    rng = random.Random(31 + var)
    bricks = {}

    def brick(x, y, v):
        row = y // 4
        offset = 4 if row % 2 else 0
        if y % 4 == 3 or (x + offset) % 8 == 7:
            return 0.1                            # mortar
        key = (row, (x + offset) // 8)
        if key not in bricks:
            bricks[key] = rng.uniform(-0.06, 0.06)
        v += bricks[key]
        if y % 4 == 0:
            v += 0.08                             # top edge catches light
        return v
    material(img, ox, oy, T, T, [3, 4, 5, 6], seed=32 + var * 100, base=0.55, low=0.12,
             fine=0.08, value_fn=chain(brick, grime_edge(edge)))
    if var == 1:                                  # one chipped corner
        img.set(ox + 9, oy + 4, 3)
        img.set(ox + 10, oy + 4, 3)


def tile_concrete_floor(img, ox, oy, var):
    def worn_top(x, y, v):
        if y == 0:
            return 0.95                           # walking edge, one step lighter
        return v - y * 0.015
    material(img, ox, oy, T, T, [1, 2, 3], seed=41 + var * 100, base=0.55, low=0.18,
             fine=0.08, value_fn=worn_top)
    img.rect(ox, oy, T, 1, 4)                     # crisp top edge so the floor line reads
    if var == 1:
        crack(img, random.Random(42), ox + 3, oy + 3, 10, 10, 6, 1)


def tile_ceiling(img, ox, oy, var):
    def lip(x, y, v):
        return 0.0 if y == T - 1 else v
    material(img, ox, oy, T, T, [1, 2, 3], seed=51 + var * 100, base=0.45, low=0.15,
             fine=0.08, value_fn=lip)


def tile_side_wall(img, ox, oy, var):
    material(img, ox, oy, T, T, [2, 3, 4], seed=61 + var * 100, base=0.5, low=0.15, fine=0.08)


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
    """The opening behind the boards, 16x48: a frame and the first steps down."""
    w, h = 16, 48
    img = Img(w, h)
    for y in range(h):
        for x in range(w):
            if x in (0, w - 1) or y == 0:
                img.set(x, y, quantise(0.5 + bayer(x, y) * 0.4, [2, 3, 4], x, y))
            else:
                img.set(x, y, 0 if (x + y) % 7 else 1)
    for i in range(5):                            # steps going down, barely there
        img.rect(2 + i * 3, 30 + i * 3, 4, 1, 2)
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


# ---------------------------------------------------------------- Act 0: the shop
def prop_fridge():
    """Drinks fridge, 22x50: steel frame, glass door, rows of bottles."""
    w, h = 22, 50
    img = Img(w, h)
    rng = random.Random(91)
    for y in range(h):
        for x in range(w):
            if x in (0, w - 1) or y in (0, 1, h - 1, h - 2):
                img.set(x, y, quantise(0.6 + (rng.random() - 0.5) * 0.3, [5, 6, 7], x, y))
            else:
                img.set(x, y, quantise(0.3 + bayer(x, y) * 0.2, [1, 2, 3], x, y))  # glass
    for sy in (14, 26, 38):
        img.rect(2, sy, w - 4, 1, 6)                # wire shelves
        x = 3
        while x < w - 3:
            col = rng.choice([10, 11, 8, 7])
            bh = rng.randint(5, 8)
            img.rect(x, sy - bh, 2, bh, col)
            img.set(x, sy - bh, 9)                  # cap
            x += 3
    img.rect(w - 3, 18, 1, 12, 8)                   # handle
    img.rect(2, 3, w - 4, 2, 9)                     # lit header strip
    save(img, "props/fridge")


def prop_counter():
    """Shop counter with the till, 48x20. The CCTV monitor is its own sprite."""
    w, h = 48, 20
    img = Img(w, h)
    rng = random.Random(92)
    for y in range(6, h):
        for x in range(w):
            v = 0.45 + (rng.random() - 0.5) * 0.15 - (0.2 if x % 12 == 0 else 0)
            img.set(x, y, quantise(v, [2, 3, 4, 5], x, y))
    img.rect(0, 6, w, 2, 8)                         # counter top edge
    img.rect(0, 8, w, 1, 4)
    img.rect(30, 0, 14, 6, 3)                       # till body
    img.rect(31, 1, 6, 3, 9)                        # till screen
    img.rect(38, 1, 5, 4, 2)                        # keys
    for kx in (38, 40, 42):
        img.set(kx, 2, 6)
        img.set(kx, 4, 6)
    img.rect(29, 5, 16, 1, 1)                       # cash drawer line
    save(img, "props/counter")


def prop_cctv():
    """CCTV monitor, 14x11: chunky bezel, dark screen, a red standby dot."""
    w, h = 14, 11
    img = Img(w, h)
    for y in range(h - 2):
        for x in range(w):
            edge = x in (0, w - 1) or y in (0, h - 3)
            img.set(x, y, 5 if edge else quantise(0.3 + bayer(x, y) * 0.3, [0, 1, 2], x, y))
    img.rect(5, h - 2, 4, 2, 4)                     # stand
    img.set(w - 3, h - 4, 11)                       # standby light
    for y in range(2, h - 3, 2):                    # scanlines
        img.rect(1, y, w - 2, 1, 2)
    save(img, "props/cctv")


def prop_mop_bucket():
    """Mop and bucket, 16x24. The doc wants this exact mop to turn up later."""
    w, h = 16, 24
    img = Img(w, h)
    for y in range(16, h):                          # bucket
        for x in range(1, 12):
            img.set(x, y, quantise(0.55 - (y - 16) * 0.04 + bayer(x, y) * 0.2, [2, 10, 10], x, y))
    img.rect(1, 16, 11, 1, 9)
    img.rect(3, 15, 7, 1, 4)                        # wringer
    img.rect(12, 18, 3, 1, 4)                       # handle stub
    for y in range(0, 20):                          # mop handle
        img.set(12 - y // 6, y, 7 if y % 5 else 6)
    for x in (7, 8, 9, 10):                         # mop head in the bucket
        img.set(x, 14, 8)
        img.set(x + (x % 2), 13, 9)
    save(img, "props/mop_bucket")


def prop_window(lit):
    """Shop window onto the forecourt, 48x32. Lit: canopy lamps on."""
    w, h = 48, 32
    img = Img(w, h)
    for y in range(h):
        for x in range(w):
            if x in (0, 1, w - 2, w - 1) or y in (0, 1, h - 2, h - 1):
                img.set(x, y, quantise(0.6 + bayer(x, y) * 0.2, [4, 5, 6], x, y))
            elif x == w // 2:
                img.set(x, y, 4)                    # mullion
            else:
                img.set(x, y, quantise(0.25 + (y / h) * 0.2 + bayer(x, y) * 0.3, [0, 1, 2], x, y))
    img.rect(2, 7, w - 4, 2, 3 if not lit else 6)   # forecourt canopy
    img.rect(14, 16, 5, 13, 3)                      # pump
    img.rect(15, 18, 3, 3, 9 if lit else 2)         # pump display
    img.rect(32, 16, 5, 13, 3)
    img.rect(33, 18, 3, 3, 9 if lit else 2)
    img.rect(2, 29, w - 4, 1, 2)                    # kerb
    if lit:
        for lx in (8, 24, 40):                      # canopy lamps
            img.set(lx, 9, 9)
            img.set(lx - 1, 9, 8)
            img.set(lx + 1, 9, 8)
    save(img, "props/window_on" if lit else "props/window_off")


def prop_breaker():
    """Breaker box, 12x16. Doesn't help."""
    w, h = 12, 16
    img = Img(w, h)
    for y in range(h):
        for x in range(w):
            edge = x in (0, w - 1) or y in (0, h - 1)
            img.set(x, y, 6 if edge else quantise(0.5 + bayer(x, y) * 0.25, [3, 4, 5], x, y))
    for i in range(4):                              # switches
        img.rect(2 + i * 2, 4, 1, 3, 8 if i != 2 else 11)
    img.rect(2, 10, 8, 3, 9)                        # label
    img.rect(3, 11, 5, 1, 4)
    save(img, "props/breaker")


def prop_box():
    """Cardboard box of crisps waiting to be stacked, 12x9."""
    w, h = 12, 9
    img = Img(w, h)
    for y in range(h):
        for x in range(w):
            img.set(x, y, quantise(0.55 - y * 0.03 + bayer(x, y) * 0.25, [2, 10, 10], x, y))
    img.rect(0, 0, w, 1, 9)
    img.rect(5, 0, 2, 3, 8)                         # tape
    img.rect(2, 4, 3, 3, 11)                        # printed logo
    save(img, "props/box")


# ------------------------------------------------------------------ door, grime
def prop_door():
    """Shop front door, 24x52: frame, leaf, wired glass pane, push bar, handle."""
    w, h = 24, 52
    img = Img(w, h)
    for y in range(h):
        for x in range(w):
            if x < 2 or x >= w - 2 or y < 2:      # frame: lit on the left/top
                img.set(x, y, 6 if (x == 0 or y == 0) else 5)
            else:
                img.set(x, y, quantise(0.55 + bayer(x, y) * 0.18 - (x - 2) * 0.008, [3, 4], x, y))
    img.rect(2, 2, 1, h - 2, 2)                   # shadow inside the frame
    for y in range(8, 20):                        # wired glass pane
        for x in range(6, 18):
            img.set(x, y, 1 if (x + y) % 4 else 2)
    img.rect(6, 8, 12, 1, 4)
    img.set(7, 9, 7)                              # glare
    img.set(8, 10, 6)
    img.rect(4, 28, 16, 2, 7)                     # push bar
    img.rect(4, 30, 16, 1, 3)
    img.rect(4, 27, 1, 4, 5)                      # bar mounts
    img.rect(19, 27, 1, 4, 5)
    img.rect(17, 33, 3, 2, 8)                     # handle + lock
    img.set(18, 35, 1)
    img.rect(3, 44, 18, 6, 5)                     # kick plate
    img.rect(3, 44, 18, 1, 6)
    img.rect(0, h - 1, w, 1, 2)                   # threshold
    save(img, "props/door")


def prop_grime():
    """Soft dithered dirt decal, 40x10, for the wall under props. Transparent edges."""
    w, h = 40, 10
    img = Img(w, h)
    for y in range(h):
        for x in range(w):
            across = 1.0 - abs(x - (w - 1) / 2) / (w / 2)
            down = (y + 1) / h
            density = (across ** 1.2) * (down ** 1.5) * 0.8
            if bayer(x, y) + 0.5 < density:
                img.set(x, y, 1 if density > 0.45 else 2)
    save(img, "props/grime")


# ------------------------------------------------------------------------ player
# The night-shift worker, ~44 px tall, facing right. 32x48 frames, feet on the
# bottom row, body centred on x = 16. The TORCH ARM is not in the sprite: the
# game draws it so it can point at the mouse whatever way he faces.
# Frames: 0-1 idle (breathing), 2-5 walk, 6-7 crouch (still / creeping).
PLAYER_FRAME = (32, 48)
SKIN, SKIN_D, HAIR, HIVIS = 12, 13, 14, 15
POLO, POLO_D, POLO_L = 4, 3, 5
TROUSER, TROUSER_D = 2, 1


def draw_person(img, ox, bob=0, back_leg=0, front_leg=0, arm=0):
    """Standing / walking pose. bob shifts everything above the hips."""
    def p(x, y, c):
        img.set(ox + x, y, c)

    def r(x, y, w, h, c):
        img.rect(ox + x, y, w, h, c)

    t = bob  # torso/head y offset
    # Legs: hips at y 31, shoes at 45-47. Lower legs swing from the knee (y 37).
    for leg_x, off, col in ((13, back_leg, TROUSER_D), (17, front_leg, TROUSER)):
        r(leg_x, 31, 4, 6, col)                   # thigh
        r(leg_x + off, 37, 4, 8, col)             # shin, swung
        p(leg_x + off + (3 if col == TROUSER else 0), 38, TROUSER_D if col == TROUSER else 0)
        r(leg_x + off, 45, 6, 2, 0)               # shoe, toe forward
        r(leg_x + off, 47, 6, 1, 1)               # sole
    # Back arm (far side, darker), swinging opposite the back leg.
    r(11, 18 + t, 2, 4, POLO_D)                   # sleeve
    r(11 - arm // 2, 22 + t, 2, 6, SKIN_D)        # forearm
    r(11 - arm, 28 + t, 2, 2, SKIN_D)             # hand
    # Torso: work polo with shading, collar, hi-vis stripe, name badge, belt.
    r(12, 17 + t, 10, 14 - t, POLO)
    r(12, 17 + t, 2, 14 - t, POLO_D)
    r(20, 18 + t, 2, 12 - t, POLO_L)
    r(15, 17 + t, 5, 1, POLO_L)                   # collar
    p(17, 18 + t, SKIN_D)                         # open neck
    r(12, 24 + t, 10, 1, HIVIS)                   # small hi-vis stripe
    r(19, 20 + t, 2, 2, 9)                        # name badge
    r(12, 30, 10, 1, 1)                           # belt
    # Neck and head.
    r(16, 15 + t, 3, 2, SKIN_D)
    r(14, 5 + t, 7, 10, SKIN)                     # face/skull
    r(14, 5 + t, 2, 9, SKIN_D)                    # back of head in shade
    r(14, 14 + t, 6, 1, SKIN_D)                   # jaw
    p(16, 9 + t, SKIN_D)                          # ear
    p(19, 9 + t, 0)                               # eye
    p(19, 8 + t, HAIR)                            # brow
    p(21, 10 + t, SKIN)                           # nose
    p(19, 12 + t, SKIN_D)                         # mouth
    r(13, 3 + t, 8, 3, HAIR)                      # hair
    r(13, 6 + t, 2, 5, HAIR)                      # back of the hair
    p(20, 6 + t, HAIR)                            # fringe
    p(16, 3 + t, 3)                               # a little highlight in the hair


def draw_crouch(img, ox, step=0):
    """Crouched, leaning forward. ~31 px tall so it fits under a 2-tile gap."""
    def p(x, y, c):
        img.set(ox + x, y, c)

    def r(x, y, w, h, c):
        img.rect(ox + x, y, w, h, c)

    # Legs folded: thighs forward, shins down, shoes.
    r(12, 38, 10, 4, TROUSER_D)                   # back thigh
    r(14, 38, 10, 3, TROUSER)                     # front thigh
    r(21 - step, 40, 4, 5, TROUSER)               # front shin
    r(12 + step, 41, 4, 4, TROUSER_D)             # back shin
    r(20 - step, 45, 6, 2, 0)
    r(11 + step, 45, 6, 2, 0)
    r(11, 47, 15, 1, 1)
    # Back arm resting on the knee.
    r(13, 30, 2, 4, POLO_D)
    r(14, 34, 2, 4, SKIN_D)
    # Hunched torso.
    r(13, 28, 10, 10, POLO)
    r(13, 28, 2, 10, POLO_D)
    r(21, 29, 2, 8, POLO_L)
    r(13, 33, 10, 1, HIVIS)
    r(19, 30, 2, 2, 9)
    # Head, pushed forward and down (top of the hair at y 17: 31 px tall).
    r(17, 27, 3, 1, SKIN_D)
    r(16, 19, 7, 9, SKIN)
    r(16, 19, 2, 8, SKIN_D)
    r(16, 27, 6, 1, SKIN_D)
    p(18, 23, SKIN_D)
    p(21, 23, 0)
    p(21, 22, HAIR)
    p(23, 24, SKIN)
    p(21, 26, SKIN_D)
    r(15, 17, 8, 3, HAIR)
    r(15, 20, 2, 4, HAIR)
    p(22, 20, HAIR)


def player_sheet():
    fw, fh = PLAYER_FRAME
    img = Img(fw * 8, fh)
    draw_person(img, 0 * fw)                                  # idle
    draw_person(img, 1 * fw, bob=1)                           # idle, breath out
    draw_person(img, 2 * fw, back_leg=-3, front_leg=3, arm=2)  # walk: contact
    draw_person(img, 3 * fw, bob=-1)                          # walk: passing
    draw_person(img, 4 * fw, back_leg=3, front_leg=-3, arm=-2)  # walk: other contact
    draw_person(img, 5 * fw, bob=-1)                          # walk: passing
    draw_crouch(img, 6 * fw)                                  # crouch
    draw_crouch(img, 7 * fw, step=1)                          # crouch, creeping
    save(img, "player/player")


def main():
    # Columns = tile type, rows = variants (0 plain, 1 cracked/chipped, 2 grimy).
    # The level picks a variant per cell so the repeat isn't obvious.
    columns = [
        tile_rock, tile_concrete_wall, tile_brick_wall, tile_concrete_floor, tile_ceiling,
        tile_side_wall,
        lambda img, ox, oy, var: tile_concrete_wall(img, ox, oy, var, "low"),
        lambda img, ox, oy, var: tile_brick_wall(img, ox, oy, var, "low"),
        lambda img, ox, oy, var: tile_concrete_wall(img, ox, oy, var, "high"),
        lambda img, ox, oy, var: tile_brick_wall(img, ox, oy, var, "high"),
    ]
    tiles = Img(T * len(columns), T * VARIANTS)
    for i, fn in enumerate(columns):
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
    prop_fridge()
    prop_counter()
    prop_cctv()
    prop_mop_bucket()
    prop_window(True)
    prop_window(False)
    prop_breaker()
    prop_box()
    prop_door()
    prop_grime()
    player_sheet()


if __name__ == "__main__":
    main()
