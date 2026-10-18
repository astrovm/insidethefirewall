// The 2013 game, script by script. Names in comments are the original
// Spanish ones from the Scratch project, so it's easy to compare.

import { Sprite, type Costume } from "../engine/sprite.ts";
import type { Project, ScriptDef } from "../engine/world.ts";
import type { World } from "../engine/world.ts";

const svg = (name: string, file: string, box: [number, number, number, number], center: [number, number]): Costume => ({
  name,
  file,
  x: box[0],
  y: box[1],
  width: box[2],
  height: box[3],
  centerX: center[0],
  centerY: center[1],
  smooth: true,
});

const bitmap = (name: string, file: string, size: [number, number], center: [number, number], smooth: boolean): Costume => ({
  // Every bitmap in the project is saved at Scratch's double resolution.
  name,
  file,
  x: 0,
  y: 0,
  width: size[0] / 2,
  height: size[1] / 2,
  centerX: center[0] / 2,
  centerY: center[1] / 2,
  smooth,
});

const playerBox: [number, number, number, number] = [-0.5, -0.5, 28, 48];

/**
 * Collision boxes measured from the Scratch runtime with renderer.getBounds().
 * Scratch's outline tracing trims some edges, so the images alone don't give
 * these exact numbers. Touching still uses the real pixels.
 */
const measured = (costume: Costume, left: number, top: number, right: number, bottom: number): Costume => ({
  ...costume,
  opaque: { left, top, right, bottom },
});

export const costumes = {
  stage: svg("stage", "stage.svg", [-0.5, -0.5, 481, 361], [240, 180]),
  player: [
    measured(svg("normal", "player-normal.svg", playerBox, [13, 23]), 0, 0, 27, 47),
    measured(svg("walk1", "player-walk1.svg", playerBox, [13, 23]), 0, 0, 27, 47),
    measured(svg("walk2", "player-walk2.svg", playerBox, [13, 23]), 0, 0, 27, 47),
    measured(svg("jump", "player-jump.svg", playerBox, [13, 23]), 0, 0, 27, 47),
    measured(svg("hit", "player-hit.svg", playerBox, [13, 23]), 0, 0, 27, 47),
    measured(bitmap("crouch", "player-crouch.png", [54, 82], [24, 34], false), 0.5, 0.5, 26.5, 40.5),
  ],
  virus: [measured(svg("virus", "virus.svg", [-0.5, -0.5, 18, 20], [8, 9]), 1, 1, 17, 19)],
  monitor: [svg("monitor", "monitor.svg", [-0.5, -0.5, 75, 72], [37, 36])],
  gameOver: [svg("game-over", "game-over.svg", [0.5, 0, 339.5, 254.5], [248, 187])],
  pickup: [
    measured(
      svg("pickup", "pickup.svg", [-0.5, 0.15000003576278687, 64.26258850097656, 53.349998474121094], [82, 33]),
      -0.5,
      0.15,
      63.76,
      53.5,
    ),
  ],
  title: [bitmap("title", "title.png", [958, 720], [478, 360], true)],
  play: [
    svg("play", "play.svg", [-0.48199999891221523, -0.7198286801576614, 121, 54.29383087158203], [59, 30]),
    svg("play-hover", "play-hover.svg", [-0.48199999891221523, -0.7198286801576614, 121, 54.29383087158203], [59, 30]),
  ],
  hl3: [bitmap("hl3", "hl3.png", [100, 86], [50, 42], true)],
};

/** Sound lengths: sample count / sample rate from the Scratch project. */
export const sounds = {
  music: 10552077 / 48000,
  glados: 8506221 / 48000,
  death: 282541 / 48000,
  laser: 3287 / 48000,
  meow: 40681 / 48000,
};

const LEFT = ["a", "left arrow"];
const RIGHT = ["d", "right arrow"];
const DOWN = ["s", "down arrow"];
const SIDEWAYS = [...LEFT, ...RIGHT];
const SPAWN_X = -1;
const SPAWN_Y = 134;

