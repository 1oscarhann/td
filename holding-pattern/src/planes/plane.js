import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { PLANE_TYPES } from '../config/planeTypes.js';
import { clamp, lerp, dampAngle, wrapAngle, smooth } from '../core/math.js';
import { buildPlaneModel } from './models.js';
import { Path } from './path.js';
import { dubins, yawToTh } from './dubins.js';
import { S, STATE_LABEL } from './states.js';
import { STAND_BASE } from '../pathfinding/taxiGraph.js';
import { TARMAC_Y, RUNWAY_Y } from '../build/structures.js';

const F = BALANCE.flight;
const TILE = BALANCE.map.tile;
let nextId = 1;
export const resetPlaneIds = (n = 1) => (nextId = n);

const _s = {};
const _q = new THREE.Quaternion();

// One aircraft: model, flight state machine, air and ground motion.
export class Plane {
  constructor(game, flight, opts = {}) {
    this.game = game;
    this.id = opts.id ?? nextId++;
    nextId = Math.max(nextId, this.id + 1);
    this.flight = flight;
    this.cls = flight.cls;
    this.airline = flight.airline;
    this.type = PLANE_TYPES[this.cls];
    this.halfLen = this.type.length / 2;
    const model = buildPlaneModel(this.cls, this.airline);
    this.model = model;
    this.root = model.root;
    this.parts = model.parts;
    this.spec = model.spec;
    this.root.userData.plane = this;
    game.renderer.scene.add(this.root);

    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.alt = 0;
    this.v = F.inboundSpeed;
    this.state = S.INBOUND;
    this.stateT = 0;
    this.spawnedAt = game.simTime;
    this.fuel = 100;
    this.fuelMax = 100;
    this.gearT = 0;
    this.flapT = 0;
    this.rpm = 1;
    this.targetAlt = 600;
    this.runway = null; // runway for landing (once cleared)
    this.runwayId = null; // player's runway pick for this arrival, or null for auto
    this.standId = null;
    this.atcNote = null;
    this.path = null;
    this.s = 0;
    this.reverse = false;
    this.holdS = null;
    this.crossings = [];
    this.crossWait = null;
    this.releaseT = 0;
    this.trail = [];
    this.trailT = 0;
    this.holdingTime = 0;
    this.goArounds = 0;
    this.depRunway = null;
    this.runwayGranted = false;
    this.atHoldShort = false;
    this.holdShortSince = null;
    this.waitNote = null;
    this.turnaround = null;
    this.lineupWait = 0;
    this.airborneT = 0;
  }

  get label() {
    return this.state === S.PARKED || this.isDeparting() ? this.flight.outNo : this.flight.inNo;
  }

  isDeparting() {
    return [S.PUSHBACK, S.TAXI_OUT, S.LINED_UP, S.TAKEOFF, S.DEPARTED].includes(this.state);
  }

  setState(s) {
    if (this.state === s) return;
    const prev = this.state;
    this.state = s;
    this.stateT = 0;
    this.game.events.emit('planeState', this, s, prev);
  }

  // ---- spawning ------------------------------------------------------------------
  spawnAt(x, z, alt, yaw, fuel) {
    this.pos.set(x, alt, z);
    this.alt = alt;
    this.yaw = yaw;
    this.fuel = fuel;
    this.fuelMax = fuel;
    this.gearT = 0;
    this.flapT = 0;
    this.rpm = 1;
    this.setState(S.INBOUND);
    this.syncModel(0);
  }

  // ---- generic air motion ------------------------------------------------------------
  flyToward(tx, tz, speed, dt) {
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    this.turnToward(want, speed, dt);
  }

  turnToward(want, speed, dt) {
    this.v = lerp(this.v, speed, 1 - Math.exp(-0.6 * dt));
    const rate = this.v / F.turnRadius;
    const d = wrapAngle(want - this.yaw);
    const step = clamp(d, -rate * dt, rate * dt);
    this.yaw = wrapAngle(this.yaw + step);
    const yawRate = dt > 0 ? step / dt : 0;
    const bank = clamp(-Math.atan((this.v * yawRate) / 9.81), -0.5, 0.5);
    this.roll = lerp(this.roll, bank, 1 - Math.exp(-3 * dt));
    this.pos.x += Math.sin(this.yaw) * this.v * dt;
    this.pos.z += Math.cos(this.yaw) * this.v * dt;
  }

  climbToward(alt, rate, dt) {
    const d = alt - this.alt;
    const step = clamp(d, -rate * dt, rate * dt);
    this.alt += step;
    this.pitch = lerp(this.pitch, clamp(step / dt / Math.max(this.v, 1), -0.12, 0.2), 1 - Math.exp(-2 * dt));
  }

