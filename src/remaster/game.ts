// The remastered game: the 2013 rules, written as a normal game loop instead
// of Scratch scripts and updated 60 times a second, with smoother movement,
// real jumps and a fairer virus.

import { Sprite, type Costume, type RotationStyle } from "../engine/sprite.ts";
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
export const VIRUS_SPAWN = { x: -1, y: 134 } as const;
export const VIRUS_START_SPEED = 5.5 * SCRATCH_FPS;
const VIRUS_SPEEDUP = 0.9 * SCRATCH_FPS;
/** The 2013 virus kept speeding up forever. This one stops at 14 px per Scratch frame. */
export const VIRUS_TOP_SPEED = 14 * SCRATCH_FPS;
/** The virus flashes in the monitor before it flies out, less as it speeds up. */
export const WARNING_LONGEST = 0.6;
export const WARNING_SHORTEST = 0.3;
/** Its aim follows the player until this long before it flies. */
export const AIM_LOCK = 0.15;
const PICKUP_EVERY = 10;
export const PICKUP_SHOWN = 2;
/** The penguin blinks before it goes. */
export const PICKUP_BLINK = 0.6;
const PICKUP_Y = -25;
/** Penguin spots where all of it is on stage. The 2013 game could put half of it off the right edge. */
const PICKUP_LEFTMOST = -120;
const PICKUP_RIGHTMOST = 260;
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
  | { type: "pickup"; x: number; y: number }
  | { type: "jump"; x: number; y: number }
  | { type: "land"; x: number; y: number }
  | { type: "launch"; x: number; y: number }
  | { type: "lost"; time: number };

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

  readonly player = sprite("player", costumes.player, 0, GROUND_Y, 180.6111234669416, "left-right");
  readonly virus = sprite("virus", costumes.virus, VIRUS_SPAWN.x, VIRUS_SPAWN.y, 222.1289005570158, "left-right");
  readonly monitor = sprite("monitor", costumes.monitor, 0, 110, 150, "don't rotate");
  readonly pickup = sprite("pickup", costumes.pickup, -124, PICKUP_Y, 134.39163793441224, "left-right");
  readonly gameOver = sprite("gameOver", costumes.gameOver, 117, -87, 150, "all around");
  readonly hl3 = sprite("hl3", costumes.hl3, -116, 43, 100, "all around", -75);
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
  private dying = 0;
  private jumpCut = false;
  private jumpBuffer = 0;
  private walkTime = 0;
  private hitTime = Infinity;
  private speedup = new Timer(0);
  private pickupTimer = new Timer(PICKUP_EVERY);
  private pickupShown = 0;
  private gladosTimer = new Timer(GLADOS_AFTER);
  private hl3Time = 0;
  private hl3Clicked = false;

  constructor(readonly random: () => number = Math.random) {
    this.toTitle();
  }

  /** Scratch's "pick random" with whole numbers. */
  randomInt(from: number, to: number): number {
    return from + Math.floor(this.random() * (to + 1 - from));
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
    this.speedup = new Timer(this.randomInt(5, 10));
    this.pickupTimer = new Timer(PICKUP_EVERY);
    this.pickupShown = 0;
    this.vx = 0;
    this.vy = 0;
    this.onGround = true;
    this.jumpCut = false;
    this.jumpBuffer = 0;
    this.walkTime = 0;
    this.hitTime = Infinity;
    this.invincible = 0;
    this.frozen = 0;
    this.dying = 0;
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
    this.layers = [pickup, player, monitor, virus];
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
    this.movePlayer(input);
    this.moveVirus();
    this.updatePickup();
    if (this.speedup.tick()) {
      this.speed = Math.min(VIRUS_TOP_SPEED, this.speed + VIRUS_SPEEDUP);
      this.speedup.every = this.randomInt(5, 10);
      this.speedup.left = this.speedup.every;
    }
    if (this.health < 1) {
      this.health = 0;
      this.dying = DEATH_PAUSE;
    }
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
    if (!this.onGround) this.vy -= (input.down ? DIVE_GRAVITY : this.vy > 0 ? GRAVITY : FALL_GRAVITY) * DT;

    const x = player.x + this.vx * DT;
    let y = player.y + ((vy + this.vy) / 2) * DT;
    if (!this.onGround && y <= GROUND_Y) {
      y = GROUND_Y;
      this.vy = 0;
      this.onGround = true;
      this.events.push({ type: "land", x, y });
    }
    player.setXY(x, y);
    // The edge of the stage stops the player.
    if (player.x !== x) this.vx = 0;

    this.walkTime = sideways ? this.walkTime + DT : 0;
    this.hitTime += DT;
    player.setCostume(this.playerCostume(input, sideways));
  }

  private playerCostume(input: Input, sideways: boolean): string {
    if (this.hitTime < HIT_FACE) return "hit";
    if (input.down) return "crouch";
    if (!this.onGround) return "jump";
    if (sideways) return Math.floor(this.walkTime / WALK_FRAME) % 2 === 0 ? "walk1" : "walk2";
    return "normal";
  }

  /** Back in the monitor, flashing, about to fly out. */
  private respawnVirus(): void {
    this.virus.setXY(VIRUS_SPAWN.x, VIRUS_SPAWN.y);
    const progress = (this.speed - VIRUS_START_SPEED) / (VIRUS_TOP_SPEED - VIRUS_START_SPEED);
    this.warning = WARNING_LONGEST - (WARNING_LONGEST - WARNING_SHORTEST) * progress;
    this.target = { x: this.player.x, y: this.player.y };
  }

  private moveVirus(): void {
    const virus = this.virus;
    if (this.warning > 0) {
      if (this.warning > AIM_LOCK + 1e-9) this.target = { x: this.player.x, y: this.player.y };
      this.warning -= DT;
      if (this.warning > 1e-9) return;
      this.warning = 0;
      virus.pointTowards(this.target.x, this.target.y);
      this.events.push({ type: "launch", x: virus.x, y: virus.y });
    }
    virus.move(this.speed * DT);
    if (this.invincible <= 0 && virus.isTouching(this.player)) {
      this.health -= 1;
      this.hitTime = 0;
      this.invincible = INVINCIBLE;
      this.frozen = HIT_STOP;
      this.player.setCostume("hit");
      this.events.push({ type: "hit", x: this.player.x, y: this.player.y, last: this.health < 1 });
      this.respawnVirus();
    } else if (virus.isTouchingEdge()) {
      this.respawnVirus();
    }
  }

  private updatePickup(): void {
    const pickup = this.pickup;
    if (pickup.visible) {
      this.pickupShown += DT;
      if (pickup.isTouching(this.player)) {
        this.health += 1;
        pickup.visible = false;
        this.events.push({ type: "pickup", x: pickup.x, y: pickup.y });
      } else if (this.pickupShown >= PICKUP_SHOWN - 1e-9) {
        pickup.visible = false;
      }
    }
    if (this.pickupTimer.tick()) {
      pickup.setXY(this.randomInt(PICKUP_LEFTMOST, PICKUP_RIGHTMOST), pickup.y);
      pickup.ifOnEdgeBounce();
      pickup.visible = true;
      this.pickupShown = 0;
    }
  }

  /** The 2013 game over screen: the computer is infected, press R to repair. */
  private lose(): void {
    this.health = 0;
    this.dying = 0;
    this.invincible = 0;
    this.phase = "over";
    this.events.push({ type: "music", playing: false });
    this.events.push({ type: "sound", sound: "death" });
    this.events.push({ type: "lost", time: Math.floor(this.time) });
    this.gladosTimer = new Timer(GLADOS_AFTER);
    this.hl3Time = 0;

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
    const before = this.hl3Time;
    this.hl3Time += DT;
    const hl3 = this.hl3;
    if (hl3Shown(this.hl3Time) && !hl3Shown(before)) {
      hl3.setXY(this.randomInt(-200, 200), this.randomInt(-150, 150));
      hl3.setDirection(hl3.direction + 30);
      hl3.ifOnEdgeBounce();
      this.hl3Clicked = false;
    }
    hl3.visible = hl3Shown(this.hl3Time) && !this.hl3Clicked;
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
    return [this.player, this.virus, this.monitor, this.pickup, this.gameOver, this.hl3];
  }
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
