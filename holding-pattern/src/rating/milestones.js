import { PLANE_TYPES } from '../config/planeTypes.js';

// One-off celebration toasts. No win condition: just markers along the way.
const LIST = [
  { id: 'firstLanding', text: 'First landing!', sub: 'Your airport is open for business', test: (g) => g.ops.stats.landings >= 1 },
  { id: 'firstDeparture', text: 'First departure', sub: 'Wheels up', test: (g) => g.ops.stats.departures >= 1 },
  { id: 'firstJet', text: 'First jet!', sub: 'The regional jets have arrived', test: (g) => g.ops.stats.jets >= 1 },
  { id: 'pax100', text: '100 passengers', sub: 'Word is getting around', test: (g) => g.ops.stats.passengers >= 100 },
  { id: 'pax1000', text: '1,000 passengers', sub: 'A proper airport now', test: (g) => g.ops.stats.passengers >= 1000 },
  { id: 'pax10000', text: '10,000 passengers', sub: 'A busy hub', test: (g) => g.ops.stats.passengers >= 10000 },
  { id: 'firstContract', text: 'First contract signed', sub: 'Airlines are taking you seriously', test: (g) => g.contracts.active.length + g.contracts.history.length >= 1 },
  { id: 'stars2', text: '2★ airport', sub: 'Regional jets unlocked', test: (g) => g.rating.value >= 2 },
  { id: 'stars3', text: '3★ airport', sub: 'Narrowbodies unlocked, Meridian is interested', test: (g) => g.rating.value >= 3 },
  { id: 'stars4', text: '4★ airport', sub: 'More and bigger contracts on offer', test: (g) => g.rating.value >= 4 },
  { id: 'stars5', text: '5★ airport!', sub: 'A world-class hub. Take a bow.', test: (g) => g.rating.value >= 4.95 },
  { id: 'day7', text: 'One week open', sub: 'Seven days of take-offs', test: (g) => g.clock.day >= 8 },
];

export class Milestones {
  constructor(game) {
    this.game = game;
    this.done = new Set();
    this.t = 0;
    game.events.on('unlock', (cls) => {
      if (cls !== 'small') game.ui.toast(`${PLANE_TYPES[cls].name}s unlocked`, { kind: 'gold', icon: 'plane', sub: `Needs a ${PLANE_TYPES[cls].runway}-tile runway and a ${PLANE_TYPES[cls].stand} stand`, ms: 6500 });
    });
  }

  reset() {
    this.done.clear();
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    for (const m of LIST) {
      if (this.done.has(m.id)) continue;
      if (m.test(this.game)) {
        this.done.add(m.id);
        this.game.ui.toast(m.text, { kind: 'gold', icon: 'plane', sub: m.sub, ms: 6000 });
        this.game.events.emit('milestone', m.id);
      }
    }
  }

  toJSON() {
    return [...this.done];
  }

  load(d) {
    this.done = new Set(d || []);
  }
}
