import { expect, test } from "bun:test";
import fc from "fast-check";
import { existsSync } from "node:fs";
import { audibleRange, SHAR_EFFECTS, SHAR_FILES } from "../src/audio.ts";

test("a song's sound is found between the silence at its start and end", () => {
  const samples = new Float32Array([0, 0.001, -0.01, 0.5, -0.3, 0.025, 0.01, 0, 0]);
  expect(audibleRange(samples, 10)).toEqual({ start: 0.3, end: 0.6 });
  expect(audibleRange(new Float32Array([-0.025, 0, 0.5]), 1)).toEqual({ start: 0, end: 3 });
});

test("a silent or empty song plays whole", () => {
  expect(audibleRange(new Float32Array(8), 4)).toEqual({ start: 0, end: 2 });
  expect(audibleRange(new Float32Array(0), 4)).toEqual({ start: 0, end: 0 });
});

test("the sound always starts before it ends, inside the song", () => {
  fc.assert(
    fc.property(fc.float32Array({ noNaN: true, maxLength: 50 }), (samples) => {
      const { start, end } = audibleRange(samples, 10);
      return start >= 0 && start <= end && end <= samples.length / 10;
    }),
  );
});

test("Hit & Run's sounds are all there, loops as WAV so they don't gap", () => {
  expect(SHAR_FILES.length).toBeGreaterThan(20);
  for (const file of SHAR_FILES) expect(existsSync(`src/assets/${file}`)).toBe(true);
  for (const loop of ["engine", "skid", "damaged", "horn"]) expect(SHAR_FILES).toContain(`sounds/shar/${loop}.wav`);
  for (const effect of Object.values(SHAR_EFFECTS)) {
    expect(effect.trim).toBeGreaterThan(0);
    expect(effect.trim).toBeLessThanOrEqual(1);
  }
});
