// The 3D world inside the monitor, like Homer³ in The Simpsons: a green neon
// grid under a starry black sky, solid shapes, floating equations and the
// X Y Z signpost. The player becomes a blocky 3D body in their pixel art's
// colors that walks and turns, and the virus a chunky figure built from its
// pixel art. Homer's pink sedan from The Simpsons: Hit & Run is parked there,
// to drive. Drawn on the 2D canvas with a small software 3D
// renderer: shapes are flat-shaded faces, sorted back to front.

import { STAGE_HEIGHT, STAGE_WIDTH, type Costume } from "../engine/sprite.ts";
import type { CostumeImages } from "../render.ts";
import {
  THIRD_IN,
  THIRD_OUT,
  THIRD_TIME,
  type Game,
  type ThirdDimension,
} from "./game.ts";
import type { View } from "./render.ts";
import { SEDAN_COLORS, SEDAN_CORNERS, SEDAN_TRIANGLES } from "./sedan.ts";

/** Diving into the screen: the camera zooms in this long, then the player falls down the grid tunnel. */
export const DIVE_ZOOM = 0.7;
/** The black hole opens under the player this long before the world ends. */
const BLACK_HOLE = 1.2;

type Vec = [number, number, number];
type Rgb = [number, number, number];

interface Face {
  corners: Vec[];
  normal: Vec;
  color: Rgb;
}

/** Something to draw, at a distance from the camera, so far things go first. */
interface Thing {
  depth: number;
  draw: () => void;
}

/** A pixel art costume as a 3D figure: each pixel a block, `depth` blocks deep. In costume units, standing on y 0. */
interface Figure {
  faces: Face[];
}

const LIGHT = normalize([-0.45, 0.8, -0.4]);

/** The player's colors, from their pixel art. */
const HAIR: Rgb = [45, 8, 8];
const SKIN: Rgb = [255, 156, 156];
const HOODIE: Rgb = [0, 66, 255];
const STRAP: Rgb = [57, 57, 57];
const PANTS: Rgb = [0, 24, 99];
const SHOES: Rgb = [20, 20, 28];
const WHITE: Rgb = [255, 255, 255];
const GREEN = "#19ff3c";

