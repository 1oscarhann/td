import { G, approach, clamp } from '../core/units.js';

/** Below this speed (m/s) the train counts as standing still. */
const STAND_EPS = 1e-4;

/**
 * What the train is asked to do this step.
 * @typedef {object} TrainControls
 * @property {number} powerDemand 0..1 share of max tractive effort
 * @property {number} brakeDemand requested deceleration in m/s² (0 = brakes released)
 * @property {number} gradientPermille gradient under the train; + is uphill in the direction of travel
 * @property {number} [adhesion] wheel–rail friction coefficient μ available (dry ≈ 0.25, wet ≈ 0.12,
 *   leaf mulch ≈ 0.03). Omit for unlimited grip.
 */

/** Wheel-slide protection doesn't get all of the available grip while it's working. */
const WSP_EFFICIENCY = 0.85;
/** Sand improves grip once the automatic sanders kick in. */
const SAND_FACTOR = 1.4;
/** Seconds of slip or slide before the sanders start. */
const SAND_DELAY_S = 0.6;

/**
 * A train as a single point mass moving along the track (1D). Good enough for a train: it can
 * only go where the rails go, so all we need is how far along it is and how fast.
 *
 * `position` is the chainage (metres along the route) of the front. `dir` is +1 if the front
 * faces increasing chainage. `velocity` is signed along `dir`: negative means rolling backwards.
 */
export class Train {
  /**
   * @param {import('./trainSpec.js').TrainSpec} spec
   * @param {{ position?: number, dir?: 1 | -1, payloadKg?: number, brakeDemand?: number }} [opts]
   *   brakeDemand: start with the brakes already applied at this deceleration
   */
  constructor(spec, { position = 0, dir = 1, payloadKg = spec.payloadKg, brakeDemand = 0 } = {}) {
    this.spec = spec;
    this.position = position;
    /** Position at the start of the last step, for smooth rendering between steps. */
    this.prevPosition = position;
    this.dir = dir;
    this.velocity = 0;
    this.acceleration = 0;
    /** Tractive effort actually delivered, as a share of what's available (ramps, so not instant). */
    this.tractionLevel = 0;
    /** Brake cylinder pressure in bar: what the brake gauge shows. */
    this.bcPressure = brakeDemand / spec.brake.decelPerBar;
    this.mass = spec.tareMassKg + payloadKg;
    this.effectiveMass = this.mass * spec.rotationalMassFactor;
    /** Last step's forces in newtons, for the HUD, audio and debugging. */
    this.forces = { traction: 0, brake: 0, resistance: 0, gradient: 0 };
    this.odometer = 0;
    /** Wheels sliding under braking (WSP working). */
    this.sliding = false;
    /** Wheels spinning under power (traction control working). */
    this.slipping = false;
    this.sanding = false;
    this.slipTimer = 0;
    /** Rate of change of acceleration (m/s³), for ride-comfort scoring. */
    this.jerk = 0;
  }

  get speed() {
    return Math.abs(this.velocity);
  }

  get rearPosition() {
    return this.position - this.dir * this.spec.lengthM;
  }

  get isStationary() {
    return Math.abs(this.velocity) < STAND_EPS;
  }

  /**
   * Tractive effort available at a speed: flat up to the "base speed", then limited by power
   * (power = force × speed, so force falls as speed rises), fading to nothing at max speed.
   * @param {number} speed m/s
   */
  availableTractiveEffort(speed) {
    const t = this.spec.traction;
    const powerLimited = t.maxPowerW / Math.max(speed, 0.1);
    const cutoff = clamp((this.spec.maxSpeedMps - speed) / t.speedCutoffBandMps, 0, 1);
    return Math.min(t.maxTractiveEffortN, powerLimited) * cutoff;
  }

