import { describe, expect, test } from "bun:test";
import { Controls, moveForKey } from "../src/input.ts";
import { Fader } from "../src/remaster/fader.ts";
import {
  AIM_LOCK,
  DEATH_PAUSE,
  DT,
  HZ,
  RUN_ACCELERATION,
  RUN_BRAKING,
  Game,
  GROUND_Y,
  HIT_STOP,
  hl3Shown,
  INVINCIBLE,
  JUMP_BUFFER,
  JUMP_HEIGHT,
  noInput,
  PICKUP_BLINK,
  DROP_FIRST,
  PENGUIN_CHANCE,
  PICKUP_SHOWN,
  PLAYER_SPEED,
  VIRUS_SPAWN,
  VIRUS_START_SPEED,
  VIRUS_FAST,
  VIRUS_SPEEDUP,
  CEILING_Y,
  ESCAPE_BURST,
  ESCAPE_STUCK,
  FLY_SPEED,
  POWER_UP_SHOWN,
  POWER_UP_TIME,
  POWER_UPS,
  WARNING_LONGEST,
  WARNING_SHORTEST,
  MAX_HEALTH,
  NEAR_MISS,
  PENGUIN_SHIELD,
  REPLAY_SECONDS,
  RETRY_LOCK,
  gap,
  replayFrame,
  SCREEN,
  SCREEN_ROOM,
  toOuterRoom,
  type GameEvent,
  type Input,
  type PowerUpKind,
  cellShapes,
  THIRD_CELL,
  THIRD_IN,
  THIRD_JUMP,
  THIRD_RADIUS,
  KICK_TIME,
  shapesNear,
  shapeTop,
  standOn,
  floorUnder,
  THIRD_STEP,
  type Shape,
  thirdCell,
  WRECK_BURN,
} from "../src/remaster/game.ts";
import { crashIntoRound, driveCar, HALF_WIDTH, HIT_POINTS, METER, parkedCar, type Car, type CarControls } from "../src/remaster/car.ts";
import { cellCoins, cellRamp, rampHeight, ROAD_HALF_WIDTH, roadX, roadZ, TRAFFIC_COUNT } from "../src/remaster/streets.ts";
import { ESCAPE_ZOOM, escapeZoom, fitStage, formatTime, toCanvas, toStage, zoomView } from "../src/remaster/render.ts";
import { seeded } from "./support.ts";

const hold = (input: Partial<Input>): Input => ({ ...noInput, ...input });

function started(seed = 1): Game {
  const game = new Game(seeded(seed));
  game.start();
  game.events.length = 0;
  return game;
}

function run(game: Game, seconds: number, input: Partial<Input> = {}): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(hold(input));
}

/** Keeps the virus away so tests can look at one thing at a time. */
function parkVirus(game: Game): void {
  game.virus.visible = false;
  game.warning = Infinity;
}

const types = (events: GameEvent[]) => events.map((event) => event.type);

/** Makes the next thing to show up the penguin or a power-up, instead of leaving it to chance. */
function nextDrop(game: Game, drop: "penguin" | "powerUp"): void {
  (game as unknown as { nextDrop: string }).nextDrop = drop;
}

/** Takes the last heart and waits out the pause before the game over screen. */
function die(game: Game): void {
  game.health = 0;
  run(game, DT + DEATH_PAUSE);
}

/** Under the middle of the penguin, which is drawn left of its position. */
function underPenguin(game: Game): number {
  return game.pickup.x - 67;
}

/** Lets the virus out of the monitor. */
function launch(game: Game): void {
  run(game, game.warning);
  game.events.length = 0;
}

describe("starting", () => {
  test("the game opens on the title screen with nothing on stage", () => {
    const game = new Game(seeded(1));
    expect(game.phase).toBe("title");
    expect(game.layers).toEqual([]);
    expect(game.events).toEqual([{ type: "music", playing: false }]);
  });

  test("a new game puts the player on the floor and the virus in the monitor", () => {
    const game = new Game(seeded(3));
    game.start();
    expect(game.phase).toBe("playing");
    expect([game.health, game.time, game.speed]).toEqual([1, 0, VIRUS_START_SPEED]);
    expect(game.player.y).toBe(GROUND_Y);
    expect(game.player.x).toBeGreaterThanOrEqual(-205);
    expect(game.player.x).toBeLessThanOrEqual(205);
    expect([game.virus.x, game.virus.y]).toEqual([VIRUS_SPAWN.x, VIRUS_SPAWN.y]);
    expect(game.layers.map((s) => s.name)).toEqual(["pickup", "powerUp", "player", "monitor", "virus"]);
    expect(game.pickup.visible).toBe(false);
    expect(game.events.at(-1)).toEqual({ type: "music", playing: true });
  });

  test("starting again resets everything", () => {
    const game = started();
    game.health = 4;
    game.speed = 999;
    run(game, 3, { left: true });
    game.start();
    expect([game.health, game.time, game.speed]).toEqual([1, 0, VIRUS_START_SPEED]);
    expect(game.player.direction).toBe(90);
    expect([game.virus.x, game.virus.y]).toEqual([VIRUS_SPAWN.x, VIRUS_SPAWN.y]);
    expect([game.monitor.visible, game.monitor.x, game.monitor.y]).toEqual([true, 0, 110]);
  });

  test("a new game after game over puts the penguin back at jump height", () => {
    const game = started();
    parkVirus(game);
    die(game);
    expect(game.pickup.y).toBe(-115);
    game.start();
    parkVirus(game);
    nextDrop(game, "penguin");
    run(game, DROP_FIRST);
    expect([game.pickup.visible, game.pickup.y]).toEqual([true, -25]);
  });

  test("nothing happens on the title screen", () => {
    const game = new Game(seeded(1));
    game.events.length = 0;
    run(game, 20);
    expect(game.events).toEqual([]);
    expect(game.time).toBe(0);
  });

  test("remembers where visible sprites were before each update", () => {
    const game = started();
    parkVirus(game);
    game.player.setXY(0, GROUND_Y);
    game.update(hold({ right: true }));
    expect(game.previous.get(game.player)).toEqual({ x: 0, y: GROUND_Y });
    expect(game.previous.has(game.virus)).toBe(false);
    expect(game.previous.has(game.pickup)).toBe(false);
    const x = game.player.x;
    expect(x).toBeGreaterThan(0);
    game.update(noInput);
    expect(game.previous.get(game.player)?.x).toBe(x);
  });

  test("random spots stay inside the range the 2013 game used", () => {
    for (const [share, x] of [
      [0, -205],
      [0.99999, 205],
    ] as const) {
      const game = new Game(() => share);
      game.start();
      expect(game.player.x).toBe(x);
    }
  });
});

describe("moving", () => {
  test("the player speeds up to 600 pixels a second, like 20 per Scratch frame", () => {
    const game = started();
    parkVirus(game);
    game.player.setXY(0, GROUND_Y);
    game.update(hold({ right: true }));
    expect(game.vx).toBeCloseTo(RUN_ACCELERATION * DT, 6);
    run(game, 0.1 - DT, { right: true });
    expect(game.vx).toBe(PLAYER_SPEED);
    run(game, 0.1, { right: true });
    expect(game.vx).toBe(PLAYER_SPEED);
    expect(game.player.direction).toBe(90);
  });

  test("letting go stops the player in a few frames", () => {
    const game = started();
    parkVirus(game);
    game.player.setXY(-100, GROUND_Y);
    run(game, 0.2, { right: true });
    game.update(noInput);
    expect(game.vx).toBe(PLAYER_SPEED - RUN_BRAKING * DT);
    // Stopped in under 0.07 s.
    run(game, 0.07 - DT);
    expect(game.vx).toBe(0);
    const x = game.player.x;
    run(game, 0.2);
    expect(game.player.x).toBe(x);
  });

  test("turning around brakes first, then speeds up the other way", () => {
    const game = started();
    parkVirus(game);
    game.player.setXY(-100, GROUND_Y);
    run(game, 0.2, { right: true });
    const speeds: number[] = [];
    // Every 1/60 s.
    for (let i = 0; i < 6; i++) {
      run(game, 1 / 60, { left: true });
      speeds.push(game.vx);
    }
    expect(speeds.map((v) => Math.round(v))).toEqual([450, 300, 150, 0, -100, -200]);
    expect(game.player.direction).toBe(-90);
  });

  test("the player keeps facing the last way they walked", () => {
    const game = started();
    parkVirus(game);
    run(game, 0.1, { left: true });
    run(game, 0.1);
    expect(game.player.direction).toBe(-90);
  });

  test("holding both directions stands still", () => {
    const game = started();
    parkVirus(game);
    game.player.setXY(0, GROUND_Y);
    run(game, 0.2, { left: true, right: true });
    expect(game.player.x).toBeCloseTo(0, 6);
    expect(game.player.currentCostume.name).toBe("normal");
  });

  test("the edge of the stage stops the player", () => {
    const game = started();
    parkVirus(game);
    run(game, 3, { right: true });
    const x = game.player.x;
    expect(x).toBeLessThan(240 + 60);
    expect(game.vx).toBe(0);
    run(game, 0.5, { right: true });
    expect(game.player.x).toBe(x);
  });

  test("walking starts on the first walking costume and swaps every 0.15 s", () => {
    const game = started();
    parkVirus(game);
    const costumes: string[] = [];
    const swap = Math.round(0.15 / DT);
    for (let i = 0; i < 2 * swap + 2; i++) {
      game.update(hold({ right: true }));
      costumes.push(game.player.currentCostume.name);
    }
    expect(costumes.slice(0, swap - 1)).toEqual(Array(swap - 1).fill("walk1"));
    expect(costumes.slice(swap, 2 * swap - 1)).toEqual(Array(swap - 1).fill("walk2"));
    expect(costumes.at(-1)).toBe("walk1");
  });

  test("walking swaps between both walking costumes", () => {
    const game = started();
    parkVirus(game);
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      game.update(hold({ right: true, left: false }));
      seen.add(game.player.currentCostume.name);
    }
    expect([...seen].sort()).toEqual(["walk1", "walk2"]);
  });

  test("down crouches, even while walking", () => {
    const game = started();
    parkVirus(game);
    run(game, DT, { down: true });
    expect(game.player.currentCostume.name).toBe("crouch");
    run(game, DT, { down: true, right: true });
    expect(game.player.currentCostume.name).toBe("crouch");
    run(game, DT);
    expect(game.player.currentCostume.name).toBe("normal");
  });
});

