// Aircraft size classes. Dimensions are metres and drive both the procedural
// models and the ground logic (stopping points, reservations, stand fit).

export const PLANE_TYPES = {
  small: {
    id: 'small',
    name: 'Small prop',
    short: 'Prop',
    seats: 30,
    runway: 60, // tiles
    stand: 'S',
    unlock: 1, // rating stars
    length: 22,
    span: 26,
    radius: 1.45,
    wake: 0,
  },
  regional: {
    id: 'regional',
    name: 'Regional jet',
    short: 'RJ',
    seats: 80,
    runway: 90,
    stand: 'M',
    unlock: 2,
    length: 30,
    span: 25,
    radius: 1.55,
    wake: 1,
  },
  narrow: {
    id: 'narrow',
    name: 'Narrowbody',
    short: 'NB',
    seats: 180,
    runway: 110,
    stand: 'M',
    unlock: 3,
    length: 37,
    span: 35,
    radius: 2.05,
    wake: 2,
  },
};

export const CLASS_IDS = Object.keys(PLANE_TYPES);
