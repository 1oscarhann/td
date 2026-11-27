"""The night-shift worker, ~44 px tall, drawn from a posed skeleton.

Sheet: 16 frames of 32x48, feet on the bottom row, body centred on x = 16,
facing right.  0-3 idle (breathing)  4-9 walk  10-11 crouch  12-15 crouch-walk.
The TORCH ARM is not in the sprite: the game draws it so it can point at the
mouse whichever way he faces. Muted colours, 3 tones per material, a selective
dark outline so he reads against dark walls."""
import math

from .core import Canvas, save, mix

FW, FH = 32, 48
SKIN = [(98, 72, 58), (134, 102, 82), (162, 128, 104)]
HAIR = [(26, 21, 19), (42, 33, 29), (62, 49, 41)]
POLO = [(24, 32, 38), (34, 46, 54), (48, 64, 72), (64, 84, 92)]
HIVIS = [(140, 140, 56), (176, 174, 78)]
TROUSER = [(20, 22, 26), (30, 33, 38), (42, 46, 52)]
SHOE = [(12, 12, 14), (26, 26, 28), (50, 50, 52)]
BADGE = (196, 196, 180)
OUTLINE = (8, 8, 10)


def _ik(hip, foot, l1=9.0, l2=9.0, forward=1):
    """Two-bone IK; the knee bends forward (+x)."""
    dx, dy = foot[0] - hip[0], foot[1] - hip[1]
    d = max(0.01, min(l1 + l2 - 0.01, math.hypot(dx, dy)))
    a = math.atan2(dy, dx)
    b = math.acos(max(-1.0, min(1.0, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))))
    k1 = (hip[0] + math.cos(a - b) * l1, hip[1] + math.sin(a - b) * l1)
    k2 = (hip[0] + math.cos(a + b) * l1, hip[1] + math.sin(a + b) * l1)
    return k1 if (k1[0] - k2[0]) * forward > 0 else k2


def _limb(cv, a, b, width, cols, height=0.7):
    """Thick shaded segment: base colour, lighter front edge, darker back edge."""
    steps = int(max(abs(b[0] - a[0]), abs(b[1] - a[1])) * 2) + 1
    for i in range(steps + 1):
        t = i / steps
        x = a[0] + (b[0] - a[0]) * t
        y = a[1] + (b[1] - a[1]) * t
        for ox in range(width):
            col = cols[1]
            if ox == width - 1:
                col = cols[2]                  # front (lit by the torch side)
            elif ox == 0:
                col = cols[0]
            cv.px(int(round(x - width / 2 + ox + 0.5)), int(round(y)), col, height)


def _shoe(cv, foot, cols, lifted=False):
    x, y = int(round(foot[0])), int(round(foot[1]))
    cv.rect(x - 2, y - 2, 6, 2, cols[1], 0.6)
    cv.rect(x - 2, y, 6, 1, cols[0], 0.3)
    cv.px(x + 3, y - 2, cols[2], 0.8)          # toe cap highlight
    if lifted:
        cv.px(x - 2, y, cols[1], 0.3)


def _torso(cv, ox, top, hip_y, lean):
    """Polo shirt: collar, shading, small hi-vis stripe, name badge, belt."""
    t = top
    for y in range(t, hip_y + 1):
        k = (y - t) / max(1, hip_y - t)
        sx = ox + int(round(12 + lean * (1 - k)))
        for x in range(sx, sx + 10):
            col = POLO[2]
            if x <= sx + 1:
                col = POLO[1]                  # far side in shade
            if x >= sx + 8:
                col = POLO[3]                  # near side lit
            if y >= hip_y - 1:
                col = TROUSER[0]               # belt
            cv.px(x, y, col, 0.8)
        if y == t:
            cv.rect(sx + 3, y, 5, 1, POLO[3], 0.9)            # collar
        if y == t + 1:
            cv.px(sx + 5, y, SKIN[0], 0.6)                    # open neck
        if y == t + 7:
            cv.rect(sx, y, 10, 1, HIVIS[1], 0.9)              # small hi-vis stripe
            cv.px(sx, y, HIVIS[0], 0.9)
        if y in (t + 3, t + 4):
            cv.rect(sx + 7, y, 2, 1, BADGE, 0.95)             # name badge
    cv.px(ox + 17, hip_y - 1, (90, 90, 86), 0.9)             # buckle


