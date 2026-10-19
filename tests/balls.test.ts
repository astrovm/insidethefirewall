import { describe, expect, test } from "bun:test";
import { ballStuck, carHitsBall, collideBalls, kickBall, KICK_SPEED, moveBall, pushBall, restingBall, type Ball, type Floor, type Round } from "../src/remaster/balls.ts";
import { CENTER_AHEAD, HALF_LENGTH, HALF_WIDTH, METER, parkedCar } from "../src/remaster/car.ts";

const DT = 1 / 120;
const flat: Floor = () => 0;
const ball = (x = 0, z = 0, r = 30): Ball => restingBall("test", x, z, r, [200, 40, 40]);
/** Moves `b` for `seconds`, and gives the bounces, as how hard. */
function roll(b: Ball, seconds: number, floor: Floor = flat, shapes: Round[] = []): number[] {
  const bounces: number[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const bounce = moveBall(b, DT, floor, shapes);
    if (bounce > 0) bounces.push(bounce);
  }
  return bounces;
}
const length = ([x, y, z]: [number, number, number]) => Math.hypot(x, y, z);

describe("balls", () => {
  test("a ball lying still stays put", () => {
    const b = ball();
    expect(roll(b, 1)).toEqual([]);
    expect(b).toMatchObject({ x: 0, y: 0, z: 0, asleep: true });
  });

  test("a dropped ball bounces lower each time, then rests on the floor", () => {
    const b = { ...ball(), y: 3 * METER, asleep: false };
    const bounces = roll(b, 4);
    expect(bounces.length).toBeGreaterThan(2);
    for (let i = 1; i < bounces.length; i++) expect(bounces[i]!).toBeLessThan(bounces[i - 1]!);
    // Falling 3 m: about 9.8 m/s at 16 m/s².
    expect(bounces[0]! / METER).toBeCloseTo(Math.sqrt(2 * 16 * 3), 0);
    expect([b.y, b.vy]).toEqual([0, 0]);
  });

  test("a rolling ball slows down, stops and goes to sleep, its spot turning as it rolls", () => {
    const b = { ...ball(), vx: 6 * METER, asleep: false };
    const spot = b.spot;
    roll(b, 0.1);
    expect(b.x).toBeGreaterThan(0);
    expect(b.spot).not.toEqual(spot);
    expect(length(b.spot)).toBeCloseTo(1, 9);
    roll(b, 10);
    expect(b.asleep).toBe(true);
    expect([b.vx, b.vz]).toEqual([0, 0]);
    // A few meters on, not forever.
    expect(b.x / METER).toBeGreaterThan(3);
    expect(b.x / METER).toBeLessThan(15);
  });

  test("a ball rolling forward turns its spot forward, down its front", () => {
    const b = { ...ball(), spot: [0, 1, 0] as [number, number, number], vz: 1 * METER, asleep: false };
    roll(b, DT * 2);
    // From the top, toward +z.
    expect(b.spot[2]).toBeGreaterThan(0);
    expect(Math.abs(b.spot[0])).toBeLessThan(1e-9);
  });

  test("a ball bounces off the side of a shape it's lower than, and rolls over one it's above", () => {
    const shape: Round = { x: 0, z: 200, r: 50, top: 70 };
    const b = { ...ball(0, 0), vz: 8 * METER, asleep: false };
    const bounces = roll(b, 1, flat, [shape]);
    expect(bounces.length).toBeGreaterThan(0);
    expect(b.vz).toBeLessThan(0);
    expect(Math.hypot(b.x - shape.x, b.z - shape.z)).toBeGreaterThanOrEqual(shape.r + b.r - 1e-6);
    // Up on a box's top, it rolls off it.
    const over = { ...ball(0, 200), y: 70, vz: 4 * METER, asleep: false };
    const onTop: Floor = (x, z, y) => (Math.hypot(x, z - 200) < 50 && y >= 70 - 0.35 * METER ? 70 : 0);
    roll(over, 4, onTop, [shape]);
    expect(over.z).toBeGreaterThan(250);
    expect(over.y).toBe(0);
  });

  test("a ball rolls down a slope, and bounces back off a wall", () => {
    // Rising 1 in 4 toward +z, up to a wall at z 300.
    const slope: Floor = (_x, z) => (z > 300 ? 200 : Math.max(0, z / 4));
    const b = { ...ball(0, 200), y: 50, asleep: false };
    roll(b, 0.5, slope);
    expect(b.vz).toBeLessThan(0);
    expect(b.z).toBeLessThan(200);
    const toWall = { ...ball(0, 250, 20), y: 0, vz: 20 * METER, asleep: false };
    const wall: Floor = (_x, z) => (z > 300 ? 200 : 0);
    roll(toWall, 0.3, wall);
    expect(toWall.vz).toBeLessThan(0);
    expect(toWall.z).toBeLessThan(300);
  });

  test("off the top of a ramp, a rolling ball flies on", () => {
    const ramp: Floor = (_x, z) => (z >= 0 && z <= 400 ? z * 0.28 : 0);
    const b = { ...ball(0, 300), y: 300 * 0.28, vz: 10 * METER, asleep: false };
    let highest = 0;
    for (let t = 0; t < 0.5; t += DT) {
      moveBall(b, DT, ramp, []);
      if (b.z > 400) highest = Math.max(highest, b.y);
    }
    expect(highest).toBeGreaterThan(400 * 0.28);
  });

  test("walked into, a ball rolls away ahead, faster than the walker", () => {
    const b = ball(0, 40);
    expect(pushBall(b, 0, 0, 0, 300, 13, 0, 58)).toBe(true);
    expect(b.asleep).toBe(false);
    expect(b.z).toBeCloseTo(43, 9);
    expect(b.vz).toBeGreaterThan(300);
    // Too far, or jumped over, it isn't touched.
    expect(pushBall(ball(0, 100), 0, 0, 0, 300, 13, 0, 58)).toBe(false);
    expect(pushBall(ball(0, 40), 0, 0, 0, 300, 13, 61, 119)).toBe(false);
  });

  test("a kick sends a ball flying the way the player faces, once", () => {
    const b = ball(0, 40);
    expect(kickBall(b, [0, 26, 20], Math.PI / 2, 42)).toBe(true);
    expect(b.vx).toBeCloseTo(KICK_SPEED, 6);
    expect(b.vy).toBeGreaterThan(0);
    expect(Math.abs(b.vz)).toBeLessThan(1e-6);
    expect(kickBall(b, [0, 26, 20], Math.PI / 2, 42)).toBe(false);
    expect(kickBall(ball(0, 200), [0, 26, 20], 0, 42)).toBe(false);
  });

  test("a car knocks a ball flying, faster than it goes, and up", () => {
    const car = { ...parkedCar(0, 0), vz: 10 * METER };
    // Its front is ahead of its middle.
    const front = HALF_LENGTH - CENTER_AHEAD;
    const b = ball(0, front + 20);
    const hard = carHitsBall(car, b, 1.4 * METER);
    expect(hard).toBeCloseTo(10 * METER, 6);
    expect(b.vz).toBeGreaterThan(car.vz);
    expect(b.vy).toBeGreaterThan(0);
    // Off its side, and not when it's flying over it.
    const side = ball(HALF_WIDTH + 20, 0);
    expect(carHitsBall({ ...parkedCar(0, 0), vx: 5 * METER }, side, 1.4 * METER)).toBeGreaterThan(0);
    expect(side.vx).toBeGreaterThan(5 * METER);
    const high = { ...ball(0, front + 20), y: 2 * METER };
    expect(carHitsBall(car, high, 1.4 * METER)).toBe(0);
    expect(high.vz).toBe(0);
  });

  test("two balls the same size swap their speeds, and a big one barely slows for a small one", () => {
    const a = { ...ball(0, 0), vz: 5 * METER, asleep: false };
    const b = ball(0, 59);
    expect(collideBalls(a, b)).toBeCloseTo(5 * METER, 6);
    expect(a.vz).toBeCloseTo(0.5 * METER, 6);
    expect(b.vz).toBeCloseTo(4.5 * METER, 6);
    expect(b.asleep).toBe(false);
    const big = { ...ball(0, 0, 60), vz: 5 * METER, asleep: false };
    const small = { ...ball(0, 75, 20), y: 40 };
    collideBalls(big, small);
    expect(big.vz).toBeGreaterThan(4.5 * METER);
    expect(small.vz).toBeGreaterThan(5 * METER);
  });

  test("a ball pushed into a wall or a shape's side is stuck", () => {
    const wall: Floor = (x) => (x > 100 ? 200 : 0);
    expect(ballStuck(ball(90, 0), wall, [])).toBe(true);
    expect(ballStuck(ball(0, 0), wall, [])).toBe(false);
    const shape: Round = { x: 0, z: 70, r: 50, top: 70 };
    expect(ballStuck(ball(0, 0), flat, [shape])).toBe(true);
    expect(ballStuck({ ...ball(0, 0), y: 70 }, flat, [shape])).toBe(false);
  });
});
