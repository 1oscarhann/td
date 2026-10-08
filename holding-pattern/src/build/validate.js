import { BALANCE } from '../config/balance.js';
import { PLANE_TYPES } from '../config/planeTypes.js';
import { T, DIRS } from '../world/grid.js';
import { money } from '../core/math.js';

const C = BALANCE.costs;

// Placement rules. Each check returns
// { ok, reason, cost, tiles: [[tx,tz,state]], ...extra } where state is
// 'ok' | 'bad' | 'free' (already built, costs nothing) for the ghost preview.

function fail(reason, extra = {}) {
  return { ok: false, reason, cost: 0, tiles: [], ...extra };
}

function afford(res, game) {
  if (res.ok && res.cost > game.economy.money) {
    res.ok = false;
    res.reason = `Not enough money (${money(res.cost)})`;
  }
  return res;
}

export function runwayCovers(length) {
  return Object.values(PLANE_TYPES)
    .filter((p) => length >= p.runway)
    .map((p) => p.name);
}

// ---------------------------------------------------------------------------
export function checkRunway(game, a, b) {
  const grid = game.grid;
  const horizontal = Math.abs(b.tx - a.tx) >= Math.abs(b.tz - a.tz);
  const end = horizontal ? { tx: b.tx, tz: a.tz } : { tx: a.tx, tz: b.tz };
  // clamp the length to the maximum
  const maxL = BALANCE.runway.maxLength;
  if (horizontal && Math.abs(end.tx - a.tx) + 1 > maxL) end.tx = a.tx + Math.sign(end.tx - a.tx) * (maxL - 1);
  if (!horizontal && Math.abs(end.tz - a.tz) + 1 > maxL) end.tz = a.tz + Math.sign(end.tz - a.tz) * (maxL - 1);
  const tiles = grid.runwayTiles(a.tx, a.tz, end.tx, end.tz);
  const length = (horizontal ? Math.abs(end.tx - a.tx) : Math.abs(end.tz - a.tz)) + 1;
  let reason = null;
  const out = [];
  for (const [x, z] of tiles) {
    let st = 'ok';
    if (!grid.inBounds(x, z)) {
      st = 'bad';
      reason = reason || 'Runway runs off the airfield';
    } else if (grid.get(x, z) !== T.EMPTY) {
      st = 'bad';
      reason = reason || "Runway can't overlap other structures";
    } else {
      for (const [dx, dz] of DIRS) {
        if (grid.get(x + dx, z + dz) === T.RUNWAY) {
          st = 'bad';
          reason = reason || 'Too close to another runway (crossing runways are v2)';
        }
      }
    }
    out.push([x, z, st]);
  }
  const cost = length * C.runwayPerTile;
  if (!reason && length < BALANCE.runway.minLength) reason = `Runway must be at least ${BALANCE.runway.minLength} tiles (now ${length})`;
  const covers = runwayCovers(length);
  const res = {
    ok: !reason,
    reason,
    cost,
    tiles: out,
    start: { tx: a.tx, tz: a.tz },
    end,
    length,
    info: `${length} tiles · ${covers.length ? 'fits ' + covers.join(', ').toLowerCase() : 'too short for any plane'}`,
  };
  if (reason) for (const t of res.tiles) if (t[2] === 'ok') t[2] = 'warn';
  return afford(res, game);
}

// ---------------------------------------------------------------------------
export function taxiPath(a, b) {
  const pts = [];
  const horizontalFirst = Math.abs(b.tx - a.tx) >= Math.abs(b.tz - a.tz);
  let x = a.tx, z = a.tz;
  pts.push([x, z]);
  const stepX = () => {
    while (x !== b.tx) {
      x += Math.sign(b.tx - x);
      pts.push([x, z]);
    }
  };
  const stepZ = () => {
    while (z !== b.tz) {
      z += Math.sign(b.tz - z);
      pts.push([x, z]);
    }
  };
  if (horizontalFirst) {
    stepX();
    stepZ();
  } else {
    stepZ();
    stepX();
  }
  return pts;
}

