// Sprite geometry with the same rules as Scratch 3, so the port moves,
// collides and bounces exactly like the 2013 game.

export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 360;
const FENCE_WIDTH = 15;

/** Opaque pixels of a costume, rasterized at `scale` pixels per costume unit. */
export interface Mask {
  width: number;
  height: number;
  scale: number;
  data: Uint8Array;
}

export interface Costume {
  name: string;
  file: string;
  /** Costume box in costume units: the SVG viewBox, or the bitmap size divided by its resolution. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation center, in the same units as the box. */
  centerX: number;
  centerY: number;
  /** Smooth bitmaps when scaling. Pixel art keeps hard edges. */
  smooth: boolean;
  /** Opaque area in costume units. Defaults to the whole box until a mask is loaded. */
  opaque?: { left: number; top: number; right: number; bottom: number };
  mask?: Mask;
}

export type RotationStyle = "all around" | "left-right" | "don't rotate";

export interface Bounds {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export interface SpriteState {
  x: number;
  y: number;
  direction: number;
  size: number;
  costume: number;
  visible: boolean;
  rotationStyle: RotationStyle;
}

/** Scratch's MathUtil.wrapClamp. */
export function wrapClamp(n: number, min: number, max: number): number {
  const range = max - min + 1;
  return n - Math.floor((n - min) / range) * range;
}

export class Sprite implements SpriteState {
  x: number;
  y: number;
  direction: number;
  size: number;
  costume: number;
  visible: boolean;
  rotationStyle: RotationStyle;

  constructor(
    readonly name: string,
    readonly costumes: Costume[],
    readonly initial: SpriteState,
  ) {
    this.x = initial.x;
    this.y = initial.y;
    this.direction = initial.direction;
    this.size = initial.size;
    this.costume = initial.costume;
    this.visible = initial.visible;
    this.rotationStyle = initial.rotationStyle;
  }

  get currentCostume(): Costume {
    const costume = this.costumes[this.costume];
    if (!costume) throw new Error(`${this.name} has no costume ${this.costume}`);
    return costume;
  }

  setCostume(name: string): void {
    const index = this.costumes.findIndex((costume) => costume.name === name);
    if (index < 0) throw new Error(`${this.name} has no costume ${name}`);
    this.costume = index;
  }

  /** Scratch draws left-right sprites mirrored when they point left. */
  get flipX(): number {
    return this.rotationStyle === "left-right" && this.direction < 0 ? -1 : 1;
  }

  /** Clockwise rotation in radians. Only "all around" sprites turn. */
  get rotation(): number {
    return this.rotationStyle === "all around" ? ((this.direction - 90) * Math.PI) / 180 : 0;
  }

  /** Costume point (y down) to stage point (y up). */
  toStage(u: number, v: number, x = this.x, y = this.y): [number, number] {
    const costume = this.currentCostume;
    const scale = this.size / 100;
    const ax = (u - costume.centerX) * scale * this.flipX;
    const ay = -(v - costume.centerY) * scale;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return [x + ax * cos + ay * sin, y - ax * sin + ay * cos];
  }

  /** Stage point to costume point, the inverse of toStage. */
  toCostume(px: number, py: number): [number, number] {
    const costume = this.currentCostume;
    const scale = this.size / 100;
    const dx = px - this.x;
    const dy = py - this.y;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const ax = dx * cos - dy * sin;
    const ay = dx * sin + dy * cos;
    return [ax / (scale * this.flipX) + costume.centerX, -ay / scale + costume.centerY];
  }

