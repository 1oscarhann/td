import './styles.css';
import './hud/hud.css';
import { startFixedLoop } from './core/loop.js';
import { KeyboardInput } from './core/input.js';
import { createStore } from './core/storage.js';
import { loadScores, loadSettings, recordScore, sanitizeSettings, saveSettings } from './core/settings.js';
import { formatClock } from './core/units.js';
import { Route } from './route/route.js';
import { Simulation } from './sim/simulation.js';
import { WorldView } from './render/renderer.js';
import { Hud } from './hud/hud.js';
import { AudioEngine } from './audio/audio.js';

/** Physics runs at 60 steps per second whatever the screen does. */
const PHYSICS_DT = 1 / 60;
const ROUTE_FILE = 'data/routes/test-track.json';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

async function boot() {
  const store = createStore();
  let settings = loadSettings(store);

  let route;
  try {
    route = await Route.load(new URL(ROUTE_FILE, document.baseURI).href);
  } catch (err) {
    showFatal(err);
    return;
  }

  let sim = new Simulation(route, { settings });
  // Dev builds only: type __sim in the browser console to poke at the simulation.
  const exposeForDebugging = () => {
    if (import.meta.env.DEV) /** @type {any} */ (window).__sim = sim;
  };
  exposeForDebugging();
  const view = new WorldView($('world'), route, settings);
  view.setSim(sim);
  const hud = new Hud($('hud'), settings);
  const audio = new AudioEngine();
  audio.setVolume(settings.volume);
  const input = new KeyboardInput(window);
  input.attach();

  let paused = true; // until the start screen is dismissed
  let started = false;
  /** @type {'start' | 'pause' | 'result' | null} */
  let overlay = 'start';

  /** @param {typeof overlay} which */
  const showOverlay = (which) => {
    overlay = which;
    $('overlay-start').hidden = which !== 'start';
    $('overlay-pause').hidden = which !== 'pause';
    $('overlay-result').hidden = which !== 'result';
    paused = which !== null;
    if (which === 'pause') fillSettingsForm(settings);
    if (which === null) /** @type {HTMLElement | null} */ (document.activeElement)?.blur?.();
  };

  const renderScores = (/** @type {HTMLElement} */ list) => {
    list.replaceChildren(
      ...loadScores(store, route.id).map((s) => {
        const li = document.createElement('li');
        li.textContent = `${s.score} pts · ${formatClock(s.timeS).slice(3)} · ${Math.abs(s.stopErrorM).toFixed(1)} m off · ${new Date(s.date).toLocaleDateString('en-GB')}`;
        return li;
      }),
    );
  };
  renderScores($('best-scores'));

  const restart = () => {
    sim = new Simulation(route, { settings });
    exposeForDebugging();
    view.setSim(sim);
    hud.reset();
    showOverlay(null);
  };

  /** @param {import('./core/settings.js').Settings} next */
  const applySettings = (next) => {
    settings = next;
    saveSettings(store, settings);
    sim.dsd.mode = settings.dsdMode;
    view.applySettings(settings);
    hud.applySettings(settings);
    audio.setVolume(settings.volume);
  };

  $('btn-start').addEventListener('click', () => {
    audio.unlock();
    started = true;
    showOverlay(null);
  });
  $('btn-resume').addEventListener('click', () => showOverlay(null));
  $('btn-restart').addEventListener('click', restart);
  $('btn-again').addEventListener('click', restart);
  $('btn-stay').addEventListener('click', () => showOverlay(null));
  $('settings-form').addEventListener('input', () => applySettings(readSettingsForm()));
  window.addEventListener('blur', () => {
    if (started && overlay === null) showOverlay('pause');
  });

  startFixedLoop({
    dt: PHYSICS_DT,
    timeScale: () => (paused ? 0 : 1),
    frameStart: () => {
      const frame = input.poll();
      if (frame.pause && started && overlay !== 'result') showOverlay(overlay === 'pause' ? null : 'pause');
      if (frame.assistToggle && !paused) applySettings({ ...settings, assistOverlay: !settings.assistOverlay });
      if (!paused) sim.applyInput(frame);
    },
    step: (dt) => sim.step(dt),
    render: (alpha, frameTime) => {
      for (const ev of sim.drainEvents()) {
        hud.pushEvent(ev, sim.clockStart);
        audio.handleEvent(ev);
        if (ev.type === 'run-complete' && sim.result) showResult(sim.result);
      }
      view.render(sim, alpha, frameTime);
      hud.update(sim);
      audio.update(sim, paused);
    },
  });

  /** @param {NonNullable<Simulation['result']>} result */
  function showResult(result) {
    recordScore(store, route.id, { score: result.score, date: new Date().toISOString(), timeS: result.timeS, stopErrorM: result.stopErrorM });
    $('result-score').textContent = `${result.score} points`;
    const table = $('result-breakdown');
    table.replaceChildren(
      ...result.breakdown.map((b) => {
        const tr = document.createElement('tr');
        const label = document.createElement('td');
        label.textContent = b.label;
        const pts = document.createElement('td');
        pts.textContent = b.points > 0 ? `+${b.points}` : String(b.points);
        tr.append(label, pts);
        return tr;
      }),
    );
    renderScores($('result-scores'));
    renderScores($('best-scores'));
    showOverlay('result');
  }
}

/** @param {import('./core/settings.js').Settings} s */
function fillSettingsForm(s) {
  const form = /** @type {HTMLFormElement} */ ($('settings-form'));
  for (const [key, value] of Object.entries(s)) {
    const field = /** @type {HTMLInputElement | null} */ (form.elements.namedItem(key));
    if (!field) continue;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = String(value);
  }
}

function readSettingsForm() {
  const form = /** @type {HTMLFormElement} */ ($('settings-form'));
  const get = (/** @type {string} */ name) => /** @type {HTMLInputElement} */ (form.elements.namedItem(name));
  return sanitizeSettings({
    speedUnits: get('speedUnits').value,
    dsdMode: get('dsdMode').value,
    volume: Number(get('volume').value),
    fov: Number(get('fov').value),
    assistOverlay: get('assistOverlay').checked,
    signalGlow: get('signalGlow').checked,
    cameraSway: get('cameraSway').checked,
  });
}

/** @param {unknown} err */
function showFatal(err) {
  const box = $('fatal');
  const message = err instanceof Error ? err.message : String(err);
  box.textContent = `Couldn't start the sim.\n\n${message}\n\nIf you opened index.html straight from disk, run "npm run dev" instead: browsers block loading the route file from file:// pages.`;
  box.hidden = false;
  $('overlay-start').hidden = true;
}

boot().catch(showFatal);