function normalize([x, y, z]: Vec): Vec {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

const shade = ([r, g, b]: Rgb, light: number): string =>
  `rgb(${Math.round(r * light)}, ${Math.round(g * light)}, ${Math.round(b * light)})`;

/** Where the camera is and where it looks, and the stage on the canvas. */
class Camera {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  private readonly cosYaw: number;
  private readonly sinYaw: number;
  private readonly cosPitch: number;
  private readonly sinPitch: number;

  constructor(
    readonly view: View,
    target: Vec,
    distance: number,
    yaw: number,
    pitch: number,
    readonly focal: number,
  ) {
    [this.cosYaw, this.sinYaw, this.cosPitch, this.sinPitch] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
    this.x = target[0] - this.sinYaw * this.cosPitch * distance;
    this.y = target[1] + this.sinPitch * distance;
    this.z = target[2] - this.cosYaw * this.cosPitch * distance;
  }

  /** World point to camera space: x right, y up, z ahead. */
  toCamera([x, y, z]: Vec): Vec {
    const [dx, dy, dz] = [x - this.x, y - this.y, z - this.z];
    const x1 = dx * this.cosYaw - dz * this.sinYaw;
    const z1 = dx * this.sinYaw + dz * this.cosYaw;
    return [x1, dy * this.cosPitch + z1 * this.sinPitch, -dy * this.sinPitch + z1 * this.cosPitch];
  }

  /** Camera space point to canvas point. */
  toCanvas([x, y, z]: Vec): [number, number] {
    const k = this.focal / z;
    const { view } = this;
    return [view.x + (STAGE_WIDTH / 2 + x * k) * view.scale, view.y + (STAGE_HEIGHT / 2 - y * k) * view.scale];
  }

  /** How many canvas pixels a world unit is, this far ahead. */
  pixels(z: number): number {
    return (this.focal / z) * this.view.scale;
  }
}

const NEAR = 12;
/** The floor's squares, and how far from the camera they're drawn. */
const GRID = 50;
const GRID_REACH = 1500;

export class ThirdRenderer {
  private readonly figures = new Map<Costume, Figure>();
  /** Where the camera looks, catching up with the player. */
  private follow: { third: ThirdDimension; time: number; x: number; z: number; yaw: number } | null = null;
  private readonly stars = Array.from({ length: 90 }, (_, i) => [hash01(i * 3), hash01(i * 3 + 1) * 0.55, hash01(i * 3 + 2)] as const);

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly images: CostumeImages,
    private readonly stage: Costume,
  ) {}

  draw(game: Game, third: ThirdDimension, view: View): void {
    if (third.time < THIRD_IN) this.drawTunnel(game, third.time - DIVE_ZOOM, view);
    else this.drawWorld(game, third, view);
  }

  /** Falling down a tube of green grid, spinning, like Homer³'s ending. */
  private drawTunnel(game: Game, t: number, view: View): void {
    const ctx = this.ctx;
    const { x: left, y: top, scale } = view;
    ctx.fillStyle = "#000";
    ctx.fillRect(left, top, STAGE_WIDTH * scale, STAGE_HEIGHT * scale);
    const cx = left + (STAGE_WIDTH / 2 + Math.sin(t * 5) * 18) * scale;
    const cy = top + (STAGE_HEIGHT / 2 + Math.cos(t * 4) * 12) * scale;
    ctx.save();
    ctx.strokeStyle = GREEN;
    ctx.shadowColor = GREEN;
    ctx.shadowBlur = 8 * scale;
    // Rings rushing past, and lines along the tube, turning.
    for (let i = 0; i < 14; i++) {
      const depth = ((i * 60 - t * 700) % 840 + 840) % 840 + 30;
      const radius = (220 * 150) / depth;
      ctx.globalAlpha = Math.min(1, depth / 200) * Math.min(1, (840 - depth) / 300 + 0.2);
      ctx.lineWidth = Math.max(1, (600 / depth) * scale);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.beginPath();
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + t * 1.5;
      ctx.moveTo(cx + Math.cos(angle) * 8 * scale, cy + Math.sin(angle) * 8 * scale);
      ctx.lineTo(cx + Math.cos(angle) * 700 * scale, cy + Math.sin(angle) * 700 * scale);
    }
    ctx.stroke();
    ctx.restore();
    // The player tumbles down the middle, smaller and smaller.
    const fall = Math.min(1, t / (THIRD_IN - DIVE_ZOOM));
    const camera = new Camera(view, [0, 0, 0], 300, 0, 0, 360);
    const things: Thing[] = [];
    const offset = (1 - fall) * 60;
    this.addBody(things, camera, game, [-offset + Math.sin(t * 5) * 15, offset * 0.7 - 43, -150 + 450 * fall], {
      facing: t * 5,
      roll: t * 7,
      shrink: 1,
      stride: 0,
      swing: 1,
    });
    for (const thing of things.sort((a, b) => b.depth - a.depth)) thing.draw();
  }

  private drawWorld(game: Game, third: ThirdDimension, view: View): void {
    const ctx = this.ctx;
    const { x: left, y: top, scale } = view;
    const t = third.time - THIRD_IN;
    const p = third.player;
    const car = third.car;
    // The camera catches up with the player, from behind and above. Driving, it
    // swings round behind the car and looks ahead of it.
    if (this.follow?.third !== third) this.follow = { third, time: third.time, x: p.x, z: p.z, yaw: 0 };
    const follow = this.follow;
    const elapsed = Math.max(0, third.time - follow.time);
    const catchUp = 1 - Math.exp(-elapsed * (car.driving ? 8 : 5));
    follow.x += (p.x - follow.x) * catchUp;
    follow.z += (p.z - follow.z) * catchUp;
    const wantedYaw = car.driving ? car.heading : 0;
    const turn = wantedYaw - follow.yaw;
    follow.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * (1 - Math.exp(-elapsed * 4));
    follow.time = third.time;
    // It swoops down from high above at the start.
    const swoop = ease(Math.min(1, t / 1.4));
    const yaw = lerp(1.3, follow.yaw, swoop);
    const target: Vec = car.driving
      ? [follow.x + Math.sin(follow.yaw) * 70, 30, follow.z + Math.cos(follow.yaw) * 70]
      : [follow.x, 38, follow.z + 70];
    const camera = new Camera(view, target, lerp(1300, car.driving ? 320 : 360, swoop), yaw, lerp(1.05, car.driving ? 0.32 : 0.4, swoop), 360);

    // The sky: black, a little blue near the horizon, with stars.
    ctx.fillStyle = "#000";
    ctx.fillRect(left, top, STAGE_WIDTH * scale, STAGE_HEIGHT * scale);
    const horizon = camera.toCamera([camera.x + Math.sin(yaw) * 1e5, 0, camera.z + Math.cos(yaw) * 1e5]);
    const horizonY = horizon[2] > 0 ? camera.toCanvas(horizon)[1] : top;
    const glow = ctx.createLinearGradient(0, horizonY - 90 * scale, 0, horizonY + 10 * scale);
    glow.addColorStop(0, "rgba(20, 30, 90, 0)");
    glow.addColorStop(1, "rgba(40, 50, 140, 0.55)");
    ctx.fillStyle = glow;
    ctx.fillRect(left, horizonY - 90 * scale, STAGE_WIDTH * scale, 100 * scale);
    ctx.fillStyle = "#fff";
    for (const [sx, sy, bright] of this.stars) {
      const x = left + ((sx * 1.6 - camera.toCamera([0, 0, 1e4])[0] / 4e4 + 2) % 1) * STAGE_WIDTH * scale;
      const y = top + sy * (horizonY - top);
      ctx.globalAlpha = 0.3 + 0.7 * bright;
      ctx.fillRect(x, y, Math.max(1, scale * (bright > 0.85 ? 2 : 1)), Math.max(1, scale * (bright > 0.85 ? 2 : 1)));
    }
    ctx.globalAlpha = 1;

    this.drawGrid(camera, horizonY);

    // Everything standing in the world, far things first.
    const things: Thing[] = [];
    const mesh = (faces: Face[]) => this.addMesh(things, camera, faces);
    mesh(box([-340, 45, 660], [90, 90, 90], [60, 90, 220], t * 0.3));
    mesh(cone([300, 0, 780], 46, 120, [70, 100, 230]));
    mesh(cylinder([-110, 0, 920], 52, 70, [210, 100, 30]));
    mesh(box([330, 150 + Math.sin(t * 2) * 10, 430], [22, 22, 22], [255, 210, 0], t * 2));
    this.addSphere(things, camera, [270, 26, 300], 26, [230, 30, 20]);
    this.addSphere(things, camera, [130, 230, 1050], 75, [60, 120, 200], true);
    this.addSignpost(things, camera, [-370, 0, 520]);
    this.addText(things, camera, "1782¹² + 1841¹² = 1922¹²", [-170, 150, 820], 30, "#c8b4e6");
    this.addText(things, camera, "P = NP", [360, 70, 560], 46, "#66ddee");
    this.addCard(things, camera);

    const v = third.virus;
    const end = third.time - THIRD_TIME;
    const hole = Math.max(0, Math.min(1, (third.time - (THIRD_TIME - BLACK_HOLE)) / BLACK_HOLE));
    if (hole > 0) this.addBlackHole(things, camera, [p.x, 0, p.z], hole, t);
    // Sucked into the black hole at the end: spinning, shrinking and sinking.
    const sucked = Math.max(0, Math.min(1, end / THIRD_OUT));
    const playerAlpha = invincibleBlink(game);
    // Homer's car, parked or driven, sucked in with the player at the end.
    if (sucked < 1) {
      const sink = car.driving ? sucked : 0;
      this.addShadow(things, camera, [car.x, 0, car.z], 40 * (1 - sink));
      if (!car.driving || playerAlpha === 1) {
        this.addMesh(things, camera, placeFaces(CAR, [car.x, -sink * 60, car.z], car.heading + sink * 14, 1 - sink));
      }
    }
    // Blinks by hiding: a see-through body would show its insides. In the car, it's inside.
    if (sucked < 1 && playerAlpha === 1 && !car.driving) {
      this.addShadow(things, camera, [p.x, 0, p.z], 22 * (1 - sucked));
      this.addBody(things, camera, game, [p.x, -sucked * 60, p.z], {
        facing: p.facing + sucked * 14,
        roll: 0,
        shrink: 1 - sucked,
        stride: p.step,
        swing: Math.min(1, Math.hypot(p.vx, p.vz) / 150),
      });
    }
    if (end < 0) {
      this.addShadow(things, camera, [v.x, 0, v.z], 18);
      const virusSize = game.virus.size / 100;
      const blinking = v.warning > 0 && Math.floor(v.warning / 0.08) % 2 === 1;
      this.addFigure(things, camera, game.virus.currentCostume, virusSize, [v.x, v.y - (game.virus.currentCostume.height * virusSize) / 2, v.z], {
        flip: v.dx < 0 ? -1 : 1,
        spin: t * 2.5,
        shrink: 1,
        depth: 12,
        alpha: blinking ? 0.3 : 1,
        frozen: game.powers.freeze > 0,
      });
    }
    for (const thing of things.sort((a, b) => b.depth - a.depth)) thing.draw();
  }

  /** The glowing floor grid, fading into the dark, with the edge of where the player can go. */
  private drawGrid(camera: Camera, horizonY: number): void {
    const ctx = this.ctx;
    const { view } = camera;
    ctx.save();
    ctx.strokeStyle = GREEN;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(1, 1.2 * view.scale);
    ctx.beginPath();
    const segment = (a: Vec, b: Vec) => {
      let [p, q] = [camera.toCamera(a), camera.toCamera(b)];
      if (p[2] < NEAR && q[2] < NEAR) return;
      // Cut the part behind the camera.
      if (p[2] < NEAR) p = cut(p, q);
      else if (q[2] < NEAR) q = cut(q, p);
      const [px, py] = camera.toCanvas(p);
      const [qx, qy] = camera.toCanvas(q);
      ctx.moveTo(px, py);
      ctx.lineTo(qx, qy);
    };
    // The floor goes on forever: the lines around the camera, out to the fog.
    const [cx, cz] = [Math.round(camera.x / GRID) * GRID, Math.round(camera.z / GRID) * GRID];
    for (let d = -GRID_REACH; d <= GRID_REACH; d += GRID) {
      segment([cx + d, 0, cz - GRID_REACH], [cx + d, 0, cz + GRID_REACH]);
      segment([cx - GRID_REACH, 0, cz + d], [cx + GRID_REACH, 0, cz + d]);
    }
    ctx.stroke();
    ctx.restore();
    // Fog: the grid fades out toward the horizon.
    const fog = ctx.createLinearGradient(0, horizonY, 0, horizonY + 70 * view.scale);
    fog.addColorStop(0, "rgba(0, 0, 0, 1)");
    fog.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = fog;
    ctx.fillRect(view.x, horizonY - 1, STAGE_WIDTH * view.scale, 70 * view.scale + 1);
  }

  /** Flat-shaded faces, the ones facing the camera, back to front. */
  private addMesh(things: Thing[], camera: Camera, faces: Face[], alpha = 1, filter = "none"): void {
    if (faces.length === 0) return;
    const visible: { depth: number; points: [number, number][]; fill: string }[] = [];
    let total = 0;
    for (const face of faces) {
      const center = face.corners.reduce<Vec>((sum, c) => [sum[0] + c[0], sum[1] + c[1], sum[2] + c[2]], [0, 0, 0]).map((v) => v / face.corners.length) as Vec;
      const towards: Vec = [camera.x - center[0], camera.y - center[1], camera.z - center[2]];
      if (dot(face.normal, towards) <= 0) continue;
      const corners = face.corners.map((c) => camera.toCamera(c));
      if (corners.some((c) => c[2] < NEAR)) continue;
      const depth = camera.toCamera(center)[2];
      total += depth;
      const light = 0.35 + 0.65 * Math.max(0, dot(face.normal, LIGHT));
      visible.push({ depth, points: corners.map((c) => camera.toCanvas(c)), fill: shade(face.color, light) });
    }
    if (visible.length === 0) return;
    const ctx = this.ctx;
    things.push({
      depth: total / visible.length,
      draw: () => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.filter = filter;
        ctx.lineWidth = 1;
        ctx.lineJoin = "round";
        for (const face of visible.sort((a, b) => b.depth - a.depth)) {
          ctx.beginPath();
          for (const [i, [x, y]] of face.points.entries()) (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
          ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle = face.fill;
          ctx.fill();
          // Seals the hairline gaps between faces.
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  }

  /**
   * The player as a blocky 3D body, standing at `at`: legs and arms swing
   * with `stride`, as much as `swing` says, and it turns to `facing`.
   * `roll` tips it over, for tumbling down the tunnel.
   */
  private addBody(
    things: Thing[],
    camera: Camera,
    game: Game,
    at: Vec,
    options: { facing: number; roll: number; shrink: number; stride: number; swing: number },
  ): void {
    const s = (game.player.size / 100) * options.shrink;
    const swing = Math.sin(options.stride / 11) * 0.75 * options.swing;
    // A little bounce with each step.
    const bob = Math.abs(Math.cos(options.stride / 11)) * 0.8 * options.swing;
    const faces: Face[] = [];
    // A box from `low` to `high`, in pixels of the art, standing on y 0 and facing +z, swung around `pivot`.
    const part = (low: Vec, high: Vec, color: Rgb, pivot?: Vec, angle = 0) => {
      const center: Vec = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2];
      for (const face of box(center, [high[0] - low[0], high[1] - low[1], high[2] - low[2]], color, 0)) {
        faces.push(pivot ? { color, normal: pitch(face.normal, [0, 0, 0], angle), corners: face.corners.map((c) => pitch(c, pivot, angle)) } : face);
      }
    };
    for (const side of [-1, 1]) {
      const legSwing = swing * side;
      const hip: Vec = [side * 3.2, 13, 0];
      part([side * 3.2 - 2.8, 3, -3], [side * 3.2 + 2.8, 13, 3], PANTS, hip, legSwing);
      part([side * 3.2 - 3, 0, -3.5], [side * 3.2 + 3, 3, 5], SHOES, hip, legSwing);
      const shoulder: Vec = [side * 9.5, 29, 0];
      part([side * 9.5 - 2.5, 16, -2.5], [side * 9.5 + 2.5, 30, 2.5], HOODIE, shoulder, -legSwing);
      part([side * 9.5 - 2, 13, -2], [side * 9.5 + 2, 16, 2], SKIN, shoulder, -legSwing);
      // Backpack straps, and the eyes.
      part([side * 4.5 - 1.2, 15, 4], [side * 4.5 + 1.2, 31, 4.6], STRAP);
      part([side * 3 - 1.6, 36, 6.4], [side * 3 + 1.6, 39.5, 7], WHITE);
      part([side * 3 - 0.2, 36, 6.8], [side * 3 + 1.4, 38.5, 7.3], HAIR);
    }
    part([-7, 13, -4], [7, 31, 4], HOODIE);
    part([-5.5, 16, -8], [5.5, 29, -4], STRAP);
    part([-7.5, 31, -6.5], [7.5, 44, 6.5], SKIN);
    // Hair: on top, at the back and a fringe swept to one side.
    part([-8, 43, -7.5], [8, 47.5, 7.5], HAIR);
    part([-8, 34, -7.5], [8, 43, -4.5], HAIR);
    part([-8, 36, -7.5], [-7.4, 43, 4], HAIR);
    part([7.4, 36, -7.5], [8, 43, 4], HAIR);
    part([-8, 40.5, 6], [3, 43, 7.5], HAIR);
    const [cos, sin] = [Math.cos(options.facing), Math.sin(options.facing)];
    const [rollCos, rollSin] = [Math.cos(options.roll), Math.sin(options.roll)];
    // Turned round, tipped over around its middle, then put in place.
    const orient = ([x, y, z]: Vec, middle: number): Vec => {
      const [tx, tz] = [x * cos + z * sin, -x * sin + z * cos];
      const ty = y - middle;
      return [tx * rollCos - ty * rollSin, tx * rollSin + ty * rollCos + middle, tz];
    };
    const middle = options.roll === 0 ? 0 : 24;
    const placed = faces.map((face) => ({
      color: face.color,
      normal: orient(face.normal, 0),
      corners: face.corners.map((c) => {
        const [x, y, z] = orient(c, middle);
        return [at[0] + x * s, at[1] + (y + bob) * s, at[2] + z * s] as Vec;
      }),
    }));
    this.addMesh(things, camera, placed);
  }

  /** A costume as a 3D figure, standing at `at`, facing the camera at the start. */
  private addFigure(
    things: Thing[],
    camera: Camera,
    costume: Costume,
    unit: number,
    at: Vec,
    options: { flip: number; spin: number; shrink: number; depth: number; alpha: number; frozen?: boolean },
  ): void {
    const figure = this.figure(costume, options.depth);
    if (!figure) return;
    const s = unit * options.shrink;
    const [cos, sin] = [Math.cos(options.spin), Math.sin(options.spin)];
    const place = ([x, y, z]: Vec): Vec => {
      const fx = x * options.flip * s;
      const fz = z * s;
      return [at[0] + fx * cos - fz * sin, at[1] + y * s, at[2] + fx * sin + fz * cos];
    };
    const turn = ([x, y, z]: Vec): Vec => {
      const fx = x * options.flip;
      return [fx * cos - z * sin, y, fx * sin + z * cos];
    };
    const faces = figure.faces.map((face) => ({ corners: face.corners.map(place), normal: turn(face.normal), color: face.color }));
    this.addMesh(things, camera, faces, options.alpha, options.frozen ? "hue-rotate(160deg) saturate(1.5)" : "none");
  }

  /** Builds a figure from a costume's pixels once, and keeps it. */
  private figure(costume: Costume, depth: number): Figure | null {
    const cached = this.figures.get(costume);
    if (cached) return cached;
    const image = this.images.get(costume);
    if (!image) return null;
    const width = Math.round(costume.width);
    const height = Math.round(costume.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const at = (x: number, y: number): Rgb | null => {
      if (x < 0 || y < 0 || x >= width || y >= height) return null;
      const i = (y * width + x) * 4;
      return data[i + 3]! > 128 ? [data[i]!, data[i + 1]!, data[i + 2]!] : null;
    };
    const same = (a: Rgb | null, b: Rgb | null) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    const faces: Face[] = [];
    const [front, back] = [-depth / 2, depth / 2];
    const left = -width / 2;
    for (let y = 0; y < height; y++) {
      const [top, bottom] = [height - y, height - y - 1];
      let x = 0;
      while (x < width) {
        const color = at(x, y);
        if (!color) {
          x++;
          continue;
        }
        let end = x + 1;
        while (end < width && same(at(end, y), color)) end++;
        const [x0, x1] = [left + x, left + end];
        faces.push({ corners: [[x0, top, front], [x1, top, front], [x1, bottom, front], [x0, bottom, front]], normal: [0, 0, -1], color });
        faces.push({ corners: [[x1, top, back], [x0, top, back], [x0, bottom, back], [x1, bottom, back]], normal: [0, 0, 1], color });
        if (!at(x - 1, y)) faces.push({ corners: [[x0, top, back], [x0, top, front], [x0, bottom, front], [x0, bottom, back]], normal: [-1, 0, 0], color });
        if (!at(end, y)) faces.push({ corners: [[x1, top, front], [x1, top, back], [x1, bottom, back], [x1, bottom, front]], normal: [1, 0, 0], color });
        // Tops and bottoms where nothing is above or below.
        for (let i = x; i < end; i++) {
          const [a, b] = [left + i, left + i + 1];
          if (!at(i, y - 1)) faces.push({ corners: [[a, top, back], [b, top, back], [b, top, front], [a, top, front]], normal: [0, 1, 0], color });
          if (!at(i, y + 1)) faces.push({ corners: [[a, bottom, front], [b, bottom, front], [b, bottom, back], [a, bottom, back]], normal: [0, -1, 0], color });
        }
        x = end;
      }
    }
    const figure = { faces };
    this.figures.set(costume, figure);
    return figure;
  }

  /** A shiny ball, or the Earth. */
  private addSphere(things: Thing[], camera: Camera, at: Vec, radius: number, [r, g, b]: Rgb, earth = false): void {
    const center = camera.toCamera(at);
    if (center[2] < NEAR) return;
    const ctx = this.ctx;
    things.push({
      depth: center[2],
      draw: () => {
        const [x, y] = camera.toCanvas(center);
        const size = radius * camera.pixels(center[2]);
        const light = ctx.createRadialGradient(x - size * 0.35, y - size * 0.4, size * 0.1, x, y, size);
        light.addColorStop(0, `rgb(${Math.min(255, r + 120)}, ${Math.min(255, g + 120)}, ${Math.min(255, b + 120)})`);
        light.addColorStop(0.45, `rgb(${r}, ${g}, ${b})`);
        light.addColorStop(1, `rgb(${r * 0.25}, ${g * 0.25}, ${b * 0.25})`);
        ctx.save();
        ctx.fillStyle = light;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        if (earth) {
          // Land, roughly.
          ctx.clip();
          ctx.fillStyle = "rgba(70, 150, 60, 0.75)";
          for (const [dx, dy, w, h] of [[-0.4, -0.3, 0.5, 0.35], [0.25, 0.1, 0.4, 0.5], [-0.2, 0.45, 0.35, 0.2]] as const) {
            ctx.beginPath();
            ctx.ellipse(x + dx * size, y + dy * size, w * size, h * size, 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      },
    });
  }

  /** The X Y Z signpost from the episode. */
  private addSignpost(things: Thing[], camera: Camera, [x, , z]: Vec): void {
    this.addMesh(things, camera, box([x, 110, z], [8, 220, 8], [225, 170, 40], 0));
    this.addMesh(things, camera, box([x + 52, 150, z], [86, 26, 3], [190, 200, 205], 0));
    this.addMesh(things, camera, box([x - 52, 118, z], [86, 26, 3], [190, 200, 205], 0));
    this.addText(things, camera, "X →", [x + 52, 141, z - 3], 20, "#c05a00");
    this.addText(things, camera, "← Z", [x - 52, 109, z - 3], 20, "#c05a00");
    this.addText(things, camera, "Y", [x, 226, z - 5], 26, "#e09000");
  }

  /** Words standing in the air, flat, facing where the camera starts. */
  private addText(things: Thing[], camera: Camera, text: string, at: Vec, size: number, color: string): void {
    const center = camera.toCamera(at);
    if (center[2] < NEAR) return;
    const side = camera.toCamera([at[0] + 10, at[1], at[2]]);
    const ctx = this.ctx;
    things.push({
      depth: center[2] - 2,
      draw: () => {
        const [x, y] = camera.toCanvas(center);
        const [sx] = camera.toCanvas(side);
        const pixels = camera.pixels(center[2]);
        ctx.save();
        ctx.translate(x, y);
        // Seen from the side, flat words get narrow.
        ctx.scale((sx - x) / (10 * pixels), 1);
        ctx.font = `600 ${size * pixels}px 'Noto Sans', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6 * camera.view.scale;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      },
    });
  }

  /** The room left behind, standing far away as a flat card. */
  private addCard(things: Thing[], camera: Camera): void {
    const image = this.images.get(this.stage);
    if (!image) return;
    const [w, h, z] = [STAGE_WIDTH * 0.8, STAGE_HEIGHT * 0.8, 1600];
    const a = camera.toCamera([-w / 2, h, z]);
    const b = camera.toCamera([w / 2, 0, z]);
    if (a[2] < NEAR || b[2] < NEAR) return;
    const ctx = this.ctx;
    things.push({
      depth: (a[2] + b[2]) / 2,
      draw: () => {
        const [ax, ay] = camera.toCanvas(a);
        const [bx, by] = camera.toCanvas(b);
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(image, -this.stage.x, -this.stage.x, STAGE_WIDTH, STAGE_HEIGHT, ax, ay, bx - ax, by - ay);
        ctx.restore();
      },
    });
  }

  /** A dark glow on the floor, so it's clear where things are. */
  private addShadow(things: Thing[], camera: Camera, at: Vec, radius: number): void {
    const points = ring(at, radius, 16).map((p) => camera.toCamera(p));
    if (points.some((p) => p[2] < NEAR)) return;
    const ctx = this.ctx;
    things.push({
      depth: camera.toCamera(at)[2] + radius + 30,
      draw: () => {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.beginPath();
        for (const [i, p] of points.entries()) {
          const [x, y] = camera.toCanvas(p);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.fill();
        ctx.restore();
      },
    });
  }

  /** The black hole that swallows the world at the end, swirling. */
  private addBlackHole(things: Thing[], camera: Camera, at: Vec, grown: number, t: number): void {
    const radius = 70 * grown;
    const rings = [1.6, 1.3, 1].map((k) => ring(at, radius * k, 32).map((p) => camera.toCamera(p)));
    if (rings.some((r) => r.some((p) => p[2] < NEAR))) return;
    const ctx = this.ctx;
    things.push({
      depth: camera.toCamera(at)[2] + radius * 2,
      draw: () => {
        ctx.save();
        rings.forEach((points, i) => {
          ctx.fillStyle = ["rgba(120, 40, 200, 0.35)", "rgba(40, 0, 80, 0.7)", "#000"][i]!;
          ctx.beginPath();
          for (const [j, p] of points.entries()) {
            const [x, y] = camera.toCanvas(p);
            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.fill();
        });
        // Swirls.
        ctx.strokeStyle = "rgba(200, 140, 255, 0.7)";
        ctx.lineWidth = Math.max(1, camera.view.scale);
        for (let arm = 0; arm < 4; arm++) {
          ctx.beginPath();
          for (let i = 0; i <= 20; i++) {
            const angle = arm * (Math.PI / 2) + t * 4 + i * 0.25;
            const r = radius * (1.5 - i * 0.05);
            const p = camera.toCamera([at[0] + Math.cos(angle) * r, 1, at[2] + Math.sin(angle) * r]);
            if (p[2] < NEAR) continue;
            const [x, y] = camera.toCanvas(p);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  }
}

/** Faces built pointing +z, standing on y 0, turned to `heading`, shrunk by `scale` and put at `at`. */
function placeFaces(faces: Face[], at: Vec, heading: number, scale: number): Face[] {
  const [cos, sin] = [Math.cos(heading), Math.sin(heading)];
  const turn = ([x, y, z]: Vec): Vec => [x * cos + z * sin, y, -x * sin + z * cos];
  return faces.map((face) => ({
    color: face.color,
    normal: turn(face.normal),
    corners: face.corners.map((corner) => {
      const [x, y, z] = turn(corner);
      return [at[0] + x * scale, at[1] + y * scale, at[2] + z * scale] as Vec;
    }),
  }));
}

/** Homer's pink sedan, Hit & Run's own Family Sedan, pointing +z. */
const CAR: Face[] = (() => {
  const corner = (i: number): Vec => [SEDAN_CORNERS[i * 3]! / 2, SEDAN_CORNERS[i * 3 + 1]! / 2, SEDAN_CORNERS[i * 3 + 2]! / 2];
  const faces: Face[] = [];
  for (let i = 0; i < SEDAN_TRIANGLES.length; i += 4) {
    const [a, b, c] = [corner(SEDAN_TRIANGLES[i]!), corner(SEDAN_TRIANGLES[i + 1]!), corner(SEDAN_TRIANGLES[i + 2]!)];
    const color = SEDAN_TRIANGLES[i + 3]! * 3;
    const [ab, ac] = [[b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]] as [Vec, Vec];
    faces.push({
      corners: [a, b, c],
      normal: normalize([ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]),
      color: [SEDAN_COLORS[color]!, SEDAN_COLORS[color + 1]!, SEDAN_COLORS[color + 2]!],
    });
  }
  return faces;
})();

/** The point where a line from behind the camera crosses into view. */
function cut(behind: Vec, ahead: Vec): Vec {
  const k = (NEAR - behind[2]) / (ahead[2] - behind[2]);
  return [behind[0] + (ahead[0] - behind[0]) * k, behind[1] + (ahead[1] - behind[1]) * k, NEAR];
}

function ring([x, y, z]: Vec, radius: number, count: number): Vec[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return [x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius * 0.999] as Vec;
  });
}

/** A box centered at `at`, turned `yaw` around its middle. */
function box([cx, cy, cz]: Vec, [w, h, d]: Vec, color: Rgb, yaw: number): Face[] {
  const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
  const point = (x: number, y: number, z: number): Vec => [cx + x * cos - z * sin, cy + y, cz + x * sin + z * cos];
  const turn = ([x, y, z]: Vec): Vec => [x * cos - z * sin, y, x * sin + z * cos];
  const [x, y, z] = [w / 2, h / 2, d / 2];
  const sides: [Vec, Vec[]][] = [
    [[0, 0, -1], [[-x, y, -z], [x, y, -z], [x, -y, -z], [-x, -y, -z]]],
    [[0, 0, 1], [[x, y, z], [-x, y, z], [-x, -y, z], [x, -y, z]]],
    [[-1, 0, 0], [[-x, y, z], [-x, y, -z], [-x, -y, -z], [-x, -y, z]]],
    [[1, 0, 0], [[x, y, -z], [x, y, z], [x, -y, z], [x, -y, -z]]],
    [[0, 1, 0], [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]]],
    [[0, -1, 0], [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]]],
  ];
  return sides.map(([normal, corners]) => ({ normal: turn(normal), corners: corners.map(([a, b, c]) => point(a, b, c)), color }));
}

function cylinder([cx, cy, cz]: Vec, radius: number, height: number, color: Rgb): Face[] {
  const count = 18;
  const faces: Face[] = [];
  const top: Vec[] = [];
  for (let i = 0; i < count; i++) {
    const [a, b] = [(i / count) * Math.PI * 2, ((i + 1) / count) * Math.PI * 2];
    const mid = (a + b) / 2;
    const at = (angle: number, y: number): Vec => [cx + Math.cos(angle) * radius, y, cz + Math.sin(angle) * radius];
    faces.push({ corners: [at(a, cy + height), at(b, cy + height), at(b, cy), at(a, cy)], normal: [Math.cos(mid), 0, Math.sin(mid)], color });
    top.push(at(a, cy + height));
  }
  faces.push({ corners: top, normal: [0, 1, 0], color });
  return faces;
}

function cone([cx, cy, cz]: Vec, radius: number, height: number, color: Rgb): Face[] {
  const count = 18;
  const slope = radius / height;
  return Array.from({ length: count }, (_, i) => {
    const [a, b] = [(i / count) * Math.PI * 2, ((i + 1) / count) * Math.PI * 2];
    const mid = (a + b) / 2;
    const at = (angle: number): Vec => [cx + Math.cos(angle) * radius, cy, cz + Math.sin(angle) * radius];
    return { corners: [[cx, cy + height, cz], at(b), at(a)], normal: normalize([Math.cos(mid), slope, Math.sin(mid)]), color };
  });
}

/** Turns a point around the x axis through `pivot`, for swinging arms and legs. */
function pitch([x, y, z]: Vec, [, py, pz]: Vec, angle: number): Vec {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const [dy, dz] = [y - py, z - pz];
  return [x, py + dy * cos - dz * sin, pz + dy * sin + dz * cos];
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

/** Blinking while invincible, like in the room. */
function invincibleBlink(game: Game): number {
  return game.invincible > 0 ? (Math.floor(game.invincible / 0.15) % 2 === 0 ? 1 : 0.5) : 1;
}

/** A fixed random number from 0 to 1 for each whole number. */
function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
