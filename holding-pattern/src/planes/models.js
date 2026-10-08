import * as THREE from 'three';
import { AIRLINES } from '../config/airlines.js';
import { M, mat, basic } from '../render/materials.js';
import { loft, latheZ, merge, place, rbox } from '../render/geom.js';
import { liveryMaterial } from './livery.js';

// Procedural aircraft. Geometry is built once per size class and shared;
// materials once per airline. Each plane instance is a light Group of meshes
// plus handles to its moving parts (props/fans, gear, flaps, lights).

const SPECS = {
  small: {
    L: 22, R: 1.38, noseLen: 2.9, tailLen: 6.6, upsweep: 0.62, ry: 1.05, gearH: 2.25,
    wing: { high: true, z: 1.4, rootC: 2.55, tipC: 1.45, half: 13, sweep: 2, dihedral: -1, t: 0.15, xRoot: 0.2 },
    tail: { type: 'cruciform', finH: 4.4, finRootC: 4.3, finTipC: 2.1, finSweep: 34, stabHalf: 4.1, stabRootC: 2.0, stabTipC: 1.1, stabSweep: 12, stabY: 1.9 },
    engines: { type: 'prop', x: 4.15, z: 2.4, r: 0.62, len: 5.6 },
    gear: { nose: { z: 8.4, len: 1.6 }, main: { x: 4.15, z: 0.4, len: 2.1, inNacelle: true, wheels: 2 } },
    winPitch: 0.95, cockpit: 1.35,
  },
  regional: {
    L: 30, R: 1.5, noseLen: 3.4, tailLen: 8.6, upsweep: 0.6, ry: 1.04, gearH: 2.55,
    wing: { high: false, z: 1.6, rootC: 4.5, tipC: 1.45, half: 12.4, sweep: 25, dihedral: 4, t: 0.13, xRoot: 0.3 },
    tail: { type: 'T', finH: 4.9, finRootC: 4.4, finTipC: 2.6, finSweep: 40, stabHalf: 4.5, stabRootC: 2.4, stabTipC: 1.2, stabSweep: 26 },
    engines: { type: 'rear', x: 2.55, z: -8.6, y: 0.75, r: 0.82, len: 4.1 },
    gear: { nose: { z: 11.4, len: 1.75 }, main: { x: 2.4, z: -0.9, len: 1.75, wheels: 2 } },
    winPitch: 0.98, cockpit: 1.45,
  },
  narrow: {
    L: 37, R: 2.05, noseLen: 4.1, tailLen: 10.2, upsweep: 0.58, ry: 1.03, gearH: 3.25,
    wing: { high: false, z: 2.6, rootC: 6.4, tipC: 1.6, half: 17.2, sweep: 25, dihedral: 5, t: 0.13, xRoot: 0.4, winglet: 1.9 },
    tail: { type: 'conventional', finH: 6.1, finRootC: 5.8, finTipC: 2.4, finSweep: 38, stabHalf: 6.3, stabRootC: 3.1, stabTipC: 1.2, stabSweep: 30, stabY: 0.35 },
    engines: { type: 'wing', x: 5.9, z: 4.6, r: 1.12, len: 4.4 },
    gear: { nose: { z: 13.6, len: 2.2 }, main: { x: 3.8, z: -0.9, len: 2.4, wheels: 2 } },
    winPitch: 1.0, cockpit: 1.75,
  },
};

export function planeSpec(cls) {
  return SPECS[cls];
}

const geoCache = new Map();

