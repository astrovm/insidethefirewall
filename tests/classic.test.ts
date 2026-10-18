import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { World } from "../src/engine/world.ts";
import { createClassic } from "../src/game/classic.ts";
import { newWorld, press, run, runUntil, soundsPlayed, startGame, touchPlayer } from "./support.ts";

/** A world where every "pick random" gives the same share of its range. */
function fixedWorld(share: number): World {
  const world = new World(createClassic(), () => share);
  world.greenFlag();
  world.step();
  return world;
}

/** Plays until the virus ends the game. */
function gameOver(world = newWorld()): World {
  startGame(world);
  run(world, 31);
  touchPlayer(world);
  runUntil(world, () => world.sprite("gameOver").visible, 20);
  return world;
}

/** Holds R for a frame, which is how long Scratch needs to notice it. */
function holdR(world: World): void {
  world.keyDown("r");
  world.step();
  world.keyUp("r");
  world.step();
}

describe("title screen", () => {
  test("before the green flag, the monitors are hidden as saved", () => {
    expect(new World(createClassic()).monitors).toEqual({ health: false, time: false });
  });

  test("shows the title and the Play button, with the monitors hidden", () => {
    const world = newWorld();
    expect(world.sprite("title").visible).toBe(true);
    expect(world.layers.slice(-2)).toEqual(["title", "play"]);
    expect(world.sprite("play").visible).toBe(true);
    expect(world.monitors).toEqual({ health: false, time: false });
    expect(world.vars.time).toBe(-1);
  });

  test("the Play button lights up under the pointer", () => {
    const world = newWorld();
    world.mouseMove(0, 20);
    world.step();
    expect(world.sprite("play").currentCostume.name).toBe("play-hover");
    world.mouseMove(200, 150);
    world.step();
    expect(world.sprite("play").currentCostume.name).toBe("play");
  });

  test("jump keys do nothing before the game starts", () => {
    const world = newWorld();
    press(world, "w");
    run(world, 10);
    expect(world.sprite("player").y).toBe(-100);
  });

  for (const key of ["space", "r"]) {
    test(`${key} plays the laser and starts the game`, () => {
      const world = newWorld(7);
      world.soundEvents = [];
      press(world, key);
      const ticks = runUntil(world, () => world.vars.time === 0, 20);
      expect(ticks).toBeLessThanOrEqual(5);
      expect(soundsPlayed(world)).toEqual(["laser", "stop", "music"]);
      const player = world.sprite("player");
      expect(player.y).toBe(-100);
      expect(Number.isInteger(player.x) && player.x >= -205 && player.x <= 205).toBe(true);
      expect(world.sprite("title").visible).toBe(false);
      expect(world.sprite("play").visible).toBe(false);
      expect(world.monitors).toEqual({ health: true, time: true });
      expect(world.vars).toMatchObject({ health: 1, speed: 5.5 });
    });
  }

  test("clicking Play starts the game, clicking elsewhere doesn't", () => {
    const world = newWorld();
    world.mouseDown(200, 150);
    run(world, 10);
    expect(world.vars.time).toBe(-1);
    world.mouseDown(0, 20);
    runUntil(world, () => world.vars.time === 0, 20);
  });
});

