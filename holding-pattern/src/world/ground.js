import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { BUILD } from '../config/palette.js';
import { M } from '../render/materials.js';

const TILE = BALANCE.map.tile;
const MW = BALANCE.map.width * TILE;
const MH = BALANCE.map.height * TILE;

// Ground plane, the buildable board and the build-mode grid overlay.
export class Ground {
  constructor(scene) {
    const far = new THREE.Mesh(new THREE.CircleGeometry(14000, 64), M.grassDark);
    far.rotation.x = -Math.PI / 2;
    far.position.y = -0.4;
    far.receiveShadow = true;
    scene.add(far);

    // the airfield board: a slightly lighter, mown rectangle with a soft kerb
    const board = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), M.grass);
    board.rotation.x = -Math.PI / 2;
    board.position.y = -0.05;
    board.receiveShadow = true;
    scene.add(board);
    this.board = board;

    // grid overlay shader (shown while building)
    this.gridUniforms = {
      uOpacity: { value: 0 },
      uTile: { value: TILE },
      uColor: { value: new THREE.Color(BUILD.paint) },
      uCam: { value: new THREE.Vector3() },
      uHover: { value: new THREE.Vector2(-9999, -9999) },
    };
    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(MW, MH),
      new THREE.ShaderMaterial({
        uniforms: this.gridUniforms,
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `
          uniform float uOpacity, uTile; uniform vec3 uColor; uniform vec3 uCam; uniform vec2 uHover;
          varying vec3 vW;
          void main() {
            vec2 g = vW.xz / uTile;
            vec2 f = abs(fract(g) - 0.5);
            vec2 w = fwidth(g) * 1.2;
            float line = max(smoothstep(0.5 - w.x, 0.5, f.x), smoothstep(0.5 - w.y, 0.5, f.y));
            vec2 g5 = vW.xz / (uTile * 5.0);
            vec2 f5 = abs(fract(g5) - 0.5);
            vec2 w5 = fwidth(g5) * 1.4;
            float major = max(smoothstep(0.5 - w5.x, 0.5, f5.x), smoothstep(0.5 - w5.y, 0.5, f5.y));
            float d = length(vW.xz - uCam.xz);
            float fade = 1.0 - smoothstep(uCam.y * 1.2, uCam.y * 3.2 + 200.0, d);
            float a = (line * 0.18 + major * 0.22) * fade;
            float hov = 1.0 - smoothstep(0.0, 60.0, length(vW.xz - uHover));
            a *= 0.6 + hov * 1.4;
            gl_FragColor = vec4(uColor, a * uOpacity);
          }`,
      }),
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.42;
    grid.renderOrder = 2;
    grid.visible = false;
    this.grid = grid;
    scene.add(grid);

    // low hedge kerb around the board edge
    const kerbGeo = [];
    const h = 0.9, t = 2.2;
    const addKerb = (w, d, x, z) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, h / 2 - 0.1, z);
      kerbGeo.push(g);
    };
    addKerb(MW + t * 2, t, 0, -MH / 2 - t / 2);
    addKerb(MW + t * 2, t, 0, MH / 2 + t / 2);
    addKerb(t, MH, -MW / 2 - t / 2, 0);
    addKerb(t, MH, MW / 2 + t / 2, 0);
    for (const g of kerbGeo) {
      const m = new THREE.Mesh(g, M.grassDark);
      m.receiveShadow = true;
      m.castShadow = true;
      scene.add(m);
    }
    this.targetOpacity = 0;
  }

  showGrid(on) {
    this.targetOpacity = on ? 1 : 0;
  }

  update(dt, camera, hover) {
    const u = this.gridUniforms;
    u.uOpacity.value += (this.targetOpacity - u.uOpacity.value) * Math.min(1, dt * 8);
    this.grid.visible = u.uOpacity.value > 0.01;
    u.uCam.value.copy(camera.position);
    if (hover) u.uHover.value.set(hover.x, hover.z);
    else u.uHover.value.set(-99999, -99999);
  }
}
