// Homer's car drives like in The Simpsons: Hit & Run: the rear wheels push,
// the front ones steer, and each tire pushes back against sliding sideways
// until the car loses grip and slides. Each wheel hangs on a spring, so the
// body leans in turns, dips braking, and flies off ramps. Crashes hurt it, as
// in the game: it smokes, then burns, then blows up. The numbers are tuned to
// feel like the game's Family Sedan.

/** The car's state, in world units. Its x and z are its center of mass. */
export interface Car {
  x: number;
  z: number;
  heading: number;
  /** Velocity in world units a second, and how fast it turns, in radians a second, to the right. */
  vx: number;
  vz: number;
  spin: number;
  /** Speed along where it points, backwards below 0. */
  speed: number;
  /** The steering, -1 full left to 1 full right, which follows the keys at a rate. */
  steer: number;
  /** Gripping, sliding, or sliding on the handbrake. */
  grip: "normal" | "slip" | "handbrake";
  driving: boolean;
  /** How high the body is over where it rests on flat floor, and how fast it goes up. */
  y: number;
  vy: number;
  /** The body's lean on its springs: nose up, and right side up, in radians, and how fast they change. */
  pitch: number;
  pitchRate: number;
  roll: number;
  rollRate: number;
  /** How high each wheel's bottom is: rear left, rear right, front left, front right. */
  wheelY: [number, number, number, number];
  /** No wheel touches the floor. */
  airborne: boolean;
  /** How hard the tires are skidding, 0 to 1, for skid marks, smoke and sound. Only the rear ones in a burnout. */
  skid: number;
  burnout: boolean;
  /** How far the wheels have turned, for drawing them rolling. */
  wheelTurn: number;
  /** What's left of it: it starts with HIT_POINTS. */
  hitPoints: number;
  /** Seconds a hit can't hurt it, after one that nearly wrecked it. */
  safe: number;
  /** Seconds since it was wrecked, burning before it blows up. -1 while it isn't. */
  wrecked: number;
  /** Blown up: a burnt husk that can't drive. */
  husk: boolean;
  /** The gas was on, last step. */
  gas: boolean;
}

export interface CarControls {
  gas: boolean;
  brake: boolean;
  handbrake: boolean;
  /** -1 left, 1 right. */
  steer: number;
}

/** How high the floor is at a point, in world units. */
export type Ground = (x: number, z: number) => number;
const flat: Ground = () => 0;

/** World units to a meter, at the size the car's model is drawn. */
export const METER = 32;
/** Hit & Run's gravity, in m/s². It's stronger than Earth's. */
const GRAVITY = 16;

/** The Family Sedan's tuning. */
const MASS = 1500;
const GAS_SCALE = 4.5;
const SLIP_GAS_SCALE = 5.5;
const BRAKE_SCALE = 8;
export const TOP_SPEED_KMH = 120;
const TOP_SPEED = TOP_SPEED_KMH / 3.6;
const MAX_WHEEL_TURN = 30;
const HIGH_SPEED_STEERING_DROP = 0.27;
const TIRE_GRIP = 2.48;
const NORMAL_STEERING = 95;
const SLIP_STEERING = 55;
const SLIP_STEERING_NO_EBRAKE = 50;
const EBRAKE_EFFECT = 0.4;
const SLIP_EFFECT_NO_EBRAKE = 0.15;
const BURNOUT_RANGE = 0.09;
const SUSPENSION_LIMIT = 0.7;
const SPRING_K = 0.3;
const DAMPER_C = 0.15;
export const HIT_POINTS = 3;

/** The engine's: rolling friction, and the handbrake's pull. */
const ROLLING_FRICTION = 2;
const EBRAKE_SCALE = 3;
/** Drag that cancels both rear wheels' push right at top speed. */
const DRAG = (2 * (2 * GAS_SCALE * MASS)) / (TOP_SPEED * TOP_SPEED);
/** The most a tire takes before the car starts to slide, with a quarter of the car's weight on it. */
const MAX_TIRE_FORCE = TIRE_GRIP * MASS * GRAVITY * 0.25;
/** How hard it is to spin, as a solid box the size of the car. */
const INERTIA = (MASS * (2.2 * 2.2 + 5.35 * 5.35)) / 12;

