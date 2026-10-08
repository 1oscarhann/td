// Tiny synchronous event bus shared by every system.
export class Events {
  constructor() {
    this.map = new Map();
  }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    this.map.get(name)?.delete(fn);
  }
  emit(name, ...args) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[events] handler for "${name}" failed`, err);
      }
    }
  }
  clear() {
    this.map.clear();
  }
}
