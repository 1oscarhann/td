#!/usr/bin/env python3
"""Round 2 phase 3: the underground as a network of short sections.

Keeps the shop, storeroom, stairwell and the basement landing (B1) from the
current map (columns 0-63), then lays the new sections out to the right,
each in its own pocket of solid rock (a 22-column separator: the camera
never shows the next one). Sections connect by back-wall doors, ladders
(stairs shafts between stacked sections) and the boarded panel.

Writes MAP, DECOR and SECTIONS into scenes/levels/test_level.gd.
"""
import re, sys

LEVEL = sys.argv[1] if len(sys.argv) > 1 else 'scenes/levels/test_level.gd'
SEP = 22
ROWS = 23
BACK = {1: '.', 2: ',', 3: ';', 4: '~'}
SOLID = {1: '#', 2: '%', 3: '%', 4: '%'}

src = open(LEVEL).read()
m = re.search(r'const MAP := \[(.*?)\n\]', src, re.S)
old_rows = re.findall(r'"([^"]*)"', m.group(1))
KEEP = 64                      # columns 0..63: shop, storeroom, stairwell, B1
grid = [list(r[:KEEP]) for r in old_rows]
for r in grid:
    r[KEEP - 1] = r[KEEP - 1] if r[KEEP - 1] in '#%' else '#'
# B1's right wall: column 63 stays open where it was (the F sign sits there);
# make sure the column after it is rock.
for r in grid:
    r.append('#')


def width():
    return len(grid[0])


def extend(n, ch='%'):
    for r in grid:
        r.extend([ch] * n)


def put(col, row, ch):
    grid[row][col] = ch


SECTIONS = []      # dicts: id, zone, x0, x1 (cols, exclusive), floor (row), top
DECOR = []         # (comment, dict-text)
FG = []


def d(typ, col, row, **kw):
    parts = ['"type": "%s"' % typ, '"cell": Vector2i(%d, %d)' % (col, row)]
    for k, v in kw.items():
        if isinstance(v, bool):
            parts.append('"%s": %s' % (k, 'true' if v else 'false'))
        elif isinstance(v, str):
            parts.append('"%s": "%s"' % (k, v))
        elif isinstance(v, tuple):
            parts.append('"%s": Vector2i(%d, %d)' % (k, v[0], v[1]))
        elif isinstance(v, dict):
            inner = ', '.join('"%s": "%s"' % (kk, vv) for kk, vv in v.items())
            parts.append('"%s": {%s}' % (k, inner))
        else:
            parts.append('"%s": %s' % (k, v))
    DECOR.append('{' + ', '.join(parts) + '}')


def section(sid, zone, w, top, floor=19, x0=None, ceil=(), floors=(), crouch=(), solid_rows=None):
    """Carve a section. ceil/floors: (c0, c1, row) overrides; crouch: (c0, c1)."""
    if x0 is None:
        extend(SEP)
        x0 = width()
        extend(w)
    tops = [top] * w
    flo = [floor] * w
    for c0, c1, row in ceil:
        for c in range(c0, c1 + 1):
            tops[c] = row
    for c0, c1, row in floors:
        for c in range(c0, c1 + 1):
            flo[c] = row
    for c0, c1 in crouch:
        for c in range(c0, c1 + 1):
            tops[c] = flo[c] - 1
    for c in range(w):
        for row in range(tops[c], flo[c] + 1):
            put(x0 + c, row, BACK[zone])
    sec = {'id': sid, 'zone': zone, 'x0': x0, 'x1': x0 + w, 'floor': floor, 'top': top}
    SECTIONS.append(sec)
    return sec


def X(sec, c):
    return sec['x0'] + c


