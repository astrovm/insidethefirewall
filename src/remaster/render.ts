import { STAGE_HEIGHT, STAGE_WIDTH, type Costume, type Sprite } from "../engine/sprite.ts";
import { interpolate, type CostumeImages } from "../render.ts";
import type { Effects } from "./effects.ts";
import { flameCostumes, PICKUP_BLINK, POWER_UP_TIME, POWER_UPS, powerUpCostumes, type Game } from "./game.ts";

export const colors = {
  green: "#00cc44",
  brick: "#b51000",
  mortar: "#000008",
  title: "#006321",
  orange: "#fe9501",
  red: "#ff0000",
  shield: "#66ccff",
};

/** Where the 480x360 stage sits on the canvas, in device pixels. */
export interface View {
  x: number;
  y: number;
  /** Device pixels per stage pixel. */
  scale: number;
}

/** The biggest stage that fits, centered, with black around it. */
export function fitStage(width: number, height: number): View {
  const scale = Math.max(0.01, Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT));
  return {
    x: Math.round((width - STAGE_WIDTH * scale) / 2),
    y: Math.round((height - STAGE_HEIGHT * scale) / 2),
    scale,
  };
}

/** Stage point (y up, 0 in the middle) to canvas point. */
export function toCanvas(view: View, x: number, y: number): [number, number] {
  return [view.x + (STAGE_WIDTH / 2 + x) * view.scale, view.y + (STAGE_HEIGHT / 2 - y) * view.scale];
}

/** Canvas point to stage point. */
export function toStage(view: View, px: number, py: number): [number, number] {
  return [(px - view.x) / view.scale - STAGE_WIDTH / 2, STAGE_HEIGHT / 2 - (py - view.y) / view.scale];
}

/** Where the 2013 project put the title, and its size. */
const TITLE_X = -1;
const TITLE_Y = 1;
const TITLE_SIZE = 0.9708737864077678;

interface Raster {
  canvas: HTMLCanvasElement;
  /** Device pixels per costume unit. */
  scale: number;
}

