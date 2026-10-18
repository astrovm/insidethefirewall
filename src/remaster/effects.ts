// Things that only change how the game looks: particles, screen shake and
// flashes. They never change the rules.

import type { GameEvent } from "./game.ts";

/** Colors taken from the 2013 art. */
const palette = {
  virus: ["#999900", "#cccc00", "#660000"],
  blood: ["#ff0000", "#b51000", "#000008"],
  penguin: ["#ff9900", "#ffffff", "#000000"],
  dust: ["#b51000", "#7a0b00", "#000008"],
  spark: ["#ff0000", "#ff9900"],
};

export interface Particle {
  /** Stage position, y up. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds left, and seconds it started with. */
  life: number;
  lifetime: number;
  size: number;
  color: string;
  gravity: number;
}

const MAX_PARTICLES = 400;

export class Effects {
  particles: Particle[] = [];
  /** Seconds of shake left, and how strong it is in stage pixels. */
  shakeTime = 0;
  shakeStrength = 0;
  /** Red flash on hits, from 1 down to 0. */
  flash = 0;
  /** Turns off shake and flashes, for players who don't want them. */
  calm = false;

  constructor(private readonly random: () => number = Math.random) {}

  handle(event: GameEvent): void {
    switch (event.type) {
      case "hit":
        this.burst(event.x, event.y, palette.virus, 18, 260);
        this.burst(event.x, event.y, palette.blood, event.last ? 40 : 10, event.last ? 360 : 200);
        this.shake(event.last ? 0.5 : 0.25, event.last ? 9 : 5);
        this.flash = event.last ? 1 : 0.6;
        break;
      case "pickup":
        // The penguin is drawn left of its position, a quirk of the 2013 costume.
        this.burst(event.x - 67, event.y + 8, palette.penguin, 24, 220, -400);
        break;
      case "land":
        this.burst(event.x, event.y - 40, palette.dust, 6, 90, 900, Math.PI / 2);
        break;
      case "jump":
        this.burst(event.x, event.y - 40, palette.dust, 4, 70, 900, Math.PI / 2);
        break;
      case "launch":
        this.burst(event.x, event.y, palette.spark, 8, 140);
        break;
    }
  }

  /**
   * Square pixels flying out from a point. `spread` limits the angle around
   * straight up, for dust that kicks up instead of out.
   */
  burst(x: number, y: number, colors: string[], count: number, speed: number, gravity = 700, spread = Math.PI): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const angle = Math.PI / 2 + (this.random() * 2 - 1) * spread;
      const velocity = speed * (0.35 + this.random() * 0.65);
      const lifetime = 0.35 + this.random() * 0.45;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: lifetime,
        lifetime,
        size: this.random() < 0.3 ? 4 : 3,
        color: colors[Math.floor(this.random() * colors.length)] ?? "#fff",
        gravity,
      });
    }
  }

  shake(seconds: number, strength: number): void {
    this.shakeTime = Math.max(this.shakeTime, seconds);
    this.shakeStrength = Math.max(this.shakeTime > 0 ? this.shakeStrength : 0, strength);
  }

  /** Where to draw the stage this frame, in stage pixels. */
  shakeOffset(): [number, number] {
    if (this.calm || this.shakeTime <= 0) return [0, 0];
    const strength = this.shakeStrength * Math.min(1, this.shakeTime / 0.15);
    return [(this.random() * 2 - 1) * strength, (this.random() * 2 - 1) * strength];
  }

  update(seconds: number): void {
    this.shakeTime = Math.max(0, this.shakeTime - seconds);
    if (this.shakeTime === 0) this.shakeStrength = 0;
    this.flash = Math.max(0, this.flash - seconds * 4);
    for (const p of this.particles) {
      p.life -= seconds;
      p.vy -= p.gravity * seconds;
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  clear(): void {
    this.particles = [];
    this.shakeTime = 0;
    this.shakeStrength = 0;
    this.flash = 0;
  }
}
