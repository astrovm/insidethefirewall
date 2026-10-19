// Springfield's streets, in the endless 3D world: roads along the edges of
// its squares, with traffic driving on them, ramps to jump off, and coins to
// grab, as in The Simpsons: Hit & Run. The traffic drives with the same car
// physics as Homer's car, so crashing into it works both ways.

import { carPoint, crashDamage, damageCar, driveCar, METER, parkedCar, type Car, type CarControls, type Ground } from "./car.ts";

/** The squares of the 3D world, and where the first one's middle is. Its edges are roads. */
export const CELL = 1600;
export const FIRST_CELL_Z = 600;
/** Two lanes, one each way, each this far from the middle of the road. Drivers keep right. */
export const LANE = 1.75 * METER;
export const ROAD_HALF_WIDTH = 2 * LANE;

/** The roads: running along z at these x, and along x at these z. */
export const roadX = (i: number) => (i + 0.5) * CELL;
export const roadZ = (j: number) => FIRST_CELL_Z + (j + 0.5) * CELL;

/** The square a point is in. */
export function cellOf(x: number, z: number): [number, number] {
  return [Math.floor(x / CELL + 0.5), Math.floor((z - FIRST_CELL_Z) / CELL + 0.5)];
}

/** A number from 0 to 1, always the same for the same square and `n`. */
export function cellRandom(i: number, j: number, n: number): number {
  let h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(n + 1, 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** A wedge to drive up and fly off: its low end's middle, which way it rises, and its size, in world units. */
export interface Ramp {
  x: number;
  z: number;
  heading: number;
  length: number;
  width: number;
  height: number;
}

const RAMP = { length: 5 * METER, width: 3.5 * METER, height: 1.4 * METER };
/** The first square's ramp, straight ahead of where Homer's car is parked. */
const FIRST_RAMP: Ramp = { x: 150, z: 1000, heading: 0, ...RAMP };

/** The ramp in square `i`, `j`, if it has one: half of them do, away from the roads. */
export function cellRamp(i: number, j: number): Ramp | null {
  if (i === 0 && j === 0) return FIRST_RAMP;
  if (cellRandom(i, j, 100) < 0.5) return null;
  const spread = CELL / 2 - ROAD_HALF_WIDTH - RAMP.length - 60;
  return {
    x: i * CELL + (cellRandom(i, j, 101) - 0.5) * 2 * spread,
    z: FIRST_CELL_Z + j * CELL + (cellRandom(i, j, 102) - 0.5) * 2 * spread,
    heading: cellRandom(i, j, 103) * Math.PI * 2,
    ...RAMP,
  };
}

/** Where a point is on a ramp: how far up it, and across from its middle. */
function onRamp(ramp: Ramp, x: number, z: number): { up: number; across: number } {
  const [sin, cos] = [Math.sin(ramp.heading), Math.cos(ramp.heading)];
  const [dx, dz] = [x - ramp.x, z - ramp.z];
  return { up: dx * sin + dz * cos, across: dx * cos - dz * sin };
}

/** How high a ramp is at a point, or 0 off it. */
export function rampHeight(ramp: Ramp, x: number, z: number): number {
  const { up, across } = onRamp(ramp, x, z);
  if (up < 0 || up > ramp.length || Math.abs(across) > ramp.width / 2) return 0;
  return (ramp.height * up) / ramp.length;
}

/** The ramps in the squares around a point. */
export function rampsNear(x: number, z: number): Ramp[] {
  const [ci, cj] = cellOf(x, z);
  const ramps: Ramp[] = [];
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    const ramp = cellRamp(i, j);
    if (ramp) ramps.push(ramp);
  }
  return ramps;
}

/** The floor: flat, but for the ramps. */
export const ground: Ground = (x, z) => {
  let height = 0;
  for (const ramp of rampsNear(x, z)) height = Math.max(height, rampHeight(ramp, x, z));
  return height;
};

/** How high a car's bumpers are off the floor. A guess. */
const BUMPER = 0.45 * METER;

/**
 * A ramp's tall end and sides are walls to a car low enough to hit them. The
 * box to run into, if the car's corner at `x`, `z`, its body `y` over
 * resting, would hit one.
 */
export function rampWall(ramp: Ramp, x: number, z: number, y: number): { x: number; z: number; heading: number; halfWidth: number; halfLength: number } | null {
  const height = rampHeight(ramp, x, z);
  if (height === 0 || height < y + BUMPER) return null;
  const [sin, cos] = [Math.sin(ramp.heading), Math.cos(ramp.heading)];
  const middle = ramp.length / 2;
  return { x: ramp.x + sin * middle, z: ramp.z + cos * middle, heading: ramp.heading, halfWidth: ramp.width / 2, halfLength: middle };
}

/** A coin floating over the floor, Hit & Run's half a meter up. */
export interface Coin {
  id: string;
  x: number;
  y: number;
  z: number;
}

const COIN_HOVER = 0.5 * METER;
/** Hit & Run's reach for grabbing coins: 2.25 m on foot, 2.25 times that in a car. */
export const COIN_REACH = 2.25 * METER;
export const COIN_REACH_IN_CAR = 2.25;

/**
 * The coins in square `i`, `j`: a row down a lane of the road on its east
 * side, and an arc over the ramp, where a car flying off it goes.
 */
export function cellCoins(i: number, j: number): Coin[] {
  const coins: Coin[] = [];
  const count = 5 + Math.floor(cellRandom(i, j, 200) * 4);
  const start = FIRST_CELL_Z + j * CELL + (cellRandom(i, j, 201) - 0.5) * (CELL - 600);
  const lane = cellRandom(i, j, 202) < 0.5 ? -LANE : LANE;
  for (let k = 0; k < count; k++) coins.push({ id: `${i},${j},${k}`, x: roadX(i) + lane, y: COIN_HOVER, z: start + k * 70 });
  const ramp = cellRamp(i, j);
  if (ramp) {
    // Where a car leaving the ramp at about 70 km/h flies, a little over its body.
    const [sin, cos] = [Math.sin(ramp.heading), Math.cos(ramp.heading)];
    const speed = 20;
    const rise = (speed * ramp.height) / ramp.length;
    for (let k = 0; k < 5; k++) {
      const t = 0.15 + k * 0.15;
      const out = ramp.length + speed * t * METER;
      const y = ramp.height + (rise * t - 8 * t * t) * METER + 0.8 * METER;
      coins.push({ id: `${i},${j},r${k}`, x: ramp.x + sin * out, y, z: ramp.z + cos * out });
    }
  }
  return coins;
}

/** The coins in the squares around a point. */
export function coinsNear(x: number, z: number): Coin[] {
  const [ci, cj] = cellOf(x, z);
  const coins: Coin[] = [];
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) coins.push(...cellCoins(i, j));
  return coins;
}