describe("jumping", () => {
  /** Highest point of a jump, and how long until landing. */
  function jump(game: Game, holdFor: number): { top: number; air: number } {
    game.update(hold({ jump: true, jumpPressed: true }));
    let top = game.player.y;
    let air = DT;
    while (!game.onGround) {
      game.update(hold({ jump: air < holdFor }));
      top = Math.max(top, game.player.y);
      air += DT;
    }
    return { top, air };
  }

  test("holding jump goes 80 pixels up and lands in about half a second", () => {
    const game = started();
    parkVirus(game);
    const { top, air } = jump(game, Infinity);
    expect(top - GROUND_Y).toBeGreaterThan(JUMP_HEIGHT - 3);
    expect(top - GROUND_Y).toBeLessThanOrEqual(JUMP_HEIGHT);
    // 0.2 s up, and a quicker fall.
    expect(air).toBeGreaterThan(0.3);
    expect(air).toBeLessThan(0.4);
    expect(game.player.y).toBe(GROUND_Y);
  });

  test("a tap is a short hop, and holding longer goes higher", () => {
    const heights = [0, 0.08, 0.15, Infinity].map((holdFor) => {
      const game = started();
      parkVirus(game);
      return jump(game, holdFor).top - GROUND_Y;
    });
    expect(heights[0]).toBeLessThan(30);
    expect(heights[0]).toBeGreaterThan(20);
    for (let i = 1; i < heights.length; i++) expect(heights[i]!).toBeGreaterThan(heights[i - 1]!);
  });

  test("a short hop still reaches the penguin", () => {
    const game = started();
    parkVirus(game);
    nextDrop(game, "penguin");
    run(game, DROP_FIRST);
    game.player.setXY(underPenguin(game), GROUND_Y);
    jump(game, 0);
    expect(game.health).toBe(2);
  });

  test("shows the jump costume in the air and kicks up dust", () => {
    const game = started();
    parkVirus(game);
    game.update(hold({ jump: true, jumpPressed: true }));
    expect(game.player.currentCostume.name).toBe("jump");
    expect(types(game.events)).toEqual(["jump"]);
    run(game, 1, { jump: true });
    expect(types(game.events)).toEqual(["jump", "land"]);
    expect(game.player.currentCostume.name).toBe("normal");
  });

  test("down in the air falls faster", () => {
    const falls = [false, true].map((down) => {
      const game = started();
      parkVirus(game);
      game.update(hold({ jump: true, jumpPressed: true }));
      let air = DT;
      while (!game.onGround) {
        game.update(hold({ jump: true, down }));
        air += DT;
      }
      return air;
    });
    expect(falls[1]!).toBeLessThan(falls[0]!);
  });

  test("jump pressed just before landing jumps again on landing", () => {
    const game = started();
    parkVirus(game);
    const first = jump(game, Infinity).air;
    game.update(noInput);
    expect(game.onGround).toBe(true);
    // Press again a little before the next landing.
    game.update(hold({ jump: true, jumpPressed: true }));
    run(game, first - JUMP_BUFFER + 2 * DT, { jump: true });
    game.update(hold({ jumpPressed: true }));
    run(game, JUMP_BUFFER - DT);
    expect(game.onGround).toBe(false);
  });

  test("jump pressed too early in the air does nothing", () => {
    const game = started();
    parkVirus(game);
    game.update(hold({ jump: true, jumpPressed: true }));
    run(game, 0.1, { jump: true });
    game.update(hold({ jump: true, jumpPressed: true }));
    run(game, 1, { jump: true });
    expect(game.onGround).toBe(true);
    expect(types(game.events).filter((t) => t === "jump")).toHaveLength(1);
  });

  test("holding jump doesn't jump again", () => {
    const game = started();
    parkVirus(game);
    game.update(hold({ jump: true, jumpPressed: true }));
    run(game, 1, { jump: true });
    expect(game.onGround).toBe(true);
  });
});

describe("the virus", () => {
  test("flashes in the monitor first, aiming at the player, then flies", () => {
    const game = started();
    expect(game.warning).toBe(WARNING_LONGEST);
    game.player.setXY(150, GROUND_Y);
    run(game, WARNING_LONGEST - AIM_LOCK - DT);
    expect(game.target).toEqual({ x: 150, y: GROUND_Y });
    expect([game.virus.x, game.virus.y]).toEqual([VIRUS_SPAWN.x, VIRUS_SPAWN.y]);
    // The aim locks just before it flies, so moving away then dodges it.
    run(game, 2 * DT);
    game.player.setXY(-150, GROUND_Y);
    run(game, AIM_LOCK - 2 * DT);
    expect(game.target).toEqual({ x: 150, y: GROUND_Y });
    expect(game.events).toEqual([]);
    run(game, DT);
    expect(game.events).toEqual([{ type: "launch", x: VIRUS_SPAWN.x, y: VIRUS_SPAWN.y }]);
    expect(game.warning).toBe(0);
    const aim = 90 - (Math.atan2(GROUND_Y - VIRUS_SPAWN.y, 150 - VIRUS_SPAWN.x) * 180) / Math.PI;
    expect(game.virus.direction).toBeCloseTo(aim, 6);
    const flown = Math.hypot(game.virus.x - VIRUS_SPAWN.x, game.virus.y - VIRUS_SPAWN.y);
    // The speed creeps up every update, so only about the start speed.
    expect(flown).toBeCloseTo(VIRUS_START_SPEED * DT, 1);
    expect(game.virus.x).toBeGreaterThan(VIRUS_SPAWN.x);
  });

  test("keeps flying once it leaves the monitor", () => {
    const game = started();
    game.player.setXY(200, GROUND_Y);
    launch(game);
    run(game, 0.25);
    const flown = Math.hypot(game.virus.x - VIRUS_SPAWN.x, game.virus.y - VIRUS_SPAWN.y);
    expect(Math.abs(flown / (VIRUS_START_SPEED * (0.25 + DT)) - 1)).toBeLessThan(0.01);
  });

  test("goes back to the monitor and warns again when it reaches an edge", () => {
    const game = started();
    launch(game);
    game.player.setXY(-200, GROUND_Y);
    game.virus.setXY(239, 0);
    game.virus.setDirection(90);
    run(game, DT);
    expect([game.virus.x, game.virus.y]).toEqual([VIRUS_SPAWN.x, VIRUS_SPAWN.y]);
    expect(game.warning).toBeCloseTo(WARNING_LONGEST, 2);
    expect(game.target.x).toBe(-200);
  });

  test("warns for less time as it gets faster", () => {
    const game = started();
    launch(game);
    game.speed = VIRUS_FAST;
    game.virus.setXY(239, 0);
    game.virus.setDirection(90);
    run(game, DT);
    expect(game.warning).toBeCloseTo(WARNING_SHORTEST, 6);
    // And never less than that, however fast it gets.
    game.speed = VIRUS_FAST * 3;
    game.warning = 0;
    game.virus.setXY(239, 0);
    run(game, DT);
    expect(game.warning).toBeCloseTo(WARNING_SHORTEST, 6);
  });

  test("can't skip past the player, however fast it gets", () => {
    const game = started();
    game.health = 2;
    launch(game);
    game.player.setXY(0, GROUND_Y);
    // 50 px a frame, more than the player is wide.
    game.speed = 3000;
    game.virus.setXY(-60, GROUND_Y);
    game.virus.setDirection(90);
    game.update(noInput);
    expect(game.health).toBe(1);
  });

  test("a hit takes a heart, shows the hit face and sends the virus back", () => {
    const game = started();
    game.health = 2;
    launch(game);
    game.virus.setXY(game.player.x, game.player.y);
    run(game, DT);
    expect(game.health).toBe(1);
    expect(game.player.currentCostume.name).toBe("hit");
    expect([game.virus.x, game.virus.y]).toEqual([VIRUS_SPAWN.x, VIRUS_SPAWN.y]);
    expect(game.events).toEqual([{ type: "hit", x: game.player.x, y: game.player.y, last: false }]);
    expect(game.phase).toBe("playing");
    expect([game.invincible, game.frozen]).toEqual([INVINCIBLE, HIT_STOP]);
  });

  test("a hit freezes everything for 4 frames", () => {
    expect(HIT_STOP).toBeCloseTo(4 / 60, 9);
  });

  test("a hit freezes everything for a moment", () => {
    const game = started();
    game.health = 2;
    launch(game);
    game.virus.setXY(game.player.x, game.player.y);
    run(game, DT);
    const time = game.time;
    const x = game.player.x;
    run(game, HIT_STOP, { right: true });
    expect([game.time, game.player.x]).toEqual([time, x]);
    run(game, DT, { right: true });
    expect(game.time).toBeGreaterThan(time);
    expect(game.player.x).toBeGreaterThan(x);
  });

  test("the hit face lasts 0.3 s", () => {
    const game = started();
    game.health = 2;
    launch(game);
    game.virus.setXY(game.player.x, game.player.y);
    run(game, DT + HIT_STOP);
    run(game, 0.3 - 2 * DT);
    expect(game.player.currentCostume.name).toBe("hit");
    run(game, 2 * DT);
    expect(game.player.currentCostume.name).toBe("normal");
  });

  test("the player can't be hit again while blinking", () => {
    const game = started();
    game.health = 3;
    launch(game);
    game.virus.setXY(game.player.x, game.player.y);
    run(game, DT + HIT_STOP);
    game.warning = 0;
    game.virus.setXY(game.player.x, game.player.y);
    run(game, DT);
    expect(game.health).toBe(2);
    run(game, INVINCIBLE);
    expect(game.invincible).toBe(0);
    game.warning = 0;
    game.virus.setXY(game.player.x, game.player.y);
    run(game, DT);
    expect(game.health).toBe(1);
  });

});

describe("the penguin", () => {
  test("can show up after 10 s, for 2 s, at the height of a jump", () => {
    const game = started();
    parkVirus(game);
    nextDrop(game, "penguin");
    game.player.setXY(-205, GROUND_Y);
    run(game, DROP_FIRST - DT);
    expect(game.pickup.visible).toBe(false);
    run(game, DT);
    expect(game.pickup.visible).toBe(true);
    expect(game.pickup.y).toBe(-25);
    run(game, 2 - DT);
    expect(game.pickup.visible).toBe(true);
    run(game, DT);
    expect(game.pickup.visible).toBe(false);
  });

  test("nothing else shows up for 10 s after it", () => {
    const game = started();
    parkVirus(game);
    nextDrop(game, "penguin");
    game.player.setXY(-205, GROUND_Y);
    run(game, DROP_FIRST);
    expect(game.pickup.visible).toBe(true);
    game.events.length = 0;
    run(game, 10 - DT);
    expect(types(game.events)).not.toContain("appear");
  });

  test("tells how long it has left, so it can blink before it goes", () => {
    const game = started();
    parkVirus(game);
    game.player.setXY(-205, GROUND_Y);
    expect(game.pickupLeft).toBe(0);
    nextDrop(game, "penguin");
    run(game, DROP_FIRST);
    expect(game.pickupLeft).toBeCloseTo(PICKUP_SHOWN, 6);
    run(game, PICKUP_SHOWN - PICKUP_BLINK);
    expect(game.pickupLeft).toBeCloseTo(PICKUP_BLINK, 6);
  });

  test("standing under it isn't enough, jumping into it gives a heart", () => {
    const game = started();
    parkVirus(game);
    nextDrop(game, "penguin");
    run(game, DROP_FIRST);
    game.player.setXY(underPenguin(game), GROUND_Y);
    run(game, 0.5);
    expect(game.health).toBe(1);
    game.events.length = 0;
    game.update(hold({ jumpPressed: true }));
    run(game, 0.15);
    expect(game.health).toBe(2);
    expect(game.pickup.visible).toBe(false);
    expect(types(game.events).slice(0, 2)).toEqual(["jump", "pickup"]);
  });
});

