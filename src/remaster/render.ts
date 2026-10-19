import { STAGE_HEIGHT, STAGE_WIDTH, type Costume, type Sprite } from "../engine/sprite.ts";
import { interpolate, type CostumeImages } from "../render.ts";
import { CRITICAL, SHARDS, type Effects } from "./effects.ts";
import { DIVE_ZOOM, ThirdRenderer } from "./third.ts";
import {
  BALL_RADIUS,
  BRICKS,
  BRICKS_RISE,
  brickTop,
  ESCAPE_BURST,
  flameCostumes,
  PADDLE,
  PLAYER_SPEED,
  PORTAL_BOTTOM,
  PORTAL_TOP,
  PORTAL_X,
  PICKUP_BLINK,
  POWER_UP_TIME,
  POWER_UPS,
  powerUpCostumes,
  REPLAY_SPEED,
  replayFrame,
  SCREEN,
  SCREEN_ROOM,
  THIRD_OUT,
  THIRD_TIME,
  type Game,
  type SpriteShot,
} from "./game.ts";

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

/** The replay on the game over screen: a small window in the top right corner, under Menu. */
export const REPLAY_BOX = { left: 318, top: 50, scale: 0.3 } as const;

/** After an escape the camera snaps out from the screen to the whole room in this long. */
export const ESCAPE_ZOOM = 0.35;
/** The white flash on the screen as the player bursts out of it. */
const ESCAPE_FLASH = 0.2;
/** Rooms drawn inside each other on the monitor's screen. */
const SCREEN_DEPTH = 3;

/**
 * How much the camera is zoomed in this long after an escape: at first the
 * screen fills the stage, so the room the player was in stays put, then it
 * snaps back out to the whole room.
 */
export function escapeZoom(seconds: number): number {
  if (seconds >= ESCAPE_ZOOM) return 1;
  const t = Math.max(0, seconds / ESCAPE_ZOOM);
  return (1 / SCREEN_ROOM.scale) ** (1 - t * t * (3 - 2 * t));
}

/**
 * The view zoomed in this much toward the room on the screen. It zooms around
 * the one point that stays put, so at full zoom the room on the screen fills
 * the stage exactly.
 */
export function zoomView(view: View, zoom: number): View {
  const { left, top, scale } = SCREEN_ROOM;
  const fixedX = (STAGE_WIDTH / 2 + left) / (1 - scale);
  const fixedY = (STAGE_HEIGHT / 2 - top) / (1 - scale);
  return {
    x: view.x + fixedX * view.scale * (1 - zoom),
    y: view.y + fixedY * view.scale * (1 - zoom),
    scale: view.scale * zoom,
  };
}

interface Raster {
  canvas: CanvasImageSource;
  /** Device pixels per costume unit. */
  scale: number;
}

