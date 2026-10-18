// Things that only change how the game looks: screen shake, and the red flash
// on hits. They never change the rules.

import type { GameEvent } from "./game.ts";

export class Effects {
  /** Seconds of shake left, and how strong it is in stage pixels. */
  shakeTime = 0;
  shakeStrength = 0;
  /** Red flash on hits, from 1 down to 0. */
  flash = 0;

  constructor(private readonly random: () => number = Math.random) {}

  handle(event: GameEvent): void {
    if (event.type === "shield") this.shake(0.1, 2);
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
    this.shakeTime = Math.max(0, this.shakeTime - seconds);
    if (this.shakeTime === 0) this.shakeStrength = 0;
    this.flash = Math.max(0, this.flash - seconds * 4);
  }

  clear(): void {
    this.shakeTime = 0;
    this.shakeStrength = 0;
    this.flash = 0;
  }
}