describe("playing", () => {
  test("the timer ticks after 30 frames, then every 31, like Scratch's loop did", () => {
    const world = newWorld();
    startGame(world);
    const start = world.tick;
    // Keep the virus away so the game keeps going.
    const seen: number[][] = [];
    for (let i = 0; i < 100; i++) {
      world.sprite("virus").setXY(-1, 134);
      const before = world.vars.time;
      world.step();
      if (world.vars.time !== before) seen.push([world.tick - start, world.vars.time!]);
    }
    expect(seen).toEqual([
      [30, 1],
      [61, 2],
      [92, 3],
    ]);
  });

  test("the virus waits 0.2 seconds, then flies at the player at 5.5 per frame", () => {
    const world = newWorld(3);
    startGame(world);
    const virus = world.sprite("virus");
    const player = world.sprite("player");
    expect([virus.x, virus.y]).toEqual([-1, 134]);
    run(world, 5);
    expect([virus.x, virus.y]).toEqual([-1, 134]);
    run(world, 1);
    const moved = Math.hypot(virus.x + 1, virus.y - 134);
    expect(moved).toBeCloseTo(5.5, 6);
    const expected = 90 - (Math.atan2(player.y - 134, player.x + 1) * 180) / Math.PI;
    expect(virus.direction).toBeCloseTo(expected > 180 ? expected - 360 : expected, 6);
  });

  test("the virus speeds up by 0.9 after a random 5 to 10 whole seconds", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (seed) => {
        const world = newWorld(seed);
        startGame(world);
        const start = world.tick;
        for (let i = 0; i < 400 && world.vars.speed === 5.5; i++) {
          world.sprite("virus").setXY(-1, 134);
          world.step();
        }
        const waited = world.tick - start;
        expect(world.vars.speed).toBeCloseTo(6.4, 9);
        expect(waited % 30).toBe(0);
        expect(waited / 30).toBeGreaterThanOrEqual(5);
        expect(waited / 30).toBeLessThanOrEqual(10);
      }),
      { numRuns: 25 },
    );
  });

  test("the virus respawns when it reaches the edge", () => {
    const world = newWorld();
    startGame(world);
    run(world, 40);
    const virus = world.sprite("virus");
    virus.setXY(-300, 0);
    world.step();
    expect(virus.x).not.toBe(-300);
    expect(Math.hypot(virus.x + 1, virus.y - 134)).toBeLessThanOrEqual(world.vars.speed! + 1e-9);
  });

  test("getting hit costs 1 health 0.2 seconds later, then it's game over", () => {
    const world = newWorld();
    startGame(world);
    run(world, 31);
    world.soundEvents = [];
    touchPlayer(world);
    world.step();
    expect(world.sprite("player").currentCostume.name).toBe("hit");
    run(world, 5);
    expect(world.vars.health).toBe(1);
    world.step();
    expect(world.vars.health).toBe(0);
    const player = world.sprite("player");
    expect([player.x, player.y, player.direction]).toEqual([208, -115, -90]);
    expect(world.sprite("gameOver").visible).toBe(true);
    expect(soundsPlayed(world)).toContain("death");
    const time = world.vars.time;
    run(world, 100);
    expect(world.vars.time).toBe(time);
  });

  test("the virus can't hurt you during the first second", () => {
    const world = newWorld();
    startGame(world);
    run(world, 10);
    touchPlayer(world);
    world.step();
    run(world, 10);
    expect(world.vars.health).toBe(1);
  });

  test("R on the game over screen starts a new game", () => {
    const world = gameOver();
    world.vars.speed = 9;
    holdR(world);
    expect(world.vars).toMatchObject({ health: 1, time: 0, speed: 5.5 });
    expect(world.sprite("gameOver").visible).toBe(false);
    expect(world.sprite("player").y).toBe(-100);
  });

  test("jumping goes up to y -25 and back down in 0.3 seconds", () => {
    const world = newWorld();
    startGame(world);
    const player = world.sprite("player");
    // Walk first, so the movement scripts are already running, as in a real game.
    world.keyDown("a");
    world.step();
    world.keyUp("a");
    world.step();
    const x = player.x;
    world.keyDown("w");
    world.keyUp("w");
    const ys: number[] = [];
    for (let i = 0; i < 11; i++) {
      world.step();
      // Hold right once the jump has started.
      world.keyDown("d");
      ys.push(Math.round(player.y * 100) / 100);
      // The jump pins the player's x, so you can't steer mid-air.
      expect(player.x).toBe(x);
    }
    expect(ys).toEqual([-100, -83.33, -66.67, -50, -33.33, -25, -41.67, -58.33, -75, -91.67, -100]);
    world.step();
    expect(player.x).toBe(x + 20);
    world.keyUp("d");
  });

  test("walking moves 20 pixels a frame and stops at the edge", () => {
    const world = newWorld();
    startGame(world);
    run(world, 2);
    const player = world.sprite("player");
    const x = player.x;
    world.keyDown("d");
    world.step();
    expect(player.x).toBe(Math.min(x + 20, 249));
    expect(player.currentCostume.name).toBe("walk1");
    run(world, 30);
    expect(player.x).toBe(249);
    world.keyUp("d");
    world.keyDown("left arrow");
    world.step();
    expect(player.x).toBe(229);
    expect(player.direction).toBe(-90);
  });

  test("S crouches, also while walking", () => {
    const world = newWorld();
    startGame(world);
    const player = world.sprite("player");
    world.keyDown("s");
    world.step();
    expect(player.currentCostume.name).toBe("crouch");
    world.keyDown("a");
    world.step();
    expect(player.currentCostume.name).toBe("crouch");
    world.keyUp("s");
    world.step();
    expect(player.currentCostume.name).toBe("walk1");
    world.keyUp("a");
    world.step();
    expect(player.currentCostume.name).toBe("normal");
  });
});