// ---------------------------------------------------------------------------
// Fuselage with livery coordinates
function fuselage(spec) {
  const { L, R, noseLen, tailLen, upsweep, ry } = spec;
  const seg = 30;
  const z0 = -L / 2, z1 = L / 2;
  const stations = [];
  const nTail = 18, nNose = 18;
  for (let i = 0; i <= nTail; i++) {
    const t = i / nTail;
    stations.push(z0 + tailLen * (1 - Math.cos((t * Math.PI) / 2)) * 1);
  }
  const cabin0 = z0 + tailLen, cabin1 = z1 - noseLen;
  for (let i = 1; i < 5; i++) stations.push(cabin0 + ((cabin1 - cabin0) * i) / 5);
  for (let i = 0; i <= nNose; i++) {
    const t = i / nNose;
    stations.push(cabin1 + noseLen * Math.sin((t * Math.PI) / 2));
  }
  const prof = (z) => {
    if (z < cabin0) {
      const t = (cabin0 - z) / tailLen;
      return { r: R * (1 - 0.84 * Math.pow(t, 1.35)), yc: R * upsweep * Math.pow(t, 1.7) };
    }
    if (z > cabin1) {
      const t = Math.min(1, (z - cabin1) / noseLen);
      return { r: R * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.04 * t), yc: -R * 0.2 * t * t };
    }
    return { r: R, yc: 0 };
  };
  const pos = [], liv = [], idx = [];
  for (const z of stations) {
    const { r, yc } = prof(z);
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const s = Math.sin(th), c = Math.cos(th);
      pos.push(s * r, c * r * ry + yc, z);
      liv.push(z, c, s);
    }
  }
  const ring = seg + 1;
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // tail cap
  const tc = pos.length / 3;
  const t0 = prof(stations[0]);
  pos.push(0, t0.yc, stations[0] - 0.05);
  liv.push(stations[0], 0, 0);
  for (let j = 0; j < seg; j++) idx.push(tc, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aLiv', new THREE.Float32BufferAttribute(liv, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // orientation sanity: normals should point away from the axis
  const n = g.attributes.normal;
  const p = g.attributes.position;
  const mid = Math.floor(stations.length / 2) * ring + 7;
  if (n.getX(mid) * p.getX(mid) + n.getY(mid) * p.getY(mid) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return { geo: g, prof, cabin0, cabin1 };
}

// ---------------------------------------------------------------------------
function wingGeo(spec) {
  const w = spec.wing;
  const R = spec.R;
  const yRoot = w.high ? R * 0.92 : -R * 0.42;
  const sweep = (w.sweep * Math.PI) / 180, dih = (w.dihedral * Math.PI) / 180;
  const parts = [];
  const flaps = [];
  for (const side of [1, -1]) {
    const x0 = w.xRoot, x1 = w.half;
    const span = x1 - x0;
    const tipLE = new THREE.Vector3(side * x1, yRoot + Math.tan(dih) * span, w.z + w.rootC * 0.15 - Math.tan(sweep) * span);
    const rootLE = new THREE.Vector3(side * x0, yRoot, w.z + w.rootC * 0.15);
    // kink at 35% span gives an airliner-ish trailing edge
    const k = 0.35;
    const kinkLE = rootLE.clone().lerp(tipLE, k);
    const kinkC = w.high ? w.rootC + (w.tipC - w.rootC) * k : w.rootC * 0.62;
    parts.push(
      loft(
        [
          { o: rootLE, c: w.rootC, t: w.t },
          { o: kinkLE, c: kinkC, t: w.t * 0.9 },
          { o: tipLE, c: w.tipC, t: w.t * 0.75 },
        ],
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 1, 0),
        { n: 10 },
      ),
    );
    if (w.winglet) {
      const wl = loft(
        [
          { o: tipLE.clone().add(new THREE.Vector3(0, -0.05, 0)), c: w.tipC * 0.95, t: 0.09 },
          { o: tipLE.clone().add(new THREE.Vector3(side * 0.35, w.winglet, -w.tipC * 0.55)), c: w.tipC * 0.42, t: 0.08 },
        ],
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(side, 0, 0),
        { n: 8 },
      );
      parts.push(wl);
    }
    // flap panel along the inboard trailing edge (hinged, built at the hinge)
    const fx0 = x0 + 0.4, fx1 = x0 + span * 0.62;
    const chordAt = (x) => {
      const t = (x - x0) / span;
      if (t < k) return w.rootC + (kinkC - w.rootC) * (t / k);
      return kinkC + (w.tipC - kinkC) * ((t - k) / (1 - k));
    };
    const leAt = (x) => rootLE.clone().lerp(tipLE, (x - x0) / span);
    const c0 = chordAt(fx0), c1 = chordAt(fx1);
    const h0 = leAt(fx0).add(new THREE.Vector3(0, 0, -c0 * 0.74));
    const h1 = leAt(fx1).add(new THREE.Vector3(0, 0, -c1 * 0.74));
    h0.x = side * fx0;
    h1.x = side * fx1;
    const fg = loft(
      [
        { o: h0.clone(), c: c0 * 0.3, t: 0.1 },
        { o: h1.clone(), c: c1 * 0.3, t: 0.1 },
      ],
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 1, 0),
      { n: 6 },
    );
    fg.translate(-h0.x, -h0.y + 0.02, -h0.z);
    flaps.push({ geo: fg, hinge: h0, axis: h1.clone().sub(h0).normalize(), side });
  }
  // wing-body fairing
  let fair;
  if (spec.wing.high) {
    fair = place(rbox(2.2, 0.9, w.rootC * 1.15, 0.4), 0, R * 0.98, w.z - w.rootC * 0.38);
  } else {
    fair = new THREE.SphereGeometry(1, 20, 10);
    place(fair, 0, -R * 0.62, w.z - w.rootC * 0.4, 0, 0, 0, R * 0.95, R * 0.5, w.rootC * 0.85);
  }
  parts.push(fair);
  const tipL = new THREE.Vector3(w.half, yRoot + Math.tan(dih) * (w.half - w.xRoot), w.z + w.rootC * 0.15 - Math.tan(sweep) * (w.half - w.xRoot) - w.tipC * 0.5);
  return { geo: merge(parts), flaps, yRoot, tipL };
}