/** The springs: how far each wheel travels, from the wheel's size, and how stiff and damped it is. */
const WHEEL_RADIUS = 0.37;
const TRAVEL = SUSPENSION_LIMIT * WHEEL_RADIUS;
const SPRING = ((MASS * GRAVITY) / TRAVEL) * SPRING_K;
const DAMPER = 2 * Math.sqrt(SPRING * MASS) * DAMPER_C;
/** The weight on each front and rear wheel, resting: more on the front ones, nearer the center of mass. */
const FRONT_LOAD = (MASS * GRAVITY * 2.17) / (2 * (2.17 + 1.12));
const REAR_LOAD = (MASS * GRAVITY * 1.12) / (2 * (2.17 + 1.12));
/** Guesses: how high the center of mass is, and how hard the body is to tip, as a box the car's size. */
const CENTER_HEIGHT = 0.5;
const PITCH_INERTIA = (MASS * (5.35 * 5.35 + 1.4 * 1.4)) / 12;
const ROLL_INERTIA = (MASS * (2.2 * 2.2 + 1.4 * 1.4)) / 12;

/**
 * The wheels, in meters from the center of mass: across, to the right, and
 * along, ahead. From the model, with the center of mass 0.35 m ahead of its
 * middle. The rear ones push, the front ones steer.
 */
export const WHEELS = [
  { across: -0.91, along: -2.17, drive: true },
  { across: 0.91, along: -2.17, drive: true },
  { across: -0.91, along: 1.12, drive: false },
  { across: 0.91, along: 1.12, drive: false },
] as const;
/** How far the center of mass is ahead of the middle of the car's model, in world units. */
export const CENTER_AHEAD = 0.675 * METER;
/** Half the car's body, across and along, in world units, for running into things. */
export const HALF_WIDTH = 1.1 * METER;
export const HALF_LENGTH = 2.675 * METER;

const COS_15 = 0.9659;

export function parkedCar(x: number, z: number, heading = 0): Car {
  return {
    x, z, heading, vx: 0, vz: 0, spin: 0, speed: 0, steer: 0, grip: "normal", driving: false,
    y: 0, vy: 0, pitch: 0, pitchRate: 0, roll: 0, rollRate: 0, wheelY: [0, 0, 0, 0], airborne: false,
    skid: 0, burnout: false, wheelTurn: 0, hitPoints: HIT_POINTS, safe: 0, wrecked: -1, husk: false, gas: false,
  };
}

/** A point on the car, `across` to the right and `along` ahead of its center of mass, in world units. */
export function carPoint(car: Car, across: number, along: number): [number, number] {
  const [sin, cos] = [Math.sin(car.heading), Math.cos(car.heading)];
  return [car.x + along * sin + across * cos, car.z + along * cos - across * sin];
}

