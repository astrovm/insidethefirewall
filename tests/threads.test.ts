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

describe("scheduler edge cases", () => {
  test("a script stopped earlier in the frame doesn't run that frame", () => {
    const world = worldWith([
      {
        hat: { broadcast: "stopper" },
        run: function* (w, self) {
          yield;
          w.stopOtherScripts(self);
        },
      },
      {
        hat: { broadcast: "counter" },
        run: function* (w) {
          for (;;) {
            w.vars.n! += 1;
            yield;
          }
        },
      },
    ]);
    world.broadcast("stopper");
    world.broadcast("counter");
    world.step();
    world.step();
    expect(world.vars.n).toBe(1);
  });

  test("a waiter sees a script that finished earlier in the same frame as done", () => {
    const world = worldWith([
      {
        hat: { broadcast: "go" },
        run: function* () {
          yield;
          yield;
        },
      },
      {
        hat: { key: "w" },
        run: function* (w) {
          yield* w.broadcastAndWait("go");
          w.vars.n = w.tick;
        },
      },
    ]);
    // "go" already runs, so the restart keeps its place ahead of the waiter.
    world.broadcast("go");
    world.keyDown("w");
    for (let i = 0; i < 6; i++) world.step();
    expect(world.vars.n).toBe(4);
  });

  test("broadcast and wait waits for every script that got the message", () => {
    const world = worldWith(
      [
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
          },
        },
      ],
      [
        {
          hat: { broadcast: "go" },
          run: function* () {
            yield;
            yield;
            yield;
          },
        },
      ],
    );
    world.greenFlag();
    for (let i = 0; i < 8; i++) world.step();
    expect(world.vars.n).toBe(5);
  });
});

describe("glide", () => {
  const glider = (seconds: number) =>
    worldWith([
      {
        hat: { flag: true },
        run: function* (w, self) {
          yield* w.glide(self, seconds, 30, -60);
          w.vars.n = w.tick;
        },
      },
    ]);

  test("moves a share of the way each frame and ends when the time is up", () => {
    const world = glider(0.1);
    const sprite = world.sprite("a");
    world.greenFlag();
    const path: number[][] = [];
    for (let i = 0; i < 4; i++) {
      world.step();
      path.push([Math.round(sprite.x * 1000) / 1000, Math.round(sprite.y * 1000) / 1000]);
    }
    expect(path).toEqual([
      [0, 0],
      [10, -20],
      [20, -40],
      [30, -60],
    ]);
    expect(world.vars.n).toBe(4);
  });

  test("a zero second glide jumps there in the same frame", () => {
    const world = glider(0);
    world.greenFlag();
    world.step();
    expect([world.sprite("a").x, world.sprite("a").y]).toEqual([30, -60]);
    expect(world.vars.n).toBe(1);
  });
});

describe("world", () => {
  test("starts like a saved Scratch project", () => {
    const world = worldWith([]);
    expect(world.mouse).toEqual({ x: -240, y: 180 });
    expect(world.soundEvents).toEqual([]);
    expect(world.layers).toEqual(["a", "b"]);
    expect(() => world.sprite("nope")).toThrow("No sprite nope");
  });

  test("clicks start the clicked sprite's scripts, restarting them", () => {
    const world = worldWith(
      [],
      [
        {
          hat: { click: true },
          run: function* (w) {
            w.vars.n = 0;
            for (;;) {
              w.vars.n! += 1;
              yield;
            }
          },
        },
      ],
    );
    world.mouseDown(100, 100);
    world.step();
    expect(world.mouse).toEqual({ x: 100, y: 100 });
    expect(world.vars.n).toBe(0);
    world.mouseDown(0.5, -0.5);
    for (let i = 0; i < 3; i++) world.step();
    expect(world.vars.n).toBe(3);
    world.mouseDown(0.5, -0.5);
    world.step();
    expect(world.vars.n).toBe(1);
  });

  test("stop silences every sound", () => {
    const world = worldWith([]);
    world.stopAll();
    expect(world.soundEvents).toEqual([{ type: "stopAll" }]);
  });

  test("keeps where visible sprites were before each frame, for drawing in between", () => {
    const world = worldWith([
      {
        hat: { flag: true },
        run: function* (_w, self) {
          for (;;) {
            self.x += 1;
            yield;
          }
        },
      },
    ]);
    world.greenFlag();
    world.step();
    world.step();
    expect(world.previous.get("a")?.x).toBe(1);
    expect(world.previous.has("b")).toBe(true);
    world.sprite("b").visible = false;
    world.step();
    expect(world.previous.has("b")).toBe(false);
  });

  test("go to front moves a sprite to the top, once", () => {
    const world = worldWith([]);
    world.goToFront(world.sprite("a"));
    world.goToFront(world.sprite("a"));
    expect(world.layers).toEqual(["b", "a"]);
  });

  test("pick random includes both ends, in either order", () => {
    const low = new World(worldWith([]).project, () => 0);
    const high = new World(worldWith([]).project, () => 0.99999);
    expect([low.randomInt(5, 10), low.randomInt(10, 5)]).toEqual([5, 5]);
    expect([high.randomInt(5, 10), high.randomInt(10, 5)]).toEqual([10, 10]);
  });
});
