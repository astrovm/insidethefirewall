// The remastered game: the 2013 rules, written as a normal game loop instead
// of Scratch scripts and updated 60 times a second, with smoother movement,
// real jumps, a fairer virus and power-ups.

import { Sprite, type Bounds, type Costume, type RotationStyle } from "../engine/sprite.ts";
import { costumes, sounds } from "../game/classic.ts";

/** Updates a second. 120, so the game moves as smoothly as fast screens can show. */
export const HZ = 120;
export const DT = 1 / HZ;

/** The 2013 game moved things once per Scratch frame, 30 times a second. */
const SCRATCH_FPS = 30;

/** Top running speed: 20 pixels per Scratch frame, as in 2013. */
export const PLAYER_SPEED = 20 * SCRATCH_FPS;
/** Reaches top speed in 0.1 s and stops in under 0.07 s. */
export const RUN_ACCELERATION = PLAYER_SPEED * 10;
export const RUN_BRAKING = PLAYER_SPEED * 15;
export const GROUND_Y = -100;
/** A held jump goes 80 px up in 0.2 s. The 2013 one went 75 px in 0.15 s. */
export const JUMP_HEIGHT = 80;
const JUMP_RISE = 0.2;
export const JUMP_SPEED = (2 * JUMP_HEIGHT) / JUMP_RISE;
export const GRAVITY = JUMP_SPEED / JUMP_RISE;
/** Falling is faster than rising, and faster still holding down. */
const FALL_GRAVITY = GRAVITY * 1.5;
const DIVE_GRAVITY = GRAVITY * 3;
/** Letting go of jump early cuts the rise, for short hops. */
const JUMP_CUT = 0.45;
/** A jump pressed just before landing still happens. */
export const JUMP_BUFFER = 0.12;
const WALK_FRAME = 0.15;
const HIT_FACE = 0.3;
/** After a hit the player blinks and can't be hit again for a moment. */
export const INVINCIBLE = 1.25;
/** Everything stops for a moment on a hit, so it lands. */
export const HIT_STOP = 4 / 60;
/** The last hit holds a little longer before the game over screen. */
export const DEATH_PAUSE = 0.7;
/** At most this many hearts, so lives can't pile up. */
export const MAX_HEALTH = 5;
export const VIRUS_SPAWN = { x: -1, y: 134 } as const;
export const VIRUS_START_SPEED = 5.5 * SCRATCH_FPS;
/** Like 2013, the virus keeps speeding up forever, 1.7 px/s faster every second. */
export const VIRUS_SPEEDUP = 1.7;
/** The aim warning is at its shortest from this speed on. */
export const VIRUS_FAST = 14 * SCRATCH_FPS;
/** The virus moves in steps this long or shorter, so it can't skip past the player however fast it gets. */
const VIRUS_STEP = 8;
/** The virus flashes in the monitor before it flies out, less as it speeds up. */
export const WARNING_LONGEST = 0.6;
export const WARNING_SHORTEST = 0.3;
/** Its aim follows the player until this long before it flies. */
export const AIM_LOCK = 0.15;
/** A virus that flies by this close, in stage pixels, without a hit is a near miss. */
export const NEAR_MISS = 8;
/**
 * Hearts and power-ups share one cycle: something shows up after 10 s, then
 * every 10 to 15 s. It's the penguin, an extra life, half the time, and a
 * power-up otherwise. With full hearts it's always a power-up. In 2013 the
 * penguin came every 10 s.
 */
export const DROP_FIRST = 10;
const DROP_EVERY = [10, 15] as const;
export const PENGUIN_CHANCE = 0.5;
/** The penguin stays 2 s. */
export const PICKUP_SHOWN = 2;
/** The penguin blinks before it goes. */
export const PICKUP_BLINK = 0.6;
const PICKUP_Y = -25;
/** Penguin spots where all of it is on stage. The 2013 game could put half of it off the right edge. */
const PICKUP_LEFTMOST = -120;
const PICKUP_RIGHTMOST = 260;
/** A penguin grabbed with full hearts gives a short shield instead. */
export const PENGUIN_SHIELD = 3;
export type PowerUpKind = "jetpack" | "shield" | "freeze" | "pill" | "shoes" | "gravity" | "portal" | "ball";
/** Things the player can grab. */
export type Grab = "penguin" | PowerUpKind;
export const POWER_UPS: PowerUpKind[] = ["jetpack", "shield", "freeze", "pill", "shoes", "gravity", "portal", "ball"];
/**
 * Seconds each power-up lasts. A shield also ends when it blocks a hit, and the bonus round when the ball is lost or every brick is broken.
 */
export const POWER_UP_TIME: Record<PowerUpKind, number> = {
  jetpack: 6,
  shield: 10,
  freeze: 4,
  pill: 8,
  shoes: 8,
  gravity: 10,
  portal: 10,
  ball: 20,
};
/** Speed shoes, like Sonic's: this much faster. */
export const SHOES_SPEED = 1.6;
/**
 * The gravity gun catches the flying virus this close to the player, holds it
 * for a moment, then fires it back at the monitor, where it breaks.
 */
const GRAVITY_RANGE = 60;
export const GRAVITY_HOLD = 0.35;
const GRAVITY_FIRE_SPEED = 900;
/** The portal gun puts a portal on each wall, this far from the middle, over the floor. */
export const PORTAL_X = 234;
export const PORTAL_BOTTOM = GROUND_Y - 45;
export const PORTAL_TOP = GROUND_Y + 45;
/**
 * The bonus round, like Breakout: the player is the paddle, the virus the
 * ball, and the floor's bricks float up to the top of the room, where the
 * monitor was, to be broken. Every few bricks give a heart.
 */
export const BRICKS = { columns: 8, rows: 4, left: -224, top: 170, width: 56, height: 16 } as const;
export const BRICKS_PER_HEART = 8;
export const PADDLE = { y: GROUND_Y - 22, width: 72, height: 10 } as const;
const PADDLE_SPEED = PLAYER_SPEED * 0.8;
export const BALL_RADIUS = 9;
const BALL_SPEED = 240;
const BALL_SPEEDUP = 4;
/** The bricks float up this long, then the ball goes on its own if jump wasn't pressed. */
export const BRICKS_RISE = 0.8;
const BALL_WAIT = 1.4;
/** Clearing every brick also gives a shield for this long. */
const BREAKOUT_SHIELD = 3;
/** With the red pill the room is code, and time slows down this much while the flying virus is this close. */
export const BULLET_TIME = 0.3;
const BULLET_TIME_RANGE = 90;
/** Power-ups stay 5 s. */
export const POWER_UP_SHOWN = 5;
/** Power-ups float within a jump of the floor, and never right on the player. */
const POWER_UP_LOWEST = GROUND_Y;
const POWER_UP_HIGHEST = GROUND_Y + 60;
const POWER_UP_AWAY = 80;
/** With a jetpack there's no gravity: up and down fly at this speed, reached in 0.1 s, and letting go hovers. */
export const FLY_SPEED = 300;
const FLY_ACCELERATION = FLY_SPEED * 10;
/** With a jetpack the sides of the stage wrap around: off one side, back on the other. */
const STAGE_HALF_WIDTH = 240;
/** The jetpack can't fly the player off the top of the stage, except to escape. */
export const CEILING_Y = 180 - 58;
/**
 * The room on the monitor's screen, in stage pixels: its top left corner and
 * how big it is. The screen is wider than the room, so it's centered.
 */
