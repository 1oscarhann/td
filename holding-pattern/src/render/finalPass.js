import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { RADAR } from '../config/palette.js';

// Last pass in the chain: tilt-shift blur, neutral tone mapping, vignette and
// the radar look (luminance edges painted green on a dark scope, revealed by a
// circular wipe). Pixels with alpha 0 are the sky and skip tone mapping.

const radarBg = new THREE.Color(RADAR.bg);
const radarGreen = new THREE.Color(RADAR.green);

const shader = {
  uniforms: {
    tDiffuse: { value: null },
    toneMappingExposure: { value: 1 },
    resolution: { value: new THREE.Vector2(1, 1) },
    focusY: { value: 0.5 },
    focusBand: { value: 0.12 },
    blurMax: { value: 5.0 },
    vignette: { value: 0.16 },
    time: { value: 0 },
    uRadar: { value: 0 }, // wipe progress 0..1
    uRadarBg: { value: new THREE.Vector3(radarBg.r, radarBg.g, radarBg.b) },
    uRadarGreen: { value: new THREE.Vector3(radarGreen.r, radarGreen.g, radarGreen.b) },
  },
  vertexShader: /* glsl */ `
    precision highp float;
    uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
    attribute vec3 position; attribute vec2 uv;
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float focusY, focusBand, blurMax, vignette, time, uRadar;
    uniform vec3 uRadarBg, uRadarGreen;
    #include <tonemapping_pars_fragment>
    #include <colorspace_pars_fragment>
    varying vec2 vUv;

    vec3 toneMap(vec4 s) { return mix(s.rgb, NeutralToneMapping(s.rgb), clamp(s.a, 0.0, 1.0)); }
    float luma(vec2 uv) { vec3 c = toneMap(texture2D(tDiffuse, uv)); return dot(c, vec3(0.299, 0.587, 0.114)); }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 col = src.rgb;
      float alpha = src.a;
      float blurAmt = (1.0 - uRadar);
      #ifdef USE_DOF
        float d = abs(vUv.y - focusY) - focusBand;
        float amt = smoothstep(0.0, 0.4, d) * blurMax * blurAmt;
        if (amt > 0.3) {
          vec3 acc = col; float asum = alpha; float wsum = 1.0;
          for (int i = 1; i < 16; i++) {
            float fi = float(i);
            float r = sqrt(fi / 16.0) * amt;
            float a = fi * 2.39996323;
            vec4 t = texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * r / resolution);
            acc += t.rgb; asum += t.a; wsum += 1.0;
          }
          col = acc / wsum; alpha = asum / wsum;
        }
      #endif
      col = mix(col, NeutralToneMapping(col), clamp(alpha, 0.0, 1.0));

      // radar look
      vec2 p = vUv - 0.5; p.x *= resolution.x / resolution.y;
      float dist = length(p);
      if (uRadar > 0.001) {
        float reach = uRadar * 1.25;
        float wipe = smoothstep(reach, reach - 0.06, dist);
        if (wipe > 0.0 || reach > 0.0) {
          vec2 px = 1.0 / resolution;
          float tl = luma(vUv + px * vec2(-1.0, 1.0)), t = luma(vUv + px * vec2(0.0, 1.0)), tr = luma(vUv + px * vec2(1.0, 1.0));
          float l = luma(vUv + px * vec2(-1.0, 0.0)), r = luma(vUv + px * vec2(1.0, 0.0));
          float bl = luma(vUv + px * vec2(-1.0, -1.0)), b = luma(vUv + px * vec2(0.0, -1.0)), br = luma(vUv + px * vec2(1.0, -1.0));
          float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
          float gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
          float edge = smoothstep(0.05, 0.32, length(vec2(gx, gy)));
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          vec3 rc = uRadarBg + uRadarGreen * (edge * 0.85 + lum * 0.05);
          rc *= 0.93 + 0.07 * sin(gl_FragCoord.y * 1.7 + time * 4.0);
          float ring = smoothstep(0.035, 0.0, abs(dist - reach + 0.03)) * (1.0 - smoothstep(0.85, 1.0, uRadar));
          rc += uRadarGreen * ring * 0.9;
          col = mix(col, rc, wipe);
          col += uRadarGreen * ring * 0.6 * (1.0 - wipe);
        }
      }

      vec4 o = sRGBTransferOETF(vec4(col, 1.0));
      vec2 q = vUv - 0.5; q.x *= resolution.x / resolution.y * 0.7;
      float v = smoothstep(0.95, 0.25, length(q));
      o.rgb *= mix(1.0 - vignette, 1.0, v);
      gl_FragColor = vec4(o.rgb, 1.0);
    }`,
};

export class FinalPass extends Pass {
  constructor() {
    super();
    this.uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    this.material = new THREE.RawShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      defines: { NEUTRAL_TONE_MAPPING: '', USE_DOF: '' },
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  setSize(w, h) {
    this.uniforms.resolution.value.set(w, h);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

// JS copy of Khronos PBR Neutral so fog can be pre-compensated to land exactly
// on the sky colour after tone mapping.
export function neutralToneMap(c) {
  const start = 0.8 - 0.04;
  const desat = 0.15;
  let { r, g, b } = c;
  const x = Math.min(r, g, b);
  const off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  r -= off; g -= off; b -= off;
  const peak = Math.max(r, g, b);
  if (peak < start) return new THREE.Color(r, g, b);
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + d - start);
  const s = newPeak / peak;
  r *= s; g *= s; b *= s;
  const gg = 1 - 1 / (desat * (peak - newPeak) + 1);
  return new THREE.Color(r + (newPeak - r) * gg, g + (newPeak - g) * gg, b + (newPeak - b) * gg);
}

export function inverseNeutral(target) {
  const f = target.clone();
  for (let i = 0; i < 40; i++) {
    const t = neutralToneMap(f);
    f.r += (target.r - t.r) * 0.9;
    f.g += (target.g - t.g) * 0.9;
    f.b += (target.b - t.b) * 0.9;
  }
  return f;
}
