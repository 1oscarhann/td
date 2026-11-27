"""Props. Sizes must match their Godot scenes (sprite offsets assume them)."""
import random

from .core import T, Canvas, fbm, bayer, clamp, bevel_box, mix, save
from . import palette as P


def shelf():
    """Steel shelving with crisp packets, 24x40. Fixed seed: every shelf is identical
    (the one in the tunnel is exactly the one upstairs)."""
    cv = Canvas(24, 40)
    rng = random.Random(4242)
    for y in range(40):                                   # uprights with holes
        for x in (0, 1, 22, 23):
            v = 0.62 if x in (0, 22) else 0.42
            cv.px(x, y, P.METAL.at(v - (0.25 if y % 4 == 0 and x in (1, 23) else 0), x, y), 0.8)
    for sy in (12, 25, 38):
        cv.rect(0, sy, 24, 1, P.METAL[4], 0.9)            # shelf lip
        cv.rect(0, sy + 1, 24, 1, P.METAL[1], 0.6)
        x = 2
        while x < 21:
            col = rng.choice(P.PACKETS)
            ph = rng.randint(6, 9)
            for py in range(sy - ph, sy):
                for px in range(x, x + 3):
                    t = (px - x) / 2.0
                    c = mix(col, (255, 255, 255), 0.18) if px == x else col
                    if px == x + 2:
                        c = mix(col, (0, 0, 0), 0.35)
                    if py == sy - ph:
                        c = mix(col, (200, 200, 190), 0.4)          # crimped top
                    cv.px(px, py, c, 0.7)
            cv.px(x + 1, sy - ph + 3, P.PAPER[1], 0.8)               # logo glint
            x += 4 if rng.random() < 0.85 else 5
    save(cv, "props/shelf")


def stock_boxes():
    """Stacked stock boxes for the storeroom (design doc: Zone 1), 26x24."""
    cv = Canvas(26, 24)
    bevel_box(cv, 0, 10, 14, 14, P.CARD, seed=5, base=0.5)
    bevel_box(cv, 13, 12, 13, 12, P.CARD, seed=6, base=0.42)
    bevel_box(cv, 3, 0, 15, 11, P.CARD, seed=7, base=0.58)
    for (x, y, w) in ((0, 16, 14), (13, 17, 13), (3, 5, 15)):
        cv.rect(x + 1, y, w - 2, 1, P.CARD[3], 0.85)      # tape
    cv.rect(4, 13, 4, 3, P.RED[0], 0.7)                    # printed logo
    cv.rect(6, 3, 6, 1, P.CARD[0], 0.6)                    # handle slot
    save(cv, "props/stock_boxes")


def fridge():
    """Drinks fridge, 22x50: steel body, glass door, rows of bottles, lit header."""
    cv = Canvas(22, 50)
    rng = random.Random(91)
    bevel_box(cv, 0, 0, 22, 50, P.METAL, seed=8, base=0.5, edge=0.18)
    for y in range(4, 46):
        for x in range(2, 20):
            cv.px(x, y, P.GLASS.at(0.35 + bayer(x, y) * 0.25 + (0.25 if x == 3 else 0), x, y), 0.3)
    cv.rect(2, 1, 18, 3, P.PAPER[2], 0.9)                   # lit header
    for sy in (16, 28, 40):
        cv.rect(2, sy, 18, 1, P.METAL[3], 0.6)
        x = 3
        while x < 18:
            col = rng.choice(P.BOTTLES)
            bh = rng.randint(6, 9)
            cv.rect(x, sy - bh + 2, 2, bh - 2, col, 0.6)
            cv.px(x, sy - bh + 1, mix(col, (0, 0, 0), 0.3), 0.6)
            cv.px(x, sy - bh, P.METAL[4], 0.7)              # cap
            cv.px(x, sy - bh + 3, mix(col, (255, 255, 255), 0.35), 0.7)
            x += 3
    cv.rect(18, 20, 1, 14, P.METAL[5], 0.9)                 # handle
    cv.rect(1, 46, 20, 3, P.METAL[1], 0.5)                  # vent grille
    for x in range(2, 20, 2):
        cv.px(x, 47, P.METAL[0], 0.2)
    save(cv, "props/fridge")