/** Whether a coin is close enough to grab, by Hit & Run's own test: a box, cut at the corners. */
export function grabs(coin: Coin, x: number, y: number, z: number, inCar: boolean): boolean {
  const reach = COIN_REACH * (inCar ? COIN_REACH_IN_CAR : 1);
  const [dx, dy, dz] = [Math.abs(coin.x - x), Math.abs(coin.y - y), Math.abs(coin.z - z)];
  return dx < reach && dz < reach && dy < COIN_REACH * (inCar ? 1.5 : 1) && dx + dz < (reach * 4) / 3;
}

/**
 * A car driving around, keeping to its lane and turning at crossings, until
 * something hits it hard: then it rolls to a stop, as in Hit & Run.
 */
export interface Traffic {
  car: Car;
  /** The road it's on: along z (at x = line) or along x (at z = line), and which way, 1 or -1. */
  along: "x" | "z";
  line: number;
  way: 1 | -1;
  /** Where it turns next, and onto which road, once it's chosen. */
  turn: { at: number; along: "x" | "z"; line: number; way: 1 | -1 } | null;
  /** Its paint, as a color for the model's pink. */
  paint: [number, number, number];
  /** Knocked out of its lane. */
  loose: boolean;
}

/** Guesses: how fast traffic drives, and slows down to turn, in world units a second. */
const CRUISE = (50 / 3.6) * METER;
const TURNING = (22 / 3.6) * METER;
/** Hit & Run's traffic is hurt less: the engine's default hit points. */
export const TRAFFIC_HIT_POINTS = 2;
export const TRAFFIC_PAINTS: [number, number, number][] = [
  [80, 140, 255],
  [90, 220, 120],
  [255, 220, 90],
  [240, 240, 240],
  [255, 140, 60],
  [170, 110, 255],
];
/** How many cars drive around near the player, and how far away they come and go. */
export const TRAFFIC_COUNT = 5;
const TRAFFIC_APPEAR = [1400, 2000] as const;
const TRAFFIC_GONE = 2600;

/** Where a car on this road and lane is, `distance` along it. */
function laneAt(road: { along: "x" | "z"; line: number; way: 1 | -1 }, distance: number): [number, number] {
  // Keeping right: to the right of the way it drives.
  return road.along === "z" ? [road.line + road.way * LANE, distance] : [distance, road.line - road.way * LANE];
}

const headingOf = (road: { along: "x" | "z"; way: 1 | -1 }) => (road.along === "z" ? (road.way > 0 ? 0 : Math.PI) : road.way > 0 ? Math.PI / 2 : -Math.PI / 2);