export function checkTaxiway(game, a, b) {
  const grid = game.grid;
  if (!grid.runways.length) return afford(fail('Build a runway first: taxiways must connect to a runway', { tiles: [[a.tx, a.tz, 'bad']] }), game);
  const path = taxiPath(a, b);
  const out = [];
  let reason = null;
  let newCount = 0;
  let connects = false;
  const newSet = new Set();
  for (const [x, z] of path) {
    if (!grid.inBounds(x, z)) {
      out.push([x, z, 'bad']);
      reason = reason || 'Taxiway runs off the airfield';
      continue;
    }
    const t = grid.get(x, z);
    if (t === T.RUNWAY) {
      connects = true;
      continue; // crossing: the runway itself is the connection
    }
    if (t === T.TAXI) {
      connects = true;
      out.push([x, z, 'free']);
      continue;
    }
    if (t !== T.EMPTY) {
      out.push([x, z, 'bad']);
      reason = reason || (t === T.STAND ? 'Taxiway blocked by a stand' : t === T.TERMINAL ? 'Taxiway blocked by the terminal' : 'Space is blocked');
      continue;
    }
    newCount++;
    newSet.add(grid.idx(x, z));
    out.push([x, z, 'ok']);
  }
  if (!connects) {
    for (const [x, z] of path) {
      for (const [dx, dz] of DIRS) {
        const nt = grid.get(x + dx, z + dz);
        if (nt === T.RUNWAY || (nt === T.TAXI && !newSet.has(grid.idx(x + dx, z + dz)))) connects = true;
      }
    }
  }
  if (!reason && !connects) reason = 'Taxiway must connect to a runway';
  if (!reason && newCount === 0) reason = 'Already built';
  if (reason) for (const t of out) if (t[2] === 'ok') t[2] = 'warn';
  return afford({ ok: !reason, reason, cost: newCount * C.taxiwayPerTile, tiles: out, path }, game);
}

// ---------------------------------------------------------------------------
function standCheckAt(game, cx, cz, size, rot, gate) {
  const grid = game.grid;
  const n = BALANCE.stands.size[size];
  const c = (n - 1) / 2;
  const tx = cx - c, tz = cz - c;
  const tiles = [];
  let reason = null;
  for (const [x, z] of grid.standFootprint(tx, tz, n)) {
    let st = 'ok';
    if (!grid.inBounds(x, z)) {
      st = 'bad';
      reason = reason || 'Stand runs off the airfield';
    } else if (grid.get(x, z) !== T.EMPTY) {
      st = 'bad';
      reason = reason || 'Space is blocked';
    }
    tiles.push([x, z, st]);
  }
  const links = grid.standLinks(tx, tz, n, rot);
  const entryT = grid.get(links.entry[0], links.entry[1]);
  const frontT = grid.get(links.front[0], links.front[1]);
  if (!reason && entryT !== T.TAXI) reason = 'Stand entrance must face a taxiway';
  // planes swing their tails turning in and pushing back: stands facing each
  // other across one taxiway need a tile of space between them
  if (!reason) {
    const [fx, fz] = DIRS[rot];
    const msg = 'Too close to the stand across the taxiway: leave a 1-tile gap';
    // the three tiles straight across the taxiway from the entrance
    const across = (ex, ez, ffx, ffz) => [-1, 0, 1].map((k) => [ex - ffx + k * ffz, ez - ffz + k * ffx]);
    for (const [x, z] of across(links.entry[0], links.entry[1], fx, fz)) if (grid.get(x, z) === T.STAND) reason = msg;
    const foot = new Set(grid.standFootprint(tx, tz, n).map(([x, z]) => grid.idx(x, z)));
    for (const s of grid.stands) {
      const ex = grid.txOf(s.entry), ez = grid.tzOf(s.entry);
      for (const [x, z] of across(ex, ez, s.fwd.x, s.fwd.z)) if (grid.inBounds(x, z) && foot.has(grid.idx(x, z))) reason = reason || msg;
    }
  }
  if (!reason && gate) {
    if (frontT !== T.TERMINAL) reason = 'Gate nose must touch the terminal';
    else if (grid.room[grid.idx(links.front[0], links.front[1])] >= 0) reason = 'Gate door is blocked by a room';
  }
  const cost = Math.round((gate ? C.gate : C.stand) * (C.standSizeMult[size] ?? 1));
  if (reason) for (const t of tiles) if (t[2] === 'ok') t[2] = 'warn';
  const fits = BALANCE.stands.fits[size].map((k) => PLANE_TYPES[k].name.toLowerCase());
  return { ok: !reason, reason, cost, tiles, tx, tz, n, rot, size, gate, links, info: `${gate ? 'Gate' : 'Stand'} ${size} · fits ${fits.join(', ')}` };
}

