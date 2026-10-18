import { expect, test } from "bun:test";
import { Sprite } from "../src/engine/sprite.ts";
import { costumes } from "../src/game/classic.ts";
import { scratchKey } from "../src/input.ts";
import { interpolate } from "../src/render.ts";

const virus = (x: number, y: number) =>
  new Sprite("virus", costumes.virus, {
    x,
    y,
    direction: 90,
    size: 222.1289005570158,
    costume: 0,
    visible: true,
    rotationStyle: "left-right",
  });

test("drawing between frames glides small moves", () => {
  expect(interpolate(virus(10, 0), { x: 0, y: 0 }, 0.5)).toEqual([5, 0]);
  expect(interpolate(virus(10, 0), { x: 0, y: 0 }, 0)).toEqual([0, 0]);
});

test("drawing between frames doesn't glide teleports or new sprites", () => {
  expect(interpolate(virus(-1, 134), { x: 0, y: -150 }, 0.5)).toEqual([-1, 134]);
  expect(interpolate(virus(10, 0), undefined, 0.5)).toEqual([10, 0]);
  expect(interpolate(virus(0.05, 0), { x: 0, y: 0 }, 0.5)).toEqual([0.05, 0]);
});

test("browser keys map to Scratch key names", () => {
  expect(scratchKey(" ")).toBe("space");
  expect(scratchKey("ArrowLeft")).toBe("left arrow");
  expect(scratchKey("D")).toBe("d");
  expect(scratchKey("r")).toBe("r");
  expect(scratchKey("Shift")).toBeNull();
});