function on(broadcast: string, run: ScriptDef["run"]): ScriptDef {
  return { hat: { broadcast }, run };
}
function onKey(key: string, run: ScriptDef["run"]): ScriptDef {
  return { hat: { key }, run };
}
function onFlag(run: ScriptDef["run"]): ScriptDef {
  return { hat: { flag: true }, run };
}
function onClick(run: ScriptDef["run"]): ScriptDef {
  return { hat: { click: true }, run };
}

// Broadcasts: "start" was "iniciar", "lost" was "perdio", "hit" was "vida",
// "title" was "message1". Variables: "speed" was "velocidad".

const jumpKey = (key: string) =>
  onKey(key, function* (w) {
    yield* w.broadcastAndWait("jump");
  });
const controlsKey = (key: string) =>
  onKey(key, function* (w) {
    w.broadcast("controls");
  });

/** Objeto1: the player. */
const player: ScriptDef[] = [
  jumpKey("w"),
  jumpKey("up arrow"),
  on("start", function* (w, self) {
    self.setXY(w.randomInt(-205, 205), -100);
    self.visible = true;
    self.ifOnEdgeBounce();
    self.setCostume("normal");
    yield* w.wait(1);
    for (;;) {
      if (self.isTouching(w.sprite("virus"))) {
        yield* w.wait(0.2);
        w.vars.health! -= 1;
      }
      yield;
    }
  }),
  jumpKey("space"),
  controlsKey("right arrow"),
  controlsKey("a"),
  controlsKey("d"),
  controlsKey("down arrow"),
  controlsKey("s"),
  on("controls", function* (w, self) {
    for (;;) {
      if (w.keyPressed(...RIGHT)) {
        self.setDirection(90);
        self.move(20);
      }
      yield;
    }
  }),
  on("controls", function* (w, self) {
    for (;;) {
      while (!w.keyPressed(...SIDEWAYS)) {
        self.setCostume(w.keyPressed(...DOWN) ? "crouch" : "normal");
        yield;
      }
      yield;
    }
  }),
  on("controls", function* (w, self) {
    for (;;) {
      if (w.keyPressed(...DOWN) && w.keyPressed(...SIDEWAYS)) self.setCostume("crouch");
      yield;
    }
  }),
  controlsKey("left arrow"),
  on("controls", function* (w, self) {
    for (;;) {
      if (w.keyPressed(...LEFT)) {
        self.setDirection(-90);
        self.move(20);
      }
      yield;
    }
  }),
  on("controls", function* (w, self) {
    for (;;) {
      while (!w.keyPressed(...DOWN)) {
        if (w.keyPressed(...SIDEWAYS)) self.setCostume("walk1");
        yield;
      }
      yield;
    }
  }),
  on("start", function* (w) {
    for (;;) {
      if (w.vars.health! < 1) {
        w.broadcast("lost");
        w.vars.health = 0;
        return;
      }
      yield;
    }
  }),
  on("lost", function* (w, self) {
    self.setDirection(-90);
    self.setXY(208, -115);
    w.goToFront(self);
    w.stopOtherScripts(self);
  }),
  on("hit", function* (_w, self) {
    self.setCostume("hit");
  }),
  on("jump", function* (w, self) {
    if (w.vars.time! > -1) {
      self.setCostume("jump");
      yield* w.glide(self, 0.15, self.x, -25);
      yield* w.glide(self, 0.15, self.x, -100);
      self.setCostume("normal");
    }
  }),
];

const respawn = (w: World, self: Sprite) => {
  self.setXY(SPAWN_X, SPAWN_Y);
  const target = w.sprite("player");
  self.pointTowards(target.x, target.y);
};