  // ---- approach ------------------------------------------------------------------------
  approachGeometry(r) {
    const dx = r.dir.x, dz = r.dir.z;
    const faf = { x: r.thr.x - dx * F.finalLength, z: r.thr.z - dz * F.finalLength };
    const q0 = { x: this.pos.x, z: this.pos.z, th: yawToTh(this.yaw) };
    const q1 = { x: faf.x, z: faf.z, th: yawToTh(r.heading) };
    const d = dubins(q0, q1, F.turnRadius, 14) || { pts: [{ x: q0.x, z: q0.z }, faf], length: Math.hypot(faf.x - q0.x, faf.z - q0.z) };
    const tdDist = F.touchdownTiles * TILE;
    const pts = [...d.pts, { x: r.thr.x, z: r.thr.z }, { x: r.thr.x + dx * tdDist, z: r.thr.z + dz * tdDist }];
    const sFaf = d.length;
    const sThr = sFaf + F.finalLength;
    const sTd = sThr + tdDist;
    const v0 = Math.max(this.v, F.approachSpeed);
    const eta = sFaf / ((v0 + F.approachSpeed) / 2) + F.finalLength / ((F.approachSpeed + F.touchdownSpeed) / 2) + tdDist / F.touchdownSpeed;
    return { pts, sFaf, sThr, sTd, eta };
  }

  estimateApproach(r) {
    return this.approachGeometry(r).eta;
  }

  clearToLand(r, plan) {
    this.runway = r;
    this.arrPlan = plan;
    this.standId = plan.stand.id;
    const g = this.approachGeometry(r);
    this.ap = { ...g, path: new Path(g.pts, { radius: 0.5, cruise: 999, decel: 999, latAccel: 1e6 }), alt0: this.alt, v0: this.v, decided: false };
    this.s = 0;
    this.touchdownAt = this.game.simTime + g.eta;
    this.rolloutPlan = this.buildRolloutPath(r, plan);
    this.setState(S.APPROACH);
  }

  updateApproach(dt) {
    const ap = this.ap;
    let vT;
    if (this.s < ap.sFaf) vT = lerp(ap.v0, F.approachSpeed, clamp(this.s / Math.max(ap.sFaf, 1), 0, 1));
    else vT = lerp(F.approachSpeed, F.touchdownSpeed, clamp((this.s - ap.sFaf) / (ap.sThr - ap.sFaf), 0, 1));
    this.v = lerp(this.v, vT, 1 - Math.exp(-1.5 * dt));
    this.s += this.v * dt;
    const p = ap.path.sample(Math.min(this.s, ap.path.length), _s);
    const prevYaw = this.yaw;
    this.pos.x = p.x;
    this.pos.z = p.z;
    this.yaw = dampAngle(this.yaw, Math.atan2(p.hx, p.hz), 6, dt);
    const yawRate = dt > 0 ? wrapAngle(this.yaw - prevYaw) / dt : 0;
    this.roll = lerp(this.roll, clamp(-Math.atan((this.v * yawRate) / 9.81), -0.45, 0.45), 1 - Math.exp(-3 * dt));
    // altitude profile
    let alt, pitch;
    if (this.s < ap.sFaf) {
      alt = lerp(ap.alt0, F.finalAltitude, smooth(clamp(this.s / Math.max(ap.sFaf, 1), 0, 1)));
      pitch = 0.02;
    } else if (this.s < ap.sThr) {
      alt = lerp(F.finalAltitude, 11, (this.s - ap.sFaf) / F.finalLength);
      pitch = 0.035;
    } else {
      const u = clamp((this.s - ap.sThr) / (ap.sTd - ap.sThr), 0, 1);
      alt = 11 * (1 - u) * (1 - u);
      pitch = 0.035 + u * 0.06;
    }
    this.alt = alt;
    this.pitch = lerp(this.pitch, pitch, 1 - Math.exp(-3 * dt));
    const toThr = ap.sThr - this.s;
    if (toThr < 2200) this.gearTarget = 1;
    this.flapTarget = toThr < 800 ? 1 : this.s > ap.sFaf - 600 ? 0.5 : 0.2;
    if (toThr < 260 && this.state === S.APPROACH) this.setState(S.LANDING);
    if (!ap.decided && toThr <= F.decisionDistance) {
      ap.decided = true;
      if (!this.game.atc.landingDecision(this)) {
        this.goAround('Runway occupied');
        return;
      }
    }
    if (this.s >= ap.sTd) this.touchdown();
  }

  touchdown() {
    this.alt = 0;
    this.pitch = 0.06;
    this.roll = 0;
    this.path = this.rolloutPlan.path;
    this.crossings = this.rolloutPlan.crossings;
    this.route = this.rolloutPlan.route;
    this.s = 0;
    this.reverse = false;
    this.holdS = null;
    this.onPathEnd = () => this.arriveAtStand();
    this.landingLock = true;
    this.setState(S.ROLLOUT);
    this.game.events.emit('landed', this);
  }

