import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { artFiles, ball, flame, freeze, jetpack, palette, pill, portal, shield, shoes, toSvg } from "../src/remaster/art.ts";
import { flameCostumes, POWER_UPS, powerUpCostumes } from "../src/remaster/game.ts";

const size = (rows: string[]) => [Math.max(...rows.map((r) => r.length)), rows.length];

test("every pixel uses a palette color, and every color is real", () => {
  for (const rows of [jetpack, shield, freeze, pill, shoes, portal, ball, ...flame]) {
    for (const row of rows) for (const pixel of row) expect(pixel === "." || pixel in palette).toBe(true);
  }
  for (const color of Object.values(palette)) expect(color).toMatch(/^#[0-9a-f]{6}$/);
});

test("rows are all the same width, and costumes match the art", () => {
  for (const rows of [jetpack, shield, freeze, pill, shoes, portal, ball, ...flame]) expect(new Set(rows.map((r) => r.length)).size).toBe(1);
  const art = { jetpack, shield, freeze, pill, shoes, portal, ball };
  POWER_UPS.forEach((kind, i) => {
    expect(powerUpCostumes[i]!.name).toBe(kind);
    expect([powerUpCostumes[i]!.width, powerUpCostumes[i]!.height]).toEqual(size(art[kind]));
  });
  flameCostumes.forEach((costume, i) => expect([costume.width, costume.height]).toEqual(size(flame[i]!)));
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
  expect(toSvg(["k", "kkk", "kk"])).toContain('width="3" height="3" viewBox="0 0 3 3"');
});

test("the SVG files match the art, so they never drift apart", () => {
  const root = new URL("..", import.meta.url).pathname;
  for (const [file, svg] of artFiles()) expect(readFileSync(`${root}src/assets/costumes/${file}`, "utf8")).toBe(svg);
  expect([...artFiles().keys()]).toEqual([...powerUpCostumes, ...flameCostumes].map((c) => c.file));
});
