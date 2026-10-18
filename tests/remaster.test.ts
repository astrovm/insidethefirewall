import { describe, expect, test } from "bun:test";
import { Controls, moveForKey } from "../src/input.ts";
import { Fader } from "../src/remaster/fader.ts";
import {
  AIM_LOCK,
  FEET_Y,
  THREAT_WARNING,
  TROJAN_STOP,
  WORM_SPEED,
  DEATH_PAUSE,
  DT,
  Game,
  GROUND_Y,
  HIT_STOP,
  hl3Shown,
  INVINCIBLE,
  JUMP_BUFFER,
  JUMP_HEIGHT,
  noInput,
  PICKUP_BLINK,
  PICKUP_SHOWN,
  PLAYER_SPEED,
  VIRUS_SPAWN,
  VIRUS_START_SPEED,
  VIRUS_TOP_SPEED,
  WARNING_LONGEST,
  WARNING_SHORTEST,
  type GameEvent,
  type Input,
} from "../src/remaster/game.ts";
import { STAGES } from "../src/remaster/progress.ts";
import { fitStage, formatTime, toCanvas, toStage } from "../src/remaster/render.ts";
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
    expect(game.layers.map((s) => s.name)).toEqual(["pickup", "player", "monitor", "virus"]);
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
    run(game, 10);
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
    expect(game.vx).toBeCloseTo(PLAYER_SPEED / 6, 6);
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
    expect(game.vx).toBe(PLAYER_SPEED - PLAYER_SPEED / 4);
    run(game, 3 * DT);
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
    for (let i = 0; i < 6; i++) {
      game.update(hold({ left: true }));
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
    for (let i = 0; i < 20; i++) {
      game.update(hold({ right: true }));
      costumes.push(game.player.currentCostume.name);
    }
    expect(costumes.slice(0, 8)).toEqual(Array(8).fill("walk1"));
    expect(costumes.slice(9, 17)).toEqual(Array(8).fill("walk2"));
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
    expect(heights[0]).toBeGreaterThan(23);
    for (let i = 1; i < heights.length; i++) expect(heights[i]!).toBeGreaterThan(heights[i - 1]!);
  });

  test("a short hop still reaches the penguin", () => {
    const game = started();
    parkVirus(game);
    run(game, 10);
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
    expect(flown).toBeCloseTo(VIRUS_START_SPEED * DT, 6);
    expect(game.virus.x).toBeGreaterThan(VIRUS_SPAWN.x);
  });

  test("keeps flying once it leaves the monitor", () => {
    const game = started();
    game.player.setXY(200, GROUND_Y);
    launch(game);
    run(game, 0.25);
    const flown = Math.hypot(game.virus.x - VIRUS_SPAWN.x, game.virus.y - VIRUS_SPAWN.y);
    expect(flown).toBeCloseTo(VIRUS_START_SPEED * (0.25 + DT), 6);
  });

  test("goes back to the monitor and warns again when it reaches an edge", () => {
    const game = started();
    launch(game);
    game.player.setXY(-200, GROUND_Y);
    game.virus.setXY(239, 0);
    game.virus.setDirection(90);
    run(game, DT);
    expect([game.virus.x, game.virus.y]).toEqual([VIRUS_SPAWN.x, VIRUS_SPAWN.y]);
    expect(game.warning).toBe(WARNING_LONGEST);
    expect(game.target.x).toBe(-200);
  });

  test("warns for less time as it gets faster", () => {
    const game = started();
    launch(game);
    game.speed = VIRUS_TOP_SPEED;
    game.virus.setXY(239, 0);
    game.virus.setDirection(90);
    run(game, DT);
    expect(game.warning).toBeCloseTo(WARNING_SHORTEST, 6);
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
  test("shows up every 10 s for 2 s, at the height of a jump", () => {
    const game = started();
    parkVirus(game);
    game.player.setXY(-205, GROUND_Y);
    run(game, 10 - DT);
    expect(game.pickup.visible).toBe(false);
    run(game, DT);
    expect(game.pickup.visible).toBe(true);
    expect(game.pickup.y).toBe(-25);
    run(game, 2 - DT);
    expect(game.pickup.visible).toBe(true);
    run(game, DT);
    expect(game.pickup.visible).toBe(false);
  });

  test("tells how long it has left, so it can blink before it goes", () => {
    const game = started();
    parkVirus(game);
    game.player.setXY(-205, GROUND_Y);
    expect(game.pickupLeft).toBe(0);
    run(game, 10);
    expect(game.pickupLeft).toBeCloseTo(PICKUP_SHOWN, 6);
    run(game, PICKUP_SHOWN - PICKUP_BLINK);
    expect(game.pickupLeft).toBeCloseTo(PICKUP_BLINK, 6);
  });

  test("standing under it isn't enough, jumping into it gives a heart", () => {
    const game = started();
    parkVirus(game);
    run(game, 10);
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
      run(game, 10);
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

describe("stages", () => {
  test("a new game announces stage 1", () => {
    const game = new Game(seeded(1));
    game.start();
    expect(game.events).toContainEqual({ type: "stage", stage: 0 });
    expect([game.stage, game.stageTime, game.threats]).toEqual([0, 0, []]);
  });

  test("every stage starts on time, with a sound and a faster virus", () => {
    const game = started();
    parkVirus(game);
    game.health = 999;
    const seen: [number, number, number][] = [];
    for (let i = 0; i < Math.round(115 / DT); i++) {
      game.update(noInput);
      for (const event of game.events) if (event.type === "stage") seen.push([event.stage, Math.round(game.time), game.speed]);
      if (game.events.some((e) => e.type === "stage")) expect(game.events).toContainEqual({ type: "sound", sound: "laser" });
      game.events.length = 0;
      game.health = 999;
    }
    expect(seen).toEqual(STAGES.slice(1).map((s, i) => [i + 1, s.from, s.virusSpeed]));
  });

  test("the last stage keeps speeding the virus up to its top speed", () => {
    const game = started();
    parkVirus(game);
    game.invincible = Infinity;
    game.time = 109.99;
    run(game, DT);
    expect(game.speed).toBe(STAGES.at(-1)!.virusSpeed);
    run(game, 10);
    expect(game.speed).toBe(STAGES.at(-1)!.virusSpeed + 27);
    run(game, 60);
    expect(game.speed).toBe(VIRUS_TOP_SPEED);
  });

  test("stage 1 has only the virus", () => {
    const game = started();
    parkVirus(game);
    run(game, 19.9);
    expect(game.threats).toEqual([]);
  });

  test("a new kind of threat comes 1.5 s after its stage starts, then every few seconds", () => {
    const game = started();
    parkVirus(game);
    game.invincible = Infinity;
    game.time = 20 - DT;
    run(game, DT);
    run(game, 1.5 - 2 * DT);
    expect(game.threats).toEqual([]);
    run(game, DT);
    expect(game.threats.map((t) => t.kind)).toEqual(["worm"]);
    let worms = 1;
    for (let i = 0; i < Math.round(20 / DT); i++) {
      const before = game.threats.length;
      game.update(noInput);
      game.health = 9;
      if (game.threats.length > before) worms++;
    }
    // One every 6 to 9 s.
    expect(worms).toBeGreaterThanOrEqual(3);
    expect(worms).toBeLessThanOrEqual(4);
  });

  test("threats are gone after game over and in a new game", () => {
    const game = started();
    parkVirus(game);
    game.invincible = Infinity;
    game.time = 75;
    run(game, 5);
    expect(game.threats.length).toBeGreaterThan(0);
    game.invincible = 0;
    die(game);
    expect(game.threats).toEqual([]);
    expect(game.layers.map((s) => s.name)).toEqual(["gameOver", "virus", "monitor", "player", "pickup", "hl3"]);
    game.start();
    expect([game.stage, game.threats]).toEqual([0, []]);
  });
});

describe("threats", () => {
  /** A game in stage 1 with one threat of a kind, coming from the left (share < 0.5). */
  function withThreat(kind: "worm" | "popup" | "trojan", share = 0.25): Game {
    const game = new Game(() => share);
    game.start();
    parkVirus(game);
    game.events.length = 0;
    (game as unknown as { spawn(kind: string): void }).spawn(kind);
    return game;
  }

  test("a worm waits past the left wall, then crawls along the floor", () => {
    const game = withThreat("worm");
    const worm = game.threats[0]!;
    expect([worm.sprite.x, worm.sprite.y, worm.warning]).toEqual([-280, FEET_Y, THREAT_WARNING]);
    expect(worm.sprite.direction).toBe(90);
    game.player.setXY(200, GROUND_Y);
    run(game, THREAT_WARNING - DT);
    expect(worm.sprite.x).toBe(-280);
    run(game, 1 + DT);
    expect(worm.sprite.x).toBeCloseTo(-280 + WORM_SPEED * (1 + DT), 6);
    expect(game.layers.indexOf(worm.sprite)).toBeLessThan(game.layers.indexOf(game.player));
  });

  test("a worm from the right faces left and crawls left", () => {
    const game = withThreat("worm", 0.75);
    game.invincible = Infinity;
    const worm = game.threats[0]!;
    expect([worm.sprite.x, worm.sprite.direction]).toEqual([280, -90]);
    run(game, THREAT_WARNING + 1);
    expect(worm.sprite.x).toBeCloseTo(280 - WORM_SPEED * (1 + DT), 6);
  });

  test("a worm wriggles between its two costumes", () => {
    const game = withThreat("worm");
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      game.update(noInput);
      seen.add(game.threats[0]!.sprite.currentCostume.name);
    }
    expect([...seen].sort()).toEqual(["worm1", "worm2"]);
  });

  test("a worm hurts if you stand still", () => {
    const game = withThreat("worm");
    game.health = 2;
    game.player.setXY(-150, GROUND_Y);
    run(game, THREAT_WARNING + 1.3);
    expect(game.health).toBe(1);
  });

  test("a running jump clears a worm", () => {
    const game = withThreat("worm");
    game.health = 2;
    game.player.setXY(100, GROUND_Y);
    const worm = game.threats[0]!.sprite;
    let jumped = false;
    for (let i = 0; i < Math.round(4 / DT); i++) {
      // Run at it once it's on stage, and jump about 60 px before it.
      const go = worm.x > -200;
      const close: boolean = go && !jumped && worm.x + 36 > game.player.x - 25 - 60;
      jumped ||= close;
      game.update(hold({ left: go, jump: jumped, jumpPressed: close }));
    }
    expect(jumped).toBe(true);
    expect(game.health).toBe(2);
    expect(worm.x).toBeGreaterThan(game.player.x);
  });

  test("a worm goes away after crossing the stage", () => {
    const game = withThreat("worm");
    game.player.setXY(200, GROUND_Y);
    game.invincible = 999;
    run(game, THREAT_WARNING + 5);
    expect(game.threats).toEqual([]);
  });

  test("a popup shows where it will land, then falls and shatters on the floor", () => {
    const game = withThreat("popup");
    const popupThreat = game.threats[0]!;
    const x = popupThreat.sprite.x;
    expect(x).toBe(-100);
    expect(popupThreat.sprite.y).toBeGreaterThan(180);
    game.player.setXY(150, GROUND_Y);
    run(game, THREAT_WARNING);
    expect(popupThreat.sprite.y).toBeGreaterThan(180);
    run(game, 1);
    expect(game.threats).toEqual([]);
    const shatter = game.events.find((e) => e.type === "shatter");
    expect(shatter).toMatchObject({ x });
    expect(game.health).toBe(1);
  });

  test("a popup that lands on the player hurts", () => {
    const game = withThreat("popup");
    game.health = 2;
    game.player.setXY(-100, GROUND_Y);
    run(game, THREAT_WARNING + 1);
    expect(game.health).toBe(1);
    expect(game.threats).toEqual([]);
  });

  test("a Trojan horse rolls in, stops, lets out a small virus and rolls on", () => {
    const game = withThreat("trojan");
    const horse = game.threats[0]!;
    const stop = horse.stopX;
    expect(stop).toBe(-50);
    game.player.setXY(200, GROUND_Y);
    game.invincible = 999;
    let released = -1;
    for (let i = 0; i < Math.round(10 / DT) && released < 0; i++) {
      game.update(noInput);
      if (game.threats.some((t) => t.kind === "virus")) released = i;
    }
    expect(horse.sprite.x).toBe(stop);
    const small = game.threats.find((t) => t.kind === "virus")!;
    expect(small.sprite.size).toBe(150);
    expect([small.sprite.x, small.sprite.y]).toEqual([stop, FEET_Y + 40]);
    expect(small.warning).toBe(WARNING_LONGEST);
    expect(game.layers.at(-1)).toBe(small.sprite);
    run(game, TROJAN_STOP - DT);
    expect(horse.sprite.x).toBe(stop);
    run(game, 0.5);
    expect(horse.sprite.x).toBeGreaterThan(stop);
  });

  /** Runs until the Trojan horse lets out its virus. */
  function released(game: Game) {
    for (let i = 0; i < Math.round(10 / DT); i++) {
      const small = game.threats.find((t) => t.kind === "virus");
      if (small) return small;
      game.update(noInput);
    }
    throw new Error("No virus came out");
  }

  test("the small virus aims at the player, flies, and goes away at the edge", () => {
    const game = withThreat("trojan");
    game.player.setXY(200, GROUND_Y);
    game.invincible = 999;
    const small = released(game);
    game.player.setXY(-200, GROUND_Y);
    const launched = () => game.events.some((e) => e.type === "launch");
    game.events.length = 0;
    for (let i = 0; i < 60 && !launched(); i++) game.update(noInput);
    expect(small.target.x).toBe(-200);
    run(game, 3);
    expect(game.threats.includes(small)).toBe(false);
  });

  test("the small virus hurts and goes away", () => {
    const game = withThreat("trojan");
    game.player.setXY(200, GROUND_Y);
    game.invincible = 999;
    const small = released(game);
    game.invincible = 0;
    small.warning = 0;
    small.sprite.setXY(game.player.x, game.player.y);
    game.health = 2;
    run(game, DT);
    expect(game.health).toBe(1);
    expect(game.threats.includes(small)).toBe(false);
  });

  test("only the small virus aims and launches", () => {
    const game = withThreat("worm");
    game.player.setXY(200, GROUND_Y);
    const worm = game.threats[0]!;
    run(game, THREAT_WARNING + DT);
    expect(types(game.events)).not.toContain("launch");
    expect(worm.sprite.direction).toBe(90);
  });

  test("worms and Trojan horses are full size, and only popups never turn", () => {
    for (const kind of ["worm", "popup", "trojan"] as const) {
      const sprite = withThreat(kind).threats[0]!.sprite;
      expect(sprite.size).toBe(300);
      expect(sprite.rotationStyle).toBe(kind === "popup" ? "don't rotate" : "left-right");
    }
  });

  test("threats come from the right half the time", () => {
    expect(withThreat("worm", 0.5).threats[0]!.sprite.x).toBe(280);
    expect(withThreat("worm", 0.49).threats[0]!.sprite.x).toBe(-280);
  });

  test("a worm changes costume every 18 px it crawls", () => {
    const game = withThreat("worm");
    game.player.setXY(200, GROUND_Y);
    run(game, THREAT_WARNING);
    let changes = 0;
    let last = game.threats[0]!.sprite.currentCostume.name;
    for (let i = 0; i < 60; i++) {
      game.update(noInput);
      const now = game.threats[0]!.sprite.currentCostume.name;
      if (now !== last) changes++;
      last = now;
    }
    // 120 px in a second.
    expect(changes).toBeGreaterThanOrEqual(6);
    expect(changes).toBeLessThanOrEqual(7);
  });

  test("a Trojan horse rolls slower than a worm, and hurts", () => {
    const game = withThreat("trojan");
    const horse = game.threats[0]!.sprite;
    game.player.setXY(200, GROUND_Y);
    run(game, THREAT_WARNING + 1);
    expect(horse.x).toBeCloseTo(-280 + 80 * (1 + DT), 6);
    game.health = 2;
    game.player.setXY(horse.x, GROUND_Y);
    run(game, DT);
    expect(game.health).toBe(1);
  });

  test("a Trojan horse lets out only one virus", () => {
    const game = withThreat("trojan");
    game.player.setXY(200, GROUND_Y);
    game.invincible = Infinity;
    let viruses = 0;
    for (let i = 0; i < Math.round(12 / DT); i++) {
      const before = game.threats.filter((t) => t.kind === "virus").length;
      game.update(noInput);
      if (game.threats.filter((t) => t.kind === "virus").length > before) viruses++;
    }
    expect(viruses).toBe(1);
  });

  test("the small virus starts aimed at the player, locks its aim, then flies at it", () => {
    const game = withThreat("trojan");
    game.player.setXY(200, GROUND_Y);
    game.invincible = Infinity;
    const small = released(game);
    expect(small.target).toEqual({ x: 200, y: GROUND_Y });
    const [x, y] = [small.sprite.x, small.sprite.y];
    run(game, WARNING_LONGEST - AIM_LOCK);
    game.player.setXY(-200, GROUND_Y);
    game.events.length = 0;
    run(game, AIM_LOCK);
    expect(small.target).toEqual({ x: 200, y: GROUND_Y });
    // It launches from where the Trojan horse let it out.
    expect(game.events).toContainEqual({ type: "launch", x, y });
    const distance = () => Math.hypot(small.sprite.x - 200, small.sprite.y - GROUND_Y);
    const before = distance();
    run(game, 0.1);
    expect(distance()).toBeCloseTo(before - game.speed * 0.1, 6);
  });

  test("threats are drawn back to front: floor, player, popups, monitor, viruses", () => {
    const game = withThreat("trojan");
    game.player.setXY(200, GROUND_Y);
    game.invincible = Infinity;
    released(game);
    const spawn = (kind: string) => (game as unknown as { spawn(kind: string): void }).spawn(kind);
    spawn("worm");
    spawn("popup");
    game.update(noInput);
    expect(game.layers.map((s) => s.name)).toEqual(["pickup", "trojan", "worm", "player", "popup", "monitor", "virus", "virus"]);
  });

  test("the stage clock counts up and starts over each stage", () => {
    const game = started();
    parkVirus(game);
    run(game, 1);
    expect(game.stageTime).toBeCloseTo(1, 6);
    game.time = 20 - DT;
    run(game, DT);
    expect(game.stageTime).toBe(0);
  });

  test("a new stage doesn't reset the timer of threats already coming", () => {
    const game = started();
    parkVirus(game);
    game.invincible = Infinity;
    game.time = 30;
    run(game, DT);
    const spawns = (game as unknown as { spawns: Record<string, number> }).spawns;
    spawns.worm = 4;
    game.time = 45 - DT;
    run(game, DT);
    expect(spawns.worm).toBeCloseTo(4 - DT, 6);
    expect(spawns.popup).toBeCloseTo(1.5 - DT, 6);
  });

  test("threats come between the stage's shortest and longest wait", () => {
    for (const [share, wait] of [[0, 6], [0.5, 7.5], [0.99, 8.97]]) {
      const game = new Game(() => share!);
      game.start();
      parkVirus(game);
      game.invincible = Infinity;
      game.time = 30;
      const spawns = (game as unknown as { spawns: Record<string, number> }).spawns;
      spawns.worm = DT;
      run(game, DT);
      expect(spawns.worm).toBeCloseTo(wait!, 6);
    }
  });

  test("threats can't hurt while the player blinks", () => {
    const game = withThreat("worm");
    game.health = 2;
    game.invincible = 999;
    game.player.setXY(-150, GROUND_Y);
    run(game, THREAT_WARNING + 2);
    expect(game.health).toBe(2);
  });
});

describe("controls", () => {
  test("the 2013 keys move the player", () => {
    expect(["a", "A", "ArrowLeft", "d", "ArrowRight", "s", "ArrowDown", "w", " ", "ArrowUp", "x", "Enter"].map(moveForKey)).toEqual([
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
    expect(controls.read()).toEqual({ ...noInput, jumpPressed: true });
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
    expect(controls.read()).toEqual({ ...noInput, jump: true });
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
