import { expect, test } from "bun:test";
import { Effects } from "../src/remaster/effects.ts";
import { seeded } from "./support.ts";

test("hits throw pixels, shake the screen and flash red", () => {
  const effects = new Effects(seeded(1));
  effects.handle({ type: "hit", x: 10, y: -100, last: false });
  expect(effects.particles).toHaveLength(28);
  expect(effects.particles.every((p) => p.x === 10 && p.y === -100)).toBe(true);
  const colors = new Set(effects.particles.map((p) => p.color));
  expect([...colors].every((c) => ["#999900", "#cccc00", "#660000", "#ff0000", "#b51000", "#000008"].includes(c))).toBe(true);
  expect(colors.size).toBeGreaterThan(3);
  expect([effects.shakeTime, effects.shakeStrength, effects.flash]).toEqual([0.25, 5, 0.6]);
});

test("the last hit is bigger", () => {
  const effects = new Effects(seeded(1));
  effects.handle({ type: "hit", x: 0, y: 0, last: true });
  expect(effects.particles).toHaveLength(58);
  expect([effects.shakeTime, effects.shakeStrength, effects.flash]).toEqual([0.5, 9, 1]);
});

test("other events make their own bursts, and the rest make none", () => {
  const counts = (["pickup", "land", "jump", "launch"] as const).map((type) => {
    const effects = new Effects(seeded(2));
    effects.handle({ type, x: 0, y: 0 });
    return effects.particles.length;
  });
  expect(counts).toEqual([24, 6, 4, 8]);
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
  const effects = new Effects(seeded(3));
  for (let i = 0; i < 50; i++) effects.handle({ type: "land", x: 0, y: 0 });
  expect(effects.particles.every((p) => p.vy >= -1e-9)).toBe(true);
});

test("the shake stays within its strength and fades out", () => {
  const effects = new Effects(seeded(4));
  effects.shake(0.3, 6);
  let biggest = 0;
  for (let i = 0; i < 20; i++) {
    const [dx, dy] = effects.shakeOffset();
    expect(Math.abs(dx)).toBeLessThanOrEqual(6);
    expect(Math.abs(dy)).toBeLessThanOrEqual(6);
    biggest = Math.max(biggest, Math.abs(dx), Math.abs(dy));
  }
  expect(biggest).toBeGreaterThan(3);
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
});

test("calm mode never shakes", () => {
  const effects = new Effects(seeded(5));
  effects.calm = true;
  effects.shake(1, 10);
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
