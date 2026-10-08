import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { AIRLINES } from '../config/airlines.js';
import { TONES } from '../config/palette.js';
import { rand, pick, clamp } from '../core/math.js';
import { FLOOR_Y } from '../terminal/terminalMesh.js';
import { TARMAC_Y } from '../build/structures.js';

const PX = BALANCE.passengers;
const TA = BALANCE.turnaround;

// Passenger states
const P = {
  TO_CHECKIN: 1, Q_CHECKIN: 2, SVC_CHECKIN: 3, EXIT_CHECKIN: 4,
  TO_SECURITY: 5, Q_SECURITY: 6, SVC_SECURITY: 7, EXIT_SECURITY: 8,
  TO_LOUNGE: 9, TO_SEAT: 10, SEATED: 11, TO_DOOR: 12, DOOR_Q: 13, BOARD_WALK: 14,
  ARR_WALK: 20, TO_EXIT: 21, LEAVING: 22, ANGRY: 23, ENTERING: 24,
};

const _o = { x: 0, z: 0, d: 0 };
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

// Every passenger in the airport. Simulation is plain objects; rendering is
// three InstancedMeshes (bodies, heads, suitcases) so 1000+ people cost three
// draw calls.
export class PassengerManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.byFlight = new Map(); // flightId -> Set(pax)
    this.doorLines = new Map(); // standId -> { line: [], timer }
    this.stats = { arrived: 0, departed: 0, missed: 0, happySum: 0, happyN: 0, recent: [] };
    const max = PX.maxActive;
    const body = new THREE.CapsuleGeometry(0.27, 0.72, 3, 8);
    body.translate(0, 0.63, 0);
    const head = new THREE.SphereGeometry(0.2, 10, 8);
    head.translate(0, 1.45, 0);
    const bag = new THREE.BoxGeometry(0.34, 0.5, 0.22);
    bag.translate(0.38, 0.3, -0.05);
    const mat = (o = {}) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, ...o });
    this.bodies = new THREE.InstancedMesh(body, mat(), max);
    this.heads = new THREE.InstancedMesh(head, mat({ roughness: 0.6 }), max);
    this.bags = new THREE.InstancedMesh(bag, mat({ roughness: 0.5 }), max);
    for (const im of [this.bodies, this.heads, this.bags]) {
      im.count = 0;
      im.castShadow = true;
      im.frustumCulled = false;
      im.setColorAt(0, _c.setHex(0xffffff));
      game.renderer.scene.add(im);
    }
    this.bags.castShadow = false;
    this.bagCount = 0;
    this.hidden = false;
    game.events.on('boardingOpen', (flight) => this.onBoardingOpen(flight));
    game.events.on('roomRemoved', (rt) => this.onRoomRemoved(rt));
    game.events.on('diverted', (plane) => this.onFlightCancelled(plane.flight));
  }

  get terminal() {
    return this.game.terminal;
  }
  get fields() {
    return this.game.terminal.fields;
  }

  reset() {
    this.list.length = 0;
    this.byFlight.clear();
    this.doorLines.clear();
    for (const rt of this.terminal.roomRt.values()) {
      if (rt.queue) rt.queue.length = 0;
      rt.serving = null;
      if (rt.seats) for (const s of rt.seats) s.taken = null;
    }
    this.stats = { arrived: 0, departed: 0, missed: 0, happySum: 0, happyN: 0, recent: [] };
  }

  // ---- spawning ------------------------------------------------------------------
  make(flight, state, x, z, y) {
    const a = AIRLINES[flight.airline];
    const p = {
      flight,
      state,
      x,
      z,
      y,
      yaw: rand(Math.PI * 2),
      speed: PX.walkSpeed * rand(0.82, 1.15),
      phase: rand(10),
      happy: rand(PX.startHappiness[0], PX.startHappiness[1]),
      patience: a.patience,
      ox: rand(-1.1, 1.1),
      oz: rand(-1.1, 1.1),
      shirt: pick(TONES.shirts),
      skin: pick(TONES.skin),
      bagColor: pick([0x2b2f38, 0xf2a541, 0x1f3a5f, 0xc0392b, 0x7bc67b, 0x9aa3ad]),
      bag: true,
      waitT: 0,
      stuckT: 0,
      moving: false,
      path: null,
      pathI: 0,
    };
    this.list.push(p);
    let set = this.byFlight.get(flight.id);
    if (!set) this.byFlight.set(flight.id, (set = new Set()));
    set.add(p);
    return p;
  }

  // a departing passenger turns up at a terminal entrance
  spawnDeparting(flight) {
    if (this.list.length >= PX.maxActive) return null;
    const doors = this.terminal.doorPoints;
    if (!doors?.length) return null;
    const d = pick(doors);
    const p = this.make(flight, P.ENTERING, d.x + rand(-3, 3), d.z + rand(0, 3), TARMAC_Y);
    p.path = [{ x: d.inX + rand(-2.5, 2.5), z: d.inZ, y: FLOOR_Y }];
    p.pathI = 0;
    p.dep = true;
    p.yaw = Math.PI;
    flight.depSpawned++;
    return p;
  }

  // an arriving passenger steps off a parked plane
  deplane(plane, stand) {
    const flight = plane.flight;
    if (this.list.length >= PX.maxActive) {
      this.recordArrival(flight, 75);
      return;
    }
    const route = this.boardingRoute(plane, stand);
    const start = route[route.length - 1];
    const p = this.make(flight, P.ARR_WALK, start.x, start.z, start.y);
    p.path = route.slice().reverse();
    p.pathI = 0;
    p.dep = false;
    p.bag = false;
    // time in the holding stack and go-arounds sour the mood
    p.happy -= Math.max(0, plane.holdingTime - 30) * PX.holdingDrainPerSec * p.patience;
    p.happy -= plane.goArounds * PX.goAroundHit;
    p.noTerminal = !this.terminal.standDoor(stand);
    if (stand && !stand.gate) p.happy -= PX.walkOutHit;
  }

  // points from the terminal door to the plane's door (y included)
  boardingRoute(plane, stand) {
    const door = stand && this.terminal.standDoor(stand);
    const pd = plane.doorWorld();
    const ground = { x: pd.x + pd.ox * 3.2, z: pd.z + pd.oz * 3.2, y: TARMAC_Y };
    if (!door) return [{ x: ground.x + pd.ox * 30, z: ground.z + pd.oz * 30, y: TARMAC_Y }, ground];
    if (door.kind === 'gate') {
      const jb = this.game.jetbridges?.forStand(stand.id);
      if (jb && jb.docked) {
        return [{ x: door.inside.x, z: door.inside.z, y: FLOOR_Y }, { x: door.wall.x, z: door.wall.z, y: FLOOR_Y }, ...jb.walkPoints(), { x: pd.x, z: pd.z, y: pd.y - 1.2 }];
      }
    }
    return [
      { x: door.inside.x, z: door.inside.z, y: FLOOR_Y },
      { x: door.wall.x, z: door.wall.z, y: TARMAC_Y },
      ground,
      { x: pd.x + pd.ox * 1.2, z: pd.z + pd.oz * 1.2, y: pd.y - 1.4 },
    ];
  }

  // ---- departures: per-flight lifecycle -----------------------------------------------
  onBoardingOpen(flight) {
    for (const p of this.byFlight.get(flight.id) || []) {
      if (p.state === P.SEATED) this.goToDoor(p);
    }
  }

  goToDoor(p) {
    if (p.seat) {
      p.seat.taken = null;
      p.seat = null;
    }
    const stand = this.game.grid.structures.get(p.flight.standId);
    const door = stand && this.terminal.standDoor(stand);
    if (!door) {
      p.state = P.SEATED; // nowhere to go yet
      return;
    }
    if (p.lounge && p.flight.lounge && p.lounge !== p.flight.lounge) p.happy -= PX.gateChangeHit;
    p.state = P.TO_DOOR;
    p.standId = stand.id;
  }

  boardingComplete(flight) {
    if (!flight.depSpawnDone) return false;
    for (const p of this.byFlight.get(flight.id) || []) if (p.dep && p.state !== P.ANGRY && p.state !== P.LEAVING) return false;
    return true;
  }

  // departure time: anyone not on board is left behind (and furious)
  closeBoarding(flight) {
    flight.depSpawnDone = true;
    for (const p of [...(this.byFlight.get(flight.id) || [])]) {
      if (!p.dep || p.state === P.BOARD_WALK || p.state === P.ANGRY || p.state === P.LEAVING) continue;
      this.missFlight(p);
    }
    this.doorLines.delete(flight.standId);
  }

  missFlight(p) {
    this.leaveRoom(p);
    if (p.seat) p.seat.taken = null;
    p.seat = null;
    p.happy -= PX.missedFlightHit;
    p.state = P.ANGRY;
    p.flight.depMissed++;
    this.stats.missed++;
    this.game.events.emit('paxMissed', p.flight, p);
  }

  onFlightCancelled(flight) {
    for (const p of [...(this.byFlight.get(flight.id) || [])]) if (p.dep && p.state !== P.ANGRY) this.missFlight(p);
    flight.depSpawnDone = true;
  }

  // ---- rooms ---------------------------------------------------------------------------
  pickRoom(p, type) {
    const fields = this.fields;
    const c = fields.cellOf(p.x, p.z);
    let best = null, bs = Infinity;
    const svc = BALANCE.rooms[type].serviceTime;
    for (const rt of this.terminal.roomsOf(type)) {
      if (!rt.portal?.length) continue;
      const f = fields.get(`portal:${rt.room.id}`, rt.portal);
      const d = c >= 0 ? f[c] : Infinity;
      if (!Number.isFinite(d)) continue;
      const score = (rt.queue.length + (rt.serving ? 0.6 : 0)) * svc + d / PX.walkSpeed;
      if (score < bs) {
        bs = score;
        best = rt;
      }
    }
    return best;
  }

  leaveRoom(p) {
    if (p.room) {
      const q = p.room.queue;
      const i = q.indexOf(p);
      if (i >= 0) q.splice(i, 1);
      if (p.room.serving === p) p.room.serving = null;
      p.room = null;
    }
  }

  onRoomRemoved(rt) {
    for (const p of this.list) {
      if (p.room === rt) {
        p.room = null;
        if (p.state <= P.EXIT_CHECKIN) p.state = P.TO_CHECKIN;
        else if (p.state <= P.EXIT_SECURITY) p.state = P.TO_SECURITY;
      }
      if (p.lounge === rt) {
        p.lounge = null;
        p.seat = null;
        if (p.state === P.TO_SEAT || p.state === P.SEATED || p.state === P.TO_LOUNGE) p.state = P.TO_LOUNGE;
      }
    }
  }

  serveRooms(dt) {
    for (const rt of this.terminal.roomRt.values()) {
      if (rt.type === 'lounge') continue;
      if (!rt.serving && rt.queue.length) {
        const head = rt.queue[0];
        const slot0 = rt.slots[0];
        if (Math.hypot(head.x - slot0.x, head.z - slot0.z) < 1.6) {
          rt.queue.shift();
          rt.serving = head;
          head.state = head.state === P.Q_CHECKIN ? P.SVC_CHECKIN : P.SVC_SECURITY;
          head.svcT = -1;
        }
      }
    }
  }

  // ---- per tick -------------------------------------------------------------------------
  update(dt) {
    this.terminal.refresh();
    this.serveRooms(dt);
    this.updateDoorLines(dt);
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (this.step(p, dt)) {
        // removed
        list[i] = list[list.length - 1];
        list.pop();
        this.byFlight.get(p.flight.id)?.delete(p);
      }
    }
  }

  moveTo(p, tx, tz, speed, dt, ty) {
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (ty !== undefined) p.y += (ty - p.y) * Math.min(1, (step / Math.max(d, 0.01)) * 1.2);
    if (d <= step || d < 0.05) {
      p.x = tx;
      p.z = tz;
      p.moving = false;
      return true;
    }
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    p.yaw = Math.atan2(dx, dz);
    p.moving = true;
    return false;
  }

  followPath(p, dt, speed = p.speed) {
    const pt = p.path[p.pathI];
    if (!pt) return true;
    if (this.moveTo(p, pt.x, pt.z, speed, dt, pt.y)) {
      p.pathI++;
      if (p.pathI >= p.path.length) return true;
    }
    return false;
  }

  // walk the flow field toward `key`; returns 'arrived' | 'walking' | 'stuck'
  flowWalk(p, key, targets, dt) {
    const field = this.fields.get(key, targets);
    const n = this.fields.step(field, p.x, p.z, _o);
    if (!n) {
      const c = this.fields.cellOf(p.x, p.z);
      if (c >= 0 && field[c] === 0) {
        p.moving = false;
        p.stuckT = 0;
        return 'arrived';
      }
      p.stuckT += dt;
      p.moving = false;
      return p.stuckT > 2.5 ? 'stuck' : 'walking';
    }
    p.stuckT = 0;
    const k = n.d < 6 ? 0.15 : 0.55;
    this.moveTo(p, n.x + p.ox * k, n.z + p.oz * k, p.speed, dt, FLOOR_Y);
    return 'walking';
  }

  queuePos(rt, i) {
    return i < rt.slots.length ? rt.slots[i] : rt.overflow(i - rt.slots.length);
  }

  // returns true when the passenger should be removed
  step(p, dt) {
    const S = p.state;
    switch (S) {
      case P.ENTERING:
        if (this.followPath(p, dt)) p.state = P.TO_CHECKIN;
        return false;
      case P.TO_CHECKIN:
      case P.TO_SECURITY: {
        const type = S === P.TO_CHECKIN ? 'checkin' : 'security';
        if (!p.room || p.roomRecheck <= 0) {
          const rt = this.pickRoom(p, type);
          p.roomRecheck = 2;
          if (!rt) {
            p.stuckT += dt;
            if (p.stuckT > 4) return this.giveUp(p);
            return false;
          }
          p.room = rt;
        }
        p.roomRecheck -= dt;
        const r = this.flowWalk(p, `portal:${p.room.room.id}`, p.room.portal, dt);
        if (r === 'arrived' || Math.hypot(p.x - p.room.entry.x, p.z - p.room.entry.z) < 2.5) {
          p.room.queue.push(p);
          p.state = S === P.TO_CHECKIN ? P.Q_CHECKIN : P.Q_SECURITY;
          p.waitT = 0;
        } else if (r === 'stuck') {
          p.room = null;
          p.stuckT = 0;
        }
        return false;
      }
      case P.Q_CHECKIN:
      case P.Q_SECURITY: {
        const rt = p.room;
        const i = rt.queue.indexOf(p);
        const pos = this.queuePos(rt, i);
        this.moveTo(p, pos.x, pos.z, 1.7, dt, FLOOR_Y);
        p.waitT += dt;
        if (p.waitT > PX.queuePatience) p.happy -= PX.queueDrainPerSec * p.patience * dt;
        return false;
      }
      case P.SVC_CHECKIN:
      case P.SVC_SECURITY: {
        const rt = p.room;
        if (p.svcT < 0) {
          if (this.moveTo(p, rt.service.x, rt.service.z, 1.8, dt, FLOOR_Y)) {
            p.svcT = BALANCE.rooms[rt.type].serviceTime * rand(0.75, 1.3);
            p.yaw = rt.room.heading + Math.PI;
          }
        } else {
          p.svcT -= dt;
          if (p.svcT <= 0) {
            rt.serving = null;
            rt.served++;
            if (rt.type === 'checkin') p.bag = false;
            p.path = rt.exitPath;
            p.pathI = 0;
            p.state = S === P.SVC_CHECKIN ? P.EXIT_CHECKIN : P.EXIT_SECURITY;
          }
        }
        return false;
      }
      case P.EXIT_CHECKIN:
      case P.EXIT_SECURITY:
        if (this.followPath(p, dt)) {
          p.room = null;
          p.state = S === P.EXIT_CHECKIN ? P.TO_SECURITY : P.TO_LOUNGE;
        }
        return false;
      case P.TO_LOUNGE: {
        // go where the flight will board if we know, else the nearest lounge
        const flight = p.flight;
        if (flight.boardingOpenFlag && flight.standId) {
          this.goToDoor(p);
          return false;
        }
        let rt = flight.lounge && this.terminal.roomRt.get(flight.lounge.room.id) ? flight.lounge : p.lounge;
        if (!rt) {
          rt = this.nearestLounge(p);
          if (!rt) {
            p.stuckT += dt;
            if (p.stuckT > 4) return this.giveUp(p);
            return false;
          }
        }
        p.lounge = rt;
        const r = this.flowWalk(p, `lounge:${rt.room.id}`, rt.cells, dt);
        if (r === 'arrived') {
          const free = rt.seats.filter((s) => !s.taken);
          p.seat = free.length ? pick(free) : null;
          if (p.seat) p.seat.taken = p;
          p.state = P.TO_SEAT;
          p.standSpot = p.seat ? null : { x: rt.room.center.x + rand(-7, 7), z: rt.room.center.z + rand(-7, 7) };
        } else if (r === 'stuck') {
          p.lounge = null;
          p.stuckT = 0;
        }
        return false;
      }
      case P.TO_SEAT: {
        const t = p.seat || p.standSpot;
        if (this.moveTo(p, t.x, t.z, p.speed * 0.7, dt, FLOOR_Y)) {
          p.state = P.SEATED;
          if (p.seat) p.yaw = p.lounge.room.heading + (Math.random() < 0.5 ? 0 : Math.PI);
        }
        if (p.flight.boardingOpenFlag && p.flight.standId) this.goToDoor(p);
        return false;
      }
      case P.SEATED:
        if (p.flight.boardingOpenFlag && p.flight.standId) this.goToDoor(p);
        return false;
      case P.TO_DOOR: {
        const stand = this.game.grid.structures.get(p.standId);
        const door = stand && this.terminal.standDoor(stand);
        if (!door) {
          p.state = P.SEATED;
          return false;
        }
        const r = this.flowWalk(p, `stand:${stand.id}`, door.cells, dt);
        if (r === 'arrived' || Math.hypot(p.x - door.inside.x, p.z - door.inside.z) < 2) {
          let dl = this.doorLines.get(stand.id);
          if (!dl) this.doorLines.set(stand.id, (dl = { line: [], timer: 0, stand }));
          dl.line.push(p);
          p.state = P.DOOR_Q;
        } else if (r === 'stuck') {
          // can't walk there: let them board anyway rather than strand them
          p.x = door.inside.x;
          p.z = door.inside.z;
        }
        return false;
      }
      case P.DOOR_Q: {
        const dl = this.doorLines.get(p.standId);
        if (!dl) {
          p.state = P.TO_DOOR;
          return false;
        }
        const i = dl.line.indexOf(p);
        const door = this.terminal.standDoor(dl.stand);
        if (!door) return false;
        const back = { x: door.inside.x - door.wall.x, z: door.inside.z - door.wall.z };
        const bl = Math.hypot(back.x, back.z) || 1;
        const px = door.inside.x + (back.x / bl) * i * 0.9 + p.ox * 0.25, pz = door.inside.z + (back.z / bl) * i * 0.9 + p.oz * 0.25;
        this.moveTo(p, px, pz, 1.8, dt, FLOOR_Y);
        return false;
      }
      case P.BOARD_WALK:
        if (this.followPath(p, dt, p.speed * 0.9)) return this.board(p);
        return false;
      case P.ARR_WALK:
        if (this.followPath(p, dt, p.speed * 0.9)) {
          if (p.noTerminal || !this.terminal.doorPoints.length) return this.finishArrival(p);
          p.state = P.TO_EXIT;
          p.bag = true;
        }
        return false;
      case P.TO_EXIT:
      case P.ANGRY: {
        const r = this.flowWalk(p, 'exit', this.exitCells(), dt);
        if (r === 'arrived') {
          p.state = P.LEAVING;
          p.path = [{ x: p.x + rand(-2, 2), z: p.z + 9, y: TARMAC_Y }];
          p.pathI = 0;
        } else if (r === 'stuck') return S === P.ANGRY ? true : this.finishArrival(p);
        return false;
      }
      case P.LEAVING:
        if (this.followPath(p, dt)) {
          if (!p.dep) return this.finishArrival(p);
          return true; // angry passenger gone
        }
        return false;
    }
    return false;
  }

  exitCells() {
    const t = this.terminal;
    if (t._exitV !== t.fields.version) {
      t._exitV = t.fields.version;
      t._exitCells = t.doorPoints.flatMap((d) => t.fields.cellsNear(d.inX, d.inZ + 1, 0));
    }
    return t._exitCells;
  }

  nearestLounge(p) {
    const c = this.fields.cellOf(p.x, p.z);
    let best = null, bd = Infinity;
    for (const rt of this.terminal.roomsOf('lounge')) {
      const d = c >= 0 ? this.fields.get(`lounge:${rt.room.id}`, rt.cells)[c] : Infinity;
      if (d < bd) {
        bd = d;
        best = rt;
      }
    }
    return best;
  }

  giveUp(p) {
    this.leaveRoom(p);
    if (p.dep) {
      p.flight.depMissed++;
      this.stats.missed++;
      this.record(p.happy - PX.missedFlightHit);
    }
    return true;
  }

  updateDoorLines(dt) {
    for (const [standId, dl] of this.doorLines) {
      if (!dl.line.length) continue;
      const head = dl.line[0];
      const plane = this.game.planes.get(head.flight.planeId);
      if (!plane || plane.state !== 'parked' || plane.standId !== standId || !plane.turnaround?.boardingOpen) continue;
      dl.timer -= dt;
      if (dl.timer > 0) continue;
      const stand = dl.stand;
      const route = this.boardingRoute(plane, stand);
      if (stand.gate && !this.game.jetbridges?.forStand(stand.id)?.docked && this.terminal.standDoor(stand)?.kind === 'gate') continue;
      dl.timer = TA.boardInterval[plane.cls];
      dl.line.shift();
      head.state = P.BOARD_WALK;
      head.path = route.slice(1);
      head.pathI = 0;
    }
  }

  board(p) {
    const f = p.flight;
    f.depBoarded++;
    f.depHappy += p.happy;
    this.stats.departed++;
    this.record(p.happy);
    const plane = this.game.planes.get(f.planeId);
    if (plane?.turnaround) plane.turnaround.paxOnboard++;
    this.game.events.emit('paxBoarded', f, p);
    return true;
  }

  finishArrival(p) {
    this.recordArrival(p.flight, p.happy);
    return true;
  }

  recordArrival(flight, happy) {
    this.stats.arrived++;
    this.record(happy);
    this.game.events.emit('paxExited', flight, happy);
  }

  record(h) {
    h = clamp(h, 0, 100);
    this.stats.happySum += h;
    this.stats.happyN++;
    this.stats.recent.push(h);
    if (this.stats.recent.length > 300) this.stats.recent.shift();
  }

  averageHappiness() {
    const r = this.stats.recent;
    if (!r.length) return null;
    return r.reduce((a, b) => a + b, 0) / r.length;
  }

  aliveFor(flight) {
    return this.byFlight.get(flight.id)?.size || 0;
  }

  // ---- rendering ---------------------------------------------------------------------------
  render(time, visible) {
    const list = this.list;
    const n = visible ? list.length : 0;
    let b = 0;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const walk = p.moving ? 1 : 0;
      const bob = walk * Math.abs(Math.sin(time * 9 + p.phase)) * 0.07;
      const sway = walk * Math.sin(time * 9 + p.phase) * 0.06;
      const sit = p.state === P.SEATED && p.seat ? -0.38 : 0;
      _e.set(0, p.yaw, sway, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(p.x, p.y + bob + sit, p.z);
      _m.compose(_p, _q, _s);
      this.bodies.setMatrixAt(i, _m);
      this.heads.setMatrixAt(i, _m);
      if (p.colored !== true) {
        this.bodies.setColorAt(i, _c.setHex(p.shirt));
        this.heads.setColorAt(i, _c.setHex(p.skin));
      }
      if (p.bag && p.state !== P.SEATED) {
        _p.y = p.y;
        _e.set(0, p.yaw, 0, 'YXZ');
        _q.setFromEuler(_e);
        _m.compose(_p, _q, _s);
        this.bags.setMatrixAt(b, _m);
        this.bags.setColorAt(b, _c.setHex(p.bagColor));
        b++;
      }
    }
    // colours are per slot; slots shift when people leave, so refresh them all
    this.bodies.count = n;
    this.heads.count = n;
    this.bags.count = b;
    for (const im of [this.bodies, this.heads, this.bags]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  // passengers per state for stats / debugging
  census() {
    const c = {};
    for (const p of this.list) c[p.state] = (c[p.state] || 0) + 1;
    return c;
  }
}

export { P as PAX_STATE };
