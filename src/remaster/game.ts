// The remastered game: the 2013 rules, written as a normal game loop instead
// of Scratch scripts and updated 60 times a second, with smoother movement,
// real jumps, a fairer virus and power-ups.

import { Sprite, type Bounds, type Costume, type RotationStyle } from "../engine/sprite.ts";
import { costumes, sounds } from "../game/classic.ts";

export const HZ = 60;
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
export const HIT_STOP = 4 * DT;
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
/** The penguin, an extra life, comes after 20 s, then every 20 to 30 s. In 2013 it came every 10 s. */
export const PICKUP_FIRST = 20;
const PICKUP_EVERY = [20, 30] as const;
export const PICKUP_SHOWN = 2;
/** The penguin blinks before it goes. */
export const PICKUP_BLINK = 0.6;
const PICKUP_Y = -25;
/** Penguin spots where all of it is on stage. The 2013 game could put half of it off the right edge. */
const PICKUP_LEFTMOST = -120;
const PICKUP_RIGHTMOST = 260;
/** A penguin grabbed with full hearts gives a short shield instead. */
export const PENGUIN_SHIELD = 3;
export type PowerUpKind = "jetpack" | "shield" | "freeze" | "pill";
/** Things the player can grab. */
export type Grab = "penguin" | PowerUpKind;
export const POWER_UPS: PowerUpKind[] = ["jetpack", "shield", "freeze", "pill"];
/** Seconds each power-up lasts. A shield also ends when it blocks a hit. */
export const POWER_UP_TIME: Record<PowerUpKind, number> = { jetpack: 6, shield: 10, freeze: 4, pill: 8 };
/** With the red pill the room is code, and time slows down this much while the flying virus is this close. */
export const BULLET_TIME = 0.3;
const BULLET_TIME_RANGE = 90;
/** Power-ups are rare: the first comes after 30 s, then one every 30 to 45 s, for 5 s each. */
export const POWER_UP_FIRST = 30;
const POWER_UP_EVERY = [30, 45] as const;
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
export const THIRD_TIME = 10;
export const THIRD_OUT = 0.6;
/** The 3D floor: as wide as the stage, and this deep. */
export const THIRD_DEPTH = 600;
const THIRD_DEPTH_SPEED = 380;
/** The virus hits closer than this, in 3D. */
const THIRD_HIT = 34;
/** Where the player's chest is in 3D, for the virus to aim at. */
export const THIRD_CHEST = 40;