export const SCREEN_ROOM = { left: -40, top: 158, scale: 1 / 6 } as const;
/** The monitor's screen, in stage pixels. */
export const SCREEN = { left: -51, top: 158, width: 102, height: 60 } as const;
/**
 * Holding up against the ceiling with a jetpack bursts the player out of the
 * monitor's screen into the real room: they grow from the screen to full size
 * in this long, ending this far under the ceiling. Once per jetpack.
 */
export const ESCAPE_BURST = 0.5;
const ESCAPE_DROP = 40;
/** The virus is stuck in the room on the screen this long, then comes out of the monitor. */
export const ESCAPE_STUCK = 1.5;
/**
 * Flying into the monitor's screen with a jetpack drops the player into a 3D
 * world inside it, like Homer³: diving in and falling down the tunnel takes
 * this long, then they're in there for a while, then a black hole sucks them
 * back into the room.
 */
export const THIRD_IN = 1.6;
export const THIRD_TIME = 15;
export const THIRD_OUT = 0.6;
/** Walking speed in 3D, the same every way, diagonals too. */
const THIRD_SPEED = 300;
/** How fast the player turns to face where they walk, in radians a second. */
const THIRD_TURN = 14;
/** The virus hits closer than this, in 3D. */
const THIRD_HIT = 34;
/** Where the player's chest is in 3D, for the virus to aim at. */
export const THIRD_CHEST = 40;
/**
 * Homer's pink sedan, from The Simpsons: Hit & Run, is parked in the 3D world.
 * Walking into it gets in. Up speeds up, down brakes and backs up, left and
 * right steer. It runs the virus over, and bumps off the shapes.
 */
export const PARKED = { x: 150, z: 280 } as const;
const GET_IN = 80;
const CAR_TOP_SPEED = 480;
const CAR_REVERSE = 180;
const CAR_ACCELERATION = 420;
const CAR_BRAKING = 800;
/** Slowing down on its own, with nothing pressed. */
const CAR_COAST = 220;
/** Radians a second at full steer, from this speed up. */
const CAR_STEER = 2.6;
const CAR_STEER_SPEED = 150;
/** How far the car reaches from its middle, for running into things. */
const CAR_RADIUS = 58;
/** The shapes standing on the floor, which the car bumps off: where, and how wide. */
export const THIRD_PROPS = [
  { x: -340, z: 660, r: 64 },
  { x: 300, z: 780, r: 46 },
  { x: -110, z: 920, r: 52 },
  { x: 270, z: 300, r: 26 },
  { x: -370, z: 520, r: 6 },
] as const;

/** Things in the 3D world. x is across, y up and z away from the camera. */
export interface ThirdDimension {
  /** Seconds since diving in. */
  time: number;
  /** `facing` is the way the player looks: 0 away from the camera, π towards it. `step` is how far they've walked, for the stride. */
  player: { x: number; z: number; vx: number; vz: number; facing: number; step: number };
  virus: { x: number; y: number; z: number; dx: number; dy: number; dz: number; warning: number };
  /** `heading` is the way it points, like the player's `facing`. */
  car: { x: number; z: number; heading: number; speed: number; driving: boolean };
}

/** The bonus round. */
export interface Breakout {
  /** Seconds since it started. */
  time: number;
  /** Where the paddle's middle is across the stage. */
  paddle: number;
  ball: { x: number; y: number; vx: number; vy: number; stuck: boolean };
  /** Row by row from the top, whether each brick is still there. */
  bricks: boolean[];
  broken: number;
}
/** A power-up ticks at these seconds left, so the player hears it ending. */
const TICKS = [3, 2, 1];
/** Jump can start a new game this long after game over, so a jump held while dying doesn't skip the screen. */
export const RETRY_LOCK = 0.5;
/** The game over screen replays the last seconds of the run, slowed down, then holds the last frame. */
export const REPLAY_SECONDS = 2;
export const REPLAY_SPEED = 0.5;
const REPLAY_HOLD = 1;
const GLADOS_AFTER = 6;
const HL3_AFTER = 10;

export type Phase = "title" | "playing" | "over";

/** What the player is holding this update, and what they just pressed. */
export interface Input {
  left: boolean;
  right: boolean;
  down: boolean;
  jump: boolean;
  jumpPressed: boolean;
}

/** Shortcuts for trying things out while making the game. */
export type Cheat = PowerUpKind | "heart" | "god" | "dive" | "drive" | "escape" | "powerUpNow" | "penguinNow" | "skip";
/** The skip cheat jumps this many seconds ahead, so the virus gets faster. */
export const CHEAT_SKIP = 30;

export const noInput: Input = { left: false, right: false, down: false, jump: false, jumpPressed: false };

export type GameEvent =
  | { type: "sound"; sound: "laser" | "death" | "glados" | "meow" }
  | { type: "music"; playing: boolean }
  | { type: "hit"; x: number; y: number; last: boolean }
  | { type: "pickup"; x: number; y: number; full: boolean }
  | { type: "jump"; x: number; y: number }
  | { type: "land"; x: number; y: number }
  | { type: "launch"; x: number; y: number }
  | { type: "powerUp"; kind: PowerUpKind; x: number; y: number }
  | { type: "shield"; x: number; y: number }
  | { type: "appear"; thing: Grab }
  | { type: "ending"; kind: PowerUpKind; left: number }
  | { type: "nearMiss" }
  | { type: "escape"; x: number; y: number }
  | { type: "dive" }
  | { type: "shatter"; x: number; y: number }
  | { type: "catch" }
  | { type: "fire" }
  | { type: "portal"; x: number; y: number }
  | { type: "breakout" }
  | { type: "brick"; x: number; y: number; heart: boolean }
  | { type: "paddle" }
  | { type: "breakoutEnd"; cleared: boolean }
  | { type: "drive" }
  | { type: "smash" }
  | { type: "bump" }
  | { type: "lost"; time: number };

/** The player's size, in percent, as in 2013. */
const PLAYER_SIZE = 180.6111234669416;

const pixelArt = (name: string, width: number, height: number): Costume => ({
  name,
  file: `${name}.svg`,
  x: 0,
  y: 0,
  width,
  height,
  centerX: width / 2,
  centerY: height / 2,
  smooth: false,
});

/** Costumes for the power-ups, and the jetpack's flame. Drawn 3 stage pixels per pixel. */
export const powerUpCostumes = POWER_UPS.map((kind) => pixelArt(kind, 12, 12));
export const flameCostumes = [pixelArt("flame1", 12, 4), pixelArt("flame2", 12, 4)];

/** A sprite as it looked in one update, for the replay. */
export interface SpriteShot {
  costume: Costume;
  x: number;
  y: number;
  rotation: number;
  flipX: number;
  size: number;
}

/** One update of the run, for the replay on the game over screen. */
export interface ReplayFrame {
  sprites: SpriteShot[];
  /** Which of the sprites is the player. */
  player: number;
  shield: boolean;
  jetpack: boolean;
  flying: boolean;
}

function sprite(
  name: string,
  list: Costume[],
  x: number,
  y: number,
  size: number,
  rotationStyle: RotationStyle,
  direction = 90,
): Sprite {
  return new Sprite(name, list, { x, y, size, direction, costume: 0, visible: false, rotationStyle });
}

