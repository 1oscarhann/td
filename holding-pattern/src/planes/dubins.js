// Shortest Dubins path (fixed turn radius) between two poses on the ground
// plane. Poses use { x, z, th } with th = atan2(dz, dx). Returns sampled
// points [{ x, z }] (spacing ~step metres) and the total length.
const TAU = Math.PI * 2;
const mod2pi = (a) => a - TAU * Math.floor(a / TAU);

function words(alpha, beta, d) {
  const sa = Math.sin(alpha), sb = Math.sin(beta), ca = Math.cos(alpha), cb = Math.cos(beta);
  const cab = Math.cos(alpha - beta);
  const out = [];
  // LSL
  {
    const tmp0 = d + sa - sb;
    const p2 = 2 + d * d - 2 * cab + 2 * d * (sa - sb);
    if (p2 >= 0) {
      const tmp1 = Math.atan2(cb - ca, tmp0);
      out.push({ type: 'LSL', t: mod2pi(-alpha + tmp1), p: Math.sqrt(p2), q: mod2pi(beta - tmp1) });
    }
  }
  // RSR
  {
    const tmp0 = d - sa + sb;
    const p2 = 2 + d * d - 2 * cab + 2 * d * (sb - sa);
    if (p2 >= 0) {
      const tmp1 = Math.atan2(ca - cb, tmp0);
      out.push({ type: 'RSR', t: mod2pi(alpha - tmp1), p: Math.sqrt(p2), q: mod2pi(-beta + tmp1) });
    }
  }
  // LSR
  {
    const p2 = -2 + d * d + 2 * cab + 2 * d * (sa + sb);
    if (p2 >= 0) {
      const p = Math.sqrt(p2);
      const tmp2 = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p);
      out.push({ type: 'LSR', t: mod2pi(-alpha + tmp2), p, q: mod2pi(-mod2pi(beta) + tmp2) });
    }
  }
  // RSL
  {
    const p2 = d * d - 2 + 2 * cab - 2 * d * (sa + sb);
    if (p2 >= 0) {
      const p = Math.sqrt(p2);
      const tmp2 = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p);
      out.push({ type: 'RSL', t: mod2pi(alpha - tmp2), p, q: mod2pi(beta - tmp2) });
    }
  }
  // RLR
  {
    const tmp = (6 - d * d + 2 * cab + 2 * d * (sa - sb)) / 8;
    if (Math.abs(tmp) <= 1) {
      const p = mod2pi(TAU - Math.acos(tmp));
      const t = mod2pi(alpha - Math.atan2(ca - cb, d - sa + sb) + p / 2);
      out.push({ type: 'RLR', t, p, q: mod2pi(alpha - beta - t + p) });
    }
  }
  // LRL
  {
    const tmp = (6 - d * d + 2 * cab + 2 * d * (-sa + sb)) / 8;
    if (Math.abs(tmp) <= 1) {
      const p = mod2pi(TAU - Math.acos(tmp));
      const t = mod2pi(-alpha - Math.atan2(ca - cb, d + sa - sb) + p / 2);
      out.push({ type: 'LRL', t, p, q: mod2pi(mod2pi(beta) - alpha - t + p) });
    }
  }
  return out;
}

function stepSeg(type, len, pose) {
  const { x, z, th } = pose;
  if (type === 'L') return { x: x + Math.sin(th + len) - Math.sin(th), z: z - Math.cos(th + len) + Math.cos(th), th: th + len };
  if (type === 'R') return { x: x - Math.sin(th - len) + Math.sin(th), z: z + Math.cos(th - len) - Math.cos(th), th: th - len };
  return { x: x + Math.cos(th) * len, z: z + Math.sin(th) * len, th };
}

export function dubins(q0, q1, rho, step = 12) {
  const dx = q1.x - q0.x, dz = q1.z - q0.z;
  const D = Math.hypot(dx, dz);
  const d = D / rho;
  const theta = mod2pi(Math.atan2(dz, dx));
  const alpha = mod2pi(q0.th - theta);
  const beta = mod2pi(q1.th - theta);
  const cands = words(alpha, beta, d);
  if (!cands.length) return null;
  let best = cands[0];
  for (const c of cands) if (c.t + c.p + c.q < best.t + best.p + best.q) best = c;
  // sample in normalised space (unit radius, origin at q0)
  const pts = [{ x: q0.x, z: q0.z }];
  let pose = { x: 0, z: 0, th: q0.th };
  const lens = [best.t, best.p, best.q];
  const stepN = step / rho;
  for (let k = 0; k < 3; k++) {
    const type = best.type[k];
    const L = lens[k];
    const n = Math.max(1, Math.ceil(L / stepN));
    const start = pose;
    for (let i = 1; i <= n; i++) {
      const p = stepSeg(type, (L * i) / n, start);
      pts.push({ x: q0.x + p.x * rho, z: q0.z + p.z * rho });
      if (i === n) pose = p;
    }
  }
  return { pts, length: (best.t + best.p + best.q) * rho, type: best.type };
}

// convert our yaw (forward = (sin yaw, cos yaw)) to dubins theta and back
export const yawToTh = (yaw) => Math.atan2(Math.cos(yaw), Math.sin(yaw));
export const thToYaw = (th) => Math.atan2(Math.cos(th), Math.sin(th));
