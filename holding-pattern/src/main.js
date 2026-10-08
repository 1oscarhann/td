import { Game } from './game.js';

// Boot: create the game, start the frame loop, expose a small debug handle.
function boot() {
  const canvas = document.getElementById('scene');
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) {
    document.getElementById('loading').innerHTML =
      '<div style="max-width:340px;text-align:center">Holding Pattern needs WebGL 2.<br><small>Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration on.</small></div>';
    return;
  }
  const game = new Game(canvas);
  window.__hp = game;
  game.started = true;
  document.body.classList.remove('title');
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try {
      game.frameUpdate(dt);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  requestAnimationFrame(() => document.getElementById('loading').classList.add('done'));
}

boot();