/** Moves the car `dt` seconds along, with these controls, on this floor. */
export function driveCar(car: Car, controls: CarControls, dt: number, ground: Ground = flat): void {
  const dead = car.husk || car.wrecked >= 0;
  const gas = controls.gas && !dead ? 1 : 0;
  const brake = controls.brake && !dead ? 1 : 0;
  const eBrake = controls.handbrake || dead ? 1 : 0;
  car.safe = Math.max(0, car.safe - dt);
  const [sin, cos] = [Math.sin(car.heading), Math.cos(car.heading)];
  // In meters: along where it points, and across to its right.
  const [vx, vz] = [car.vx / METER, car.vz / METER];
  const ahead = vx * sin + vz * cos;
  const across = vx * cos - vz * sin;
  const speed = Math.hypot(vx, vz);
  const ofTop = speed / TOP_SPEED;
  const kmh = speed * 3.6;

  // Steering: less of it at speed, and the wheel turns at a rate, slower when slow.
  const wanted = (dead ? 0 : controls.steer) * Math.max(0, (HIGH_SPEED_STEERING_DROP - 1) * ofTop + 1);
  const secondsPerTurn = Math.max(0.15, (1 - (kmh / 90) ** 2) * 0.3);
  const change = dt / secondsPerTurn;
  car.steer += Math.max(-change, Math.min(change, wanted - car.steer));
  const wheelTurn = car.steer * ((kmh < 50 ? MAX_WHEEL_TURN + 10 : MAX_WHEEL_TURN) * Math.PI) / 180;

  // The springs: which wheels touch the floor, and how hard each pushes the body up.
  const springs = suspension(car, ground, dt);

  let [forceAhead, forceAcross, torque] = [0, 0, 0];
  let firstWheel = 0;
  let burnout = 0;
  for (const [i, wheel] of WHEELS.entries()) {
    // Only wheels on the floor push.
    if (springs[i] === 0) continue;
    let [fa, fx] = [0, 0];
    // How this wheel moves: the car's velocity, plus its turning.
    const wheelAhead = ahead - car.spin * wheel.across;
    const wheelAcross = across + car.spin * wheel.along;
    const wheelSpeed = Math.hypot(wheelAhead, wheelAcross) || 1;
    if (wheel.drive) {
      // Gas: a burnout from a standstill pushes less.
      if (gas > 0) {
        if (ofTop < BURNOUT_RANGE) {
          fa += GAS_SCALE * gas * MASS * 0.75;
          burnout = Math.max(burnout, 1 - (0.5 * ofTop) / BURNOUT_RANGE);
        } else fa += (car.grip === "normal" ? GAS_SCALE : SLIP_GAS_SCALE) * gas * MASS;
      }
      // Brake: stops the car, then backs it up.
      if (brake > 0) {
        if (ahead < 0) {
          fa -= GAS_SCALE * brake * MASS;
          if (kmh < 50) burnout = Math.max(burnout, brake);
        } else fa -= (gas > 0.1 ? GAS_SCALE * 0.75 : BRAKE_SCALE + 3) * brake * MASS;
      }
      // The handbrake locks the rear wheels.
      if (eBrake > 0 && !(speed < 0.5)) {
        fa -= (wheelAhead / wheelSpeed) * eBrake * EBRAKE_SCALE * MASS;
        fx -= (wheelAcross / wheelSpeed) * eBrake * EBRAKE_SCALE * MASS;
      }
    }
    // Each tire pushes back against sliding sideways, along its own direction.
    const turn = wheel.drive ? 0 : wheelTurn;
    let sideways = (Math.cos(turn) * wheelAcross - Math.sin(turn) * wheelAhead) / wheelSpeed;
    if (ofTop <= 0.15) sideways *= ofTop / 0.15;
    let resistance = car.grip === "normal" ? NORMAL_STEERING : car.grip === "handbrake" ? SLIP_STEERING : SLIP_STEERING_NO_EBRAKE;
    if (car.grip === "slip") resistance *= wheel.drive ? 1 - SLIP_EFFECT_NO_EBRAKE : 1 + SLIP_EFFECT_NO_EBRAKE;
    // Flooring it while turning at speed loses some grip at the back.
    if (wheel.drive && gas > 0 && ofTop > 0.7 && Math.abs(car.steer) > 0.1 && kmh > 90) resistance *= 1 - 0.2 * gas;
    // The handbrake grips more at the front and less at the back, to swing the back out.
    if (ofTop > 0.02 && eBrake > 0.1) resistance *= wheel.drive ? 1 - EBRAKE_EFFECT : 1 + EBRAKE_EFFECT;
    fx -= MASS * sideways * resistance * 0.25;
    if (i === 0) firstWheel = Math.hypot(fa, fx);
    forceAhead += fa;
    forceAcross += fx;
    torque += wheel.along * fx - wheel.across * fa;
  }
  car.airborne = springs.every((force) => force === 0);

  // Sliding starts when a tire is asked for more than it can give, or with the handbrake.
  if (car.grip === "normal") {
    if (eBrake > 0.1 && ofTop > 0.05) car.grip = "handbrake";
    else if (firstWheel > MAX_TIRE_FORCE) car.grip = "slip";
  } else if ((speed > 0 && ahead / speed > COS_15 && Math.abs(car.steer) < 0.1) || speed < 1 || gas === 0) {
    car.grip = "normal";
  }

  // To the world, with drag and rolling friction against the way it moves.
  let fx = forceAhead * sin + forceAcross * cos;
  let fz = forceAhead * cos - forceAcross * sin;
  if (speed > 1) {
    const drag = speed * speed * 0.5 * DRAG * (gas === 0 && kmh > 50 && brake === 0 ? 0.25 : 1);
    [fx, fz] = [fx - (vx / speed) * drag, fz - (vz / speed) * drag];
  }
  if (speed > 0.05 && gas === 0 && !car.airborne) {
    [fx, fz] = [fx - (vx / speed) * ROLLING_FRICTION * MASS, fz - (vz / speed) * ROLLING_FRICTION * MASS];
  }

  let [nvx, nvz] = [vx + (fx / MASS) * dt, vz + (fz / MASS) * dt];
  car.spin += (torque / INERTIA) * dt;
  // Barely moving and nothing pressed: it settles.
  if (speed < 2 && gas < 0.1 && brake < 0.1 && !car.airborne) {
    if (speed < 0.05) [nvx, nvz, car.spin] = [0, 0, 0];
    else [nvx, nvz, car.spin] = [nvx * 0.6, nvz * 0.6, car.spin * 0.1];
  }
  // The body leans against how the car speeds up and turns.
  const [accelAhead, accelAcross] = [((nvx - vx) * sin + (nvz - vz) * cos) / dt, ((nvx - vx) * cos - (nvz - vz) * sin) / dt];
  if (!car.airborne) {
    car.pitchRate += ((MASS * accelAhead * CENTER_HEIGHT) / PITCH_INERTIA) * dt;
    car.rollRate += ((MASS * accelAcross * CENTER_HEIGHT) / ROLL_INERTIA) * dt;
  }
  car.heading += car.spin * dt;
  [car.vx, car.vz] = [nvx * METER, nvz * METER];
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.speed = car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading);
  car.wheelTurn += (car.airborne && gas > 0 ? TOP_SPEED : ahead) / WHEEL_RADIUS * dt;
  car.gas = gas > 0;
  car.burnout = burnout > 0;
  car.skid = car.airborne ? 0 : skidLevel(car, ofTop, ahead, across, speed, brake, eBrake, burnout);
  if (car.wrecked >= 0) car.wrecked += dt;
}