describe("the penguin's spot", () => {
  test("is picked between x -120 and 260, so all of it is on stage", () => {
    for (const [share, x] of [
      [0, -120],
      [0.99999, 260],
    ] as const) {
      const game = new Game(() => share);
      game.start();
      parkVirus(game);
      nextDrop(game, "penguin");
      run(game, DROP_FIRST);
      expect(game.pickup.x).toBe(x);
      expect(game.pickup.direction).toBe(90);
      const bounds = game.pickup.bounds();
      expect(bounds.left).toBeGreaterThanOrEqual(-240);
      expect(bounds.right).toBeLessThanOrEqual(240);
    }
  });
});

describe("game over", () => {
  function lost(): Game {
    const game = started();
    parkVirus(game);
    run(game, 3);
    game.events.length = 0;
    die(game);
    return game;
  }

  test("the last hit holds a moment before the game over screen", () => {
    const game = started();
    launch(game);
    game.virus.setXY(game.player.x, game.player.y);
    run(game, DT);
    expect(game.events.at(-1)).toMatchObject({ type: "hit", last: true });
    run(game, DEATH_PAUSE - DT);
    expect(game.phase).toBe("playing");
    run(game, DT);
    expect(game.phase).toBe("over");
  });

  test("losing the last heart shows the 2013 game over screen", () => {
    const game = lost();
    expect(game.phase).toBe("over");
    expect(game.health).toBe(0);
    expect(game.events).toEqual([
      { type: "music", playing: false },
      { type: "sound", sound: "death" },
      { type: "lost", time: 3 },
    ]);
    expect(game.layers.map((s) => s.name)).toEqual(["gameOver", "virus", "monitor", "player", "pickup", "hl3"]);
    expect(game.gameOver.visible).toBe(true);
    expect([game.player.visible, game.player.x, game.player.y, game.player.direction]).toEqual([true, 208, -115, -90]);
    expect([game.pickup.visible, game.pickup.x, game.pickup.y]).toEqual([true, -124, -115]);
    expect(game.hl3.visible).toBe(false);
  });

  test("the penguin faces right on the game over screen, wherever it was", () => {
    const game = started();
    parkVirus(game);
    game.pickup.setDirection(-90);
    die(game);
    expect(game.pickup.direction).toBe(90);
  });

  test("the Half-Life 3 logo starts hidden on every game over", () => {
    const game = lost();
    run(game, 10.5);
    expect(game.hl3.visible).toBe(true);
    game.start();
    parkVirus(game);
    die(game);
    expect(game.hl3.visible).toBe(false);
  });

  test("time stops on the game over screen", () => {
    const game = lost();
    run(game, 2);
    expect(game.time).toBeCloseTo(3 + DT, 6);
    expect(game.invincible).toBe(0);
  });

  test("GLaDOS talks after 6 s, then again after each line", () => {
    const game = lost();
    game.events.length = 0;
    run(game, 6 - DT);
    expect(game.events).toEqual([]);
    run(game, DT);
    expect(game.events).toEqual([{ type: "sound", sound: "glados" }]);
    game.events.length = 0;
    run(game, 6 + 8506221 / 48000 - 2 * DT);
    expect(game.events).toEqual([]);
    run(game, 2 * DT);
    expect(game.events).toEqual([{ type: "sound", sound: "glados" }]);
  });

  test("the Half-Life 3 logo turns 30 degrees and moves each time it shows up", () => {
    const spots = (share: number) => {
      const game = new Game(() => share);
      game.start();
      game.virus.visible = false;
      die(game);
      const seen: number[][] = [];
      for (let i = 0; i < Math.round(16 / DT); i++) {
        game.update(noInput);
        const last = seen.at(-1);
        const now = [game.hl3.x, game.hl3.y, game.hl3.direction];
        if (game.hl3.visible && (!last || last.join() !== now.join())) seen.push(now);
      }
      return seen;
    };
    expect(spots(0.5)).toEqual([
      [0, 0, -45],
      [0, 0, -15],
    ]);
    expect(spots(0)[0]).toEqual([-200, -150, -45]);
    expect(spots(0.99999)[0]).toEqual([200, 150, -135]);
  });

  test("the Half-Life 3 logo shows up after 10 s, and clicking it meows", () => {
    const game = lost();
    run(game, 10 - 2 * DT);
    expect(game.hl3.visible).toBe(false);
    run(game, 2 * DT);
    expect(game.hl3.visible).toBe(true);
    game.events.length = 0;
    game.click(game.hl3.x, game.hl3.y);
    expect(game.hl3.visible).toBe(false);
    expect(game.events).toEqual([{ type: "sound", sound: "meow" }]);
    run(game, 1);
    expect(game.hl3.visible).toBe(false);
    run(game, 3);
    expect(game.hl3.visible).toBe(true);
  });

  test("clicks elsewhere, on a hidden logo, or outside game over, do nothing", () => {
    const game = lost();
    run(game, 10.5);
    game.events.length = 0;
    game.click(game.hl3.x + 100, game.hl3.y + 100);
    expect(game.hl3.visible).toBe(true);
    run(game, 2);
    game.click(game.hl3.x, game.hl3.y);
    expect(game.events).toEqual([]);
    const playing = started();
    playing.hl3.visible = true;
    playing.click(playing.hl3.x, playing.hl3.y);
    expect(playing.events).toEqual([]);
  });

  test("the Half-Life 3 logo keeps the 2013 timing", () => {
    const shown = [0, 9.9, 10, 11.9, 12, 14, 16, 17, 24, 26, 28].map(hl3Shown);
    expect(shown).toEqual([false, false, true, true, false, true, false, false, true, false, true]);
  });

  test("going back to the title clears the stage", () => {
    const game = lost();
    game.toTitle();
    expect(game.phase).toBe("title");
    expect(game.layers).toEqual([]);
    expect(game.gameOver.visible).toBe(false);
  });
});

describe("difficulty", () => {
  test("the virus starts at its 2013 speed and speeds up forever", () => {
    const game = started();
    parkVirus(game);
    game.invincible = Infinity;
    expect(game.speed).toBe(VIRUS_START_SPEED);
    run(game, 30);
    expect(game.speed).toBeCloseTo(VIRUS_START_SPEED + VIRUS_SPEEDUP * 30, 6);
    game.time = 600;
    run(game, DT);
    expect(game.speed).toBeCloseTo(VIRUS_START_SPEED + VIRUS_SPEEDUP * (600 + DT), 6);
    expect(game.speed).toBeGreaterThan(VIRUS_FAST * 2);
  });

  test("a new game starts slow again", () => {
    const game = started();
    parkVirus(game);
    game.time = 100;
    run(game, DT);
    expect(game.speed).toBeGreaterThan(VIRUS_START_SPEED);
    die(game);
    game.start();
    expect(game.speed).toBe(VIRUS_START_SPEED);
  });
});

