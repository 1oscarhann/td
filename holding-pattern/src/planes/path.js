import { clamp } from '../core/math.js';

// A ground path: polyline with rounded corners, arc-length lookup and a speed
// profile (corner limits + braking so the plane stops at the end).
export class Path {
  // pts: [{ x, z, v? }] where v caps the speed of the segment starting there
  constructor(pts, { radius = 9, cruise = 13, decel = 2.4, endSpeed = 0, latAccel = 2.8, minTurn = 3.2 } = {}) {
    const raw = [];
    for (const p of pts) {
      const last = raw[raw.length - 1];
      if (last && Math.hypot(p.x - last.x, p.z - last.z) < 0.05) {
        if (p.v !== undefined) last.v = p.v;
        continue;
      }
      raw.push({ x: p.x, z: p.z, v: p.v ?? cruise, r: p.r });
    }
    // drop points in the middle of straight runs so corners get a full radius
    for (let i = raw.length - 2; i > 0; i--) {
      const a = raw[i - 1], p = raw[i], b = raw[i + 1];
      const cross = (p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x);
      const dot = (p.x - a.x) * (b.x - p.x) + (p.z - a.z) * (b.z - p.z);
      if (Math.abs(cross) < 1e-6 && dot > 0 && p.v === a.v && p.r === undefined) raw.splice(i, 1);
    }
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i];
      if (i === 0 || i === raw.length - 1) {
        out.push(p);
        continue;
      }
      const a = raw[i - 1], b = raw[i + 1];
      let d1x = p.x - a.x, d1z = p.z - a.z;
      let d2x = b.x - p.x, d2z = b.z - p.z;
      const l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
      d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
      const dot = clamp(d1x * d2x + d1z * d2z, -1, 1);
      const th = Math.acos(dot);
      if (th < 0.03 || th > 2.9) {
        out.push(p);
        continue;
      }
      let t = (p.r ?? radius) * Math.tan(th / 2);
      t = Math.min(t, l1 * 0.5, l2 * 0.5);
      const A = { x: p.x - d1x * t, z: p.z - d1z * t };
      const B = { x: p.x + d2x * t, z: p.z + d2z * t };
      const n = Math.max(3, Math.ceil(th * 7));
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        const w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
        out.push({ x: w0 * A.x + w1 * p.x + w2 * B.x, z: w0 * A.z + w1 * p.z + w2 * B.z, v: k === n ? p.v : a.v });
      }
    }
    const n = out.length;
    this.x = new Float64Array(n);
    this.z = new Float64Array(n);
    this.s = new Float64Array(n);
    this.vmax = new Float64Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      this.x[i] = out[i].x;
      this.z[i] = out[i].z;
      if (i > 0) acc += Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z);
      this.s[i] = acc;
      this.vmax[i] = out[i].v;
    }
    this.length = acc;
    this.n = n;
    // corner speed limits from local curvature
    for (let i = 1; i < n - 1; i++) {
      const ax = this.x[i] - this.x[i - 1], az = this.z[i] - this.z[i - 1];
      const bx = this.x[i + 1] - this.x[i], bz = this.z[i + 1] - this.z[i];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      if (la < 1e-6 || lb < 1e-6) continue;
      const ang = Math.acos(clamp((ax * bx + az * bz) / (la * lb), -1, 1));
      if (ang < 0.01) continue;
      const R = (la + lb) / 2 / ang;
      const v = Math.max(minTurn, Math.sqrt(latAccel * R));
      this.vmax[i] = Math.min(this.vmax[i], v);
      this.vmax[i - 1] = Math.min(this.vmax[i - 1], Math.max(v, this.vmax[i - 1] * 0.999));
    }
    // segment caps (before braking) let vmaxAt() brake along long straights
    this.cap = Float64Array.from(this.vmax);
    // braking pass (and stop at the end)
    if (n) this.vmax[n - 1] = Math.min(this.vmax[n - 1], endSpeed);
    for (let i = n - 2; i >= 0; i--) {
      const ds = this.s[i + 1] - this.s[i];
      this.vmax[i] = Math.min(this.vmax[i], Math.sqrt(this.vmax[i + 1] ** 2 + 2 * decel * ds));
    }
    this.decel = decel;
    this._i = 0;
  }

  // index of the segment containing s (cached walk, paths are followed forward)
  seg(s) {
    let i = this._i;
    if (i >= this.n - 1) i = Math.max(0, this.n - 2);
    while (i > 0 && this.s[i] > s) i--;
    while (i < this.n - 2 && this.s[i + 1] < s) i++;
    this._i = i;
    return i;
  }

  sample(s, out = {}) {
    if (this.n < 2) {
      out.x = this.x[0] || 0;
      out.z = this.z[0] || 0;
      out.hx = 0;
      out.hz = 1;
      return out;
    }
    s = clamp(s, 0, this.length);
    const i = this.seg(s);
    const l = this.s[i + 1] - this.s[i] || 1e-6;
    const u = (s - this.s[i]) / l;
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * u;
    out.z = this.z[i] + (this.z[i + 1] - this.z[i]) * u;
    // smooth heading: blend tangents of neighbouring segments
    let hx = this.x[i + 1] - this.x[i], hz = this.z[i + 1] - this.z[i];
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl;
    hz /= hl;
    out.hx = hx;
    out.hz = hz;
    return out;
  }

  // speed limit at s: the segment's cap, but braking in time for what's ahead
  vmaxAt(s) {
    if (this.n < 2) return 0;
    s = clamp(s, 0, this.length);
    const i = this.seg(s);
    const brake = Math.sqrt(this.vmax[i + 1] ** 2 + 2 * this.decel * Math.max(0, this.s[i + 1] - s));
    return Math.min(Math.min(this.cap[i], this.cap[i + 1] > this.cap[i] ? this.cap[i + 1] : this.cap[i]), brake);
  }

  nearestS(x, z, from = 0) {
    let best = Infinity, bs = 0;
    for (let i = 0; i < this.n - 1; i++) {
      if (this.s[i + 1] < from) continue;
      const ax = this.x[i], az = this.z[i];
      const bx = this.x[i + 1], bz = this.z[i + 1];
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz || 1e-9;
      const u = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const px = ax + dx * u, pz = az + dz * u;
      const d = (x - px) ** 2 + (z - pz) ** 2;
      if (d < best - 1e-6) {
        best = d;
        bs = this.s[i] + u * Math.sqrt(l2);
      }
    }
    return { s: bs, d: Math.sqrt(best) };
  }
}
