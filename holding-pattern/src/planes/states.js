// Plane lifecycle states, in order. GO_AROUND and DIVERTED branch off.
export const S = {
  INBOUND: 'inbound',
  HOLDING: 'holding',
  APPROACH: 'approach',
  LANDING: 'landing',
  ROLLOUT: 'rollout',
  TAXI_IN: 'taxiIn',
  PARKED: 'parked',
  PUSHBACK: 'pushback',
  TAXI_OUT: 'taxiOut',
  LINED_UP: 'linedUp',
  TAKEOFF: 'takeoff',
  DEPARTED: 'departed',
  GO_AROUND: 'goAround',
  DIVERTED: 'diverted',
};

export const STATE_LABEL = {
  inbound: 'Inbound',
  holding: 'Holding',
  approach: 'On approach',
  landing: 'Landing',
  rollout: 'Landed',
  taxiIn: 'Taxiing in',
  parked: 'At stand',
  pushback: 'Pushing back',
  taxiOut: 'Taxiing out',
  linedUp: 'Lined up',
  takeoff: 'Taking off',
  departed: 'Departed',
  goAround: 'Go-around',
  diverted: 'Diverted',
};

export const AIRBORNE = new Set([S.INBOUND, S.HOLDING, S.APPROACH, S.LANDING, S.GO_AROUND, S.DIVERTED, S.DEPARTED]);
export const WAITING_TO_LAND = new Set([S.INBOUND, S.HOLDING, S.GO_AROUND]);