// ---------------------------------------------------------------------------
function tailGeo(spec) {
  const t = spec.tail;
  const { L, R } = spec;
  const z0 = -L / 2;
  const finRootZ = z0 + t.finRootC + 0.6; // leading edge at root
  const yBase = R * spec.upsweep * 0.75 + R * 0.12;
  const sw = (t.finSweep * Math.PI) / 180;
  const finTipLE = new THREE.Vector3(0, yBase + t.finH, finRootZ - Math.tan(sw) * t.finH);
  const fin = loft(
    [
      { o: new THREE.Vector3(0, yBase - 0.6, finRootZ + 0.3), c: t.finRootC + 0.3, t: 0.12 },
      { o: finTipLE, c: t.finTipC, t: 0.1 },
    ],
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 0, 0),
    { n: 10 },
  );
  // dorsal fillet
  const fillet = loft(
    [
      { o: new THREE.Vector3(0, yBase - 0.4, finRootZ + 2.4), c: 2.6, t: 0.08 },
      { o: new THREE.Vector3(0, yBase + 0.5, finRootZ + 0.2), c: 0.9, t: 0.1 },
    ],
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 0, 0),
    { n: 6 },
  );
  const stabParts = [];
  const ss = (t.stabSweep * Math.PI) / 180;
  let stabY, stabZ;
  if (t.type === 'T') {
    stabY = finTipLE.y - 0.15;
    stabZ = finTipLE.z + 0.2;
  } else if (t.type === 'cruciform') {
    stabY = yBase + t.stabY;
    stabZ = finRootZ - Math.tan(sw) * t.stabY - 0.1;
  } else {
    stabY = t.stabY;
    stabZ = z0 + t.stabRootC + 1.0;
  }
  for (const side of [1, -1]) {
    stabParts.push(
      loft(
        [
          { o: new THREE.Vector3(0, stabY, stabZ), c: t.stabRootC, t: 0.1 },
          { o: new THREE.Vector3(side * t.stabHalf, stabY + (t.type === 'conventional' ? 0.35 : 0.05), stabZ - Math.tan(ss) * t.stabHalf), c: t.stabTipC, t: 0.09 },
        ],
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 1, 0),
        { n: 8 },
      ),
    );
  }
  const emblemAt = { y: yBase + t.finH * 0.5, z: finRootZ - Math.tan(sw) * t.finH * 0.5 - (t.finRootC + (t.finTipC - t.finRootC) * 0.5) * 0.45, c: t.finRootC + (t.finTipC - t.finRootC) * 0.5, size: t.finH * 0.42 };
  return { fin: merge([fin, fillet]), stab: merge(stabParts), emblemAt, tailTop: finTipLE };
}