/** Draws the remastered game on a canvas that fills the window. */
export class RemasterRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  /** Each costume at up to four sizes: in the game, in the replay and on the monitor's screen. */
  private readonly rasters = new Map<Costume, Raster[]>();
  private stageRasters: HTMLCanvasElement[] = [];
  /** Draw the SVGs straight, for sizes that change every frame. */
  private direct = false;
  private readonly third: ThirdRenderer;
  view: View = { x: 0, y: 0, scale: 1 };
  /** 0 shows the game, 1 is fully black. Used for fades between screens. */
  fade = 0;
  /** The song that just started, and when, in milliseconds. */
  private song = { title: "", at: -Infinity };

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly images: CostumeImages,
    private readonly backdrops: { stage: Costume; title: Costume },
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    this.third = new ThirdRenderer(ctx, images, backdrops.stage);
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
    const shaken = { ...steady, x: steady.x + Math.round(dx * steady.scale), y: steady.y + Math.round(dy * steady.scale) };
    const playing = game.phase === "playing";
    const third = playing ? game.third : null;
    const zoom = third ? (third.time < DIVE_ZOOM ? diveZoom(third.time) : 1) : playing ? escapeZoom(game.escapeTime) : 1;
    this.view = zoom === 1 ? shaken : zoomView(shaken, zoom);
    this.direct = zoom !== 1;
    this.drawBackdrop("#000");
    // Sprites can poke out of the stage a little, as in Scratch. Hide that part.
    ctx.save();
    if (playing) {
      ctx.beginPath();
      ctx.rect(shaken.x, shaken.y, Math.round(STAGE_WIDTH * shaken.scale), Math.round(STAGE_HEIGHT * shaken.scale));
      ctx.clip();
    }
    if (third && third.time >= DIVE_ZOOM) this.third.draw(game, third, this.view);
    else this.drawRoom(game, between, playing);
    if (playing && !third) this.drawShards(effects);
    const white = whiteOut(game);
    if (white > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${white})`;
      ctx.fillRect(shaken.x, shaken.y, STAGE_WIDTH * shaken.scale, STAGE_HEIGHT * shaken.scale);
    }
    ctx.restore();
    this.direct = false;
    if (game.phase === "over") this.drawReplay(game);
    this.view = steady;
    if (game.phase === "playing") this.drawHud(game, effects);

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

  /** The 2D room and everything in it, or the title or game over screen. */
  private drawRoom(game: Game, between: number, playing: boolean): void {
    const ctx = this.ctx;
    if (game.phase !== "over") this.drawStage();
    if (game.phase === "title") this.drawTitle();
    // The red pill: the room is code.
    const matrix = playing ? matrixAmount(game.powers.pill) : 0;
    if (matrix > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${matrix})`;
      ctx.fillRect(this.view.x, this.view.y, STAGE_WIDTH * this.view.scale, STAGE_HEIGHT * this.view.scale);
      this.drawCodeRain(game.time, matrix);
    }

    if (playing && game.powers.portal > 0) this.drawPortals(game.powers.portal);
    // Bursting out of the screen or diving into it, the player is in front of the monitor.
    const bursting = playing && (game.escapeTime <= ESCAPE_BURST || game.third !== null);
    const layers = bursting ? [...game.layers.filter((s) => s !== game.player), game.player] : game.layers;
    for (const sprite of layers) {
      if (!sprite.visible) continue;
      let [x, y] = interpolate(sprite, game.previous.get(sprite), between);
      // Power-ups bob up and down, so they read as things to grab.
      if (sprite === game.powerUp) y += Math.sin(game.time * 5) * 3;
      const grown = sprite.size / sprite.initial.size;
      // Bullet time: the virus leaves a trail of itself.
      if (sprite === game.virus && game.timeScale < 0.99) {
        const radians = (sprite.direction * Math.PI) / 180;
        for (let k = 3; k >= 1; k--) {
          ctx.globalAlpha = 0.18 * (4 - k) * (1 - game.timeScale);
          ctx.filter = matrix > 0.5 ? CODE_RED : "none";
          this.drawSprite(sprite, x - Math.sin(radians) * k * 16, y - Math.cos(radians) * k * 16);
        }
        ctx.filter = "none";
        ctx.globalAlpha = 1;
      }
      // Wrapping around the sides, the player shows on both at once.
      const wraps = playing && sprite === game.player && game.powers.jetpack > 0;
      const copies = wraps ? wrapCopies(x, this.playerReach(game)) : [x];
      const player = playing && sprite === game.player;
      for (const x of copies) {
        if (player && game.powers.cube > 0) this.drawCostume(powerUpCostume("cube"), x - sprite.flipX * 30 * grown, y - 30 * grown, 0, 2.2 * grown, 2.2 * grown);
        // Speed shoes: a blur of the player behind them.
        if (player && game.powers.shoes > 0 && Math.abs(game.vx) > PLAYER_SPEED * 1.05) {
          for (let k = 3; k >= 1; k--) {
            ctx.globalAlpha = 0.12 * (4 - k);
            this.drawSprite(sprite, x - game.vx * k * 0.018, y);
          }
          ctx.globalAlpha = 1;
        }
        if (playing && sprite === game.player && game.powers.jetpack > 0) {
          this.drawJetpack(x, y, sprite.flipX, game.powers.jetpack < 1 ? blink(game.powers.jetpack) : 1, game.flying, game.time, grown);
        }
        ctx.globalAlpha = playing ? this.alphaOf(game, sprite) : 1;
        if (matrix > 0.5) ctx.filter = sprite === game.virus ? CODE_RED : CODE_GREEN;
        if (playing && sprite === game.virus && game.powers.freeze > 0) ctx.filter = "hue-rotate(160deg) saturate(1.5)";
        if (ctx.globalAlpha > 0) this.drawSprite(sprite, x, y);
        ctx.filter = "none";
        ctx.globalAlpha = 1;
        if (playing && sprite === game.player && game.powers.shield > 0) {
          this.drawShield(x, y, 0.7 * (game.powers.shield < 1.5 ? blink(game.powers.shield) : 1), grown);
        }
        if (player && game.powers.gravity > 0) this.drawGravityGun(game, x, y, grown);
      }
      if (playing && sprite === game.monitor && game.third) this.drawPortal(game.third.time);
      if (playing && sprite === game.monitor && game.inside.length > 0) {
        this.drawScreenRoom(game.inside, game.monitor.currentCostume, SCREEN_DEPTH);
        const flash = 0.7 * (1 - game.escapeTime / ESCAPE_FLASH);
        if (flash > 0) this.fillScreen(`rgba(255, 255, 255, ${flash})`);
      }
    }
    if (playing && game.breakout) this.drawBreakout(game);
    if (playing && game.car.visible && game.carHonk > 0) this.drawHonk(Math.sign(game.car.x), game.carHonk, game.car.y);
  }

  /** The gravity gun in the player's hands, and its beam while it holds the virus. */
  private drawGravityGun(game: Game, x: number, y: number, grown: number): void {
    const flip = game.player.flipX;
    const left = game.powers.gravity;
    this.ctx.globalAlpha = left < 1 ? blink(left) : 1;
    // The art points left.
    this.drawCostume(powerUpCostume("gravity"), x + flip * 24 * grown, y - 6 * grown, 0, -flip * 2 * grown, 2 * grown);
    this.ctx.globalAlpha = 1;
    if (game.caught === null) return;
    const ctx = this.ctx;
    const [ax, ay] = toCanvas(this.view, x + flip * 38 * grown, y - 4 * grown);
    const [bx, by] = toCanvas(this.view, game.virus.x, game.virus.y);
    const s = this.view.scale;
    ctx.save();
    ctx.strokeStyle = "#ffb03a";
    ctx.shadowColor = "#ff9900";
    ctx.shadowBlur = 10 * s;
    ctx.lineWidth = 3 * s;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.arc(bx, by, (22 + Math.sin(game.time * 40) * 3) * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** A blue portal on the left wall and an orange one on the right, opening and closing. */
  private drawPortals(left: number): void {
    const ctx = this.ctx;
    const s = this.view.scale;
    const open = Math.min(1, (POWER_UP_TIME.portal - left) / 0.3, left / 0.3);
    const middle = (PORTAL_TOP + PORTAL_BOTTOM) / 2;
    const height = ((PORTAL_TOP - PORTAL_BOTTOM) / 2) * open;
    for (const [side, color, light] of [[-1, "#1f8fff", "#bfe2ff"], [1, "#ff8a00", "#ffe0b0"]] as const) {
      const [x, y] = toCanvas(this.view, side * PORTAL_X, middle);
      ctx.save();
      ctx.globalAlpha = left < 1 ? blink(left) : 1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14 * s;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, 8 * s * open, height * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.ellipse(x, y, 4 * s * open, Math.max(0, height - 6) * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** The bonus round: bricks floating up from the floor, the paddle and the virus as the ball. */
  private drawBreakout(game: Game): void {
    const round = game.breakout!;
    const ctx = this.ctx;
    const s = this.view.scale;
    const rise = Math.min(1, round.time / BRICKS_RISE);
    const eased = rise * rise * (3 - 2 * rise);
    ctx.save();
    round.bricks.forEach((there, i) => {
      if (!there) return;
      const top = -150 + (brickTop(i) + 150) * eased;
      const [x, y] = toCanvas(this.view, BRICKS.left + (i % BRICKS.columns) * BRICKS.width, top);
      ctx.fillStyle = colors.mortar;
      ctx.fillRect(x, y, BRICKS.width * s, BRICKS.height * s);
      ctx.fillStyle = Math.floor(i / BRICKS.columns) % 2 === 0 ? colors.brick : "#d42a10";
      ctx.fillRect(x + 2 * s, y + 2 * s, (BRICKS.width - 4) * s, (BRICKS.height - 4) * s);
    });
    // The paddle, grey with red ends, like Arkanoid's Vaus.
    const [px, py] = toCanvas(this.view, round.paddle - PADDLE.width / 2, PADDLE.y + PADDLE.height / 2);
    const [w, h] = [PADDLE.width * s, PADDLE.height * s];
    ctx.fillStyle = colors.mortar;
    ctx.beginPath();
    ctx.roundRect(px - s, py - s, w + 2 * s, h + 2 * s, h / 2);
    ctx.fill();
    ctx.fillStyle = "#c0c0c0";
    ctx.beginPath();
    ctx.roundRect(px, py, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = colors.red;
    ctx.fillRect(px + h / 2, py, 6 * s, h);
    ctx.fillRect(px + w - h / 2 - 6 * s, py, 6 * s, h);
    ctx.restore();
    const ball = round.ball;
    const size = (BALL_RADIUS * 2) / game.virus.currentCostume.height;
    this.drawCostume(game.virus.currentCostume, ball.x, ball.y, game.time * 8, size, size);
  }

  /** A warning sign on the side the car comes from, blinking while it honks. */
  private drawHonk(side: number, left: number, y: number): void {
    if (Math.floor(left / 0.12) % 2 === 1) return;
    const ctx = this.ctx;
    const s = this.view.scale;
    const [x, cy] = toCanvas(this.view, side * 212, y + 10);
    ctx.save();
    ctx.fillStyle = colors.orange;
    ctx.strokeStyle = colors.mortar;
    ctx.lineWidth = 3 * s;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, cy - 18 * s);
    ctx.lineTo(x + 18 * s, cy + 14 * s);
    ctx.lineTo(x - 18 * s, cy + 14 * s);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = colors.mortar;
    ctx.font = `700 ${20 * s}px 'Noto Sans', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x, cy + 3 * s);
    ctx.restore();
  }

  /** Shows the song's title for a few seconds. */
  showSong(title: string): void {
    this.song = { title, at: performance.now() };
  }

  /** Ice pieces of a broken virus. */
  private drawShards(effects: Effects): void {
    if (effects.shards.length === 0) return;
    const ctx = this.ctx;
    const fade = Math.max(0, 1 - effects.shardTime / SHARDS);
    ctx.save();
    for (const [i, shard] of effects.shards.entries()) {
      const [x, y] = toCanvas(this.view, shard.x, shard.y);
      const size = shard.size * this.view.scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(shard.spin * effects.shardTime);
      ctx.globalAlpha = fade;
      ctx.fillStyle = effects.shardColors[i % 3]!;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.restore();
  }

  /** Blue electricity crackling around the screen as the player dives through it. */
  private drawPortal(time: number): void {
    const ctx = this.ctx;
    const [left, top] = toCanvas(this.view, SCREEN.left, SCREEN.top);
    const [width, height] = [SCREEN.width * this.view.scale, SCREEN.height * this.view.scale];
    const flicker = Math.floor(time * 30);
    ctx.save();
    ctx.strokeStyle = "#8fd8ff";
    ctx.shadowColor = "#3aa0ff";
    ctx.shadowBlur = 10 * this.view.scale;
    ctx.lineWidth = Math.max(1, 1.5 * this.view.scale);
    ctx.beginPath();
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const along = (i / steps) * 2 * (width + height);
      const jitter = ((hash(flicker * 131 + i) % 100) / 100 - 0.5) * 6 * this.view.scale;
      let [x, y] = [left, top];
      if (along < width) [x, y] = [left + along, top + jitter];
      else if (along < width + height) [x, y] = [left + width + jitter, top + along - width];
      else if (along < 2 * width + height) [x, y] = [left + width - (along - width - height), top + height + jitter];
      else [x, y] = [left + jitter, top + height - (along - 2 * width - height)];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Green code falling down the stage, and the floor made of it. */
  private drawCodeRain(time: number, alpha: number): void {
    const ctx = this.ctx;
    const { x, y, scale } = this.view;
    const columns = STAGE_WIDTH / CODE_CELL;
    const rows = STAGE_HEIGHT / CODE_CELL;
    ctx.save();
    ctx.font = `${Math.round(CODE_CELL * scale)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const glyph = (column: number, row: number) => CODE_GLYPHS[(hash(column * 977 + row) + Math.floor(time * 5)) % CODE_GLYPHS.length]!;
    const put = (column: number, row: number, text: string) =>
      ctx.fillText(text, x + (column + 0.5) * CODE_CELL * scale, y + row * CODE_CELL * scale);
    for (let column = 0; column < columns; column++) {
      const seed = hash(column);
      const speed = 6 + (seed % 9);
      const length = 8 + (seed % 12);
      const head = Math.floor((time * speed + (seed % 97)) % (rows + length + 12));
      for (let k = 0; k < length; k++) {
        const row = head - k;
        if (row < 0 || row >= rows) continue;
        ctx.globalAlpha = alpha * (k === 0 ? 1 : 0.85 * (1 - k / length));
        ctx.fillStyle = k === 0 ? "#d8ffd8" : "#00ff41";
        put(column, row, glyph(column, row));
      }
    }
    // The floor, as a wall of code.
    ctx.fillStyle = "#00b32d";
    for (let row = Math.floor(CODE_FLOOR / CODE_CELL); row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        ctx.globalAlpha = alpha * (0.35 + 0.4 * ((hash(column * 31 + row * 7 + Math.floor(time * 3)) % 100) / 100));
        put(column, row, glyph(column, row));
      }
    }
    ctx.restore();
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

  /** How far the player with a jetpack reaches each way from its middle, with the shield too if it has one. */
  private playerReach(game: Game): number {
    const bounds = game.player.bounds();
    const grown = game.player.size / game.player.initial.size;
    return Math.max((bounds.right - bounds.left) / 2, (game.powers.shield > 0 ? 52 : 48) * grown);
  }

  /** The jetpack on the player's back, with a flame while it pushes. `grown` is the player's size, 1 as usual. */
  private drawJetpack(x: number, y: number, flipX: number, alpha: number, flying: boolean, time: number, grown = 1): void {
    const back = x - flipX * 30 * grown;
    this.ctx.globalAlpha = alpha;
    this.drawCostume(powerUpCostumes[0]!, back, y + 4 * grown, 0, 3 * grown, 3 * grown);
    if (flying) {
      const frame = flameCostumes[Math.floor(time / 0.08) % 2]!;
      this.drawCostume(frame, back, y - 20 * grown, 0, 3 * grown, 3 * grown);
    }
    this.ctx.globalAlpha = 1;
  }

  /** A bubble around the player while the shield is up. */
  private drawShield(x: number, y: number, alpha: number, grown = 1): void {
    const ctx = this.ctx;
    const [cx, cy] = toCanvas(this.view, x, y - 4 * grown);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colors.shield;
    ctx.lineWidth = 3 * grown * this.view.scale;
    ctx.beginPath();
    ctx.arc(cx, cy, 52 * grown * this.view.scale, 0, Math.PI * 2);
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
    const border = -this.backdrops.stage.x;
    if (this.direct) {
      const image = this.images.get(this.backdrops.stage);
      if (image) this.ctx.drawImage(image, border, border, STAGE_WIDTH, STAGE_HEIGHT, x, y, STAGE_WIDTH * scale, STAGE_HEIGHT * scale);
      return;
    }
    let stage = this.stageRasters.find((r) => r.width === width && r.height === height);
    if (!stage) {
      const image = this.images.get(this.backdrops.stage);
      if (!image) return;
      stage = document.createElement("canvas");
      stage.width = width;
      stage.height = height;
      stage.getContext("2d")?.drawImage(image, border, border, STAGE_WIDTH, STAGE_HEIGHT, 0, 0, width, height);
      this.stageRasters = [stage, ...this.stageRasters].slice(0, 4);
    }
    this.ctx.drawImage(stage, x, y);
  }

  /**
   * The room the player escaped from, small on the monitor's screen, with its
   * own monitor showing it again. The screen is wider than the room, so the
   * room carries on at the sides.
   */
  private drawScreenRoom(shots: SpriteShot[], monitor: Costume, depth: number): void {
    const ctx = this.ctx;
    const outer = this.view;
    ctx.save();
    this.clipScreen();
    const scale = outer.scale * SCREEN_ROOM.scale;
    const [x, y] = toCanvas(outer, SCREEN_ROOM.left, SCREEN_ROOM.top);
    // The sides overlap the middle by a pixel, so no seam shows between them.
    for (const side of [-1, 1, 0]) {
      this.view = { x: x + side * (STAGE_WIDTH * scale - 1), y, scale };
      this.drawStage();
    }
    this.view = { x, y, scale };
    for (const shot of shots) {
      const size = shot.size / 100;
      this.drawCostume(shot.costume, shot.x, shot.y, shot.rotation, size * shot.flipX, size);
      if (shot.costume === monitor && depth > 1) this.drawScreenRoom(shots, monitor, depth - 1);
    }
    ctx.restore();
    this.view = outer;
  }

  private clipScreen(): void {
    const [left, top] = toCanvas(this.view, SCREEN.left, SCREEN.top);
    this.ctx.beginPath();
    this.ctx.rect(left, top, SCREEN.width * this.view.scale, SCREEN.height * this.view.scale);
    this.ctx.clip();
  }

  private fillScreen(color: string): void {
    const [left, top] = toCanvas(this.view, SCREEN.left, SCREEN.top);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(left, top, SCREEN.width * this.view.scale, SCREEN.height * this.view.scale);
  }

  /**
   * The last seconds of the run, slowed down, in a small window on the game
   * over screen, so the player sees what hit them.
   */
  private drawReplay(game: Game): void {
    const frame = replayFrame(game.replay, game.overTime);
    if (!frame) return;
    const ctx = this.ctx;
    const outer = this.view;
    const [left, top] = toCanvas(outer, REPLAY_BOX.left - STAGE_WIDTH / 2, STAGE_HEIGHT / 2 - REPLAY_BOX.top);
    const scale = outer.scale * REPLAY_BOX.scale;
    const width = Math.round(STAGE_WIDTH * scale);
    const height = Math.round(STAGE_HEIGHT * scale);
    this.view = { x: Math.round(left), y: Math.round(top), scale };
    ctx.save();
    ctx.fillStyle = colors.orange;
    const border = Math.max(1, Math.round(2 * outer.scale));
    ctx.fillRect(this.view.x - border, this.view.y - border, width + 2 * border, height + 2 * border);
    ctx.beginPath();
    ctx.rect(this.view.x, this.view.y, width, height);
    ctx.clip();
    this.drawStage();
    frame.sprites.forEach((shot, i) => {
      const player = i === frame.player;
      const grown = shot.size / game.player.initial.size;
      if (player && frame.jetpack) this.drawJetpack(shot.x, shot.y, shot.flipX, 1, frame.flying, game.overTime * REPLAY_SPEED, grown);
      const size = shot.size / 100;
      this.drawCostume(shot.costume, shot.x, shot.y, shot.rotation, size * shot.flipX, size);
      if (player && frame.shield) this.drawShield(shot.x, shot.y, 0.7, grown);
    });
    ctx.restore();
    this.view = outer;
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
    if (this.direct) ctx.imageSmoothingEnabled = costume.smooth;
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
    if (this.direct) {
      const image = this.images.get(costume);
      return image ? { canvas: image, scale } : null;
    }
    const sizes = this.rasters.get(costume) ?? [];
    const cached = sizes.find((r) => Math.abs(r.scale - scale) < 1e-6);
    if (cached) return cached;
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
    this.rasters.set(costume, [raster, ...sizes].slice(0, 4));
    return raster;
  }

  /** Hearts for health and the time survived, in the top left corner like the 2013 monitors. */
  private drawHud(game: Game, effects: Effects): void {
    const ctx = this.ctx;
    const s = this.view.scale;
    ctx.save();
    ctx.translate(this.view.x, this.view.y);
    ctx.scale(s, s);
    for (let i = 0; i < game.health; i++) drawHeart(ctx, 12 + i * 26, 12);
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = colors.mortar;
    ctx.fillStyle = colors.orange;
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
    // The HEV suit's warning, blinking, like Half-Life.
    if (effects.critical > 0 && Math.floor((CRITICAL - effects.critical) / 0.25) % 2 === 0) {
      const warning = "⚠ VITAL SIGNS CRITICAL";
      ctx.font = "700 14px 'Noto Sans', sans-serif";
      ctx.strokeText(warning, 12, 122);
      ctx.fillText(warning, 12, 122);
    }
    // The song that just started: small, at the top over the monitor, sliding down, then fading out.
    const age = (performance.now() - this.song.at) / 1000;
    if (age < SONG_SHOWN) {
      const slide = Math.min(1, age / 0.3);
      ctx.globalAlpha = Math.min(1, (SONG_SHOWN - age) / 0.6);
      ctx.font = "500 8px 'Noto Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 2.5;
      ctx.fillStyle = "#ffffff";
      const y = 8 - (1 - slide * (2 - slide)) * 16;
      ctx.strokeText(`♪ ${this.song.title}`, STAGE_WIDTH / 2, y);
      ctx.fillText(`♪ ${this.song.title}`, STAGE_WIDTH / 2, y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    active.forEach((kind, i) => {
      const costume = powerUpCostumes[POWER_UPS.indexOf(kind)]!;
      this.drawCostume(costume, -240 + 12 + i * 44 + 18, 180 - 78, 0, 2.5, 2.5);
    });
  }
}

/** Seconds a new song's title stays on screen. */
const SONG_SHOWN = 4;

const powerUpCostume = (kind: (typeof POWER_UPS)[number]) => powerUpCostumes[POWER_UPS.indexOf(kind)]!;

/** Where to draw the player, `reach` wide each way: once, or twice while it's partly off a side and wraps around to the other. */
export function wrapCopies(x: number, reach: number): number[] {
  if (x + reach > STAGE_WIDTH / 2) return [x, x - STAGE_WIDTH];
  if (x - reach < -STAGE_WIDTH / 2) return [x, x + STAGE_WIDTH];
  return [x];
}

/** Code rain: the size of a glyph, in stage pixels, where the floor starts, and the glyphs. */
const CODE_CELL = 12;
const CODE_FLOOR = 296;
const CODE_GLYPHS = [..."ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:=*+<>|"];
/** Sprites as green code, and the virus as a red agent. */
const CODE_GREEN = "grayscale(1) sepia(1) hue-rotate(70deg) saturate(6) brightness(1.1)";
const CODE_RED = "grayscale(1) sepia(1) hue-rotate(-40deg) saturate(8)";

/** How much the room is code with this much red pill left: it fades in and out. */
export function matrixAmount(left: number): number {
  if (left <= 0) return 0;
  return Math.max(0, Math.min(1, (POWER_UP_TIME.pill - left) / 0.4, left / 0.5));
}

/** Diving into the screen: the camera zooms in until the screen fills the stage. */
export function diveZoom(seconds: number): number {
  const t = Math.min(1, Math.max(0, seconds / DIVE_ZOOM));
  return (1 / SCREEN_ROOM.scale) ** (t * t * (3 - 2 * t));
}

/** White over the stage when going into and out of the 3D world. */
export function whiteOut(game: Game): number {
  const third = game.phase === "playing" ? game.third : null;
  if (!third) return game.phase === "playing" ? Math.max(0, 1 - game.sinceThird / 0.3) : 0;
  const t = third.time;
  if (t < DIVE_ZOOM) return Math.max(0, (t - (DIVE_ZOOM - 0.2)) / 0.2);
  if (t < DIVE_ZOOM + 0.25) return 1 - (t - DIVE_ZOOM) / 0.25;
  const end = THIRD_TIME + THIRD_OUT;
  return Math.max(0, (t - (end - 0.2)) / 0.2);
}

/** A well mixed whole number from another, for the code rain. */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
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
