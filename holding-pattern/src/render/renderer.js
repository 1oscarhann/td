import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FinalPass, inverseNeutral } from './finalPass.js';
import { BUILD } from '../config/palette.js';
import { clamp } from '../core/math.js';

// Owns the WebGL renderer, scene, camera, lights and post chain.
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping; // done in FinalPass
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const sky = new THREE.Color(BUILD.sky);
    renderer.setClearColor(sky, 0); // alpha 0 marks sky pixels: no tone mapping
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    // fog colour chosen so that after tone mapping it is exactly the sky colour
    this.fogColor = inverseNeutral(sky.clone());
    scene.fog = new THREE.Fog(this.fogColor, 1800, 7000);

    this.camera = new THREE.PerspectiveCamera(32, 1, 2, 16000);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.22;

    this.hemi = new THREE.HemisphereLight(0xdcefff, 0x6f9a5c, 0.62);
    scene.add(this.hemi);

    const sun = new THREE.DirectionalLight(0xfff0d8, 2.05);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    sun.shadow.radius = 3;
    this.sun = sun;
    this.sunDir = new THREE.Vector3(-0.55, -0.78, -0.32).normalize();
    scene.add(sun, sun.target);

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.35, 1.6);
    composer.addPass(this.bloom);
    this.finalPass = new FinalPass();
    composer.addPass(this.finalPass);
    this.composer = composer;

    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    this.composer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w;
    this.height = h;
  }

  // Keep the shadow frustum centred on what the camera looks at, sized to the zoom.
  updateShadow(focus, viewDist) {
    const sun = this.sun;
    const ext = clamp(viewDist * 0.62, 70, 900);
    const cam = sun.shadow.camera;
    if (cam.right !== ext) {
      cam.left = -ext;
      cam.right = ext;
      cam.top = ext;
      cam.bottom = -ext;
      cam.near = 10;
      cam.far = ext * 2 + 1600;
      cam.updateProjectionMatrix();
    }
    // snap to shadow texels to stop shimmering while panning
    const texel = (ext * 2) / sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx, 0, fz).addScaledVector(this.sunDir, -(ext + 700));
    sun.shadow.normalBias = clamp(ext / 300, 0.15, 2.5);
  }

  render(time) {
    this.finalPass.uniforms.time.value = time;
    this.composer.render();
  }
}
