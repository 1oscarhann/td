import { T } from '../world/grid.js';

// State-changing build actions. The build controller validates first; these
// just apply a validated result, charge money and announce what happened.

export function applyRunway(game, res) {
  const r = game.grid.placeRunway(res.start.tx, res.start.tz, res.end.tx, res.end.tz, res.cost);
  game.economy.spend(res.cost, 'construction');
  game.events.emit('built', 'runway', r);
  return r;
}

export function applyTaxiway(game, res) {
  const list = res.tiles.filter((t) => t[2] === 'ok').map(([x, z]) => [x, z]);
  game.grid.setTiles(list, T.TAXI);
  game.economy.spend(res.cost, 'construction');
  game.events.emit('built', 'taxiway', list);
  return list;
}

export function applyStand(game, res) {
  const s = game.grid.placeStand(res.tx, res.tz, res.size, res.rot, res.gate, res.cost);
  game.economy.spend(res.cost, 'construction');
  game.events.emit('built', res.gate ? 'gate' : 'stand', s);
  return s;
}

export function applyTerminal(game, res) {
  const list = res.tiles.filter((t) => t[2] === 'ok').map(([x, z]) => [x, z]);
  game.grid.setTiles(list, T.TERMINAL);
  game.economy.spend(res.cost, 'construction');
  game.events.emit('built', 'terminal', list);
  return list;
}

export function applyRoom(game, res) {
  const r = game.grid.placeRoom(res.type, res.tx, res.tz, res.rot, res.cost);
  game.economy.spend(res.cost, 'construction');
  game.events.emit('built', res.type, r);
  return r;
}

export function applyBulldoze(game, res) {
  const grid = game.grid;
  for (const id of res.structs) {
    const s = grid.removeStructure(id);
    if (s) game.events.emit('removed', s.kind, s);
  }
  if (res.taxi.length) grid.clearTiles(res.taxi);
  if (res.term.length) {
    // rooms on removed floor were already collected into structs
    grid.clearTiles(res.term);
  }
  game.economy.refund(res.refund);
  game.events.emit('bulldozed', res);
}