/**
 * Moves the body on its four springs: up and down, nose up and down, and side
 * to side. Returns how hard each wheel's spring pushes, 0 for wheels off the floor.
 */
function suspension(car: Car, ground: Ground, dt: number): number[] {
  // In meters, and radians.
  let y = car.y / METER;
  let vy = car.vy / METER;
  let [lift, pitchTorque, rollTorque] = [-MASS * GRAVITY, 0, 0];
  const forces = WHEELS.map((wheel, i) => {
    const load = wheel.drive ? REAR_LOAD : FRONT_LOAD;
    // How far the spring stretches from resting to hanging free, with the wheel's weight off it.
    const hang = load / SPRING;
    const [x, z] = carPoint(car, wheel.across * METER, wheel.along * METER);
    const floor = ground(x, z) / METER;
    // How far the body is above resting, over this wheel, and how fast that changes.
    let above = y + wheel.along * car.pitch + wheel.across * car.roll - floor;
    // Bottomed out: the body can't sink any lower over this wheel.
    if (above < -TRAVEL) {
      y += -TRAVEL - above;
      vy = Math.max(vy, 0);
      above = -TRAVEL;
    }
    const rate = vy + wheel.along * car.pitchRate + wheel.across * car.rollRate;
    // Hanging free, the wheel drops away from the floor.
    car.wheelY[i] = Math.max(floor, above + floor - hang) * METER;
    if (above >= hang) return 0;
    // Pushes harder near the bottom of its travel. Damps sinking more than rising, as in the game.
    const spring = load - SPRING * above * (above < -TRAVEL * 0.75 ? 3 : 1);
    const damper = -DAMPER * rate * (rate < 0 ? 1 : 0.3);
    const force = Math.max(1e-6, spring + damper);
    lift += force;
    pitchTorque += force * wheel.along;
    rollTorque += force * wheel.across;
    return force;
  });
  vy += (lift / MASS) * dt;
  y += vy * dt;
  car.pitchRate += (pitchTorque / PITCH_INERTIA) * dt;
  car.rollRate += (rollTorque / ROLL_INERTIA) * dt;
  // In the air, the body slowly rights itself, as the game keeps cars on their wheels.
  if (forces.every((force) => force === 0)) {
    car.pitchRate -= car.pitch * 2 * dt;
    car.rollRate -= car.roll * 2 * dt;
  }
  car.pitch = Math.max(-0.5, Math.min(0.5, car.pitch + car.pitchRate * dt));
  car.roll = Math.max(-0.3, Math.min(0.3, car.roll + car.rollRate * dt));
  [car.y, car.vy] = [y * METER, vy * METER];
  return forces;
}

