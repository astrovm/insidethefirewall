// Homer's car drives with The Simpsons: Hit & Run's own car physics, ported
// from the game's source code (game/code/worldsim/redbrick) to a flat floor:
// the rear wheels push, the front ones steer, and each tire pushes back
// against sliding sideways until the car loses grip and slides. The numbers
// are the Family Sedan's, from its famil_v.con, and the engine's own.

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
}

export interface CarControls {
  gas: boolean;
  brake: boolean;
  handbrake: boolean;
  /** -1 left, 1 right. */
  steer: number;
}

/** World units to a meter, at the size the car's model is drawn. */
export const METER = 32;
/** Hit & Run's gravity, in m/s². It's stronger than Earth's. */
const GRAVITY = 16;

/** The Family Sedan's tuning, from famil_v.con. */
const MASS = 1500;
const GAS_SCALE = 4.5;
const SLIP_GAS_SCALE = 5.5;
const BRAKE_SCALE = 8;
const TOP_SPEED = 120 / 3.6;
const MAX_WHEEL_TURN = 30;
const HIGH_SPEED_STEERING_DROP = 0.27;
const TIRE_GRIP = 2.48;
const NORMAL_STEERING = 95;
const SLIP_STEERING = 55;
const SLIP_STEERING_NO_EBRAKE = 50;
const EBRAKE_EFFECT = 0.4;
const SLIP_EFFECT_NO_EBRAKE = 0.15;
const BURNOUT_RANGE = 0.09;

/** The engine's: rolling friction, and the handbrake's pull. */
const ROLLING_FRICTION = 2;
const EBRAKE_SCALE = 3;
/** Drag that cancels both rear wheels' push right at top speed. */
const DRAG = (2 * (2 * GAS_SCALE * MASS)) / (TOP_SPEED * TOP_SPEED);
/** The most a tire takes before the car starts to slide, with a quarter of the car's weight on it. */
const MAX_TIRE_FORCE = TIRE_GRIP * MASS * GRAVITY * 0.25;
/** How hard it is to spin, as a solid box the size of the car. */
const INERTIA = (MASS * (2.2 * 2.2 + 5.35 * 5.35)) / 12;

/**
 * The wheels, in meters from the center of mass: across, to the right, and
 * along, ahead. From the model, with the center of mass 0.35 m ahead of its
 * middle, as famil_v.con says. The rear ones push, the front ones steer.
 */
const WHEELS = [
  { across: -0.91, along: -2.17, drive: true },
  { across: 0.91, along: -2.17, drive: true },
  { across: -0.91, along: 1.12, drive: false },
  { across: 0.91, along: 1.12, drive: false },
] as const;
/** How far the center of mass is ahead of the middle of the car's model, in world units. */
export const CENTER_AHEAD = 0.675 * METER;

const COS_15 = 0.9659;

export function parkedCar(x: number, z: number, heading = 0): Car {
  return { x, z, heading, vx: 0, vz: 0, spin: 0, speed: 0, steer: 0, grip: "normal", driving: false };
}