def counter():
    """Counter with the till, 48x20 (CCTV monitor is its own sprite)."""
    cv = Canvas(48, 20)
    for y in range(7, 20):
        for x in range(48):
            v = 0.45 + (0.1 if x % 12 == 1 else 0) - (0.2 if x % 12 == 0 else 0) - (y - 7) * 0.02
            cv.px(x, y, P.WOOD.at(v, x, y), 0.6)            # laminate front panels
    cv.rect(0, 6, 48, 2, P.METAL[4], 0.95)                  # counter top
    cv.rect(0, 8, 48, 1, P.METAL[1], 0.5)
    cv.rect(0, 18, 48, 2, P.METAL[0], 0.3)                  # kick plinth
    bevel_box(cv, 29, 0, 16, 7, P.METAL, seed=9, base=0.38)  # till
    cv.rect(31, 1, 6, 3, (120, 150, 110), 0.9)              # green LCD
    cv.px(32, 2, (170, 200, 150), 0.9)
    for kx in range(38, 44, 2):
        for ky in (2, 4):
            cv.px(kx, ky, P.METAL[4], 0.9)
    cv.rect(28, 5, 18, 1, P.METAL[0], 0.3)                  # cash drawer seam
    save(cv, "props/counter")


def cctv():
    """CCTV monitor, 14x11: chunky bezel, dark glass with a faint image, red light."""
    cv = Canvas(14, 11)
    bevel_box(cv, 0, 0, 14, 9, P.METAL, seed=10, base=0.32)
    for y in range(2, 7):
        for x in range(2, 12):
            v = 0.3 + (0.2 if y % 2 else 0) + bayer(x, y) * 0.2
            cv.px(x, y, mix(P.GLASS.at(v, x, y), (60, 80, 70), 0.3), 0.3)
    cv.px(11, 7, P.RED[2], 0.9)
    cv.rect(5, 9, 4, 2, P.METAL[2], 0.6)
    save(cv, "props/cctv")


def coffee_machine():
    """Coffee machine on the counter end (design doc: Act 0 shop), 14x22."""
    cv = Canvas(14, 22)
    bevel_box(cv, 0, 0, 14, 22, P.METAL, seed=11, base=0.3)
    cv.rect(2, 2, 10, 5, P.GLASS[2], 0.4)                   # menu panel
    for i, c in enumerate(((120, 100, 60), (90, 60, 40), (140, 130, 110))):
        cv.rect(3 + i * 3, 3, 2, 3, c, 0.6)
    cv.rect(4, 9, 6, 1, P.METAL[4], 0.9)                    # spout
    cv.rect(6, 10, 2, 2, P.METAL[3], 0.8)
    cv.rect(4, 14, 6, 5, P.METAL[0], 0.2)                   # cup bay
    cv.rect(5, 16, 3, 3, P.PAPER[0], 0.7)                   # paper cup left in it
    cv.px(11, 3, (80, 140, 80), 0.9)                        # ready light
    save(cv, "props/coffee")


