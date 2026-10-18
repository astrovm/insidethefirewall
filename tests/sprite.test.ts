import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { Sprite, STAGE_HEIGHT, STAGE_WIDTH, applyMask, wrapClamp, type Costume } from "../src/engine/sprite.ts";
import { costumes } from "../src/game/classic.ts";

const player = (state: Partial<Sprite> = {}) =>
  new Sprite("player", costumes.player, {
    x: 0,
    y: 0,
    direction: 90,
    size: 180.6111234669416,
    costume: 0,
    visible: true,
    rotationStyle: "left-right",
    ...state,
  });

const box = (overrides: Partial<Costume> = {}): Costume => ({
  name: "box",
  file: "box.svg",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  centerX: 5,
  centerY: 5,
  smooth: true,
  ...overrides,
});

const rounded = (b: { left: number; right: number; bottom: number; top: number }) =>
  [b.left, b.right, b.bottom, b.top].map((n) => Math.round(n * 100) / 100);

describe("bounds match the Scratch runtime", () => {
  test("player facing right and left", () => {
    expect(rounded(player().bounds())).toEqual([-23.48, 25.29, -43.35, 41.54]);
    expect(rounded(player({ direction: -90 }).bounds())).toEqual([-25.29, 23.48, -43.35, 41.54]);
  });

  test("crouching player", () => {
    expect(rounded(player({ costume: 5 }).bounds())).toEqual([-20.77, 26.19, -42.44, 29.8]);
  });

  test("virus and pickup", () => {
    const virus = new Sprite("virus", costumes.virus, {
      x: 0,
      y: 0,
      direction: 90,
      size: 222.1289005570158,
      costume: 0,
      visible: true,
      rotationStyle: "left-right",
    });
    expect(rounded(virus.bounds())).toEqual([-15.55, 19.99, -22.21, 17.77]);
    const pickup = new Sprite("pickup", costumes.pickup, {
      x: 0,
      y: 0,
      direction: 90,
      size: 134.39163793441224,
      costume: 0,
      visible: true,
      rotationStyle: "left-right",
    });
    // The penguin is drawn to the left of its position, like in Scratch.
    expect(rounded(pickup.bounds())).toEqual([-110.87, -24.51, -27.55, 44.15]);
  });
});

describe("movement", () => {
  test("walking into the right edge stops at x 249, like Scratch", () => {
    const sprite = player({ x: 248, y: -115 });
    sprite.move(20);
    expect(sprite.x).toBe(249);
  });

  test("a sprite always keeps part of itself on stage", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -5000, max: 5000, noNaN: true }),
        fc.double({ min: -5000, max: 5000, noNaN: true }),
        fc.constantFrom(90, -90),
        (x, y, direction) => {
          const sprite = player({ direction });
          sprite.setXY(x, y);
          const fence = sprite.fastBounds();
          expect(fence.right).toBeGreaterThanOrEqual(-STAGE_WIDTH / 2 + 15 - 1e-9);
          expect(fence.left).toBeLessThanOrEqual(STAGE_WIDTH / 2 - 15 + 1e-9);
          expect(fence.top).toBeGreaterThanOrEqual(-STAGE_HEIGHT / 2 + 15 - 1e-9);
          expect(fence.bottom).toBeLessThanOrEqual(STAGE_HEIGHT / 2 - 15 + 1e-9);
        },
      ),
    );
  });

  test("directions wrap into Scratch's range", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (direction) => {
        const wrapped = wrapClamp(direction, -179, 180);
        expect(wrapped).toBeGreaterThanOrEqual(-179);
        expect(wrapped).toBeLessThan(181);
        expect(Math.abs(((wrapped - direction) % 360) + 0)).toBeCloseTo(0, 6);
      }),
    );
  });

  test("pointing towards a spot and moving gets closer to it", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -200, max: 200 }),
        fc.integer({ min: -140, max: 140 }),
        fc.integer({ min: -200, max: 200 }),
        fc.integer({ min: -140, max: 140 }),
        (x, y, tx, ty) => {
          fc.pre(Math.hypot(tx - x, ty - y) > 5);
          const sprite = new Sprite("dot", [box()], {
            x,
            y,
            direction: 90,
            size: 100,
            costume: 0,
            visible: true,
            rotationStyle: "all around",
          });
          sprite.pointTowards(tx, ty);
          const before = Math.hypot(tx - x, ty - y);
          sprite.move(5);
          expect(Math.hypot(tx - sprite.x, ty - sprite.y)).toBeCloseTo(before - 5, 6);
        },
      ),
    );
  });

  test("Scratch directions: 0 is up, 90 is right, 180 is down", () => {
    const sprite = new Sprite("dot", [box()], {
      x: 0,
      y: 0,
      direction: 90,
      size: 100,
      costume: 0,
      visible: true,
      rotationStyle: "all around",
    });
    sprite.pointTowards(0, 50);
    expect(sprite.direction).toBe(0);
    sprite.pointTowards(0, -50);
    expect(sprite.direction).toBe(180);
    sprite.pointTowards(-50, 0);
    expect(sprite.direction).toBe(-90);
  });
});

