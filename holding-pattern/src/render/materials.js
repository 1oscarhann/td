import * as THREE from 'three';
import { BUILD, TONES } from '../config/palette.js';

// Shared flat-colour materials. Colour comes from materials only, never textures.
const cache = new Map();

export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...opts });
  cache.set(key, m);
  return m;
}

export function basic(color, opts = {}) {
  const key = `basic|${color}|${JSON.stringify(opts)}`;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, ...opts });
  cache.set(key, m);
  return m;
}

export const M = {
  grass: mat(BUILD.grass, { roughness: 0.95 }),
  grassDark: mat(TONES.grassDark, { roughness: 0.95 }),
  grassLight: mat(TONES.grassLight, { roughness: 0.95 }),
  tarmac: mat(BUILD.tarmac, { roughness: 0.9 }),
  tarmacDark: mat(TONES.tarmacDark, { roughness: 0.9 }),
  tarmacLight: mat(TONES.tarmacLight, { roughness: 0.9 }),
  paint: mat(BUILD.paint, { roughness: 0.7 }),
  glass: mat(BUILD.glass, { roughness: 0.08, metalness: 0.25, envMapIntensity: 1.6 }),
  glassClear: new THREE.MeshStandardMaterial({ color: BUILD.glass, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false, envMapIntensity: 1.8 }),
  concrete: mat(BUILD.concrete, { roughness: 0.85 }),
  concreteDark: mat(TONES.concreteDark, { roughness: 0.85 }),
  floor: mat(TONES.floor, { roughness: 0.55 }),
  hivis: mat(BUILD.hivis, { roughness: 0.6 }),
  metal: mat(TONES.metal, { roughness: 0.35, metalness: 0.6 }),
  dark: mat(TONES.dark, { roughness: 0.6 }),
  tyre: mat(TONES.tyre, { roughness: 0.9 }),
  window: mat(TONES.window, { roughness: 0.2, metalness: 0.3 }),
  white: mat(0xffffff, { roughness: 0.6 }),
  road: mat(TONES.road, { roughness: 0.92 }),
  trunk: mat(TONES.trunk, { roughness: 0.9 }),
  treeA: mat(TONES.treeA, { roughness: 0.9, flatShading: true }),
  treeB: mat(TONES.treeB, { roughness: 0.9, flatShading: true }),
  treeC: mat(TONES.treeC, { roughness: 0.9, flatShading: true }),
  red: mat(0xd94848, { roughness: 0.6 }),
};