def _head(cv, cx, top, lean):
    """Head facing right: hair, ear, eye + brow, nose, mouth, jaw shadow."""
    x0 = int(round(cx - 3 + lean))
    y0 = top
    cv.rect(x0, y0 + 2, 7, 9, SKIN[1], 0.85)
    cv.rect(x0, y0 + 2, 2, 8, SKIN[0], 0.7)                   # back of head shade
    cv.rect(x0 + 5, y0 + 3, 2, 5, SKIN[2], 0.9)               # lit face front
    cv.rect(x0 + 1, y0 + 10, 5, 1, SKIN[0], 0.6)              # jaw
    cv.px(x0 + 2, y0 + 6, SKIN[0], 0.6)                       # ear
    cv.px(x0 + 5, y0 + 6, (16, 14, 14), 0.5)                  # eye
    cv.px(x0 + 5, y0 + 5, HAIR[1], 0.7)                       # brow
    cv.px(x0 + 6, y0 + 5, HAIR[0], 0.7)
    cv.px(x0 + 7, y0 + 7, SKIN[1], 0.9)                       # nose
    cv.px(x0 + 5, y0 + 9, SKIN[0], 0.6)                       # mouth
    cv.rect(x0 - 1, y0, 8, 3, HAIR[1], 0.9)                   # hair
    cv.rect(x0 - 1, y0 + 3, 2, 5, HAIR[1], 0.9)
    cv.rect(x0, y0, 5, 1, HAIR[2], 0.95)                      # highlight
    cv.px(x0 + 6, y0 + 3, HAIR[0], 0.9)                       # fringe
    cv.rect(x0 + 2, y0 + 11, 3, 1, SKIN[0], 0.6)              # neck


def _outline(cv, ox):
    """Dark outline on the silhouette's outside, inside this frame only."""
    add = []
    for y in range(FH):
        for x in range(ox, ox + FW):
            if cv.c[y][x] is None:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if ox <= nx < ox + FW and 0 <= ny < FH and cv.c[ny][nx] is not None \
                            and cv.c[ny][nx] != OUTLINE:
                        add.append((x, y))
                        break
    for x, y in add:
        cv.c[y][x] = OUTLINE


def _pose(cv, ox, back_foot, front_foot, bob=0, arm=0.0, crouch=False, lift_back=False, lift_front=False):
    """Draw one frame. Feet are (x, y) in frame coords (floor = y 46)."""
    def P(p):
        return (p[0] + ox, p[1])

    if crouch:
        hip, top, head_top, lean = (15, 38), 28, 17, 2   # 31 px tall: fits a 32 px gap
    else:
        hip, top, head_top, lean = (15, 29 + bob), 16 + bob, 4 + bob, 0
    # Back leg and back arm first (darker), then torso, front leg, head.
    k = _ik(hip, back_foot)
    dark = [mix(c, (0, 0, 0), 0.3) for c in TROUSER]
    _limb(cv, P(hip), P(k), 4, dark)
    _limb(cv, P(k), P(back_foot), 4, dark)
    _shoe(cv, P(back_foot), [mix(c, (0, 0, 0), 0.3) for c in SHOE], lift_back)
    shoulder = (13, top + 2)
    hand = (shoulder[0] - 1 + arm, shoulder[1] + (9 if crouch else 12))
    elbow = (shoulder[0] - 1 + arm * 0.5, shoulder[1] + (5 if crouch else 6))
    sleeve = [mix(c, (0, 0, 0), 0.25) for c in POLO[:3]]
    _limb(cv, P(shoulder), P(elbow), 3, sleeve)
    _limb(cv, P(elbow), P(hand), 2, [mix(c, (0, 0, 0), 0.2) for c in SKIN])
    _torso(cv, ox, top, hip[1], lean)
    k = _ik(hip, front_foot)
    _limb(cv, P(hip), P(k), 4, TROUSER)
    _limb(cv, P(k), P(front_foot), 4, TROUSER)
    _shoe(cv, P(front_foot), SHOE, lift_front)
    _head(cv, ox + 16 + lean, head_top, 0)


def build():
    cv = Canvas(FW * 16, FH)
    F = 46  # floor line (shoe soles on 46-47)
    frames = []
    # Idle: feet planted, slow breath (bob 0,0,1,1).
    for b in (0, 0, 1, 1):
        frames.append(dict(back_foot=(13, F), front_foot=(18, F), bob=b))
    # Walk: contact, down, pass, contact (other), down, pass.
    walk = [
        dict(back_foot=(10, F), front_foot=(21, F), bob=0, arm=2.5),
        dict(back_foot=(12, F), front_foot=(19, F), bob=1, arm=1.0),
        dict(back_foot=(16, F - 3), front_foot=(15, F), bob=-1, arm=-1.0, lift_back=True),
        dict(back_foot=(21, F), front_foot=(10, F), bob=0, arm=-2.5),
        dict(back_foot=(19, F), front_foot=(12, F), bob=1, arm=-1.0),
        dict(back_foot=(15, F), front_foot=(16, F - 3), bob=-1, arm=1.0, lift_front=True),
    ]
    frames += walk
    # Crouch still (2: tiny breath) and crouch-walk (4).
    frames.append(dict(back_foot=(11, F), front_foot=(21, F), crouch=True))
    frames.append(dict(back_foot=(11, F), front_foot=(21, F), crouch=True, arm=0.5))
    for bf, ff in (((10, F), (22, F)), ((12, F - 2), (21, F)), ((13, F), (20, F)), ((11, F), (22, F - 2))):
        frames.append(dict(back_foot=bf, front_foot=ff, crouch=True))
    for i, f in enumerate(frames):
        ox = i * FW
        # _pose works in frame coords; shift the x of every point by ox inside.
        _pose(cv, ox, **f)
        _outline(cv, ox)
    save(cv, "player/player")