describe("edges", () => {
  test("touching the edge uses the opaque area", () => {
    expect(player({ x: 214 }).isTouchingEdge()).toBe(false);
    expect(player({ x: 215 }).isTouchingEdge()).toBe(true);
  });

  test("bouncing off the right edge turns the pickup around and pulls it in", () => {
    const pickup = new Sprite("pickup", costumes.pickup, {
      x: -124,
      y: -25,
      direction: 90,
      size: 134.39163793441224,
      costume: 0,
      visible: true,
      rotationStyle: "left-right",
    });
    pickup.setXY(295, -25);
    pickup.ifOnEdgeBounce();
    expect(pickup.direction).toBeLessThan(0);
    expect(pickup.fastBounds().left).toBeLessThanOrEqual(STAGE_WIDTH / 2 - 15);
  });

  test("a sprite away from the edges doesn't bounce", () => {
    const sprite = player({ x: 0, y: -100, direction: 90 });
    sprite.ifOnEdgeBounce();
    expect(sprite.direction).toBe(90);
    expect([sprite.x, sprite.y]).toEqual([0, -100]);
  });
});

describe("touching", () => {
  test("hidden sprites never touch, as in Scratch", () => {
    const a = player();
    const b = player();
    expect(a.isTouching(b)).toBe(true);
    b.visible = false;
    expect(a.isTouching(b)).toBe(false);
    expect(b.isTouching(a)).toBe(false);
  });

  test("uses the costume's pixels, not just its box", () => {
    // A 4x4 costume with only its top-left pixel opaque.
    const costume = box({ width: 4, height: 4, centerX: 0, centerY: 0 });
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    rgba[3] = 255;
    applyMask(costume, rgba, 4, 4, 1);
    const make = (x: number, y: number) =>
      new Sprite("dot", [costume], { x, y, direction: 90, size: 100, costume: 0, visible: true, rotationStyle: "all around" });
    expect(costume.opaque).toEqual({ left: 0, top: 0, right: 1, bottom: 1 });
    expect(make(0, 0).isTouching(make(0, 0))).toBe(true);
    expect(make(0, 0).isTouching(make(3, 0))).toBe(false);
  });

  test("stage to costume and back gives the same point", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: 10, max: 300, noNaN: true }),
        fc.constantFrom<Sprite["rotationStyle"]>("all around", "left-right", "don't rotate"),
        fc.double({ min: -20, max: 20, noNaN: true }),
        fc.double({ min: -20, max: 20, noNaN: true }),
        (direction, size, rotationStyle, u, v) => {
          const sprite = new Sprite("dot", [box()], { x: 3, y: -7, direction, size, costume: 0, visible: true, rotationStyle });
          const [px, py] = sprite.toStage(u, v);
          const [bu, bv] = sprite.toCostume(px, py);
          expect(bu).toBeCloseTo(u, 6);
          expect(bv).toBeCloseTo(v, 6);
        },
      ),
    );
  });
});

const dot = (costume: Costume, state: Partial<Sprite> = {}) =>
  new Sprite("dot", [costume], {
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    costume: 0,
    visible: true,
    rotationStyle: "all around",
    ...state,
  });