// ---------------------------------------------------------------------------
function turbofan(r, len) {
  const h = len / 2;
  const outer = latheZ(
    [
      [r * 0.5, -h],
      [r * 0.72, -h + len * 0.22],
      [r * 0.95, -h + len * 0.55],
      [r, h - len * 0.25],
      [r * 0.96, h - 0.12],
      [r * 0.86, h],
      [r * 0.78, h - 0.1],
      [r * 0.76, h - 0.55],
    ],
    28,
  );
  const fanDisc = place(new THREE.CircleGeometry(r * 0.77, 28), 0, 0, h - 0.56);
  const exhaustDisc = place(new THREE.CircleGeometry(r * 0.5, 20), 0, 0, -h + 0.01, Math.PI);
  const cone = latheZ([[0.001, -h - 0.9], [r * 0.38, -h + 0.05]], 18);
  return { shell: outer, dark: merge([fanDisc, exhaustDisc]), cone };
}

function fanBlades(r) {
  const parts = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const b = new THREE.BoxGeometry(0.16 * r, r * 0.66, 0.04);
    b.translate(0, r * 0.38, 0);
    b.rotateY(0.5);
    b.rotateZ((i / n) * Math.PI * 2);
    parts.push(b);
  }
  const spinner = latheZ([[r * 0.24, 0], [r * 0.18, 0.18], [0.001, 0.45]], 16);
  return { blades: merge(parts), spinner };
}

function propBlades(n = 6, len = 1.75) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const b = new THREE.BoxGeometry(0.26, len, 0.05);
    const pa = b.attributes.position;
    for (let k = 0; k < pa.count; k++) {
      const y = pa.getY(k) / len + 0.5; // 0 root .. 1 tip
      pa.setX(k, pa.getX(k) * (1 - y * 0.45) + 0.04 * Math.sin(y * 3));
    }
    b.translate(0, len / 2 + 0.22, 0);
    b.rotateY(0.42);
    b.rotateZ((i / n) * Math.PI * 2);
    parts.push(b);
  }
  return merge(parts);
}

function propNacelle(r, len) {
  const h = len / 2;
  return latheZ(
    [
      [0.001, -h - 0.4],
      [r * 0.55, -h + 0.2],
      [r * 0.95, -h + len * 0.35],
      [r, h - len * 0.25],
      [r * 0.78, h - 0.25],
      [r * 0.55, h],
    ],
    20,
  );
}

function gearUnit(len, wheels, wheelR, track) {
  const strut = place(new THREE.CylinderGeometry(0.11, 0.13, len, 8), 0, -len / 2, 0);
  const brace = place(new THREE.CylinderGeometry(0.06, 0.06, len * 0.6, 6), 0, -len * 0.45, -0.35, 0.5);
  const axle = place(new THREE.CylinderGeometry(0.07, 0.07, track + 0.2, 8), 0, -len, 0, 0, 0, Math.PI / 2);
  const tyres = [];
  const hubs = [];
  for (let i = 0; i < wheels; i++) {
    const x = wheels === 1 ? 0 : (i - (wheels - 1) / 2) * track;
    tyres.push(place(new THREE.CylinderGeometry(wheelR, wheelR, wheelR * 0.62, 18), x, -len, 0, 0, 0, Math.PI / 2));
    hubs.push(place(new THREE.CylinderGeometry(wheelR * 0.5, wheelR * 0.5, wheelR * 0.66, 12), x, -len, 0, 0, 0, Math.PI / 2));
  }
  return { metal: merge([strut, brace, axle, ...hubs]), tyre: merge(tyres) };
}