/** Seconds counter that fires once every `every` seconds. */
class Timer {
  left: number;
  constructor(public every: number) {
    this.left = every;
  }
  /** Counts down and says whether it went off. */
  tick(): boolean {
    this.left -= DT;
    if (this.left > 1e-9) return false;
    this.left += this.every;
    return true;
  }
}

export class Game {
  phase: Phase = "title";
  /** Seconds survived. The HUD shows whole seconds, like the 2013 Time monitor. */
  time = 0;
  health = 1;
  /** Virus speed in stage pixels per second. */
  speed = VIRUS_START_SPEED;
  events: GameEvent[] = [];

  readonly player = sprite("player", costumes.player, 0, GROUND_Y, PLAYER_SIZE, "left-right");
  readonly virus = sprite("virus", costumes.virus, VIRUS_SPAWN.x, VIRUS_SPAWN.y, 222.1289005570158, "left-right");
  readonly monitor = sprite("monitor", costumes.monitor, 0, 110, 150, "don't rotate");
  readonly pickup = sprite("pickup", costumes.pickup, -124, PICKUP_Y, 134.39163793441224, "left-right");
  readonly gameOver = sprite("gameOver", costumes.gameOver, 117, -87, 150, "all around");
  readonly hl3 = sprite("hl3", costumes.hl3, -116, 43, 100, "all around", -75);
  readonly powerUp = sprite("powerUp", powerUpCostumes, 0, GROUND_Y, 300, "don't rotate");
  /** Back to front. */
  layers: Sprite[] = [];
  /** Where sprites were before the last update, for drawing between updates. */
  previous = new Map<Sprite, { x: number; y: number }>();

  /** Player speed in stage pixels per second. */
  vx = 0;
  vy = 0;
  onGround = true;
  /** Seconds of invincibility left after a hit. */
  invincible = 0;
  /** Seconds until the virus flies out of the monitor, or 0 while it flies. */
  warning = 0;
  /** Where the virus will fly to. */
  target = { x: 0, y: 0 };
  /** Seconds the game stays frozen after a hit. */
  frozen = 0;
  /** Seconds left of each power-up the player has. */
  powers: Record<PowerUpKind, number> = noPowers();
  /** In the air with a jetpack. */
  flying = false;
  /** Everything grabbed this run, in order. */
  grabbed: Grab[] = [];
  /** The last seconds of the run, oldest first. */
  replay: ReplayFrame[] = [];
  /** Seconds on the game over screen. */
  overTime = 0;
  /** Seconds since the player last burst out of the monitor. */
  escapeTime = Infinity;
  /** The room the player escaped from, as it was, while the virus is stuck in it. */
  inside: SpriteShot[] = [];
  /** The jetpack hasn't been used to escape yet. */
  private canEscape = false;
  private escapeFrom = { x: 0, y: 0 };
  /** In the 3D world inside the monitor. */
  third: ThirdDimension | null = null;
  /** Seconds since coming back from the 3D world. */
  sinceThird = Infinity;
  /** How fast time goes: slower in bullet time. */
  timeScale = 1;
  /** Seconds the gravity gun has held the virus, or null when it isn't holding it. */
  caught: number | null = null;
  /** The gravity gun fired the virus, and it's flying back at the monitor. */
  thrown = false;
  /** The virus went through a portal on this flight. */
  private ported = false;
  /** The bonus round, while it's on. */
  breakout: Breakout | null = null;
  /** Nothing hurts the player. A cheat. */
  god = false;
  /** Cheats were used this run, so its time can't be a best. */
  cheated = false;
  /** Where the player was across the room, which is where they come out. */
  private escapeX = 0;
  /** Seconds until the next penguin or power-up, and which one, when a cheat asks for it. */
  private dropTimer = DROP_FIRST;
  private nextDrop: "penguin" | "powerUp" | null = null;
  /** Power-ups still to come before any repeats, like a shuffled deck. */
  private bag: PowerUpKind[] = [];
  private powerUpShown = 0;
  /** The flying virus came close to the player without a hit. */
  private closeCall = false;
  private dying = 0;
  private jumpCut = false;
  private jumpBuffer = 0;
  private walkTime = 0;
  private hitTime = Infinity;
  private pickupShown = 0;
  private gladosTimer = new Timer(GLADOS_AFTER);
  private hl3Clicked = false;

  constructor(readonly random: () => number = Math.random) {
    this.toTitle();
  }

  /** Scratch's "pick random" with whole numbers. */
  randomInt(from: number, to: number): number {
    return from + Math.floor(this.random() * (to + 1 - from));
  }

  /** Which power-up is on stage. */
  get powerUpKind(): PowerUpKind {
    return this.powerUp.currentCostume.name as PowerUpKind;
  }

  /** Seconds the power-up has left on stage, while it's shown. */
  get powerUpLeft(): number {
    return this.powerUp.visible ? POWER_UP_SHOWN - this.powerUpShown : 0;
  }

  /** Whether jump can start a new game yet. */
  get canRetry(): boolean {
    return this.phase === "over" && this.overTime >= RETRY_LOCK - 1e-9;
  }

  /** Seconds the penguin has left on stage, while it's shown. */
  get pickupLeft(): number {
    return this.pickup.visible ? PICKUP_SHOWN - this.pickupShown : 0;
  }

  toTitle(): void {
    this.phase = "title";
    this.events.push({ type: "music", playing: false });
    for (const s of this.allSprites()) s.visible = false;
    this.layers = [];
  }

  start(): void {
    this.phase = "playing";
    this.cheated = this.god;
    this.time = 0;
    this.health = 1;
    this.speed = VIRUS_START_SPEED;
    this.dropTimer = DROP_FIRST;
    this.bag = [];
    this.nextDrop = null;
    this.pickupShown = 0;
    this.vx = 0;
    this.vy = 0;
    this.onGround = true;
    this.jumpBuffer = 0;
    this.walkTime = 0;
    this.hitTime = Infinity;
    this.invincible = 0;
    this.frozen = 0;
    this.dying = 0;
    this.powers = noPowers();
    this.flying = false;
    this.third = null;
    this.breakout = null;
    this.caught = null;
    this.thrown = false;
    this.ported = false;
    this.sinceThird = Infinity;
    this.timeScale = 1;
    this.powerUpShown = 0;
    this.closeCall = false;
    this.grabbed = [];
    this.replay = [];
    this.endEscape();
    for (const s of this.allSprites()) s.visible = false;

    const { player, virus, monitor, pickup } = this;
    player.visible = true;
    player.setDirection(90);
    player.setCostume("normal");
    player.setXY(this.randomInt(-205, 205), GROUND_Y);
    player.ifOnEdgeBounce();
    monitor.visible = true;
    monitor.setXY(0, 110);
    virus.visible = true;
    this.respawnVirus();
    pickup.setXY(pickup.x, PICKUP_Y);
    this.layers = [pickup, this.powerUp, player, monitor, virus];
    this.events.push({ type: "music", playing: true });
  }

  update(input: Input): void {
    this.previous.clear();
    for (const s of this.layers) if (s.visible) this.previous.set(s, { x: s.x, y: s.y });
    if (this.phase === "playing") this.updatePlaying(input);
    else if (this.phase === "over") this.updateOver();
  }

