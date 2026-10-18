import { expect, test } from "bun:test";
import { Effects } from "../src/remaster/effects.ts";
import { seeded } from "./support.ts";

test("hits throw pixels, and gently shake the screen and flash red", () => {
  const effects = new Effects(seeded(1));
  effects.handle({ type: "hit", x: 10, y: -100, last: false });
  expect(effects.particles).toHaveLength(28);
  expect(effects.particles.every((p) => p.x === 10 && p.y === -100)).toBe(true);
  const colors = new Set(effects.particles.map((p) => p.color));
  expect([...colors].every((c) => ["#999900", "#cccc00", "#660000", "#ff0000", "#b51000", "#000008"].includes(c))).toBe(true);
  expect(colors.size).toBeGreaterThan(3);
  expect([effects.shakeTime, effects.shakeStrength, effects.flash]).toEqual([0.15, 2, 0.3]);
});

test("the last hit is bigger", () => {
  const effects = new Effects(seeded(1));
  effects.handle({ type: "hit", x: 0, y: 0, last: true });
  expect(effects.particles).toHaveLength(58);
  expect([effects.shakeTime, effects.shakeStrength, effects.flash]).toEqual([0.3, 4, 0.6]);
});

test("other events make their own bursts, and the rest make none", () => {
  const counts = (["pickup", "land", "jump", "launch", "shatter"] as const).map((type) => {
    const effects = new Effects(seeded(2));
    effects.handle({ type, x: 0, y: 0 });
    return effects.particles.length;
  });
  expect(counts).toEqual([24, 6, 4, 8, 26]);
  const effects = new Effects(seeded(2));
  effects.handle({ type: "lost", time: 3 });
  effects.handle({ type: "music", playing: true });
  expect(effects.particles).toEqual([]);
});

test("bursts start where the thing is drawn", () => {
  const at = (event: Parameters<Effects["handle"]>[0]) => {
    const effects = new Effects(seeded(9));
    effects.handle(event);
    return [effects.particles[0]!.x, effects.particles[0]!.y];
  };
  // The penguin's costume is drawn left of its position.
  expect(at({ type: "pickup", x: 100, y: -25 })).toEqual([33, -17]);
  // Dust comes from the player's feet.
  expect(at({ type: "land", x: 5, y: -100 })).toEqual([5, -140]);
  expect(at({ type: "jump", x: 5, y: -100 })).toEqual([5, -140]);
});

test("penguin sparkles float up", () => {
  const effects = new Effects(seeded(10));
  effects.handle({ type: "pickup", x: 0, y: 0 });
  expect(effects.particles.every((p) => p.gravity === -400)).toBe(true);
});

test("particles fly at 35% to 100% of the burst speed, in pixel sizes", () => {
  const effects = new Effects(seeded(11));
  effects.burst(0, 0, ["#fff"], 200, 100);
  const speeds = effects.particles.map((p) => Math.hypot(p.vx, p.vy));
  expect(Math.min(...speeds)).toBeGreaterThanOrEqual(35 - 1e-9);
  expect(Math.max(...speeds)).toBeLessThanOrEqual(100 + 1e-9);
  expect(Math.max(...speeds)).toBeGreaterThan(90);
  expect(new Set(effects.particles.map((p) => p.size))).toEqual(new Set([3, 4]));
  // A full burst goes every way.
  expect(effects.particles.some((p) => p.vx < 0) && effects.particles.some((p) => p.vx > 0)).toBe(true);
  expect(effects.particles.some((p) => p.vy < 0) && effects.particles.some((p) => p.vy > 0)).toBe(true);
});

test("dust kicks up, never down", () => {
  for (const type of ["land", "jump"] as const) {
    const effects = new Effects(seeded(3));
    for (let i = 0; i < 50; i++) effects.handle({ type, x: 0, y: 0 });
    expect(effects.particles.every((p) => p.vy >= -1e-9)).toBe(true);
  }
});