describe("health pickup", () => {
  /** Plays until the pickup shows up, keeping the virus out of the way. */
  function untilPickup(seed: number) {
    const world = newWorld(seed);
    startGame(world);
    const start = world.tick;
    const pickup = world.sprite("pickup");
    runUntil(world, () => {
      world.sprite("virus").setXY(-1, 134);
      return pickup.visible;
    });
    return { world, pickup, waited: world.tick - start };
  }

  test("shows up every 10 seconds for 2 seconds, at the jump height", () => {
    const { world, pickup, waited } = untilPickup(5);
    expect(waited).toBe(300);
    expect(pickup.y).toBe(-25);
    const shown = runUntil(world, () => {
      world.sprite("virus").setXY(-1, 134);
      return !pickup.visible;
    });
    expect(shown).toBe(60);
  });

  test("touching it gives 1 health and hides it", () => {
    const { world, pickup } = untilPickup(5);
    const player = world.sprite("player");
    const [x, y] = pickup.toStage(30, 30);
    player.x = x;
    player.y = y;
    world.step();
    expect(world.vars.health).toBe(2);
    expect(pickup.visible).toBe(false);
    world.step();
    expect(world.vars.health).toBe(2);
  });

  test("a hidden pickup gives nothing", () => {
    const world = newWorld();
    startGame(world);
    const pickup = world.sprite("pickup");
    const player = world.sprite("player");
    const [x, y] = pickup.toStage(30, 30);
    player.x = x;
    player.y = y;
    run(world, 5);
    expect(world.vars.health).toBe(1);
  });
});

describe("game over screen", () => {
  test("you can still walk and jump around, like in 2013", () => {
    const world = gameOver();
    const player = world.sprite("player");
    world.keyDown("left arrow");
    world.step();
    world.keyUp("left arrow");
    expect(player.x).toBe(188);
    press(world, "space");
    run(world, 5);
    expect(player.y).toBeGreaterThan(-115);
  });

  test("GLaDOS speaks 6 seconds in, and the HL3 logo meows when clicked", () => {
    const world = gameOver();
    world.soundEvents = [];
    run(world, 181);
    expect(soundsPlayed(world)).toContain("glados");
    const hl3 = world.sprite("hl3");
    runUntil(world, () => hl3.visible, 400);
    world.soundEvents = [];
    world.mouseDown(hl3.x, hl3.y);
    world.step();
    expect(soundsPlayed(world)).toEqual(["meow"]);
    expect(hl3.visible).toBe(false);
  });
});

test("the green flag goes back to the title screen", () => {
  const world = newWorld();
  startGame(world);
  run(world, 20);
  world.greenFlag();
  world.step();
  expect(world.sprite("title").visible).toBe(true);
  expect(world.sprite("play").visible).toBe(true);
  expect(world.vars.time).toBe(-1);
});

test("stop freezes everything", () => {
  const world = newWorld();
  startGame(world);
  run(world, 20);
  world.stopAll();
  const virus = world.sprite("virus").snapshot();
  run(world, 20);
  expect(world.sprite("virus").snapshot()).toEqual(virus);
  expect(world.scheduler.threads).toEqual([]);
});

describe("controls", () => {
  test("the arrow keys work as the first key pressed too", () => {
    const right = newWorld();
    startGame(right);
    const x = right.sprite("player").x;
    right.keyDown("right arrow");
    right.step();
    expect(right.sprite("player").x).toBe(Math.min(x + 20, 249));

    const down = newWorld();
    startGame(down);
    down.keyDown("down arrow");
    down.step();
    expect(down.sprite("player").currentCostume.name).toBe("crouch");

    const up = newWorld();
    startGame(up);
    press(up, "up arrow");
    run(up, 3);
    expect(up.sprite("player").y).toBeGreaterThan(-100);
  });

  test("crouching while already walking crouches", () => {
    const world = newWorld();
    startGame(world);
    const player = world.sprite("player");
    world.keyDown("d");
    world.step();
    expect(player.currentCostume.name).toBe("walk1");
    world.keyDown("s");
    world.step();
    expect(player.currentCostume.name).toBe("crouch");
  });

  test("Space during a game jumps, it doesn't restart the game", () => {
    const world = newWorld();
    startGame(world);
    // Let the Space that started the game finish first.
    run(world, 5);
    world.soundEvents = [];
    press(world, "space");
    run(world, 3);
    expect(soundsPlayed(world)).not.toContain("laser");
    expect(world.sprite("player").y).toBeGreaterThan(-100);
  });
});

describe("random spots", () => {
  test("the player starts anywhere from x -205 to 205", () => {
    for (const [share, x] of [
      [0, -205],
      [0.99999, 205],
    ] as const) {
      const world = fixedWorld(share);
      startGame(world);
      expect([world.sprite("player").x, world.sprite("player").y]).toEqual([x, -100]);
    }
  });

  test("the penguin shows up from x -120, and bounces back in near the right edge", () => {
    const show = (share: number) => {
      const world = fixedWorld(share);
      startGame(world);
      const pickup = world.sprite("pickup");
      runUntil(world, () => {
        world.sprite("virus").setXY(-1, 134);
        return pickup.visible;
      });
      return pickup;
    };
    const left = show(0);
    expect([left.x, left.direction]).toEqual([-120, 90]);
    const right = show(0.99999);
    expect(right.direction).toBe(-90);
  });
});

