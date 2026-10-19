// Things that only change how the game looks: screen shake, and the red flash
// on hits. They never change the rules.

import type { GameEvent } from "./game.ts";

/** Seconds the pieces of a broken virus fly. */
export const SHARDS = 0.7;
/** Colors of the pieces: ice for a frozen virus, the cube when it breaks. */
const ICE = ["#ffffff", "#66ccff", "#9a9a2a"];
const CUBE = ["#c0c0c0", "#808080", "#ff3d8b"];
/** Seconds the HEV suit's warning stays on screen. */
export const CRITICAL = 2.5;
/** Seconds "HIT & RUN!" shows after running the virus over. */
export const SMASH = 0.8;

export class Effects {
  /** Seconds of shake left, and how strong it is in stage pixels. */
  shakeTime = 0;
  shakeStrength = 0;
  /** Red flash on hits, from 1 down to 0. */
  flash = 0;

  /** Pieces of a broken frozen virus, flying apart and falling, in stage pixels. */
  shards: { x: number; y: number; vx: number; vy: number; spin: number; size: number }[] = [];
  /** Seconds since the virus broke. */
  shardTime = Infinity;
  shardColors = ICE;
  /** Seconds left of the HEV suit's warning. */
  critical = 0;
  /** Seconds left of the "HIT & RUN!" text. */
  smash = 0;

  constructor(private readonly random: () => number = Math.random) {}

  handle(event: GameEvent): void {
    if (event.type === "shield") this.shake(0.1, 2);
    if (event.type === "critical") this.critical = CRITICAL;
    if (event.type === "smash") {
      this.smash = SMASH;
      this.shake(0.2, 4);
    }
    if (event.type === "bump") this.shake(0.12, 3);
    if (event.type === "shatter" || event.type === "cube") {
      this.shake(0.15, 3);
      this.shardTime = 0;
      this.shardColors = event.type === "cube" ? CUBE : ICE;
      this.shards = Array.from({ length: 14 }, () => {
        const angle = this.random() * Math.PI * 2;
        const speed = 120 + this.random() * 220;
        return {
          x: event.x,
          y: event.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed + 120,
          spin: (this.random() - 0.5) * 20,
          size: 4 + this.random() * 6,
        };
      });
    }
    if (event.type === "escape") this.shake(0.3, 4);
    if (event.type !== "hit") return;
    this.shake(event.last ? 0.3 : 0.15, event.last ? 4 : 2);
    this.flash = event.last ? 0.6 : 0.3;
  }

  shake(seconds: number, strength: number): void {
    this.shakeTime = Math.max(this.shakeTime, seconds);
    this.shakeStrength = Math.max(this.shakeTime > 0 ? this.shakeStrength : 0, strength);
  }

  /** Where to draw the stage this frame, in stage pixels. */
  shakeOffset(): [number, number] {
    if (this.shakeTime <= 0) return [0, 0];
    const strength = this.shakeStrength * Math.min(1, this.shakeTime / 0.15);
    return [(this.random() * 2 - 1) * strength, (this.random() * 2 - 1) * strength];
  }

  update(seconds: number): void {
    this.shardTime += seconds;
    for (const shard of this.shards) {
      shard.x += shard.vx * seconds;
      shard.y += shard.vy * seconds;
      shard.vy -= 900 * seconds;
    }
    if (this.shardTime > SHARDS) this.shards = [];
    this.shakeTime = Math.max(0, this.shakeTime - seconds);
    if (this.shakeTime === 0) this.shakeStrength = 0;
    this.flash = Math.max(0, this.flash - seconds * 4);
    this.critical = Math.max(0, this.critical - seconds);
    this.smash = Math.max(0, this.smash - seconds);
  }

  clear(): void {
    this.shards = [];
    this.shakeTime = 0;
    this.shakeStrength = 0;
    this.flash = 0;
    this.critical = 0;
    this.smash = 0;
  }
}
