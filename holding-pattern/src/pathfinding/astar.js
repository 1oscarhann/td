import { MinHeap } from './heap.js';

// A* over the taxi graph. `blocked(nodeId)` excludes nodes outright and
// `penalty(nodeId)` adds cost (e.g. nodes other planes have reserved), so
// routes prefer quiet taxiways. Returns { nodes: [ids], cost } or null.
export function astar(graph, start, goal, { blocked = null, penalty = null, turnPenalty = 4 } = {}) {
  if (!graph.nodes.has(start) || !graph.nodes.has(goal)) return null;
  if (blocked && (blocked(start) || blocked(goal))) return null;
  const g = new Map([[start, 0]]);
  const came = new Map();
  const goalNode = graph.nodes.get(goal);
  const h = (n) => Math.abs(n.x - goalNode.x) + Math.abs(n.z - goalNode.z);
  const open = new MinHeap();
  open.push(h(graph.nodes.get(start)), start);
  const closed = new Set();
  while (open.size) {
    const cur = open.pop();
    if (cur === goal) {
      const nodes = [cur];
      let c = cur;
      while (came.has(c)) {
        c = came.get(c);
        nodes.push(c);
      }
      nodes.reverse();
      return { nodes, cost: g.get(goal) };
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cn = graph.nodes.get(cur);
    const prev = came.has(cur) ? graph.nodes.get(came.get(cur)) : null;
    for (const e of cn.edges) {
      if (closed.has(e.to)) continue;
      if (blocked && e.to !== goal && blocked(e.to)) continue;
      const nn = graph.nodes.get(e.to);
      // stand nodes are dead ends: never route through one on the way elsewhere
      if (nn.kind === 'stand' && e.to !== goal) continue;
      let cost = g.get(cur) + e.cost + (penalty ? penalty(e.to) : 0);
      if (prev && turnPenalty) {
        const dx1 = cn.x - prev.x, dz1 = cn.z - prev.z;
        const dx2 = nn.x - cn.x, dz2 = nn.z - cn.z;
        if (dx1 * dz2 - dz1 * dx2 !== 0 || dx1 * dx2 + dz1 * dz2 < 0) cost += turnPenalty;
      }
      if (cost < (g.get(e.to) ?? Infinity)) {
        g.set(e.to, cost);
        came.set(e.to, cur);
        open.push(cost + h(nn), e.to);
      }
    }
  }
  return null;
}