describe("power-ups", () => {
  /** A game with a power-up of a kind on stage, far from the player. */
  function withPowerUp(kind: PowerUpKind): Game {
    const game = started();
    game.powerUp.setCostume(kind);
    game.powerUp.setXY(200, GROUND_Y);
    game.powerUp.visible = true;
    game.player.setXY(-200, GROUND_Y);
    return game;
  }

  /** Puts the player on the power-up and lets them grab it. */
  function grab(game: Game): void {
    game.player.setXY(game.powerUp.x, game.powerUp.y);
    game.update(noInput);
  }

  test("one can show up after 10 s, within a jump of the floor and away from the player", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const game = started(seed);
      parkVirus(game);
      nextDrop(game, "powerUp");
      run(game, DROP_FIRST - DT);
      expect(game.powerUp.visible).toBe(false);
      run(game, DT);
      expect(game.powerUp.visible).toBe(true);
      expect(POWER_UPS).toContain(game.powerUpKind);
      expect(Math.abs(game.powerUp.x)).toBeLessThanOrEqual(200);
      expect(game.powerUp.y).toBeGreaterThanOrEqual(GROUND_Y);
      expect(game.powerUp.y).toBeLessThanOrEqual(GROUND_Y + 60);
      expect(Math.abs(game.powerUp.x - game.player.x)).toBeGreaterThanOrEqual(80);
    }
  });

  test("every kind shows up, sharing one turn every 10 to 15 s with the penguin", () => {
    const kinds = new Set<string>();
    const gaps: number[] = [];
    let [penguins, powerUps] = [0, 0];
    const game = started(3);
    parkVirus(game);
    game.invincible = Infinity;
    game.player.setXY(-230, GROUND_Y);
    let last = -1;
    for (let i = 0; i < Math.round(3000 / DT); i++) {
      const before = [game.powerUp.visible, game.pickup.visible];
      game.update(noInput);
      game.health = 1;
      const powerUp = game.powerUp.visible && !before[0];
      const penguin = game.pickup.visible && !before[1];
      expect(powerUp && penguin).toBe(false);
      if (powerUp) kinds.add(game.powerUpKind);
      if (!powerUp && !penguin) continue;
      [penguins, powerUps] = [penguins + Number(penguin), powerUps + Number(powerUp)];
      if (last >= 0) gaps.push(game.time - last);
      last = game.time;
    }
    expect([...kinds].sort()).toEqual([...POWER_UPS].sort());
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(15 + 1e-6);
    expect(Math.abs(penguins / (penguins + powerUps) - PENGUIN_CHANCE)).toBeLessThan(0.1);
  });

  test("every kind comes once before any comes again", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = started(seed);
      parkVirus(game);
      const kinds: PowerUpKind[] = [];
      for (let i = 0; i < POWER_UPS.length * 2; i++) {
        nextDrop(game, "powerUp");
        (game as unknown as { dropTimer: number }).dropTimer = DT;
        game.update(noInput);
        kinds.push(game.powerUpKind);
        game.powerUp.visible = false;
      }
      expect(new Set(kinds.slice(0, POWER_UPS.length)).size).toBe(POWER_UPS.length);
      expect(new Set(kinds.slice(POWER_UPS.length)).size).toBe(POWER_UPS.length);
    }
  });

  test("one that would show up on the player moves 160 px away, staying on stage", () => {
    // Random numbers for: the next wait, x, then y. The kind comes from the bag.
    const place = (playerX: number, x: number) => {
      const game = started();
      parkVirus(game);
      game.player.setXY(playerX, GROUND_Y);
      (game as unknown as { bag: PowerUpKind[] }).bag = ["shield"];
      const queue = [0, (x + 200 + 0.5) / 401, 0];
      (game as unknown as { random: () => number }).random = () => queue.shift() ?? 0;
      nextDrop(game, "powerUp");
      (game as unknown as { dropTimer: number }).dropTimer = DT;
      game.update(noInput);
      expect(game.powerUp.visible).toBe(true);
      return game.powerUp.x;
    };
    expect(place(0, 150)).toBe(150);
    expect(place(100, 60)).toBe(-100);
    expect(place(-100, -60)).toBe(100);
    expect(place(0, 50)).toBe(-110);
    expect(place(0, -50)).toBe(110);
    expect(place(0, -80)).toBe(-80);
  });

  test("the wait for the next penguin or power-up is spread over 10 to 15 s", () => {
    const waits = [0, 0.5, 0.99].map((share) => {
      const game = started();
      parkVirus(game);
      (game as unknown as { random: () => number }).random = () => share;
      (game as unknown as { dropTimer: number }).dropTimer = DT;
      game.update(noInput);
      return (game as unknown as { dropTimer: number }).dropTimer;
    });
    expect(waits[0]).toBeCloseTo(10, 6);
    expect(waits[1]).toBeCloseTo(12.5, 6);
    expect(waits[2]).toBeCloseTo(14.95, 6);
  });

  test("it's the penguin half the time, and a power-up otherwise", () => {
    for (const [share, penguin] of [
      [0.49, true],
      [0.51, false],
    ] as const) {
      const game = started();
      parkVirus(game);
      (game as unknown as { random: () => number }).random = () => share;
      (game as unknown as { dropTimer: number }).dropTimer = DT;
      game.update(noInput);
      expect([game.pickup.visible, game.powerUp.visible]).toEqual([penguin, !penguin]);
    }
  });

  test("with full hearts, it's always a power-up", () => {
    const game = started();
    parkVirus(game);
    game.health = MAX_HEALTH;
    (game as unknown as { random: () => number }).random = () => 0;
    (game as unknown as { dropTimer: number }).dropTimer = DT;
    game.update(noInput);
    expect([game.pickup.visible, game.powerUp.visible]).toEqual([false, true]);
  });

  test("goes away after 5 s if nobody grabs it", () => {
    const game = withPowerUp("shield");
    parkVirus(game);
    run(game, POWER_UP_SHOWN - DT);
    expect(game.powerUp.visible).toBe(true);
    expect(game.powerUpLeft).toBeCloseTo(DT, 6);
    run(game, DT);
    expect(game.powerUp.visible).toBe(false);
    expect(game.powerUpLeft).toBe(0);
  });

  test("grabbing one gives its power for a while", () => {
    for (const kind of ["jetpack", "shield", "freeze", "pill", "shoes", "portal"] as const) {
      const game = withPowerUp(kind);
      parkVirus(game);
      game.events.length = 0;
      grab(game);
      expect(game.powerUp.visible).toBe(false);
      expect(game.powers[kind]).toBeCloseTo(POWER_UP_TIME[kind], 6);
      expect(game.events).toContainEqual({ type: "powerUp", kind, x: game.powerUp.x, y: game.powerUp.y });
      run(game, POWER_UP_TIME[kind]);
      expect(game.powers[kind]).toBe(0);
    }
  });

  test("with a jetpack, up flies to the top and no higher, and letting go hovers", () => {
    const game = withPowerUp("jetpack");
    parkVirus(game);
    grab(game);
    run(game, 0.3, { jump: true, jumpPressed: true });
    expect(game.flying).toBe(true);
    expect(game.vy).toBe(FLY_SPEED);
    run(game, 1.5, { jump: true });
    expect(game.player.y).toBe(CEILING_Y);
    expect(game.vy).toBe(0);
    // No gravity: it stays put.
    run(game, 1);
    expect(game.player.y).toBe(CEILING_Y);
    expect([game.vy, game.flying]).toEqual([0, true]);
  });

  test("letting go in mid-air hovers at that height", () => {
    const game = withPowerUp("jetpack");
    parkVirus(game);
    grab(game);
    run(game, 0.3, { jump: true, jumpPressed: true });
    run(game, 0.2);
    const y = game.player.y;
    expect(y).toBeLessThan(CEILING_Y);
    run(game, 1);
    expect(game.player.y).toBe(y);
  });

  test("standing still with a jetpack stays on the floor", () => {
    const game = withPowerUp("jetpack");
    parkVirus(game);
    grab(game);
    run(game, 0.5);
    expect([game.player.y, game.onGround, game.flying]).toEqual([GROUND_Y, true, false]);
  });

  test("with a jetpack, down sinks to the floor and lands", () => {
    const game = withPowerUp("jetpack");
    parkVirus(game);
    grab(game);
    run(game, 0.5, { jump: true, jumpPressed: true });
    const high = game.player.y;
    run(game, 0.2, { down: true });
    expect(game.player.y).toBeLessThan(high);
    expect(game.vy).toBe(-FLY_SPEED);
    run(game, 2, { down: true });
    expect([game.player.y, game.onGround, game.flying]).toEqual([GROUND_Y, true, false]);
    expect(game.player.currentCostume.name).toBe("crouch");
  });

  test("flying speeds up and slows down in a tenth of a second", () => {
    const game = withPowerUp("jetpack");
    parkVirus(game);
    grab(game);
    game.update(hold({ jump: true, jumpPressed: true }));
    expect(game.vy).toBeCloseTo(FLY_SPEED * 10 * DT, 6);
    run(game, 0.1, { jump: true });
    expect(game.vy).toBe(FLY_SPEED);
    game.update(noInput);
    expect(game.vy).toBeCloseTo(FLY_SPEED - FLY_SPEED * 10 * DT, 6);
    run(game, 0.1);
    expect(game.vy).toBe(0);
  });

  test("up and down together hover, and the jetpack shows the jump pose", () => {
    const game = withPowerUp("jetpack");
    parkVirus(game);
    grab(game);
    run(game, 0.3, { jump: true, jumpPressed: true });
    run(game, 0.2, { jump: true, down: true });
    expect(game.vy).toBe(0);
    expect(game.player.currentCostume.name).toBe("jump");
  });

  test("on the floor with a jetpack, down crouches instead of flying", () => {
    const game = withPowerUp("jetpack");
    parkVirus(game);
    grab(game);
    run(game, 0.5, { down: true });
    expect([game.player.y, game.onGround, game.flying]).toEqual([GROUND_Y, true, false]);
  });

  test("without a jetpack, holding jump doesn't fly", () => {
    const game = started();
    parkVirus(game);
    game.update(hold({ jump: true, jumpPressed: true }));
    run(game, 2, { jump: true });
    expect(game.flying).toBe(false);
    expect(game.player.y).toBe(GROUND_Y);
  });

  test("the jetpack runs out in the air and the player falls", () => {
    const game = withPowerUp("jetpack");
    parkVirus(game);
    grab(game);
    run(game, 1, { jump: true, jumpPressed: true });
    game.powers.jetpack = DT;
    run(game, 2, { jump: true });
    expect(game.flying).toBe(false);
    expect(game.player.y).toBe(GROUND_Y);
  });

  test("a shield takes one hit instead of a heart", () => {
    const game = withPowerUp("shield");
    game.health = 2;
    grab(game);
    launch(game);
    game.virus.setXY(game.player.x, game.player.y);
    game.update(noInput);
    expect(game.health).toBe(2);
    expect(game.powers.shield).toBe(0);
    expect(types(game.events)).toContain("shield");
    expect(types(game.events)).not.toContain("hit");
    expect(game.invincible).toBeGreaterThan(0);
    expect([game.virus.x, game.virus.y]).toEqual([VIRUS_SPAWN.x, VIRUS_SPAWN.y]);
    // The next hit counts.
    game.invincible = 0;
    launch(game);
    game.virus.setXY(game.player.x, game.player.y);
    game.update(noInput);
    expect(game.health).toBe(1);
  });

  test("a frozen virus stays put, then carries on", () => {
    const game = withPowerUp("freeze");
    launch(game);
    grab(game);
    game.virus.setXY(0, 50);
    run(game, POWER_UP_TIME.freeze);
    expect([game.virus.x, game.virus.y]).toEqual([0, 50]);
    run(game, DT);
    expect([game.virus.x, game.virus.y]).not.toEqual([0, 50]);
  });

  test("touching the frozen virus breaks it without a hit, ends the freeze, and a new one comes out of the monitor", () => {
    const game = withPowerUp("freeze");
    game.health = 2;
    launch(game);
    grab(game);
    game.events.length = 0;
    game.virus.setXY(game.player.x, game.player.y);
    const at = { x: game.virus.x, y: game.virus.y };
    game.update(noInput);
    expect(game.events).toEqual([{ type: "shatter", ...at }]);
    expect([game.health, game.powers.freeze]).toEqual([2, 0]);
    expect([game.virus.x, game.virus.y]).toEqual([VIRUS_SPAWN.x, VIRUS_SPAWN.y]);
    expect(game.warning).toBeGreaterThan(0);
  });

  test("freezing also stops the virus waiting in the monitor", () => {
    const game = started();
    game.powers.freeze = 1;
    const warning = game.warning;
    run(game, 0.5);
    expect(game.warning).toBe(warning);
  });

  test("power-ups are gone after game over and in a new game", () => {
    const game = withPowerUp("jetpack");
    grab(game);
    game.powers.shield = 3;
    game.powers.freeze = 0;
    die(game);
    expect(Object.values(game.powers).every((left) => left === 0)).toBe(true);
    expect(game.powerUp.visible).toBe(false);

    game.start();
    expect([Object.values(game.powers).every((left) => left === 0), game.powerUp.visible, game.flying]).toEqual([true, false, false]);
    expect(game.layers.map((s) => s.name)).toEqual(["pickup", "powerUp", "player", "monitor", "virus"]);
  });
});

describe("controls", () => {
  test("the 2013 keys move the player", () => {
    expect(["a", "A", "ArrowLeft", "d", "ArrowRight", "s", "ArrowDown", "w", " ", "ArrowUp", "x", "Enter"].map((key) => moveForKey(key))).toEqual([
      "left",
      "left",
      "left",
      "right",
      "right",
      "down",
      "down",
      "jump",
      "jump",
      "jump",
      null,
      null,
    ]);
  });

  test("nothing is held at first, and only jumps count as jump presses", () => {
    const controls = new Controls();
    expect(controls.read()).toEqual(noInput);
    controls.press("key:KeyD", "right");
    controls.press("key:KeyS", "down");
    expect(controls.read()).toEqual({ ...noInput, right: true, down: true });
  });

  test("a quick tap between updates still jumps once", () => {
    const controls = new Controls();
    controls.press("key:Space", "jump");
    controls.release("key:Space");
    expect(controls.read()).toEqual({ ...noInput, jumpPressed: true, hopPressed: true });
    expect(controls.read()).toEqual(noInput);
  });

  test("a move stays held while any of its keys is down", () => {
    const controls = new Controls();
    controls.press("key:KeyA", "left");
    controls.press("key:ArrowLeft", "left");
    controls.release("key:KeyA");
    expect(controls.read().left).toBe(true);
    controls.releaseAll();
    expect(controls.read().left).toBe(false);
  });

  test("key repeat doesn't count as another jump", () => {
    const controls = new Controls();
    controls.press("key:Space", "jump");
    controls.read();
    controls.press("key:Space", "jump");
    expect(controls.read()).toEqual({ ...noInput, jump: true, handbrake: true });
  });

  test("on foot, Space and pad A hop, other jump keys walk, and a kick counts once", () => {
    const controls = new Controls();
    controls.press("key:Space", "jump");
    controls.press("pad:a", "jump");
    expect(controls.read()).toMatchObject({ jump: true, jumpPressed: true, hopPressed: true, forward: false });
    controls.press("key:ArrowUp", "jump");
    expect(controls.read()).toMatchObject({ jump: true, jumpPressed: true, hopPressed: false, forward: true });
    controls.releaseAll();
    controls.press("pad:jump", "jump");
    expect(controls.read()).toMatchObject({ gas: true, handbrake: false, hopPressed: false, forward: true });
    controls.kick();
    expect(controls.read().kickPressed).toBe(true);
    expect(controls.read().kickPressed).toBe(false);
  });
});