/** How hard the tires skid, as the game works it out for skid marks and their sound. */
function skidLevel(car: Car, ofTop: number, ahead: number, across: number, speed: number, brake: number, eBrake: number, burnout: number): number {
  let skid = 0;
  if (car.grip !== "normal") {
    skid = speed > 0 ? Math.abs(across) / speed : 0;
    skid = Math.max(skid, eBrake * 0.5);
  }
  if (brake > 0.05 && ofTop > 0.07 && ahead > 0 && ofTop < 0.5) skid = 1;
  if (eBrake > 0.85 && ofTop > 0.07) skid = Math.max(skid, eBrake * 0.5);
  skid = Math.max(skid, burnout);
  return skid > 0 ? Math.max(0.5, Math.min(1, skid)) : 0;
}

/**
 * Hurts the car by `amount` of its hit points, as the game does: a hit that
 * would leave almost nothing leaves it just alive, smoking, and safe for a
 * second; the next one wrecks it. Returns whether this hit wrecked it.
 */
export function damageCar(car: Car, amount: number, hitPoints = HIT_POINTS): boolean {
  if (car.wrecked >= 0 || car.husk || car.safe > 0) return false;
  const life = car.hitPoints / hitPoints;
  if (life > 0.02) {
    const left = Math.max(0, car.hitPoints - amount);
    if (left / hitPoints < 0.02) {
      car.hitPoints = 0.001;
      car.safe = 1;
      return false;
    }
    car.hitPoints = left;
    return false;
  }
  car.hitPoints = 0;
  car.wrecked = 0;
  return true;
}

/** How hurt the car is, 0 to 1. */
export function carDamage(car: Car, hitPoints = HIT_POINTS): number {
  return 1 - car.hitPoints / hitPoints;
}

/** A crash: how hard, in newton seconds, and where, in world units. */
export interface Crash {
  impulse: number;
  x: number;
  z: number;
}

/** Hit & Run's measure of a crash: 100000 newton seconds is as hard as it gets. Under 6% of that does no damage. */
export function crashDamage(impulse: number): number {
  const normalized = Math.min(1, impulse / 100000);
  return normalized < 0.06 ? 0 : normalized;
}

/** Guesses: how bouncy crashes are, and how much things scrape along each other. */
const RESTITUTION = 0.25;
const FRICTION = 0.4;

/** The car's corners, in world units. */
export function carCorners(car: Car): [number, number][] {
  const back = -CENTER_AHEAD - HALF_LENGTH;
  const front = -CENTER_AHEAD + HALF_LENGTH;
  return [carPoint(car, -HALF_WIDTH, back), carPoint(car, HALF_WIDTH, back), carPoint(car, HALF_WIDTH, front), carPoint(car, -HALF_WIDTH, front)];
}

