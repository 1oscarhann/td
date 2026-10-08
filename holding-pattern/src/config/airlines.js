// Fictional airlines only. Livery colours follow the spec; everything else is
// personality expressed as numbers the economy and passenger systems read.

export const AIRLINES = {
  puffin: {
    id: 'puffin',
    name: 'Puffin Express',
    code: 'PF',
    type: 'Regional',
    classes: ['small', 'regional'],
    minRating: 1,
    feeMult: 0.85, // cheap
    loadFactor: [0.55, 0.85],
    patience: 0.7, // low expectations: happiness drains slower
    turnaroundAdjMin: 0,
    livery: {
      top: 0xffffff,
      belly: 0x1f3a5f,
      cheat: 0x1f3a5f,
      cheat2: 0xf2a541,
      nose: 0xf2a541,
      tail: 0x1f3a5f,
      engine: 0x1f3a5f,
      wing: 0xdfe3e8,
      accent: 0xf2a541,
      window: 0x1d2836,
      emblem: 'puffin',
    },
    blurb: 'Small planes, cheap, low expectations.',
  },
  skylark: {
    id: 'skylark',
    name: 'Skylark Air',
    code: 'SL',
    type: 'Budget',
    classes: ['regional', 'narrow'],
    minRating: 2,
    feeMult: 0.75, // pays little
    loadFactor: [0.85, 1.0], // lots of passengers
    patience: 1.0,
    turnaroundAdjMin: -12, // wants fast turnarounds
    livery: {
      top: 0xffd23f,
      belly: 0x2b2b2b,
      cheat: 0x2b2b2b,
      cheat2: 0xffd23f,
      nose: 0x2b2b2b,
      tail: 0x2b2b2b,
      engine: 0xffd23f,
      wing: 0xd9dce1,
      accent: 0xffd23f,
      window: 0x1b1b1b,
      emblem: 'skylark',
    },
    blurb: 'Lots of passengers, pays little, wants fast turnarounds.',
  },
  meridian: {
    id: 'meridian',
    name: 'Meridian',
    code: 'MR',
    type: 'Premium',
    classes: ['regional', 'narrow'],
    minRating: 3,
    feeMult: 1.5, // pays most
    loadFactor: [0.6, 0.85],
    patience: 1.55, // complains about everything
    turnaroundAdjMin: 8,
    livery: {
      top: 0x1b4d3e,
      belly: 0x163f33,
      cheat: 0xc9a961,
      cheat2: 0xc9a961,
      nose: 0x1b4d3e,
      tail: 0x1b4d3e,
      engine: 0x1b4d3e,
      wing: 0xd3d6d2,
      accent: 0xc9a961,
      window: 0x0c1a15,
      emblem: 'meridian',
    },
    blurb: 'Pays the most, complains about everything.',
  },
};

export const AIRLINE_IDS = Object.keys(AIRLINES);

// Made-up destinations: [code, name]
export const PLACES = [
  ['KBY', 'Kestrel Bay'], ['NMR', 'Northmoor'], ['SLT', 'Saltmere'], ['PHV', 'Port Haven'],
  ['WDL', 'Windle'], ['BRK', 'Brackenford'], ['CLF', 'Cliffhaven'], ['ASH', 'Ashby Vale'],
  ['GLN', 'Glenmorrow'], ['RVN', 'Ravenscar'], ['TDE', 'Tidewater'], ['LUM', 'Lumen Isles'],
  ['FRS', 'Frostholm'], ['MRB', 'Marbleton'], ['SNY', 'Sunnydown'], ['OKH', 'Oakhollow'],
  ['CPR', 'Copperfield'], ['BLU', 'Bluewater'], ['HRB', 'Harbourside'], ['PNE', 'Pinecrest'],
  ['ELM', 'Elmstead'], ['DUN', 'Dunmarrow'], ['SAV', 'Saffron Vale'], ['WTH', 'Whitecliff'],
];