// ---------------------------------------------------------------------------
function buildClassGeometry(cls) {
  if (geoCache.has(cls)) return geoCache.get(cls);
  const spec = SPECS[cls];
  const fus = fuselage(spec);
  const wing = wingGeo(spec);
  const tail = tailGeo(spec);
  const e = spec.engines;
  const out = { spec, fus, wing, tail };
  const R = spec.R;
  // engines
  if (e.type === 'wing') {
    const tf = turbofan(e.r, e.len);
    const fan = fanBlades(e.r);
    const yC = wing.yRoot + Math.tan((spec.wing.dihedral * Math.PI) / 180) * (e.x - spec.wing.xRoot) - e.r * 1.05;
    const mounts = [1, -1].map((s) => new THREE.Vector3(s * e.x, yC, e.z));
    const shells = [], darks = [], cones = [], pylons = [];
    for (const m of mounts) {
      shells.push(tf.shell.clone().translate(m.x, m.y, m.z));
      darks.push(tf.dark.clone().translate(m.x, m.y, m.z));
      cones.push(tf.cone.clone().translate(m.x, m.y, m.z));
      pylons.push(place(rbox(0.34, e.r * 0.9, e.len * 0.95, 0.12), m.x, m.y + e.r * 0.82, m.z - e.len * 0.15));
    }
    out.engine = { shell: merge(shells), dark: merge(darks), metal: merge(cones), wingPart: merge(pylons), fan, fanPos: mounts.map((m) => new THREE.Vector3(m.x, m.y, m.z + e.len / 2 - 0.5)) };
  } else if (e.type === 'rear') {
    const tf = turbofan(e.r, e.len);
    const fan = fanBlades(e.r);
    const mounts = [1, -1].map((s) => new THREE.Vector3(s * (R + e.r * 0.95 + 0.25), e.y, e.z));
    const shells = [], darks = [], cones = [], pylons = [];
    for (const m of mounts) {
      shells.push(tf.shell.clone().translate(m.x, m.y, m.z));
      darks.push(tf.dark.clone().translate(m.x, m.y, m.z));
      cones.push(tf.cone.clone().translate(m.x, m.y, m.z));
      pylons.push(place(rbox(e.r * 1.6, 0.3, e.len * 0.55, 0.1), m.x * 0.62, m.y, m.z - 0.2));
    }
    out.engine = { shell: merge(shells), dark: merge(darks), metal: merge(cones), wingPart: merge(pylons), fan, fanPos: mounts.map((m) => new THREE.Vector3(m.x, m.y, m.z + e.len / 2 - 0.5)) };
  } else {
    const nac = propNacelle(e.r, e.len);
    const yC = wing.yRoot - e.r * 0.55;
    const mounts = [1, -1].map((s) => new THREE.Vector3(s * e.x, yC, e.z - e.len * 0.28));
    const shells = mounts.map((m) => nac.clone().translate(m.x, m.y, m.z));
    out.engine = {
      shell: merge(shells),
      prop: propBlades(6, 1.72),
      spinner: latheZ([[0.34, 0], [0.26, 0.35], [0.001, 0.85]], 16),
      propPos: mounts.map((m) => new THREE.Vector3(m.x, m.y, m.z + e.len / 2 + 0.05)),
    };
  }
  // landing gear
  const g = spec.gear;
  const wheelR = cls === 'narrow' ? 0.58 : cls === 'regional' ? 0.46 : 0.42;
  out.noseGear = gearUnit(g.nose.len, 2, wheelR * 0.72, 0.42);
  out.mainGear = gearUnit(g.main.len, g.main.wheels, wheelR, wheelR * 0.75 + 0.18);
  out.wheelR = wheelR;
  // nose gear pivot: underside of the fuselage
  out.nosePivot = new THREE.Vector3(0, -R * 0.62, g.nose.z);
  const mainY = g.main.inNacelle ? wing.yRoot - e.r * 0.9 : -R * 0.55;
  out.mainPivots = [1, -1].map((s) => new THREE.Vector3(s * g.main.x, mainY, g.main.z));
  // scale gear lengths so wheels touch the ground plane at -gearH
  out.noseLen = spec.gearH - R * 0.62 - out.wheelR * 0.72;
  out.mainLen = spec.gearH + mainY - out.wheelR;
  out.noseGear = gearUnit(out.noseLen, 2, wheelR * 0.72, 0.42);
  out.mainGear = gearUnit(out.mainLen, g.main.wheels, wheelR, wheelR * 0.75 + 0.18);
  // window row & cockpit layout for the livery shader
  out.layout = {
    key: cls,
    R,
    noseZ: fus.cabin1 + spec.noseLen * (cls === 'small' ? 0.52 : 0.6),
    winZ0: fus.cabin0 + 0.6,
    winZ1: fus.cabin1 - spec.cockpit - 0.9,
    pitch: spec.winPitch,
    cockZ0: fus.cabin1 + 0.05,
    cockZ1: fus.cabin1 + spec.noseLen * 0.62,
    doorF: fus.cabin1 - 1.1,
    doorR: fus.cabin0 + 0.9,
    bellyY: cls === 'small' ? -0.5 : -0.45,
  };
  geoCache.set(cls, out);
  return out;
}

