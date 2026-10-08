import { BALANCE } from '../config/balance.js';

const TA = BALANCE.turnaround;

// Ground handling of a parked plane: arrive → deplane → service → board → ready.
// Passengers, jet bridges and vehicles hook in through the game systems.
export class Turnaround {
  constructor(game, plane, stand) {
    this.game = game;
    this.plane = plane;
    this.stand = stand;
    this.flight = plane.flight;
    this.phase = 'arrive';
    this.t = 0;
    this.serviceLeft = TA.service[plane.cls];
    this.serviceStarted = false;
    this.deplaneLeft = this.flight.arrPax;
    this.deplaneT = 0;
    this.boardT = 0;
    this.vehicles = null; // set by the vehicle system
    this.ready = false;
    this.boardingOpen = false;
    this.boardingDone = false;
    this.paxOnboard = this.flight.arrPax;
    this.flight.standId = stand?.id ?? null;
    this.flight.status = 'atStand';
    game.events.emit('turnaroundStart', this);
  }

  get now() {
    return this.game.clock.abs;
  }

  status() {
    switch (this.phase) {
      case 'arrive':
        return 'Arrived';
      case 'deplane':
        return `Deplaning (${this.paxOnboard})`;
      case 'service':
        return this.vehicles && !this.vehicles.reached ? 'Waiting for ground crew' : 'Refuelling & bags';
      case 'board':
        return this.boardingOpen ? `Boarding ${this.flight.depBoarded}/${this.flight.depBooked}` : 'Turnaround';
      case 'ready':
        return this.plane.waitNote || 'Ready for pushback';
    }
    return 'At stand';
  }

  update(dt) {
    this.t += dt;
    const pax = this.game.passengers;
    switch (this.phase) {
      case 'arrive':
        if (this.t > 2.5) this.next('deplane');
        break;
      case 'deplane': {
        // passengers walk off one at a time
        this.deplaneT -= dt;
        while (this.deplaneLeft > 0 && this.deplaneT <= 0) {
          this.deplaneT += TA.deplaneInterval[this.plane.cls];
          this.deplaneLeft--;
          this.paxOnboard--;
          pax?.deplane(this.plane, this.stand);
          this.game.events.emit('paxArrived', this.flight);
        }
        if (this.deplaneLeft <= 0) this.next('service');
        if (!this.serviceStarted) this.startService();
        this.tickService(dt);
        break;
      }
      case 'service':
        this.tickService(dt);
        if (this.serviceLeft <= 0) this.next('board');
        break;
      case 'board': {
        const std = this.flight.std;
        if (!this.boardingOpen && this.now >= std - TA.boardingOpensMin) {
          this.boardingOpen = true;
          this.flight.status = 'boarding';
          this.game.events.emit('boardingOpen', this.flight, this.plane, this.stand);
        }
        if (this.boardingOpen) {
          this.boardingDone = pax ? pax.boardingComplete(this.flight) : true;
          if ((this.boardingDone && this.now >= std - 10) || this.now >= std) {
            pax?.closeBoarding(this.flight);
            this.next('ready');
          }
        }
        break;
      }
      case 'ready':
        this.ready = true;
        break;
    }
  }

  startService() {
    this.serviceStarted = true;
    this.game.vehicles?.dispatch(this);
  }

  tickService(dt) {
    // ground vehicles speed things up; without them service drags on
    const reachable = this.vehicles ? this.vehicles.reachable : true;
    const working = this.vehicles ? this.vehicles.reached || !reachable : true;
    if (!working) return;
    this.serviceLeft -= dt / (reachable ? 1 : TA.noVehicleMult);
  }

  next(phase) {
    this.phase = phase;
    this.t = 0;
    this.game.events.emit('turnaroundPhase', this, phase);
  }

  dispose() {
    this.game.events.emit('turnaroundEnd', this);
  }
}

export class Turnarounds {
  constructor(game) {
    this.game = game;
  }
  start(plane, stand) {
    return new Turnaround(this.game, plane, stand);
  }
}