test("every burst uses its own real colors", () => {
  const events = [
    { type: "hit", x: 0, y: 0, last: true },
    { type: "pickup", x: 0, y: 0 },
    { type: "land", x: 0, y: 0 },
    { type: "launch", x: 0, y: 0 },
    { type: "shatter", x: 0, y: 0 },
  ] as const;
  const used = events.map((event) => {
    const effects = new Effects(seeded(12));
    for (let i = 0; i < 5; i++) effects.handle(event);
    const colors = new Set(effects.particles.map((p) => p.color));
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    return [...colors].sort().join();
  });
  expect(new Set(used).size).toBe(events.length);
  expect(used.map((colors) => colors.split(",").length)).toEqual([6, 3, 3, 2, 4]);
});

test("most particles are 3 px, some 4 px", () => {
  const effects = new Effects(seeded(13));
  effects.burst(0, 0, ["#ffffff"], 300, 100);
  const big = effects.particles.filter((p) => p.size === 4).length / 300;
  expect(big).toBeGreaterThan(0.2);
  expect(big).toBeLessThan(0.4);
});

test("the shake stays within its strength and fades out", () => {
  const effects = new Effects(seeded(4));
  effects.shake(0.3, 6);
  const offsets = Array.from({ length: 40 }, () => effects.shakeOffset());
  for (const axis of [0, 1]) {
    const values = offsets.map((offset) => offset[axis]!);
    expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(6);
    // Both ways on each axis, and most of the strength.
    expect(Math.max(...values)).toBeGreaterThan(3);
    expect(Math.min(...values)).toBeLessThan(-3);
  }
  // It eases out over the last 0.15 s.
  effects.update(0.25);
  for (let i = 0; i < 20; i++) {
    const [dx, dy] = effects.shakeOffset();
    expect(Math.max(Math.abs(dx), Math.abs(dy))).toBeLessThanOrEqual(2 + 1e-9);
  }
  effects.update(1);
  expect(effects.shakeTime).toBe(0);
  expect(effects.shakeOffset()).toEqual([0, 0]);
  expect(effects.shakeStrength).toBe(0);
});

test("a weaker shake doesn't cut a stronger one short", () => {
  const effects = new Effects(seeded(4));
  effects.shake(0.5, 9);
  effects.shake(0.2, 3);
  expect([effects.shakeTime, effects.shakeStrength]).toEqual([0.5, 9]);
  effects.update(0.1);
  effects.shake(0.2, 3);
  expect(effects.shakeStrength).toBe(9);
});

test("a new shake after the last one ended has its own strength", () => {
  const effects = new Effects(seeded(4));
  effects.shake(0.1, 9);
  effects.update(0.2);
  effects.shake(0.2, 3);
  expect(effects.shakeStrength).toBe(3);
});

test("only hits shake the screen", () => {
  const effects = new Effects(seeded(5));
  for (const type of ["pickup", "land", "jump", "launch", "shatter"] as const) effects.handle({ type, x: 0, y: 0 });
  expect([effects.shakeTime, effects.flash]).toEqual([0, 0]);
  expect(effects.shakeOffset()).toEqual([0, 0]);
});

test("particles fall, fade out and go away", () => {
  const effects = new Effects(seeded(6));
  effects.burst(0, 0, ["#fff"], 10, 100, 700);
  const before = effects.particles.map((p) => ({ ...p }));
  effects.update(0.1);
  expect(effects.particles).toHaveLength(10);
  effects.particles.forEach((p, i) => {
    const old = before[i]!;
    expect(p.vy).toBeCloseTo(old.vy - 70, 6);
    expect(p.x).toBeCloseTo(old.vx * 0.1, 6);
    expect(p.y).toBeCloseTo((old.vy - 70) * 0.1, 6);
    expect(p.life).toBeCloseTo(old.life - 0.1, 6);
  });
  effects.update(1);
  expect(effects.particles).toEqual([]);
});

test("the flash fades in a quarter second", () => {
  const effects = new Effects(seeded(7));
  effects.flash = 1;
  effects.update(0.125);
  expect(effects.flash).toBeCloseTo(0.5, 6);
  effects.update(1);
  expect(effects.flash).toBe(0);
});

test("there are never too many particles", () => {
  const effects = new Effects(seeded(8));
  for (let i = 0; i < 100; i++) effects.handle({ type: "hit", x: 0, y: 0, last: true });
  expect(effects.particles).toHaveLength(400);
  effects.clear();
  expect([effects.particles.length, effects.shakeTime, effects.flash]).toEqual([0, 0, 0]);
});
