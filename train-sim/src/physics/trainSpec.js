import { mphToMps } from '../core/units.js';

/**
 * Everything the physics needs to know about a type of train.
 *
 * @typedef {object} TrainSpec
 * @property {string} id
 * @property {string} name
 * @property {number} cars
 * @property {number} lengthM
 * @property {number} tareMassKg empty weight
 * @property {number} payloadKg default passenger load
 * @property {number} rotationalMassFactor spinning wheels, gears and motor rotors act like extra mass when you speed up or slow down
 * @property {number} maxSpeedMps
 * @property {TractionSpec} traction
 * @property {BrakeSpec} brake
 * @property {{ a: number, b: number, c: number }} davis running resistance R = a + b·v + c·v² (newtons, v in m/s)
 * @property {{ eyeHeightM: number, setbackM: number, lateralM: number }} cab driver's eye position relative to the front of the train, centre of the track and top of rail
 */

/**
 * @typedef {object} TractionSpec
 * @property {number} maxPowerW
 * @property {number} maxTractiveEffortN pulling force limit at low speed
 * @property {number[]} powerNotches share of max effort for P1..P4
 * @property {number} rampUpPerS how fast effort can build (a jerk limit, for comfort)
 * @property {number} rampDownPerS
 * @property {number} speedCutoffBandMps traction fades out over this band below max speed
 */

/**
 * @typedef {object} BrakeSpec
 * @property {number[]} serviceStepsMps2 deceleration asked for by B1..B3
 * @property {number} emergencyMps2
 * @property {number} decelPerBar brake cylinder pressure → deceleration
 * @property {number} applyTimeConstantS how quickly cylinder pressure builds
 * @property {number} releaseTimeConstantS
 * @property {number} mainReservoirBar
 */

/**
 * Class 377/4 Electrostar, 4 cars, 750 V DC third rail (Southern's workhorse on this route).
 * Sourced figures are noted; everything marked (A) is an assumption listed in docs/ASSUMPTIONS.md.
 * @type {Readonly<TrainSpec>}
 */
export const CLASS_377_4 = Object.freeze({
  id: '377/4',
  name: 'Class 377/4 Electrostar',
  cars: 4,
  lengthM: 81.6, // 4 × 20.4 m cars (Wikipedia)
  tareMassKg: 173_600, // Wikipedia
  payloadKg: 10_000, // (A) about 130 passengers at 75 kg
  rotationalMassFactor: 1.08, // (A) typical EMU is 6–10 %
  maxSpeedMps: mphToMps(100), // Wikipedia
  traction: {
    maxPowerW: 1_200_000, // 6 × 200 kW motors (Wikipedia)
    maxTractiveEffortN: 160_000, // (A) gives about 0.8 m/s² from a stand
    powerNotches: [0.25, 0.5, 0.75, 1], // (A)
    rampUpPerS: 0.6, // (A) about 1.7 s from nothing to full power
    rampDownPerS: 1.5, // (A)
    speedCutoffBandMps: mphToMps(2),
  },
  brake: {
    serviceStepsMps2: [0.3, 0.6, 0.9], // (A) about 3, 6 and 9 %g
    emergencyMps2: 1.2, // (A) about 12 %g
    decelPerBar: 0.3, // (A) so full service is 3 bar, emergency 4 bar
    applyTimeConstantS: 0.7, // (A)
    releaseTimeConstantS: 1.2, // (A)
    mainReservoirBar: 8, // (A) shown on the gauge, not simulated yet
  },
  davis: { a: 2200, b: 45, c: 6 }, // (A)
  cab: { eyeHeightM: 2.65, setbackM: 1.6, lateralM: -0.55 }, // (A) UK drivers sit on the left
});