/** Moves the car `dt` seconds along, with these controls. */
export function driveCar(car: Car, controls: CarControls, dt: number): void {
  const gas = controls.gas ? 1 : 0;
  const brake = controls.brake ? 1 : 0;
  const eBrake = controls.handbrake ? 1 : 0;
  const [sin, cos] = [Math.sin(car.heading), Math.cos(car.heading)];
  // In meters: along where it points, and across to its right.
  const [vx, vz] = [car.vx / METER, car.vz / METER];
  const ahead = vx * sin + vz * cos;
  const across = vx * cos - vz * sin;
  const speed = Math.hypot(vx, vz);
  const ofTop = speed / TOP_SPEED;
  const kmh = speed * 3.6;

  // Steering: less of it at speed, and the wheel turns at a rate, slower when slow.
  const wanted = controls.steer * Math.max(0, (HIGH_SPEED_STEERING_DROP - 1) * ofTop + 1);
  const secondsPerTurn = Math.max(0.15, (1 - (kmh / 90) ** 2) * 0.3);
  const change = dt / secondsPerTurn;
  car.steer += Math.max(-change, Math.min(change, wanted - car.steer));
  const wheelTurn = car.steer * ((kmh < 50 ? MAX_WHEEL_TURN + 10 : MAX_WHEEL_TURN) * Math.PI) / 180;

  let [forceAhead, forceAcross, torque] = [0, 0, 0];
  let firstWheel = 0;
  for (const [i, wheel] of WHEELS.entries()) {
    let [fa, fx] = [0, 0];
    // How this wheel moves: the car's velocity, plus its turning.
    const wheelAhead = ahead - car.spin * wheel.across;
    const wheelAcross = across + car.spin * wheel.along;
    const wheelSpeed = Math.hypot(wheelAhead, wheelAcross) || 1;
    if (wheel.drive) {
      // Gas: a burnout from a standstill pushes less.
      if (gas > 0) {
        if (ofTop < BURNOUT_RANGE) fa += GAS_SCALE * gas * MASS * 0.75;
        else fa += (car.grip === "normal" ? GAS_SCALE : SLIP_GAS_SCALE) * gas * MASS;
      }
      // Brake: stops the car, then backs it up.
      if (brake > 0) {
        if (ahead < 0) fa -= GAS_SCALE * brake * MASS;
        else fa -= (gas > 0.1 ? GAS_SCALE * 0.75 : BRAKE_SCALE + 3) * brake * MASS;
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

  // Sliding starts when a tire is asked for more than it can give, or with the handbrake.
  if (car.grip === "normal") {
    if (eBrake > 0.1 && ofTop > 0.05) car.grip = "handbrake";
    else if (firstWheel > MAX_TIRE_FORCE) car.grip = "slip";
  } else if ((speed > 0 && ahead / speed > COS_15 && Math.abs(car.steer) < 0.1) || speed < 1 || gas === 0) {
    car.grip = "normal";
  }

  // To the world, with drag and rolling friction against the way it moves.
  let fx = (forceAhead * sin + forceAcross * cos);
  let fz = (forceAhead * cos - forceAcross * sin);
  if (speed > 1) {
    const drag = speed * speed * 0.5 * DRAG * (gas === 0 && kmh > 50 && brake === 0 ? 0.25 : 1);
    [fx, fz] = [fx - (vx / speed) * drag, fz - (vz / speed) * drag];
  }
  if (speed > 0.05 && gas === 0) [fx, fz] = [fx - (vx / speed) * ROLLING_FRICTION * MASS, fz - (vz / speed) * ROLLING_FRICTION * MASS];

  let [nvx, nvz] = [vx + (fx / MASS) * dt, vz + (fz / MASS) * dt];
  car.spin += (torque / INERTIA) * dt;
  // Barely moving and nothing pressed: it settles.
  if (speed < 2 && gas < 0.1 && brake < 0.1) {
    if (speed < 0.05) [nvx, nvz, car.spin] = [0, 0, 0];
    else [nvx, nvz, car.spin] = [nvx * 0.6, nvz * 0.6, car.spin * 0.1];
  }
  car.heading += car.spin * dt;
  [car.vx, car.vz] = [nvx * METER, nvz * METER];
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.speed = car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading);
}

/** Pushes the car out of something round it ran into, bouncing off a little. Returns how hard it hit, in world units a second. */
export function bounceCar(car: Car, x: number, z: number, reach: number): number {
  const [dx, dz] = [car.x - x, car.z - z];
  const distance = Math.hypot(dx, dz);
  if (distance >= reach) return 0;
  const [nx, nz] = distance > 0 ? [dx / distance, dz / distance] : [0, -1];
  [car.x, car.z] = [x + nx * reach, z + nz * reach];
  const into = car.vx * nx + car.vz * nz;
  if (into >= 0) return 0;
  // Bounce back with a third of the speed it hit with, and lose some spin.
  [car.vx, car.vz] = [car.vx - 1.3 * into * nx, car.vz - 1.3 * into * nz];
  car.spin *= 0.5;
  car.speed = car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading);
  return -into;
}
