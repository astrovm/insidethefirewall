// The remastered game. Same rules as the 2013 one, written as a normal game
// loop instead of Scratch scripts, and updated 60 times a second.

import { Sprite, type Costume, type RotationStyle } from "../engine/sprite.ts";
import { costumes, sounds } from "../game/classic.ts";

export const HZ = 60;
export const DT = 1 / HZ;

/** The 2013 game moved things once per Scratch frame, 30 times a second. */
const SCRATCH_FPS = 30;

export const PLAYER_SPEED = 20 * SCRATCH_FPS;
export const GROUND_Y = -100;
const JUMP_TOP_Y = -25;
const JUMP_HALF = 0.15;
const WALK_FRAME = 0.15;
const HIT_FACE = 0.3;
export const VIRUS_SPAWN = { x: -1, y: 134 } as const;
export const VIRUS_START_SPEED = 5.5 * SCRATCH_FPS;
const VIRUS_SPEEDUP = 0.9 * SCRATCH_FPS;
const VIRUS_FIRST_AIM = 0.2;
const PICKUP_EVERY = 10;
const PICKUP_SHOWN = 2;
const PICKUP_Y = -25;
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
  | { type: "hit"; x: number; y: number }
  | { type: "pickup"; x: number; y: number }
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

  private jumpTime = -1;
  private walkTime = 0;
  private hitTime = Infinity;
  private virusWait = 0;
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

  get onGround(): boolean {
    return this.jumpTime < 0;
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
    this.jumpTime = -1;
    this.walkTime = 0;
    this.hitTime = Infinity;
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
    virus.setXY(VIRUS_SPAWN.x, VIRUS_SPAWN.y);
    this.virusWait = VIRUS_FIRST_AIM;
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
    this.time += DT;
    this.movePlayer(input);
    this.moveVirus();
    this.updatePickup();
    if (this.speedup.tick()) {
      this.speed += VIRUS_SPEEDUP;
      this.speedup.every = this.randomInt(5, 10);
      this.speedup.left = this.speedup.every;
    }
    if (this.health < 1) this.lose();
  }

  private movePlayer(input: Input): void {
    const player = this.player;
    const sideways = input.left !== input.right;
    if (input.right) player.setXY(player.x + PLAYER_SPEED * DT, player.y);
    if (input.left) player.setXY(player.x - PLAYER_SPEED * DT, player.y);
    if (sideways) player.setDirection(input.left ? -90 : 90);

    if (input.jumpPressed && this.onGround) this.jumpTime = 0;
    if (!this.onGround) {
      this.jumpTime += DT;
      const t = this.jumpTime;
      const rise = JUMP_TOP_Y - GROUND_Y;
      const y = t < JUMP_HALF ? GROUND_Y + rise * (t / JUMP_HALF) : JUMP_TOP_Y - rise * ((t - JUMP_HALF) / JUMP_HALF);
      if (t >= JUMP_HALF * 2) {
        this.jumpTime = -1;
        player.setXY(player.x, GROUND_Y);
      } else {
        player.setXY(player.x, y);
      }
    }

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

  private aimVirus(): void {
    this.virus.setXY(VIRUS_SPAWN.x, VIRUS_SPAWN.y);
    this.virus.pointTowards(this.player.x, this.player.y);
  }

  private moveVirus(): void {
    const virus = this.virus;
    if (this.virusWait > 0) {
      this.virusWait -= DT;
      if (this.virusWait > 1e-9) return;
      this.virusWait = 0;
      this.aimVirus();
    }
    virus.move(this.speed * DT);
    if (virus.isTouching(this.player)) {
      this.health -= 1;
      this.hitTime = 0;
      this.player.setCostume("hit");
      this.events.push({ type: "hit", x: this.player.x, y: this.player.y });
      this.aimVirus();
    } else if (virus.isTouchingEdge()) {
      this.aimVirus();
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
      pickup.setXY(this.randomInt(-120, 295), pickup.y);
      pickup.ifOnEdgeBounce();
      pickup.visible = true;
      this.pickupShown = 0;
    }
  }

  /** The 2013 game over screen: the computer is infected, press R to repair. */
  private lose(): void {
    this.health = 0;
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
