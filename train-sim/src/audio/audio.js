/**
 * Cab sounds, synthesised with the Web Audio API so there are no sample files to license yet.
 *
 * Why not Howler.js? Howler is a sample player: great once we have recordings (Milestone 6),
 * pointless while every sound is generated. Swapping a synth voice for a sample later only
 * changes this file.
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
      for (const v of [this.whine, this.growl, this.rolling, this.air, this.awsHorn, this.hornHigh, this.hornLow, this.buzzer, this.doorBeep]) this.level(v, 0);
      return;
    }
    const t = sim.train;
    const speed = t.speed;
    const effort = t.tractionLevel;
    const braking = Math.min(1, t.bcPressure / 3) * (speed > 1 ? 1 : 0);

    // Inverter whine climbs with speed; loud under power, quieter (regen) under brake.
    const whineHz = 140 + speed * 24;
    for (const [i, osc] of this.whine.oscs.entries()) osc.frequency.setTargetAtTime(whineHz * this.whine.ratios[i], now, 0.05);
    this.level(this.whine, speed > 0.2 || effort > 0 ? 0.05 + 0.11 * effort + 0.05 * braking : 0);
    this.growl.oscs[0].frequency.setTargetAtTime(30 + speed * 4, now, 0.05);
    this.level(this.growl, 0.08 * effort);

    this.rolling.filter.frequency.setTargetAtTime(180 + speed * 30, now, 0.1);
    this.level(this.rolling, Math.min(0.35, (speed / 40) * 0.35));

    // Brake release hiss: proportional to how fast cylinder pressure is falling.
    const prev = this.lastBc ?? t.bcPressure;
    const falling = Math.max(0, prev - t.bcPressure);
    this.lastBc = t.bcPressure;
    this.level(this.air, Math.min(0.25, falling * 6));

    this.level(this.awsHorn, sim.aws.hornSounding ? 0.16 : 0);
    this.level(this.hornHigh, sim.held.hornHigh ? 0.22 : 0);
    this.level(this.hornLow, sim.held.hornLow ? 0.22 : 0);
    const pulse = (/** @type {number} */ hz) => (now * hz) % 1 < 0.5;
    this.level(this.buzzer, sim.dsd.warning && pulse(3) ? 0.08 : 0);
    this.level(this.doorBeep, sim.doors.state === 'closing' && pulse(2.5) ? 0.1 : 0);
  }

  /** @param {import('../sim/simulation.js').SimEvent} ev */
  handleEvent(ev) {
    if (!this.ctx) return;
    if (ev.type === 'aws-bell') this.bell();
    else if (ev.type === 'doors' && ev.data?.state === 'opening') this.chime();
    else if (ev.type === 'penalty') this.brakeDump();
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