  private updatePlaying(input: Input): void {
    if (input.jumpPressed) this.jumpBuffer = JUMP_BUFFER;
    if (this.dying > 0) {
      this.dying -= DT;
      if (this.dying <= 1e-9) this.lose();
      return;
    }
    if (this.frozen > 1e-9) {
      this.frozen -= DT;
      return;
    }
    this.time += DT;
    this.invincible = Math.max(0, this.invincible - DT);
    this.sinceThird += DT;
    if (this.third) {
      this.updateThird(input);
    } else if (this.breakout) {
      this.updateBreakout(input);
    } else {
      if (!this.updateEscape()) this.movePlayer(input);
      this.moveVirus();
      this.updatePickup();
    }
    this.updatePowerUps();
    if (!this.third && !this.breakout) this.updateDrops();
    this.updateDifficulty();
    this.updateBulletTime();
    if (!this.third) this.record();
    if (this.health < 1) {
      this.health = 0;
      this.dying = DEATH_PAUSE;
    }
  }

  /** Keeps the last seconds of the run for the replay. */
  private record(): void {
    const shown = this.layers.filter((s) => s.visible);
    this.replay.push({
      sprites: shown.map(shot),
      player: shown.indexOf(this.player),
      shield: this.powers.shield > 0,
      jetpack: this.powers.jetpack > 0,
      flying: this.flying,
    });
    if (this.replay.length > REPLAY_SECONDS * HZ) this.replay.shift();
  }

  private movePlayer(input: Input): void {
    const player = this.player;
    const sideways = input.left !== input.right;
    const top = PLAYER_SPEED * (this.powers.shoes > 0 ? SHOES_SPEED : 1);
    const wanted = sideways ? (input.left ? -top : top) : 0;
    // Speed up toward the held direction. Stopping and turning brake harder.
    const braking = wanted === 0 || Math.sign(wanted) === -Math.sign(this.vx);
    const change = (braking ? RUN_BRAKING : RUN_ACCELERATION) * DT;
    this.vx = Math.abs(wanted - this.vx) <= change ? wanted : this.vx + Math.sign(wanted - this.vx) * change;
    if (sideways) player.setDirection(input.left ? -90 : 90);

    const jetpack = this.powers.jetpack > 0;
    if (jetpack) {
      // Free flight: up takes off and climbs, down sinks and lands, nothing hovers.
      const wantedVy = input.jump === input.down ? 0 : input.jump ? FLY_SPEED : -FLY_SPEED;
      if (!this.onGround || wantedVy > 0) {
        this.onGround = false;
        const lift = FLY_ACCELERATION * DT;
        this.vy = Math.abs(wantedVy - this.vy) <= lift ? wantedVy : this.vy + Math.sign(wantedVy - this.vy) * lift;
      }
      this.jumpBuffer = 0;
      this.jumpCut = true;
    }
    this.flying = jetpack && !this.onGround;
    if (this.jumpBuffer > 0 && this.onGround) {
      this.vy = JUMP_SPEED;
      this.onGround = false;
      this.jumpCut = false;
      this.jumpBuffer = 0;
      this.events.push({ type: "jump", x: player.x, y: player.y });
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - DT);
    if (!this.onGround) {
      if (!input.jump && this.vy > 0 && !this.jumpCut) {
        this.vy *= JUMP_CUT;
        this.jumpCut = true;
      }
    }
    // Average the speed over the step, so the jump reaches its full height.
    const vy = this.vy;
    if (!this.onGround && !jetpack) this.vy -= (input.down ? DIVE_GRAVITY : this.vy > 0 ? GRAVITY : FALL_GRAVITY) * DT;

    const x = player.x + this.vx * DT;
    let y = player.y + ((vy + this.vy) / 2) * DT;
    let escaping = false;
    if (y > CEILING_Y) {
      y = CEILING_Y;
      this.vy = Math.min(this.vy, 0);
      escaping = jetpack && input.jump && this.canEscape;
    }
    if (!this.onGround && y <= GROUND_Y) {
      y = GROUND_Y;
      this.vy = 0;
      this.onGround = true;
      this.events.push({ type: "land", x, y });
    }
    if (jetpack) {
      player.x = wrapAround(x);
      player.y = y;
    } else if (!this.throughPortal(x, y)) {
      player.setXY(x, y);
      // The edge of the stage stops the player.
      if (player.x !== x) this.vx = 0;
    }

    this.walkTime = sideways ? this.walkTime + DT : 0;
    this.hitTime += DT;
    player.setCostume(this.playerCostume(input, sideways));
    if (escaping) this.escape();
    else if (jetpack && this.flying && this.canEscape && this.touchesScreen()) this.dive();
  }

  /**
   * Walking into a wall with portals comes out of the other one, still going
   * the same way, like in Portal. Says whether the player went through.
   */
  private throughPortal(x: number, y: number): boolean {
    if (this.powers.portal === 0 || y > PORTAL_TOP) return false;
    const player = this.player;
    const bounds = player.bounds();
    const half = (bounds.right - bounds.left) / 2;
    const side = x - half < -PORTAL_X && this.vx < 0 ? -1 : x + half > PORTAL_X && this.vx > 0 ? 1 : 0;
    if (side === 0) return false;
    player.setXY(-side * (PORTAL_X - half - 2), y);
    this.events.push({ type: "portal", x: player.x, y: player.y });
    return true;
  }

  /** Whether the player is touching the monitor's screen. */
  private touchesScreen(): boolean {
    const b = this.player.bounds();
    return b.right > SCREEN.left && b.left < SCREEN.left + SCREEN.width && b.top > SCREEN.top - SCREEN.height && b.bottom < SCREEN.top;
  }

  /** Into the monitor's screen, and the 3D world inside it. */
  private dive(): void {
    this.canEscape = false;
    this.powers.jetpack = 0;
    this.flying = false;
    this.vx = this.vy = 0;
    this.closeCall = false;
    this.third = {
      time: 0,
      player: { x: 0, z: 120, vx: 0, vz: 0, facing: Math.PI, step: 0 },
      virus: { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, warning: 0 },
      car: { ...PARKED, heading: 0, speed: 0, driving: false },
    };
    this.respawnThirdVirus();
    this.events.push({ type: "dive" });
  }

  private respawnThirdVirus(): void {
    const third = this.third!;
    const p = third.player;
    // Ahead of where the camera looks, far enough to see it coming.
    const heading = third.car.driving ? third.car.heading : 0;
    const [ahead, aside] = [480, this.randomInt(-150, 150)];
    const x = p.x + Math.sin(heading) * ahead + Math.cos(heading) * aside;
    const z = p.z + Math.cos(heading) * ahead - Math.sin(heading) * aside;
    Object.assign(third.virus, { x, y: 120, z, warning: this.aimWarning() });
  }

