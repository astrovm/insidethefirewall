// The balls in the 3D world roll and bounce. The player pushes them walking
// and kicks them, cars knock them flying, and they bounce off the floor, the
// other shapes, the ramps' walls and each other, and roll down the ramps.

import { CENTER_AHEAD, HALF_LENGTH, HALF_WIDTH, METER, type Car } from "./car.ts";

type Vec = [number, number, number];

export interface Ball {
  id: string;
  /** Where its bottom is: `y` is the height of what it rests on. */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  color: [number, number, number];
  /** A spot on it, as a way out from its middle, turning as it rolls. */
  spot: Vec;
  /** Lying still, so it isn't moved until something hits it. */
  asleep: boolean;
}

/** Something round a ball bumps off: `top` high. */
export interface Round {
  x: number;
  z: number;
  r: number;
  top: number;
}

/** How high the floor is at `x`, `z`, for something with its bottom at `y`: the ground, a ramp or a shape's top. */
export type Floor = (x: number, z: number, y: number) => number;

const GRAVITY = 16 * METER;
/** How much of its speed a ball keeps bouncing off the floor, and off things. */
const FLOOR_BOUNCE = 0.6;
const WALL_BOUNCE = 0.7;
const BALL_BOUNCE = 0.8;
/** Bounces slower than this, it stops bouncing and rolls. */
const SETTLE = 1 * METER;
/** Rolling slows it this much a second, and by this part of its speed a second. */
const ROLL_FRICTION = 1 * METER;
const ROLL_DRAG = 0.8;
/** Slower than this on flat floor, it stops. */
const STOP = 0.05 * METER;
/** It rolls up floor this much higher in a step, and floor higher than that is a wall. */
const STEP = 0.35 * METER;
/** Walked into, it rolls this much faster than the player. */
const DRIBBLE = 1.4;
/** Kicked, it flies off this fast, and up. */
export const KICK_SPEED = 14 * METER;
const KICK_UP = 5 * METER;

/** A ball resting where a made-up sphere stands. */
export function restingBall(id: string, x: number, z: number, r: number, color: [number, number, number]): Ball {
  return { id, x, y: 0, z, vx: 0, vy: 0, vz: 0, r, color, spot: [0, 0.6, 0.8], asleep: true };
}

/**
 * Moves a ball for `dt` seconds: falling and bouncing, rolling and slowing
 * down, down slopes, off the ramps' walls and the shapes. Says how hard it
 * bounced, in world units a second, or 0.
 */
export function moveBall(ball: Ball, dt: number, floor: Floor, shapes: readonly Round[]): number {
  if (ball.asleep) return 0;
  let bounce = 0;
  // How steep the floor is, up toward +x and +z, either side. A step up or down, off a ramp's end or a shape's edge, isn't a slope.
  const e = 4;
  const here = floor(ball.x, ball.z, ball.y);
  const steep = (dx: number, dz: number) => {
    const rises = [floor(ball.x + dx, ball.z + dz, ball.y) - here, here - floor(ball.x - dx, ball.z - dz, ball.y)].filter((rise) => Math.abs(rise) <= STEP / 2);
    return rises.length === 0 ? 0 : rises.reduce((a, b) => a + b, 0) / rises.length / e;
  };
  const slope = [steep(e, 0), steep(0, e)] as const;
  const resting = ball.vy === 0 && ball.y <= here + 1e-6;
  if (resting) {
    // Down the slope, as fast as a rolling ball goes: 5/7 of sliding.
    ball.vx -= (5 / 7) * GRAVITY * slope[0] * dt;
    ball.vz -= (5 / 7) * GRAVITY * slope[1] * dt;
    const speed = Math.hypot(ball.vx, ball.vz);
    const slower = Math.max(0, speed - ROLL_FRICTION * dt) * Math.exp(-ROLL_DRAG * dt);
    const flat = Math.abs(slope[0]) + Math.abs(slope[1]) < 0.01;
    if (flat && slower < STOP) {
      [ball.vx, ball.vz, ball.asleep] = [0, 0, true];
      return 0;
    }
    if (speed > 0) [ball.vx, ball.vz] = [(ball.vx / speed) * slower, (ball.vz / speed) * slower];
  } else ball.vy -= GRAVITY * dt;

  let [x, z] = [ball.x + ball.vx * dt, ball.z + ball.vz * dt];
  // A ramp's wall, round its middle and edges.
  const wall = (x: number, z: number) => inWall(ball, x, z, floor);
  if (wall(x, z)) {
    if (!wall(x, ball.z)) {
      bounce = Math.max(bounce, Math.abs(ball.vz));
      [z, ball.vz] = [ball.z, -ball.vz * WALL_BOUNCE];
    } else if (!wall(ball.x, z)) {
      bounce = Math.max(bounce, Math.abs(ball.vx));
      [x, ball.vx] = [ball.x, -ball.vx * WALL_BOUNCE];
    } else {
      bounce = Math.max(bounce, Math.hypot(ball.vx, ball.vz));
      [x, z, ball.vx, ball.vz] = [ball.x, ball.z, -ball.vx * WALL_BOUNCE, -ball.vz * WALL_BOUNCE];
    }
  }
  // Off the sides of the shapes it's lower than the top of.
  for (const shape of shapes) {
    if (ball.y >= shape.top - 1e-6) continue;
    const [dx, dz] = [x - shape.x, z - shape.z];
    const [distance, reach] = [Math.hypot(dx, dz), shape.r + ball.r];
    if (distance >= reach) continue;
    const [nx, nz] = distance > 0 ? [dx / distance, dz / distance] : [0, -1];
    [x, z] = [shape.x + nx * reach, shape.z + nz * reach];
    const toward = ball.vx * nx + ball.vz * nz;
    if (toward < 0) {
      bounce = Math.max(bounce, -toward);
      ball.vx -= (1 + WALL_BOUNCE) * toward * nx;
      ball.vz -= (1 + WALL_BOUNCE) * toward * nz;
    }
  }
  roll(ball, x - ball.x, z - ball.z);
  [ball.x, ball.z] = [x, z];

  const under = floor(x, z, ball.y);
  if (resting) {
    // Along the floor, up and down slopes. Off the top of a ramp, or an edge, it flies on as it went.
    if (under >= ball.y - STEP) ball.y = under;
    else ball.vy = slope[0] * ball.vx + slope[1] * ball.vz;
    return bounce;
  }
  ball.y += ball.vy * dt;
  if (ball.y <= under) {
    ball.y = under;
    if (-ball.vy > SETTLE) {
      bounce = Math.max(bounce, -ball.vy);
      ball.vy = -ball.vy * FLOOR_BOUNCE;
    } else ball.vy = 0;
  }
  return bounce;
}