describe("screen", () => {
  test("the stage fits the window and stays centered", () => {
    expect(fitStage(1920, 1080)).toEqual({ x: 240, y: 0, scale: 3 });
    expect(fitStage(480, 720)).toEqual({ x: 0, y: 180, scale: 1 });
  });

  test("stage and canvas points convert both ways", () => {
    const view = fitStage(1920, 1080);
    expect(toCanvas(view, -240, 180)).toEqual([240, 0]);
    expect(toCanvas(view, 0, 0)).toEqual([960, 540]);
    expect(toStage(view, 960, 540)).toEqual([0, 0]);
    expect(toStage(view, 1680, 1080)).toEqual([240, -180]);
  });

  test("time shows seconds, then minutes", () => {
    expect([0, 9.99, 59, 60, 61.5, 600, -1].map(formatTime)).toEqual(["0", "9", "59", "1:00", "1:01", "10:00", "0"]);
  });

  test("fading changes the screen while it's black", () => {
    const fader = new Fader();
    let changed = 0;
    fader.to(() => changed++);
    fader.to(() => (changed += 10));
    expect(fader.busy).toBe(true);
    fader.update(0.1);
    expect([changed, fader.value]).toEqual([0, 0.5]);
    fader.update(0.1);
    expect([changed, fader.value, fader.busy]).toEqual([1, 1, false]);
    fader.update(0.15);
    expect(fader.value).toBeCloseTo(0.5, 6);
    fader.update(1);
    expect(fader.value).toBe(0);
    fader.update(1);
    expect([changed, fader.value]).toEqual([1, 0]);
  });

  test("fading in starts from black", () => {
    const fader = new Fader();
    fader.fadeIn();
    expect(fader.value).toBe(1);
    fader.update(0.3);
    expect(fader.value).toBe(0);
  });
});

describe("hearts", () => {
  /** Puts the penguin on stage and the player in it. */
  function grabPenguin(game: Game): void {
    game.pickup.setXY(0, GROUND_Y + 40);
    game.pickup.visible = true;
    game.player.setXY(underPenguin(game), GROUND_Y + 40);
    game.update(noInput);
  }

  test("a penguin adds a heart, up to 5", () => {
    const game = started();
    parkVirus(game);
    game.health = MAX_HEALTH - 1;
    grabPenguin(game);
    expect(game.health).toBe(MAX_HEALTH);
    expect(game.powers.shield).toBe(0);
    expect(game.events.find((e) => e.type === "pickup")).toMatchObject({ full: false });
  });

  test("with full hearts, a penguin gives a short shield instead", () => {
    const game = started();
    parkVirus(game);
    game.health = MAX_HEALTH;
    grabPenguin(game);
    expect(game.health).toBe(MAX_HEALTH);
    expect(game.powers.shield).toBeCloseTo(PENGUIN_SHIELD - DT, 6);
    expect(game.events.find((e) => e.type === "pickup")).toMatchObject({ full: true });
  });

  test("a penguin never shortens a longer shield", () => {
    const game = started();
    parkVirus(game);
    game.health = MAX_HEALTH;
    game.powers.shield = 8;
    grabPenguin(game);
    expect(game.powers.shield).toBeCloseTo(8 - DT, 6);
  });
});

describe("retrying", () => {
  test("jump can start again only after a moment on the game over screen", () => {
    const game = started();
    parkVirus(game);
    expect(game.canRetry).toBe(false);
    die(game);
    expect(game.phase).toBe("over");
    expect(game.canRetry).toBe(false);
    run(game, RETRY_LOCK - DT);
    expect(game.canRetry).toBe(false);
    run(game, DT);
    expect(game.canRetry).toBe(true);
    game.start();
    expect(game.canRetry).toBe(false);
    die(game);
    expect(game.overTime).toBe(0);
  });
});

describe("near misses", () => {
  /** A flying virus that passes over the player's head, this far above it, to the right edge. */
  function flyOver(game: Game, above: number): void {
    parkVirus(game);
    game.player.setXY(0, GROUND_Y);
    game.virus.visible = true;
    game.warning = 0;
    game.virus.setDirection(90);
    game.virus.setXY(-150, 100);
    const offset = game.virus.bounds().bottom - game.player.bounds().top;
    game.virus.setXY(-150, 100 - offset + above);
    game.events.length = 0;
    // Until it's back in the monitor.
    for (let i = 0; i < 4 / DT && game.warning === 0; i++) game.update(noInput);
    expect(game.warning).toBeGreaterThan(0);
  }

  test("a virus that flies by close without a hit makes a whoosh, once", () => {
    const game = started();
    flyOver(game, NEAR_MISS / 2);
    expect(types(game.events).filter((t) => t === "nearMiss" || t === "hit")).toEqual(["nearMiss"]);
    expect(game.health).toBe(1);
  });

  test("each flight counts on its own, after a near miss or a hit", () => {
    const close = started();
    flyOver(close, NEAR_MISS / 2);
    flyOver(close, NEAR_MISS + 30);
    expect(types(close.events)).not.toContain("nearMiss");
    const hit = started();
    hit.health = 3;
    flyOver(hit, -20);
    hit.invincible = 0;
    flyOver(hit, NEAR_MISS + 30);
    expect(types(hit.events)).not.toContain("nearMiss");
  });

  test("right at the near miss distance still counts, a little further doesn't", () => {
    const close = started();
    flyOver(close, NEAR_MISS - 0.5);
    expect(types(close.events)).toContain("nearMiss");
    const far = started();
    flyOver(far, NEAR_MISS + 3);
    expect(types(far.events)).not.toContain("nearMiss");
  });

  test("a hit, or flying by while invincible, isn't a near miss", () => {
    const hit = started();
    flyOver(hit, -20);
    expect(types(hit.events)).toContain("hit");
    expect(types(hit.events)).not.toContain("nearMiss");
    const invincible = started();
    invincible.invincible = 100;
    flyOver(invincible, NEAR_MISS / 2);
    expect(types(invincible.events)).not.toContain("nearMiss");
  });

  test("the distance between boxes is 0 when they overlap", () => {
    const box = (left: number, bottom: number) => ({ left, right: left + 10, bottom, top: bottom + 10 });
    expect(gap(box(0, 0), box(5, 5))).toBe(0);
    expect(gap(box(0, 0), box(13, 0))).toBe(3);
    expect(gap(box(13, 0), box(0, 0))).toBe(3);
    expect(gap(box(0, 0), box(0, 14))).toBe(4);
    expect(gap(box(0, 14), box(0, 0))).toBe(4);
    expect(gap(box(0, 0), box(13, 14))).toBe(5);
  });
});

describe("cues", () => {
  test("the penguin and power-ups say when they show up", () => {
    const game = started(4);
    parkVirus(game);
    game.player.setXY(-205, GROUND_Y);
    nextDrop(game, "penguin");
    run(game, DROP_FIRST - DT);
    expect(types(game.events)).not.toContain("appear");
    run(game, DT);
    expect(game.events.filter((e) => e.type === "appear")).toEqual([{ type: "appear", thing: "penguin" }]);
    game.events.length = 0;
    nextDrop(game, "powerUp");
    (game as unknown as { dropTimer: number }).dropTimer = DT;
    game.update(noInput);
    const appeared = game.events.filter((e) => e.type === "appear");
    expect(appeared).toEqual([{ type: "appear", thing: game.powerUpKind }]);
  });

  test("a power-up ticks at 3, 2 and 1 s left", () => {
    const game = started();
    parkVirus(game);
    game.powers.jetpack = POWER_UP_TIME.jetpack;
    run(game, POWER_UP_TIME.jetpack - 3 - DT);
    expect(types(game.events)).not.toContain("ending");
    run(game, DT);
    expect(game.events.filter((e) => e.type === "ending")).toEqual([{ type: "ending", kind: "jetpack", left: 3 }]);
    run(game, 3);
    expect(game.events.filter((e) => e.type === "ending").map((e) => (e.type === "ending" ? e.left : 0))).toEqual([3, 2, 1]);
  });

  test("a power-up shorter than 3 s only ticks for what's left", () => {
    const game = started();
    parkVirus(game);
    game.powers.freeze = 2.5;
    run(game, 3);
    expect(game.events.filter((e) => e.type === "ending").map((e) => (e.type === "ending" ? e.left : 0))).toEqual([2, 1]);
  });
});

describe("the replay", () => {
  test("keeps the last 2 s of the run, with the player and power-ups", () => {
    const game = started();
    parkVirus(game);
    run(game, 0.5);
    expect(game.replay).toHaveLength(0.5 * HZ);
    expect([game.replay.at(-1)!.shield, game.replay.at(-1)!.jetpack]).toEqual([false, false]);
    game.powers.shield = 5;
    run(game, 3);
    expect(game.replay).toHaveLength(REPLAY_SECONDS * HZ);
    const last = game.replay.at(-1)!;
    expect(last.sprites[last.player]!.costume.name).toBe(game.player.currentCostume.name);
    expect(last.sprites[last.player]!.x).toBe(game.player.x);
    expect([last.shield, last.jetpack, last.flying]).toEqual([true, false, false]);
    // Only what's on stage: the hidden penguin, power-up and virus aren't in it.
    expect(last.sprites.map((s) => s.costume.name)).toEqual([game.player.currentCostume.name, "monitor"]);
    game.powers.jetpack = 5;
    run(game, 0.5, { jump: true });
    const flying = game.replay.at(-1)!;
    expect([flying.jetpack, flying.flying]).toEqual([true, true]);
    game.start();
    expect(game.replay).toEqual([]);
  });

  test("ends on the hit that ended the run, not on the pause after it", () => {
    const game = started();
    launch(game);
    game.virus.setXY(game.player.x, game.player.y);
    game.update(noInput);
    const frames = game.replay.length;
    const hit = game.replay.at(-1)!;
    expect(hit.sprites[hit.player]!.costume.name).toBe("hit");
    run(game, DEATH_PAUSE + 1);
    expect(game.phase).toBe("over");
    expect(game.replay.length).toBe(frames);
  });

  test("leaves out the hit stop, so it doesn't stall", () => {
    const game = started();
    game.health = 3;
    launch(game);
    const before = game.replay.length;
    game.virus.setXY(game.player.x, game.player.y);
    game.update(noInput);
    run(game, HIT_STOP);
    expect(game.replay.length).toBe(before + 1);
  });

  test("plays at half speed, holds the last frame for 1 s, then starts again", () => {
    // 2 s of the run.
    const frames = Array.from({ length: 2 * HZ }, (_, i) => ({ sprites: [], player: i, shield: false, jetpack: false, flying: false }));
    const at = (seconds: number) => replayFrame(frames, seconds)?.player;
    const last = 2 * HZ - 1;
    expect([at(0), at(1), at(2), at(3.99), at(4), at(4.99), at(5), at(6)]).toEqual([0, HZ / 2, HZ, last, last, last, 0, HZ / 2]);
    expect(replayFrame(frames.slice(0, HZ / 2), 1.5)?.player).toBe(HZ / 2 - 1);
    expect(replayFrame(frames.slice(0, HZ / 2), 2)?.player).toBe(0);
    expect(replayFrame([], 1)).toBeNull();
  });
});