  /** The 3D world: diving in, moving around on the floor and dodging the virus, then back to the room. */
  private updateThird(input: Input): void {
    const third = this.third!;
    third.time += DT;
    if (third.time < THIRD_IN) return;
    if (third.time >= THIRD_TIME + THIRD_OUT) {
      // Sucked back into the room, falling out of the monitor.
      this.third = null;
      this.sinceThird = 0;
      const { player } = this;
      player.setXY(0, 30);
      player.setCostume("jump");
      this.onGround = false;
      this.vx = this.vy = 0;
      this.jumpCut = true;
      this.invincible = Math.max(this.invincible, 1);
      this.respawnVirus();
      return;
    }
    if (third.time >= THIRD_TIME) return;
    const p = third.player;
    if (third.car.driving) {
      this.drive(input);
      this.moveThirdVirus();
      return;
    }
    // Arrows move along the floor as seen from the camera: up goes away, down comes back.
    const across = Number(input.right) - Number(input.left);
    const ahead = Number(input.jump) - Number(input.down);
    const length = Math.hypot(across, ahead) || 1;
    const approach = (value: number, wanted: number) => {
      const change = (wanted === 0 || Math.sign(wanted) === -Math.sign(value) ? RUN_BRAKING : RUN_ACCELERATION) * DT;
      return Math.abs(wanted - value) <= change ? wanted : value + Math.sign(wanted - value) * change;
    };
    p.vx = approach(p.vx, (across / length) * THIRD_SPEED);
    p.vz = approach(p.vz, (ahead / length) * THIRD_SPEED);
    const [x, z] = [p.x + p.vx * DT, p.z + p.vz * DT];
    p.step += Math.hypot(x - p.x, z - p.z);
    [p.x, p.z] = [x, z];
    const moving = across !== 0 || ahead !== 0;
    if (moving) {
      // Turn the short way round.
      const turn = Math.atan2(p.vx, p.vz) - p.facing;
      const wrapped = Math.atan2(Math.sin(turn), Math.cos(turn));
      p.facing += Math.sign(wrapped) * Math.min(Math.abs(wrapped), THIRD_TURN * DT);
    }
    if (across !== 0) this.player.setDirection(across < 0 ? -90 : 90);
    this.walkTime = moving ? this.walkTime + DT : 0;
    this.hitTime += DT;
    this.player.setCostume(this.playerCostume(noInput, moving));
    if (Math.hypot(p.x - third.car.x, p.z - third.car.z) < GET_IN) this.getInCar();
    this.moveThirdVirus();
  }

  private getInCar(): void {
    const { car, player } = this.third!;
    car.driving = true;
    [player.x, player.z, player.vx, player.vz] = [car.x, car.z, 0, 0];
    this.events.push({ type: "drive" });
  }