/** Objeto2: the virus. */
const virus: ScriptDef[] = [
  on("start", function* (w) {
    w.vars.speed = 5.5;
  }),
  on("start", function* (w, self) {
    for (;;) {
      if (self.isTouching(w.sprite("player"))) {
        yield* w.broadcastAndWait("hit");
        respawn(w, self);
      }
      yield;
    }
  }),
  on("lost", function* (w, self) {
    w.goToFront(self);
  }),
  on("start", function* (w) {
    for (;;) {
      yield* w.wait(w.randomInt(5, 10));
      w.vars.speed! += 0.9;
      yield;
    }
  }),
  on("start", function* (w, self) {
    w.monitors.health = true;
    w.monitors.time = true;
    self.setXY(SPAWN_X, SPAWN_Y);
    yield* w.wait(0.2);
    const target = w.sprite("player");
    self.pointTowards(target.x, target.y);
    for (;;) {
      self.move(w.vars.speed!);
      yield;
    }
  }),
  on("start", function* (w, self) {
    for (;;) {
      if (self.isTouchingEdge()) respawn(w, self);
      yield;
    }
  }),
];

/** Objeto3: the infected monitor, which also counts the time. */
const monitor: ScriptDef[] = [
  on("start", function* (w, self) {
    w.stopOtherScripts(self);
    w.vars.time = 0;
    for (;;) {
      yield* w.wait(1);
      w.vars.time! += 1;
      yield;
    }
  }),
  on("lost", function* (w, self) {
    self.setDirection(90);
    self.setXY(0, 110);
    w.goToFront(self);
    w.stopOtherScripts(self);
  }),
];

/** Objeto4: the game over screen. */
const gameOver: ScriptDef[] = [
  on("lost", function* (w, self) {
    w.stopAllSounds();
    self.visible = true;
    w.playSound(self, "death");
    for (;;) {
      yield* w.wait(6);
      yield* w.playUntilDone(self, "glados");
      yield;
    }
  }),
  on("start", function* (w, self) {
    w.monitors.time = true;
    w.monitors.health = true;
    self.visible = false;
    w.stopOtherScripts(self);
  }),
  onFlag(function* (_w, self) {
    self.visible = false;
  }),
  on("lost", function* (w) {
    for (;;) {
      if (w.keyPressed("r")) {
        w.vars.health = 1;
        w.broadcast("start");
      }
      yield;
    }
  }),
];

/** Objeto5: the penguin that gives back health. */
const pickup: ScriptDef[] = [
  on("start", function* (w, self) {
    w.vars.health = 1;
    self.setXY(self.x, -25);
    self.visible = false;
    for (;;) {
      yield* w.wait(10);
      self.setXY(w.randomInt(-120, 295), self.y);
      self.ifOnEdgeBounce();
      self.visible = true;
      yield* w.wait(2);
      self.visible = false;
      yield;
      yield;
    }
  }),
  on("start", function* (w, self) {
    for (;;) {
      if (self.isTouching(w.sprite("player"))) {
        w.vars.health! += 1;
        self.visible = false;
      }
      yield;
    }
  }),
  on("lost", function* (w, self) {
    self.visible = true;
    self.setDirection(90);
    self.setXY(-124, -115);
    w.goToFront(self);
  }),
  onFlag(function* (_w, self) {
    self.visible = false;
  }),
];

/** Objeto6: the title screen and the music. */
const title: ScriptDef[] = [
  onFlag(function* (w, self) {
    w.goToFront(self);
    w.stopAllSounds();
    w.monitors.health = false;
    w.monitors.time = false;
    w.broadcast("title");
    self.visible = true;
  }),
  on("start", function* (w, self) {
    w.stopOtherScripts(self);
    w.stopAllSounds();
    self.visible = false;
    for (;;) {
      yield* w.playUntilDone(self, "music");
      yield;
    }
  }),
  on("shh", function* (w, self) {
    w.stopOtherScripts(self);
  }),
  on("lost", function* (w, self) {
    w.stopOtherScripts(self);
  }),
];

const pressPlay = function* (w: World) {
  yield* w.broadcastAndWait("play");
};

