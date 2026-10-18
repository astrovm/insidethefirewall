import { describe, expect, test } from "bun:test";
import { Controls, moveForKey } from "../src/input.ts";
import { Fader } from "../src/remaster/fader.ts";
import {
  DT,
  Game,
  GROUND_Y,
  hl3Shown,
  noInput,
  PLAYER_SPEED,
  VIRUS_SPAWN,
  VIRUS_START_SPEED,
  type GameEvent,
  type Input,
} from "../src/remaster/game.ts";
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
}

const types = (events: GameEvent[]) => events.map((event) => event.type);

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
    game.health = 0;
    game.update(noInput);
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
    game.update(noInput);
    expect(game.previous.get(game.player)?.x).toBeCloseTo(PLAYER_SPEED * DT, 6);
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
  test("the player runs 600 pixels a second, like 20 per Scratch frame", () => {
    const game = started();
    parkVirus(game);
    game.player.setXY(0, GROUND_Y);
    run(game, 0.1, { right: true });
    expect(game.player.x).toBeCloseTo(PLAYER_SPEED * 0.1, 6);
    expect(game.player.direction).toBe(90);
    run(game, 0.1, { left: true });
    expect(game.player.x).toBeCloseTo(0, 6);
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
  test("a jump goes up 75 pixels in 0.15 s and lands 0.15 s later", () => {
    const game = started();
    parkVirus(game);
    game.update(hold({ jump: true, jumpPressed: true }));
    expect(game.onGround).toBe(false);
    expect(game.player.currentCostume.name).toBe("jump");
    run(game, 0.15 - DT, { jump: true });
    expect(game.player.y).toBeCloseTo(-25, 6);
    run(game, 0.15 - DT);
    expect(game.player.y).toBeGreaterThan(GROUND_Y);
    run(game, DT);
    expect(game.player.y).toBe(GROUND_Y);
    expect(game.onGround).toBe(true);
  });

  test("pressing jump in the air does nothing", () => {
    const game = started();
    parkVirus(game);
    game.update(hold({ jumpPressed: true }));
    run(game, 0.1);
    const y = game.player.y;
    game.update(hold({ jumpPressed: true }));
    run(game, 0.2 - DT);
    expect(game.player.y).toBe(GROUND_Y);
    expect(y).toBeGreaterThan(GROUND_Y);
  });

  test("holding jump doesn't jump again", () => {
    const game = started();
    parkVirus(game);
    game.update(hold({ jump: true, jumpPressed: true }));
    run(game, 0.5, { jump: true });
    expect(game.onGround).toBe(true);
  });
});

describe("the virus", () => {
  test("waits 0.2 s in the monitor, then flies at the player", () => {
    const game = started();
    game.player.setXY(150, GROUND_Y);
    run(game, 0.2 - DT);
    expect([game.virus.x, game.virus.y]).toEqual([VIRUS_SPAWN.x, VIRUS_SPAWN.y]);
    run(game, DT);
    const flown = Math.hypot(game.virus.x - VIRUS_SPAWN.x, game.virus.y - VIRUS_SPAWN.y);
    expect(flown).toBeCloseTo(VIRUS_START_SPEED * DT, 6);
    expect(game.virus.x).toBeGreaterThan(VIRUS_SPAWN.x);
    expect(game.virus.y).toBeLessThan(VIRUS_SPAWN.y);
  });

  test("keeps flying once it leaves the monitor", () => {
    const game = started();
    game.player.setXY(200, GROUND_Y);
    run(game, 0.2 + 0.25);
    const flown = Math.hypot(game.virus.x - VIRUS_SPAWN.x, game.virus.y - VIRUS_SPAWN.y);
    expect(flown).toBeCloseTo(VIRUS_START_SPEED * (0.25 + DT), 6);
  });

  test("goes back to the monitor and aims again when it reaches an edge", () => {
    const game = started();
    run(game, 0.2);
    game.player.setXY(-200, GROUND_Y);
    game.virus.setXY(239, 0);
    game.virus.setDirection(90);
    run(game, DT);
    expect([game.virus.x, game.virus.y]).toEqual([VIRUS_SPAWN.x, VIRUS_SPAWN.y]);
    expect(game.virus.direction).toBeLessThan(0);
  });

  test("a hit takes a heart, shows the hit face and sends the virus back", () => {
    const game = started();
    game.health = 2;
    run(game, 0.2);
    game.virus.setXY(game.player.x, game.player.y);
    run(game, DT);
    expect(game.health).toBe(1);
    expect(game.player.currentCostume.name).toBe("hit");
    expect([game.virus.x, game.virus.y]).toEqual([VIRUS_SPAWN.x, VIRUS_SPAWN.y]);
    expect(types(game.events)).toEqual(["hit"]);
    expect(game.phase).toBe("playing");
    run(game, 0.3 - 2 * DT);
    expect(game.player.currentCostume.name).toBe("hit");
    run(game, 2 * DT);
    expect(game.player.currentCostume.name).toBe("normal");
  });

  test("gets faster every 5 to 10 seconds", () => {
    const game = started();
    parkVirus(game);
    let changes = 0;
    let last = game.speed;
    for (let i = 0; i < Math.round(60 / DT); i++) {
      game.update(noInput);
      if (game.speed !== last) {
        expect(game.speed - last).toBeCloseTo(27, 6);
        last = game.speed;
        changes++;
      }
    }
    expect(changes).toBeGreaterThanOrEqual(6);
    expect(changes).toBeLessThanOrEqual(12);
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

  test("standing under it isn't enough, jumping into it gives a heart", () => {
    const game = started();
    parkVirus(game);
    run(game, 10);
    game.player.setXY(game.pickup.x, GROUND_Y);
    run(game, 0.5);
    expect(game.health).toBe(1);
    game.events.length = 0;
    game.update(hold({ jumpPressed: true }));
    run(game, 0.15);
    expect(game.health).toBe(2);
    expect(game.pickup.visible).toBe(false);
    expect(types(game.events)).toEqual(["pickup"]);
  });
});

describe("the penguin's spot", () => {
  test("is picked between x -120 and 295, and turned around at the right edge, like 2013", () => {
    for (const [share, x, direction] of [
      [0, -120, 90],
      [0.99999, null, -90],
    ] as const) {
      const game = new Game(() => share);
      game.start();
      parkVirus(game);
      run(game, 10);
      if (x !== null) expect(game.pickup.x).toBe(x);
      expect(game.pickup.direction).toBe(direction);
    }
  });
});

describe("game over", () => {
  function lost(): Game {
    const game = started();
    parkVirus(game);
    run(game, 3);
    game.health = 0;
    game.events.length = 0;
    game.update(noInput);
    return game;
  }

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
    const game = new Game(() => 0.99999);
    game.start();
    parkVirus(game);
    run(game, 10);
    expect(game.pickup.direction).toBe(-90);
    game.health = 0;
    game.update(noInput);
    expect(game.pickup.direction).toBe(90);
  });

  test("the Half-Life 3 logo starts hidden on every game over", () => {
    const game = lost();
    run(game, 10.5);
    expect(game.hl3.visible).toBe(true);
    game.start();
    parkVirus(game);
    game.health = 0;
    game.update(noInput);
    expect(game.hl3.visible).toBe(false);
  });

  test("time stops on the game over screen", () => {
    const game = lost();
    run(game, 2);
    expect(game.time).toBeCloseTo(3 + DT, 6);
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
      game.health = 0;
      game.update(noInput);
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
