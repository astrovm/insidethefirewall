import { STAGE_HEIGHT, STAGE_WIDTH, type Costume, type Sprite } from "../engine/sprite.ts";
import { interpolate, type CostumeImages } from "../render.ts";
import type { Effects } from "./effects.ts";
import { FEET_Y, PICKUP_BLINK, THREAT_WARNING, type Game, type Threat } from "./game.ts";
import { STAGES } from "./progress.ts";

export const colors = {
  green: "#00cc44",
  brick: "#b51000",
  mortar: "#000008",
  title: "#006321",
  orange: "#fe9501",
  red: "#ff0000",
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
    if (game.phase === "playing") {
      if (game.warning > 0) this.drawAim(game.virus, game.target);
      for (const threat of game.threats) if (threat.warning > 0) this.drawWarning(threat);
    }
    for (const sprite of game.layers) {
      if (!sprite.visible) continue;
      const [x, y] = interpolate(sprite, game.previous.get(sprite), between);
      ctx.globalAlpha = game.phase === "playing" ? this.alphaOf(game, sprite) : 1;
      if (ctx.globalAlpha > 0) this.drawSprite(sprite, x, y);
      ctx.globalAlpha = 1;
    }
    this.drawParticles(effects);
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
   * Blinking, as a warning: the player while invincible, the penguin before it
   * goes and the virus before it flies. Calm mode dims them instead.
   */
  private alphaOf(game: Game, sprite: Sprite): number {
    const blink = (seconds: number) => (Math.floor(seconds / 0.15) % 2 === 0 ? 1 : 0.5);
    if (sprite === game.player && game.invincible > 0) return blink(game.invincible);
    if (sprite === game.pickup && game.pickupLeft < PICKUP_BLINK) return blink(game.pickupLeft);
    return 1;
  }

  /** What's coming: an aim line for viruses, an arrow at the wall for things on the floor, a shadow for popups. */
  private drawWarning(threat: Threat): void {
    if (threat.kind === "virus") {
      this.drawAim(threat.sprite, threat.target);
      return;
    }
    const ctx = this.ctx;
    const s = this.view.scale;
    const shown = 1 - threat.warning / THREAT_WARNING;
    ctx.save();
    if (threat.kind === "popup") {
      // A shadow on the floor that grows as the popup gets closer.
      const [x, y] = toCanvas(this.view, threat.sprite.x, FEET_Y);
      const width = 66 * s * (0.4 + 0.6 * shown);
      ctx.globalAlpha = 0.25 + 0.35 * shown;
      ctx.fillStyle = colors.mortar;
      ctx.fillRect(Math.round(x - width / 2), Math.round(y - 3 * s), Math.round(width), Math.round(6 * s));
    } else {
      // A pixel arrow on the side it comes from, pointing in.
      const side = Math.sign(threat.sprite.x);
      const [x, y] = toCanvas(this.view, side * 226, FEET_Y + 14);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = colors.red;
      const pixel = 3 * s;
      for (let column = 0; column < 4; column++) {
        const height = 7 - column * 2;
        const left = x - side * (column - 1.5) * pixel - pixel / 2;
        ctx.fillRect(Math.round(left), Math.round(y - (height * pixel) / 2), Math.round(pixel), Math.round(height * pixel));
      }
    }
    ctx.restore();
  }

  /** A dotted line from a virus to where it's about to fly. */
  private drawAim(from: Sprite, to: { x: number; y: number }): void {
    const ctx = this.ctx;
    const s = this.view.scale;
    const [x1, y1] = toCanvas(this.view, from.x, from.y);
    const [x2, y2] = toCanvas(this.view, to.x, to.y);
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 1) return;
    const step = 9 * s;
    const dot = Math.max(1, Math.round(3 * s));
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = colors.red;
    for (let d = 20 * s; d < length; d += step) {
      const x = x1 + ((x2 - x1) * d) / length;
      const y = y1 + ((y2 - y1) * d) / length;
      ctx.fillRect(Math.round(x - dot / 2), Math.round(y - dot / 2), dot, dot);
    }
    ctx.restore();
  }

  private drawParticles(effects: Effects): void {
    const ctx = this.ctx;
    const s = this.view.scale;
    for (const p of effects.particles) {
      const [x, y] = toCanvas(this.view, p.x, p.y);
      const size = Math.max(1, Math.round(p.size * s));
      ctx.globalAlpha = Math.min(1, (p.life / p.lifetime) * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
    }
    ctx.globalAlpha = 1;
  }

  private drawBackdrop(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** The 2013 stage. */
  private drawStage(): void {
    const { x, y, scale } = this.view;
    this.ctx.fillStyle = colors.green;
    this.ctx.fillRect(x, y, Math.round(STAGE_WIDTH * scale), Math.round(STAGE_HEIGHT * scale));
    this.drawCostume(this.backdrops.stage, 0, 0, 0, 1, 1);
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
  /** "Stage 2: Worms" in the middle of the screen when a stage starts. */
  private drawBanner(game: Game): void {
    const SHOWN = 2.2;
    if (game.stageTime >= SHOWN) return;
    const ctx = this.ctx;
    const s = this.view.scale;
    ctx.save();
    ctx.translate(this.view.x, this.view.y);
    ctx.scale(s, s);
    ctx.globalAlpha = Math.min(1, (SHOWN - game.stageTime) / 0.5, game.stageTime / 0.15);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = colors.mortar;
    ctx.fillStyle = colors.orange;
    ctx.font = "500 18px 'Noto Sans', sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeText(`Stage ${game.stage + 1}`, STAGE_WIDTH / 2, 168);
    ctx.fillText(`Stage ${game.stage + 1}`, STAGE_WIDTH / 2, 168);
    ctx.font = "500 36px 'Noto Sans', sans-serif";
    ctx.lineWidth = 6;
    const name = STAGES[game.stage]?.name ?? "";
    ctx.strokeText(name, STAGE_WIDTH / 2, 200);
    ctx.fillText(name, STAGE_WIDTH / 2, 200);
    ctx.restore();
  }

  private drawHud(game: Game): void {
    this.drawBanner(game);
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
    ctx.restore();
  }
}

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