/** A new car somewhere on the roads around `x`, `z`, out of sight. */
export function spawnTraffic(x: number, z: number, random: () => number): Traffic {
  const along = random() < 0.5 ? "x" : "z";
  const way = random() < 0.5 ? 1 : -1;
  const angle = random() * Math.PI * 2;
  const distance = TRAFFIC_APPEAR[0] + random() * (TRAFFIC_APPEAR[1] - TRAFFIC_APPEAR[0]);
  const [px, pz] = [x + Math.sin(angle) * distance, z + Math.cos(angle) * distance];
  const [ci, cj] = cellOf(px, pz);
  const line = along === "z" ? roadX(ci) : roadZ(cj);
  const road = { along, line, way } as const;
  const [cx, cz] = laneAt(road, along === "z" ? pz : px);
  const car = parkedCar(cx, cz, headingOf(road));
  car.hitPoints = TRAFFIC_HIT_POINTS;
  car.driving = true;
  [car.vx, car.vz] = [Math.sin(car.heading) * CRUISE, Math.cos(car.heading) * CRUISE];
  car.speed = CRUISE;
  return { car, along, line, way, turn: null, paint: TRAFFIC_PAINTS[Math.floor(random() * TRAFFIC_PAINTS.length)]!, loose: false };
}

/** The next crossing ahead of a car on its road, as a distance along it. */
function nextCrossing(traffic: Traffic): number {
  const position = traffic.along === "z" ? traffic.car.z : traffic.car.x;
  const roads = traffic.along === "z" ? roadZ : roadX;
  const offset = traffic.along === "z" ? FIRST_CELL_Z : 0;
  // Roads across this one are at offset + (k + 0.5) * CELL.
  const k = (position - offset) / CELL - 0.5;
  const next = traffic.way > 0 ? Math.floor(k + 1e-6) + 1 : Math.ceil(k - 1e-6) - 1;
  // Not one so close it can't turn in time.
  const at = roads(next);
  return Math.abs(at - position) < LANE * 3 ? roads(next + traffic.way) : at;
}

/**
 * One step of a traffic car's driving: steering for a point down its lane,
 * slowing for crossings and for whatever is in front of it, and turning
 * where it chose to. `others` are the cars it looks out for.
 */
export function driveTraffic(traffic: Traffic, others: readonly Car[], dt: number, random: () => number): void {
  const { car } = traffic;
  const controls: CarControls = { gas: false, brake: false, handbrake: false, steer: 0 };
  if (traffic.loose || car.husk || car.wrecked >= 0) {
    driveCar(car, controls, dt, ground);
    return;
  }
  const position = traffic.along === "z" ? car.z : car.x;
  if (!traffic.turn) {
    const at = nextCrossing(traffic);
    const pick = random();
    const along = pick < 0.5 ? traffic.along : traffic.along === "z" ? "x" : "z";
    // Straight on, or left or right onto the crossing road.
    const way = along === traffic.along ? traffic.way : ((random() < 0.5 ? 1 : -1) as 1 | -1);
    traffic.turn = { at, along, line: along === traffic.along ? traffic.line : at, way };
  }
  const turn = traffic.turn;
  const toCrossing = (turn.at - position) * traffic.way;
  const turning = turn.along !== traffic.along;
  // Onto the new road once it's nearly at its lane, a little early so it swings round.
  const [lx, lz] = laneAt(turn, 0);
  const toLane = ((traffic.along === "z" ? lz : lx) - position) * traffic.way;
  if (turning ? toLane < 3 * LANE : toCrossing < 0) {
    if (turning) Object.assign(traffic, { along: turn.along, line: turn.line, way: turn.way });
    traffic.turn = null;
  }
  // Aim at a point down the lane, further the faster it goes.
  const ahead = Math.max(3 * METER, Math.abs(car.speed) * 0.6);
  const now = traffic.along === "z" ? car.z : car.x;
  const [tx, tz] = laneAt(traffic, now + traffic.way * ahead);
  const wanted = Math.atan2(tx - car.x, tz - car.z);
  const off = Math.atan2(Math.sin(wanted - car.heading), Math.cos(wanted - car.heading));
  controls.steer = Math.max(-1, Math.min(1, off * 2.5));
  // Slow for crossings it turns at, and round the corner till it's straight, and stop for anything in the way.
  let target = (turning && toCrossing < CELL * 0.25) || Math.abs(off) > 0.25 ? TURNING : CRUISE;
  const [sin, cos] = [Math.sin(car.heading), Math.cos(car.heading)];
  for (const other of others) {
    if (other === car) continue;
    const [dx, dz] = [other.x - car.x, other.z - car.z];
    const front = dx * sin + dz * cos;
    const side = Math.abs(dx * cos - dz * sin);
    if (front > 0 && front < 9 * METER && side < 2 * METER) target = Math.min(target, Math.max(0, (front - 5 * METER) * 3));
  }
  controls.gas = car.speed < target - 10;
  controls.brake = car.speed > target + 40;
  driveCar(car, controls, dt, ground);
}

/** Whether a traffic car is too far from the player to keep. */
export function trafficGone(traffic: Traffic, x: number, z: number): boolean {
  return Math.hypot(traffic.car.x - x, traffic.car.z - z) > TRAFFIC_GONE;
}

/** A crash hurts a traffic car and knocks it out of its lane when it's hard enough. Returns whether it wrecked it. */
export function hitTraffic(traffic: Traffic, impulse: number): boolean {
  const damage = crashDamage(impulse);
  if (damage > 0) traffic.loose = true;
  return damageCar(traffic.car, damage, TRAFFIC_HIT_POINTS);
}

export { carPoint };
