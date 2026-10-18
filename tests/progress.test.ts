import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { artFiles, palette, toSvg, worm } from "../src/remaster/art.ts";
import { threatCostumes } from "../src/remaster/game.ts";
import { Best, difficulty, gapFor, HARDEST_AT, RANKS, rankFor, THREATS } from "../src/remaster/progress.ts";

describe("difficulty", () => {
  test("goes from 0 at the start to 1 at its hardest, in a straight line", () => {
    expect([0, HARDEST_AT / 4, HARDEST_AT / 2, HARDEST_AT, HARDEST_AT * 3].map(difficulty)).toEqual([0, 0.25, 0.5, 1, 1]);
    expect(difficulty(-5)).toBe(0);
  });

  test("worms start at 20 s and the second virus at 60 s", () => {
    expect([THREATS.worm.from, THREATS.virus.from]).toEqual([20, 60]);
  });

  test("waits between threats go from easiest to hardest", () => {
    expect(gapFor("worm", 0)).toEqual([7, 10]);
    expect(gapFor("worm", HARDEST_AT)).toEqual([3, 5]);
    expect(gapFor("virus", HARDEST_AT / 2)).toEqual([6.5, 9]);
    expect(gapFor("virus", 1000)).toEqual([4, 6]);
  });

  test("waits never get longer with more time, and the shortest is never longer than the longest", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("worm" as const, "virus" as const),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        (kind, a, b) => {
          const [early, late] = [gapFor(kind, Math.min(a, b)), gapFor(kind, Math.max(a, b))];
          return late[0] <= early[0] && late[1] <= early[1] && late[0] <= late[1];
        },
      ),
    );
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

describe("pixel art", () => {
  test("every pixel uses a palette color", () => {
    for (const rows of worm) {
      for (const row of rows) for (const pixel of row) expect(pixel === "." || pixel in palette).toBe(true);
    }
  });

  test("frames and costumes have the same size as the art", () => {
    const size = (rows: string[]) => [Math.max(...rows.map((r) => r.length)), rows.length];
    expect(size(worm[0]!)).toEqual(size(worm[1]!));
    const costumes = threatCostumes.worm;
    const art = [worm[0]!, worm[1]!];
    costumes.forEach((costume, i) => expect([costume.width, costume.height]).toEqual(size(art[i]!)));
  });

  test("every palette color is a real color", () => {
    for (const color of Object.values(palette)) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("the SVG is as wide as the longest row", () => {
    expect(toSvg(["k", "kkk", "kk"])).toContain('width="3" height="3" viewBox="0 0 3 3"');
  });

  test("runs of a color become one rectangle, and empty pixels none", () => {
    expect(toSvg(["kk.r"])).toBe(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="1" viewBox="0 0 4 1" shape-rendering="crispEdges">',
        '  <rect x="0" y="0" width="2" height="1" fill="#000008"/>',
        '  <rect x="3" y="0" width="1" height="1" fill="#ff0000"/>',
        "</svg>",
        "",
      ].join("\n"),
    );
  });

  test("the SVG files match the art, so they never drift apart", () => {
    const root = new URL("..", import.meta.url).pathname;
    for (const [file, svg] of artFiles()) {
      expect(readFileSync(`${root}src/assets/costumes/${file}`, "utf8")).toBe(svg);
    }
    expect([...artFiles().keys()]).toEqual(
      threatCostumes.worm.map((c) => c.file),
    );
  });
});