/** Whether a ball at `x`, `z` would be in a ramp's wall: floor higher than it rolls up, round its middle and edges. */
function inWall(ball: Ball, x: number, z: number, floor: Floor): boolean {
  const edge = ball.r * 0.7;
  return [[0, 0], [edge, 0], [-edge, 0], [0, edge], [0, -edge]].some(([dx, dz]) => floor(x + dx!, z + dz!, ball.y) > ball.y + STEP);
}

/** Whether a ball is stuck in a ramp's wall or the side of a shape, so it can't be pushed there. */
export function ballStuck(ball: Ball, floor: Floor, shapes: readonly Round[]): boolean {
  if (inWall(ball, ball.x, ball.z, floor)) return true;
  return shapes.some((shape) => ball.y < shape.top - 1e-6 && Math.hypot(ball.x - shape.x, ball.z - shape.z) < shape.r + ball.r - 1e-6);
}

/** Turns the spot as the ball rolls `dx`, `dz` along the floor. */
function roll(ball: Ball, dx: number, dz: number): void {
  const distance = Math.hypot(dx, dz);
  if (distance === 0) return;
  // Rolling forward turns it round the axis across the way it goes.
  const [kx, kz] = [dz / distance, -dx / distance];
  const angle = distance / ball.r;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const [sx, sy, sz] = ball.spot;
  const dot = kx * sx + kz * sz;
  // Rodrigues' rotation: the axis is (kx, 0, kz).
  ball.spot = [sx * cos - kz * sy * sin + kx * dot * (1 - cos), sy * cos + (kz * sx - kx * sz) * sin, sz * cos + kx * sy * sin + kz * dot * (1 - cos)];
}

/** Wakes a ball up, to move from now on. */
function wake(ball: Ball): void {
  ball.asleep = false;
}

/**
 * Something round, `radius` wide and from `bottom` to `top` high, moving at
 * `vx`, `vz`, walking into a ball: the ball gets out of its way, rolling on
 * a little faster. Says whether they touched.
 */
export function pushBall(ball: Ball, x: number, z: number, vx: number, vz: number, radius: number, bottom: number, top: number): boolean {
  if (ball.y > top || ball.y + 2 * ball.r < bottom) return false;
  const [dx, dz] = [ball.x - x, ball.z - z];
  const [distance, reach] = [Math.hypot(dx, dz), ball.r + radius];
  if (distance >= reach) return false;
  const [nx, nz] = distance > 0 ? [dx / distance, dz / distance] : [0, 1];
  [ball.x, ball.z] = [x + nx * reach, z + nz * reach];
  const [pushing, going] = [vx * nx + vz * nz, ball.vx * nx + ball.vz * nz];
  if (going < pushing * DRIBBLE) {
    ball.vx += (pushing * DRIBBLE - going) * nx;
    ball.vz += (pushing * DRIBBLE - going) * nz;
  }
  wake(ball);
  return true;
}

