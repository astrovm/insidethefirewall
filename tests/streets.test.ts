import { describe, expect, test } from "bun:test";
import {
  carDamage,
  crashCars,
  crashDamage,
  crashIntoBox,
  damageCar,
  driveCar,
  HIT_POINTS,
  METER,
  parkedCar,
  type Car,
  type CarControls,
} from "../src/remaster/car.ts";
import { gearFor, gearPitch, Motor } from "../src/remaster/motor.ts";
import {
  CELL,
  cellCoins,
  cellOf,
  cellRamp,
  driveTraffic,
  grabs,
  ground,
  hitTraffic,
  LANE,
  rampHeight,
  rampWall,
  roadX,
  roadZ,
  ROAD_HALF_WIDTH,
  spawnTraffic,
  TRAFFIC_HIT_POINTS,
} from "../src/remaster/streets.ts";
import { seeded } from "./support.ts";

const DT = 1 / 120;
const still: CarControls = { gas: false, brake: false, handbrake: false, steer: 0 };
function drive(car: Car, seconds: number, controls: Partial<CarControls> = {}): void {
  for (let t = 0; t < seconds; t += DT) driveCar(car, { ...still, ...controls }, DT, ground);
}

describe("Homer's car on its springs", () => {
  test("rests level, sits back speeding up, dips braking and leans out of turns", () => {
    const car = parkedCar(0, -3000);
    drive(car, 1);
    expect(Math.abs(car.pitch)).toBeLessThan(1e-3);
    expect(Math.abs(car.y)).toBeLessThan(0.5);
    drive(car, 0.5, { gas: true });
    expect(car.pitch).toBeGreaterThan(0.01);
    drive(car, 3, { gas: true });
    drive(car, 0.3, { brake: true });
    expect(car.pitch).toBeLessThan(-0.05);
    const turning = parkedCar(0, -3000);
    drive(turning, 3, { gas: true });
    drive(turning, 0.6, { gas: true, steer: 1 });
    // Turning right, it leans left: its right side comes up.
    expect(turning.roll).toBeGreaterThan(0.05);
  });

  test("flies off a ramp, and lands back on its wheels", () => {
    const ramp = cellRamp(0, 0)!;
    const car = parkedCar(ramp.x, ramp.z - 500, ramp.heading);
    let [highest, flew] = [0, false];
    for (let t = 0; t < 5; t += DT) {
      driveCar(car, { ...still, gas: true }, DT, ground);
      highest = Math.max(highest, car.y);
      flew ||= car.airborne;
    }
    expect(flew).toBe(true);
    expect(highest).toBeGreaterThan(ramp.height + 0.5 * METER);
    expect(car.airborne).toBe(false);
    expect(Math.abs(car.y)).toBeLessThan(2);
    expect(Math.abs(car.pitch)).toBeLessThan(0.1);
  });

  test("its wheels turn as it rolls, and push only on the floor", () => {
    const car = parkedCar(0, -3000);
    drive(car, 1, { gas: true });
    expect(car.wheelTurn).toBeGreaterThan(1);
    car.y = 5 * METER;
    const speed = car.speed;
    driveCar(car, { ...still, gas: true }, DT, ground);
    expect(car.airborne).toBe(true);
    expect(car.wheelY.every((y) => y < 5 * METER)).toBe(true);
    // No push in the air, only drag.
    expect(car.speed).toBeLessThan(speed);
  });
});

describe("skids", () => {
  test("a burnout from a standstill skids the rear tires", () => {
    const car = parkedCar(0, -3000);
    drive(car, 0.1, { gas: true });
    expect(car.burnout).toBe(true);
    expect(car.skid).toBeGreaterThanOrEqual(0.5);
  });

  test("braking hard and the handbrake skid, cruising doesn't", () => {
    const car = parkedCar(0, -3000);
    drive(car, 3, { gas: true });
    expect(car.skid).toBe(0);
    drive(car, 0.1, { handbrake: true });
    expect(car.skid).toBeGreaterThanOrEqual(0.5);
    const braking = parkedCar(0, -3000);
    drive(braking, 2, { gas: true });
    drive(braking, 0.1, { brake: true });
    expect(braking.skid).toBe(1);
  });
});

