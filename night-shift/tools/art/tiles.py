"""16x16 environment tiles. Atlas columns MUST match TileSetBuilder:
  0 ROCK
  1 WALL_SHOP      2 WALL_CONCRETE      3 WALL_BRICK        (back walls)
  4 FLOOR_SHOP     5 FLOOR_CONCRETE     6 FLOOR_TUNNEL
  7 CEIL_CONCRETE  8 CEIL_BRICK
  9 SIDE_CONCRETE 10 SIDE_BRICK
 11-13 WALL_*_LOW  (wall cells on the floor: damp, tide lines, salt)
 14-16 WALL_*_HIGH (wall cells under the ceiling: soot, nicotine)
Rows = variants: 0 plain, 1 damage (crack / chip / missing tile), 2 stain.
Every tile is a height field as well as a colour, so the torch rakes across
real relief (raised brick faces, recessed mortar and grout, tie holes)."""
import random

from .core import T, Canvas, fbm, bayer, clamp
from . import palette as P

VARIANTS = 3


def _crack(cv, ox, oy, rng, col, x0, y0, steps, height=0.0):
    x, y = x0, y0
    for _ in range(steps):
        if 0 <= x < T and 0 <= y < T:
            cv.px(ox + x, oy + y, col, height)
        y += 1
        x += rng.choice((-1, 0, 0, 1))