describe("the run summary", () => {
  test("lists what was grabbed, in order, and starts empty each game", () => {
    const game = started();
    parkVirus(game);
    for (const kind of ["shield", "freeze"] as const) {
      game.powerUp.setCostume(kind);
      game.powerUp.setXY(game.player.x, game.player.y);
      game.powerUp.visible = true;
      game.update(noInput);
    }
    game.pickup.setXY(0, GROUND_Y + 40);
    game.pickup.visible = true;
    game.player.setXY(underPenguin(game), GROUND_Y + 40);
    game.update(noInput);
    expect(game.grabbed).toEqual(["shield", "freeze", "penguin"]);
    game.start();
    expect(game.grabbed).toEqual([]);
  });
});

describe("escaping the monitor", () => {
  const PLAYER_SIZE = 180.6111234669416;

  /** A game where the player just grabbed a jetpack at x 100, with the virus waiting in the monitor. */
  function withJetpack(): Game {
    const game = started();
    game.warning = Infinity;
    game.player.setXY(100, GROUND_Y);
    giveJetpack(game);
    return game;
  }

  function giveJetpack(game: Game): void {
    game.powerUp.setCostume("jetpack");
    game.powerUp.setXY(game.player.x, game.player.y);
    game.powerUp.visible = true;
    game.update(noInput);
    game.events.length = 0;
  }

  /** Flies up until the player escapes, and says how long it took. */
  function flyOut(game: Game): number {
    for (let i = 1; i <= 120; i++) {
      game.update(hold({ jump: true }));
      if (game.events.some((e) => e.type === "escape")) return i * DT;
    }
    throw new Error("didn't escape");
  }

  test("holding up into the ceiling with a jetpack bursts out of the monitor's screen", () => {
    const game = withJetpack();
    const seconds = flyOut(game);
    expect(seconds).toBeLessThan(1);
    // Where the player was in the room on the screen, as small as it.
    const from = toOuterRoom(100, CEILING_Y);
    expect(game.events).toEqual([{ type: "escape", ...from }]);
    expect(game.player.x).toBeCloseTo(from.x, 6);
    expect(game.player.y).toBeCloseTo(from.y, 6);
    expect(game.player.size).toBeCloseTo(PLAYER_SIZE * SCREEN_ROOM.scale, 6);
    expect([game.escapeTime, game.virus.visible]).toEqual([0, false]);
    // The room left behind is on the screen, with the virus but without the player.
    const costumes = game.inside.map((shot) => shot.costume);
    expect(costumes).toEqual([game.monitor.currentCostume, game.virus.currentCostume]);
  });

  test("bursting out takes half a second without control, then the player is full size under the ceiling", () => {
    const game = withJetpack();
    flyOut(game);
    run(game, ESCAPE_BURST, { left: true });
    expect(game.player.x).toBeCloseTo(100, 6);
    expect(game.player.y).toBeCloseTo(CEILING_Y - 40, 6);
    expect(game.player.size).toBe(PLAYER_SIZE);
    run(game, 0.1, { left: true });
    expect(game.player.x).toBeLessThan(100);
    expect(game.flying).toBe(true);
  });

  test("the player grows the whole time, from the screen to where they were across the room", () => {
    const game = withJetpack();
    flyOut(game);
    let size = game.player.size;
    let x = game.player.x;
    for (let i = 1; i < ESCAPE_BURST / DT; i++) {
      game.update(noInput);
      expect(game.player.size).toBeGreaterThan(size);
      expect(game.player.x).toBeGreaterThan(x);
      [size, x] = [game.player.size, game.player.x];
    }
  });

  test("the virus is stuck on the screen for a moment, then comes out of the monitor as usual", () => {
    const game = withJetpack();
    game.virus.setXY(-150, 0);
    flyOut(game);
    const stuck = Math.round(ESCAPE_STUCK / DT);
    for (let i = 1; i < stuck; i++) game.update(noInput);
    expect([game.virus.visible, game.virus.x, game.inside.length]).toEqual([false, -150, 2]);
    game.update(noInput);
    expect([game.virus.visible, game.virus.x, game.virus.y]).toEqual([true, VIRUS_SPAWN.x, VIRUS_SPAWN.y]);
    expect(game.warning).toBeGreaterThan(0);
    expect([game.escapeTime, game.inside]).toEqual([Infinity, []]);
  });

  test("a stuck virus can't hit, even right on the player", () => {
    const game = withJetpack();
    game.health = 2;
    flyOut(game);
    game.warning = 0;
    run(game, 1, { jump: true });
    game.virus.setXY(game.player.x, game.player.y);
    run(game, ESCAPE_STUCK - 1 - 2 * DT);
    expect(game.health).toBe(2);
    expect(types(game.events)).not.toContain("hit");
  });

  test("each jetpack escapes once", () => {
    const game = withJetpack();
    flyOut(game);
    game.events.length = 0;
    run(game, 2, { jump: true });
    expect(types(game.events)).not.toContain("escape");
    expect(game.player.y).toBe(CEILING_Y);
    giveJetpack(game);
    expect(flyOut(game)).toBeLessThan(0.1);
  });

  test("without a jetpack there's no escape", () => {
    const game = started();
    game.warning = Infinity;
    game.player.setXY(100, CEILING_Y);
    game.onGround = false;
    run(game, 0.5, { jump: true });
    expect(types(game.events)).not.toContain("escape");
    expect(game.escapeTime).toBe(Infinity);
  });

  test("a new game or a game over ends the escape", () => {
    const game = withJetpack();
    flyOut(game);
    die(game);
    expect([game.phase, game.escapeTime, game.inside, game.player.size]).toEqual(["over", Infinity, [], PLAYER_SIZE]);
    const again = withJetpack();
    flyOut(again);
    again.start();
    expect([again.escapeTime, again.inside, again.player.size]).toEqual([Infinity, [], PLAYER_SIZE]);
  });

  test("the room on the screen fits inside it, centered", () => {
    const topLeft = toOuterRoom(-240, 180);
    const bottomRight = toOuterRoom(240, -180);
    expect(topLeft).toEqual({ x: SCREEN_ROOM.left, y: SCREEN_ROOM.top });
    expect(bottomRight.x - topLeft.x).toBeCloseTo(80, 9);
    expect(topLeft.y - bottomRight.y).toBeCloseTo(SCREEN.height, 9);
    expect(topLeft.x - SCREEN.left).toBeCloseTo(SCREEN.left + SCREEN.width - bottomRight.x, 9);
  });

  test("the camera starts with the screen filling the stage and snaps out to the room", () => {
    const view = { x: 30, y: 12, scale: 2 };
    expect(escapeZoom(0)).toBeCloseTo(1 / SCREEN_ROOM.scale, 9);
    expect(escapeZoom(ESCAPE_ZOOM)).toBe(1);
    expect(escapeZoom(Infinity)).toBe(1);
    for (let t = DT; t < ESCAPE_ZOOM; t += DT) expect(escapeZoom(t)).toBeLessThan(escapeZoom(t - DT));
    // Fully zoomed in, the room on the screen lands exactly on the stage.
    const zoomed = zoomView(view, escapeZoom(0));
    const [x, y] = toCanvas(zoomed, SCREEN_ROOM.left, SCREEN_ROOM.top);
    expect(x).toBeCloseTo(view.x, 9);
    expect(y).toBeCloseTo(view.y, 9);
    expect(zoomed.scale * SCREEN_ROOM.scale).toBeCloseTo(view.scale, 9);
    expect(zoomView(view, 1)).toEqual(view);
  });
});