/** A kick from a foot at `foot`, facing `facing`, reaching `reach`: the ball flies off that way, and up. Says whether it reached. */
export function kickBall(ball: Ball, foot: Vec, facing: number, reach: number): boolean {
  if (Math.hypot(ball.x - foot[0], ball.y + ball.r - foot[1], ball.z - foot[2]) > reach + ball.r * 0.5) return false;
  const [sin, cos] = [Math.sin(facing), Math.cos(facing)];
  // Once a kick: kicked already, it's going that way.
  if (ball.vx * sin + ball.vz * cos >= KICK_SPEED * 0.9) return false;
  [ball.vx, ball.vy, ball.vz] = [sin * KICK_SPEED, KICK_UP, cos * KICK_SPEED];
  wake(ball);
  return true;
}

/** A car, `height` tall, running into a ball, which bounces off it, and up. Says how hard, or 0 if they didn't touch. */
export function carHitsBall(car: Car, ball: Ball, height: number): number {
  if (ball.y > car.y + height || ball.y + 2 * ball.r < car.y) return 0;
  const [sin, cos] = [Math.sin(car.heading), Math.cos(car.heading)];
  const [dx, dz] = [ball.x - car.x, ball.z - car.z];
  const across = dx * cos - dz * sin;
  const along = dx * sin + dz * cos + CENTER_AHEAD;
  // The nearest point of the car's box.
  const [nearAcross, nearAlong] = [Math.max(-HALF_WIDTH, Math.min(HALF_WIDTH, across)), Math.max(-HALF_LENGTH, Math.min(HALF_LENGTH, along))];
  let [outAcross, outAlong] = [across - nearAcross, along - nearAlong];
  let distance = Math.hypot(outAcross, outAlong);
  if (distance >= ball.r) return 0;
  let push = ball.r - distance;
  if (distance === 0) {
    // Its middle is inside: out the nearest side.
    const [toSide, toEnd] = [HALF_WIDTH - Math.abs(across), HALF_LENGTH - Math.abs(along)];
    [outAcross, outAlong] = toSide < toEnd ? [Math.sign(across) || 1, 0] : [0, Math.sign(along) || 1];
    [distance, push] = [1, ball.r + Math.min(toSide, toEnd)];
  }
  const [na, nl] = [outAcross / distance, outAlong / distance];
  const [nx, nz] = [na * cos + nl * sin, -na * sin + nl * cos];
  [ball.x, ball.z] = [ball.x + nx * push, ball.z + nz * push];
  const toward = (ball.vx - car.vx) * nx + (ball.vz - car.vz) * nz;
  wake(ball);
  if (toward >= 0) return 0;
  ball.vx -= (1 + BALL_BOUNCE) * toward * nx;
  ball.vz -= (1 + BALL_BOUNCE) * toward * nz;
  ball.vy = Math.max(ball.vy, -toward * 0.35);
  return -toward;
}

/** Two balls running into each other, bouncing apart as heavy as they are big. Says how hard, or 0 if they didn't touch. */
export function collideBalls(a: Ball, b: Ball): number {
  const [dx, dy, dz] = [b.x - a.x, b.y + b.r - a.y - a.r, b.z - a.z];
  const [distance, reach] = [Math.hypot(dx, dy, dz), a.r + b.r];
  if (distance >= reach || distance === 0) return 0;
  const n = [dx / distance, dy / distance, dz / distance] as const;
  const [ma, mb] = [a.r ** 3, b.r ** 3];
  // Apart, the lighter one more, but not into the floor.
  const overlap = reach - distance;
  const [pa, pb] = [(overlap * mb) / (ma + mb), (overlap * ma) / (ma + mb)];
  [a.x, a.z, b.x, b.z] = [a.x - n[0] * pa, a.z - n[2] * pa, b.x + n[0] * pb, b.z + n[2] * pb];
  wake(a);
  wake(b);
  const toward = (b.vx - a.vx) * n[0] + (b.vy - a.vy) * n[1] + (b.vz - a.vz) * n[2];
  if (toward >= 0) return 0;
  const impulse = (-(1 + BALL_BOUNCE) * toward) / (1 / ma + 1 / mb);
  [a.vx, a.vy, a.vz] = [a.vx - (impulse / ma) * n[0], a.vy - (impulse / ma) * n[1], a.vz - (impulse / ma) * n[2]];
  [b.vx, b.vy, b.vz] = [b.vx + (impulse / mb) * n[0], b.vy + (impulse / mb) * n[1], b.vz + (impulse / mb) * n[2]];
  return -toward;
}

/** Whether a point is inside a ball. */
export function hitBall(ball: Ball, x: number, y: number, z: number): boolean {
  return Math.hypot(ball.x - x, ball.y + ball.r - y, ball.z - z) < ball.r;
}

/** Gives a ball a nudge. */
export function nudgeBall(ball: Ball, vx: number, vy: number, vz: number): void {
  [ball.vx, ball.vy, ball.vz] = [ball.vx + vx, ball.vy + vy, ball.vz + vz];
  wake(ball);
}
