/**
 * Tiny localStorage wrapper. Every read and write is wrapped in try/catch because storage can be
 * missing, blocked or full (private windows, strict cookie settings) and the game must still run.
 * Values written this session are also kept in memory, so they survive even when storage fails.
 */

const PREFIX = 'wsx-train-sim:';

/** @typedef {Pick<Storage, 'getItem' | 'setItem'>} StorageBackend */

/** @returns {StorageBackend | null} */
function defaultBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {StorageBackend | null} [backend] pass null (or a fake) in tests
 */
export function createStore(backend = defaultBackend()) {
  /** @type {Map<string, string>} */
  const memory = new Map();
  return {
    /**
     * @template T
     * @param {string} key
     * @param {T} fallback
     * @returns {T}
     */
    load(key, fallback) {
      let raw = memory.get(key) ?? null;
      if (raw == null) {
        try {
          raw = backend?.getItem(PREFIX + key) ?? null;
        } catch {
          raw = null;
        }
      }
      if (raw == null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    /**
     * @param {string} key
     * @param {unknown} value
     * @returns {boolean} false if it only got saved in memory
     */
    save(key, value) {
      const raw = JSON.stringify(value);
      memory.set(key, raw);
      try {
        if (!backend) return false;
        backend.setItem(PREFIX + key, raw);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** @typedef {ReturnType<typeof createStore>} Store */