  goAround(reason) {
    const r = this.runway;
    this.game.atc.unlock(r.id, this);
    this.game.reservations.releaseAll(this.id);
    const stand = this.game.grid.structures.get(this.standId);
    if (stand && stand.reservedBy === this.id) stand.reservedBy = null;
    this.standId = null;
    this.goArounds++;
    const side = { x: -r.dir.z, z: r.dir.x };
    this.ga = {
      x: r.far.x + r.dir.x * 900 + side.x * 260,
      z: r.far.z + r.dir.z * 900 + side.z * 260,
      phase: 0,
      reason,
    };
    this.runway = null;
    this.gearTarget = 0;
    this.flapTarget = 0.3;
    this.setState(S.GO_AROUND);
    this.game.atc.enqueue(this); // back of the queue
    this.game.events.emit('goAround', this, reason);
  }

  // ---- ground paths ------------------------------------------------------------------
  parkingPoint(stand) {
    const off = stand.half - 3 - this.halfLen;
    return { x: stand.center.x + stand.fwd.x * off, z: stand.center.z + stand.fwd.z * off };
  }

  // Turn a node route into path points. Stand nodes expand into the lead-in.
  routePoints(nodes, { from = null } = {}) {
    const graph = this.game.graph;
    const grid = this.game.grid;
    const pts = [];
    const crossMarks = [];
    for (let i = 0; i < nodes.length; i++) {
      const id = nodes[i];
      const n = graph.nodes.get(id);
      if (!n) continue;
      if (n.kind === 'stand') {
        const s = grid.structures.get(n.standId);
        if (i === nodes.length - 1) {
          pts.push({ x: s.backEdge.x, z: s.backEdge.z, v: 6, node: id });
          const pp = this.parkingPoint(s);
          pts.push({ x: pp.x, z: pp.z, v: 4, node: id });
        }
        continue;
      }
      if (i > 0) {
        const e = graph.edge(nodes[i - 1], id);
        if (e && e.cross) {
          const r = grid.structures.get(e.cross);
          const c = grid.runwayPoint(r, e.index);
          pts.push({ x: c.x, z: c.z, cross: e.cross });
          crossMarks.push({ runwayId: e.cross, from: nodes[i - 1], to: id });
        }
      }
      pts.push({ x: n.x, z: n.z, node: id });
    }
    if (from) pts.unshift(from);
    return { pts, crossMarks };
  }

  // compute crossing hold/clear points along a path
  crossingPoints(path, crossMarks) {
    const graph = this.game.graph;
    const out = [];
    for (const c of crossMarks) {
      const a = graph.nodes.get(c.from), b = graph.nodes.get(c.to);
      const sa = path.nearestS(a.x, a.z).s;
      const sb = path.nearestS(b.x, b.z, sa).s;
      out.push({ runwayId: c.runwayId, to: c.to, sStop: Math.max(0, sa + 2 - this.halfLen), sClear: sb - 5 + this.halfLen + 3, granted: false, released: false });
    }
    return out;
  }

  buildRolloutPath(r, plan) {
    const grid = this.game.grid;
    const exitIdx = plan.exit.index;
    const tdDist = F.touchdownTiles * TILE;
    const td = { x: r.thr.x + r.dir.x * tdDist, z: r.thr.z + r.dir.z * tdDist };
    const pts = [{ x: td.x, z: td.z, v: 45 }];
    const along = (i, lat = 0) => {
      const c = grid.runwayPoint(r, i);
      return { x: c.x - r.dir.z * lat, z: c.z + r.dir.x * lat };
    };
    if (plan.backtrack) {
      const stopIdx = Math.min(r.length - 2, plan.minIdx);
      pts.push({ ...along(stopIdx), v: 45 });
      // tight U-turn on the runway (radius 7 m), then roll back to the exit
      const n = 10;
      for (let k = 1; k <= n; k++) {
        const t = (k / n) * Math.PI;
        pts.push({ ...along(stopIdx + 0.7 * Math.sin(t), 0.7 * (1 - Math.cos(t))), v: 3.5 });
      }
      pts.push({ ...along(Math.max(exitIdx + 2, stopIdx - 3), 0.9), v: 10 });
    }
    const exitPt = along(exitIdx);
    pts.push({ x: exitPt.x, z: exitPt.z, v: plan.backtrack ? 8 : 45, r: 17 });
    const rp = this.routePoints(plan.route.nodes);
    for (const p of rp.pts) pts.push(p);
    const path = new Path(pts, { radius: 11, cruise: F.taxiSpeed, decel: F.rolloutDecel, minTurn: 4, latAccel: 3.2 });
    const crossings = this.crossingPoints(path, rp.crossMarks);
    return { path, crossings, route: this.routeInfo(path, plan.reserve) };
  }

  routeInfo(path, nodes) {
    const graph = this.game.graph;
    const nodeS = new Map();
    let from = 0;
    for (const id of nodes) {
      const n = graph.nodes.get(id);
      if (!n) continue;
      const r = path.nearestS(n.x, n.z, from);
      nodeS.set(id, r.s);
      from = Math.max(0, r.s - 1);
    }
    return { nodes, nodeS };
  }

