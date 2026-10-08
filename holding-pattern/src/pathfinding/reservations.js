// Segment reservations as ordered per-node queues.
//
// A plane reserves its whole route up front by joining the back of every
// node's queue on it, and may only roll into a node once it is at the head of
// that node's queue (everyone who reserved earlier has passed and released it).
// Because new routes always join at the back, a plane only ever waits for
// planes that reserved before it: waits can't form a cycle, so there are no
// head-on deadlocks, while planes heading the same way can follow each other.
//
// Nodes a plane occupies straight away (its pushback area, the runway exit it
// rolls onto) must be `exclusive`: nobody else may be queued there, so a plane
// never blocks someone who reserved earlier.
export class Reservations {
  constructor() {
    this.queues = new Map(); // nodeId -> [planeId, ...]
    this.byPlane = new Map(); // planeId -> Set(nodeId)
    this.waitingOn = new Map(); // planeId -> nodeId it is stopped for
  }

  reset() {
    this.queues.clear();
    this.byPlane.clear();
    this.waitingOn.clear();
  }

  queue(node) {
    return this.queues.get(node) || null;
  }

  head(node) {
    const q = this.queues.get(node);
    return q && q.length ? q[0] : undefined;
  }

  isHead(planeId, node) {
    const q = this.queues.get(node);
    return !q || !q.length || q[0] === planeId;
  }

  load(node, planeId) {
    const q = this.queues.get(node);
    if (!q) return 0;
    return q.filter((p) => p !== planeId).length;
  }

  isExclusiveFree(node, planeId) {
    const q = this.queues.get(node);
    return !q || q.every((p) => p === planeId);
  }

  canReserve(planeId, exclusive) {
    for (const n of exclusive) if (!this.isExclusiveFree(n, planeId)) return false;
    return true;
  }

  // Join the queues of `nodes`; `exclusive` nodes must be free of others.
  tryReserve(planeId, nodes, exclusive = nodes) {
    if (!this.canReserve(planeId, exclusive)) return false;
    let set = this.byPlane.get(planeId);
    if (!set) this.byPlane.set(planeId, (set = new Set()));
    for (const n of nodes) {
      let q = this.queues.get(n);
      if (!q) this.queues.set(n, (q = []));
      if (!q.includes(planeId)) q.push(planeId);
      set.add(n);
    }
    return true;
  }

  release(planeId, node) {
    const q = this.queues.get(node);
    if (q) {
      const i = q.indexOf(planeId);
      if (i >= 0) q.splice(i, 1);
      if (!q.length) this.queues.delete(node);
    }
    this.byPlane.get(planeId)?.delete(node);
  }

  releaseAll(planeId) {
    const set = this.byPlane.get(planeId);
    if (set) for (const n of [...set]) this.release(planeId, n);
    this.byPlane.delete(planeId);
    this.waitingOn.delete(planeId);
  }

  held(planeId) {
    return this.byPlane.get(planeId) || new Set();
  }

  inUse(node) {
    const q = this.queues.get(node);
    return !!(q && q.length);
  }

  setWaiting(planeId, node) {
    if (node === null || node === undefined) this.waitingOn.delete(planeId);
    else this.waitingOn.set(planeId, node);
  }

  // Safety net: find a cycle of planes each waiting on a node headed by the
  // next. Returns the plane ids in the cycle, or null.
  findDeadlock() {
    const next = new Map();
    for (const [pid, node] of this.waitingOn) {
      const h = this.head(node);
      if (h !== undefined && h !== pid) next.set(pid, h);
    }
    for (const start of next.keys()) {
      const seen = [];
      let cur = start;
      while (next.has(cur) && !seen.includes(cur)) {
        seen.push(cur);
        cur = next.get(cur);
      }
      if (seen.includes(cur)) return seen.slice(seen.indexOf(cur));
    }
    return null;
  }

  // Resolve a cycle by moving `planeId` behind everyone else on the nodes it
  // is queued for ahead of another cycle member.
  yieldTo(planeId, others, skip = () => false) {
    for (const n of this.held(planeId)) {
      if (skip(n)) continue;
      const q = this.queues.get(n);
      if (!q) continue;
      const i = q.indexOf(planeId);
      if (i < 0) continue;
      if (q.slice(i + 1).some((p) => others.includes(p))) {
        q.splice(i, 1);
        q.push(planeId);
      }
    }
  }
}