# ------------------------------------------------------------------ back walls
def wall_shop(cv, ox, oy, var, edge=None):
    """Glazed ceramic wall tiles (8x8) in dirty grout. Fluorescent-green tint."""
    rng = random.Random(100 + var)
    n = fbm(110 + var)
    shades = {(i, j): rng.uniform(-0.08, 0.08) for i in range(2) for j in range(2)}
    for y in range(T):
        for x in range(T):
            gx, gy = x % 8, y % 8
            if gx == 7 or gy == 7:
                v = 0.45 + (n(x, y) - 0.5) * 0.3
                cv.px(ox + x, oy + y, P.SHOP_GROUT.at(v, x, y), 0.1)
                continue
            v = 0.62 + shades[(x // 8, y // 8)] + (n(x, y) - 0.5) * 0.12
            if gy == 0 or gx == 0:
                v += 0.12                                     # glaze catches light
            if gy == 6 or gx == 6:
                v -= 0.08
            if edge == "low":
                v -= clamp((y - 8) / 8.0) * 0.45              # scuffed and dirty at the foot
            if edge == "high":
                v -= clamp((5 - y) / 5.0) * 0.25              # nicotine near the ceiling
            col = P.SHOP_TILE.at(v, x, y)
            if edge == "high" and y < 4 and bayer(x, y) < 0.1:
                col = P.SHOP_GROUT[1]
            cv.px(ox + x, oy + y, col, 0.85)
    if var == 1:                                              # one cracked tile
        _crack(cv, ox, oy, rng, P.SHOP_TILE[1], 3, 1, 6, 0.3)
    if var == 2:                                              # chipped corner
        cv.rect(ox + 8, oy + 8, 3, 2, P.CONCRETE[2], 0.2)
        cv.px(ox + 8, oy + 10, P.CONCRETE[2], 0.2)


def wall_concrete(cv, ox, oy, var, edge=None):
    """Cast concrete: faint formwork board lines, pores, stains."""
    rng = random.Random(200 + var)
    n = fbm(210 + var)
    for y in range(T):
        for x in range(T):
            v = 0.5 + (n(x, y) - 0.5) * 0.22
            h = 0.6
            if y % 8 == 7:
                v -= 0.1                                      # board joint
                h = 0.45
            if var == 1 and x in (5, 6) and y < 14:
                v -= 0.16 * (1 - y / 14)                      # rust/water streak
            if edge == "low":
                d = clamp((y - 7) / 9.0)
                v -= d * 0.4                                  # rising damp
            if edge == "high":
                v -= clamp((6 - y) / 6.0) * 0.3              # soot
            col = P.CONCRETE.at(v, x, y)
            if edge == "low" and y == 10 and bayer(x, y) < 0.3:
                col = P.STAIN[0]                              # dirty yellow tide line
            cv.px(ox + x, oy + y, col, h)
    for _ in range(4):                                        # pores
        cv.px(ox + rng.randrange(T), oy + rng.randrange(T), P.CONCRETE[0], 0.2)
    if var == 2:                                              # formwork tie holes
        for hx in (4, 12):
            cv.px(ox + hx, oy + 4, P.CONCRETE[0], 0.0)
            cv.px(ox + hx + 1, oy + 4, P.CONCRETE[1], 0.2)
            cv.px(ox + hx, oy + 3, P.CONCRETE[4], 0.7)


def wall_brick(cv, ox, oy, var, edge=None):
    """Old brick: 8x4 running bond, bevelled faces, recessed cold mortar."""
    rng = random.Random(300 + var)
    n = fbm(310 + var)
    bricks = {}
    for y in range(T):
        for x in range(T):
            row = y // 4
            off = 4 if row % 2 else 0
            bx, by = (x + off) % 8, y % 4
            if by == 3 or bx == 7:
                v = 0.45 + (n(x, y) - 0.5) * 0.4
                if edge == "low":
                    v -= clamp((y - 8) / 8.0) * 0.3
                cv.px(ox + x, oy + y, P.MORTAR.at(v, x, y), 0.05)
                continue
            key = (row, (x + off) // 8)
            if key not in bricks:
                bricks[key] = (rng.uniform(-0.12, 0.12), rng.random() < 0.12)
            shade, dark_brick = bricks[key]
            v = 0.55 + shade + (n(x, y) - 0.5) * 0.18
            h = 0.9
            if by == 0:
                v += 0.14                                     # top bevel lit
            elif by == 2:
                v -= 0.08                                     # under-edge
            if bx == 0:
                v += 0.05
            elif bx == 6:
                h = 0.75
            if dark_brick:
                v -= 0.18                                     # burnt / damp brick
            if edge == "low":
                v -= clamp((y - 6) / 10.0) * 0.45
            if edge == "high":
                v -= clamp((5 - y) / 5.0) * 0.3
            col = P.BRICK.at(v, x, y)
            if edge == "low" and y >= 9 and by == 0 and bayer(x, y) < -0.2:
                col = P.SALT[0]                               # efflorescence
            cv.px(ox + x, oy + y, col, h)
    if var == 1:                                              # chipped brick
        cv.rect(ox + 9, oy + 4, 3, 2, P.MORTAR[0], 0.1)
        cv.px(ox + 9, oy + 6, P.BRICK[1], 0.5)
    if var == 2 and edge != "high":                           # salt bloom
        for i in range(5):
            cv.px(ox + 3 + i, oy + 12 + (i % 2), P.SALT[i % 2], 0.85)


# ------------------------------------------------------------------- floors
def floor_shop(cv, ox, oy, var):
    """Lino (worn checker) over a concrete slab."""
    n = fbm(410 + var)
    for y in range(T):
        for x in range(T):
            if y <= 2:
                checker = ((x // 8) % 2) * 0.14
                v = 0.55 + checker + (n(x, y) - 0.5) * 0.12 + (0.25 if y == 0 else 0)
                cv.px(ox + x, oy + y, P.LINO.at(v, x, y), 0.9)
            else:
                v = 0.3 - (y - 3) * 0.015 + (n(x, y) - 0.5) * 0.2
                cv.px(ox + x, oy + y, P.CONCRETE.at(v * 0.8, x, y), 0.5)
    cv.rect(ox, oy + 3, T, 1, P.CONCRETE[0], 0.3)
    if var == 1:
        cv.rect(ox + 5, oy, 3, 1, P.LINO[1], 0.6)             # lino tear


def floor_concrete(cv, ox, oy, var):
    rng = random.Random(500 + var)
    n = fbm(510 + var)
    for y in range(T):
        for x in range(T):
            v = 0.42 - y * 0.018 + (n(x, y) - 0.5) * 0.22
            if y == 0:
                v = 0.78
            elif y == 1:
                v += 0.12
            cv.px(ox + x, oy + y, P.CONCRETE.at(v, x, y), 0.9 if y < 2 else 0.6)
    for _ in range(6):                                        # aggregate
        cv.px(ox + rng.randrange(T), oy + 3 + rng.randrange(T - 3), P.CONCRETE[3], 0.8)
    if var == 1:
        _crack(cv, ox, oy, rng, P.CONCRETE[0], 6, 1, 9, 0.1)


def floor_tunnel(cv, ox, oy, var):
    """Cold wet concrete: dark, with a wet sheen on the walking edge."""
    rng = random.Random(600 + var)
    n = fbm(610 + var)
    for y in range(T):
        for x in range(T):
            v = 0.42 - y * 0.02 + (n(x, y) - 0.5) * 0.25
            if y == 0:
                v = 0.55 + (0.45 if n(x * 2, 0) > 0.55 else 0.0)   # puddle glints
            cv.px(ox + x, oy + y, P.TUNNEL_FLOOR.at(v, x, y), 0.85 if y < 2 else 0.5)
    for _ in range(5):
        cv.px(ox + rng.randrange(T), oy + 2 + rng.randrange(T - 2), P.TUNNEL_FLOOR[0], 0.2)
    if var == 1:
        _crack(cv, ox, oy, rng, P.TUNNEL_FLOOR[0], 9, 1, 8, 0.1)


# --------------------------------------------------------- ceilings / sides / rock
def ceil_concrete(cv, ox, oy, var):
    n = fbm(700 + var)
    for y in range(T):
        for x in range(T):
            v = 0.35 + (n(x, y) - 0.5) * 0.2 - (0.3 if y >= T - 2 else 0.0)
            cv.px(ox + x, oy + y, P.CONCRETE.at(v * 0.9, x, y), 0.6)
    if var == 2:
        cv.px(ox + 7, oy + T - 1, P.STAIN[0], 0.4)            # drip stain


def ceil_brick(cv, ox, oy, var):
    wall_brick(cv, ox, oy, var, edge="high")
    for x in range(T):
        cv.px(ox + x, oy + T - 1, P.MORTAR[0], 0.1)
        cv.darken(ox + x, oy + T - 2, 0.7)


def side_concrete(cv, ox, oy, var):
    n = fbm(800 + var)
    for y in range(T):
        for x in range(T):
            v = 0.32 + (n(x, y) - 0.5) * 0.22 + (0.08 if x % 8 == 0 else 0.0)
            cv.px(ox + x, oy + y, P.CONCRETE.at(v, x, y), 0.6)


def side_brick(cv, ox, oy, var):
    wall_brick(cv, ox, oy, var)
    for y in range(T):
        for x in range(T):
            cv.darken(ox + x, oy + y, 0.72)


def rock(cv, ox, oy, var):
    rng = random.Random(900 + var)
    n = fbm(910 + var)
    for y in range(T):
        for x in range(T):
            cv.px(ox + x, oy + y, P.ROCK.at(0.35 + (n(x, y) - 0.5) * 0.5, x, y), 0.4)
    for _ in range(2):                                        # embedded stones
        sx, sy = rng.randrange(1, T - 3), rng.randrange(1, T - 3)
        cv.rect(ox + sx, oy + sy, 3, 2, P.ROCK[3], 0.8)
        cv.px(ox + sx, oy + sy + 2, P.ROCK[0], 0.2)


COLUMNS = [
    rock,
    wall_shop, wall_concrete, wall_brick,
    floor_shop, floor_concrete, floor_tunnel,
    ceil_concrete, ceil_brick,
    side_concrete, side_brick,
    lambda c, x, y, v: wall_shop(c, x, y, v, "low"),
    lambda c, x, y, v: wall_concrete(c, x, y, v, "low"),
    lambda c, x, y, v: wall_brick(c, x, y, v, "low"),
    lambda c, x, y, v: wall_shop(c, x, y, v, "high"),
    lambda c, x, y, v: wall_concrete(c, x, y, v, "high"),
    lambda c, x, y, v: wall_brick(c, x, y, v, "high"),
]


def build():
    cv = Canvas(T * len(COLUMNS), T * VARIANTS)
    for i, fn in enumerate(COLUMNS):
        for var in range(VARIANTS):
            fn(cv, i * T, var * T, var)
    return cv
