import { STAGE_HEIGHT, STAGE_WIDTH, type Costume, type Sprite } from "../engine/sprite.ts";
import { interpolate, type CostumeImages } from "../render.ts";
import type { Game } from "./game.ts";

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

/** The biggest stage that fits, centered. The rest of the screen is the firewall around it. */
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

/** Brick rows of the 2013 floor: 14 px apart with 3 px of mortar. */
const BRICK_ROW = 14;
const BRICK_WIDTH = 36;
const MORTAR = 3;
/** Top of the floor bricks in the stage art. */
const FLOOR_Y = -116;

interface Raster {
  canvas: HTMLCanvasElement;
  /** Device pixels per costume unit. */
  scale: number;
}

/** Draws the remastered game on a canvas that fills the window. */
export class RemasterRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly rasters = new Map<Costume, Raster>();
  private wall: CanvasPattern | null = null;
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
    this.wall = null;
  }

  draw(game: Game, between: number): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if (game.phase === "title") this.drawTitle();
    else if (game.phase === "over") this.drawBackdrop("#000");
    else this.drawFirewall();

    // Sprites can poke out of the stage a little, as in Scratch. Hide that
    // part behind the firewall.
    ctx.save();
    if (game.phase === "playing") {
      ctx.beginPath();
      ctx.rect(this.view.x, 0, Math.round(STAGE_WIDTH * this.view.scale), this.canvas.height);
      ctx.clip();
    }
    for (const sprite of game.layers) {
      if (!sprite.visible) continue;
      const [x, y] = interpolate(sprite, game.previous.get(sprite), between);
      this.drawSprite(sprite, x, y);
    }
    ctx.restore();
    if (game.phase === "playing") this.drawHud(game);

    if (this.fade > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, this.fade)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private drawBackdrop(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** The 2013 title art, stretched over the whole stage. */
  private drawTitle(): void {
    this.drawBackdrop(colors.title);
    const title = this.backdrops.title;
    this.drawCostume(title, 0, 0, 0, STAGE_WIDTH / title.width, STAGE_HEIGHT / title.height);
  }

  /** The 2013 stage, with brick walls around it so it fills any screen. */
  private drawFirewall(): void {
    const ctx = this.ctx;
    const { x, scale } = this.view;
    const width = Math.round(STAGE_WIDTH * scale);
    const [, floor] = toCanvas(this.view, 0, FLOOR_Y);
    const wall = this.wallPattern();
    if (typeof wall !== "string") wall.setTransform(new DOMMatrix().translate(x, Math.round(floor)));
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = colors.green;
    ctx.fillRect(x, 0, width, Math.round(floor));
    this.drawCostume(this.backdrops.stage, 0, 0, 0, 1, 1);
    // Mortar where the side walls meet the room.
    if (x > 0) {
      const line = Math.max(1, Math.round(MORTAR * scale));
      ctx.fillStyle = colors.mortar;
      ctx.fillRect(x - line, 0, line, Math.round(floor));
      ctx.fillRect(x + width, 0, line, Math.round(floor));
    }
  }

  /** A brick pattern in the 2013 floor's colors, with the same slightly wobbly hand-drawn lines. */
  private wallPattern(): CanvasPattern | string {
    if (this.wall) return this.wall;
    const s = this.view.scale;
    const rows = 4;
    const tile = document.createElement("canvas");
    tile.width = Math.max(1, Math.round(BRICK_WIDTH * 2 * s));
    tile.height = Math.max(1, Math.round(BRICK_ROW * rows * s));
    const ctx = tile.getContext("2d");
    if (!ctx) return colors.brick;
    ctx.fillStyle = colors.brick;
    ctx.fillRect(0, 0, tile.width, tile.height);
    ctx.fillStyle = colors.mortar;
    const wobble = [0, 1, -1, 0.5];
    for (let row = 0; row < rows; row++) {
      const top = row * BRICK_ROW;
      ctx.fillRect(0, Math.round(top * s), tile.width, Math.max(1, Math.round(MORTAR * s)));
      const offset = row % 2 === 0 ? 0 : BRICK_WIDTH / 2;
      for (let i = 0; i < 3; i++) {
        const left = offset + i * BRICK_WIDTH + (wobble[(row + i) % wobble.length] ?? 0);
        ctx.fillRect(Math.round(left * s), Math.round(top * s), Math.max(1, Math.round(MORTAR * s)), Math.round(BRICK_ROW * s));
      }
    }
    this.wall = this.ctx.createPattern(tile, "repeat");
    return this.wall ?? colors.brick;
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
