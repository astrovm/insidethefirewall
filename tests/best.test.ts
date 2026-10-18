import { describe, expect, test } from "bun:test";
import { Best, DAILY_KEY } from "../src/remaster/best.ts";

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
    expect(JSON.parse(storage.items.get("insidethefirewall.best")!)).toEqual({ seconds: 12, speed: 1, day: null });
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
    for (const saved of ['{"seconds":"5"}', '{"speed":0.8}', "[5]", "null", '{"seconds":-3}', '{"seconds":5,"day":3}']) {
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

  test("a daily best only counts on its own day", () => {
    const storage = memory();
    const today = new Best(storage, DAILY_KEY, 3);
    today.record(20);
    expect(new Best(storage, DAILY_KEY, 3).value).toBe(20);
    expect(new Best(storage, DAILY_KEY, 4).value).toBe(0);
    expect(new Best(storage).value).toBe(0);
    const tomorrow = new Best(storage, DAILY_KEY, 4);
    expect(tomorrow.record(5)).toBe(true);
    expect(new Best(storage, DAILY_KEY, 3).value).toBe(0);
  });

  test("works without storage, or when the browser blocks it", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    for (const storage of [null, blocked]) {
      const best = new Best(storage);
      expect(best.value).toBe(0);
      expect(best.record(9)).toBe(true);
      expect(best.value).toBe(9);
    }
  });
});
