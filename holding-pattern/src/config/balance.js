// Every tunable number in the game lives here, so balancing never means hunting
// through system code. Money is in pounds, distances in metres, times in
// simulation seconds unless the name says otherwise ("Min" = in-game minutes).

export const BALANCE = {
  startMoney: 150000,

  map: {
    width: 120, // tiles
    height: 80, // tiles
    tile: 10, // metres per tile
  },

  time: {
    gameMinPerSec: 1.2, // in-game minutes that pass per simulation second at 1x
    startHour: 6, // a new game starts at 06:00 on day 1
    nightBoost: 5, // the clock runs this much faster 00:00-05:00 while the airport is empty
    speeds: [1, 2, 4],
    maxStep: 0.05, // largest simulation sub-step, seconds
  },

  costs: {
    runwayPerTile: 400, // per tile of runway length
    taxiwayPerTile: 150,
    terminalPerTile: 250,
    stand: 5000,
    gate: 15000,
    standSizeMult: { S: 1, M: 1, L: 1 }, // raise M/L above 1 to charge more for big stands
    checkin: 3000,
    security: 8000,
    lounge: 6000,
    refund: 0.5, // bulldoze refund fraction
  },

  wages: {
    // per in-game day, paid at midnight
    checkin: 450,
    security: 900,
    lounge: 0,
  },

  fees: {
    landing: { small: 900, regional: 1800, narrow: 3200 },
    perPassenger: 12, // every passenger who arrives or departs through the airport
  },

  runway: {
    width: 3, // tiles
    minLength: 60, // tiles, the shortest runway that anything can use
    maxLength: 118,
  },

  stands: {
    size: { S: 3, M: 5, L: 7 }, // footprint in tiles (square)
    fits: { S: ['small'], M: ['small', 'regional', 'narrow'], L: ['small', 'regional', 'narrow'] },
  },

  rooms: {
    checkin: { w: 1, h: 2, serviceTime: 2.4 },
    security: { w: 1, h: 2, serviceTime: 1.9 },
    lounge: { w: 2, h: 2, seats: 40 },
  },

  flight: {
    taxiSpeed: 14, // m/s
    taxiTurnSpeed: 6,
    pushbackSpeed: 3.4,
    taxiAccel: 3.5,
    rolloutDecel: 4.0,
    takeoffAccel: 4.2,
    climbRate: 9, // m/s
    turnRadius: 300, // airborne turn radius, metres
    inboundSpeed: 70,
    holdingSpeed: 58,
    approachSpeed: 60,
    touchdownSpeed: 46,
    rotateSpeed: 46,
    finalLength: 1000, // final approach fix distance from the threshold
    finalAltitude: 100,
    decisionDistance: 380, // go-around decision point before the threshold
    holdingRadius: 360,
    holdingAltitude: 320,
    holdingStep: 110, // altitude between stacked holding planes
    radarRadius: 2300, // inbound planes appear at this distance from the airport centre
    holdingFixDistance: 1000,
    holdingOffset: 950, // holding fix sits this far to the side of the main runway's approach
    touchdownTiles: 7, // touchdown point, tiles past the threshold
  },

  fuel: {
    reserveMin: 55, // seconds of holding fuel on arrival at the radar edge (beyond the trip itself)
    reserveMax: 150,
    lowChance: 0.22, // chance a flight shows up already short on fuel
    lowReserveMin: 26,
    lowReserveMax: 48,
    amber: 45, // seconds left
    red: 20,
  },

  atc: {
    separation: 20, // seconds between touchdowns, same class
    wakePenalty: 7, // extra seconds when a smaller plane follows a bigger one
    departureFairness: 24, // seconds a departure can wait before arrivals are held back for it
    runwayBuffer: 4,
  },

  turnaround: {
    // scheduled time between arrival and departure, in-game minutes
    scheduledMin: { small: 50, regional: 65, narrow: 80 },
    // ground handling (fuel, bags) once vehicles are at the plane, seconds
    service: { small: 14, regional: 20, narrow: 26 },
    noVehicleMult: 2.6, // service takes this much longer when ground vehicles can't reach the stand
    deplaneInterval: { small: 0.42, regional: 0.24, narrow: 0.13 },
    boardInterval: { small: 0.42, regional: 0.24, narrow: 0.13 },
    boardingOpensMin: 40, // boarding call this many in-game minutes before departure
    onTimeGraceMin: 15,
  },

  passengers: {
    walkSpeed: 3.4,
    queueSpacing: 1.15,
    spawnWindowStartMin: 150, // departing passengers start turning up this long before departure
    spawnWindowEndMin: 38,
    maxActive: 1600,
    startHappiness: [72, 88],
    queuePatience: 22, // seconds in a queue before happiness starts to drop
    queueDrainPerSec: 0.32,
    holdingDrainPerSec: 0.12, // arriving passengers stuck in the holding stack
    goAroundHit: 8,
    missedFlightHit: 60,
    gateChangeHit: 3,
    walkOutHit: 4, // walking across the apron to a remote stand
  },

  schedule: {
    firstHour: 6.25,
    lastHour: 22.5,
    baseFlights: 3, // flights a day at 1 star
    perStar: 3, // extra flights a day for each star above 1
    maxPerStandPerDay: 7,
    jitterMin: 14, // inbound flights can turn up this many minutes early or late
    firstFlightDelayMin: 45, // the very first flight is scheduled this long after the airport opens
  },

  contracts: {
    offerHour: 7,
    expireHours: 20,
    perDay: [2, 6],
    days: [3, 7],
    bonusPerFlight: { small: 450, regional: 900, narrow: 1700 },
    completionBonus: { small: 4000, regional: 9000, narrow: 18000 },
    completionOnTime: 0.8,
  },

  rating: {
    start: 1,
    alpha: 0.045, // how far each completed flight pulls the rating toward its score
    divertAlpha: 0.14,
    weights: { happiness: 0.5, onTime: 0.35, diversions: 0.15 },
    unlocks: { small: 1, regional: 2, narrow: 3 },
  },

  bankruptcyDays: 3,
  autosaveKey: 'holding-pattern-save',
};

export const PLANE_CLASSES = ['small', 'regional', 'narrow'];