/** Pushes the car out of a round thing it ran into, at `x`, `z`, as wide as `r`. Returns the crash, if they touched. */
export function crashIntoRound(car: Car, x: number, z: number, r: number): Crash | null {
  // The point on the car's box closest to the middle of the round thing.
  const [sin, cos] = [Math.sin(car.heading), Math.cos(car.heading)];
  const [dx, dz] = [x - car.x, z - car.z];
  const along = dx * sin + dz * cos + CENTER_AHEAD;
  const across = dx * cos - dz * sin;
  const [ca, cl] = [Math.max(-HALF_WIDTH, Math.min(HALF_WIDTH, across)), Math.max(-HALF_LENGTH, Math.min(HALF_LENGTH, along))];
  const [px, pz] = carPoint(car, ca, cl - CENTER_AHEAD);
  let [nx, nz] = [px - x, pz - z];
  let distance = Math.hypot(nx, nz);
  if (distance >= r) return null;
  if (distance < 1e-6) {
    // Its middle is inside the car: out the nearest side.
    const sideways = HALF_WIDTH - Math.abs(across) < HALF_LENGTH - Math.abs(along);
    [nx, nz] = sideways ? [-Math.sign(across || 1) * cos, Math.sign(across || 1) * sin] : [-Math.sign(along || 1) * sin, -Math.sign(along || 1) * cos];
    distance = 0;
  } else [nx, nz] = [nx / distance, nz / distance];
  const push = r - distance;
  car.x += nx * push;
  car.z += nz * push;
  const impulse = bounce(car, null, px, pz, nx, nz);
  return { impulse, x: px, z: pz };
}

/** Pushes the car out of a box, `half` wide and long, turned to `heading`. Returns the crash, if they touched. */
export function crashIntoBox(car: Car, box: { x: number; z: number; heading: number; halfWidth: number; halfLength: number }): Crash | null {
  const other = { x: box.x, z: box.z, heading: box.heading, halfWidth: box.halfWidth, halfLength: box.halfLength };
  const hit = overlap(boxOf(car), other);
  if (!hit) return null;
  car.x += hit.nx * hit.depth;
  car.z += hit.nz * hit.depth;
  const impulse = bounce(car, null, hit.x, hit.z, hit.nx, hit.nz);
  return { impulse, x: hit.x, z: hit.z };
}

/** Two cars running into each other: pushed apart, bouncing off and spinning. Returns the crash, if they touched. */
export function crashCars(a: Car, b: Car): Crash | null {
  // One flying over the other misses.
  if (Math.abs(a.y - b.y) > 1.4 * METER) return null;
  const hit = overlap(boxOf(a), boxOf(b));
  if (!hit) return null;
  a.x += (hit.nx * hit.depth) / 2;
  a.z += (hit.nz * hit.depth) / 2;
  b.x -= (hit.nx * hit.depth) / 2;
  b.z -= (hit.nz * hit.depth) / 2;
  const impulse = bounce(a, b, hit.x, hit.z, hit.nx, hit.nz);
  return { impulse, x: hit.x, z: hit.z };
}

interface Box {
  x: number;
  z: number;
  heading: number;
  halfWidth: number;
  halfLength: number;
}

function boxOf(car: Car): Box {
  const [x, z] = carPoint(car, 0, -CENTER_AHEAD);
  return { x, z, heading: car.heading, halfWidth: HALF_WIDTH, halfLength: HALF_LENGTH };
}

function boxCorners(box: Box): [number, number][] {
  const [sin, cos] = [Math.sin(box.heading), Math.cos(box.heading)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, l]) => {
    const [across, along] = [a! * box.halfWidth, l! * box.halfLength];
    return [box.x + along * sin + across * cos, box.z + along * cos - across * sin];
  });
}

function inside(box: Box, [x, z]: [number, number]): boolean {
  const [sin, cos] = [Math.sin(box.heading), Math.cos(box.heading)];
  const [dx, dz] = [x - box.x, z - box.z];
  return Math.abs(dx * cos - dz * sin) <= box.halfWidth && Math.abs(dx * sin + dz * cos) <= box.halfLength;
}