/** Things in the 3D world. x is across, y up and z away from the camera. */
export interface ThirdDimension {
  /** Seconds since diving in. */
  time: number;
  player: { x: number; z: number; vx: number; vz: number };
  virus: { x: number; y: number; z: number; dx: number; dy: number; dz: number; warning: number };
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
  powers: Record<PowerUpKind, number> = { jetpack: 0, shield: 0, freeze: 0, pill: 0 };
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
  /** Where the player was across the room, which is where they come out. */
  private escapeX = 0;
  private powerUpTimer = POWER_UP_FIRST;
  private powerUpShown = 0;
  /** The flying virus came close to the player without a hit. */
  private closeCall = false;
  private dying = 0;
  private jumpCut = false;
  private jumpBuffer = 0;
  private walkTime = 0;
  private hitTime = Infinity;
  private pickupTimer = PICKUP_FIRST;
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
    this.time = 0;
    this.health = 1;
    this.speed = VIRUS_START_SPEED;
    this.pickupTimer = PICKUP_FIRST;
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
    this.powers = { jetpack: 0, shield: 0, freeze: 0, pill: 0 };
    this.flying = false;
    this.third = null;
    this.sinceThird = Infinity;
    this.timeScale = 1;
    this.powerUpTimer = POWER_UP_FIRST;
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
    } else {
      if (!this.updateEscape()) this.movePlayer(input);
      this.moveVirus();
      this.updatePickup();
    }
    this.updatePowerUps();
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
    const wanted = sideways ? (input.left ? -PLAYER_SPEED : PLAYER_SPEED) : 0;
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
    } else {
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
      player: { x: 0, z: 120, vx: 0, vz: 0 },
      virus: { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, warning: 0 },
    };
    this.respawnThirdVirus();
    this.events.push({ type: "dive" });
  }

  private respawnThirdVirus(): void {
    const third = this.third!;
    Object.assign(third.virus, { x: this.randomInt(-150, 150), y: 120, z: THIRD_DEPTH, warning: this.aimWarning() });
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
    const sideways = input.left !== input.right;
    const ahead = input.jump !== input.down;
    const approach = (value: number, wanted: number) => {
      const change = (wanted === 0 || Math.sign(wanted) === -Math.sign(value) ? RUN_BRAKING : RUN_ACCELERATION) * DT;
      return Math.abs(wanted - value) <= change ? wanted : value + Math.sign(wanted - value) * change;
    };
    p.vx = approach(p.vx, sideways ? (input.left ? -PLAYER_SPEED : PLAYER_SPEED) : 0);
    p.vz = approach(p.vz, ahead ? (input.jump ? THIRD_DEPTH_SPEED : -THIRD_DEPTH_SPEED) : 0);
    p.x = Math.max(-220, Math.min(220, p.x + p.vx * DT));
    p.z = Math.max(20, Math.min(THIRD_DEPTH - 40, p.z + p.vz * DT));
    if (sideways) this.player.setDirection(input.left ? -90 : 90);
    this.walkTime = sideways || ahead ? this.walkTime + DT : 0;
    this.hitTime += DT;
    this.player.setCostume(this.playerCostume(noInput, sideways || ahead));
    this.moveThirdVirus();
  }

  private moveThirdVirus(): void {
    const { player: p, virus: v } = this.third!;
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
      if (this.invincible === 0 && Math.hypot(v.x - p.x, v.y - THIRD_CHEST, v.z - p.z) < THIRD_HIT) {
        this.takeHit();
        this.respawnThirdVirus();
        return;
      }
      if (v.z < -60 || Math.abs(v.x) > 320 || v.y < -20) {
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
        if (this.closeCall) this.events.push({ type: "nearMiss" });
        this.closeCall = false;
        this.respawnVirus();
        return;
      }
    }
  }

  /** Takes a heart if this touches the player, and says whether it did. */
  private hurts(thing: Sprite): boolean {
    if (this.invincible > 0 || !thing.isTouching(this.player)) return false;
    this.takeHit();
    return true;
  }

  /** Takes a heart, or the shield. */
  private takeHit(): void {
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

  /** Counts down the player's power-ups, and shows a new one now and then. */
  private updatePowerUps(): void {
    for (const kind of POWER_UPS) {
      const before = this.powers[kind];
      const left = before - DT;
      this.powers[kind] = left > 1e-9 ? left : 0;
      const tick = TICKS.find((mark) => before > mark + 1e-9 && left <= mark + 1e-9);
      if (tick !== undefined) this.events.push({ type: "ending", kind, left: tick });
    }
    if (this.third) return;
    const powerUp = this.powerUp;
    if (powerUp.visible) {
      this.powerUpShown += DT;
      if (powerUp.isTouching(this.player)) {
        const kind = this.powerUpKind;
        this.powers[kind] = POWER_UP_TIME[kind];
        if (kind === "jetpack") this.canEscape = true;
        this.grabbed.push(kind);
        powerUp.visible = false;
        this.events.push({ type: "powerUp", kind, x: powerUp.x, y: powerUp.y });
      } else if (this.powerUpShown >= POWER_UP_SHOWN - 1e-9) {
        powerUp.visible = false;
      }
    }
    this.powerUpTimer -= DT;
    if (this.powerUpTimer > 1e-9) return;
    const [low, high] = POWER_UP_EVERY;
    this.powerUpTimer = low + this.random() * (high - low);
    powerUp.setCostume(POWER_UPS[Math.floor(this.random() * POWER_UPS.length)]!);
    let x = this.randomInt(-200, 200);
    if (Math.abs(x - this.player.x) < POWER_UP_AWAY) x += x < this.player.x ? -2 * POWER_UP_AWAY : 2 * POWER_UP_AWAY;
    if (Math.abs(x) > 200) x -= Math.sign(x) * 4 * POWER_UP_AWAY;
    powerUp.setXY(x, this.randomInt(POWER_UP_LOWEST, POWER_UP_HIGHEST));
    powerUp.visible = true;
    this.powerUpShown = 0;
    this.events.push({ type: "appear", thing: this.powerUpKind });
  }

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
    this.pickupTimer -= DT;
    if (this.pickupTimer <= 1e-9) {
      pickup.setXY(this.randomInt(PICKUP_LEFTMOST, PICKUP_RIGHTMOST), pickup.y);
      pickup.ifOnEdgeBounce();
      pickup.visible = true;
      this.pickupShown = 0;
      const [low, high] = PICKUP_EVERY;
      this.pickupTimer = low + this.random() * (high - low);
      this.events.push({ type: "appear", thing: "penguin" });
    }
  }

  /** The 2013 game over screen: the computer is infected, press R to repair. */
  private lose(): void {
    this.health = 0;
    this.dying = 0;
    this.invincible = 0;
    this.powers = { jetpack: 0, shield: 0, freeze: 0, pill: 0 };
    this.flying = false;
    this.third = null;
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
  const t = seconds - HL3_AFTER;
  if (t < 0) return false;
  const cycle = t % 14;
  return cycle < 2 || (cycle >= 4 && cycle < 6);
}
