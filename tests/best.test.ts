import { describe, expect, test } from "bun:test";
import { Best } from "../src/remaster/best.ts";

/** In-memory storage, like localStorage. */
function memory(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("best time", () => {
  test("starts at zero and keeps longer times only", () => {
    const storage = memory();
    const best = new Best(storage);
    expect(best.value).toBe(0);
    expect(best.record(12.7)).toBe(true);
    expect(best.value).toBe(12);
    expect(JSON.parse(storage.items.get("insidethefirewall.best")!)).toEqual({ seconds: 12, speed: 1 });
    expect(best.record(12.9)).toBe(false);
    expect(best.record(5)).toBe(false);
    expect(best.record(30)).toBe(true);
    expect(new Best(storage).value).toBe(30);
  });

  test("ignores saved values that aren't a time", () => {
    for (const saved of ["", "abc", "-5", "NaN", "Infinity", "0"]) {
      expect(new Best(memory({ "insidethefirewall.best": saved })).value).toBe(0);
    }
    expect(new Best(memory({ "insidethefirewall.best": "41.9" })).value).toBe(41);
    for (const saved of ['{"seconds":1e999}', '{"seconds":"5"}', '{"speed":0.8}', "[5]", "null", '{"seconds":-3}']) {
      expect(new Best(memory({ "insidethefirewall.best": saved })).value).toBe(0);
    }
  });

  test("marks a best played slower than full speed", () => {
    const storage = memory();
    const best = new Best(storage);
    best.record(75, 0.7);
    expect([best.value, best.speed, best.label]).toEqual([75, 0.7, "1:15 at 70%"]);
    expect(new Best(storage).label).toBe("1:15 at 70%");
    best.record(80);
    expect([best.speed, best.label]).toEqual([1, "1:20"]);
    expect(new Best(storage).label).toBe("1:20");
    for (const speed of [0, -1, 2, "0.8", null]) {
      const saved = memory({ "insidethefirewall.best": JSON.stringify({ seconds: 9, speed }) });
      expect(new Best(saved).label).toBe("9");
    }
  });

});
