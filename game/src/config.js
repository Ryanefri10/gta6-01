// Neon Bay — tuning, story and mission definitions. One place for every
// number the rest of the game reads, so balancing never means hunting code.
export const CITY_NAME = 'Neon Bay';
export const SAVE_KEY = 'neon-bay-save-v1';

export const WORLD = {
  halfSize: 230,          // playable ground extends -230..230 on x and z
  blockSize: 60,          // city block pitch
  roadWidth: 14,          // road surface width
  roadHalf: 7,
  roadAt: [-150, -75, 0, 75, 150], // road centre lines on both axes
  beachZ: 196,            // boardwalk / sand starts here (south edge)
  waterZ: 214,            // water plane starts here
};

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 11.5,
  radius: 0.9,
  maxHealth: 100,
  jumpSpeed: 8.5,
  punchDamage: 25,
  punchRange: 2.4,
  punchCooldown: 0.45,
  shootCooldown: 0.22,
  gunDamage: 34,
  gunRange: 90,
};

export const CAR = {
  accel: 26,
  brake: 42,
  reverseAccel: 14,
  maxSpeed: 38,
  maxReverse: 10,
  steer: 1.9,
  grip: 6.5,
  radius: 2.2,
};

export const WANTED = {
  decaySeconds: [0, 22, 26, 30, 38, 50], // seconds per star lost, by star count
  maxStars: 5,
  stealStars: 1,
  killPedStars: 1,
  killCopStars: 1,
  shootNearCopStars: 1,
  maxPoliceCars: 4,
};

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'MISSION 1 — FIRST WHEELS',
    brief: 'Vega needs a driver, not a pedestrian. Steal any car on the street, then bring it to the marina marker.',
    stages: [
      { kind: 'steal', text: 'Steal a car — walk up to any car and press E.' },
      { kind: 'goto', pos: [150, 150], radius: 7, text: 'Drive the stolen car to the MARINA marker.' },
    ],
    reward: 500,
  },
  {
    id: 'bayfront-pickup',
    title: 'MISSION 2 — BAYFRONT PICKUP',
    brief: 'A package is stashed in the alley behind the Palms Hotel. Grab it on foot — then run it to the Coral Hotel. The cops will notice.',
    stages: [
      { kind: 'goto', pos: [-75, -112], radius: 4, onFoot: true, text: 'Go on foot to the ALLEY marker and grab the package.' },
      { kind: 'goto', pos: [112, -75], radius: 7, text: 'Deliver the package to the CORAL HOTEL marker. Lose the heat if you can.' },
    ],
    reward: 800,
    heatOnPickup: 2,
  },
  {
    id: 'dockside-showdown',
    title: 'MISSION 3 — DOCKSIDE SHOWDOWN',
    brief: 'The Harbor Kings hold the east docks and Vega\'s money. Take the docks back — all five of them — and collect the stash.',
    stages: [
      { kind: 'goto', pos: [150, -150], radius: 12, text: 'Reach the EAST DOCKS. The Harbor Kings are waiting.' },
      { kind: 'eliminate', count: 5, text: 'Take down the Harbor Kings (0/5). Watch your health.' },
      { kind: 'goto', pos: [168, -150], radius: 5, text: 'Collect the stash at the far end of the docks.' },
    ],
    reward: 1500,
  },
];

// Cash pickups scattered around the city (free-roam side activity). All sit
// on roads, never inside a building, so every one is reachable.
export const CASH_DROPS = [
  [-75, -112], [-38, -75], [38, 75], [75, 38], [-112, 75],
  [38, -75], [0, -38], [150, 0], [-150, 38], [75, 150],
];

export const CAR_MODELS = [
  { name: 'Sunset Sedan', color: 0xd94f3d, topSpeed: 36 },
  { name: 'Bay Cruiser', color: 0x3d7dd9, topSpeed: 34 },
  { name: 'Palm Taxi', color: 0xf2c230, topSpeed: 33, taxi: true },
  { name: 'Vice Coupe', color: 0x8f3fd9, topSpeed: 40 },
  { name: 'Coral Pickup', color: 0x3dd9a0, topSpeed: 32 },
  { name: 'Midnight GT', color: 0x22242e, topSpeed: 42 },
];

export const PED_NAMES = ['Mara', 'Theo', 'Luz', 'Ken', 'Priya', 'Otis', 'Nadia', 'Rex'];