describe("costumes and state", () => {
  test("asking for a missing costume fails loudly", () => {
    expect(() => dot(box(), { costume: 3 }).currentCostume).toThrow("dot has no costume 3");
    expect(() => dot(box()).setCostume("nope")).toThrow("dot has no costume nope");
  });

  test("left-right sprites mirror only when pointing left", () => {
    expect(dot(box(), { rotationStyle: "left-right", direction: -1 }).flipX).toBe(-1);
    expect(dot(box(), { rotationStyle: "left-right", direction: 0 }).flipX).toBe(1);
    expect(dot(box(), { rotationStyle: "all around", direction: -90 }).flipX).toBe(1);
  });

  test("only all around sprites rotate, 90 being upright", () => {
    expect(dot(box(), { direction: 180 }).rotation).toBeCloseTo(Math.PI / 2, 9);
    expect(dot(box(), { direction: 0 }).rotation).toBeCloseTo(-Math.PI / 2, 9);
    expect(dot(box(), { direction: 180, rotationStyle: "left-right" }).rotation).toBe(0);
    expect(dot(box(), { direction: 180, rotationStyle: "don't rotate" }).rotation).toBe(0);
  });

  test("a direction that isn't a number is ignored, like in Scratch", () => {
    const sprite = dot(box(), { direction: 45 });
    sprite.setDirection(Number.NaN);
    sprite.setDirection(Number.POSITIVE_INFINITY);
    expect(sprite.direction).toBe(45);
  });

  test("reset goes back to the saved state, and snapshot copies it", () => {
    const sprite = dot(box());
    const saved = sprite.snapshot();
    Object.assign(sprite, { x: 5, y: 6, direction: 7, size: 8, visible: false, rotationStyle: "left-right" });
    expect(sprite.snapshot()).toEqual({ x: 5, y: 6, direction: 7, size: 8, costume: 0, visible: false, rotationStyle: "left-right" });
    sprite.reset();
    expect(sprite.snapshot()).toEqual(saved);
  });

  test("without an opaque area, bounds are the whole costume box", () => {
    const sprite = dot(box({ x: 1, y: 2, width: 4, height: 6, centerX: 0, centerY: 0 }));
    expect(sprite.fastBounds()).toEqual({ left: 1, right: 5, bottom: -8, top: -2 });
    expect(sprite.bounds()).toEqual(sprite.fastBounds());
  });
});

describe("small sprites", () => {
  // 10x12, so the fence keeps half the smaller side on stage (5 px) instead of 15.
  const small = () => dot(box({ width: 10, height: 12, centerX: 5.5, centerY: 5.5 }));

  test("the fence keeps half of a small sprite on stage", () => {
    const sprite = small();
    sprite.setXY(-1000, 0);
    expect(sprite.x).toBe(-239);
    sprite.setXY(1000, 0);
    expect(sprite.x).toBe(240);
    sprite.setXY(0, -1000);
    expect(sprite.y).toBe(-180);
    sprite.setXY(0, 1000);
    expect(sprite.y).toBe(181);
  });

  test("landing exactly on the fence isn't clamped", () => {
    for (const [x, y] of [
      [-239.5, 0],
      [240.5, 0],
      [0, -180.5],
      [0, 181.5],
    ] as const) {
      const sprite = small();
      sprite.setXY(x, y);
      expect([sprite.x, sprite.y]).toEqual([x, y]);
    }
  });

  test("touching an edge starts past it, not at it", () => {
    const at = (x: number, y: number) => dot(box(), { x, y }).isTouchingEdge();
    expect([at(235, 0), at(235.5, 0)]).toEqual([false, true]);
    expect([at(-235, 0), at(-235.5, 0)]).toEqual([false, true]);
    expect([at(0, 175), at(0, 175.5)]).toEqual([false, true]);
    expect([at(0, -175), at(0, -175.5)]).toEqual([false, true]);
  });
});

describe("bouncing off each edge", () => {
  const bounce = (x: number, y: number, direction: number) => {
    const sprite = dot(box(), { x, y, direction, rotationStyle: "don't rotate" });
    sprite.ifOnEdgeBounce();
    return sprite.direction;
  };

  test("mirrors the direction off the edge it hits", () => {
    expect(bounce(-236, 0, -45)).toBeCloseTo(45, 9);
    expect(bounce(0, 176, 45)).toBeCloseTo(135, 9);
    expect(bounce(236, 0, 45)).toBeCloseTo(-45, 9);
    expect(bounce(0, -176, 135)).toBeCloseTo(45, 9);
  });

  test("moving along an edge still turns away from it a little", () => {
    const turn = (Math.atan2(1, 0.2) * 180) / Math.PI - 90;
    expect(bounce(-236, 0, 0)).toBeCloseTo(-turn, 9);
    expect(bounce(0, 176, 90)).toBeCloseTo(90 - turn, 9);
    expect(bounce(236, 0, 0)).toBeCloseTo(turn, 9);
    expect(bounce(0, -176, 90)).toBeCloseTo(90 + turn, 9);
  });

  test("in a corner, the left edge wins over the top, as in Scratch", () => {
    expect(bounce(-236, 176, -45)).toBeCloseTo(45, 9);
  });
});

