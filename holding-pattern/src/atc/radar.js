import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { RADAR, css } from '../config/palette.js';
import { clamp, smooth, smoother, fmtTimer } from '../core/math.js';
import { S, WAITING_TO_LAND } from '../planes/states.js';

const F = BALANCE.flight;
const GREEN = css(RADAR.green), AMBER = css(RADAR.amber), RED = css(RADAR.red);
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

// Radar mode: the camera tilts to a north-up top-down view while a circular
// wipe repaints the world as green outlines on a dark scope; a 2D overlay
// draws range rings, the sweep, blips with tags and trails.
export class Radar {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('radar');
    this.ctx = this.canvas.getContext('2d');
    this.active = false;
    this.t = 0; // transition progress 0..1
    this.sweep = 0;
    this.lit = new Map(); // planeId -> time last painted by the sweep
    this.screen = new Map(); // planeId -> {x, y}
    this._v = new THREE.Vector3();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.dpr = dpr;
  }

  toggle(on = !this.active) {
    this.active = on;
    if (on && this.game.build.tool) this.game.build.setTool(null);
    this.game.events.emit('radar', on);
  }

  // world -> screen (css px); returns null when behind the camera
  project(x, y, z) {
    const cam = this.game.renderer.camera;
    const v = this._v.set(x, y, z).project(cam);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  }

  pickBlip(cx, cy) {
    let best = null, bd = 16;
    for (const [id, s] of this.screen) {
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < bd) {
        bd = d;
        best = this.game.planes.get(id) || null;
      }
    }
    return best;
  }

  update(dt) {
    const target = this.active ? 1 : 0;
    const speed = 1 / 1.6;
    this.t = clamp(this.t + Math.sign(target - this.t) * dt * speed, 0, 1);
    const g = this.game;
    g.camera.radarT = smoother(this.t);
    // the colour wipe trails the camera tilt a little
    const wipe = this.active ? smooth(clamp((this.t - 0.2) / 0.8, 0, 1)) : smooth(clamp(this.t / 0.75, 0, 1));
    g.renderer.finalPass.uniforms.uRadar.value = wipe;
    const fog = g.renderer.scene.fog;
    fog.near = 1800 + wipe * 60000;
    fog.far = 7000 + wipe * 90000;
    document.body.classList.toggle('radar', this.t > 0.5);
    this.overlayAlpha = smooth(clamp((wipe - 0.35) / 0.65, 0, 1));
    this.sweep = (this.sweep + dt * ((Math.PI * 2) / 3.6)) % (Math.PI * 2);
    this.draw();
  }

  planeColor(p) {
    if (p.state === S.DIVERTED || p.state === S.GO_AROUND) return RED;
    if (WAITING_TO_LAND.has(p.state)) {
      if (p.fuel < BALANCE.fuel.red) return RED;
      if (p.fuel < BALANCE.fuel.amber || p.holdingTime > 120) return AMBER;
    }
    return GREEN;
  }

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.screen.clear();
    const a = this.overlayAlpha;
    this.canvas.style.opacity = a > 0.001 ? 1 : 0;
    if (a <= 0.001) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = a;
    const g = this.game;
    const c = this.project(0, 0, 0);
    if (!c) return;
    const edge = this.project(F.radarRadius, 0, 0);
    const R = edge ? Math.hypot(edge.x - c.x, edge.y - c.y) : 300;
    const pxPerM = R / F.radarRadius;
    const grow = smooth(clamp(a * 1.3, 0, 1));
    // range rings
    ctx.lineWidth = 1;
    ctx.font = '600 10.5px ui-rounded, system-ui, sans-serif';
    for (let km = 0.5; km <= F.radarRadius / 1000 + 0.01; km += 0.5) {
      const r = km * 1000 * pxPerM * grow;
      ctx.strokeStyle = rgba(GREEN, km % 1 === 0 ? 0.32 : 0.14);
      ctx.setLineDash(km % 1 === 0 ? [] : [3, 6]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (km % 1 === 0) {
        ctx.fillStyle = rgba(GREEN, 0.55);
        ctx.fillText(`${km} km`, c.x + 4, c.y - r - 3);
      }
    }
    ctx.setLineDash([]);
    // compass ticks
    ctx.strokeStyle = rgba(GREEN, 0.45);
    for (let d = 0; d < 360; d += 10) {
      const ang = (d * Math.PI) / 180;
      const r0 = R * grow, r1 = r0 + (d % 30 === 0 ? 9 : 4);
      ctx.beginPath();
      ctx.moveTo(c.x + Math.sin(ang) * r0, c.y - Math.cos(ang) * r0);
      ctx.lineTo(c.x + Math.sin(ang) * r1, c.y - Math.cos(ang) * r1);
      ctx.stroke();
      if (d % 90 === 0) {
        ctx.fillStyle = rgba(GREEN, 0.75);
        ctx.textAlign = 'center';
        ctx.fillText(['N', 'E', 'S', 'W'][d / 90], c.x + Math.sin(ang) * (r1 + 9), c.y - Math.cos(ang) * (r1 + 9) + 4);
        ctx.textAlign = 'left';
      }
    }
    // sweep wedge (north-up, clockwise)
    const sw = this.sweep;
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const a0 = sw - (i + 1) * 0.045, a1 = sw - i * 0.045;
      ctx.fillStyle = rgba(GREEN, 0.16 * (1 - i / steps) * (1 - i / steps));
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.arc(c.x, c.y, R * grow, a0 - Math.PI / 2, a1 - Math.PI / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = rgba(GREEN, 0.85);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.sin(sw) * R * grow, c.y - Math.cos(sw) * R * grow);
    ctx.stroke();
    // holding fix
    const fix = g.atc.fix;
    const fc = this.project(fix.x, 0, fix.z);
    if (fc) {
      const hr = F.holdingRadius * pxPerM;
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = rgba(AMBER, 0.55);
      ctx.beginPath();
      ctx.arc(fc.x, fc.y, hr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(AMBER, 0.85);
      ctx.fillText('HOLD', fc.x - 13, fc.y + 4);
    }
    // final approach courses
    for (const r of g.grid.runways) {
      const t = this.project(r.thr.x, 0, r.thr.z);
      const f = this.project(r.thr.x - r.dir.x * F.finalLength, 0, r.thr.z - r.dir.z * F.finalLength);
      if (!t || !f) continue;
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = rgba(GREEN, 0.45);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(GREEN, 0.8);
      ctx.fillText(`RWY ${r.nums[0]}`, f.x + 6, f.y - 6);
      ctx.beginPath();
      ctx.arc(f.x, f.y, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    // blips
    const now = performance.now() / 1000;
    const sel = g.selection?.plane;
    for (const p of g.planes.values()) {
      const s = this.project(p.pos.x, 0, p.pos.z);
      if (!s) continue;
      this.screen.set(p.id, s);
      const col = this.planeColor(p);
      // the sweep refreshes each blip; it fades until painted again
      const ang = (Math.atan2(p.pos.x, -p.pos.z) + Math.PI * 2) % (Math.PI * 2);
      const diff = (sw - ang + Math.PI * 2) % (Math.PI * 2);
      if (diff < 0.12) this.lit.set(p.id, now);
      const since = now - (this.lit.get(p.id) ?? now - 1);
      const glow = 0.45 + 0.55 * Math.exp(-since * 0.9);
      // trail dots
      const tr = p.trail;
      for (let i = 0; i < tr.length; i += 2) {
        const ts = this.project(tr[i], 0, tr[i + 1]);
        if (!ts) continue;
        ctx.fillStyle = rgba(col, 0.12 + (i / tr.length) * 0.4);
        ctx.fillRect(ts.x - 1.2, ts.y - 1.2, 2.4, 2.4);
      }
      const onGround = p.alt < 1 && p.state !== S.TAKEOFF;
      const size = onGround ? 3 : 5;
      ctx.fillStyle = rgba(col, glow);
      ctx.strokeStyle = rgba(col, glow);
      ctx.lineWidth = 1.5;
      if (onGround) ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
      else {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - size);
        ctx.lineTo(s.x + size, s.y);
        ctx.lineTo(s.x, s.y + size);
        ctx.lineTo(s.x - size, s.y);
        ctx.closePath();
        ctx.stroke();
        // heading vector
        const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + hx * 14, s.y + hz * 14);
        ctx.stroke();
      }
      if (sel === p) {
        ctx.strokeStyle = rgba(col, 0.9);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 11 + Math.sin(now * 5) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (onGround && sel !== p) continue;
      // data tag
      const altH = Math.round((p.alt * 3.28) / 100);
      const line1 = p.label.replace(' ', '');
      let line2 = `${String(altH).padStart(3, '0')} ${Math.round(p.v * 1.94)}KT`;
      if (WAITING_TO_LAND.has(p.state)) line2 += ` F${fmtTimer(p.fuel)}`;
      if (p.state === S.GO_AROUND) line2 = 'GO AROUND';
      if (p.state === S.DIVERTED) line2 = 'DIVERTING';
      if (WAITING_TO_LAND.has(p.state) && p.fuel < BALANCE.fuel.red) line2 = `MAYDAY F${fmtTimer(p.fuel)}`;
      const tx = s.x + 10, ty = s.y - 10;
      ctx.strokeStyle = rgba(col, 0.5);
      ctx.beginPath();
      ctx.moveTo(s.x + 4, s.y - 4);
      ctx.lineTo(tx - 2, ty + 2);
      ctx.stroke();
      ctx.fillStyle = rgba(col, glow);
      ctx.font = '800 11px ui-rounded, system-ui, sans-serif';
      ctx.fillText(line1, tx, ty);
      ctx.font = '600 10px ui-rounded, system-ui, sans-serif';
      ctx.fillText(line2, tx, ty + 12);
    }
    ctx.globalAlpha = 1;
  }
}
