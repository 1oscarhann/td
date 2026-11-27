"""Core helpers for the Night Shift art generator: an RGB canvas with a height
channel, ordered dithering onto colour ramps, periodic noise, and the writer that
turns a canvas into <name>.png + <name>_n.png (normal map) + <name>.tres
(Godot CanvasTexture). Standard library only."""
import math
import os
import random
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, "art")
T = 16

BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def bayer(x, y):
    """Ordered-dither threshold, -0.5 .. 0.5."""
    return (BAYER4[y % 4][x % 4] + 0.5) / 16.0 - 0.5


def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def scale(c, f):
    return tuple(int(clamp(c[i] * f, 0, 255)) for i in range(3))


class Ramp:
    """A short list of colours, dark to light. at() picks one with dithering,
    so gradients stay in the palette but never band hard."""

    def __init__(self, *cols):
        self.cols = list(cols)

    def at(self, v, x, y, dither=0.7):
        n = len(self.cols)
        t = clamp(v) * (n - 1) + bayer(x, y) * dither
        return self.cols[max(0, min(n - 1, int(round(t))))]

    def __getitem__(self, i):
        return self.cols[i]

    def __len__(self):
        return len(self.cols)


class Noise:
    """Periodic value noise (tiles seamlessly every `period` px)."""

    def __init__(self, seed, cells, period):
        rng = random.Random(seed)
        self.cells, self.period = cells, period
        self.g = [[rng.random() for _ in range(cells)] for _ in range(cells)]

    def __call__(self, x, y):
        c = self.cells
        fx = (x % self.period) / self.period * c
        fy = (y % self.period) / self.period * c
        x0, y0 = int(fx), int(fy)
        tx, ty = fx - x0, fy - y0
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        a = self.g[y0 % c][x0 % c]
        b = self.g[y0 % c][(x0 + 1) % c]
        d = self.g[(y0 + 1) % c][x0 % c]
        e = self.g[(y0 + 1) % c][(x0 + 1) % c]
        top = a + (b - a) * tx
        return top + ((d + (e - d) * tx) - top) * ty


def fbm(seed, period=16):
    """Two-octave periodic noise, 0..1."""
    n1, n2 = Noise(seed, 4, period), Noise(seed + 1, 8, period)
    return lambda x, y: n1(x, y) * 0.65 + n2(x, y) * 0.35


class Canvas:
    """RGB pixels (None = transparent) plus an optional height per pixel used
    for the normal map (raised = 1, recessed = 0)."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.c = [[None] * w for _ in range(h)]
        self.hg = [[None] * w for _ in range(h)]

    def px(self, x, y, col, height=None):
        if 0 <= x < self.w and 0 <= y < self.h and col is not None:
            self.c[y][x] = col
            if height is not None:
                self.hg[y][x] = height

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.c[y][x]
        return None

    def rect(self, x, y, w, h, col, height=None):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.px(xx, yy, col, height)

    def line(self, x0, y0, x1, y1, col, height=None):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.px(x0, y0, col, height)
            if x0 == x1 and y0 == y1:
                return
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def darken(self, x, y, f):
        c = self.get(x, y)
        if c is not None:
            self.c[y][x] = scale(c, f)

    def outline(self, col):
        """1 px outline around the opaque shape (outside it)."""
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.c[y][x] is None:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        if self.get(x + dx, y + dy) is not None:
                            add.append((x, y))
                            break
        for x, y in add:
            self.c[y][x] = col


def bevel_box(cv, x, y, w, h, ramp, seed=1, base=0.55, noise=0.18, edge=0.22, height=0.8):
    """A shaded panel: noisy fill, lit top/left edge, shadowed bottom/right edge."""
    n = fbm(seed, 16)
    for yy in range(h):
        for xx in range(w):
            v = base + (n(xx, yy) - 0.5) * noise
            if yy == 0 or xx == 0:
                v += edge
            elif yy == h - 1 or xx == w - 1:
                v -= edge
            hv = height if 0 < xx < w - 1 and 0 < yy < h - 1 else height * 0.6
            cv.px(x + xx, y + yy, ramp.at(v, xx, yy), hv)


# ------------------------------------------------------------------------ output
def _write_png(path, w, h, rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def _lum(c):
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255.0


def save(cv, name, wrap=0, strength=2.4):
    """Write art/<name>.png, art/<name>_n.png and art/<name>.tres.
    wrap > 0: the canvas is a grid of wrap x wrap tiles that each tile on their
    own, so normals at tile edges stay seamless."""
    base = os.path.join(ART, name)
    os.makedirs(os.path.dirname(base), exist_ok=True)
    rows = []
    for y in range(cv.h):
        r = []
        for x in range(cv.w):
            c = cv.c[y][x]
            r += [0, 0, 0, 0] if c is None else [c[0], c[1], c[2], 255]
        rows.append(r)
    _write_png(base + ".png", cv.w, cv.h, rows)

    def height(x, y, tx, ty):
        if wrap:
            x = tx + (x - tx) % wrap
            y = ty + (y - ty) % min(wrap, cv.h)
        elif not (0 <= x < cv.w and 0 <= y < cv.h):
            return None
        c = cv.c[y][x]
        if c is None:
            return None
        h = cv.hg[y][x]
        # Explicit height where the art set one; luminance otherwise.
        return h * 0.75 + _lum(c) * 0.25 if h is not None else _lum(c)

    nrows = []
    for y in range(cv.h):
        r = []
        for x in range(cv.w):
            if cv.c[y][x] is None:
                r += [128, 128, 255, 0]
                continue
            tx = (x // wrap) * wrap if wrap else 0
            ty = (y // min(wrap, cv.h)) * min(wrap, cv.h) if wrap else 0
            h0 = height(x, y, tx, ty)

            def hs(dx, dy):
                v = height(x + dx, y + dy, tx, ty)
                return h0 if v is None else v

            nx = -(hs(1, 0) - hs(-1, 0)) * strength
            ny = (hs(0, 1) - hs(0, -1)) * strength   # Y up
            ln = math.sqrt(nx * nx + ny * ny + 1.0)
            r += [int((nx / ln * 0.5 + 0.5) * 255), int((ny / ln * 0.5 + 0.5) * 255),
                  int((1.0 / ln * 0.5 + 0.5) * 255), 255]
        nrows.append(r)
    _write_png(base + "_n.png", cv.w, cv.h, nrows)

    res = "res://art/" + name
    with open(base + ".tres", "w") as f:
        f.write('[gd_resource type="CanvasTexture" load_steps=3 format=3]\n\n'
                '[ext_resource type="Texture2D" path="%s.png" id="1_diffuse"]\n'
                '[ext_resource type="Texture2D" path="%s_n.png" id="2_normal"]\n\n'
                '[resource]\ndiffuse_texture = ExtResource("1_diffuse")\n'
                'normal_texture = ExtResource("2_normal")\n' % (res, res))
    print("wrote art/%s %dx%d" % (name, cv.w, cv.h))
