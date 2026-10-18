import { expect, test } from "bun:test";
import { Effects } from "../src/remaster/effects.ts";
import { seeded } from "./support.ts";

test("hits gently shake the screen and flash red", () => {
  const effects = new Effects(seeded(1));
  effects.handle({ type: "hit", x: 10, y: -100, last: false });
  expect([effects.shakeTime, effects.shakeStrength, effects.flash]).toEqual([0.15, 2, 0.3]);
});

test("the last hit is bigger", () => {
  const effects = new Effects(seeded(1));
  effects.handle({ type: "hit", x: 0, y: 0, last: true });
  expect([effects.shakeTime, effects.shakeStrength, effects.flash]).toEqual([0.3, 4, 0.6]);
});

test("a blocked hit only shakes a little, with no flash", () => {
  const effects = new Effects(seeded(1));
  effects.handle({ type: "shield", x: 0, y: 0 });
  expect([effects.shakeTime, effects.shakeStrength, effects.flash]).toEqual([0.1, 2, 0]);
});

test("only hits shake or flash", () => {
  const effects = new Effects(seeded(5));
  for (const type of ["pickup", "land", "jump", "launch"] as const) effects.handle({ type, x: 0, y: 0 });
  effects.handle({ type: "lost", time: 3 });
  expect([effects.shakeTime, effects.flash]).toEqual([0, 0]);
  expect(effects.shakeOffset()).toEqual([0, 0]);
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

test("the flash fades in a quarter second", () => {
  const effects = new Effects(seeded(7));
  effects.flash = 1;
  effects.update(0.125);
  expect(effects.flash).toBeCloseTo(0.5, 6);
  effects.update(1);
  expect(effects.flash).toBe(0);
});

test("clearing stops the shake and the flash", () => {
  const effects = new Effects(seeded(8));
  effects.handle({ type: "hit", x: 0, y: 0, last: true });
  effects.clear();
  expect([effects.shakeTime, effects.shakeStrength, effects.flash]).toEqual([0, 0, 0]);
});
