/**
 * Overpass API helper for the route tools: tries several public mirrors with back-off, and
 * caches every answer on disk so a route can be rebuilt without hitting the servers again.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} query Overpass QL
 * @param {{ cacheDir?: string, label?: string, attempts?: number, refresh?: boolean }} [opts]
 * @returns {Promise<{ elements: any[] }>}
 */
export async function overpass(query, { cacheDir, label = 'query', attempts = 12, refresh = false } = {}) {
  const key = createHash('sha1').update(query).digest('hex').slice(0, 12);
  const file = cacheDir ? join(cacheDir, `${label}-${key}.json`) : null;
  if (file && !refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));

  let lastError = '';
  for (let i = 0; i < attempts; i++) {
    const url = MIRRORS[i % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'west-sussex-train-sim/0.2 (hobby route builder; github.com/1oscarhann/td)' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(150_000),
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) {
        const data = JSON.parse(text);
        if (data.remark && /runtime error|timed out/i.test(data.remark)) throw new Error(data.remark);
        if (file) {
          mkdirSync(cacheDir, { recursive: true });
          writeFileSync(file, JSON.stringify(data));
        }
        return data;
      }
      lastError = `${url}: HTTP ${res.status} ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160)}`;
    } catch (err) {
      lastError = `${url}: ${err.message}`;
    }
    console.error(`  [${label}] attempt ${i + 1} failed (${lastError.slice(0, 140)})`);
    await sleep(Math.min(30_000, 3000 * (i + 1)));
  }
  throw new Error(`Overpass failed for ${label}: ${lastError}`);
}