  private boundsOf(left: number, top: number, right: number, bottom: number): Bounds {
    const corners = [
      this.toStage(left, top),
      this.toStage(right, top),
      this.toStage(left, bottom),
      this.toStage(right, bottom),
    ];
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) };
  }

  /** The whole costume box, like Scratch's fast bounds. Used to keep sprites on stage. */
  fastBounds(): Bounds {
    const costume = this.currentCostume;
    return this.boundsOf(costume.x, costume.y, costume.x + costume.width, costume.y + costume.height);
  }

  /** The opaque area, like Scratch's tight bounds. Used for edges and bouncing. */
  bounds(): Bounds {
    const costume = this.currentCostume;
    const opaque = costume.opaque ?? {
      left: costume.x,
      top: costume.y,
      right: costume.x + costume.width,
      bottom: costume.y + costume.height,
    };
    return this.boundsOf(opaque.left, opaque.top, opaque.right, opaque.bottom);
  }

  /** Scratch keeps at least 15 px of a sprite on stage when it moves. */
  keepInFence(newX: number, newY: number): [number, number] {
    const fence = this.fastBounds();
    const inset = Math.floor(Math.min(fence.right - fence.left, fence.top - fence.bottom) / 2);
    const sx = STAGE_WIDTH / 2 - Math.min(FENCE_WIDTH, inset);
    const sy = STAGE_HEIGHT / 2 - Math.min(FENCE_WIDTH, inset);
    const dx = newX - this.x;
    const dy = newY - this.y;
    let x = newX;
    let y = newY;
    if (fence.right + dx < -sx) x = Math.ceil(this.x - (sx + fence.right));
    else if (fence.left + dx > sx) x = Math.floor(this.x + (sx - fence.left));
    if (fence.top + dy < -sy) y = Math.ceil(this.y - (sy + fence.top));
    else if (fence.bottom + dy > sy) y = Math.floor(this.y + (sy - fence.bottom));
    return [x, y];
  }

  setXY(x: number, y: number): void {
    [this.x, this.y] = this.keepInFence(x, y);
  }

  setDirection(direction: number): void {
    if (Number.isFinite(direction)) this.direction = wrapClamp(direction, -179, 180);
  }

  move(steps: number): void {
    const radians = ((90 - this.direction) * Math.PI) / 180;
    this.setXY(this.x + steps * Math.cos(radians), this.y + steps * Math.sin(radians));
  }

  pointTowards(x: number, y: number): void {
    this.setDirection(90 - (Math.atan2(y - this.y, x - this.x) * 180) / Math.PI);
  }

  isTouchingEdge(): boolean {
    const b = this.bounds();
    return (
      b.left < -STAGE_WIDTH / 2 || b.right > STAGE_WIDTH / 2 || b.top > STAGE_HEIGHT / 2 || b.bottom < -STAGE_HEIGHT / 2
    );
  }

  ifOnEdgeBounce(): void {
    const b = this.bounds();
    const distances: [string, number][] = [
      ["left", Math.max(0, STAGE_WIDTH / 2 + b.left)],
      ["top", Math.max(0, STAGE_HEIGHT / 2 - b.top)],
      ["right", Math.max(0, STAGE_WIDTH / 2 - b.right)],
      ["bottom", Math.max(0, STAGE_HEIGHT / 2 + b.bottom)],
    ];
    let nearest = "";
    let min = Infinity;
    for (const [edge, distance] of distances) {
      if (distance < min) {
        min = distance;
        nearest = edge;
      }
    }
    if (min > 0) return;
    const radians = ((90 - this.direction) * Math.PI) / 180;
    let dx = Math.cos(radians);
    let dy = -Math.sin(radians);
    if (nearest === "left") dx = Math.max(0.2, Math.abs(dx));
    else if (nearest === "top") dy = Math.max(0.2, Math.abs(dy));
    else if (nearest === "right") dx = -Math.max(0.2, Math.abs(dx));
    else dy = -Math.max(0.2, Math.abs(dy));
    this.setDirection((Math.atan2(dy, dx) * 180) / Math.PI + 90);
    this.setXY(this.x, this.y);
  }

  /** Whether the costume has an opaque pixel at this stage point. */
  isOpaqueAt(px: number, py: number): boolean {
    const costume = this.currentCostume;
    const [u, v] = this.toCostume(px, py);
    const mask = costume.mask;
    if (!mask) {
      const o = costume.opaque ?? {
        left: costume.x,
        top: costume.y,
        right: costume.x + costume.width,
        bottom: costume.y + costume.height,
      };
      return u >= o.left && u < o.right && v >= o.top && v < o.bottom;
    }
    const i = Math.floor((u - costume.x) * mask.scale);
    const j = Math.floor((v - costume.y) * mask.scale);
    return i >= 0 && j >= 0 && i < mask.width && j < mask.height && mask.data[j * mask.width + i] === 1;
  }

  /** Pixel-perfect touching. Hidden sprites never touch anything, as in Scratch. */
  isTouching(other: Sprite): boolean {
    if (!this.visible || !other.visible) return false;
    const a = this.bounds();
    const b = other.bounds();
    const left = Math.floor(Math.max(a.left, b.left));
    const right = Math.ceil(Math.min(a.right, b.right));
    const bottom = Math.floor(Math.max(a.bottom, b.bottom));
    const top = Math.ceil(Math.min(a.top, b.top));
    if (left > right || bottom > top) return false;
    for (let x = left; x <= right; x++) {
      for (let y = bottom; y <= top; y++) {
        if (this.isOpaqueAt(x, y) && other.isOpaqueAt(x, y)) return true;
      }
    }
    return false;
  }

  snapshot(): SpriteState {
    return {
      x: this.x,
      y: this.y,
      direction: this.direction,
      size: this.size,
      costume: this.costume,
      visible: this.visible,
      rotationStyle: this.rotationStyle,
    };
  }

  reset(): void {
    Object.assign(this, this.initial);
  }
}

/** Builds a mask from RGBA pixels. Records the opaque area too, unless the costume has a measured one. */
export function applyMask(costume: Costume, rgba: Uint8ClampedArray, width: number, height: number, scale: number): void {
  const data = new Uint8Array(width * height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      if ((rgba[(j * width + i) * 4 + 3] ?? 0) > 0) {
        data[j * width + i] = 1;
        if (i < minX) minX = i;
        if (i > maxX) maxX = i;
        if (j < minY) minY = j;
        if (j > maxY) maxY = j;
      }
    }
  }
  costume.mask = { width, height, scale, data };
  if (maxX >= 0 && !costume.opaque) {
    costume.opaque = {
      left: costume.x + minX / scale,
      top: costume.y + minY / scale,
      right: costume.x + (maxX + 1) / scale,
      bottom: costume.y + (maxY + 1) / scale,
    };
  }
}
