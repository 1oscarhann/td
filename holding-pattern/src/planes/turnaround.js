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
    if (stand) this.flight.lounge = game.terminal.loungeFor(stand);
    this.flight.status = 'atStand';
    // a late arrival can't leave on time: departure slips to a minimum turnaround
    const minTurn = BALANCE.turnaround.scheduledMin[plane.cls] * TA.minTurnFrac;
    this.flight.etd = Math.max(this.flight.std, game.clock.abs + minTurn);
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
      case 'arrive': {
        // gates wait for the jet bridge to reach the door
        const jb = this.stand && this.game.jetbridges?.forStand(this.stand.id);
        if (this.t > 2.5 && (!jb || jb.docked || this.t > 12)) this.next('deplane');
        break;
      }
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
        if (!this.boardingOpen && this.now >= (this.flight.etd ?? this.flight.std) - TA.boardingOpensMin) {
          this.boardingOpen = true;
          // everyone already at the airport gets a fair chance to walk on board
          const walk = this.game.terminal.walkTime(this.flight.lounge, this.stand);
          const windowMin = (this.flight.depBooked * TA.boardInterval[this.plane.cls] + walk + 12) * BALANCE.time.gameMinPerSec;
          this.flight.etd = Math.max(this.flight.etd ?? this.flight.std, this.now + windowMin);
          this.flight.boardingOpenFlag = true;
          this.flight.lounge = this.game.terminal.loungeFor(this.stand) || this.flight.lounge;
          this.flight.status = 'boarding';
          this.game.events.emit('boardingOpen', this.flight, this.plane, this.stand);
        }
        const std = this.flight.etd ?? this.flight.std;
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