# ---------------------------------------------------------------- zone 1
B1 = {'id': 'B1', 'zone': 1, 'x0': 32, 'x1': 64, 'floor': 19, 'top': 16}
SECTIONS.append(B1)
# B1 is the landing at the bottom of the stairs. Every return trip comes down
# here, and it's a little different each time.
d('backdoor', 40, 19, id='b1_b2', to='b2_b1', look='wood')
d('backdoor', 49, 19, id='deeper', to='', look='sealed')
d('landmark', 44, 19, kind='chair', trips={'1': 'turned', '2': 'missing', '3': 'double'})
d('landmark', 54, 19, kind='bucket', trips={'2': 'move:-5', '3': 'missing'})
d('tube', 46, 16)
d('vent', 61, 18)
d('spiders', 61, 18, count=3)
d('sprite', 37, 19, name='stock_boxes')
d('mop', 34, 19)
d('line', 44, 19, id='wasnt_there_before')
d('bggrate', 57, 17)

B2 = section('B2', 1, 22, 13)
d('backdoor', X(B2, 2), 19, id='b2_b1', to='b1_b2', look='wood')
d('backdoor', X(B2, 19), 19, id='b2_b3', to='b3_b2')
d('story', X(B2, 6), 19, kind='crisps_stack')
d('story', X(B2, 9), 19, kind='crisps_stack_low')
d('worklight', X(B2, 12), 14, id='safe_b2', pool=30, size=256, energy=1.3)
d('safe', X(B2, 4), 19, to_x=X(B2, 18))
d('landmark', X(B2, 15), 19, kind='trolley')
d('vent', X(B2, 16), 13)
d('bgdoor', X(B2, 13), 18)

# B3 runs straight on into the first tunnel through the boarded panel.
B3 = section('B3', 1, 24, 16, crouch=[(8, 11)], floors=[(15, 17, 20)])
d('backdoor', X(B3, 1), 19, id='b3_b2', to='b2_b3')
d('line', X(B3, 6), 19, id='stay_low')
d('tube', X(B3, 4), 16)
d('vent', X(B3, 13), 16)
d('bggrate', X(B3, 19), 17)
d('landmark', X(B3, 21), 19, kind='boiler')
d('zonemark', X(B3, 23), 19, zone=1)
put(X(B3, 22), 17, 'F')
# The boarded panel: a 1x2 opening in B3's end wall.
pc = B3['x1']
extend(1 + 24)
put(pc, 18, '.'); put(pc, 19, 'B')
Z21 = section('Z2-1', 2, 24, 14, x0=pc + 1)
put(X(Z21, 0), 19, '0')            # through the boards: zone 2, checkpoint
d('zonemark', X(Z21, 1), 19, zone=2)
d('hush', X(Z21, 4), 19)
d('vent', X(Z21, 9), 14)
d('arm', X(Z21, 9), 19, harmless=True)
d('tube', X(Z21, 13), 14)
d('landmark', X(Z21, 15), 19, kind='cone')
d('backdoor', X(Z21, 22), 19, id='z21_z23', to='z23_z21')
d('bgdoor', X(Z21, 2), 18)
# The staff room sits above it, up a ladder.
Z22 = section('Z2-2', 2, 14, 4, floor=10, x0=X(Z21, 10))
d('ladder', X(Z22, 8), 10)
for row in range(11, 14):
    put(X(Z22, 8), row, ','); put(X(Z22, 9), row, ',')
d('story', X(Z22, 3), 10, kind='kettle_table')
d('story', X(Z22, 6), 10, kind='rota', above_floor=34)
d('landmark', X(Z22, 11), 10, kind='lockers')
d('worklight', X(Z22, 5), 4, id='safe_staff', pool=24, size=224, energy=1.1)
d('safe', X(Z22, 0), 10, to_x=X(Z22, 13))

# ---------------------------------------------------------------- zone 2
Z23 = section('Z2-3', 2, 28, 16, crouch=[(13, 15)])
d('backdoor', X(Z23, 1), 19, id='z23_z21', to='z21_z23')
d('hush', X(Z23, 6), 19)
d('line', X(Z23, 11), 19, id='stay_low')
d('glimpse', X(Z23, 25), 19, mode='eye')
d('landmark', X(Z23, 8), 19, kind='radio')
d('backdoor', X(Z23, 26), 19, id='z23_z24', to='z24_z23')
d('tube', X(Z23, 20), 16)

