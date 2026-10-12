import { Train } from '../physics/train.js';
import { Controller } from '../physics/controller.js';
import { TrainPath } from '../route/trainPath.js';

/**
 * A train on the network: physics (how fast) plus a TrainPath (where), plus its controller and
 * its booked route through the junctions. The player's train and the AI trains are both these.
 */
export class Vehicle {
  /**
   * @param {import('../route/network.js').Network} network
   * @param {object} o
   * @param {string} o.id unique id (usually the headcode)
   * @param {import('../physics/trainSpec.js').TrainSpec} o.spec
   * @param {import('../route/network.js').TrackPos} o.front where the front starts
   * @param {string} [o.notch] starting controller position
   * @param {Record<string, 'N' | 'R'>} [o.plan] facing points to take reverse/normal
   * @param {number} [o.speed] starting speed (m/s), for trains that appear already moving
   */
  constructor(network, { id, spec, front, notch = 'B3', plan = {}, speed = 0 }) {
    this.network = network;
    this.id = id;
    this.spec = spec;
    this.controller = new Controller(spec, notch);
    this.physics = new Train(spec, { brakeDemand: this.controller.brakeDemand });
    this.physics.velocity = speed;
    this.path = new TrainPath(network, { track: front.track, s: front.s, length: spec.lengthM });
    /** @type {Map<string, 'N' | 'R'>} */
    this.plan = new Map(Object.entries(plan));
    /** Track covered during the last step, for spotting what we drove over. */
    /** @type {import('../route/network.js').Piece[]} */
    this.lastPieces = [];
    /** True once the front has run off an open end of the modelled network. */
    this.leftNetwork = false;
    /** Hit the buffer stops at this speed (m/s), if it happened. */
    this.bufferImpact = 0;
    /** Doors closed and ready to go: level crossings won't be lowered for a train still loading. */
    this.readyToStart = true;
  }

  get front() {
    return this.path.front;
  }

  get rear() {
    return this.path.rear;
  }

  get speed() {
    return this.physics.speed;
  }

  get isStationary() {
    return this.physics.isStationary;
  }

  /** Track under the train, rear first. */
  body() {
    return this.path.body();
  }

  /** Halfway along the train, for the gradient. */
  middle() {
    return this.path.behind(this.spec.lengthM / 2);
  }

  /**
   * One physics step, then move along the network.
   * @param {number} dt
   * @param {{ powerDemand: number, brakeDemand: number, adhesion?: number }} controls
   */
  step(dt, { powerDemand, brakeDemand, adhesion }) {
    this.path.prevFront = this.front;
    const distance = this.physics.step(dt, {
      powerDemand,
      brakeDemand,
      gradientPermille: this.network.gradientAt(this.middle()),
      adhesion,
    });
    this.lastPieces = [];
    if (distance > 0) {
      const res = this.path.advance(distance);
      this.lastPieces = res.pieces;
      if (res.end === 'open' && res.moved < distance - 1e-6) this.leftNetwork = true;
      if (res.end === 'buffers' && res.moved < distance - 1e-6) {
        this.bufferImpact = Math.max(this.bufferImpact, this.physics.speed);
        this.physics.velocity = 0;
      }
    } else if (distance < 0) {
      this.path.retreat(-distance);
    }
  }

  /** What the interlocking needs to know. */
  routing() {
    return { id: this.id, front: this.front, body: this.body(), plan: this.plan };
  }
}
