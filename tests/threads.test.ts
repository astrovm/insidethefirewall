import { describe, expect, test } from "bun:test";
import { Sprite } from "../src/engine/sprite.ts";
import { World, type ScriptDef } from "../src/engine/world.ts";

function worldWith(scripts: ScriptDef[], extra: ScriptDef[] = []): World {
  const sprite = (name: string) =>
    new Sprite(
      name,
      [{ name: "c", file: "c.svg", x: 0, y: 0, width: 1, height: 1, centerX: 0, centerY: 0, smooth: true }],
      { x: 0, y: 0, direction: 90, size: 100, costume: 0, visible: true, rotationStyle: "all around" },
    );
  return new World({
    stage: sprite("stage").currentCostume,
    sprites: [
      { sprite: sprite("a"), scripts },
      { sprite: sprite("b"), scripts: extra },
    ],
    variables: { n: 0, log: 0 },
    monitors: [],
    sounds: { beep: 0.5 },
  });
}

describe("Scratch thread timing", () => {
  test("a forever loop with wait 1 ticks every 31 frames, like the 2013 timer", () => {
    const changes: number[] = [];
    const world = worldWith([
      {
        hat: { flag: true },
        run: function* (w) {
          for (;;) {
            yield* w.wait(1);
            w.vars.n! += 1;
            changes.push(w.tick);
            yield;
          }
        },
      },
    ]);
    world.greenFlag();
    for (let i = 0; i < 100; i++) world.step();
    expect(changes).toEqual([31, 62, 93]);
  });

  test("threads started during a frame run in that same frame", () => {
    const world = worldWith([
      {
        hat: { flag: true },
        run: function* (w) {
          w.broadcast("go");
        },
      },
      {
        hat: { broadcast: "go" },
        run: function* (w) {
          w.vars.n = w.tick;
        },
      },
    ]);
    world.greenFlag();
    world.step();
    expect(world.vars.n).toBe(1);
  });

  test("a broadcast restarts a running script from the top", () => {
    const world = worldWith([
      {
        hat: { broadcast: "go" },
        run: function* (w) {
          w.vars.n = 0;
          for (;;) {
            w.vars.n! += 1;
            yield;
          }
        },
      },
    ]);
    world.broadcast("go");
    for (let i = 0; i < 5; i++) world.step();
    expect(world.vars.n).toBe(5);
    world.broadcast("go");
    world.step();
    expect(world.vars.n).toBe(1);
  });

  test("a key press is ignored while its script is still running", () => {
    const world = worldWith([
      {
        hat: { key: "w" },
        run: function* (w) {
          w.vars.n! += 1;
          yield* w.wait(1);
        },
      },
    ]);
    world.keyDown("w");
    world.step();
    world.keyDown("w");
    world.step();
    expect(world.vars.n).toBe(1);
    for (let i = 0; i < 31; i++) world.step();
    world.keyDown("w");
    world.step();
    expect(world.vars.n).toBe(2);
  });

  test("broadcast and wait continues the frame after the other scripts finish", () => {
    const world = worldWith([
      {
        hat: { flag: true },
        run: function* (w) {
          yield* w.broadcastAndWait("go");
          w.vars.n = w.tick;
        },
      },
      {
        hat: { broadcast: "go" },
        run: function* () {
          yield;
          yield;
        },
      },
    ]);
    world.greenFlag();
    for (let i = 0; i < 5; i++) world.step();
    expect(world.vars.n).toBe(4);
  });

  test("when a broadcast restarts a script, an earlier waiter stops waiting", () => {
    // Pressing W then Space mid-jump in the 2013 game frees the W key, as in TurboWarp.
    const world = worldWith([
      {
        hat: { key: "w" },
        run: function* (w) {
          yield* w.broadcastAndWait("go");
          w.vars.log = w.tick;
        },
      },
      {
        hat: { key: "space" },
        run: function* (w) {
          yield* w.broadcastAndWait("go");
        },
      },
      {
        hat: { broadcast: "go" },
        run: function* (w) {
          yield* w.wait(1);
        },
      },
    ]);
    world.keyDown("w");
    world.step();
    world.keyDown("space");
    world.step();
    world.step();
    expect(world.vars.log).toBe(3);
  });

  test("stop other scripts stops the sprite's other scripts only", () => {
    const world = worldWith(
      [
        {
          hat: { flag: true },
          run: function* (w) {
            for (;;) {
              w.vars.n! += 1;
              yield;
            }
          },
        },
        {
          hat: { broadcast: "stop" },
          run: function* (w, self) {
            w.stopOtherScripts(self);
            yield;
            w.vars.log = 1;
          },
        },
      ],
      [
        {
          hat: { flag: true },
          run: function* (w) {
            for (;;) {
              w.vars.log! -= 0;
              yield;
            }
          },
        },
      ],
    );
    world.greenFlag();
    world.step();
    world.broadcast("stop");
    world.step();
    const n = world.vars.n;
    world.step();
    expect(world.vars.n).toBe(n);
    expect(world.vars.log).toBe(1);
    expect(world.scheduler.threads.map((t) => t.owner)).toEqual(["b"]);
  });

  test("play until done waits for the sound, or stops early when all sounds stop", () => {
    const world = worldWith([
      {
        hat: { broadcast: "play" },
        run: function* (w, self) {
          yield* w.playUntilDone(self, "beep");
          w.vars.n = w.tick;
        },
      },
    ]);
    world.broadcast("play");
    for (let i = 0; i < 20; i++) world.step();
    // Starts on frame 1, and half a second is 15 frames later.
    expect(world.vars.n).toBe(16);
    world.broadcast("play");
    world.step();
    world.stopAllSounds();
    world.step();
    expect(world.vars.n).toBe(22);
  });
});