describe("pixel masks", () => {
  // 4x3 costume units at 2 pixels per unit, starting at (1, 2). With the center
  // at 0,0 a stage point (x, y) is costume point (x, -y).
  const masked = () => {
    const costume = box({ x: 1, y: 2, width: 4, height: 3, centerX: 0, centerY: 0 });
    const data = new Uint8Array(8 * 6);
    for (const [i, j] of [
      [0, 0],
      [6, 0],
      [7, 0],
      [0, 1],
      [7, 5],
    ] as const)
      data[j * 8 + i] = 1;
    costume.mask = { width: 8, height: 6, scale: 2, data };
    return dot(costume);
  };

  test("finds the opaque pixel under a stage point", () => {
    const sprite = masked();
    const opaque = (x: number, y: number) => sprite.isOpaqueAt(x, y);
    expect(opaque(1.1, -2.1)).toBe(true);
    expect(opaque(1.1, -2.6)).toBe(true);
    expect(opaque(4.9, -4.9)).toBe(true);
    expect(opaque(1.6, -2.1)).toBe(false);
    expect(opaque(2.1, -2.6)).toBe(false);
    expect(opaque(1.1, -3.1)).toBe(false);
  });

  test("points just outside the mask don't wrap to the next row", () => {
    const sprite = masked();
    expect(sprite.isOpaqueAt(0.9, -2.6)).toBe(false);
    expect(sprite.isOpaqueAt(5.1, -2.1)).toBe(false);
  });

  test("without a mask, the opaque area is a box that includes its top-left edge only", () => {
    const sprite = dot(box({ centerX: 0, centerY: 0, opaque: { left: 1, top: 2, right: 3, bottom: 4 } }));
    const opaque = (x: number, y: number) => sprite.isOpaqueAt(x, y);
    expect([opaque(1, -3), opaque(2, -2)]).toEqual([true, true]);
    expect([opaque(3, -3), opaque(2, -4)]).toEqual([false, false]);
    expect([opaque(0.5, -3), opaque(3.5, -3), opaque(2, -1.5), opaque(2, -4.5)]).toEqual([false, false, false, false]);
  });

  test("overlapping boxes only touch where both have pixels", () => {
    // Opaque top-left and bottom-right pixels, so the box is the whole costume.
    const costume = box({ width: 4, height: 4, centerX: 0, centerY: 0 });
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    rgba[3] = 255;
    rgba[(3 * 4 + 3) * 4 + 3] = 255;
    applyMask(costume, rgba, 4, 4, 1);
    const at = (x: number, y: number) =>
      new Sprite("dot", [costume], { x, y, direction: 90, size: 100, costume: 0, visible: true, rotationStyle: "all around" });
    expect(at(0, 0).isTouching(at(3, 0))).toBe(false);
    expect(at(0, 0).isTouching(at(3, -3))).toBe(true);
  });

  const rgbaWith = (width: number, height: number, pixels: [number, number][]) => {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (const [i, j] of pixels) rgba[(j * width + i) * 4 + 3] = 255;
    return rgba;
  };

  test("a mask records its pixels and the opaque area in costume units", () => {
    const costume = box({ x: 1, y: 2, width: 3, height: 2 });
    applyMask(costume, rgbaWith(6, 4, [[0, 1], [4, 2], [2, 3]]), 6, 4, 2);
    const expected = new Uint8Array(24);
    for (const i of [6, 16, 20]) expected[i] = 1;
    expect(costume.mask).toEqual({ width: 6, height: 4, scale: 2, data: expected });
    expect(costume.opaque).toEqual({ left: 1, top: 2.5, right: 3.5, bottom: 4 });

    const single = box({ x: 1, y: 2, width: 3, height: 2 });
    applyMask(single, rgbaWith(6, 4, [[3, 1]]), 6, 4, 2);
    expect(single.opaque).toEqual({ left: 2.5, top: 2.5, right: 3, bottom: 3 });
  });

  test("a see-through costume has no opaque area, and measured ones are kept", () => {
    const empty = box();
    applyMask(empty, new Uint8ClampedArray(4 * 4 * 4), 4, 4, 1);
    expect(empty.opaque).toBeUndefined();
    const measured = box({ opaque: { left: 0, top: 0, right: 1, bottom: 1 } });
    applyMask(measured, rgbaWith(4, 4, [[3, 3]]), 4, 4, 1);
    expect(measured.opaque).toEqual({ left: 0, top: 0, right: 1, bottom: 1 });
  });
});