  /**
   * Rolling resistance plus air drag (the Davis equation), in newtons.
   * @param {number} speed m/s
   */
  resistanceAt(speed) {
    const { a, b, c } = this.spec.davis;
    return a + b * speed + c * speed * speed;
  }

  /**
   * Advance the physics by one fixed step.
   * @param {number} dt seconds
   * @param {TrainControls} controls
   * @returns {number} distance moved along the direction of travel (negative when rolling back)
   */
  step(dt, { powerDemand, brakeDemand, gradientPermille, adhesion = Infinity }) {
    const spec = this.spec;
    this.prevPosition = this.position;

    // Brake cylinder pressure chases its target with a lag: air takes time to flow.
    const targetBar = brakeDemand / spec.brake.decelPerBar;
    const tau = targetBar > this.bcPressure ? spec.brake.applyTimeConstantS : spec.brake.releaseTimeConstantS;
    this.bcPressure += (targetBar - this.bcPressure) * (1 - Math.exp(-dt / tau));

    // Traction builds gently and drops out quickly. Any brake demand cancels power.
    const tractionTarget = brakeDemand > 0 ? 0 : clamp(powerDemand, 0, 1);
    const rate = tractionTarget > this.tractionLevel ? spec.traction.rampUpPerS : spec.traction.rampDownPerS;
    this.tractionLevel = approach(this.tractionLevel, tractionTarget, rate * dt);

    const v = this.velocity;
    const speed = Math.abs(v);
    let traction = this.tractionLevel * this.availableTractiveEffort(speed); // only ever pushes forwards
    const gradient = -this.mass * G * (gradientPermille / 1000); // small angles: sin θ ≈ tan θ
    let brake = this.bcPressure * spec.brake.decelPerBar * this.effectiveMass; // load-weighed brake

    // Grip. Ask the wheels for more than the rail can give and they slide (braking) or spin
    // (power). The train's protection systems claw back most of it; sand helps after a moment.
    const mu = adhesion * (this.sanding ? SAND_FACTOR : 1);
    const brakeLimit = mu * this.mass * G; // every axle is braked
    const tractionLimit = mu * this.mass * G * spec.motoredAxleFraction;
    this.sliding = speed > 0.5 && brake > brakeLimit;
    this.slipping = traction > tractionLimit;
    if (this.sliding) brake = brakeLimit * WSP_EFFICIENCY;
    if (this.slipping) traction = tractionLimit * WSP_EFFICIENCY;
    this.slipTimer = this.sliding || this.slipping ? this.slipTimer + dt : Math.max(0, this.slipTimer - dt * 0.5);
    this.sanding = this.slipTimer > SAND_DELAY_S;
    const resistance = this.resistanceAt(speed);
    const drive = traction + gradient; // the forces that can get a train moving

    let vNew;
    if (speed < STAND_EPS) {
      // At a stand, brakes and rolling resistance hold the train unless the drive force beats them.
      const holding = brake + spec.davis.a;
      vNew = Math.abs(drive) <= holding ? 0 : ((drive - Math.sign(drive) * holding) / this.effectiveMass) * dt;
    } else {
      const sign = Math.sign(v);
      vNew = v + ((drive - sign * (brake + resistance)) / this.effectiveMass) * dt;
      // Brakes and friction can stop a train but never push it backwards. If the speed crossed
      // zero we stop here; next step the at-a-stand rule decides whether it rolls back.
      if (Math.sign(vNew) !== sign) vNew = 0;
    }

    const acceleration = (vNew - v) / dt;
    this.jerk = (acceleration - this.acceleration) / dt;
    this.acceleration = acceleration;
    const distance = 0.5 * (v + vNew) * dt; // trapezoid rule: exact for steady acceleration
    this.position += this.dir * distance;
    this.odometer += Math.abs(distance);
    this.velocity = vNew;
    this.forces.traction = traction;
    this.forces.brake = brake;
    this.forces.resistance = resistance;
    this.forces.gradient = gradient;
    return distance;
  }
}
