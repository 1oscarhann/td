/**
 * On-train passenger announcements, spoken with the browser's speech synthesis (an en-GB voice
 * where one is installed). Generic wording, not a recording of any real operator's system.
 */

/** Connections worth mentioning at each station. */
const CHANGES = Object.freeze({
  BAA: 'Change here for Bognor Regis.',
  FOD: 'Change here for Littlehampton.',
  CCH: 'Change here for Portsmouth and Southampton.',
});

export class Announcer {
  constructor() {
    this.enabled = true;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    /** @type {SpeechSynthesisVoice | null} */
    this.voice = null;
    this.volume = 0.7;
  }

  pickVoice() {
    if (!this.synth || this.voice) return;
    const voices = this.synth.getVoices();
    this.voice = voices.find((v) => v.lang === 'en-GB') ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
  }

  /** @param {string} text */
  say(text) {
    if (!this.enabled || !this.synth) return;
    this.pickVoice();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = 'en-GB';
    u.rate = 0.95;
    u.volume = this.volume;
    this.synth.speak(u);
  }

  stop() {
    this.synth?.cancel();
  }

  /**
   * React to sim events.
   * @param {import('../sim/simulation.js').SimEvent} ev
   * @param {import('../sim/simulation.js').Simulation} sim
   */
  handleEvent(ev, sim) {
    if (ev.type === 'departed' && ev.data?.next) {
      const next = sim.journey.current;
      const id = /** @type {keyof typeof CHANGES} */ (next?.station ?? '');
      this.say(`The next station is ${ev.data.next}. ${CHANGES[id] ?? ''}`);
    } else if (ev.type === 'approaching') {
      const id = /** @type {keyof typeof CHANGES} */ (ev.data?.station ?? '');
      this.say(
        ev.data?.last
          ? `We will shortly be arriving at ${ev.data.name}, where this train terminates. Please take all your belongings with you. Mind the gap when leaving the train.`
          : `We will shortly be arriving at ${ev.data?.name}. ${CHANGES[id] ?? ''}`,
      );
    }
  }

  /**
   * The "welcome aboard" at the start of a journey.
   * @param {import('../sim/simulation.js').Simulation} sim
   */
  welcome(sim) {
    const calls = sim.journey.calls;
    const dest = calls[calls.length - 1]?.name;
    const stops = calls.slice(1, -1).map((c) => c.name);
    const list = stops.length ? `calling at ${stops.join(', ')} and ${dest}` : `to ${dest}`;
    this.say(`Welcome aboard this service to ${dest}, ${list}.`);
  }
}