describe("the 3D world", () => {
  test("goes on in squares, each with its own shapes, the same every time", () => {
    expect(cellShapes(0, 0)).toEqual([]);
    for (const [i, j] of [[1, 0], [-3, 7], [12, -40], [4, 4], [-9, 2]] as const) {
      const shapes = cellShapes(i, j);
      expect(shapes.length).toBeGreaterThanOrEqual(1);
      expect(shapes.length).toBeLessThanOrEqual(6);
      const ramp = cellRamp(i, j);
      for (const shape of shapes) {
        expect(thirdCell(shape.x, shape.z)).toEqual([i, j]);
        // Off the roads, and off the ramp.
        expect(Math.abs(shape.x - roadX(i))).toBeGreaterThan(ROAD_HALF_WIDTH + shape.r);
        expect(Math.abs(shape.x - roadX(i - 1))).toBeGreaterThan(ROAD_HALF_WIDTH + shape.r);
        expect(Math.abs(shape.z - roadZ(j))).toBeGreaterThan(ROAD_HALF_WIDTH + shape.r);
        expect(Math.abs(shape.z - roadZ(j - 1))).toBeGreaterThan(ROAD_HALF_WIDTH + shape.r);
        if (ramp) expect(Math.hypot(shape.x - ramp.x, shape.z - ramp.z)).toBeGreaterThan(shape.r);
      }
      expect(cellShapes(i, j)).toEqual(shapes);
    }
    expect(cellShapes(1, 0)).not.toEqual(cellShapes(0, 1));
  });

  test("the car drives anywhere, and bumps off the shapes far from the start", () => {
    const game = started();
    parkVirus(game);
    game.cheat("drive");
    run(game, THIRD_IN);
    const third = game.third!;
    const shape = cellShapes(5, 3)[0]!;
    expect(Math.hypot(shape.x, shape.z)).toBeGreaterThan(5 * THIRD_CELL);
    // Heading straight at it from just outside its reach.
    third.traffic = [];
    game.events.length = 0;
    Object.assign(third.car, { x: shape.x, z: shape.z - shape.r - 70, heading: 0, vx: 0, vz: 600, speed: 600 });
    run(game, 0.1, { jump: true, gas: true });
    expect(third.car.speed).toBeLessThan(0);
    expect(crashIntoRound({ ...third.car }, shape.x, shape.z, shape.r)).toBeNull();
    // It hurt, and shook the camera.
    expect(third.car.hitPoints).toBeLessThan(HIT_POINTS);
    expect(game.events.find((e) => e.type === "crash")).toMatchObject({ type: "crash" });
    expect(third.sparks.length).toBeGreaterThan(0);
  });

  test("a wrecked car burns 3 seconds, blows up and throws the player out, and won't take them back", () => {
    const game = started();
    game.god = true;
    game.cheat("drive");
    run(game, THIRD_IN);
    const third = game.third!;
    third.car.wrecked = 0;
    game.events.length = 0;
    run(game, WRECK_BURN - 0.1, { jump: true, gas: true });
    expect([third.car.driving, third.car.husk, third.car.speed]).toEqual([true, false, 0]);
    run(game, 0.2);
    expect(types(game.events)).toContain("explode");
    expect([third.car.driving, third.car.husk]).toEqual([false, true]);
    expect(third.blasts.length).toBe(1);
    // Beside the car, and walking into it doesn't get back in.
    const { player: p, car } = third;
    expect(Math.hypot(p.x - car.x, p.z - car.z)).toBeGreaterThan(HALF_WIDTH);
    [p.x, p.z] = [car.x + 10, car.z];
    run(game, 0.1);
    expect(car.driving).toBe(false);
  });

  test("traffic drives around the player, and coins are grabbed once", () => {
    const game = started();
    game.god = true;
    game.cheat("dive");
    run(game, THIRD_IN + 0.1);
    const third = game.third!;
    expect(third.traffic.length).toBe(TRAFFIC_COUNT);
    for (const traffic of third.traffic) expect(Math.hypot(traffic.car.x - third.player.x, traffic.car.z - third.player.z)).toBeGreaterThan(1000);
    const coin = cellCoins(1, 0)[0]!;
    game.events.length = 0;
    // The first in its row, with the next one just out of reach.
    Object.assign(third.player, { x: coin.x, z: coin.z - 40 });
    run(game, 0.1);
    expect(game.coins).toBe(1);
    expect(types(game.events).filter((t) => t === "coin")).toHaveLength(1);
    expect(third.coins.has(coin.id)).toBe(true);
    run(game, 0.5);
    expect(game.coins).toBe(1);
    // A new run starts with none.
    game.start();
    expect(game.coins).toBe(0);
  });

  /** On foot in the 3D world, with the virus held still. */
  function onFoot(): Game {
    const game = started();
    game.god = true;
    game.cheat("dive");
    run(game, THIRD_IN + 0.1);
    game.third!.virus.warning = Infinity;
    return game;
  }
  /** A shape with room all round it, not a ball. */
  const lonely = () => {
    const shapes = [1, 2, 3].flatMap((i) => cellShapes(i, 0)).filter((s) => s.kind !== "sphere");
    return shapes.find((s) => shapes.every((o) => o === s || Math.hypot(o.x - s.x, o.z - s.z) > s.r + o.r + 150))!;
  };

  test("the player walks round the shapes, not through them", () => {
    const game = onFoot();
    const p = game.third!.player;
    const shape = lonely();
    Object.assign(p, { x: shape.x, z: shape.z - shape.r - 60 });
    run(game, 1, { forward: true });
    expect(p.x).toBeCloseTo(shape.x, 6);
    expect(p.z).toBeCloseTo(shape.z - shape.r - THIRD_RADIUS, 6);
    // Sideways past it, sliding round.
    Object.assign(p, { x: shape.x - shape.r - 60, z: shape.z + shape.r * 0.6 });
    run(game, 1, { right: true });
    expect(p.x).toBeGreaterThan(shape.x + shape.r);
    expect(Math.hypot(p.x - shape.x, p.z - shape.z)).toBeGreaterThanOrEqual(shape.r + THIRD_RADIUS - 1e-6);
  });

  test("the player walks up a ramp, not into its walls, and falls off its top", () => {
    const game = onFoot();
    const p = game.third!.player;
    const ramp = cellRamp(0, 0)!;
    expect(ramp.heading).toBe(0);
    Object.assign(p, { x: ramp.x, z: ramp.z - 40 });
    run(game, 0.4, { forward: true });
    expect(p.z).toBeGreaterThan(ramp.z + 40);
    expect(p.y).toBeCloseTo(rampHeight(ramp, p.x, p.z), 6);
    // Off the top end, up in the air, then down.
    run(game, 0.3, { forward: true });
    expect(p.z).toBeGreaterThan(ramp.z + ramp.length);
    expect(p.y).toBeGreaterThan(0);
    run(game, 1);
    expect(p.y).toBe(0);
    // The tall end and the high sides are walls.
    Object.assign(p, { x: ramp.x, z: ramp.z + ramp.length + 60 });
    run(game, 0.5, { down: true });
    expect(p.z).toBeGreaterThan(ramp.z + ramp.length);
    expect(p.y).toBe(0);
    Object.assign(p, { x: ramp.x - ramp.width / 2 - 60, z: ramp.z + ramp.length * 0.7 });
    run(game, 0.5, { right: true });
    expect(p.x).toBeLessThan(ramp.x - ramp.width / 2);
    expect(p.y).toBe(0);
  });

  test("up walks on foot, and Space jumps, again in the air, but not a third time", () => {
    const game = onFoot();
    const p = game.third!.player;
    const z = p.z;
    // Space holds jump, but only up held another way walks.
    run(game, 0.3, { jump: true, handbrake: true });
    expect(p.z).toBe(z);
    run(game, 0.3, { jump: true, gas: true, forward: true });
    expect(p.z).toBeGreaterThan(z + 50);
    game.events.length = 0;
    run(game, DT, { hopPressed: true });
    expect([p.vy > 0, p.jumps]).toEqual([true, 1]);
    let top = 0;
    for (let i = 0; i < 0.5 / DT; i++) {
      game.update(noInput);
      top = Math.max(top, p.y);
    }
    // 1.4 m up.
    expect(top / METER).toBeCloseTo(1.4, 1);
    run(game, DT, { hopPressed: true });
    expect(p.jumps).toBe(2);
    expect(p.vy).toBeCloseTo(THIRD_JUMP - 16 * METER * DT, 6);
    run(game, 0.1);
    const vy = p.vy;
    run(game, DT, { hopPressed: true });
    expect(p.vy).toBeLessThan(vy);
    expect(types(game.events).filter((t) => t === "hop")).toHaveLength(2);
    run(game, 2);
    expect([p.y, p.vy, p.jumps]).toEqual([0, 0, 0]);
  });

  test("a double jump lands on top of a shape, and walking off its edge falls", () => {
    const game = onFoot();
    const p = game.third!.player;
    const shapes = [1, 2, 3, 4].flatMap((i) => [0, 1].flatMap((j) => cellShapes(i, j)));
    const shape = shapes.find(
      (s) => s.kind === "cylinder" && s.r * 1.4 < 80 && shapes.every((o) => o === s || Math.hypot(o.x - s.x, o.z - s.z) > s.r + o.r + 250),
    )!;
    const top = shape.r * 1.4;
    Object.assign(p, { x: shape.x, z: shape.z - shape.r - THIRD_RADIUS - 5 });
    run(game, DT, { hopPressed: true });
    run(game, 0.3, { forward: true });
    run(game, DT, { hopPressed: true, forward: true });
    run(game, 0.3, { forward: true });
    run(game, 0.5);
    expect(Math.hypot(p.x - shape.x, p.z - shape.z)).toBeLessThan(shape.r);
    expect([p.y, p.vy]).toEqual([top, 0]);
    run(game, 1, { forward: true });
    expect(p.y).toBe(0);
    // A single jump doesn't reach it.
    Object.assign(p, { x: shape.x, z: shape.z - shape.r - THIRD_RADIUS - 5 });
    run(game, DT, { hopPressed: true });
    run(game, 1, { forward: true });
    expect(p.y).toBe(0);
    expect(Math.hypot(p.x - shape.x, p.z - shape.z)).toBeGreaterThanOrEqual(shape.r + THIRD_RADIUS - 1e-6);
  });

  test("a kick knocks the virus away without hurting, and shatters it frozen", () => {
    const game = onFoot();
    const third = game.third!;
    const { player: p, virus: v } = third;
    Object.assign(p, { x: 600, z: 100, facing: 0 });
    Object.assign(v, { x: 600, y: 0.8 * METER, z: 100 + 0.6 * METER, warning: 1 });
    const health = game.health;
    game.events.length = 0;
    run(game, DT, { kickPressed: true });
    expect(types(game.events)).toContain("kick");
    run(game, 0.2);
    expect(types(game.events)).toContain("smash");
    expect(v.kicked).toBe(true);
    // Away from the player, and up.
    expect(v.dz).toBeGreaterThan(0.9);
    expect(v.dy).toBeGreaterThan(0);
    run(game, 1);
    expect(game.health).toBe(health);
    // Not again until the kick's over.
    run(game, KICK_TIME);
    game.powers.freeze = 5;
    Object.assign(v, { x: p.x + Math.sin(p.facing) * 0.6 * METER, y: p.y + 0.8 * METER, z: p.z + Math.cos(p.facing) * 0.6 * METER, kicked: false });
    game.events.length = 0;
    run(game, DT, { kickPressed: true });
    run(game, 0.2);
    expect(types(game.events)).toContain("shatter");
    expect(game.powers.freeze).toBe(0);
  });

  test("only flat tops can be stood on, not cones, posts or balls", () => {
    const at = { x: 0, z: 0, r: 40 };
    const top = (kind: Shape["kind"], d: number) => standOn({ ...at, kind, top: kind === "post" ? 220 : shapeTop(kind, at.r) }, d, 0);
    expect([top("cylinder", 39), top("cylinder", 41), top("box", 33), top("box", 35)]).toEqual([56, null, 56, null]);
    expect([top("cone", 0), top("post", 0), top("sphere", 0)]).toEqual([null, null, null]);
    // Only what's below the feet, or a step up, is under them.
    const [cx, cz] = [3 * THIRD_CELL, 2 * THIRD_CELL];
    const shape = shapesNear(cx, cz).find((s) => s.kind === "cylinder" || s.kind === "box")!;
    expect(floorUnder(shape.x, shape.z, shape.top)).toBeGreaterThanOrEqual(shape.top);
    expect(floorUnder(shape.x, shape.z, shape.top - THIRD_STEP - 1)).toBeLessThan(shape.top);
  });

  test("the shapes near a point are as tall as they're drawn", () => {
    for (const shape of shapesNear(3 * THIRD_CELL, 2 * THIRD_CELL)) {
      expect(shape.top).toBeCloseTo(shape.kind === "cone" ? shape.r * 2.5 : shape.kind === "sphere" ? shape.r * 2 : shape.r * 1.4, 9);
    }
  });

  test("walking into a ball rolls it away ahead, and it stops a while later", () => {
    const game = onFoot();
    const third = game.third!;
    const p = third.player;
    run(game, DT);
    const ball = third.balls.get("0,0,0")!;
    expect(ball).toMatchObject({ x: 270, y: 0, z: 300, asleep: true });
    Object.assign(p, { x: 270, z: 300 - ball.r - THIRD_RADIUS - 30 });
    run(game, 0.4, { forward: true });
    // The player isn't held up by it, and it's ahead of them.
    expect(p.z).toBeGreaterThan(300);
    expect(ball.z).toBeGreaterThan(p.z + ball.r);
    expect(ball.vz).toBeGreaterThan(0);
    run(game, 6);
    expect(ball.asleep).toBe(true);
    expect(ball.z).toBeGreaterThan(400);
  });

  test("a kick sends a ball flying, bouncing", () => {
    const game = onFoot();
    const third = game.third!;
    const p = third.player;
    run(game, DT);
    const ball = third.balls.get("0,0,0")!;
    Object.assign(p, { x: 270 - ball.r - THIRD_RADIUS - 2, z: 300, facing: Math.PI / 2 });
    game.events.length = 0;
    run(game, DT, { kickPressed: true });
    run(game, 0.3);
    expect(ball.vx).toBeGreaterThan(5 * METER);
    expect(ball.y).toBeGreaterThan(0);
    run(game, 1.5);
    expect(types(game.events).filter((t) => t === "bounce").length).toBeGreaterThan(1);
    expect(ball.x - 270).toBeGreaterThan(8 * METER);
  });

  test("driving into a ball knocks it flying, without hurting the car", () => {
    const game = started();
    game.god = true;
    game.cheat("drive");
    run(game, THIRD_IN + 0.1);
    const third = game.third!;
    const { car } = third;
    run(game, DT);
    const ball = third.balls.get("0,0,0")!;
    Object.assign(car, { x: 270, z: 100, heading: 0, vx: 0, vz: 12 * METER, speed: 12 * METER });
    const hitPoints = car.hitPoints;
    game.events.length = 0;
    run(game, 0.6, { gas: true });
    expect(ball.z).toBeGreaterThan(car.z + 50);
    expect(ball.vz).toBeGreaterThan(car.vz);
    expect(types(game.events)).toContain("bounce");
    expect(car.hitPoints).toBe(hitPoints);
  });

  test("footsteps sound as the player runs, and landing from a jump, not standing still", () => {
    const game = onFoot();
    game.events.length = 0;
    run(game, 1);
    expect(types(game.events)).not.toContain("step");
    run(game, 1, { forward: true });
    // Running 9 m/s, a step every 2.1 m.
    const steps = types(game.events).filter((t) => t === "step").length;
    expect(steps).toBeGreaterThanOrEqual(3);
    expect(steps).toBeLessThanOrEqual(5);
    game.events.length = 0;
    run(game, DT, { hopPressed: true });
    run(game, 1.5);
    expect(types(game.events).filter((t) => t === "footLand")).toHaveLength(1);
    expect(types(game.events)).not.toContain("step");
  });

  test("the car landing off a ramp thumps, as hard as it falls", () => {
    const game = started();
    game.god = true;
    game.cheat("drive");
    run(game, THIRD_IN + 0.1);
    const { car } = game.third!;
    Object.assign(car, { x: 800, z: 100, y: 3 * METER, vy: 0, airborne: true });
    game.events.length = 0;
    run(game, 1.5);
    const lands = game.events.filter((e) => e.type === "carLand");
    expect(lands.length).toBeGreaterThanOrEqual(1);
    expect((lands[0] as { power: number }).power).toBeGreaterThan(0.5);
  });

  test("the car flying off a ramp smashes the virus in the air", () => {
    const game = started();
    game.god = true;
    game.cheat("drive");
    run(game, THIRD_IN + 0.1);
    const third = game.third!;
    const { car, virus } = third;
    const health = game.health;
    Object.assign(car, { x: 800, z: 100, y: 3 * METER, vy: 0, heading: 0, vx: 0, vz: 10 * METER, speed: 10 * METER, airborne: true });
    Object.assign(virus, { x: 800, y: 3 * METER + 40, z: 100 + 50, dx: 0, dy: 0, dz: -1, warning: 0, kicked: false });
    game.events.length = 0;
    run(game, DT);
    expect(types(game.events)).toContain("smash");
    expect(game.health).toBe(health);
    expect(virus.warning).toBeGreaterThan(0);
    // Far over it, it misses.
    Object.assign(car, { x: 800, z: 100, y: 0, vy: 0 });
    Object.assign(virus, { x: 800, y: 3 * METER, z: 100 + 50, dx: 0, dy: 0, dz: -1, warning: 0, kicked: false });
    game.events.length = 0;
    run(game, DT);
    expect(types(game.events)).not.toContain("smash");
  });

  test("the virus splats on a ball, knocking it", () => {
    const game = onFoot();
    const third = game.third!;
    run(game, DT);
    const ball = third.balls.get("0,0,0")!;
    Object.assign(third.player, { x: 600, z: 300 });
    Object.assign(third.virus, { x: 270, y: ball.r, z: 300 - ball.r - 30, dx: 0, dy: 0, dz: 1, warning: 0 });
    game.events.length = 0;
    run(game, 0.3);
    expect(types(game.events)).toContain("splat");
    expect(ball.z).toBeGreaterThan(300);
  });

  test("balls aren't shapes that stand still, and come along only once near", () => {
    for (const i of [1, 2, 3]) for (const shape of shapesNear(i * THIRD_CELL, 0)) expect(shape.kind).not.toBe("sphere");
    const game = onFoot();
    run(game, DT);
    const ids = [...game.third!.balls.keys()];
    expect(ids).toContain("0,0,0");
    for (const id of ids) {
      const [i, j] = id.split(",").map(Number);
      expect(Math.abs(i!) <= 1 && Math.abs(j!) <= 1).toBe(true);
    }
  });

  test("the virus splats on the shapes it flies into", () => {
    const game = onFoot();
    const third = game.third!;
    const shape = lonely();
    const health = game.health;
    Object.assign(third.player, { x: shape.x + 150, z: shape.z });
    Object.assign(third.virus, { x: shape.x, y: shape.r / 2, z: shape.z - shape.r - 30, dx: 0, dy: 0, dz: 1, warning: 0 });
    game.events.length = 0;
    run(game, 0.3);
    expect(types(game.events)).toContain("splat");
    expect(third.splats).toHaveLength(1);
    expect(game.health).toBe(health);
    // A new one, aiming again.
    expect(third.virus.warning).toBeGreaterThan(0);
  });

  test("a car pushes the player on foot out of its way", () => {
    const game = started();
    game.god = true;
    game.cheat("dive");
    run(game, THIRD_IN + 0.1);
    const third = game.third!;
    const car = third.traffic[0]!.car;
    Object.assign(third.player, { x: car.x + 5, z: car.z });
    run(game, DT);
    const [dx, dz] = [third.player.x - car.x, third.player.z - car.z];
    const across = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
    const along = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    expect(Math.abs(across) >= HALF_WIDTH || Math.abs(along) >= HALF_WIDTH).toBe(true);
  });
});

