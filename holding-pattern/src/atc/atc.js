import { BALANCE } from '../config/balance.js';
import { PLANE_TYPES } from '../config/planeTypes.js';
import { astar } from '../pathfinding/astar.js';
import { STAND_BASE } from '../pathfinding/taxiGraph.js';
import { S } from '../planes/states.js';

const F = BALANCE.flight;
const TILE = BALANCE.map.tile;

// Air traffic control: the landing queue, runway locks, arrival sequencing,
// stand assignment and taxi route reservation, departure and crossing
// clearances, go-arounds and the deadlock watchdog.
export class ATC {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.queue = []; // plane ids waiting to be cleared to land, in order
    this.rw = new Map(); // runwayId -> runway state
    this.fix = { x: 880, z: -760 };
    this.timer = 0;
    this.watchdog = 0;
  }

  state(rid) {
    let st = this.rw.get(rid);
    if (!st) {
      st = { lock: null, lastTouch: -1e9, lastWake: 0, lastClear: -1e9, depQueue: [], crossQueue: [], busyUntil: 0 };
      this.rw.set(rid, st);
    }
    return st;
  }

  get planes() {
    return this.game.planes;
  }

  now() {
    return this.game.simTime;
  }

  // ---- queue ---------------------------------------------------------------
  enqueue(plane) {
    if (!this.queue.includes(plane.id)) this.queue.push(plane.id);
    this.game.events.emit('queueChanged');
  }

  remove(plane) {
    const i = this.queue.indexOf(plane.id);
    if (i >= 0) {
      this.queue.splice(i, 1);
      this.game.events.emit('queueChanged');
    }
  }

  move(planeId, toIndex) {
    const i = this.queue.indexOf(planeId);
    if (i < 0) return;
    this.queue.splice(i, 1);
    this.queue.splice(Math.max(0, Math.min(toIndex, this.queue.length)), 0, planeId);
    this.game.events.emit('queueChanged');
  }

  queuedPlanes() {
    return this.queue.map((id) => this.planes.get(id)).filter(Boolean);
  }

  // stack slot for holding altitude (only planes still waiting count)
  slotOf(plane) {
    let k = 0;
    for (const id of this.queue) {
      if (id === plane.id) return k;
      const p = this.planes.get(id);
      if (p && (p.state === S.HOLDING || p.state === S.INBOUND || p.state === S.GO_AROUND)) k++;
    }
    return k;
  }

  // ---- runways -------------------------------------------------------------
  runways() {
    return this.game.grid.runways;
  }

  runwayFor(plane) {
    const rws = this.runways().filter((r) => r.length >= PLANE_TYPES[plane.cls].runway);
    if (!rws.length) return null;
    if (plane.runwayId && rws.some((r) => r.id === plane.runwayId)) return this.game.grid.structures.get(plane.runwayId);
    // auto: the runway whose threshold is closest to the plane
    let best = rws[0], bd = Infinity;
    for (const r of rws) {
      const d = Math.hypot(r.thr.x - plane.pos.x, r.thr.z - plane.pos.z) - r.length * 2;
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  lockHolder(rid) {
    return this.state(rid).lock;
  }

  tryLock(rid, plane, kind, until) {
    const st = this.state(rid);
    if (st.lock && st.lock.planeId !== plane.id) return false;
    st.lock = { planeId: plane.id, kind, since: this.now() };
    st.busyUntil = Math.max(st.busyUntil, until ?? this.now() + 15);
    return true;
  }

  unlock(rid, plane) {
    const st = this.state(rid);
    if (st.lock && st.lock.planeId === plane.id) {
      st.lock = null;
      st.busyUntil = this.now();
    }
  }

  // next arrival touchdown on this runway (seconds from now), or Infinity
  nextArrivalIn(rid) {
    let best = Infinity;
    for (const p of this.planes.values()) {
      if (p.state === S.APPROACH && p.runway?.id === rid) best = Math.min(best, p.touchdownAt - this.now());
    }
    return best;
  }

  // ---- arrivals ---------------------------------------------------------------
  update(dt) {
    this.timer -= dt;
    const grid = this.game.grid;
    // drop queue entries for planes that no longer exist
    if (this.queue.some((id) => !this.planes.has(id))) this.queue = this.queue.filter((id) => this.planes.has(id));
    if (this.timer <= 0) {
      this.timer = 0.4;
      if (this.game.graph.refresh()) this.updateFix();
      const done = new Set();
      for (const id of [...this.queue]) {
        const p = this.planes.get(id);
        if (!p || p.state === S.APPROACH || p.state === S.DIVERTED) continue;
        const r = this.runwayFor(p);
        if (!r) {
          p.atcNote = grid.runways.length ? 'Runway too short' : 'No runway';
          continue;
        }
        // first plane in the queue for each runway is the one that may be cleared
        if (done.has(r.id)) {
          p.atcNote = null;
          continue;
        }
        done.add(r.id);
        this.tryClear(p, r);
      }
      for (const r of this.runways()) this.serviceDepartures(r);
    }
    this.watchdog -= dt;
    if (this.watchdog <= 0) {
      this.watchdog = 2;
      this.checkDeadlock();
    }
  }

  separationAfter(prevWake, cls) {
    const a = BALANCE.atc;
    const wake = PLANE_TYPES[cls].wake;
    return a.separation + (prevWake > wake ? a.wakePenalty * (prevWake - wake) : 0);
  }

  // Holding fix beside the approach end of the longest runway, out to one side.
  updateFix() {
    const rws = this.runways();
    if (!rws.length) {
      this.fix = { x: 880, z: -760 };
      return;
    }
    const r = rws.reduce((a, b) => (b.length > a.length ? b : a));
    const px = -r.dir.z, pz = r.dir.x;
    // the side of the centre line facing away from the middle of the map
    const mx = (r.start.x + r.end.x) / 2, mz = (r.start.z + r.end.z) / 2;
    const side = px * mx + pz * mz >= 0 ? 1 : -1;
    this.fix = {
      x: r.thr.x - r.dir.x * 350 + px * side * F.holdingOffset,
      z: r.thr.z - r.dir.z * 350 + pz * side * F.holdingOffset,
    };
  }

  depOccupancy(plane, r, access) {
    // time from leaving the hold-short to clearing the runway
    const needBack = access && r.length - access.index < PLANE_TYPES[plane.cls].runway;
    const backtrack = needBack ? (access.index * TILE) / 9 + 18 : 0;
    const line = (PLANE_TYPES[plane.cls].length + 45) / 8 + backtrack;
    const roll = F.rotateSpeed / F.takeoffAccel + 3;
    return line + roll;
  }

  // seconds from touchdown until the arrival's tail is off the runway
  rolloutOccupancy(plane, plan) {
    const tdDist = F.touchdownTiles * TILE;
    const v0 = F.touchdownSpeed, vx = 9;
    const dist = Math.max(0, plan.exit.index * TILE - tdDist);
    const dBrake = (v0 * v0 - vx * vx) / (2 * F.rolloutDecel);
    let t = (v0 - vx) / F.rolloutDecel + Math.max(0, dist - dBrake) / ((v0 + vx) / 2.2);
    if (plan.backtrack) t += 26 + (plan.minIdx - plan.exit.index) * TILE / 9;
    return t + (PLANE_TYPES[plane.cls].length + 30) / 7 + 2;
  }

  // seconds from touchdown back to the go-around decision point
  static decisionLead() {
    return F.decisionDistance / F.approachSpeed + (F.touchdownTiles * TILE) / F.touchdownSpeed;
  }

  tryClear(plane, r) {
    const now = this.now();
    const st = this.state(r.id);
    const eta = plane.estimateApproach(r);
    const touch = now + eta;
    const sep = this.separationAfter(st.lastWake, plane.cls);
    const buf = BALANCE.atc.runwayBuffer;
    // runway must be free by the time the arrival reaches the decision point
    const decisionAt = touch - ATC.decisionLead();
    if (touch < st.lastTouch + sep || decisionAt < st.lastClear + buf) {
      plane.atcNote = 'Sequenced';
      return false;
    }
    if (st.lock && st.busyUntil + buf > decisionAt) {
      plane.atcNote = 'Runway busy';
      return false;
    }
    // a departure that has waited too long gets a gap carved out for it
    const res = this.game.reservations;
    const waitingDep = st.depQueue
      .map((id) => this.planes.get(id))
      .find((d) => d && d.atHoldShort && d.holdShortSince !== null && now - d.holdShortSince > BALANCE.atc.departureFairness && res.isHead(d.id, d.depAccess.node.id));
    if (waitingDep) {
      const free = Math.max(now, st.lastClear, st.lock ? st.busyUntil : now);
      if (decisionAt < free + this.depOccupancy(waitingDep, r, waitingDep.depAccess) + buf * 2) {
        plane.atcNote = 'Holding for departures';
        return false;
      }
    }
    const plan = this.planArrival(plane, r);
    if (!plan.ok) {
      plane.atcNote = plan.reason;
      return false;
    }
    if (!this.game.reservations.tryReserve(plane.id, plan.reserve, plan.exclusive)) {
      plane.atcNote = 'Waiting for taxi route';
      return false;
    }
    plan.stand.reservedBy = plane.id;
    plane.flight.standId = plan.stand.id;
    plane.flight.lounge = this.game.terminal.loungeFor(plan.stand);
    plane.atcNote = null;
    this.remove(plane);
    st.lastTouch = touch;
    st.lastClear = touch + this.rolloutOccupancy(plane, plan);
    st.lastWake = PLANE_TYPES[plane.cls].wake;
    plane.clearToLand(r, plan);
    this.game.events.emit('cleared', plane);
    return true;
  }

  rolloutIndex(cls) {
    const v0 = F.touchdownSpeed, v1 = F.taxiSpeed * 0.55;
    const dist = (v0 * v0 - v1 * v1) / (2 * F.rolloutDecel);
    return F.touchdownTiles + Math.ceil(dist / TILE) + 2;
  }

  standScore(s, cls) {
    const order = { S: 0, M: 1, L: 2 };
    const need = order[PLANE_TYPES[cls].stand];
    const waste = order[s.size] - need;
    // gates beat remote stands (passengers walk the apron to those) unless
    // the gate is much too big for this plane
    let score = waste * 90 + (s.gate ? 0 : 300);
    // prefer gates whose terminal side is actually connected to a lounge
    if (s.gate && !this.game.terminal.standDoor?.(s)) score += 100;
    return score;
  }

  freeStands(cls) {
    const graph = this.game.graph;
    return this.game.grid.stands.filter(
      (s) => BALANCE.stands.fits[s.size].includes(cls) && !s.occupiedBy && !s.reservedBy && graph.standNode(s.id)?.edges.length,
    );
  }

  planArrival(plane, r) {
    const graph = this.game.graph;
    const stands = this.freeStands(plane.cls);
    if (!stands.length) {
      const any = this.game.grid.stands.some((s) => BALANCE.stands.fits[s.size].includes(plane.cls));
      return { ok: false, reason: any ? 'Waiting for stand' : `Needs a ${PLANE_TYPES[plane.cls].stand} stand` };
    }
    const minIdx = this.rolloutIndex(plane.cls);
    const exits = graph.accessNodes(r.id).filter((a) => a.kind === 'side' || a.index === r.length - 1);
    if (!exits.length) return { ok: false, reason: 'No taxiway off the runway' };
    const ahead = exits.filter((e) => e.index >= minIdx).sort((a, b) => a.index - b.index);
    const behind = exits.filter((e) => e.index < minIdx).sort((a, b) => b.index - a.index);
    const cand = [...ahead.slice(0, 5), ...behind.slice(0, 2)];
    const mid = { x: (r.start.x + r.end.x) / 2, z: (r.start.z + r.end.z) / 2 };
    const ranked = stands
      .map((s) => ({ s, score: this.standScore(s, plane.cls) + Math.hypot(s.center.x - mid.x, s.center.z - mid.z) * 0.15 }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 4);
    const res = this.game.reservations;
    const penalty = (n) => 5 * res.load(n, plane.id);
    // the plane must be able to roll straight off the runway: the first stretch
    // after the exit has to be clear of anyone else's reservation
    const clearLen = Math.ceil((PLANE_TYPES[plane.cls].length * 2 + 15) / TILE) + 1;
    let best = null;
    for (const { s, score } of ranked) {
      for (const e of cand) {
        if (!res.isExclusiveFree(e.node.id, plane.id)) continue;
        const route = astar(graph, e.node.id, STAND_BASE + s.id, { penalty });
        if (!route) continue;
        if (route.nodes.some((n, i) => i > 0 && graph.edge(route.nodes[i - 1], n)?.cross === r.id)) continue;
        const reserve = graph.withSweeps(route.nodes);
        const exclusive = reserve.slice(0, clearLen + 1);
        if (!res.canReserve(plane.id, exclusive)) continue;
        const back = e.index < minIdx;
        const total = score + route.cost + (back ? (minIdx - e.index) * TILE * 2.5 + 250 : (e.index - minIdx) * TILE * 0.3);
        if (!best || total < best.total) best = { stand: s, exit: e, route, reserve, exclusive, total, backtrack: back, minIdx };
      }
    }
    if (!best) return { ok: false, reason: 'Waiting for taxi route' };
    // backtracking ties up the runway: only do it if no forward exit exists
    // (or fuel is getting low), otherwise wait for one to clear
    if (best.backtrack && ahead.length && plane.fuel > BALANCE.fuel.amber) return { ok: false, reason: 'Waiting for runway exit' };
    return { ok: true, ...best };
  }

  // ---- departures --------------------------------------------------------------
  planDeparture(plane, waited = 0) {
    const graph = this.game.graph;
    graph.refresh();
    const need = PLANE_TYPES[plane.cls].runway;
    const res = this.game.reservations;
    const busy = (n) => 5 * res.load(n, plane.id);
    const start = STAND_BASE + plane.standId;
    const search = (pen) => {
      let best = null;
      for (const r of this.runways()) {
        if (r.length < need) continue;
        const ranked = graph
          .accessNodes(r.id)
          .map((a) => ({ a, back: r.length - a.index < need }))
          .sort((x, y) => x.back - y.back || x.a.index - y.a.index)
          .slice(0, 6);
        for (const { a, back } of ranked) {
          const route = astar(graph, start, a.node.id, { penalty: pen });
          if (!route) continue;
          // backtracking ties up the runway, so it has to be worth a lot of
          // taxiing; entering mid-runway blocks the exits arrivals need
          const midway = a.index > r.length * 0.2 ? 160 + a.index * 3 : 0;
          const total = route.cost + (back ? a.index * TILE * 5 + 800 : a.index * TILE * 0.2 + midway);
          if (!best || total < best.total) best = { runway: r, access: a, route, reserve: graph.withSweeps(route.nodes), total, backtrack: back };
        }
      }
      return best;
    };
    const free = search(busy);
    if (free && free.backtrack && waited < 45) {
      // a better route without backtracking exists once traffic clears: wait for it
      const ideal = search(null);
      if (ideal && !ideal.backtrack) return null;
    }
    return free;
  }

  // called by a departing plane stopped (or about to stop) at its hold-short line
  requestDeparture(plane) {
    const r = plane.depRunway;
    const st = this.state(r.id);
    if (!st.depQueue.includes(plane.id)) st.depQueue.push(plane.id);
    return plane.runwayGranted;
  }

  serviceDepartures(r) {
    const st = this.state(r.id);
    st.depQueue = st.depQueue.filter((id) => {
      const p = this.planes.get(id);
      return p && !p.runwayGranted && (p.state === S.TAXI_OUT || p.state === S.PUSHBACK);
    });
    st.crossQueue = st.crossQueue.filter((id) => {
      const p = this.planes.get(id);
      return p && p.crossWait && p.crossWait.runwayId === r.id;
    });
    if (st.lock) return;
    const now = this.now();
    const nextArr = this.nextArrivalIn(r.id) - ATC.decisionLead();
    // crossings first: they are quick
    for (const id of st.crossQueue) {
      const p = this.planes.get(id);
      if (!p.crossReady()) continue;
      const occ = (BALANCE.runway.width * TILE + PLANE_TYPES[p.cls].length + 20) / 6 + 2;
      if (nextArr > occ + BALANCE.atc.runwayBuffer) {
        if (this.tryLock(r.id, p, 'crossing', now + occ)) {
          p.grantCrossing(r.id);
          st.crossQueue = st.crossQueue.filter((x) => x !== id);
          return;
        }
      }
    }
    // the plane physically first in line at its hold-short goes first
    const res = this.game.reservations;
    const head = st.depQueue
      .map((id) => this.planes.get(id))
      .find((p) => p && p.atHoldShort && res.isHead(p.id, p.depAccess.node.id));
    if (!head) return;
    const occ = this.depOccupancy(head, r, head.depAccess);
    if (nextArr > occ + BALANCE.atc.runwayBuffer) {
      if (this.tryLock(r.id, head, 'takeoff', now + occ)) {
        head.grantRunway();
        st.depQueue = st.depQueue.filter((x) => x !== head.id);
      }
    } else {
      head.atcNote = 'Waiting for arrival';
    }
  }

  requestCrossing(plane, rid) {
    const st = this.state(rid);
    if (!st.crossQueue.includes(plane.id)) st.crossQueue.push(plane.id);
  }

  // arrival reaching the decision point: land if the runway is ours, else go around
  landingDecision(plane) {
    const r = plane.runway;
    const st = this.state(r.id);
    if (st.lock && st.lock.planeId !== plane.id) return false;
    return this.tryLock(r.id, plane, 'landing', this.now() + 20);
  }

  // ---- safety net ------------------------------------------------------------------
  // Queues only let planes wait for earlier ones, so cycles shouldn't form;
  // if one ever does, the newest plane in it yields its places in line.
  checkDeadlock() {
    const res = this.game.reservations;
    const cycle = res.findDeadlock();
    if (!cycle) return;
    let newest = null;
    for (const id of cycle) {
      const p = this.planes.get(id);
      if (p && (!newest || p.spawnedAt > newest.spawnedAt)) newest = p;
    }
    if (!newest) return;
    newest.yieldInQueues(cycle.filter((id) => id !== newest.id));
    this.game.events.emit('deadlockResolved', newest);
  }

  // ---- bulldoze guards ---------------------------------------------------------------
  isBusy(s) {
    if (s.kind === 'runway') {
      const st = this.rw.get(s.id);
      if (st?.lock) return 'A plane is using this runway';
      for (const p of this.planes.values()) {
        if ((p.runway?.id === s.id && (p.state === S.APPROACH || p.state === S.LANDING || p.state === S.ROLLOUT)) || p.depRunway?.id === s.id) return 'Planes are using this runway';
      }
    }
    if (s.kind === 'stand' && (s.occupiedBy || s.reservedBy)) return 'A plane is using this stand';
    return null;
  }

  isTileBusy(tile) {
    return this.game.reservations.inUse(tile) ? 'A plane is taxiing here' : null;
  }

  toJSON() {
    return { queue: [...this.queue] };
  }
}
