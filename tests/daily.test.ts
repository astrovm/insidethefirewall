import { expect, test } from "bun:test";
import fc from "fast-check";
import { dayNumber, seeded, shareText } from "../src/remaster/daily.ts";

test("the daily run counts calendar days from 18 October 2026", () => {
  expect(dayNumber(new Date(2026, 9, 18, 0, 0))).toBe(1);
  expect(dayNumber(new Date(2026, 9, 18, 23, 59))).toBe(1);
  expect(dayNumber(new Date(2026, 9, 19, 0, 1))).toBe(2);
  expect(dayNumber(new Date(2027, 9, 18, 12))).toBe(366);
  // Days around a clock change are still whole days.
  expect(dayNumber(new Date(2027, 2, 29, 12)) - dayNumber(new Date(2027, 2, 27, 12))).toBe(2);
  expect(dayNumber(new Date(2020, 0, 1))).toBe(1);
});

test("the same seed gives the same numbers, and they stay between 0 and 1", () => {
  const a = seeded(7);
  const b = seeded(7);
  const first = Array.from({ length: 5 }, a);
  expect(Array.from({ length: 5 }, b)).toEqual(first);
  expect(Array.from({ length: 5 }, seeded(8))).not.toEqual(first);
  fc.assert(
    fc.property(fc.integer(), (seed) => {
      const random = seeded(seed);
      return Array.from({ length: 20 }, random).every((n) => n >= 0 && n < 1);
    }),
  );
});

test("the shared line has the run, what was grabbed, and the link", () => {
  expect(shareText(161, ["shield", "jetpack", "penguin"], "https://example.com/game/", 142)).toBe(
    "Inside the firewall daily #142 · 2:41\n🛡️🚀🐧\nhttps://example.com/game/",
  );
  expect(shareText(9, [], "https://example.com/", null)).toBe("Inside the firewall · 9\nhttps://example.com/");
  const many = shareText(60, Array(15).fill("freeze"), "u", null).split("\n")[1];
  expect(many).toBe(`${"❄️".repeat(12)}+3`);
  expect(shareText(60, Array(12).fill("freeze"), "u", null).split("\n")[1]).toBe("❄️".repeat(12));
});