export function checkStand(game, hover, size, rot, gate, autoRotate) {
  let res = standCheckAt(game, hover.tx, hover.tz, size, rot, gate);
  if (!res.ok && autoRotate) {
    for (let k = 1; k < 4; k++) {
      const alt = standCheckAt(game, hover.tx, hover.tz, size, (rot + k) % 4, gate);
      if (alt.ok) {
        res = alt;
        break;
      }
    }
  }
  return afford(res, game);
}

// ---------------------------------------------------------------------------
export function checkTerminal(game, a, b) {
  const grid = game.grid;
  const x0 = Math.min(a.tx, b.tx), x1 = Math.max(a.tx, b.tx);
  const z0 = Math.min(a.tz, b.tz), z1 = Math.max(a.tz, b.tz);
  const tiles = [];
  let reason = null;
  let n = 0;
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      if (!grid.inBounds(x, z)) {
        tiles.push([x, z, 'bad']);
        reason = reason || 'Terminal runs off the airfield';
        continue;
      }
      const t = grid.get(x, z);
      if (t === T.TERMINAL) tiles.push([x, z, 'free']);
      else if (t !== T.EMPTY) {
        tiles.push([x, z, 'bad']);
        reason = reason || "Terminal can't overlap runways, taxiways or stands";
      } else {
        tiles.push([x, z, 'ok']);
        n++;
      }
    }
  if (!reason && n === 0) reason = 'Already built';
  if (reason) for (const t of tiles) if (t[2] === 'ok') t[2] = 'warn';
  return afford({ ok: !reason, reason, cost: n * C.terminalPerTile, tiles, rect: [x0, z0, x1, z1] }, game);
}

// ---------------------------------------------------------------------------
function isFloor(grid, x, z) {
  return grid.get(x, z) === T.TERMINAL && grid.room[grid.idx(x, z)] < 0;
}

export function gateDoorTiles(grid) {
  const set = new Set();
  for (const s of grid.stands) if (s.gate && grid.inBounds(s.front[0], s.front[1])) set.add(grid.idx(s.front[0], s.front[1]));
  return set;
}

// The open floor tiles a room's passengers use to get in and out.
export function roomPortals(grid, type, tx, tz, w, h, rot) {
  const [fx, fz] = DIRS[rot];
  if (type === 'lounge') {
    const list = [];
    for (let z = tz - 1; z <= tz + h; z++)
      for (let x = tx - 1; x <= tx + w; x++) {
        const inside = x >= tx && x < tx + w && z >= tz && z < tz + h;
        const corner = (x === tx - 1 || x === tx + w) && (z === tz - 1 || z === tz + h);
        if (!inside && !corner) list.push([x, z]);
      }
    return { any: list };
  }
  // 1x2 rooms: the front portal is beyond the front edge, back portal beyond the back
  const cx = tx + (w - 1) / 2, cz = tz + (h - 1) / 2;
  const reach = (Math.max(w, h) - 1) / 2 + 1;
  return {
    front: [Math.round(cx + fx * reach), Math.round(cz + fz * reach)],
    back: [Math.round(cx - fx * reach), Math.round(cz - fz * reach)],
  };
}