/**
 * Whether two boxes overlap, by their sides: the way to push `a` out of `b`
 * the shortest, how far, and where they touch.
 */
function overlap(a: Box, b: Box): { nx: number; nz: number; depth: number; x: number; z: number } | null {
  const [ca, cb] = [boxCorners(a), boxCorners(b)];
  let best: { nx: number; nz: number; depth: number } | null = null;
  for (const heading of [a.heading, b.heading]) {
    for (const [nx, nz] of [[Math.cos(heading), -Math.sin(heading)], [Math.sin(heading), Math.cos(heading)]] as const) {
      const project = (corners: [number, number][]) => corners.map(([x, z]) => x * nx + z * nz);
      const [pa, pb] = [project(ca), project(cb)];
      const [minA, maxA, minB, maxB] = [Math.min(...pa), Math.max(...pa), Math.min(...pb), Math.max(...pb)];
      const depth = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (depth <= 0) return null;
      if (!best || depth < best.depth) {
        // Point it from b to a.
        const side = (a.x - b.x) * nx + (a.z - b.z) * nz < 0 ? -1 : 1;
        best = { nx: nx * side, nz: nz * side, depth };
      }
    }
  }
  const touching = [...ca.filter((p) => inside(b, p)), ...cb.filter((p) => inside(a, p))];
  const [x, z] = touching.length > 0
    ? [touching.reduce((s, p) => s + p[0], 0) / touching.length, touching.reduce((s, p) => s + p[1], 0) / touching.length]
    : [(a.x + b.x) / 2, (a.z + b.z) / 2];
  return { ...best!, x, z };
}

/**
 * Bounces `a` off `b`, or off something that doesn't move, where they touch
 * at `x`, `z`, pushed along `nx`, `nz`: they spin depending on where they're
 * hit. Returns the impulse, in newton seconds.
 */
function bounce(a: Car, b: Car | null, x: number, z: number, nx: number, nz: number): number {
  // In meters, from each center of mass to where they touch.
  const [ax, az] = [(x - a.x) / METER, (z - a.z) / METER];
  const [bx, bz] = b ? [(x - b.x) / METER, (z - b.z) / METER] : [0, 0];
  const pointVelocity = (car: Car | null, rx: number, rz: number): [number, number] =>
    car ? [car.vx / METER + car.spin * rz, car.vz / METER - car.spin * rx] : [0, 0];
  const [va, vb] = [pointVelocity(a, ax, az), pointVelocity(b, bx, bz)];
  const [rvx, rvz] = [va[0] - vb[0], va[1] - vb[1]];
  const closing = rvx * nx + rvz * nz;
  if (closing >= 0) return 0;
  const turnA = az * nx - ax * nz;
  const turnB = bz * nx - bx * nz;
  const weight = 1 / MASS + (turnA * turnA) / INERTIA + (b ? 1 / MASS + (turnB * turnB) / INERTIA : 0);
  const j = (-(1 + RESTITUTION) * closing) / weight;
  // Scraping along each other.
  let [tx, tz] = [rvx - closing * nx, rvz - closing * nz];
  const slide = Math.hypot(tx, tz);
  let jt = 0;
  if (slide > 1e-6) {
    [tx, tz] = [tx / slide, tz / slide];
    const tA = az * tx - ax * tz;
    const tB = bz * tx - bx * tz;
    const tWeight = 1 / MASS + (tA * tA) / INERTIA + (b ? 1 / MASS + (tB * tB) / INERTIA : 0);
    jt = -Math.min(slide / tWeight, FRICTION * j);
  }
  const [ix, iz] = [j * nx + jt * tx, j * nz + jt * tz];
  const push = (car: Car, rx: number, rz: number, sign: number) => {
    car.vx += ((sign * ix) / MASS) * METER;
    car.vz += ((sign * iz) / MASS) * METER;
    car.spin += (sign * (rz * ix - rx * iz)) / INERTIA;
    car.speed = car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading);
  };
  push(a, ax, az, 1);
  if (b) push(b, bx, bz, -1);
  return Math.hypot(ix, iz);
}
