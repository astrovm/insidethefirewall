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
    expect(storage.items.get("insidethefirewall.best")).toBe("12");
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
