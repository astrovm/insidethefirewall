import { STAGE_HEIGHT, STAGE_WIDTH, type Costume, type Sprite } from "./engine/sprite.ts";
import type { World } from "./engine/world.ts";

export type CostumeImages = Map<Costume, CanvasImageSource>;

/** Draws the stage like Scratch: sprites back to front, then the variable monitors. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  /** Device pixels per stage pixel. */
  private scale = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly images: CostumeImages,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, pixelRatio: number): void {
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.width = Math.max(1, Math.round(cssWidth * pixelRatio));
    this.canvas.height = Math.max(1, Math.round(cssHeight * pixelRatio));
    this.scale = this.canvas.width / STAGE_WIDTH;
  }

  /** `between` is how far we are into the next frame, from 0 to 1. */
  draw(world: World, between: number): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.drawCostume(world.project.stage, STAGE_WIDTH / 2, STAGE_HEIGHT / 2, 0, 1, 1);
    for (const name of world.layers) {
      const sprite = world.sprite(name);
      if (!sprite.visible) continue;
      const [x, y] = interpolate(sprite, world.previous.get(name), between);
      this.drawCostume(
        sprite.currentCostume,
        STAGE_WIDTH / 2 + x,
        STAGE_HEIGHT / 2 - y,
        sprite.rotation,
        (sprite.size / 100) * sprite.flipX,
        sprite.size / 100,
      );
    }
    for (const monitor of world.project.monitors) {
      if (world.monitors[monitor.variable]) {
        this.drawMonitor(monitor.label, String(world.vars[monitor.variable]), monitor.x, monitor.y);
      }
    }
  }

  private drawCostume(costume: Costume, x: number, y: number, rotation: number, scaleX: number, scaleY: number): void {
    const image = this.images.get(costume);
    if (!image) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    ctx.scale(scaleX, scaleY);
    ctx.imageSmoothingEnabled = costume.smooth;
    ctx.drawImage(image, costume.x - costume.centerX, costume.y - costume.centerY, costume.width, costume.height);
    ctx.restore();
  }

  /** Same look as the Scratch variable monitor. */
  private drawMonitor(label: string, value: string, x: number, y: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "bold 12px sans-serif";
    const labelWidth = ctx.measureText(label).width;
    ctx.font = "12px sans-serif";
    const valueWidth = Math.max(40, ctx.measureText(value).width + 4);
    const rowHeight = 15;
    const width = 1 + 3 + 5 + labelWidth + 5 + 5 + valueWidth + 5 + 3 + 1;
    const height = 1 + 3 + rowHeight + 3 + 1;
    roundRect(ctx, x + 0.5, y + 0.5, width - 1, height - 1, 4);
    ctx.fillStyle = "hsl(215, 100%, 95%)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textBaseline = "middle";
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#575e75";
    ctx.fillText(label, x + 9, y + 4 + rowHeight / 2);
    const valueX = x + 9 + labelWidth + 10;
    roundRect(ctx, valueX, y + 4, valueWidth, rowHeight, 4);
    ctx.fillStyle = "#ff8c1a";
    ctx.fill();
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(value, valueX + valueWidth / 2, y + 4 + rowHeight / 2);
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * TurboWarp's interpolation: glide smoothly between 30 fps frames, but jump
 * straight to the new spot when a sprite teleports.
 */
export function interpolate(
  sprite: Sprite,
  previous: { x: number; y: number } | undefined,
  between: number,
): [number, number] {
  if (!previous) return [sprite.x, sprite.y];
  const dx = sprite.x - previous.x;
  const dy = sprite.y - previous.y;
  if (Math.abs(dx) <= 0.1 && Math.abs(dy) <= 0.1) return [sprite.x, sprite.y];
  const box = sprite.fastBounds();
  const tolerance = Math.min(240, Math.max(50, 1.5 * (box.right - box.left + (box.top - box.bottom))));
  if (Math.hypot(dx, dy) >= tolerance) return [sprite.x, sprite.y];
  return [previous.x + dx * between, previous.y + dy * between];
}