// ---------------------------------------------------------------------------
// Emblems for the tail fin
function emblemShapes(kind, size) {
  const parts = []; // [geometry, role]
  const s = size;
  if (kind === 'puffin') {
    const head = new THREE.CircleGeometry(s * 0.42, 24);
    parts.push([head, 'white']);
    const beak = new THREE.Shape();
    beak.moveTo(s * 0.18, s * 0.12);
    beak.lineTo(s * 0.62, -s * 0.02);
    beak.lineTo(s * 0.18, -s * 0.2);
    beak.closePath();
    parts.push([new THREE.ShapeGeometry(beak), 'accent', 0.01]);
    parts.push([place(new THREE.CircleGeometry(s * 0.07, 12), -s * 0.02, s * 0.08, 0), 'dark', 0.01]);
  } else if (kind === 'skylark') {
    for (let i = 0; i < 2; i++) {
      const sh = new THREE.Shape();
      const o = i * s * 0.32;
      sh.moveTo(-s * 0.55, -s * 0.05 + o);
      sh.quadraticCurveTo(-s * 0.1, s * 0.05 + o, s * 0.55, s * 0.35 + o);
      sh.quadraticCurveTo(0, s * 0.18 + o, -s * 0.55, -s * 0.22 + o);
      parts.push([new THREE.ShapeGeometry(sh, 8), 'accent']);
    }
  } else {
    const ring = new THREE.RingGeometry(s * 0.3, s * 0.42, 28, 1, 0, Math.PI);
    parts.push([place(ring, 0, -s * 0.05, 0), 'accent']);
    parts.push([place(new THREE.PlaneGeometry(s * 1.1, s * 0.09), 0, -s * 0.16, 0), 'accent']);
    parts.push([place(new THREE.CircleGeometry(s * 0.12, 16), 0, -s * 0.02, 0), 'accent']);
  }
  return parts;
}

function airlineMaterials(airlineId, cls, layout) {
  const a = AIRLINES[airlineId];
  const L = a.livery;
  return {
    body: liveryMaterial(airlineId, L, layout),
    tail: mat(L.tail, { roughness: 0.45 }),
    engine: mat(L.engine, { roughness: 0.4, metalness: 0.1 }),
    wing: mat(L.wing, { roughness: 0.5, metalness: 0.1 }),
    accent: mat(L.accent, { roughness: 0.45 }),
  };
}

const lightMats = {
  red: basic(new THREE.Color(5, 0.25, 0.2)),
  green: basic(new THREE.Color(0.2, 5, 0.6)),
  white: basic(new THREE.Color(4, 4, 4)),
  beacon: basic(new THREE.Color(6, 0.3, 0.2)),
  off: basic(new THREE.Color(0.25, 0.05, 0.05)),
};
const propDisc = new THREE.MeshBasicMaterial({ color: 0x2a2f38, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });

