import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the built game works from any folder on your site
  // (e.g. https://example.com/games/train-sim/), not just the domain root.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    // Three.js on its own is ~700 kB minified; that's expected, not a problem.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