  /** Driving Homer's car: speeding up, braking, steering, and bumping off the shapes. */
  private drive(input: Input): void {
    const { car, player } = this.third!;
    const throttle = Number(input.jump) - Number(input.down);
    if (throttle > 0) car.speed = Math.min(CAR_TOP_SPEED, car.speed + (car.speed < 0 ? CAR_BRAKING : CAR_ACCELERATION) * DT);
    else if (throttle < 0) car.speed = Math.max(-CAR_REVERSE, car.speed - (car.speed > 0 ? CAR_BRAKING : CAR_ACCELERATION) * DT);
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR_COAST * DT);
    // It turns more the faster it goes, up to a point, and the other way backing up.
    const steer = Number(input.right) - Number(input.left);
    const grip = Math.min(1, Math.abs(car.speed) / CAR_STEER_SPEED) * Math.sign(car.speed);
    car.heading += steer * CAR_STEER * grip * DT;
    let x = car.x + Math.sin(car.heading) * car.speed * DT;
    let z = car.z + Math.cos(car.heading) * car.speed * DT;
    let bumped = false;
    for (const prop of THIRD_PROPS) {
      const distance = Math.hypot(x - prop.x, z - prop.z);
      const closest = prop.r + CAR_RADIUS;
      if (distance >= closest) continue;
      const k = closest / (distance || 1);
      [x, z, bumped] = [prop.x + (x - prop.x) * k, prop.z + (z - prop.z) * k, true];
    }
    if (bumped) {
      if (Math.abs(car.speed) > 60) this.events.push({ type: "bump" });
      car.speed *= -0.3;
    }
    [car.x, car.z] = [x, z];
    [player.x, player.z, player.facing] = [x, z, car.heading];
    player.step += Math.abs(car.speed) * DT;
  }

  private moveThirdVirus(): void {
    const { player: p, virus: v, car } = this.third!;
    if (this.powers.freeze > 0) {
      if (Math.hypot(v.x - p.x, v.y - THIRD_CHEST, v.z - p.z) < THIRD_HIT) this.shatter(v.x, v.y, () => this.respawnThirdVirus());
      return;
    }
    if (v.warning > 0) {
      const aim = () => {
        const [dx, dy, dz] = [p.x - v.x, THIRD_CHEST - v.y, p.z - v.z];
        const length = Math.hypot(dx, dy, dz) || 1;
        Object.assign(v, { dx: dx / length, dy: dy / length, dz: dz / length });
      };
      if (v.warning > AIM_LOCK + 1e-9) aim();
      v.warning -= DT;
      if (v.warning > 1e-9) return;
      v.warning = 0;
      this.events.push({ type: "launch", x: v.x, y: v.y });
    }
    const distance = this.speed * DT;
    const steps = Math.ceil(distance / VIRUS_STEP);
    for (let i = 0; i < steps; i++) {
      const step = distance / steps;
      v.x += v.dx * step;
      v.y += v.dy * step;
      v.z += v.dz * step;
      // Hit and run: the car runs it over.
      if (car.driving && v.y < 70 && Math.hypot(v.x - car.x, v.z - car.z) < CAR_RADIUS + 12) {
        this.closeCall = false;
        this.events.push({ type: "smash" });
        this.respawnThirdVirus();
        return;
      }
      if (this.invincible === 0 && Math.hypot(v.x - p.x, v.y - THIRD_CHEST, v.z - p.z) < THIRD_HIT) {
        this.takeHit();
        this.respawnThirdVirus();
        return;
      }
      // Flew past the player.
      if (Math.hypot(v.x - p.x, v.z - p.z) > 650 || v.y < -20) {
        this.respawnThirdVirus();
        return;
      }
    }
  }

  /** Breaks the frozen virus into pieces, which ends the freeze, and brings a new one. */
  private shatter(x: number, y: number, respawn: () => void): void {
    this.powers.freeze = 0;
    this.closeCall = false;
    respawn();
    this.events.push({ type: "shatter", x, y });
  }

  /** With the red pill, time slows down while the flying virus is close. */
  private updateBulletTime(): void {
    const { virus } = this;
    const close =
      this.powers.pill > 0 && !this.third && virus.visible && this.warning === 0 && this.powers.freeze === 0 &&
      gap(virus.bounds(), this.player.bounds()) <= BULLET_TIME_RANGE;
    const wanted = close ? BULLET_TIME : 1;
    // Eases in and out over about a tenth of a second.
    this.timeScale += (wanted - this.timeScale) * Math.min(1, DT * 12);
    if (Math.abs(this.timeScale - wanted) < 1e-3) this.timeScale = wanted;
  }

  /**
   * Out of the monitor: the room the player was in turns out to be the one on
   * the monitor's screen, and they burst out of it into the real room. The
   * virus stays stuck in there for a moment.
   */
  private escape(): void {
    const { player, virus } = this;
    this.canEscape = false;
    this.escapeTime = 0;
    this.inside = this.layers.filter((s) => s.visible && s !== player).map(shot);
    virus.visible = false;
    this.closeCall = false;
    this.escapeFrom = toOuterRoom(player.x, player.y);
    this.escapeX = player.x;
    this.vx = 0;
    this.vy = 0;
    this.burst(0);
    this.events.push({ type: "escape", x: player.x, y: player.y });
  }

  /** The player growing out of the screen, from 0 to 1. */
  private burst(progress: number): void {
    const { player } = this;
    const eased = progress * progress * (3 - 2 * progress);
    const scale = SCREEN_ROOM.scale + (1 - SCREEN_ROOM.scale) * eased;
    player.size = PLAYER_SIZE * scale;
    const { x, y } = this.escapeFrom;
    player.setXY(x + (this.escapeX - x) * eased, y + (CEILING_Y - ESCAPE_DROP - y) * eased);
  }

  /** Moves the escape along, and says whether the player is still bursting out. */
  private updateEscape(): boolean {
    if (this.escapeTime >= ESCAPE_STUCK) return false;
    this.escapeTime += DT;
    if (this.escapeTime >= ESCAPE_STUCK - 1e-9) {
      // Out of the monitor, the usual way.
      this.endEscape();
      this.virus.visible = true;
      this.respawnVirus();
      return false;
    }
    if (this.escapeTime > ESCAPE_BURST + 1e-9) return false;
    this.burst(Math.min(1, this.escapeTime / ESCAPE_BURST));
    return true;
  }

  private endEscape(): void {
    this.escapeTime = Infinity;
    this.inside = [];
    this.player.size = PLAYER_SIZE;
  }

  private playerCostume(input: Input, sideways: boolean): string {
    if (this.hitTime < HIT_FACE) return "hit";
    if (this.flying) return "jump";
    if (input.down) return "crouch";
    if (!this.onGround) return "jump";
    if (sideways) return Math.floor(this.walkTime / WALK_FRAME) % 2 === 0 ? "walk1" : "walk2";
    return "normal";
  }

  /** Back in the monitor, about to fly out. */
  private respawnVirus(): void {
    this.caught = null;
    this.thrown = false;
    this.ported = false;
    this.virus.setXY(VIRUS_SPAWN.x, VIRUS_SPAWN.y);
    this.warning = this.aimWarning();
    this.target = { x: this.player.x, y: this.player.y };
  }

  /** Seconds a virus shows where it's aiming. Shorter as it gets faster. */
  private aimWarning(): number {
    const progress = Math.min(1, (this.speed - VIRUS_START_SPEED) / (VIRUS_FAST - VIRUS_START_SPEED));
    return WARNING_LONGEST - (WARNING_LONGEST - WARNING_SHORTEST) * progress;
  }


  private moveVirus(): void {
    if (!this.virus.visible) return;
    // Frozen in place, and harmless: touching it breaks it, and a new one comes out of the monitor.
    if (this.powers.freeze > 0) {
      if (this.virus.isTouching(this.player)) this.shatter(this.virus.x, this.virus.y, () => this.respawnVirus());
      return;
    }
    const virus = this.virus;
    if (this.updateGravityGun()) return;
    if (this.warning > 0) {
      if (this.warning > AIM_LOCK + 1e-9) this.target = { x: this.player.x, y: this.player.y };
      this.warning -= DT;
      if (this.warning > 1e-9) return;
      this.warning = 0;
      virus.pointTowards(this.target.x, this.target.y);
      this.events.push({ type: "launch", x: virus.x, y: virus.y });
    }
    const distance = this.speed * DT;
    const steps = Math.ceil(distance / VIRUS_STEP);
    for (let i = 0; i < steps; i++) {
      virus.move(distance / steps);
      if (this.hurts(virus)) {
        this.closeCall = false;
        this.respawnVirus();
        return;
      }
      if (this.invincible === 0 && gap(virus.bounds(), this.player.bounds()) <= NEAR_MISS) this.closeCall = true;
      if (virus.isTouchingEdge()) {
        // Into a portal on one wall, and out of the other, still going the same way. Once a flight.
        const portal = this.powers.portal > 0 && !this.ported && Math.abs(virus.x) > PORTAL_X - 30;
        if (portal && virus.y > PORTAL_BOTTOM - 10 && virus.y < PORTAL_TOP + 10) {
          this.ported = true;
          virus.setXY(-Math.sign(virus.x) * (PORTAL_X - 24), virus.y);
          this.events.push({ type: "portal", x: virus.x, y: virus.y });
          continue;
        }
        if (this.closeCall) this.events.push({ type: "nearMiss" });
        this.closeCall = false;
        this.respawnVirus();
        return;
      }
    }
  }

  /**
   * The gravity gun: catches the flying virus when it comes close, holds it in
   * front of the player, then fires it back at the monitor, where it breaks.
   * Says whether it has the virus, so it doesn't fly as usual.
   */
  private updateGravityGun(): boolean {
    const { virus, player, monitor } = this;
    if (this.thrown) {
      const distance = GRAVITY_FIRE_SPEED * DT;
      const steps = Math.ceil(distance / VIRUS_STEP);
      for (let i = 0; i < steps; i++) {
        virus.move(distance / steps);
        if (virus.isTouching(monitor) || virus.isTouchingEdge()) {
          this.shatter(virus.x, virus.y, () => this.respawnVirus());
          return true;
        }
      }
      return true;
    }
    if (this.caught !== null) {
      this.caught += DT;
      virus.setXY(player.x + player.flipX * 48, player.y + 6);
      if (this.caught >= GRAVITY_HOLD - 1e-9) {
        this.caught = null;
        this.thrown = true;
        virus.pointTowards(monitor.x, monitor.y);
        this.events.push({ type: "fire" });
      }
      return true;
    }
    if (this.powers.gravity > 0 && this.warning === 0 && gap(virus.bounds(), player.bounds()) <= GRAVITY_RANGE) {
      this.caught = 0;
      this.closeCall = false;
      this.events.push({ type: "catch" });
      return true;
    }
    return false;
  }

  /** Takes a heart if this touches the player, and says whether it did. */
  private hurts(thing: Sprite): boolean {
    if (this.invincible > 0 || !thing.isTouching(this.player)) return false;
    this.takeHit();
    return true;
  }

  /** Takes a heart, or the shield. */
  private takeHit(): void {
    if (this.god) return;
    if (this.powers.shield > 0) {
      // The shield takes the hit instead of a heart.
      this.powers.shield = 0;
      this.invincible = INVINCIBLE;
      this.events.push({ type: "shield", x: this.player.x, y: this.player.y });
      return;
    }
    this.health -= 1;
    this.hitTime = 0;
    this.invincible = INVINCIBLE;
    this.frozen = HIT_STOP;
    this.player.setCostume("hit");
    this.events.push({ type: "hit", x: this.player.x, y: this.player.y, last: this.health < 1 });
  }

  /** Speeds the virus up little by little, forever. */
  private updateDifficulty(): void {
    this.speed = VIRUS_START_SPEED + VIRUS_SPEEDUP * this.time;
  }

  /** Counts down the player's power-ups, and lets the player grab the one on stage. */
  private updatePowerUps(): void {
    for (const kind of POWER_UPS) {
      const before = this.powers[kind];
      const left = before - DT;
      this.powers[kind] = left > 1e-9 ? left : 0;
      const tick = TICKS.find((mark) => before > mark + 1e-9 && left <= mark + 1e-9);
      if (tick !== undefined) this.events.push({ type: "ending", kind, left: tick });
    }
    if (this.third || this.breakout) return;
    const powerUp = this.powerUp;
    if (powerUp.visible) {
      this.powerUpShown += DT;
      if (powerUp.isTouching(this.player)) {
        const kind = this.powerUpKind;
        this.grabbed.push(kind);
        powerUp.visible = false;
        this.give(kind, powerUp.x, powerUp.y);
      } else if (this.powerUpShown >= POWER_UP_SHOWN - 1e-9) {
        powerUp.visible = false;
      }
    }
  }

  /** The penguin and power-ups take turns at random, on one timer. */
  private updateDrops(): void {
    this.dropTimer -= DT;
    if (this.dropTimer > 1e-9) return;
    const [low, high] = DROP_EVERY;
    this.dropTimer = low + this.random() * (high - low);
    const penguin = this.nextDrop ? this.nextDrop === "penguin" : this.health < MAX_HEALTH && this.random() < PENGUIN_CHANCE;
    this.nextDrop = null;
    if (penguin) this.showPenguin();
    else this.showPowerUp();
  }

  private showPowerUp(): void {
    const powerUp = this.powerUp;
    // Every kind once, in a random order, before any comes again.
    if (this.bag.length === 0) {
      this.bag = [...POWER_UPS];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j]!, this.bag[i]!];
      }
    }
    powerUp.setCostume(this.bag.pop()!);
    let x = this.randomInt(-200, 200);
    if (Math.abs(x - this.player.x) < POWER_UP_AWAY) x += x < this.player.x ? -2 * POWER_UP_AWAY : 2 * POWER_UP_AWAY;
    if (Math.abs(x) > 200) x -= Math.sign(x) * 4 * POWER_UP_AWAY;
    powerUp.setXY(x, this.randomInt(POWER_UP_LOWEST, POWER_UP_HIGHEST));
    powerUp.visible = true;
    this.powerUpShown = 0;
    this.events.push({ type: "appear", thing: this.powerUpKind });
  }

  /** Gives the player a power-up, grabbed at `x`, `y`. */
  private give(kind: PowerUpKind, x: number, y: number): void {
    this.powers[kind] = POWER_UP_TIME[kind];
    if (kind === "jetpack") this.canEscape = true;
    this.events.push({ type: "powerUp", kind, x, y });
    if (kind === "ball") this.startBreakout();
  }

  /** The floor's bricks float up, the player turns into the paddle and the virus into the ball. */
  private startBreakout(): void {
    const { player, virus } = this;
    this.breakout = {
      time: 0,
      paddle: Math.max(-240 + PADDLE.width / 2, Math.min(240 - PADDLE.width / 2, player.x)),
      ball: { x: 0, y: 0, vx: 0, vy: 0, stuck: true },
      bricks: Array<boolean>(BRICKS.columns * BRICKS.rows).fill(true),
      broken: 0,
    };
    this.endEscape();
    this.flying = false;
    this.powers.jetpack = 0;
    this.vx = this.vy = 0;
    this.onGround = true;
    this.caught = null;
    this.thrown = false;
    player.visible = false;
    virus.visible = false;
    this.monitor.visible = false;
    this.events.push({ type: "breakout" });
  }

  private updateBreakout(input: Input): void {
    const round = this.breakout!;
    round.time += DT;
    const half = PADDLE.width / 2;
    const steer = Number(input.right) - Number(input.left);
    round.paddle = Math.max(-240 + half, Math.min(240 - half, round.paddle + steer * PADDLE_SPEED * DT));
    const ball = round.ball;
    if (ball.stuck) {
      ball.x = round.paddle;
      ball.y = PADDLE.y + PADDLE.height / 2 + BALL_RADIUS;
      const ready = round.time >= BRICKS_RISE;
      if ((ready && input.jumpPressed) || round.time >= BALL_WAIT) {
        ball.stuck = false;
        const angle = (steer || (this.random() < 0.5 ? -1 : 1)) * 0.5;
        [ball.vx, ball.vy] = [Math.sin(angle) * BALL_SPEED, Math.cos(angle) * BALL_SPEED];
      }
    } else if (!this.moveBall(round)) {
      this.endBreakout(false);
      return;
    }
    if (round.broken === round.bricks.length) this.endBreakout(true);
    else if (this.powers.ball === 0) this.endBreakout(false);
  }

  /** Moves the ball, bouncing off the walls, the bricks and the paddle. Says whether it's still in play. */
  private moveBall(round: Breakout): boolean {
    const ball = round.ball;
    const speed = BALL_SPEED + BALL_SPEEDUP * round.broken;
    const scale = speed / Math.hypot(ball.vx, ball.vy);
    [ball.vx, ball.vy] = [ball.vx * scale, ball.vy * scale];
    const steps = Math.ceil((speed * DT) / 4);
    for (let i = 0; i < steps; i++) {
      const [lastX, lastY] = [ball.x, ball.y];
      ball.x += (ball.vx * DT) / steps;
      ball.y += (ball.vy * DT) / steps;
      if (Math.abs(ball.x) > 240 - BALL_RADIUS) {
        ball.x = Math.sign(ball.x) * (240 - BALL_RADIUS);
        ball.vx = -ball.vx;
      }
      if (ball.y > 180 - BALL_RADIUS) {
        ball.y = 180 - BALL_RADIUS;
        ball.vy = -Math.abs(ball.vy);
      }
      const hit = round.bricks.findIndex((there, i) => there && touchesBrick(ball.x, ball.y, i));
      if (hit >= 0) {
        round.bricks[hit] = false;
        round.broken += 1;
        // From the side if it was beside the brick a moment ago, else from above or below.
        const [left, right] = brickSides(hit);
        if (lastX + BALL_RADIUS <= left || lastX - BALL_RADIUS >= right) ball.vx = -ball.vx;
        else ball.vy = -ball.vy;
        const heart = round.broken % BRICKS_PER_HEART === 0 && this.health < MAX_HEALTH;
        if (heart) this.health += 1;
        this.events.push({ type: "brick", x: ball.x, y: ball.y, heart });
        break;
      }
      const top = PADDLE.y + PADDLE.height / 2;
      if (ball.vy < 0 && ball.y - BALL_RADIUS <= top && lastY - BALL_RADIUS >= top - 4 && Math.abs(ball.x - round.paddle) <= PADDLE.width / 2 + BALL_RADIUS) {
        // Off the paddle at an angle from where it hit: the ends send it out wide.
        const offset = Math.max(-1, Math.min(1, (ball.x - round.paddle) / (PADDLE.width / 2)));
        const angle = offset * 1.05;
        [ball.vx, ball.vy] = [Math.sin(angle) * speed, Math.cos(angle) * speed];
        ball.y = top + BALL_RADIUS;
        this.events.push({ type: "paddle" });
      }
      if (ball.y < PADDLE.y - 30) return false;
    }
    return true;
  }

  /** Back to the room: hearts for clearing every brick, and the virus back in the monitor. */
  private endBreakout(cleared: boolean): void {
    const round = this.breakout!;
    this.breakout = null;
    this.powers.ball = 0;
    const { player, virus } = this;
    player.visible = true;
    player.setXY(round.paddle, GROUND_Y);
    player.setCostume("normal");
    this.monitor.visible = true;
    virus.visible = true;
    this.respawnVirus();
    this.invincible = Math.max(this.invincible, 1);
    if (cleared) {
      this.health = MAX_HEALTH;
      this.powers.shield = Math.max(this.powers.shield, BREAKOUT_SHIELD);
    }
    this.events.push({ type: "breakoutEnd", cleared });
  }

  /** Lets the player grab the penguin while it shows. */
  private updatePickup(): void {
    const pickup = this.pickup;
    if (pickup.visible) {
      this.pickupShown += DT;
      if (pickup.isTouching(this.player)) {
        const full = this.health >= MAX_HEALTH;
        if (full) this.powers.shield = Math.max(this.powers.shield, PENGUIN_SHIELD);
        else this.health += 1;
        this.grabbed.push("penguin");
        pickup.visible = false;
        this.events.push({ type: "pickup", x: pickup.x, y: pickup.y, full });
      } else if (this.pickupShown >= PICKUP_SHOWN - 1e-9) {
        pickup.visible = false;
      }
    }
  }

  private showPenguin(): void {
    const pickup = this.pickup;
    pickup.setXY(this.randomInt(PICKUP_LEFTMOST, PICKUP_RIGHTMOST), pickup.y);
    pickup.ifOnEdgeBounce();
    pickup.visible = true;
    this.pickupShown = 0;
    this.events.push({ type: "appear", thing: "penguin" });
  }

  /** Does a cheat, while playing. */
  cheat(cheat: Cheat): void {
    if (this.phase !== "playing" || this.dying > 0) return;
    this.cheated = true;
    const { player } = this;
    // Diving, escaping and the bonus round only start from the room.
    const inRoom = !this.third && !this.breakout && this.escapeTime === Infinity;
    switch (cheat) {
      case "god":
        this.god = !this.god;
        break;
      case "heart":
        this.health = Math.min(MAX_HEALTH, this.health + 1);
        break;
      case "dive":
        if (inRoom) this.dive();
        break;
      case "drive":
        if (inRoom) this.dive();
        if (this.third && !this.third.car.driving) this.getInCar();
        break;
      case "escape":
        if (inRoom) this.escape();
        break;
      case "powerUpNow":
        [this.dropTimer, this.nextDrop] = [0, "powerUp"];
        break;
      case "penguinNow":
        [this.dropTimer, this.nextDrop] = [0, "penguin"];
        break;
      case "skip":
        this.time += CHEAT_SKIP;
        break;
      default:
        if (cheat === "ball" && !inRoom) break;
        this.give(cheat, player.x, player.y);
    }
  }

  /** The 2013 game over screen: the computer is infected, press R to repair. */
  private lose(): void {
    this.health = 0;
    this.dying = 0;
    this.invincible = 0;
    this.powers = noPowers();
    this.flying = false;
    this.third = null;
    this.breakout = null;
    this.caught = null;
    this.thrown = false;
    this.timeScale = 1;
    this.endEscape();
    this.phase = "over";
    this.events.push({ type: "music", playing: false });
    this.events.push({ type: "sound", sound: "death" });
    this.events.push({ type: "lost", time: Math.floor(this.time) });
    this.gladosTimer = new Timer(GLADOS_AFTER);
    this.overTime = 0;

    const { player, virus, monitor, pickup, gameOver, hl3 } = this;
    gameOver.visible = true;
    player.visible = true;
    player.setDirection(-90);
    player.setCostume("hit");
    player.setXY(208, -115);
    monitor.setXY(0, 110);
    pickup.visible = true;
    pickup.setDirection(90);
    pickup.setXY(-124, -115);
    hl3.visible = false;
    this.layers = [gameOver, virus, monitor, player, pickup, hl3];
  }

  private updateOver(): void {
    if (this.gladosTimer.tick()) {
      this.events.push({ type: "sound", sound: "glados" });
      this.gladosTimer.every = GLADOS_AFTER + sounds.glados;
      this.gladosTimer.left = this.gladosTimer.every;
    }
    const before = this.overTime;
    this.overTime += DT;
    const hl3 = this.hl3;
    if (hl3Shown(this.overTime) && !hl3Shown(before)) {
      hl3.setXY(this.randomInt(-200, 200), this.randomInt(-150, 150));
      hl3.setDirection(hl3.direction + 30);
      hl3.ifOnEdgeBounce();
      this.hl3Clicked = false;
    }
    hl3.visible = hl3Shown(this.overTime) && !this.hl3Clicked;
  }

  /** Clicking the Half-Life 3 logo makes it meow and go away. */
  click(x: number, y: number): void {
    if (this.phase === "over" && this.hl3.visible && this.hl3.isOpaqueAt(x, y)) {
      this.hl3.visible = false;
      this.hl3Clicked = true;
      this.events.push({ type: "sound", sound: "meow" });
    }
  }

  private allSprites(): Sprite[] {
    return [this.player, this.virus, this.monitor, this.pickup, this.gameOver, this.hl3, this.powerUp];
  }
}