describe("damage, as in Hit & Run", () => {
  test("a crash is worth its impulse over 100000 newton seconds, nothing under 6% of that", () => {
    expect(crashDamage(5000)).toBe(0);
    expect(crashDamage(50000)).toBeCloseTo(0.5, 9);
    expect(crashDamage(250000)).toBe(1);
  });

  test("a hit that would finish it leaves it just alive and safe a second, then the next one wrecks it", () => {
    const car = parkedCar(0, 0);
    expect(damageCar(car, 1)).toBe(false);
    expect(car.hitPoints).toBe(HIT_POINTS - 1);
    expect(damageCar(car, 5)).toBe(false);
    expect(car.hitPoints).toBeCloseTo(0.001, 9);
    expect(carDamage(car)).toBeGreaterThan(0.99);
    // Safe for a second.
    expect(damageCar(car, 1)).toBe(false);
    drive(car, 1.1);
    expect(damageCar(car, 0.1)).toBe(true);
    expect([car.hitPoints, car.wrecked]).toEqual([0, 0]);
    // Already wrecked: no more.
    expect(damageCar(car, 1)).toBe(false);
  });

  test("a wrecked car won't drive", () => {
    const car = parkedCar(0, -3000);
    car.wrecked = 0;
    drive(car, 1, { gas: true });
    expect(car.speed).toBe(0);
    expect(car.wrecked).toBeGreaterThan(0.9);
  });
});

describe("crashes", () => {
  test("two cars bounce apart, the one hit off center spins", () => {
    const a = Object.assign(parkedCar(0, 0), { vz: 600, speed: 600 });
    // Hit on its side, near its back.
    const b = parkedCar(10, 150, Math.PI / 2);
    let crash = null;
    for (let i = 0; i < 30 && !crash; i++) {
      driveCar(a, still, DT);
      crash = crashCars(a, b);
    }
    expect(crash!.impulse).toBeGreaterThan(10000);
    expect(b.vz).toBeGreaterThan(0);
    expect(a.vz).toBeLessThan(600);
    expect(b.spin).not.toBe(0);
    // Pushed apart.
    expect(crashCars(a, b)).toBeNull();
  });

  test("one flying over the other misses", () => {
    const a = parkedCar(0, 0);
    const b = parkedCar(0, 50);
    b.y = 2 * METER;
    expect(crashCars(a, b)).toBeNull();
  });

  test("a ramp's tall end is a wall to a car on the floor, its low end isn't", () => {
    const ramp = cellRamp(0, 0)!;
    const [lowX, lowZ] = [ramp.x, ramp.z + 10];
    expect(rampWall(ramp, lowX, lowZ, 0)).toBeNull();
    const [highX, highZ] = [ramp.x, ramp.z + ramp.length - 10];
    const wall = rampWall(ramp, highX, highZ, 0)!;
    expect(wall).not.toBeNull();
    // A car on top of it rides over.
    expect(rampWall(ramp, highX, highZ, ramp.height)).toBeNull();
    // Backing into the tall end.
    const car = Object.assign(parkedCar(ramp.x, ramp.z + ramp.length + 70, 0), { vz: -500, speed: -500 });
    const crash = crashIntoBox(car, wall);
    expect(crash).not.toBeNull();
    expect(car.vz).toBeGreaterThan(-500 * 0.5);
  });
});

describe("streets", () => {
  test("roads run along the squares' edges", () => {
    expect(cellOf(roadX(0) - 1, 600)).toEqual([0, 0]);
    expect(cellOf(roadX(0) + 1, 600)).toEqual([1, 0]);
    expect(cellOf(0, roadZ(0) + 1)).toEqual([0, 1]);
    expect(roadX(1) - roadX(0)).toBe(CELL);
  });

  test("half the squares have a ramp, the same every time, and the first one has one ahead of the car", () => {
    const ramps = Array.from({ length: 200 }, (_, n) => cellRamp(n, -n));
    const count = ramps.filter(Boolean).length;
    expect(count).toBeGreaterThan(70);
    expect(count).toBeLessThan(130);
    expect(cellRamp(5, -5)).toEqual(cellRamp(5, -5));
    const first = cellRamp(0, 0)!;
    expect([first.x, first.heading]).toEqual([150, 0]);
    expect(rampHeight(first, first.x, first.z + first.length / 2)).toBeCloseTo(first.height / 2, 9);
    expect(rampHeight(first, first.x + first.width, first.z + 10)).toBe(0);
  });

  test("coins sit in a lane, and over the ramp, and are grabbed within Hit & Run's reach", () => {
    const coins = cellCoins(2, 3);
    expect(coins.length).toBeGreaterThanOrEqual(5);
    expect(cellCoins(2, 3)).toEqual(coins);
    expect(new Set(coins.map((c) => c.id)).size).toBe(coins.length);
    const coin = coins[0]!;
    expect(Math.abs(Math.abs(coin.x - roadX(2)) - LANE)).toBeLessThan(1e-9);
    expect(grabs(coin, coin.x + 60, coin.y, coin.z, false)).toBe(true);
    expect(grabs(coin, coin.x + 80, coin.y, coin.z, false)).toBe(false);
    // In a car the reach is 2.25 times as far.
    expect(grabs(coin, coin.x + 150, coin.y, coin.z, true)).toBe(true);
    expect(grabs(coin, coin.x, coin.y + 200, coin.z, true)).toBe(false);
    const ramp = cellRamp(0, 0)!;
    expect(cellCoins(0, 0).some((c) => c.y > ramp.height + METER)).toBe(true);
  });
});