  // ---- ground motion -----------------------------------------------------------------
  updateGround(dt) {
    const path = this.path;
    if (!path) return;
    // crossings: stop short unless cleared
    let hold = this.holdS;
    for (const c of this.crossings) {
      if (c.granted) {
        if (!c.released && this.s >= c.sClear) {
          c.released = true;
          this.game.atc.unlock(c.runwayId, this);
        }
        continue;
      }
      if (c.sStop < this.s - 3) continue;
      hold = hold === null ? c.sStop : Math.min(hold, c.sStop);
      if (c.sStop - this.s < 90) {
        this.crossWait = c;
        this.game.atc.requestCrossing(this, c.runwayId);
      }
      break;
    }
    // queue: never roll into a node someone who reserved earlier hasn't left
    const q = this.queueStop();
    if (q !== null) hold = hold === null ? q : Math.min(hold, q);
    let vmax = path.vmaxAt(this.s);
    if (hold !== null) vmax = Math.min(vmax, Math.sqrt(2 * 2.4 * Math.max(0, hold - this.s)));
    const accel = this.state === S.PUSHBACK ? 1.1 : F.taxiAccel;
    if (this.v < vmax) this.v = Math.min(vmax, this.v + accel * dt);
    else this.v = Math.max(vmax, this.v - (this.state === S.ROLLOUT ? F.rolloutDecel * 1.6 : 4) * dt);
    this.s = Math.min(path.length, this.s + this.v * dt);
    const p = path.sample(this.s, _s);
    this.pos.x = p.x;
    this.pos.z = p.z;
    let h = Math.atan2(p.hx, p.hz);
    if (this.reverse) h = wrapAngle(h + Math.PI);
    this.yaw = dampAngle(this.yaw, h, this.state === S.ROLLOUT ? 10 : 7, dt);
    this.alt = 0;
    this.roll = lerp(this.roll, 0, 1 - Math.exp(-4 * dt));
    this.pitch = lerp(this.pitch, 0, 1 - Math.exp(-2 * dt));
    this.releaseT -= dt;
    if (this.releaseT <= 0) {
      this.releaseT = 0.2;
      this.releaseBehind();
    }
    if (this.landingLock && this.clearOfRunway()) {
      this.landingLock = false;
      this.game.atc.unlock(this.runway.id, this);
      if (this.state === S.ROLLOUT) this.setState(S.TAXI_IN);
    }
    if (this.s >= path.length - 0.05 && this.v < 0.3) {
      const cb = this.onPathEnd;
      this.onPathEnd = null;
      cb?.();
    }
  }

  queueStop() {
    const route = this.route;
    const res = this.game.reservations;
    if (!route || !route.nodes.length) {
      res.setWaiting(this.id, null);
      return null;
    }
    for (const id of route.nodes) {
      const ns = route.nodeS.get(id);
      if (ns === undefined || ns === Infinity || ns < this.s - 2) continue;
      if (!res.isHead(this.id, id)) {
        res.setWaiting(this.id, id);
        this.queuedBehind = res.head(id);
        return ns - 5 - this.halfLen - 6;
      }
    }
    res.setWaiting(this.id, null);
    this.queuedBehind = null;
    return null;
  }

  // ready to cross a runway: first in line for the taxiway on the far side
  crossReady() {
    const c = this.crossWait;
    if (!c || !this.route) return false;
    const nodes = this.route.nodes;
    const i = nodes.indexOf(c.to);
    if (i < 0) return true;
    const n = Math.ceil((this.type.length * 2 + 12) / TILE) + 1;
    const res = this.game.reservations;
    return nodes.slice(i, i + n).every((id) => res.isHead(this.id, id));
  }

  yieldInQueues(others) {
    const graph = this.game.graph;
    this.game.reservations.yieldTo(this.id, others, (id) => {
      const n = graph.nodes.get(id);
      return !n || this.distToBody(n.x, n.z) < 9 || n.kind === 'stand';
    });
  }