function noPowers(): Record<PowerUpKind, number> {
  return Object.fromEntries(POWER_UPS.map((kind) => [kind, 0])) as Record<PowerUpKind, number>;
}

/** Brick `i`'s left and right sides. */
function brickSides(i: number): [number, number] {
  const left = BRICKS.left + (i % BRICKS.columns) * BRICKS.width;
  return [left, left + BRICKS.width];
}

/** Brick `i`'s top, row by row from the top. */
export function brickTop(i: number): number {
  return BRICKS.top - Math.floor(i / BRICKS.columns) * BRICKS.height;
}

/** Whether the ball at `x`, `y` touches brick `i`. */
function touchesBrick(x: number, y: number, i: number): boolean {
  const [left, right] = brickSides(i);
  const top = brickTop(i);
  const nearX = Math.max(left, Math.min(right, x));
  const nearY = Math.max(top - BRICKS.height, Math.min(top, y));
  return Math.hypot(x - nearX, y - nearY) < BALL_RADIUS;
}

function shot(s: Sprite): SpriteShot {
  return { costume: s.currentCostume, x: s.x, y: s.y, rotation: s.rotation, flipX: s.flipX, size: s.size };
}

/** Off one side of the stage and back on the other. */
export function wrapAround(x: number): number {
  const width = 2 * STAGE_HALF_WIDTH;
  return ((((x + STAGE_HALF_WIDTH) % width) + width) % width) - STAGE_HALF_WIDTH;
}