def mop_bucket():
    """Mop and yellow mop bucket, 16x24. The doc wants it to turn up later."""
    cv = Canvas(16, 24)
    for y in range(15, 24):
        for x in range(1, 13):
            v = 0.55 - (y - 15) * 0.04 + (0.15 if x == 2 else 0) - (0.2 if x == 12 else 0)
            cv.px(x, y, P.HAZARD.at(v, x, y), 0.7)
    cv.rect(1, 15, 12, 1, P.HAZARD[1], 0.9)
    cv.rect(0, 22, 14, 2, P.METAL[0], 0.3)                  # castors
    cv.rect(3, 13, 7, 2, P.METAL[2], 0.7)                   # wringer
    for y in range(0, 15):                                  # handle
        cv.px(12 - y // 6, y, P.METAL[4] if y % 5 else P.METAL[3], 0.8)
    for x in range(5, 11):                                  # grey mop strands
        cv.px(x, 12 + (x % 2), P.CONCRETE[4], 0.6)
        cv.px(x, 11 + (x % 3 == 0), P.CONCRETE[3], 0.6)
    save(cv, "props/mop_bucket")


def window(lit):
    """Shop window onto the forecourt, 48x32. Lit: canopy lamps, pump displays."""
    cv = Canvas(48, 32)
    for y in range(32):
        for x in range(48):
            if x < 2 or x > 45 or y < 2 or y > 29:
                cv.px(x, y, P.METAL.at(0.55 + (0.2 if x == 0 or y == 0 else 0), x, y), 0.9)
            elif x == 24:
                cv.px(x, y, P.METAL[3], 0.9)
            else:
                sky = 0.15 + (y / 32) * 0.25 + (0.25 if lit and y < 12 else 0)
                cv.px(x, y, P.GLASS.at(sky, x, y), 0.2)
    canopy = P.METAL[3] if lit else P.METAL[1]
    cv.rect(2, 7, 44, 2, canopy, 0.4)
    for px in (13, 31):                                     # pumps
        cv.rect(px, 15, 6, 14, P.METAL[2] if lit else P.METAL[1], 0.4)
        cv.rect(px + 1, 17, 4, 3, (150, 170, 140) if lit else P.GLASS[1], 0.5)
        cv.rect(px + 6, 20, 1, 5, P.METAL[0], 0.3)          # hose
    cv.rect(2, 28, 44, 1, P.CONCRETE[2], 0.3)               # kerb
    if lit:
        for lx in (8, 22, 38):                              # canopy lamps
            cv.rect(lx - 1, 9, 3, 1, (230, 236, 220), 0.5)
            for i in range(1, 5):                           # glow falling below
                if bayer(lx, 9 + i) < 0.2 - i * 0.1:
                    cv.px(lx, 9 + i, P.GLASS[3], 0.2)
    cv.px(5, 4, P.GLASS[3], 0.3)                            # reflection streak
    cv.px(6, 3, P.GLASS[3], 0.3)
    save(cv, "props/window_on" if lit else "props/window_off")


def door():
    """Shop front door, 24x52: frame, wired glass, push bar, handle, kick plate."""
    cv = Canvas(24, 52)
    bevel_box(cv, 0, 0, 24, 52, P.METAL, seed=12, base=0.55, edge=0.2)
    bevel_box(cv, 3, 3, 18, 48, P.METAL, seed=13, base=0.35, noise=0.12, edge=0.12, height=0.6)
    for y in range(8, 22):                                  # wired glass
        for x in range(6, 18):
            wire = (x + y) % 4 == 0 or (x - y) % 4 == 0
            cv.px(x, y, P.GLASS[2] if wire else P.GLASS[1], 0.2)
    cv.rect(6, 8, 12, 1, P.METAL[4], 0.8)
    cv.px(8, 10, P.GLASS[3], 0.3)
    cv.rect(4, 28, 16, 2, P.METAL[5], 0.95)                 # push bar
    cv.rect(4, 30, 16, 1, P.METAL[1], 0.4)
    cv.rect(17, 33, 3, 2, P.METAL[4], 0.95)                 # handle
    cv.px(18, 35, P.METAL[0], 0.1)                          # lock
    cv.rect(3, 44, 18, 6, P.METAL[3], 0.85)                 # kick plate
    cv.rect(3, 44, 18, 1, P.METAL[4], 0.9)
    save(cv, "props/door")


def breaker():
    """Breaker box, 12x16, door open: a row of switches that won't help."""
    cv = Canvas(12, 16)
    bevel_box(cv, 0, 0, 12, 16, P.METAL, seed=14, base=0.45)
    cv.rect(2, 3, 8, 6, P.METAL[0], 0.2)
    for i in range(4):
        cv.rect(3 + i * 2, 4, 1, 4, P.PAPER[1] if i != 2 else P.RED[1], 0.9)
    cv.rect(2, 11, 8, 3, P.PAPER[0], 0.7)                   # label
    cv.rect(3, 12, 5, 1, P.METAL[1], 0.6)
    save(cv, "props/breaker")


def box():
    """Cardboard box of crisps waiting to be stacked, 12x9."""
    cv = Canvas(12, 9)
    bevel_box(cv, 0, 0, 12, 9, P.CARD, seed=15, base=0.55)
    cv.rect(5, 0, 2, 3, P.CARD[3], 0.9)
    cv.rect(2, 4, 3, 3, P.RED[0], 0.7)
    save(cv, "props/box")


def vent():
    """Ceiling vent, 16x8: angled slats over darkness."""
    cv = Canvas(16, 8)
    bevel_box(cv, 0, 0, 16, 8, P.METAL, seed=16, base=0.5)
    for y in range(1, 7):
        for x in range(1, 15):
            cv.px(x, y, P.METAL[4] if y % 2 else (5, 6, 8), 0.8 if y % 2 else 0.0)
    cv.px(2, 1, P.METAL[5], 1.0)
    cv.px(13, 1, P.METAL[5], 1.0)
    cv.px(9, 3, (5, 6, 8), 0.0)                             # bent slat
    save(cv, "props/vent")


def pipe():
    """Wall pipe, 16x6, tiles left-right: round shading, joint, rust bloom."""
    cv = Canvas(16, 6)
    shade = [0.3, 0.8, 0.62, 0.45, 0.3, 0.1]
    n = fbm(17)
    for y in range(6):
        for x in range(16):
            col = P.METAL.at(shade[y] + (n(x, y) - 0.5) * 0.15, x, y)
            if y >= 3 and n(x * 3, y) > 0.68:
                col = mix(col, (110, 60, 40), 0.55)         # rust
            cv.px(x, y, col, [0.3, 0.9, 1.0, 0.8, 0.5, 0.2][y])
    for y in range(6):                                      # flange joint
        cv.px(0, y, P.METAL[1], 0.4)
        cv.px(1, y, P.METAL[4], 1.0)
    save(cv, "props/pipe", wrap=16)


def cable():
    """Rubber power cable, 16x3, tiles left-right (Line2D texture)."""
    cv = Canvas(16, 3)
    for x in range(16):
        cv.px(x, 0, (44, 46, 48) if x % 7 else (60, 62, 64), 0.9)
        cv.px(x, 1, (24, 25, 27), 0.7)
        cv.px(x, 2, (10, 10, 12), 0.3)
    save(cv, "props/cable", wrap=16)


def panel_hole():
    """The opening behind the boards, 16x48: a frame and steps going down into black."""
    cv = Canvas(16, 48)
    for y in range(48):
        for x in range(16):
            if x in (0, 15) or y == 0:
                cv.px(x, y, P.WOOD.at(0.4 + bayer(x, y) * 0.3, x, y), 0.8)
            else:
                cv.px(x, y, (4, 5, 6) if (x + y) % 9 else (9, 10, 12), 0.0)
    for i in range(5):
        cv.rect(2 + i * 3, 30 + i * 3, 4, 1, (20, 22, 25), 0.3)
    save(cv, "props/panel_hole")


def plank():
    """One board, 22x5: grain, splintered ends, nail heads."""
    cv = Canvas(22, 5)
    n = fbm(18, 22)
    for y in range(5):
        for x in range(22):
            v = 0.55 + (n(x * 0.5, y * 3) - 0.5) * 0.45 + (0.2 if y == 0 else 0) - (0.35 if y == 4 else 0)
            cv.px(x, y, P.WOOD.at(v, x, y), 0.8 if 0 < y < 4 else 0.5)
    cv.px(0, 0, P.WOOD[0], 0.2)
    cv.px(21, 4, P.WOOD[0], 0.2)
    for nx in (2, 19):
        cv.px(nx, 2, P.METAL[5], 1.0)
        cv.px(nx, 3, P.METAL[1], 0.4)
    save(cv, "props/plank")


def tube():
    """Fluorescent strip in its fitting, 32x6. Dead: grey, a burnt end, a chip."""
    cv = Canvas(32, 6)
    cv.rect(0, 0, 32, 1, P.METAL[3], 0.9)
    cv.rect(0, 1, 32, 1, P.METAL[1], 0.5)
    for x in range(2, 30):
        cv.px(x, 2, P.PAPER.at(0.3 + bayer(x, 2) * 0.2, x, 2), 0.9)
        cv.px(x, 3, P.PAPER[0], 0.8)
        cv.px(x, 4, P.METAL[2], 0.4)
    for y in range(2, 5):
        cv.px(1, y, P.METAL[4], 0.9)
        cv.px(30, y, P.METAL[4], 0.9)
    cv.rect(3, 2, 3, 2, P.METAL[1], 0.5)                    # burnt-out end
    cv.px(22, 4, (8, 8, 9), 0.0)                            # chip
    save(cv, "props/tube")


def grime():
    """Dithered dirt decal, 40x10, for the wall under props."""
    cv = Canvas(40, 10)
    for y in range(10):
        for x in range(40):
            across = 1.0 - abs(x - 19.5) / 20
            density = (across ** 1.3) * (((y + 1) / 10) ** 1.6) * 0.85
            if bayer(x, y) + 0.5 < density:
                cv.px(x, y, (12, 12, 12) if density > 0.45 else (24, 23, 20), 0.1)
    save(cv, "props/grime")


def lever(on):
    """Heavy lever on a junction box, 16x24. Off: handle up. On: thrown down."""
    cv = Canvas(16, 24)
    bevel_box(cv, 1, 8, 14, 16, P.METAL, seed=19, base=0.45)
    for x in range(3, 13):                                  # hazard stripes
        for y in range(18, 21):
            cv.px(x, y, P.HAZARD[1] if (x + y) % 4 < 2 else (20, 20, 20), 0.7)
    cv.rect(7, 11, 2, 2, P.METAL[0], 0.3)                   # pivot
    if on:
        for i in range(7):
            cv.px(8 + i // 2, 12 + i, P.METAL[5], 1.0)
        cv.rect(10, 18, 4, 2, P.RED[1], 1.0)
    else:
        for i in range(8):
            cv.px(8, 11 - i, P.METAL[5], 1.0)
        cv.rect(7, 1, 3, 3, P.RED[1], 1.0)
    save(cv, "props/lever_on" if on else "props/lever_off")


def heavy_door():
    """Heavy service door, 14x64: riveted plate, hazard stripes at the foot."""
    cv = Canvas(14, 64)
    for seg in range(4):
        bevel_box(cv, 0, seg * 16, 14, 16, P.METAL, seed=20 + seg, base=0.42, edge=0.16)
    for y in range(4, 56, 16):
        cv.px(3, y, P.METAL[5], 1.0)
        cv.px(10, y, P.METAL[5], 1.0)
    for y in range(56, 64):
        for x in range(1, 13):
            cv.px(x, y, P.HAZARD[1] if (x + y) % 6 < 3 else (18, 18, 18), 0.7)
    save(cv, "props/heavy_door")


def junction_box():
    """Wall junction box with conduit (design doc: Zone 2), 12x14."""
    cv = Canvas(12, 14)
    bevel_box(cv, 0, 2, 12, 12, P.METAL, seed=24, base=0.4)
    cv.rect(5, 0, 2, 2, P.METAL[2], 0.7)                    # conduit up
    cv.rect(2, 5, 8, 4, P.METAL[1], 0.4)
    cv.rect(3, 6, 2, 2, P.HAZARD[1], 0.8)                   # warning sticker
    cv.px(9, 11, P.RED[1], 0.9)
    save(cv, "props/junction")


def grate():
    """Floor grate, 16x4: bars over a black drop (Ceiling Arms come up through these)."""
    cv = Canvas(16, 4)
    for y in range(4):
        for x in range(16):
            bar = x % 3 == 0 or y == 0
            cv.px(x, y, P.METAL.at(0.6 if y == 0 else 0.4, x, y) if bar else (3, 3, 4), 0.9 if bar else 0.0)
    save(cv, "props/grate")


def till_drawer():
    """An open till drawer, 16x8: coins and notes. Things from upstairs, down here."""
    cv = Canvas(16, 8)
    bevel_box(cv, 0, 2, 16, 6, P.METAL, seed=30, base=0.35)
    for i, x in enumerate(range(2, 14, 3)):
        cv.rect(x, 3, 2, 3, P.METAL[0], 0.2)
        cv.px(x, 3, (150, 140, 90) if i % 2 else (120, 140, 120), 0.8)   # coins / a note
    cv.rect(0, 0, 16, 2, P.METAL[3], 0.9)
    save(cv, "props/till_drawer")


def pump_nozzle():
    """A petrol pump nozzle on its hose, hanging from a stone ceiling, 10x26."""
    cv = Canvas(10, 26)
    for y in range(18):
        cv.px(4 + (1 if 6 < y < 12 else 0), y, (20, 20, 22), 0.6)    # hose
        cv.px(5 + (1 if 6 < y < 12 else 0), y, (36, 36, 40), 0.7)
    bevel_box(cv, 2, 17, 6, 5, P.HAZARD, seed=31, base=0.5)            # handle
    cv.rect(6, 21, 3, 1, P.METAL[3], 0.9)                              # trigger
    cv.rect(3, 22, 2, 4, P.METAL[4], 0.9)                              # spout
    cv.px(3, 25, P.METAL[2], 0.6)
    save(cv, "props/pump_nozzle")


def red_door():
    """The red door (landmark), 24x52. It turns up again deeper, where it shouldn't."""
    cv = Canvas(24, 52)
    bevel_box(cv, 0, 0, 24, 52, P.METAL, seed=32, base=0.45)
    bevel_box(cv, 3, 3, 18, 48, P.RED, seed=33, base=0.45, noise=0.25, edge=0.2, height=0.7)
    for y in (12, 34):
        cv.rect(5, y, 14, 1, P.RED[0], 0.4)
    cv.rect(17, 27, 2, 3, P.METAL[5], 0.95)
    cv.rect(6, 20, 6, 1, P.PAPER[0], 0.6)                              # stencilled number
    save(cv, "props/red_door")


def valve_wheel():
    """Big valve wheel on a pipe stub (landmark), 20x20."""
    cv = Canvas(20, 20)
    import math as _m
    for a in range(0, 360, 4):
        r = _m.radians(a)
        for rr in (8.5, 9.0):
            cv.px(int(10 + _m.cos(r) * rr), int(10 + _m.sin(r) * rr), P.RED[1] if a < 200 else P.RED[0], 0.9)
    for a in (0, 60, 120, 180, 240, 300):
        r = _m.radians(a)
        cv.line(10, 10, int(10 + _m.cos(r) * 8), int(10 + _m.sin(r) * 8), P.RED[0], 0.7)
    cv.rect(8, 8, 4, 4, P.METAL[3], 1.0)
    save(cv, "props/valve_wheel")


def water():
    """Standing water strip, 16x3, tiles left-right: black with a few glints."""
    cv = Canvas(16, 3)
    for x in range(16):
        cv.px(x, 0, P.WATER[3] if x in (3, 4, 11) else P.WATER[2], 0.95)
        cv.px(x, 1, P.WATER[1], 0.9)
        cv.px(x, 2, P.WATER[0], 0.9)
    save(cv, "props/water", wrap=16)


def build_all():
    for fn in (shelf, stock_boxes, fridge, counter, cctv, coffee_machine, mop_bucket,
               door, breaker, box, vent, pipe, cable, panel_hole, plank, tube, grime,
               heavy_door, junction_box, grate, till_drawer, pump_nozzle, red_door,
               valve_wheel, water):
        fn()
    window(True)
    window(False)
    lever(False)
    lever(True)