/** Button2: the Play button. */
const play: ScriptDef[] = [
  on("title", function* (w, self) {
    w.vars.time = -1;
    w.goToFront(self);
    self.visible = true;
    self.setXY(-5, 20);
    for (;;) {
      self.setCostume(w.touchingMouse(self) ? "play-hover" : "play");
      yield;
    }
  }),
  on("start", function* (_w, self) {
    self.visible = false;
  }),
  onClick(pressPlay),
  onKey("space", pressPlay),
  on("play", function* (w, self) {
    if (!(w.vars.time! > -1)) {
      self.setCostume("play-hover");
      yield* w.broadcastAndWait("shh");
      yield* w.playUntilDone(self, "laser");
      w.vars.health = 1;
      w.broadcast("start");
    }
  }),
  onKey("r", pressPlay),
];

/** hl3: the Half-Life 3 logo that shows up on the game over screen. */
const hl3: ScriptDef[] = [
  on("start", function* (w, self) {
    self.visible = false;
    w.stopOtherScripts(self);
  }),
  on("lost", function* (w, self) {
    w.goToFront(self);
    yield* w.wait(10);
    for (;;) {
      for (let i = 0; i < 2; i++) {
        self.setXY(w.randomInt(-200, 200), self.y);
        self.setXY(self.x, w.randomInt(-150, 150));
        self.setDirection(self.direction + 30);
        self.ifOnEdgeBounce();
        self.visible = true;
        yield* w.wait(2);
        self.visible = false;
        yield* w.wait(2);
        yield;
      }
      yield* w.wait(6);
      yield;
    }
  }),
  onClick(function* (w, self) {
    w.playSound(self, "meow");
    self.visible = false;
  }),
];

/** A fresh copy of the 2013 project, as saved. */
export function createClassic(): Project {
  const sprite = (
    name: string,
    list: Costume[],
    state: Partial<Sprite> & { x: number; y: number; size: number },
  ) =>
    new Sprite(name, list, {
      direction: 90,
      costume: 0,
      visible: true,
      rotationStyle: "all around",
      ...state,
    });
  return {
    stage: costumes.stage,
    // Back to front, as the project was saved.
    sprites: [
      {
        sprite: sprite("gameOver", costumes.gameOver, { x: 117, y: -87, size: 150, visible: false }),
        scripts: gameOver,
      },
      {
        sprite: sprite("hl3", costumes.hl3, { x: -116, y: 43, size: 100, direction: -75, visible: false }),
        scripts: hl3,
      },
      {
        sprite: sprite("pickup", costumes.pickup, {
          x: -124,
          y: -25,
          size: 134.39163793441224,
          visible: false,
          rotationStyle: "left-right",
        }),
        scripts: pickup,
      },
      {
        sprite: sprite("player", costumes.player, {
          x: 23,
          y: -100,
          size: 180.6111234669416,
          direction: -90,
          costume: 4,
          rotationStyle: "left-right",
        }),
        scripts: player,
      },
      {
        sprite: sprite("monitor", costumes.monitor, { x: 0, y: 110, size: 150, rotationStyle: "don't rotate" }),
        scripts: monitor,
      },
      {
        sprite: sprite("virus", costumes.virus, {
          x: 1.2446350409685327,
          y: 112.11480835055686,
          size: 222.1289005570158,
          direction: 174.14398641457103,
          rotationStyle: "left-right",
        }),
        scripts: virus,
      },
      { sprite: sprite("title", costumes.title, { x: -1, y: 1, size: 97.08737864077678 }), scripts: title },
      { sprite: sprite("play", costumes.play, { x: -5, y: 20, size: 180.00000000000006 }), scripts: play },
    ],
    variables: { speed: 5.5, health: 1, time: -1 },
    monitors: [
      { variable: "health", label: "Health", x: 11, y: 9, visible: false },
      { variable: "time", label: "Time", x: 11, y: 34, visible: false },
    ],
    sounds,
  };
}
