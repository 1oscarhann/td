/**
 * Cab sounds, synthesised with the Web Audio API so there are no sample files to license yet.
 *
 * Why not Howler.js? Howler is a sample player, and the Web Audio API already plays samples
 * fine. Drop recordings into public/audio/ with a samples.json (see loadSamples) and they
 * replace the synth voices; nothing else changes.
 *
 * Continuous sounds (motor whine, rolling noise, AWS horn, buzzers) follow the simulation state
 * every frame. One-off sounds (AWS bell, door chime, brake dump) are triggered by sim events.
 */

const SMOOTH = 0.04; // seconds for volume changes, so nothing clicks

export class AudioEngine {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.volume = 0.7;
  }

  /** Browsers only allow sound after a click or key press, so call this from one. */
  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
    if (!Ctor) return;
    const ctx = (this.ctx = new Ctor());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    this.noiseBuffer = makeNoise(ctx);

    // Traction: the Electrostar's rising inverter whine, plus a low motor growl.
    this.whine = this.oscVoice(['triangle', 'sine'], [1, 2.02], 0);
    this.growl = this.oscVoice(['sawtooth'], [1], 0, 380);
    // Wheels on rail: filtered noise that brightens with speed.
    this.rolling = this.noiseVoice('lowpass', 200, 0.7);
    // Air leaving the brake cylinders as you release.
    this.air = this.noiseVoice('bandpass', 2600, 1.5);
    // AWS warning horn: a harsh two-tone blare.
    this.awsHorn = this.oscVoice(['square', 'square'], [1, 1.49], 610, 2800);
    // Driver's horn: high and low tones.
    this.hornHigh = this.oscVoice(['sawtooth', 'sawtooth'], [1, 1.005], 466, 2400);
    this.hornLow = this.oscVoice(['sawtooth', 'sawtooth'], [1, 1.004], 370, 2000);
    // Buzzers: DSD/vigilance warning and the door-closing beeps.
    this.buzzer = this.oscVoice(['square'], [1], 1050, 3000);
    this.doorBeep = this.oscVoice(['sine'], [1], 1760);
    // Level crossing alarm (the "yodel"), heard as you pass a closed crossing.
    this.yodel = this.oscVoice(['square'], [1], 760, 2200);
    // Another train going by: a rush of low noise.
    this.passing = this.noiseVoice('lowpass', 400, 0.8);
    /** @type {Map<string, AudioBuffer>} recorded samples that replace synth voices */
    this.samples = new Map();
    /** @type {Map<string, { src: AudioBufferSourceNode, gain: GainNode }>} */
    this.sampleLoops = new Map();
  }

  /**
   * Optional recordings: public/audio/samples.json maps sound names to files, e.g.
   * { "aws-bell": "aws-bell.mp3", "aws-horn": "aws-horn.ogg", "rolling": "rolling.ogg",
   *   "traction": "traction.ogg", "horn-high": "horn-high.ogg", "horn-low": "horn-low.ogg",
   *   "chime": "doors.mp3", "right-away": "bells.mp3" }. Loops should loop cleanly.
   * @param {string} baseUrl
   */
  async loadSamples(baseUrl) {
    if (!this.ctx) return;
    let manifest;
    try {
      const res = await fetch(new URL('audio/samples.json', baseUrl).href);
      if (!res.ok) return;
      manifest = await res.json();
    } catch {
      return;
    }
    for (const [name, file] of Object.entries(manifest)) {
      try {
        const res = await fetch(new URL(`audio/${file}`, baseUrl).href);
        this.samples.set(name, await this.ctx.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // A missing or broken file just leaves the synth voice in place.
      }
    }
    for (const name of ['aws-horn', 'rolling', 'traction', 'horn-high', 'horn-low']) {
      const buffer = this.samples.get(name);
      if (!buffer) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(/** @type {GainNode} */ (this.master));
      src.start();
      this.sampleLoops.set(name, { src, gain });
    }
  }

  /**
   * Set a looping sound's level, using the recording if there is one, otherwise the synth.
   * @param {string} name
   * @param {{ gain: GainNode }} synth
   * @param {number} level
   * @param {number} [rate] playback rate for the recording
   */
  loop(name, synth, level, rate) {
    const sample = this.sampleLoops.get(name);
    if (sample) {
      this.level(sample, level * 2);
      if (rate !== undefined) sample.src.playbackRate.setTargetAtTime(rate, /** @type {AudioContext} */ (this.ctx).currentTime, 0.1);
      this.level(synth, 0);
    } else {
      this.level(synth, level);
    }
  }

  /** @param {string} name @returns {boolean} played a recording */
  playSample(name) {
    const buffer = this.samples.get(name);
    if (!buffer || !this.ctx) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(/** @type {GainNode} */ (this.master));
    src.start();
    return true;
  }

  /** @param {number} v 0..1 */
  setVolume(v) {
    this.volume = v;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, SMOOTH);
  }

  /**
   * Oscillators summed into one gain (silent until update() opens it).
   * @param {OscillatorType[]} types
   * @param {number[]} ratios frequency multiple of each oscillator
   * @param {number} freq base frequency
   * @param {number} [lowpass] optional filter cutoff
   */
  oscVoice(types, ratios, freq, lowpass) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    let out = /** @type {AudioNode} */ (gain);
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      gain.connect(filter);
      out = filter;
    }
    out.connect(/** @type {GainNode} */ (this.master));
    const oscs = types.map((type, i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * ratios[i];
      const g = ctx.createGain();
      g.gain.value = 1 / types.length;
      osc.connect(g).connect(gain);
      osc.start();
      return osc;
    });
    return { gain, oscs, ratios };
  }

  /**
   * Looping noise through a filter.
   * @param {BiquadFilterType} type
   * @param {number} freq
   * @param {number} q
   */
  noiseVoice(type, freq, q) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const src = ctx.createBufferSource();
    src.buffer = /** @type {AudioBuffer} */ (this.noiseBuffer);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(/** @type {GainNode} */ (this.master));
    src.start();
    return { gain, filter };
  }

  /**
   * @param {{ gain: GainNode }} voice
   * @param {number} level
   */
  level(voice, level) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    voice.gain.gain.setTargetAtTime(level, ctx.currentTime, SMOOTH);
  }

  /**
   * Follow the simulation. Called every rendered frame.
   * @param {import('../sim/simulation.js').Simulation} sim
   * @param {boolean} paused
   */
  update(sim, paused) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (paused) {
      for (const v of [this.whine, this.growl, this.rolling, this.air, this.awsHorn, this.hornHigh, this.hornLow, this.buzzer, this.doorBeep, this.yodel, this.passing, ...this.sampleLoops.values()]) this.level(v, 0);
      return;
    }
    const t = sim.train;
    const speed = t.speed;
    const effort = t.tractionLevel;
    const braking = Math.min(1, t.bcPressure / 3) * (speed > 1 ? 1 : 0);

    // Inverter whine climbs with speed; loud under power, quieter (regen) under brake.
    const whineHz = 140 + speed * 24;
    for (const [i, osc] of this.whine.oscs.entries()) osc.frequency.setTargetAtTime(whineHz * this.whine.ratios[i], now, 0.05);
    this.loop('traction', this.whine, speed > 0.2 || effort > 0 ? 0.05 + 0.11 * effort + 0.05 * braking : 0, 0.6 + speed / 40);
    this.growl.oscs[0].frequency.setTargetAtTime(30 + speed * 4, now, 0.05);
    this.level(this.growl, 0.08 * effort);

    this.rolling.filter.frequency.setTargetAtTime(180 + speed * 30, now, 0.1);
    this.loop('rolling', this.rolling, Math.min(0.35, (speed / 40) * 0.35), 0.5 + speed / 45);

    // Brake release hiss: proportional to how fast cylinder pressure is falling.
    const prev = this.lastBc ?? t.bcPressure;
    const falling = Math.max(0, prev - t.bcPressure);
    this.lastBc = t.bcPressure;
    this.level(this.air, Math.min(0.25, falling * 6));

    this.loop('aws-horn', this.awsHorn, sim.aws.hornSounding ? 0.16 : 0);
    this.loop('horn-high', this.hornHigh, sim.held.hornHigh ? 0.22 : 0);
    this.loop('horn-low', this.hornLow, sim.held.hornLow ? 0.22 : 0);
    const pulse = (/** @type {number} */ hz) => (now * hz) % 1 < 0.5;
    this.level(this.buzzer, sim.dsd.warning && pulse(3) ? 0.08 : 0);
    this.level(this.doorBeep, sim.doors.state === 'closing' && pulse(2.5) ? 0.1 : 0);

    // Crossing alarms and passing trains, by distance along our line.
    const front = sim.player.front;
    const line = sim.network.track(front.track).line.id;
    let alarm = 0;
    for (const lc of sim.crossings.crossings) {
      if (lc.def.line !== line || !lc.redLights) continue;
      const d = Math.abs(lc.def.position - front.s);
      if (d < 250) alarm = Math.max(alarm, 0.06 * (1 - d / 250));
    }
    this.yodel.oscs[0].frequency.setTargetAtTime(pulse(1.6) ? 760 : 620, now, 0.01);
    this.level(this.yodel, alarm);
    let rush = 0;
    for (const a of sim.ai) {
      const f = a.vehicle.front;
      if (sim.network.track(f.track).line.id !== line) continue;
      const d = Math.abs(f.s - front.s);
      if (d < 200) rush = Math.max(rush, (0.3 * (1 - d / 200) * Math.min(1, (a.vehicle.speed + speed) / 30)));
    }
    this.level(this.passing, rush);
  }

  /** @param {import('../sim/simulation.js').SimEvent} ev */
  handleEvent(ev) {
    if (!this.ctx) return;
    if (ev.type === 'aws-bell') this.playSample('aws-bell') || this.bell();
    else if (ev.type === 'doors' && ev.data?.state === 'opening') this.playSample('chime') || this.chime();
    else if (ev.type === 'penalty') this.brakeDump();
    else if (ev.type === 'right-away') this.playSample('right-away') || this.rightAway();
    else if (ev.type === 'signaller' || ev.type === 'radio' || ev.type === 'tso') this.beep(ev.type === 'tso' ? 1400 : 980, 2);
  }

  /** The AWS bell: a short struck ding. */
  bell() {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const now = ctx.currentTime;
    for (const [ratio, amp] of [
      [1, 0.22],
      [2.76, 0.08],
      [5.4, 0.04],
    ]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = 1080 * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      osc.connect(g).connect(/** @type {GainNode} */ (this.master));
      osc.start(now);
      osc.stop(now + 1.5);
    }
  }

  /** The guard's (or dispatcher's) "ding ding": right away. */
  rightAway() {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    [0, 0.45].forEach((delay) => {
      const now = ctx.currentTime + delay;
      for (const [ratio, amp] of [
        [1, 0.18],
        [2.4, 0.06],
      ]) {
        const osc = ctx.createOscillator();
        osc.frequency.value = 820 * ratio;
        const g = ctx.createGain();
        g.gain.setValueAtTime(amp, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
        osc.connect(g).connect(/** @type {GainNode} */ (this.master));
        osc.start(now);
        osc.stop(now + 1);
      }
    });
  }

  /**
   * Short beeps (radio, TPWS override).
   * @param {number} freq
   * @param {number} count
   */
  beep(freq, count) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    for (let i = 0; i < count; i++) {
      const now = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(g).connect(/** @type {GainNode} */ (this.master));
      osc.start(now);
      osc.stop(now + 0.15);
    }
  }

  /** Two-note "doors opening" chime. */
  chime() {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const now = ctx.currentTime;
    [659, 523].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const g = ctx.createGain();
      const start = now + i * 0.35;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(g).connect(/** @type {GainNode} */ (this.master));
      osc.start(start);
      osc.stop(start + 0.65);
    });
  }

  /** Big rush of air when the emergency brake goes on. */
  brakeDump() {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = /** @type {AudioBuffer} */ (this.noiseBuffer);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
    src.connect(filter).connect(g).connect(/** @type {GainNode} */ (this.master));
    src.start(now);
    src.stop(now + 2.6);
  }
}

/**
 * Two seconds of white noise to loop.
 * @param {AudioContext} ctx
 */
function makeNoise(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
