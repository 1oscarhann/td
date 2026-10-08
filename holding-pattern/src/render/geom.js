import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Geometry helpers for chunky, slightly rounded toy shapes.

const geoCache = new Map();
export function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

export function rbox(w, h, d, r = 0.1, seg = 2) {
  const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  return new RoundedBoxGeometry(w, h, d, seg, Math.max(rr, 0.001));
}

// Return a non-indexed copy with only position/normal (and optionally uv) so
// mixed geometries merge cleanly.
export function clean(g, keepUv = false) {
  let out = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && !(keepUv && name === 'uv')) out.deleteAttribute(name);
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}

// Transform a geometry in place and return it.
export function place(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  return g;
}

export function merge(list) {
  const parts = list.filter(Boolean).map((g) => clean(g));
  if (!parts.length) return new THREE.BufferGeometry();
  const out = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return out;
}

// Groups geometries by material so a whole structure becomes a few meshes.
export class MeshBuilder {
  constructor() {
    this.parts = new Map();
  }
  add(material, geometry) {
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(geometry);
    return geometry;
  }
  build({ cast = true, receive = true } = {}) {
    const group = new THREE.Group();
    for (const [material, list] of this.parts) {
      const g = merge(list);
      list.forEach((x) => x.dispose());
      const m = new THREE.Mesh(g, material);
      m.castShadow = cast && !material.transparent;
      m.receiveShadow = receive;
      group.add(m);
    }
    this.parts.clear();
    return group;
  }
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
  });
}

// Simple symmetric airfoil outline (closed loop, chord 1 from LE at 0 to TE at 1).
export function airfoil(n = 10, thickness = 0.12) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = (1 - Math.cos((i / n) * Math.PI)) / 2;
    const yt = 5 * thickness * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
    pts.push([u, yt]);
  }
  const loop = [];
  for (let i = n; i >= 0; i--) loop.push([pts[i][0], pts[i][1]]); // TE -> LE upper
  for (let i = 1; i < n; i++) loop.push([pts[i][0], -pts[i][1]]); // LE -> TE lower
  return loop;
}

// Loft a lifting surface between sections. Each section: { o: Vector3 leading
// edge point, c: chord, t: thickness factor }. `chordDir` points from leading
// to trailing edge, `thickDir` is the thickness normal. Caps the last section.
export function loft(sections, chordDir, thickDir, { n = 10, flip = false, capStart = true } = {}) {
  const foil = airfoil(n);
  const ring = foil.length;
  const pos = [];
  const idx = [];
  const v = new THREE.Vector3();
  for (const s of sections) {
    for (const [u, y] of foil) {
      v.copy(s.o).addScaledVector(chordDir, u * s.c).addScaledVector(thickDir, y * s.c * (s.t ?? 1) * 8.3);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let si = 0; si < sections.length - 1; si++) {
    for (let i = 0; i < ring; i++) {
      const a = si * ring + i;
      const b = si * ring + ((i + 1) % ring);
      const c = (si + 1) * ring + i;
      const d = (si + 1) * ring + ((i + 1) % ring);
      if (flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const capAt = (si, reverse) => {
    const base = si * ring;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < ring; i++) {
      cx += pos[(base + i) * 3];
      cy += pos[(base + i) * 3 + 1];
      cz += pos[(base + i) * 3 + 2];
    }
    const ci = pos.length / 3;
    pos.push(cx / ring, cy / ring, cz / ring);
    for (let i = 0; i < ring; i++) {
      const a = base + i, b = base + ((i + 1) % ring);
      if (reverse) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  };
  capAt(sections.length - 1, flip);
  if (capStart) capAt(0, !flip);
  orientOutward(pos, idx);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Flip triangle winding when the signed volume says the surface faces inward.
export function orientOutward(pos, idx) {
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
    const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
}

// Lathe around the Z axis (profile points are [radius, z]).
export function latheZ(profile, segments = 24) {
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(Math.max(r, 0.0001), z)), segments);
  g.rotateX(Math.PI / 2);
  return g;
}

export function cyl(rTop, rBottom, h, seg = 16) {
  return new THREE.CylinderGeometry(rTop, rBottom, h, seg);
}
