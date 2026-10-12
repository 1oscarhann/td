import './styles.css';
import './hud/hud.css';
import { startFixedLoop } from './core/loop.js';
import { ACTION_NAMES, DEFAULT_BINDINGS, KeyboardInput } from './core/input.js';
import { GamepadInput, mergeInput } from './core/gamepad.js';
import { createStore } from './core/storage.js';
import { loadScores, loadSettings, recordScore, sanitizeSettings, saveSettings } from './core/settings.js';
import { formatClock } from './core/units.js';
import { Route } from './route/route.js';
import { Simulation } from './sim/simulation.js';
import { WorldView } from './render/renderer.js';
import { Hud } from './hud/hud.js';
import { AudioEngine } from './audio/audio.js';
import { Announcer } from './audio/pa.js';

/** Physics runs at 60 steps per second whatever the screen does. */
const PHYSICS_DT = 1 / 60;
const ROUTES = Object.freeze({
  'west-sussex': 'data/routes/west-sussex/route.json',
  'test-track': 'data/routes/test-track.json',
});
const WARP_STEPS = [1, 2, 4];

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

async function boot() {
  const store = createStore();
  let settings = loadSettings(store);
  const params = new URLSearchParams(location.search);
  const routeId = /** @type {keyof typeof ROUTES} */ (params.get('route') in ROUTES ? params.get('route') : 'west-sussex');
  const loading = $('loading');
  const form = /** @type {HTMLFormElement} */ ($('journey-form'));
  /** @type {HTMLSelectElement} */ (form.elements.namedItem('route')).value = routeId;

  let route;
  try {
    loading.textContent = 'Loading the route…';
    route = await Route.load(new URL(ROUTES[routeId], document.baseURI).href);
  } catch (err) {
    showFatal(err);
    return;
  }

  const view = new WorldView($('world'), route, settings);
  try {
    await view.build((text) => (loading.textContent = text === 'Ready' ? '' : text));
  } catch (err) {
    showFatal(err);
    return;
  }
  const hud = new Hud($('hud'), settings);
  const audio = new AudioEngine();
  audio.setVolume(settings.volume);
  const pa = new Announcer();
  pa.enabled = settings.announcements;
  const input = new KeyboardInput(window, settings.bindings);
  const pad = new GamepadInput();
  input.attach();

  // ── the start screen ──────────────────────────────────────────────────────
  const serviceSelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem('service'));
  serviceSelect.replaceChildren(
    ...route.services.map((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${s.headcode ?? s.id} ${s.name} (${(s.calls[0].dep ?? '').slice(0, 5)})`;
      return o;
    }),
  );
  const describe = () => {
    const s = route.service(serviceSelect.value);
    const stops = s.calls.map((/** @type {any} */ c) => route.stationName(route.platform(c.platform).station)).join(' → ');
    $('service-desc').textContent = `${s.description ?? ''} ${stops}.`;
    renderScores($('best-scores'));
  };
  form.addEventListener('change', (e) => {
    const target = /** @type {HTMLSelectElement} */ (e.target);
    if (target.name === 'route' && target.value !== routeId) {
      location.search = `?route=${encodeURIComponent(target.value)}`;
      return;
    }
    describe();
  });

  const journey = () => {
    const get = (/** @type {string} */ n) => /** @type {HTMLSelectElement} */ (form.elements.namedItem(n)).value;
    return {
      serviceId: get('service'),
      timeShiftS: Number(get('time')),
      weather: /** @type {any} */ (get('weather')),
      season: /** @type {any} */ (get('season')),
    };
  };
  const scoreKey = () => `${route.id}:${sim?.service.id ?? serviceSelect.value}`;
  const renderScores = (/** @type {HTMLElement} */ list) => {
    list.replaceChildren(
      ...loadScores(store, scoreKey()).map((s) => {
        const li = document.createElement('li');
        li.textContent = `${s.score} pts${s.grade ? ` (${s.grade})` : ''} · ${formatClock(s.timeS).slice(0, 5)} · ${new Date(s.date).toLocaleDateString('en-GB')}`;
        return li;
      }),
    );
  };

  /** @type {Simulation | null} */
  let sim = null;
  let paused = true;
  let started = false;
  let warp = 1;
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
    if (paused) pa.stop();
  };

  /** @param {import('./sim/simulation.js').SimOptions} opts */
  const begin = (opts) => {
    sim = new Simulation(route, { settings, ...opts });
    if (import.meta.env.DEV) /** @type {any} */ (window).__sim = sim;
    view.setSim(sim);
    hud.reset();
    warp = 1;
    lastOpts = opts;
    started = true;
    showOverlay(null);
    pa.welcome(sim);
  };
  /** @type {import('./sim/simulation.js').SimOptions} */
  let lastOpts = {};

  const resume = store.load('resume', null);
  if (resume && resume.route === route.id) {
    const btn = $('btn-resume');
    btn.hidden = false;
    btn.textContent = `Resume ${resume.service} from ${resume.station}`;
    btn.addEventListener('click', () => {
      audio.unlock();
      begin({ serviceId: resume.service, startCall: resume.call, timeShiftS: resume.timeShiftS, weather: resume.weather, season: resume.season });
    });
  }
  const startBtn = /** @type {HTMLButtonElement} */ ($('btn-start'));
  startBtn.disabled = false;
  startBtn.addEventListener('click', () => {
    audio.unlock();
    void audio.loadSamples(document.baseURI);
    begin(journey());
  });
  describe();

  $('btn-continue').addEventListener('click', () => showOverlay(null));
  $('btn-restart').addEventListener('click', () => begin(lastOpts));
  $('btn-again').addEventListener('click', () => begin(lastOpts));
  $('btn-stay').addEventListener('click', () => showOverlay(null));
  for (const id of ['btn-menu', 'btn-menu2']) $(id).addEventListener('click', () => showOverlay('start'));
  $('settings-form').addEventListener('input', () => applySettings(readSettingsForm(settings)));
  window.addEventListener('blur', () => {
    if (started && overlay === null) showOverlay('pause');
  });

  /** @param {import('./core/settings.js').Settings} next */
  const applySettings = (next) => {
    settings = next;
    saveSettings(store, settings);
    if (sim) {
      sim.dsd.mode = settings.dsdMode;
      sim.settings = settings;
      sim.failures.frequency = settings.failures;
    }
    view.applySettings(settings);
    hud.applySettings(settings);
    audio.setVolume(settings.volume);
    pa.enabled = settings.announcements;
    input.setBindings(settings.bindings);
  };

  // Key bindings table.
  const renderBindings = () => {
    const table = $('bindings-table');
    table.replaceChildren(
      ...Object.entries(ACTION_NAMES).map(([action, name]) => {
        const tr = document.createElement('tr');
        const label = document.createElement('td');
        label.textContent = name;
        const keys = document.createElement('td');
        const codes = settings.bindings[action] ?? DEFAULT_BINDINGS[action];
        keys.textContent = codes.map((c) => c.replace(/^(Key|Digit)/, '').replace(/^Arrow/, 'Arrow ')).join(' / ');
        const btnCell = document.createElement('td');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rebind';
        btn.textContent = 'Change';
        btn.addEventListener('click', () => {
          btn.textContent = 'Press a key…';
          btn.classList.add('listening');
          input.capture = (code) => {
            applySettings({ ...settings, bindings: { ...settings.bindings, [action]: [code] } });
            renderBindings();
          };
        });
        btnCell.append(btn);
        tr.append(label, keys, btnCell);
        return tr;
      }),
    );
  };
  renderBindings();
  $('btn-reset-bindings').addEventListener('click', () => {
    applySettings({ ...settings, bindings: {} });
    renderBindings();
  });

  // ── the loop ──────────────────────────────────────────────────────────────
  startFixedLoop({
    dt: PHYSICS_DT,
    timeScale: () => (paused || !sim ? 0 : warp),
    frameStart: () => {
      const frame = mergeInput(input.poll(), pad.poll());
      if (frame.pause && started && overlay !== 'result') showOverlay(overlay === 'pause' ? null : 'pause');
      if (frame.assistToggle && !paused) applySettings({ ...settings, assistOverlay: !settings.assistOverlay });
      if (frame.timeWarp && !paused) warp = WARP_STEPS[(WARP_STEPS.indexOf(warp) + 1) % WARP_STEPS.length];
      if (!paused && sim) sim.applyInput(frame);
    },
    step: (dt) => sim?.step(dt),
    render: (alpha, frameTime) => {
      if (!sim) return;
      for (const ev of sim.drainEvents()) {
        hud.pushEvent(ev, sim.clockStart);
        audio.handleEvent(ev);
        pa.handleEvent(ev, sim);
        if (ev.type === 'departed') saveResume(sim, ev);
        if ((ev.type === 'run-complete' || ev.type === 'run-ended') && sim.result) showResult(sim.result);
      }
      view.render(sim, alpha, frameTime);
      hud.update(sim, warp);
      audio.update(sim, paused);
    },
  });

  /**
   * Remember where we are, so the journey can be picked up from this station later.
   * @param {Simulation} s
   * @param {import('./sim/simulation.js').SimEvent} ev
   */
  function saveResume(s, ev) {
    if (!ev.data?.next) return;
    store.save('resume', {
      route: route.id,
      service: s.service.id,
      call: ev.data.callIndex,
      station: ev.data.station ? route.stationName(ev.data.station) : '',
      timeShiftS: lastOpts.timeShiftS ?? 0,
      weather: lastOpts.weather,
      season: lastOpts.season,
    });
  }

  /** @param {NonNullable<Simulation['result']>} result */
  function showResult(result) {
    if (!result.ended) {
      recordScore(store, scoreKey(), { score: result.score, grade: result.grade, date: new Date().toISOString(), timeS: sim?.clock ?? 0, stopErrorM: 0 });
      store.save('resume', null);
    }
    $('result-title').textContent = result.ended ? 'Run ended' : 'Journey complete';
    $('result-score').textContent = result.ended ? result.ended : `${result.score} points · grade ${result.grade}`;
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

/** @param {import('./core/settings.js').Settings} current */
function readSettingsForm(current) {
  const form = /** @type {HTMLFormElement} */ ($('settings-form'));
  const get = (/** @type {string} */ name) => /** @type {HTMLInputElement} */ (form.elements.namedItem(name));
  return sanitizeSettings({
    ...current,
    speedUnits: get('speedUnits').value,
    dsdMode: get('dsdMode').value,
    failures: get('failures').value,
    volume: Number(get('volume').value),
    fov: Number(get('fov').value),
    assistOverlay: get('assistOverlay').checked,
    signalGlow: get('signalGlow').checked,
    cameraSway: get('cameraSway').checked,
    announcements: get('announcements').checked,
    spadEndsRun: get('spadEndsRun').checked,
  });
}

/** @param {unknown} err */
function showFatal(err) {
  const box = $('fatal');
  const message = err instanceof Error ? err.message : String(err);
  box.textContent = `Couldn't start the sim.\n\n${message}\n\nIf you opened index.html straight from disk, run "npm run dev" instead: browsers block loading the route file from file:// pages.`;
  box.hidden = false;
  $('overlay-start').hidden = true;
  console.error(err);
}

boot().catch(showFatal);