/** Where a point of the room on the monitor's screen is in the real room. */
export function toOuterRoom(x: number, y: number): { x: number; y: number } {
  const { left, top, scale } = SCREEN_ROOM;
  return { x: left + (240 + x) * scale, y: top - (180 - y) * scale };
}

/** Stage pixels between two boxes, 0 when they overlap. */
export function gap(a: Bounds, b: Bounds): number {
  const x = Math.max(0, a.left - b.right, b.left - a.right);
  const y = Math.max(0, a.bottom - b.top, b.bottom - a.top);
  return Math.hypot(x, y);
}

/**
 * The replay frame to show this long into the game over screen: the last
 * seconds of the run, slowed down, then the last frame for a moment, then again.
 */
export function replayFrame(replay: ReplayFrame[], seconds: number): ReplayFrame | null {
  if (replay.length === 0) return null;
  const playing = replay.length / HZ / REPLAY_SPEED;
  const t = seconds % (playing + REPLAY_HOLD);
  return replay[Math.min(replay.length - 1, Math.floor((t * REPLAY_SPEED * HZ) + 1e-9))]!;
}

/**
 * The Half-Life 3 logo on the game over screen: after 10 s it shows up for
 * 2 s twice, with 2 s between, then waits 6 s and starts again.
 */
export function hl3Shown(seconds: number): boolean {
  // A hair early, so adding up many small updates still lands on time.
  const t = seconds - HL3_AFTER + 1e-9;
  if (t < 0) return false;
  const cycle = t % 14;
  return cycle < 2 || (cycle >= 4 && cycle < 6);
}