describe("traffic", () => {
  test("keeps to a lane and turns at crossings", () => {
    const random = seeded(3);
    const traffic = spawnTraffic(0, 0, random);
    const start = [traffic.car.x, traffic.car.z];
    const roads = new Set<string>();
    for (let t = 0; t < 40; t += DT) {
      driveTraffic(traffic, [traffic.car], DT, random);
      const { x, z } = traffic.car;
      // Always on a lane, or crossing a road.
      const offLaneX = Math.min(...[-1, 1].map((side) => Math.abs((x - roadX(Math.round(x / CELL - 0.5))) - side * LANE)));
      const offLaneZ = Math.min(...[-1, 1].map((side) => Math.abs((z - roadZ(Math.round((z - 600) / CELL - 0.5))) - side * LANE)));
      const crossing = Math.abs(x - roadX(Math.round(x / CELL - 0.5))) < ROAD_HALF_WIDTH + METER && Math.abs(z - roadZ(Math.round((z - 600) / CELL - 0.5))) < ROAD_HALF_WIDTH + METER;
      expect(crossing || Math.min(offLaneX, offLaneZ) < 1.5 * METER).toBe(true);
      roads.add(`${traffic.along}${traffic.line}`);
    }
    expect(traffic.loose).toBe(false);
    expect(Math.hypot(traffic.car.x - start[0]!, traffic.car.z - start[1]!)).toBeGreaterThan(1000);
    expect(roads.size).toBeGreaterThan(1);
  });

  test("stops for what's in front of it", () => {
    const random = seeded(4);
    const traffic = spawnTraffic(0, 0, random);
    const { car } = traffic;
    const ahead = parkedCar(car.x + Math.sin(car.heading) * 14 * METER, car.z + Math.cos(car.heading) * 14 * METER, car.heading);
    for (let t = 0; t < 4; t += DT) driveTraffic(traffic, [car, ahead], DT, random);
    expect(Math.hypot(ahead.x - car.x, ahead.z - car.z)).toBeGreaterThan(4 * METER);
    expect(Math.abs(car.speed)).toBeLessThan(20);
  });

  test("a hard crash knocks it out of its lane and hurts it, until it's wrecked", () => {
    const traffic = spawnTraffic(0, 0, seeded(5));
    expect(hitTraffic(traffic, 2000)).toBe(false);
    expect(traffic.loose).toBe(false);
    expect(hitTraffic(traffic, 60000)).toBe(false);
    expect(traffic.loose).toBe(true);
    expect(traffic.car.hitPoints).toBeCloseTo(TRAFFIC_HIT_POINTS - 0.6, 9);
    hitTraffic(traffic, 100000);
    traffic.car.safe = 0;
    hitTraffic(traffic, 100000);
    traffic.car.safe = 0;
    expect(hitTraffic(traffic, 100000)).toBe(true);
  });
});

describe("the engine's sound", () => {
  test("shifts up with speed, never down while speeding up", () => {
    expect(gearFor(0, 0, 0)).toBe(0);
    expect(gearFor(20, 10, 1)).toBe(1);
    expect(gearFor(40, 30, 1)).toBe(2);
    expect(gearFor(110, 100, 4)).toBe(5);
    // Speeding up through a bump in speed: no downshift.
    expect(gearFor(30, 29, 3)).toBe(3);
    // Slowing down: no upshift.
    expect(gearFor(60, 61, 2)).toBe(2);
  });

  test("its pitch climbs through each gear and drops at each shift", () => {
    expect(gearPitch(2, 37)).toBeLessThan(gearPitch(2, 50));
    expect(gearPitch(3, 55)).toBeLessThan(gearPitch(2, 53));
    const motor = new Motor();
    const car = parkedCar(0, -3000);
    const pitches: number[] = [];
    for (let t = 0; t < 6; t += DT) {
      driveCar(car, { ...still, gas: true }, DT, ground);
      pitches.push(motor.update(car, true, DT));
    }
    expect(motor.gear).toBeGreaterThanOrEqual(4);
    expect(Math.max(...pitches)).toBeGreaterThan(1.5);
    // It changes at most an octave in half a second.
    for (let i = 1; i < pitches.length; i++) expect(Math.abs(pitches[i]! - pitches[i - 1]!)).toBeLessThanOrEqual(DT / 0.5 + 1e-9);
  });
});
