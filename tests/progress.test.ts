import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { Best, difficulty, HARDEST_AT, RANKS, rankFor } from "../src/remaster/progress.ts";

describe("difficulty", () => {
  test("goes from 0 at the start to 1 at its hardest, in a straight line", () => {
    expect([0, HARDEST_AT / 4, HARDEST_AT / 2, HARDEST_AT, HARDEST_AT * 3].map(difficulty)).toEqual([0, 0.25, 0.5, 1, 1]);
    expect(difficulty(-5)).toBe(0);
  });

});

describe("ranks", () => {
  test("go by seconds survived", () => {
    expect(RANKS).toEqual([
      { from: 0, name: "Script kiddie" },
      { from: 20, name: "Antivirus trial" },
      { from: 45, name: "Sysadmin" },
      { from: 75, name: "Firewall" },
      { from: 110, name: "Root" },
    ]);
    expect([0, 19, 20, 50, 80, 109, 110, 300].map(rankFor)).toEqual([
      "Script kiddie",
      "Script kiddie",
      "Antivirus trial",
      "Sysadmin",
      "Firewall",
      "Firewall",
      "Root",
      "Root",
    ]);
  });

  test("never go down with more time", () => {
    const order = RANKS.map((r) => r.name);
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1000, noNaN: true }), fc.double({ min: 0, max: 1000, noNaN: true }), (a, b) => {
        const [low, high] = a < b ? [a, b] : [b, a];
        return order.indexOf(rankFor(low)) <= order.indexOf(rankFor(high));
      }),
    );
  });
});

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
