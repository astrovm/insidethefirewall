import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { artFiles, palette, popup, toSvg, trojan, worm } from "../src/remaster/art.ts";
import { threatCostumes } from "../src/remaster/game.ts";
import { Best, rankFor, STAGES, stageAt } from "../src/remaster/progress.ts";

describe("stages and ranks", () => {
  test("stages start at 0, 20, 45, 75 and 110 seconds", () => {
    expect(STAGES.map((s) => s.from)).toEqual([0, 20, 45, 75, 110]);
    expect([0, 19.9, 20, 44, 45, 75, 109, 110, 9999].map(stageAt)).toEqual([0, 0, 1, 1, 2, 3, 3, 4, 4]);
  });

  test("each stage is harder than the one before", () => {
    for (let i = 1; i < STAGES.length; i++) {
      const [before, now] = [STAGES[i - 1]!, STAGES[i]!];
      expect(now.virusSpeed).toBeGreaterThan(before.virusSpeed);
      for (const kind of Object.keys(before.every) as (keyof typeof before.every)[]) {
        expect(now.every[kind]).toBeDefined();
        expect(now.every[kind]![1]).toBeLessThanOrEqual(before.every[kind]![1]);
      }
    }
  });

  test("the rank is named after the last stage reached", () => {
    expect([0, 19, 20, 50, 80, 300].map(rankFor)).toEqual([
      "Script kiddie",
      "Script kiddie",
      "Antivirus trial",
      "Sysadmin",
      "Firewall",
      "Root",
    ]);
  });

  test("ranks never go down with more time", () => {
    const order = STAGES.map((s) => s.rank);
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
    for (const rows of [...worm, popup, trojan]) {
      for (const row of rows) for (const pixel of row) expect(pixel === "." || pixel in palette).toBe(true);
    }
  });

  test("frames and costumes have the same size as the art", () => {
    const size = (rows: string[]) => [Math.max(...rows.map((r) => r.length)), rows.length];
    expect(size(worm[0]!)).toEqual(size(worm[1]!));
    expect(new Set(popup.map((r) => r.length))).toEqual(new Set([22]));
    const costumes = [...threatCostumes.worm, ...threatCostumes.popup, ...threatCostumes.trojan];
    const art = [worm[0]!, worm[1]!, popup, trojan];
    costumes.forEach((costume, i) => expect([costume.width, costume.height]).toEqual(size(art[i]!)));
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
      [...threatCostumes.worm, ...threatCostumes.popup, ...threatCostumes.trojan].map((c) => c.file),
    );
  });
});