Z24 = section('Z2-4', 2, 22, 14)
d('backdoor', X(Z24, 1), 19, id='z24_z23', to='z23_z24')
d('landmark', X(Z24, 4), 19, kind='clock', above_floor=46)
d('hush', X(Z24, 5), 19)
d('backdoor', X(Z24, 9), 19, id='z24_z25', to='z25_z24', look='metal')
d('bgdoor', X(Z24, 12), 18)
d('worklight', X(Z24, 17), 14, id='sil_light', size=288, energy=1.3, pool=60, reveals=True)
d('glimpse', X(Z24, 14), 19, mode='cross', trigger=X(Z24, 6), to=X(Z24, 20))
d('backdoor', X(Z24, 20), 19, id='z24_z26', to='z26_z24')

Z25 = section('Z2-5', 2, 20, 13)
d('backdoor', X(Z25, 1), 19, id='z25_z24', to='z24_z25', look='metal')
d('cable', X(Z25, 3), 19, to_x=X(Z25, 8), above_floor=30, sag=5, creature=True)
d('cable', X(Z25, 11), 19, to_x=X(Z25, 16), above_floor=30, sag=5)
d('switch', X(Z25, 9), 19, id='passage_door')
d('story', X(Z25, 13), 19, kind='stock_cage')
d('sprite', X(Z25, 17), 19, name='valve_wheel', above_floor=34)
d('pipe', X(Z25, 0), 19, to_x=X(Z25, 19), below_ceiling=10)
d('vent', X(Z25, 6), 13)

Z26 = section('Z2-6', 2, 20, 15)
d('backdoor', X(Z26, 1), 19, id='z26_z24', to='z24_z26')
d('door', X(Z26, 7), 19, id='passage_door')
d('checkpoint', X(Z26, 9), 19)
d('line', X(Z26, 10), 19, id='doing_so_well')
d('sprite', X(Z26, 13), 19, name='red_door')
d('upstairs', X(Z26, 16), 19, trip=1)

# ---------------------------------------------------------------- zone 3a
A1 = section('A1', 3, 20, 16)
d('arrival', X(A1, 2), 19, trip=1, zone=3, thing=(0, 19), thing_active=True)   # thing patched below
d('landmark', X(A1, 6), 19, kind='boot')
d('line', X(A1, 8), 19, id='go_to_the_light')
d('hush', X(A1, 11), 19)
d('lure', X(A1, 16), 18, mode='vanish', cord=26)
d('backdoor', X(A1, 19), 19, id='a1_a2', to='a2_a1')

A2 = section('A2', 3, 24, 14, floors=[(9, 13, 20)])
d('backdoor', X(A2, 1), 19, id='a2_a1', to='a1_a2')
d('tube', X(A2, 5), 14)
d('water', X(A2, 9), 20, to_x=X(A2, 14))
d('arm', X(A2, 17), 19, floor=True)
d('vent', X(A2, 19), 14)
d('spiders', X(A2, 19), 14, count=3)
d('landmark', X(A2, 20), 19, kind='pallet')
d('backdoor', X(A2, 22), 19, id='a2_a3', to='a3_a2')

A3 = section('A3', 3, 30, 11)
put(X(A3, 15), 19, 'W')
d('backdoor', X(A3, 1), 19, id='a3_a2', to='a2_a3')
d('hush', X(A3, 3), 19)
d('landmark', X(A3, 9), 19, kind='mannequin')
d('tube', X(A3, 20), 11)
d('bgdoor', X(A3, 24), 18)
d('backdoor', X(A3, 28), 19, id='a3_a5', to='a5_a3')
A4 = section('A4', 3, 16, 3, floor=8, x0=X(A3, 14))
d('ladder', X(A4, 8), 8)
for row in range(9, 11):
    put(X(A4, 8), row, ';'); put(X(A4, 9), row, ';')