/** Draws the remastered game on a canvas that fills the window. */
export class RemasterRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly rasters = new Map<Costume, Raster>();
  private stageRaster: HTMLCanvasElement | null = null;
  view: View = { x: 0, y: 0, scale: 1 };
  /** 0 shows the game, 1 is fully black. Used for fades between screens. */
  fade = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly images: CostumeImages,
    private readonly backdrops: { stage: Costume; title: Costume },
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, pixelRatio: number): void {
    this.canvas.width = Math.max(1, Math.round(cssWidth * pixelRatio));
    this.canvas.height = Math.max(1, Math.round(cssHeight * pixelRatio));
    this.view = fitStage(this.canvas.width, this.canvas.height);
    this.rasters.clear();
  }

  draw(game: Game, between: number, effects: Effects): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const steady = this.view;
    const [dx, dy] = effects.shakeOffset();
    this.view = { ...steady, x: steady.x + Math.round(dx * steady.scale), y: steady.y + Math.round(dy * steady.scale) };
    this.drawBackdrop("#000");
    if (game.phase !== "over") this.drawStage();
    if (game.phase === "title") this.drawTitle();

    // Sprites can poke out of the stage a little, as in Scratch. Hide that part.
    ctx.save();
    if (game.phase === "playing") {
      ctx.beginPath();
      ctx.rect(this.view.x, this.view.y, Math.round(STAGE_WIDTH * this.view.scale), Math.round(STAGE_HEIGHT * this.view.scale));
      ctx.clip();
    }
    const playing = game.phase === "playing";
    for (const sprite of game.layers) {
      if (!sprite.visible) continue;
      let [x, y] = interpolate(sprite, game.previous.get(sprite), between);
      // Power-ups bob up and down, so they read as things to grab.
      if (sprite === game.powerUp) y += Math.sin(game.time * 5) * 3;
      if (playing && sprite === game.player && game.powers.jetpack > 0) this.drawJetpack(game, x, y);
      ctx.globalAlpha = playing ? this.alphaOf(game, sprite) : 1;
      if (playing && sprite === game.virus && game.powers.freeze > 0) ctx.filter = "hue-rotate(160deg) saturate(1.5)";
      if (ctx.globalAlpha > 0) this.drawSprite(sprite, x, y);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      if (playing && sprite === game.player && game.powers.shield > 0) this.drawShield(game, x, y);
    }
    ctx.restore();
    this.view = steady;
    if (game.phase === "playing") this.drawHud(game);

    if (effects.flash > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(255, 0, 0, ${0.25 * effects.flash})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    if (this.fade > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, this.fade)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Blinking, as a warning: the player while invincible, the penguin and
   * power-ups before they go, and a frozen virus about to thaw.
   */
  private alphaOf(game: Game, sprite: Sprite): number {
    if (sprite === game.player && game.invincible > 0) return blink(game.invincible);
    if (sprite === game.pickup && game.pickupLeft < PICKUP_BLINK) return blink(game.pickupLeft);
    if (sprite === game.powerUp && game.powerUpLeft < PICKUP_BLINK) return blink(game.powerUpLeft);
    if (sprite === game.virus && game.powers.freeze > 0) return game.powers.freeze < 1 ? blink(game.powers.freeze) : 0.8;
    return 1;
  }

  /** The jetpack on the player's back, with a flame while it pushes. */
  private drawJetpack(game: Game, x: number, y: number): void {
    const back = x - game.player.flipX * 30;
    const ending = game.powers.jetpack < 1;
    this.ctx.globalAlpha = ending ? blink(game.powers.jetpack) : 1;
    this.drawCostume(powerUpCostumes[0]!, back, y + 4, 0, 3, 3);
    if (game.thrusting) {
      const frame = flameCostumes[Math.floor(game.time / 0.08) % 2]!;
      this.drawCostume(frame, back, y - 20, 0, 3, 3);
    }
    this.ctx.globalAlpha = 1;
  }

  /** A bubble around the player while the shield is up. */
  private drawShield(game: Game, x: number, y: number): void {
    const ctx = this.ctx;
    const [cx, cy] = toCanvas(this.view, x, y - 4);
    ctx.save();
    ctx.globalAlpha = 0.7 * (game.powers.shield < 1.5 ? blink(game.powers.shield) : 1);
    ctx.strokeStyle = colors.shield;
    ctx.lineWidth = 3 * this.view.scale;
    ctx.beginPath();
    ctx.arc(cx, cy, 52 * this.view.scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha *= 0.25;
    ctx.fillStyle = colors.shield;
    ctx.fill();
    ctx.restore();
  }

  private drawBackdrop(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * The 2013 stage, filling the stage exactly. Scratch exported it with half a
   * pixel of empty border, so only the picture inside is drawn.
   */
  private drawStage(): void {
    const { x, y, scale } = this.view;
    const width = Math.round(STAGE_WIDTH * scale);
    const height = Math.round(STAGE_HEIGHT * scale);
    let stage = this.stageRaster;
    if (stage?.width !== width || stage.height !== height) {
      const image = this.images.get(this.backdrops.stage);
      if (!image) return;
      stage = document.createElement("canvas");
      stage.width = width;
      stage.height = height;
      const border = -this.backdrops.stage.x;
      stage.getContext("2d")?.drawImage(image, border, border, STAGE_WIDTH, STAGE_HEIGHT, 0, 0, width, height);
      this.stageRaster = stage;
    }
    this.ctx.drawImage(stage, x, y);
  }

  /** The 2013 title, a little smaller than the stage so the room shows around it like a frame. */
  private drawTitle(): void {
    this.drawCostume(this.backdrops.title, TITLE_X, TITLE_Y, 0, TITLE_SIZE, TITLE_SIZE);
  }

  private drawSprite(sprite: Sprite, x: number, y: number): void {
    const size = sprite.size / 100;
    this.drawCostume(sprite.currentCostume, x, y, sprite.rotation, size * sprite.flipX, size);
  }

  private drawCostume(costume: Costume, x: number, y: number, rotation: number, scaleX: number, scaleY: number): void {
    const raster = this.raster(costume, Math.abs(scaleX) * this.view.scale, Math.abs(scaleY) * this.view.scale);
    if (!raster) return;
    const ctx = this.ctx;
    const [px, py] = toCanvas(this.view, x, y);
    ctx.save();
    ctx.translate(Math.round(px), Math.round(py));
    if (rotation) ctx.rotate(rotation);
    ctx.scale(Math.sign(scaleX), 1);
    const sx = Math.abs(scaleX) * this.view.scale;
    const sy = scaleY * this.view.scale;
    ctx.drawImage(
      raster.canvas,
      Math.round((costume.x - costume.centerX) * sx),
      Math.round((costume.y - costume.centerY) * sy),
      Math.round(costume.width * sx),
      Math.round(costume.height * sy),
    );
    ctx.restore();
  }

  /**
   * Costumes drawn once at the size they appear on screen, so the 2013 art
   * stays sharp at any resolution and SVGs aren't redrawn every frame.
   */
  private raster(costume: Costume, scaleX: number, scaleY: number): Raster | null {
    const scale = Math.max(scaleX, scaleY);
    const cached = this.rasters.get(costume);
    if (cached && Math.abs(cached.scale - scale) < 1e-6) return cached;
    const image = this.images.get(costume);
    if (!image) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(costume.width * scaleX));
    canvas.height = Math.max(1, Math.round(costume.height * scaleY));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = costume.smooth;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const raster = { canvas, scale };
    this.rasters.set(costume, raster);
    return raster;
  }

  /** Hearts for health and the time survived, in the top left corner like the 2013 monitors. */
  private drawHud(game: Game): void {
    const ctx = this.ctx;
    const s = this.view.scale;
    ctx.save();
    ctx.translate(this.view.x, this.view.y);
    ctx.scale(s, s);
    const shown = Math.min(game.health, 5);
    for (let i = 0; i < shown; i++) drawHeart(ctx, 12 + i * 26, 12);
    ctx.font = "500 18px 'Noto Sans', sans-serif";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = colors.mortar;
    ctx.fillStyle = colors.orange;
    if (game.health > shown) {
      const text = `×${game.health}`;
      ctx.textAlign = "left";
      ctx.strokeText(text, 12 + shown * 26, 23);
      ctx.fillText(text, 12 + shown * 26, 23);
    }
    // Under the hearts, where the 2013 Time monitor was.
    const time = `Time ${formatTime(game.time)}`;
    ctx.font = "500 20px 'Noto Sans', sans-serif";
    ctx.textAlign = "left";
    ctx.strokeText(time, 12, 48);
    ctx.fillText(time, 12, 48);
    // Power-ups the player has, each with a bar for the time left.
    const active = POWER_UPS.filter((kind) => game.powers[kind] > 0);
    active.forEach((kind, i) => {
      const left = 12 + i * 44;
      ctx.fillStyle = colors.mortar;
      ctx.fillRect(left, 96, 36, 6);
      ctx.fillStyle = colors.orange;
      ctx.fillRect(left + 1, 97, 34 * Math.min(1, game.powers[kind] / POWER_UP_TIME[kind]), 4);
    });
    ctx.restore();
    active.forEach((kind, i) => {
      const costume = powerUpCostumes[POWER_UPS.indexOf(kind)]!;
      this.drawCostume(costume, -240 + 12 + i * 44 + 18, 180 - 78, 0, 2.5, 2.5);
    });
  }
}

/** Full and half see-through in turn, as a warning that something is about to end. */
const blink = (seconds: number) => (Math.floor(seconds / 0.15) % 2 === 0 ? 1 : 0.5);

/** Whole seconds, as m:ss once it reaches a minute. */
export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) return String(whole);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** A pixel art heart, in the same chunky style as the virus and the penguin. */
const HEART = ["0110110", "1221221", "1222221", "0122210", "0012100", "0001000"];

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const pixel = 3;
  for (const [row, line] of HEART.entries()) {
    for (const [column, cell] of [...line].entries()) {
      if (cell === "0") continue;
      ctx.fillStyle = cell === "1" ? colors.mortar : colors.red;
      ctx.fillRect(x + column * pixel, y + row * pixel, pixel, pixel);
    }
  }
}
