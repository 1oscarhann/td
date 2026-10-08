import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { Plane, hashBearing } from './plane.js';
import { S, WAITING_TO_LAND } from './states.js';
import { rand, clamp } from '../core/math.js';

const F = BALANCE.flight;

// Owns all aircraft: spawning inbound flights, per-tick updates, removal,
// picking with the mouse and the selection ring.
export class PlaneManager extends Map {
  constructor(game) {
    super();
    this.game = game;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.12, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.4, 0.4), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 4;
    ring.visible = false;
    game.renderer.scene.add(ring);
    this.ring = ring;
    this._sphere = new THREE.Sphere();
    this._hit = new THREE.Vector3();
  }

  // Bring a flight's inbound leg onto the radar edge.
  spawnInbound(flight, opts = {}) {
    const p = new Plane(this.game, flight, opts);
    const bearing = opts.bearing ?? hashBearing(flight.from?.[0] || flight.inNo);
    const R = F.radarRadius - 40;
    const x = Math.sin(bearing) * R, z = Math.cos(bearing) * R;
    const fix = this.game.atc.fix;
    const yaw = Math.atan2(fix.x - x, fix.z - z);
    const trip = Math.hypot(fix.x - x, fix.z - z) / F.inboundSpeed;
    const fu = BALANCE.fuel;
    const low = Math.random() < fu.lowChance;
    const reserve = opts.reserve ?? (low ? rand(fu.lowReserveMin, fu.lowReserveMax) : rand(fu.reserveMin, fu.reserveMax));
    p.spawnAt(x, z, 760 + rand(-60, 60), yaw, trip + reserve);
    this.set(p.id, p);
    flight.planeId = p.id;
    this.game.atc.enqueue(p);
    this.game.events.emit('spawned', p);
    return p;
  }

  update(dt) {
    for (const p of this.values()) {
      p.update(dt);
      if (p.finished) this.removePlane(p);
    }
  }

  removePlane(p) {
    this.game.atc.remove(p);
    this.game.reservations.releaseAll(p.id);
    for (const s of this.game.grid.stands) {
      if (s.occupiedBy === p.id) s.occupiedBy = null;
      if (s.reservedBy === p.id) s.reservedBy = null;
    }
    for (const st of this.game.atc.rw.values()) if (st.lock?.planeId === p.id) st.lock = null;
    p.turnaround?.dispose?.();
    p.dispose();
    this.delete(p.id);
    if (this.game.selection?.plane === p) this.game.selection.select(null);
    this.game.events.emit('planeRemoved', p);
  }

  clearAll() {
    for (const p of [...this.values()]) this.removePlane(p);
  }

  // per-frame visuals (runs even while paused)
  visualUpdate(dt, time) {
    const radar = this.game.radar?.t ?? 0;
    for (const p of this.values()) {
      p.syncModel(dt, time);
      p.root.visible = radar < 0.55;
    }
    const sel = this.game.selection?.plane;
    if (sel && this.has(sel.id) && radar < 0.55) {
      this.ring.visible = true;
      const r = sel.type.length * 0.62 + Math.sin(time * 4) * 0.6;
      this.ring.scale.setScalar(r);
      this.ring.position.set(sel.pos.x, sel.alt > 1 ? sel.alt + sel.spec.gearH - 1 : 0.6, sel.pos.z);
    } else this.ring.visible = false;
  }

  pick(ray) {
    let best = null, bd = Infinity;
    for (const p of this.values()) {
      if (!p.root.visible) continue;
      this._sphere.center.copy(p.root.position);
      this._sphere.radius = p.type.length * 0.55;
      const hit = ray.ray.intersectSphere(this._sphere, this._hit);
      if (hit) {
        const d = hit.distanceTo(ray.ray.origin);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
    }
    return best;
  }

  waitingToLand() {
    return [...this.values()].filter((p) => WAITING_TO_LAND.has(p.state));
  }

  isBusy(s) {
    return null;
  }

  // Debug: spawn an inbound flight right now (Shift+P). `anyClass` ignores unlocks.
  debugSpawn(anyClass = false) {
    const game = this.game;
    const flights = game.flights;
    const f = flights.makeDebugFlight(anyClass);
    if (!f) {
      game.ui.toast('No plane can use this airport yet', { kind: 'warn', icon: 'plane' });
      return null;
    }
    const p = this.spawnInbound(f);
    game.ui.toast(`Debug: ${f.inNo} inbound`, { sub: `${f.airlineName} · ${f.className}`, icon: 'plane' });
    return p;
  }
}

export { S, clamp };