d('story', X(A4, 4), 8, kind='sleeping_bag')
d('worklight', X(A4, 11), 3, id='safe_alcove', pool=20, size=192, energy=0.8)
d('safe', X(A4, 0), 8, to_x=X(A4, 15))

A5 = section('A5', 3, 24, 12)
d('backdoor', X(A5, 1), 19, id='a5_a3', to='a3_a5')
d('line', X(A5, 8), 19, id='not_that_one')
d('upstairs', X(A5, 12), 19, trip=2)
d('lure', X(A5, 14), 12, mode='real', cord=80)
d('sprite', X(A5, 17), 19, name='till_drawer')
d('lure', X(A5, 22), 12, mode='choice', cord=80)

# ---------------------------------------------------------------- zone 3b
C1 = section('C1', 3, 20, 16)
d('arrival', X(C1, 2), 19, trip=2, zone=3, thing=(0, 19), thing_active=True)
d('hush', X(C1, 7), 19)
d('vent', X(C1, 12), 16)
d('spiders', X(C1, 12), 16, count=2)
d('leg', X(C1, 12), 16)
d('hang', X(C1, 16), 16, name='pump_nozzle')
d('backdoor', X(C1, 19), 19, id='c1_c2', to='c2_c1')

C2 = section('C2', 3, 22, 13)
d('backdoor', X(C2, 1), 19, id='c2_c1', to='c1_c2')
d('monitor', X(C2, 6), 19)
d('sprite', X(C2, 9), 19, name='red_door')
d('sprite', X(C2, 10), 19, name='valve_wheel', above_floor=30)
d('hush', X(C2, 11), 19)
d('vent', X(C2, 15), 13)
d('arm', X(C2, 15), 19)
d('backdoor', X(C2, 20), 19, id='c2_c3', to='c3_c2')

C3 = section('C3', 3, 30, 11)
d('backdoor', X(C3, 1), 19, id='c3_c2', to='c2_c3')
d('tube', X(C3, 7), 11)
d('bgdoor', X(C3, 10), 18)
d('landmark', X(C3, 19), 19, kind='trolley')
d('tube', X(C3, 22), 11)
d('backdoor', X(C3, 28), 19, id='c3_c4', to='c4_c3')

C4 = section('C4', 3, 24, 14)
d('backdoor', X(C4, 1), 19, id='c4_c3', to='c3_c4')
d('water', X(C4, 3), 19, to_x=X(C4, 8))
d('cable', X(C4, 2), 19, to_x=X(C4, 7), above_floor=34, sag=6, creature=True)
d('hang', X(C4, 5), 14, name='pump_nozzle')
d('worklight', X(C4, 6), 14, id='z3b_light')
d('switch', X(C4, 9), 19, id='timed_door', kills='z3b_light')
d('sprite', X(C4, 11), 19, name='till_drawer')
d('door', X(C4, 14), 19, id='timed_door', open_seconds=7.0)
d('upstairs', X(C4, 20), 19, trip=3)

# ---------------------------------------------------------------- zone 4
D1 = section('D1', 4, 20, 15)
d('arrival', X(D1, 2), 19, trip=3, zone=4, thing=(0, 19), thing_active=False)
d('checkpoint', X(D1, 3), 19)
d('mop', X(D1, 9), 19)
d('backdoor', X(D1, 19), 19, id='d1_d2', to='d2_d1')

D2 = section('D2', 4, 24, 13)
d('backdoor', X(D2, 1), 19, id='d2_d1', to='d1_d2')
d('hush', X(D2, 6), 19)
d('lure', X(D2, 12), 13, mode='bite', cord=40)
d('backdoor', X(D2, 22), 19, id='d2_d3', to='d3_d2')