function roomCheckAt(game, type, hover, rot) {
  const grid = game.grid;
  const { w, h } = grid.roomSize(type, rot);
  const tx = hover.tx - Math.floor((w - 1) / 2);
  const tz = hover.tz - Math.floor((h - 1) / 2);
  const tiles = [];
  let reason = null;
  const doors = gateDoorTiles(grid);
  for (let z = tz; z < tz + h; z++)
    for (let x = tx; x < tx + w; x++) {
      let st = 'ok';
      if (grid.get(x, z) !== T.TERMINAL) {
        st = 'bad';
        reason = reason || 'Rooms go inside a terminal';
      } else if (grid.room[grid.idx(x, z)] >= 0) {
        st = 'bad';
        reason = reason || 'Overlaps another room';
      } else if (doors.has(grid.idx(x, z))) {
        st = 'bad';
        reason = reason || 'Keep gate doors clear';
      }
      tiles.push([x, z, st]);
    }
  const portals = roomPortals(grid, type, tx, tz, w, h, rot);
  if (!reason) {
    if (type === 'lounge') {
      if (!portals.any.some(([x, z]) => isFloor(grid, x, z))) reason = 'Lounge needs open terminal floor beside it';
    } else {
      if (!isFloor(grid, ...portals.front)) reason = 'Room entrance must face open terminal floor';
      else if (type === 'security' && !isFloor(grid, ...portals.back)) reason = 'Security exit must face open terminal floor';
    }
  }
  if (reason) for (const t of tiles) if (t[2] === 'ok') t[2] = 'warn';
  return { ok: !reason, reason, cost: C[type], tiles, tx, tz, w, h, rot, type, portals };
}

export function checkRoom(game, type, hover, rot, autoRotate) {
  let res = roomCheckAt(game, type, hover, rot);
  if (!res.ok && autoRotate && type !== 'lounge') {
    for (let k = 1; k < 4; k++) {
      const alt = roomCheckAt(game, type, hover, (rot + k) % 4);
      if (alt.ok) {
        res = alt;
        break;
      }
    }
  }
  return afford(res, game);
}

// ---------------------------------------------------------------------------
export function checkBulldoze(game, a, b) {
  const grid = game.grid;
  const x0 = Math.max(0, Math.min(a.tx, b.tx)), x1 = Math.min(grid.W - 1, Math.max(a.tx, b.tx));
  const z0 = Math.max(0, Math.min(a.tz, b.tz)), z1 = Math.min(grid.H - 1, Math.max(a.tz, b.tz));
  const taxi = [];
  const term = [];
  const structs = new Set();
  const tiles = [];
  let reason = null;
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const i = grid.idx(x, z);
      const t = grid.type[i];
      if (t === T.EMPTY) continue;
      if (t === T.TAXI) taxi.push([x, z]);
      else if (t === T.TERMINAL) {
        term.push([x, z]);
        if (grid.room[i] >= 0) structs.add(grid.room[i]);
      } else if (grid.owner[i] >= 0) structs.add(grid.owner[i]);
    }
  // when a single click lands on a room, only remove the room, not the floor
  const single = x0 === x1 && z0 === z1;
  if (single && term.length === 1 && grid.room[grid.idx(x0, z0)] >= 0) term.length = 0;
  let refund = 0;
  refund += taxi.length * C.taxiwayPerTile * C.refund;
  refund += term.length * C.terminalPerTile * C.refund;
  // removing terminal floor also removes every room touching it
  for (const [x, z] of term) {
    const r = grid.room[grid.idx(x, z)];
    if (r >= 0) structs.add(r);
  }
  for (const id of structs) {
    const s = grid.structures.get(id);
    if (!s) continue;
    refund += (s.cost || 0) * C.refund;
    const busy = game.isBusy?.(s);
    if (busy) reason = reason || busy;
  }
  for (const [x, z] of taxi) {
    const busy = game.isTileBusy?.(grid.idx(x, z));
    if (busy) reason = reason || busy;
  }
  // preview every affected tile
  const mark = (x, z) => tiles.push([x, z, reason ? 'bad' : 'demo']);
  for (const [x, z] of taxi) mark(x, z);
  for (const [x, z] of term) mark(x, z);
  for (const id of structs) {
    const s = grid.structures.get(id);
    if (!s) continue;
    if (s.kind === 'runway') for (const [x, z] of grid.runwayTiles(s.sx, s.sz, s.ex, s.ez)) mark(x, z);
    else if (s.kind === 'stand') for (const [x, z] of grid.standFootprint(s.tx, s.tz, s.n)) mark(x, z);
    else if (s.kind === 'room') for (let z = s.tz; z < s.tz + s.h; z++) for (let x = s.tx; x < s.tx + s.w; x++) mark(x, z);
  }
  const count = taxi.length + term.length + structs.size;
  if (!reason && count === 0) reason = 'Nothing to bulldoze';
  return { ok: !reason, reason, cost: -Math.round(refund), refund: Math.round(refund), tiles, taxi, term, structs: [...structs] };
}
