import { BALANCE } from '../config/balance.js';
import { T, DIRS } from '../world/grid.js';

export const STAND_BASE = 1_000_000;
const TILE = BALANCE.map.tile;

// Ground movement graph. Nodes are taxiway tiles (id = tile index) and stand
// parking spots (id = STAND_BASE + stand id). Taxiway tiles touching a runway
// carry `access` records; matching tiles on opposite sides of a runway are
// joined by crossing edges that need the runway lock.
export class TaxiGraph {
  constructor(game) {
    this.game = game;
    this.nodes = new Map();
    this.version = -1;
  }

  refresh() {
    const grid = this.game.grid;
    if (this.version === grid.version) return false;
    this.version = grid.version;
    this.rebuild();
    return true;
  }

  rebuild() {
    const grid = this.game.grid;
    const nodes = new Map();
    for (let i = 0; i < grid.type.length; i++) {
      if (grid.type[i] !== T.TAXI) continue;
      const tx = grid.txOf(i), tz = grid.tzOf(i);
      nodes.set(i, { id: i, kind: 'taxi', tx, tz, x: grid.wx(tx), z: grid.wz(tz), edges: [], access: [] });
    }
    // taxiway adjacency
    for (const n of nodes.values()) {
      for (const [dx, dz] of DIRS) {
        const nx = n.tx + dx, nz = n.tz + dz;
        if (!grid.inBounds(nx, nz)) continue;
        const j = grid.idx(nx, nz);
        if (nodes.has(j)) n.edges.push({ to: j, cost: TILE });
      }
    }
    // stands
    for (const s of grid.stands) {
      const id = STAND_BASE + s.id;
      const node = { id, kind: 'stand', standId: s.id, x: s.center.x, z: s.center.z, edges: [], access: [] };
      nodes.set(id, node);
      const entry = nodes.get(s.entry);
      if (entry) {
        const cost = TILE + s.half;
        node.edges.push({ to: s.entry, cost });
        entry.edges.push({ to: id, cost });
      }
    }
    // runway access points
    const runways = grid.runways;
    const byRunwaySide = new Map(); // `${rid}|${index}|${side}` -> nodeId
    for (const n of nodes.values()) {
      if (n.kind !== 'taxi') continue;
      for (const [dx, dz] of DIRS) {
        const nx = n.tx + dx, nz = n.tz + dz;
        if (grid.get(nx, nz) !== T.RUNWAY) continue;
        const r = grid.structures.get(grid.owner[grid.idx(nx, nz)]);
        if (!r) continue;
        const along = r.horizontal ? dz === 0 : dx === 0;
        let index, kind, side;
        if (along) {
          kind = 'end';
          index = grid.runwayIndex(r, nx, nz);
          side = 0;
        } else {
          kind = 'side';
          index = grid.runwayIndex(r, nx, nz);
          // which side of the centre line (+1 / -1) relative to runway direction
          const lx = r.horizontal ? 0 : n.tx - r.sx;
          const lz = r.horizontal ? n.tz - r.sz : 0;
          side = Math.sign(lx || lz);
        }
        if (index < 0 || index >= r.length) continue;
        n.access.push({ runwayId: r.id, index, kind, side });
        if (kind === 'side') byRunwaySide.set(`${r.id}|${index}|${side}`, n.id);
      }
    }
    // crossing edges
    for (const r of runways) {
      for (let i = 0; i < r.length; i++) {
        const a = byRunwaySide.get(`${r.id}|${i}|1`);
        const b = byRunwaySide.get(`${r.id}|${i}|-1`);
        if (a !== undefined && b !== undefined) {
          const cost = TILE * (BALANCE.runway.width + 1) + 25; // discourage needless crossings
          nodes.get(a).edges.push({ to: b, cost, cross: r.id, index: i });
          nodes.get(b).edges.push({ to: a, cost, cross: r.id, index: i });
        }
      }
    }
    this.nodes = nodes;
  }

  // At each turn a long fuselage's nose swings straight on into the next tile
  // and its tail swings out behind the new heading. Returns the route with
  // those neighbours inserted after the turn node, so they get reserved (and
  // waited for) like route nodes.
  withSweeps(nodes) {
    const out = [];
    const seen = new Set(nodes);
    for (let i = 0; i < nodes.length; i++) {
      out.push(nodes[i]);
      if (i === 0 || i === nodes.length - 1) continue;
      const a = this.nodes.get(nodes[i - 1]), x = this.nodes.get(nodes[i]), b = this.nodes.get(nodes[i + 1]);
      if (!a || !x || !b || x.kind !== 'taxi' || a.kind !== 'taxi') continue;
      const dx = Math.sign(x.tx - a.tx), dz = Math.sign(x.tz - a.tz);
      if (Math.abs(x.tx - a.tx) + Math.abs(x.tz - a.tz) !== 1) continue; // crossing edges
      const bx = b.kind === 'taxi' ? Math.sign(b.tx - x.tx) : null;
      const bz = b.kind === 'taxi' ? Math.sign(b.tz - x.tz) : null;
      if (b.kind === 'taxi' && bx === dx && bz === dz) continue; // straight on
      const grid = this.game.grid;
      const add = (tx, tz) => {
        if (!grid.inBounds(tx, tz)) return;
        const c = grid.idx(tx, tz);
        if (this.nodes.has(c) && !seen.has(c)) {
          out.push(c);
          seen.add(c);
        }
      };
      // nose overshoots straight on…
      add(x.tx + dx, x.tz + dz);
      // …and the tail swings out behind the new heading
      if (b.kind === 'taxi') add(x.tx - bx, x.tz - bz);
      else {
        const st = grid.structures.get(b.standId);
        if (st) add(x.tx - st.fwd.x, x.tz - st.fwd.z);
      }
    }
    return out;
  }

  accessNodes(runwayId) {
    const out = [];
    for (const n of this.nodes.values()) for (const a of n.access) if (a.runwayId === runwayId) out.push({ node: n, ...a });
    return out;
  }

  standNode(standId) {
    return this.nodes.get(STAND_BASE + standId);
  }

  edge(a, b) {
    const n = this.nodes.get(a);
    return n ? n.edges.find((e) => e.to === b) : null;
  }
}