D3 = section('D3', 4, 30, 13)
d('backdoor', X(D3, 1), 19, id='d3_d2', to='d2_d3')
d('trigger', X(D3, 10), 19, event='climax', line='were_nearly_there')
d('backdoor', X(D3, 28), 19, id='d3_d4', to='d4_d3')

D4 = section('D4', 4, 30, 13)
d('backdoor', X(D4, 1), 19, id='d4_d3', to='', look='sealed')
d('trigger', X(D4, 3), 19, event='last_stretch')
d('squeeze', X(D4, 5), 19, to_x=X(D4, 27))
d('line', X(D4, 9), 19, id='closer_than_last_time')
d('sign', X(D4, 24), 17, text='fuse box <')
d('trigger', X(D4, 25), 19, event='never_was', line='there_isnt')
d('trigger', X(D4, 28), 19, event='ending')

# A hidden test arena (no doors, never visited): a long 64 px corridor running
# into a big room, for the AI tests' distances. Not part of the game.
TEST = section('TEST', 3, 130, 11, ceil=[(0, 59, 16)])

extend(SEP)

# The Thing's spots per trip.
thing_spot = {'1': X(A3, 15), '2': X(C3, 15), '3': X(D3, 3)}
for i, line in enumerate(DECOR):
    if '"type": "arrival"' in line:
        trip = re.search(r'"trip": (\d+)', line).group(1)
        DECOR[i] = line.replace('"thing": Vector2i(0, 19)', '"thing": Vector2i(%d, 19)' % thing_spot[trip])

rows = [''.join(r) for r in grid]
assert all(len(r) == len(rows[0]) for r in rows)
assert len(rows) == ROWS

# Keep the shop/storeroom decor (rows <= 8, cols < 64) from the old list.
dm = re.search(r'const DECOR := \[\n(.*?)\n\]\n', src, re.S)
keep = []
for line in dm.group(1).split('\n'):
    mm = re.search(r'"cell": Vector2i\((\d+), (\d+)\)', line)
    if mm and int(mm.group(2)) <= 8 and int(mm.group(1)) < 64:
        keep.append(line.strip())

map_txt = 'const MAP := [\n' + '\n'.join('\t"%s",' % r for r in rows) + '\n]'
decor_txt = 'const DECOR := [\n\t# Shop and storeroom (Act 0).\n' + '\n'.join('\t' + k for k in keep) + \
    '\n\t# The underground: a network of short sections (round 2, phase 3).\n' + \
    '\n'.join('\t' + x + ',' for x in DECOR) + '\n]\n'
sec_txt = 'const SECTIONS := [\n' + '\n'.join(
    '\t{"id": "%s", "zone": %d, "x0": %d, "x1": %d, "floor": %d, "top": %d},' % (
        s['id'], s['zone'], s['x0'], s['x1'], s['floor'], s['top']) for s in SECTIONS) + '\n]\n'

src = src[:m.start()] + map_txt + src[m.end():]
dm = re.search(r'const DECOR := \[\n(.*?)\n\]\n', src, re.S)
src = src[:dm.start()] + decor_txt + src[dm.end():]
if 'const SECTIONS := [' in src:
    sm = re.search(r'const SECTIONS := \[\n(.*?)\n\]\n', src, re.S)
    src = src[:sm.start()] + sec_txt + src[sm.end():]
else:
    src = src.replace('const DECOR := [', sec_txt + '\n## Set dressing and encounters per cell (see the list above).\nconst DECOR := [', 1)
open(LEVEL, 'w').write(src)
print('map %dx%d, %d sections, %d decor' % (len(rows[0]), len(rows), len(SECTIONS), len(DECOR)))
for s in SECTIONS:
    print('  %-5s zone %d cols %4d-%4d (%2d wide) floor row %d' % (s['id'], s['zone'], s['x0'], s['x1'] - 1, s['x1'] - s['x0'], s['floor']))