// ---------------------------------------------------------------------------
export function buildPlaneModel(cls, airlineId) {
  const G = buildClassGeometry(cls);
  const spec = G.spec;
  const mats = airlineMaterials(airlineId, cls, G.layout);
  const root = new THREE.Group(); // positioned at fuselage axis
  const add = (geo, material, parent = root, shadow = true) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  add(G.fus.geo, mats.body);
  add(G.wing.geo, mats.wing);
  add(G.tail.fin, mats.tail);
  add(G.tail.stab, cls === 'small' ? mats.tail : mats.wing);
  const parts = { props: [], fans: [], discs: [], gear: [], flaps: [], beacons: [], strobes: [] };
  // engines
  const E = G.engine;
  add(E.shell, mats.engine);
  if (E.dark) add(E.dark, M.dark, root, false);
  if (E.metal) add(E.metal, M.metal);
  if (E.wingPart) add(E.wingPart, mats.wing);
  if (E.fan) {
    for (const p of E.fanPos) {
      const g = new THREE.Group();
      g.position.copy(p);
      add(E.fan.blades, M.metal, g, false);
      add(E.fan.spinner, cls === 'narrow' ? M.white : M.dark, g, false);
      root.add(g);
      parts.fans.push(g);
    }
  }
  if (E.prop) {
    for (const p of E.propPos) {
      const g = new THREE.Group();
      g.position.copy(p);
      add(E.prop, M.dark, g, true);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.95, 28), propDisc);
      disc.visible = false;
      g.add(disc);
      parts.discs.push(disc);
      root.add(g);
      parts.props.push(g);
      const sp = add(E.spinner, mats.accent);
      sp.position.copy(p);
    }
  }
  // gear
  const mkGear = (pivot, unit, kind, side) => {
    const g = new THREE.Group();
    g.position.copy(pivot);
    add(unit.metal, M.metal, g);
    add(unit.tyre, M.tyre, g);
    root.add(g);
    parts.gear.push({ g, kind, side });
  };
  mkGear(G.nosePivot, G.noseGear, 'nose', 0);
  G.mainPivots.forEach((p, i) => mkGear(p, G.mainGear, spec.gear.main.inNacelle ? 'nacelle' : 'main', i === 0 ? 1 : -1));
  // flaps
  for (const f of G.wing.flaps) {
    const pivot = new THREE.Group();
    pivot.position.copy(f.hinge);
    add(f.geo, mats.wing, pivot, false);
    root.add(pivot);
    parts.flaps.push({ pivot, axis: f.axis, side: f.side, base: f.hinge.clone() });
  }
  // emblem on both sides of the fin
  const ea = G.tail.emblemAt;
  for (const side of [1, -1]) {
    for (const [geo, role, lift = 0] of emblemShapes(AIRLINES[airlineId].livery.emblem, ea.size)) {
      const gg = geo.clone();
      gg.rotateY((side * Math.PI) / 2);
      gg.translate(side * (ea.c * 0.062 + 0.05 + lift), ea.y, ea.z);
      const m = role === 'white' ? M.white : role === 'dark' ? M.dark : mats.accent;
      const mesh = add(gg, m, root, false);
      mesh.material = m;
      if (side < 0) mesh.material = m; // geometry mirrored by rotation, single-sided ok
    }
  }
  // lights
  const lamp = (r) => new THREE.SphereGeometry(r, 8, 6);
  const tip = G.wing.tipL;
  const red = add(lamp(0.18), lightMats.red, root, false);
  red.position.set(tip.x + 0.05, tip.y + (spec.wing.winglet ? 0.05 : 0), tip.z + 0.4);
  const green = add(lamp(0.18), lightMats.green, root, false);
  green.position.set(-tip.x - 0.05, tip.y + (spec.wing.winglet ? 0.05 : 0), tip.z + 0.4);
  const tail = add(lamp(0.16), lightMats.white, root, false);
  tail.position.set(0, G.fus.prof(-spec.L / 2 + 0.2).yc, -spec.L / 2 - 0.1);
  for (const [y, z] of [[spec.R * spec.ry + 0.12, 0.5], [-spec.R * spec.ry - 0.12, -1.5]]) {
    const b = add(lamp(0.2), lightMats.beacon, root, false);
    b.position.set(0, y, z);
    parts.beacons.push(b);
  }
  for (const s of [1, -1]) {
    const st = add(lamp(0.14), lightMats.white, root, false);
    st.position.set(s * (tip.x + 0.05), tip.y, tip.z - 0.3);
    st.visible = false;
    parts.strobes.push(st);
  }
  root.userData.parts = parts;
  root.userData.spec = spec;
  return { root, parts, spec, geo: G };
}

export { lightMats };
