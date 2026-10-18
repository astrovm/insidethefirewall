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