describe("Homer's car", () => {
  const still: CarControls = { gas: false, brake: false, handbrake: false, steer: 0 };
  function drive(car: Car, seconds: number, controls: Partial<CarControls> = {}): void {
    for (let t = 0; t < seconds; t += DT) driveCar(car, { ...still, ...controls }, DT);
  }
  /** The angle between where it points and where it goes. */
  function slide(car: Car): number {
    return Math.abs(Math.atan2(car.vx, car.vz) - car.heading);
  }

  test("tops out at Hit & Run's 120 km/h", () => {
    const car = parkedCar(0, 0);
    drive(car, 2, { gas: true });
    const early = car.speed;
    drive(car, 40, { gas: true });
    expect(early).toBeGreaterThan(300);
    expect(car.speed / METER * 3.6).toBeCloseTo(120, 0);
    expect(car.vx).toBeCloseTo(0, 6);
  });

  test("brakes to a stop, then backs up", () => {
    const car = parkedCar(0, 0);
    drive(car, 3, { gas: true });
    let stopped = Infinity;
    for (let t = 0; t < 3 && stopped === Infinity; t += DT) {
      driveCar(car, { ...still, brake: true }, DT);
      if (car.speed <= 0) stopped = t;
    }
    expect(stopped).toBeLessThan(1.5);
    drive(car, 1, { brake: true });
    expect(car.speed).toBeLessThan(-100);
  });

  test("coasts to a stop with nothing pressed", () => {
    const car = parkedCar(0, 0);
    drive(car, 3, { gas: true });
    drive(car, 20);
    expect([car.vx, car.vz, car.spin, car.speed]).toEqual([0, 0, 0, 0]);
  });

  test("steering turns it, right to the right, and holds its grip", () => {
    const car = parkedCar(0, 0);
    drive(car, 3, { gas: true });
    drive(car, 0.5, { gas: true, steer: 1 });
    expect(car.heading).toBeGreaterThan(0.3);
    expect(car.grip).toBe("normal");
    expect(slide(car)).toBeLessThan(0.2);
    const left = parkedCar(0, 0);
    drive(left, 3, { gas: true });
    drive(left, 0.5, { gas: true, steer: -1 });
    expect(left.heading).toBeCloseTo(-car.heading, 6);
  });

  test("doesn't turn standing still", () => {
    const car = parkedCar(0, 0);
    drive(car, 1, { steer: 1 });
    expect([car.heading, car.x, car.z]).toEqual([0, 0, 0]);
  });

  test("the handbrake swings the back out into a slide", () => {
    const turning = (handbrake: boolean) => {
      const car = parkedCar(0, 0);
      drive(car, 4, { gas: true });
      drive(car, 1, { gas: true, steer: 1, handbrake });
      return car;
    };
    const plain = turning(false);
    const sliding = turning(true);
    expect([plain.grip, sliding.grip]).toEqual(["normal", "handbrake"]);
    expect(sliding.heading).toBeGreaterThan(plain.heading);
    expect(slide(sliding)).toBeGreaterThan(slide(plain) + 0.1);
    // Letting go, it grips again once it's going straight.
    drive(sliding, 3, { gas: true });
    expect(sliding.grip).toBe("normal");
  });

  test("Space is the handbrake, and up held some other way is the gas", () => {
    const controls = new Controls();
    controls.press("key:Space", "jump");
    expect(controls.read()).toMatchObject({ jump: true, gas: false, handbrake: true });
    controls.press("key:KeyW", "jump");
    expect(controls.read()).toMatchObject({ jump: true, gas: true, handbrake: true });
    controls.release("key:Space");
    expect(controls.read()).toMatchObject({ jump: true, gas: true, handbrake: false });
  });

  test("bounces off what it runs into", () => {
    const car = Object.assign(parkedCar(0, -100), { vz: 600, speed: 600 });
    const crash = crashIntoRound(car, 0, 0, 40);
    expect(crash!.impulse).toBeGreaterThan(0);
    expect(car.vz).toBeLessThan(0);
    expect(crashIntoRound(car, 0, 0, 40)).toBeNull();
    expect(crashIntoRound(car, 500, 500, 40)).toBeNull();
  });

});
