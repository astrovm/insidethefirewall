import { expect, test } from "bun:test";
import { Effects } from "../src/remaster/effects.ts";
import { seeded } from "./support.ts";

test("hits throw pixels, shake the screen and flash red", () => {
  const effects = new Effects(seeded(1));
  effects.handle({ type: "hit", x: 10, y: -100, last: false });
  expect(effects.particles).toHaveLength(28);
  expect(effects.particles.every((p) => p.x === 10 && p.y === -100)).toBe(true);
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

test("dust kicks up, never down", () => {
  const effects = new Effects(seeded(3));
  for (let i = 0; i < 50; i++) effects.handle({ type: "land", x: 0, y: 0 });
  expect(effects.particles.every((p) => p.vy >= -1e-9)).toBe(true);
});

test("the shake stays within its strength and fades out", () => {
  const effects = new Effects(seeded(4));
  effects.shake(0.3, 6);
  for (let i = 0; i < 20; i++) {
    const [dx, dy] = effects.shakeOffset();
    expect(Math.abs(dx)).toBeLessThanOrEqual(6);
    expect(Math.abs(dy)).toBeLessThanOrEqual(6);
  }
  effects.update(0.3);
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
  const before = effects.particles.map((p) => p.vy);
  effects.update(0.1);
  effects.particles.forEach((p, i) => expect(p.vy).toBeCloseTo(before[i]! - 70, 6));
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
