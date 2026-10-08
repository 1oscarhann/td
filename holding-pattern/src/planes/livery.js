import * as THREE from 'three';

// Fuselage material: airline livery painted procedurally in the fragment
// shader from an undeformed (z, cosθ, sinθ) attribute, so cheatlines, window
// rows, the cockpit windscreen and doors stay crisp at any zoom with no textures.

const cache = new Map();

export function liveryMaterial(airlineId, livery, layout) {
  const key = `${airlineId}|${layout.key}`;
  if (cache.has(key)) return cache.get(key);
  const c = (h) => new THREE.Color(h);
  const uniforms = {
    uTop: { value: c(livery.top) },
    uBelly: { value: c(livery.belly) },
    uCheat: { value: c(livery.cheat) },
    uCheat2: { value: c(livery.cheat2) },
    uNose: { value: c(livery.nose) },
    uWin: { value: c(livery.window) },
    uNoseZ: { value: layout.noseZ },
    uWinZ: { value: new THREE.Vector2(layout.winZ0, layout.winZ1) },
    uPitch: { value: layout.pitch },
    uCock: { value: new THREE.Vector2(layout.cockZ0, layout.cockZ1) },
    uDoors: { value: new THREE.Vector2(layout.doorF, layout.doorR) },
    uR: { value: layout.R },
    uBellyY: { value: layout.bellyY ?? -0.45 },
    uNoseMode: { value: livery.emblem === 'puffin' ? 1 : livery.emblem === 'skylark' ? 2 : 0 },
  };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.05 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aLiv;\nvarying vec3 vLiv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLiv = aLiv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLiv;
        uniform vec3 uTop, uBelly, uCheat, uCheat2, uNose, uWin;
        uniform float uNoseZ, uPitch, uR, uBellyY, uNoseMode;
        uniform vec2 uWinZ, uCock, uDoors;
        float band(float v, float a, float b, float w) { return smoothstep(a - w, a + w, v) * (1.0 - smoothstep(b - w, b + w, v)); }
        float rrect(vec2 p, vec2 h, float r) { vec2 q = abs(p) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
        vec3 livery(out float isWin) {
          float z = vLiv.x, cy = vLiv.y, sx = vLiv.z;
          float w = max(fwidth(cy), 0.002) * 1.2;
          vec3 col = uTop;
          col = mix(col, uBelly, 1.0 - smoothstep(uBellyY - w, uBellyY + w, cy));
          col = mix(col, uCheat, band(cy, -0.31, -0.13, w));
          col = mix(col, uCheat2, band(cy, -0.40, -0.35, w));
          // nose cap
          float wz = max(fwidth(z), 0.002) * 1.2;
          float nose = smoothstep(uNoseZ - wz, uNoseZ + wz, z);
          if (uNoseMode > 1.5) nose *= 1.0 - smoothstep(0.05 - w, 0.05 + w, cy); // skylark: dark chin only
          col = mix(col, uNose, nose);
          isWin = 0.0;
          // window row
          if (z > uWinZ.x && z < uWinZ.y) {
            float f = fract((z - uWinZ.x) / uPitch) - 0.5;
            vec2 p = vec2(f * uPitch, (cy - 0.22) * uR);
            float d = rrect(p, vec2(0.17, 0.24), 0.14);
            float aa = max(fwidth(d), 0.003);
            float win = 1.0 - smoothstep(-aa, aa, d);
            win *= step(0.55, abs(sx));
            col = mix(col, uWin, win);
            isWin = max(isWin, win);
          }
          // cockpit windscreen: band near the nose with frame posts
          if (z > uCock.x && z < uCock.y) {
            float t = (z - uCock.x) / (uCock.y - uCock.x);
            float lo = 0.16 + t * 0.12, hi = 0.62 - t * 0.2;
            float ws = band(cy, lo, hi, w);
            ws *= smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.88, 1.0, t));
            float post = 1.0 - smoothstep(0.03, 0.05, abs(sx));
            post = max(post, 1.0 - smoothstep(0.03, 0.05, abs(abs(sx) - 0.62)));
            ws *= 1.0 - post;
            col = mix(col, uWin, ws);
            isWin = max(isWin, ws);
          }
          // door outlines on the left (+x) side
          if (sx > 0.5) {
            for (int i = 0; i < 2; i++) {
              float dz = i == 0 ? uDoors.x : uDoors.y;
              vec2 p = vec2(z - dz, (cy - 0.05) * uR);
              float d = abs(rrect(p, vec2(0.42, 0.9), 0.2)) - 0.035;
              float aa = max(fwidth(d), 0.003);
              col = mix(col, col * 0.55, (1.0 - smoothstep(-aa, aa, d)) * 0.8);
            }
          }
          return col;
        }`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float isWin; vec3 livCol = livery(isWin);
        vec4 diffuseColor = vec4( livCol, opacity );`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, isWin);`,
      );
  };
  m.customProgramCacheKey = () => 'livery';
  cache.set(key, m);
  return m;
}