describe("the virus", () => {
  const towards = (from: [number, number], to: { x: number; y: number }) => {
    const direction = 90 - (Math.atan2(to.y - from[1], to.x - from[0]) * 180) / Math.PI;
    return direction > 180 ? direction - 360 : direction;
  };

  test("after reaching the edge it aims at where the player is now", () => {
    const world = newWorld();
    startGame(world);
    run(world, 40);
    const player = world.sprite("player");
    player.x = player.x > 0 ? -150 : 150;
    const virus = world.sprite("virus");
    virus.setXY(-300, 0);
    world.step();
    expect(virus.direction).toBeCloseTo(towards([-1, 134], player), 9);
  });

  test("after a hit it flies back to the top and aims again", () => {
    const world = newWorld();
    startGame(world);
    run(world, 31);
    touchPlayer(world);
    run(world, 3);
    const virus = world.sprite("virus");
    expect(Math.hypot(virus.x + 1, virus.y - 134)).toBeLessThanOrEqual(2 * world.vars.speed! + 1e-9);
    expect(virus.direction).toBeCloseTo(towards([-1, 134], world.sprite("player")), 9);
  });
});

describe("game over details", () => {
  test("plays the death sound, keeps the music stopped and draws the right things on top", () => {
    const world = newWorld();
    startGame(world);
    run(world, 31);
    world.soundEvents = [];
    touchPlayer(world);
    runUntil(world, () => world.sprite("gameOver").visible, 20);
    run(world, 10);
    expect(soundsPlayed(world)).toEqual(["stop", "death"]);
    expect(world.layers).toEqual(["gameOver", "title", "play", "virus", "monitor", "player", "pickup", "hl3"]);
  });

  test("the virus can't take more health once the game is over", () => {
    const world = gameOver();
    for (let i = 0; i < 20; i++) {
      touchPlayer(world);
      world.step();
    }
    expect(world.vars.health).toBe(0);
  });

  test("the penguin sits next to the player, facing right", () => {
    const world = newWorld();
    world.sprite("pickup").direction = -90;
    gameOver(world);
    const pickup = world.sprite("pickup");
    expect([pickup.visible, pickup.x, pickup.y, pickup.direction]).toEqual([true, -124, -115, 90]);
  });

  test("the HL3 logo shows up at 10 and 14 seconds, then every 14 seconds, for 2 seconds each", () => {
    const world = gameOver();
    const start = world.tick;
    const hl3 = world.sprite("hl3");
    const shows: number[] = [];
    const hides: number[] = [];
    let visible = false;
    for (let i = 0; i < 1000; i++) {
      world.step();
      if (hl3.visible !== visible) (hl3.visible ? shows : hides).push(world.tick - start);
      visible = hl3.visible;
    }
    expect(shows).toEqual([300, 421, 723, 844]);
    expect(hides).toEqual([360, 481, 783, 904]);
  });

  test("the HL3 logo jumps to random spots and turns 30 degrees each time", () => {
    const spots = (share: number) => {
      const world = gameOver(fixedWorld(share));
      const hl3 = world.sprite("hl3");
      const seen: number[][] = [];
      let visible = false;
      for (let i = 0; i < 500; i++) {
        world.step();
        if (hl3.visible && !visible) seen.push([hl3.x, hl3.y, Math.round(hl3.direction)]);
        visible = hl3.visible;
      }
      return seen;
    };
    expect(spots(0.5)).toEqual([
      [0, 0, -45],
      [0, 0, -15],
    ]);
    expect(spots(0)[0]).toEqual([-200, -150, -45]);
    // Near the top it would point off the stage, so it bounces down.
    expect(spots(0.99999)[0]).toEqual([200, 150, -135]);
  });

  test("R starts clean: no game over sounds, logo or second restart", () => {
    const world = gameOver();
    const hl3 = world.sprite("hl3");
    runUntil(world, () => hl3.visible, 400);
    holdR(world);
    expect(hl3.visible).toBe(false);
    world.soundEvents = [];
    for (let i = 0; i < 400; i++) {
      world.sprite("virus").setXY(-1, 134);
      world.step();
      expect(hl3.visible).toBe(false);
    }
    expect(soundsPlayed(world)).not.toContain("glados");
    const time = world.vars.time!;
    holdR(world);
    expect(world.vars.time).toBeGreaterThanOrEqual(time);
  });

  test("the green flag clears the game over screen", () => {
    const world = gameOver();
    world.greenFlag();
    world.step();
    expect(world.sprite("gameOver").visible).toBe(false);
    expect(world.sprite("pickup").visible).toBe(false);
    expect(world.layers.slice(-2)).toEqual(["title", "play"]);
  });
});