  bodySegment() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    return { ax: this.pos.x + fx * this.halfLen, az: this.pos.z + fz * this.halfLen, bx: this.pos.x - fx * this.halfLen, bz: this.pos.z - fz * this.halfLen };
  }

  distToBody(x, z) {
    const b = this.bodySegment();
    const dx = b.bx - b.ax, dz = b.bz - b.az;
    const l2 = dx * dx + dz * dz || 1;
    const u = clamp(((x - b.ax) * dx + (z - b.az) * dz) / l2, 0, 1);
    return Math.hypot(x - (b.ax + dx * u), z - (b.az + dz * u));
  }

  releaseBehind() {
    const res = this.game.reservations;
    const held = res.held(this.id);
    if (!held.size) return;
    const graph = this.game.graph;
    for (const id of [...held]) {
      const ns = this.route?.nodeS?.get(id);
      if (ns !== undefined && ns > this.s - 4) continue; // still ahead (or under the nose)
      const n = graph.nodes.get(id);
      if (!n) {
        res.release(this.id, id);
        continue;
      }
      if (this.distToBody(n.x, n.z) > (n.kind === 'stand' ? 12 : 8.5)) res.release(this.id, id);
    }
  }

  clearOfRunway() {
    const r = this.runway;
    if (!r) return true;
    const b = this.bodySegment();
    const inside = (x, z) => {
      const ux = x - (r.start.x + r.end.x) / 2, uz = z - (r.start.z + r.end.z) / 2;
      const along = ux * r.dir.x + uz * r.dir.z;
      const lat = -ux * r.dir.z + uz * r.dir.x;
      return Math.abs(along) <= r.lengthM / 2 + 6 && Math.abs(lat) <= (BALANCE.runway.width * TILE) / 2 + 1.5;
    };
    return !inside(b.ax, b.az) && !inside(b.bx, b.bz) && !inside(this.pos.x, this.pos.z);
  }

  arriveAtStand() {
    const stand = this.game.grid.structures.get(this.standId);
    if (stand) {
      stand.occupiedBy = this.id;
      stand.reservedBy = null;
    }
    this.v = 0;
    this.releaseBehind();
    this.setState(S.PARKED);
    this.flapTarget = 0;
    this.turnaround = this.game.turnarounds.start(this, stand);
    this.game.events.emit('parked', this, stand);
  }

  // ---- departure ----------------------------------------------------------------------
  pushbackZone(stand, plan) {
    const graph = this.game.graph;
    const entry = graph.nodes.get(stand.entry);
    const nodes = plan.route.nodes;
    let d;
    const next = nodes[2] !== undefined ? graph.nodes.get(nodes[2]) : null;
    if (next) d = { x: next.x - entry.x, z: next.z - entry.z };
    else {
      const r = plan.runway;
      const c = this.game.grid.runwayPoint(r, plan.access.index);
      d = { x: c.x - entry.x, z: c.z - entry.z };
    }
    const l = Math.hypot(d.x, d.z) || 1;
    d.x /= l;
    d.z /= l;
    // if the route runs straight back from the stand, swing the tail to one side
    if (d.x * -stand.fwd.x + d.z * -stand.fwd.z > 0.7) {
      const px = -stand.fwd.z, pz = stand.fwd.x;
      const hasL = graph.nodes.has(this.game.grid.idx(entry.tx + Math.round(px), entry.tz + Math.round(pz)));
      d = hasL ? { x: -px, z: -pz } : { x: px, z: pz };
    }
    const b = { x: -d.x, z: -d.z };
    const reach = 8 + this.halfLen + 4;
    const end = { x: entry.x + b.x * 8, z: entry.z + b.z * 8 };
    const zone = [];
    for (const n of graph.nodes.values()) {
      if (n.kind !== 'taxi') continue;
      const ux = n.x - entry.x, uz = n.z - entry.z;
      const t = ux * b.x + uz * b.z;
      if (t < -6 || t > reach) continue;
      const lat = Math.abs(-ux * b.z + uz * b.x);
      if (lat < 8) zone.push(n.id);
    }
    // the nose swings round into the taxiway ahead as the plane straightens up
    const ahead = Math.ceil(Math.max(0, this.halfLen - 8 + 6) / TILE);
    for (let k = 1; k <= ahead; k++) {
      const id = this.game.grid.idx(entry.tx + Math.round(d.x * k), entry.tz + Math.round(d.z * k));
      if (graph.nodes.has(id) && !zone.includes(id)) zone.push(id);
    }
    return { zone, end, face: d, entry };
  }

  tryPushback() {
    const atc = this.game.atc;
    this.pushWait = (this.pushWait || 0) + 0.6;
    const plan = atc.planDeparture(this, this.pushWait);
    if (!plan) {
      this.waitNote = this.game.grid.runways.length ? 'Waiting for taxi clearance' : 'No runway';
      return false;
    }
    const stand = this.game.grid.structures.get(this.standId);
    const pb = this.pushbackZone(stand, plan);
    const nodes = [...new Set([...plan.reserve, ...pb.zone])];
    // the stand, its entry and the pushback area are occupied straight away
    const exclusive = [...new Set([plan.route.nodes[0], plan.route.nodes[1], ...pb.zone])];
    if (!this.game.reservations.tryReserve(this.id, nodes, exclusive)) {
      this.waitNote = 'Waiting for taxi clearance';
      return false;
    }
    this.waitNote = null;
    this.depPlan = plan;
    this.depRunway = plan.runway;
    this.depAccess = plan.access;
    this.runwayGranted = false;
    // pushback path: straight back out of the stand, then swing onto the taxiway
    const pp = this.parkingPoint(stand);
    const pts = [
      { x: pp.x, z: pp.z, v: F.pushbackSpeed },
      { x: stand.backEdge.x, z: stand.backEdge.z, v: F.pushbackSpeed },
      { x: pb.entry.x, z: pb.entry.z, v: F.pushbackSpeed },
      { x: pb.end.x, z: pb.end.z, v: F.pushbackSpeed },
    ];
    this.path = new Path(pts, { radius: 9, cruise: F.pushbackSpeed, decel: 1.1, minTurn: 2.2, latAccel: 1.4 });
    // keep the whole reserved route held while pushing back; only the stand
    // and pushback zone may be released as the plane clears them
    this.route = this.routeInfo(this.path, plan.route.nodes.slice(0, 1));
    for (const id of plan.reserve.slice(1)) this.route.nodeS.set(id, Infinity);
    for (const id of pb.zone) this.route.nodeS.set(id, Infinity);
    this.s = 0;
    this.v = 0;
    this.reverse = true;
    this.holdS = null;
    this.crossings = [];
    this.pushEnd = pb.end;
    this.onPathEnd = () => this.startTaxiOut();
    if (stand) stand.occupiedBy = null;
    this.setState(S.PUSHBACK);
    this.game.events.emit('pushback', this, stand);
    return true;
  }

  startTaxiOut() {
    const plan = this.depPlan;
    const rp = this.routePoints(plan.route.nodes.slice(1), { from: { x: this.pushEnd.x, z: this.pushEnd.z } });
    this.path = new Path(rp.pts, { radius: 9, cruise: F.taxiSpeed, decel: 2.4 });
    // the stand is behind us now; it's released once the tail clears it
    this.route = this.routeInfo(this.path, plan.reserve.slice(1));
    this.crossings = this.crossingPoints(this.path, rp.crossMarks);
    this.s = 0;
    this.v = 0;
    this.reverse = false;
    const acc = this.game.graph.nodes.get(plan.access.node.id);
    const sAcc = this.path.nearestS(acc.x, acc.z, Math.max(0, this.path.length - 60)).s;
    this.depHoldS = Math.max(0, sAcc - Math.max(0, this.halfLen - 2));
    this.holdS = this.depHoldS;
    this.accessPoint = { x: acc.x, z: acc.z };
    this.flapTarget = 0.35;
    this.onPathEnd = null;
    this.setState(S.TAXI_OUT);
  }

  updateTaxiOut(dt) {
    if (!this.runwayGranted) {
      const near = this.depHoldS - this.s < 80;
      if (near) {
        if (!this.atHoldShort) {
          this.atHoldShort = true;
          this.holdShortSince = this.game.simTime;
        }
        this.game.atc.requestDeparture(this);
      }
    }
    this.updateGround(dt);
  }

  grantRunway() {
    this.runwayGranted = true;
    this.atHoldShort = false;
    this.atcNote = null;
    // line-up path from where we are onto the runway centre line
    const r = this.depRunway;
    const grid = this.game.grid;
    const a = this.depAccess;
    const along = (i, lat = 0) => {
      const c = grid.runwayPoint(r, i);
      return { x: c.x - r.dir.z * lat, z: c.z + r.dir.x * lat };
    };
    const pts = [{ x: this.pos.x, z: this.pos.z, v: 10 }, { x: this.accessPoint.x, z: this.accessPoint.z, v: 9 }];
    const back = r.length - a.index < this.type.runway;
    let start;
    if (!back) {
      start = a.index;
      pts.push({ ...along(a.index), v: 8 });
      pts.push({ ...along(Math.min(r.length - 1, start + 3)), v: 6 });
    } else {
      // backtrack to the start of the runway and turn around
      pts.push({ ...along(a.index), v: 9 });
      pts.push({ ...along(2.2), v: 12 });
      const n = 10;
      for (let k = 1; k <= n; k++) {
        const t = (k / n) * Math.PI;
        pts.push({ ...along(2.2 - 0.8 * Math.sin(t), 0.8 * (1 - Math.cos(t))), v: 3.2 });
      }
      pts.push({ ...along(4.5, 0), v: 4 });
      start = 4.5;
    }
    this.path = new Path(pts, { radius: 10, cruise: 12, decel: 3, minTurn: 3.5, latAccel: 2.8 });
    this.route = { nodes: [], nodeS: new Map() };
    this.crossings = [];
    this.s = 0;
    this.holdS = null;
    this.onPathEnd = () => {
      this.lineupWait = 1.2;
      this.setState(S.LINED_UP);
    };
    this.setState(S.TAXI_OUT);
    this.stateT = 0;
    this.linedUpOn = r;
  }

  grantCrossing(rid) {
    for (const c of this.crossings) if (c.runwayId === rid && !c.granted) {
      c.granted = true;
      break;
    }
    this.crossWait = null;
  }

  updateTakeoff(dt) {
    const r = this.depRunway;
    this.v += F.takeoffAccel * dt * (this.alt > 0 ? 0.6 : 1);
    if (this.v > 75) this.v = 75;
    this.pos.x += Math.sin(this.yaw) * this.v * dt;
    this.pos.z += Math.cos(this.yaw) * this.v * dt;
    this.yaw = dampAngle(this.yaw, r.heading, 4, dt);
    if (this.v >= F.rotateSpeed) {
      this.airborneT += dt;
      this.pitch = lerp(this.pitch, 0.16, 1 - Math.exp(-2.5 * dt));
      this.alt += F.climbRate * clamp(this.airborneT / 2, 0.15, 1) * dt;
      if (this.airborneT > 2.5) this.gearTarget = 0;
      if (this.alt > 120) this.flapTarget = 0;
    }
    if (this.runwayHeld && (this.alt > 25 || !this.onRunwayStrip(r))) {
      this.runwayHeld = false;
      this.game.atc.unlock(r.id, this);
      this.game.reservations.releaseAll(this.id);
    }
    if (this.alt > 25) {
      this.setState(S.DEPARTED);
      this.climbOut = { leg: 0, bearing: hashBearing(this.flight.to?.[0] || 'X') };
      this.game.events.emit('takeoff', this);
    }
  }

  onRunwayStrip(r) {
    const ux = this.pos.x - (r.start.x + r.end.x) / 2, uz = this.pos.z - (r.start.z + r.end.z) / 2;
    return Math.abs(ux * r.dir.x + uz * r.dir.z) <= r.lengthM / 2 + this.halfLen;
  }

  // ---- per-frame -------------------------------------------------------------------------
  update(dt) {
    this.stateT += dt;
    const st = this.state;
    const atc = this.game.atc;
    switch (st) {
      case S.INBOUND:
      case S.HOLDING:
      case S.GO_AROUND: {
        this.fuel -= dt;
        if (st !== S.INBOUND) this.holdingTime += dt;
        if (this.fuel <= 0) {
          this.divert();
          break;
        }
        const slot = atc.slotOf(this);
        this.targetAlt = F.holdingAltitude + slot * F.holdingStep;
        this.gearTarget = 0;
        if (st === S.GO_AROUND) {
          if (this.ga.phase === 0) {
            this.flyToward(this.ga.x, this.ga.z, F.holdingSpeed + 6, dt);
            this.climbToward(Math.max(260, this.targetAlt * 0.7), F.climbRate, dt);
            if (Math.hypot(this.ga.x - this.pos.x, this.ga.z - this.pos.z) < 140) this.ga.phase = 1;
            this.flapTarget = this.alt > 120 ? 0 : 0.3;
          } else {
            this.flyToward(atc.fix.x, atc.fix.z, F.holdingSpeed, dt);
            this.climbToward(this.targetAlt, 6, dt);
            if (Math.hypot(atc.fix.x - this.pos.x, atc.fix.z - this.pos.z) < F.holdingRadius * 1.4) this.setState(S.HOLDING);
          }
          break;
        }
        this.flapTarget = 0;
        const fx = atc.fix.x, fz = atc.fix.z;
        const dx = this.pos.x - fx, dz = this.pos.z - fz;
        const d = Math.hypot(dx, dz);
        if (st === S.INBOUND) {
          this.flyToward(fx, fz, F.inboundSpeed, dt);
          this.climbToward(Math.max(this.targetAlt, 380), 5, dt);
          if (d < F.holdingRadius * 1.4) this.setState(S.HOLDING);
        } else {
          // right-hand orbit around the fix
          const ang = Math.atan2(dz, dx) + 0.45;
          this.flyToward(fx + Math.cos(ang) * F.holdingRadius, fz + Math.sin(ang) * F.holdingRadius, F.holdingSpeed, dt);
          this.climbToward(this.targetAlt, 4, dt);
        }
        this.engineTarget = 1;
        break;
      }
      case S.APPROACH:
      case S.LANDING:
        this.fuel = Math.max(0, this.fuel - dt);
        this.updateApproach(dt);
        break;
      case S.ROLLOUT:
      case S.TAXI_IN:
        this.gearTarget = 1;
        if (this.stateT > 2 || st === S.TAXI_IN) this.flapTarget = 0;
        this.updateGround(dt);
        break;
      case S.PARKED:
        this.turnaround?.update(dt);
        if (this.turnaround?.ready) {
          this.pushTry = (this.pushTry || 0) - dt;
          if (this.pushTry <= 0) {
            this.pushTry = 0.6;
            this.tryPushback();
          }
        }
        break;
      case S.PUSHBACK:
        this.updateGround(dt);
        break;
      case S.TAXI_OUT:
        this.updateTaxiOut(dt);
        break;
      case S.LINED_UP:
        this.lineupWait -= dt;
        this.yaw = dampAngle(this.yaw, this.depRunway.heading, 3, dt);
        if (this.lineupWait <= 0) {
          this.runwayHeld = true;
          this.setState(S.TAKEOFF);
          this.airborneT = 0;
        }
        break;
      case S.TAKEOFF:
        this.updateTakeoff(dt);
        break;
      case S.DEPARTED:
        this.updateClimbOut(dt);
        break;
      case S.DIVERTED:
        this.updateDiverted(dt);
        break;
    }
    // engines
    const rpmT = st === S.PARKED ? (this.stateT < 4 ? 0.3 : 0) : st === S.PUSHBACK ? 0.25 : st === S.TAXI_IN || st === S.TAXI_OUT || st === S.ROLLOUT || st === S.LINED_UP ? 0.45 : 1;
    this.rpm = lerp(this.rpm, rpmT, 1 - Math.exp(-0.8 * dt));
    // trail for radar
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 1.2;
      this.trail.push(this.pos.x, this.pos.z);
      if (this.trail.length > 14) this.trail.splice(0, 2);
    }
  }

  updateClimbOut(dt) {
    const c = this.climbOut;
    this.v = Math.min(78, this.v + 2 * dt);
    if (c.leg === 0) {
      this.pos.x += Math.sin(this.yaw) * this.v * dt;
      this.pos.z += Math.cos(this.yaw) * this.v * dt;
      this.alt += F.climbRate * dt;
      this.pitch = lerp(this.pitch, 0.12, 1 - Math.exp(-dt));
      if (this.runwayHeld && (this.alt > 25 || !this.onRunwayStrip(this.depRunway))) {
        this.runwayHeld = false;
        this.game.atc.unlock(this.depRunway.id, this);
        this.game.reservations.releaseAll(this.id);
      }
      if (this.stateT > 18) c.leg = 1;
    } else {
      this.turnToward(c.bearing, this.v, dt);
      this.climbToward(900, F.climbRate, dt);
    }
    if (this.alt > 120) this.flapTarget = 0;
    if (this.stateT > 2) this.gearTarget = 0;
    if (Math.hypot(this.pos.x, this.pos.z) > F.radarRadius + 350) this.finished = true;
  }

  divert() {
    this.game.atc.remove(this);
    this.game.reservations.releaseAll(this.id);
    const out = Math.atan2(this.pos.x, this.pos.z);
    this.divertBearing = out;
    this.setState(S.DIVERTED);
    this.game.events.emit('diverted', this);
  }

  updateDiverted(dt) {
    this.turnToward(this.divertBearing, 60, dt);
    this.climbToward(900, 6, dt);
    this.gearTarget = 0;
    this.flapTarget = 0;
    if (Math.hypot(this.pos.x, this.pos.z) > F.radarRadius + 350) this.finished = true;
  }

  // ---- presentation ------------------------------------------------------------------------
  syncModel(dt, time = 0) {
    const onGround = this.alt <= 0.01;
    const groundY = this.state === S.ROLLOUT || this.state === S.LINED_UP || this.state === S.TAKEOFF ? RUNWAY_Y : TARMAC_Y;
    this.root.position.set(this.pos.x, this.alt + this.spec.gearH + (onGround ? groundY : groundY), this.pos.z);
    this.root.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    const P = this.parts;
    // gear
    this.gearT += clamp((this.gearTarget ?? 1) - this.gearT, -0.42 * dt, 0.42 * dt);
    if (dt === 0) this.gearT = this.gearTarget ?? this.gearT;
    for (const g of P.gear) {
      const t = 1 - this.gearT;
      g.g.visible = this.gearT > 0.04;
      if (g.kind === 'nose') g.g.rotation.x = -t * 1.55;
      else if (g.kind === 'nacelle') g.g.rotation.x = -t * 1.5;
      else g.g.rotation.z = -g.side * t * 1.5;
    }
    // flaps
    this.flapT += clamp((this.flapTarget ?? 0) - this.flapT, -0.35 * dt, 0.35 * dt);
    for (const f of P.flaps) {
      _q.setFromAxisAngle(f.axis, -Math.sign(f.axis.x) * this.flapT * 0.6);
      f.pivot.quaternion.copy(_q);
      f.pivot.position.set(f.base.x, f.base.y - this.flapT * 0.15, f.base.z - this.flapT * 0.55);
    }
    // engines
    const spin = this.rpm * dt;
    for (const p of P.props) p.rotation.z += spin * 38;
    for (const d of P.discs) {
      d.visible = this.rpm > 0.35;
      d.material.opacity = 0.18;
    }
    for (const f of P.fans) f.rotation.z += spin * 30;
    // lights
    const running = this.rpm > 0.08;
    const beacon = running && (time * 1.1) % 1 < 0.14;
    for (const b of P.beacons) b.visible = beacon;
    const airborne = this.alt > 1 || this.state === S.TAKEOFF;
    const strobe = airborne && ((time * 0.9) % 1 < 0.05 || ((time * 0.9) % 1 > 0.12 && (time * 0.9) % 1 < 0.16));
    for (const s of P.strobes) s.visible = strobe;
  }

  statusText() {
    const s = this.state;
    if (s === S.PARKED && this.turnaround) return this.turnaround.status();
    if (s === S.PARKED && this.waitNote) return this.waitNote;
    if (s === S.TAXI_OUT && !this.runwayGranted && this.atHoldShort) return this.atcNote || 'Holding short';
    if (s === S.TAXI_OUT && this.crossWait && !this.crossWait.granted) return 'Waiting to cross';
    if ((s === S.TAXI_IN || s === S.ROLLOUT) && this.crossWait && !this.crossWait.granted) return 'Waiting to cross';
    if ((s === S.HOLDING || s === S.INBOUND || s === S.GO_AROUND) && this.atcNote) return this.atcNote;
    if (s === S.APPROACH) return 'Cleared to land';
    return STATE_LABEL[s];
  }

  dispose() {
    this.game.renderer.scene.remove(this.root);
  }
}

function hashBearing(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 360) * Math.PI) / 180;
}
export { hashBearing };
