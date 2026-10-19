// A character's skeleton and moves, from The Simpsons: Hit & Run, in
// assets/player: how they stand, walk, run, jump, kick, flail and sit at the
// wheel. Each frame the bones take the pose of a move at a moment, blending
// from the last move into the next, and each corner of the skin hung on them
// follows the bones it hangs on.

/** The skeleton and moves as converted: in meters, standing on y 0 and facing +z. */
export interface RigData {
  /** Each bone's name, its parent, before it, and where it sits on it: a 4×4 matrix, column by column. */
  bones: { name: string; parent: number; matrix: number[] }[];
  /** The moves, by name: each bone's turn as quaternions, x y z w, and some bones' place, over time. */
  animations: Record<string, { duration: number; tracks: { bone: number; kind: "position" | "quaternion"; times: number[]; values: number[] }[] }>;
}

/** A skin to hang on the bones: corners with normals and colors, 0 to 1, and four bones per corner, with how much each pulls it. */
export interface Skin {
  position: number[];
  normal: number[];
  color: number[];
  joints: number[];
  weights: number[];
  /** Triangles, three corners each. */
  indices: number[];
}

export type Move =
  | "loco_idle_rest"
  | "loco_walk"
  | "loco_run"
  | "jump_idle_take_off"
  | "jump_idle_in_air"
  | "jump_dash_in_air"
  | "jump_idle_land"
  | "jump_kick"
  | "flail"
  | "in_car_idle";

/** A move at a moment, `time` seconds in. Looping moves wrap, the others hold their end. */
export interface MoveAt {
  move: Move;
  time: number;
}

type Quat = [number, number, number, number];
type Vec = [number, number, number];

/** How long one move takes to blend into the next. */
export const BLEND = 0.15;
const LOOPING = new Set<Move>(["loco_idle_rest", "loco_walk", "loco_run", "jump_idle_in_air", "flail", "in_car_idle"]);

export class Rig {
  readonly skin: Skin;
  /** The skin, ready to pose fast. */
  private readonly fast: { position: Float32Array; normal: Float32Array; joints: Uint8Array; weights: Float32Array };
  private readonly parents: number[];
  /** Each bone's resting place and turn on its parent. */
  private readonly rest: { at: Vec; turn: Quat }[];
  /** Undoes each bone's resting place in the model, so a pose moves the skin from where it was modeled. */
  private readonly unbind: Float32Array;
  private readonly animations: RigData["animations"];
  /** Each bone's matrix this pose, from the model as modeled to posed. */
  private readonly skinning: Float32Array;

  constructor(data: RigData, skin: Skin) {
    this.skin = skin;
    this.animations = data.animations;
    this.parents = data.bones.map((bone, i) => (i === 0 ? -1 : bone.parent));
    this.rest = data.bones.map(({ matrix: m }) => ({ at: [m[12]!, m[13]!, m[14]!], turn: toQuat(m) }));
    const world = this.world(this.rest);
    this.unbind = new Float32Array(data.bones.length * 16);
    for (let i = 0; i < data.bones.length; i++) this.unbind.set(invert(world.subarray(i * 16, i * 16 + 16)), i * 16);
    this.skinning = new Float32Array(data.bones.length * 16);
    this.fast = { position: new Float32Array(skin.position), normal: new Float32Array(skin.normal), joints: new Uint8Array(skin.joints), weights: new Float32Array(skin.weights) };
  }

  /** How long a move takes. */
  duration(move: Move): number {
    return this.animations[move]?.duration ?? 1;
  }

  /**
   * Puts the bones in `now`'s pose, or part of the way there from `from`'s,
   * `blend` of the way, then moves the skin with them into `positions` and
   * `normals`: three numbers per corner.
   */
  pose(now: MoveAt, from: MoveAt | null, blend: number, positions: Float32Array, normals: Float32Array): void {
    let locals = this.sample(now);
    if (from && blend < 1) {
      const before = this.sample(from);
      locals = locals.map((local, i) => ({ at: mixVec(before[i]!.at, local.at, blend), turn: nlerp(before[i]!.turn, local.turn, blend) }));
    }
    const world = this.world(locals);
    for (let i = 0; i < this.parents.length; i++) multiplyInto(this.skinning, i * 16, world, i * 16, this.unbind, i * 16);
    const m = this.skinning;
    const { position, normal, joints, weights } = this.fast;
    for (let v = 0, at = 0; v < position.length / 3; v++, at += 3) {
      const x = position[at]!, y = position[at + 1]!, z = position[at + 2]!;
      const nx = normal[at]!, ny = normal[at + 1]!, nz = normal[at + 2]!;
      let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
      for (let k = 0; k < 4; k++) {
        const w = weights[v * 4 + k]!;
        if (w === 0) continue;
        const b = joints[v * 4 + k]! * 16;
        px += w * (m[b]! * x + m[b + 4]! * y + m[b + 8]! * z + m[b + 12]!);
        py += w * (m[b + 1]! * x + m[b + 5]! * y + m[b + 9]! * z + m[b + 13]!);
        pz += w * (m[b + 2]! * x + m[b + 6]! * y + m[b + 10]! * z + m[b + 14]!);
        qx += w * (m[b]! * nx + m[b + 4]! * ny + m[b + 8]! * nz);
        qy += w * (m[b + 1]! * nx + m[b + 5]! * ny + m[b + 9]! * nz);
        qz += w * (m[b + 2]! * nx + m[b + 6]! * ny + m[b + 10]! * nz);
      }
      const length = Math.hypot(qx, qy, qz) || 1;
      positions[at] = px;
      positions[at + 1] = py;
      positions[at + 2] = pz;
      normals[at] = qx / length;
      normals[at + 1] = qy / length;
      normals[at + 2] = qz / length;
    }
  }

  /** How many corners the skin has. */
  get corners(): number {
    return this.skin.position.length / 3;
  }

  /** Each bone's place and turn on its parent, `at.time` seconds into its move. */
  private sample({ move, time }: MoveAt): { at: Vec; turn: Quat }[] {
    const locals = this.rest.map((rest) => ({ at: [...rest.at] as Vec, turn: [...rest.turn] as Quat }));
    const animation = this.animations[move];
    if (!animation) return locals;
    const t = LOOPING.has(move) ? ((time % animation.duration) + animation.duration) % animation.duration : Math.min(Math.max(time, 0), animation.duration);
    for (const track of animation.tracks) {
      const { times, values } = track;
      let k = 0;
      while (k < times.length - 1 && times[k + 1]! <= t) k++;
      const next = Math.min(k + 1, times.length - 1);
      const part = next === k ? 0 : Math.min(1, (t - times[k]!) / (times[next]! - times[k]!));
      if (track.kind === "quaternion") {
        const a: Quat = [values[k * 4]!, values[k * 4 + 1]!, values[k * 4 + 2]!, values[k * 4 + 3]!];
        const b: Quat = [values[next * 4]!, values[next * 4 + 1]!, values[next * 4 + 2]!, values[next * 4 + 3]!];
        locals[track.bone]!.turn = nlerp(a, b, part);
      } else {
        const a: Vec = [values[k * 3]!, values[k * 3 + 1]!, values[k * 3 + 2]!];
        const b: Vec = [values[next * 3]!, values[next * 3 + 1]!, values[next * 3 + 2]!];
        locals[track.bone]!.at = mixVec(a, b, part);
      }
    }
    return locals;
  }

  /** Each bone's matrix in the model, from its parents down. */
  private world(locals: { at: Vec; turn: Quat }[]): Float32Array {
    const world = new Float32Array(locals.length * 16);
    for (const [i, { at, turn }] of locals.entries()) {
      const local = fromTurn(turn, at);
      const parent = this.parents[i]!;
      if (parent < 0) world.set(local, 0);
      else multiplyInto(world, i * 16, world, parent * 16, local, 0);
    }
    return world;
  }
}

/** Where each bone is in the resting pose, in the model: for hanging a skin on them. */
export function restingJoints(data: RigData): Record<string, Vec> {
  const parents = data.bones.map((bone, i) => (i === 0 ? -1 : bone.parent));
  const world: Float32Array[] = [];
  const joints: Record<string, Vec> = {};
  for (const [i, bone] of data.bones.entries()) {
    const m = bone.matrix;
    const local = fromTurn(toQuat(m), [m[12]!, m[13]!, m[14]!]);
    const out = new Float32Array(16);
    if (parents[i]! < 0) out.set(local);
    else multiplyInto(out, 0, world[parents[i]!]!, 0, local, 0);
    world.push(out);
    joints[bone.name] = [out[12]!, out[13]!, out[14]!];
  }
  return joints;
}

/** The move a character is in, and the one it's blending from, moved along as the game goes. */
export class Moves {
  now: MoveAt = { move: "loco_idle_rest", time: 0 };
  from: MoveAt | null = null;
  /** How far into the blend from `from`, in seconds. */
  private blending = BLEND;

  /** Moves on `dt` seconds, `rate` times as fast, into `move` if it's a new one, or from its start `again`. */
  update(move: Move, dt: number, rate = 1, again = false): void {
    if (move !== this.now.move || again) {
      this.from = this.now;
      this.now = { move, time: 0 };
      this.blending = 0;
    } else this.now.time += dt * rate;
    if (this.from) this.from.time += dt;
    this.blending += dt;
    if (this.blending >= BLEND) this.from = null;
  }

  /** How far the blend from the last move has got, 0 to 1. */
  get blend(): number {
    return Math.min(1, this.blending / BLEND);
  }
}

function mixVec(a: Vec, b: Vec, t: number): Vec {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Part of the way from one turn to another, the short way round. */
export function nlerp(a: Quat, b: Quat, t: number): Quat {
  const flip = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const q: Quat = [0, 1, 2, 3].map((i) => a[i]! + (b[i]! * flip - a[i]!) * t) as Quat;
  const length = Math.hypot(...q) || 1;
  return q.map((c) => c / length) as Quat;
}

/** A matrix's turn, as a quaternion. */
export function toQuat(m: ArrayLike<number>): Quat {
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = [m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

/** A matrix that turns by `q`, then moves by `at`, column by column. */
export function fromTurn([x, y, z, w]: Quat, [tx, ty, tz]: Vec): Float32Array {
  return new Float32Array([
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    tx, ty, tz, 1,
  ]);
}

/** `out` at `o` becomes `a` at `ai` times `b` at `bi`. `out` can be `a`. */
function multiplyInto(out: Float32Array, o: number, a: Float32Array, ai: number, b: Float32Array, bi: number): void {
  const r = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[ai + k * 4 + row]! * b[bi + col * 4 + k]!;
      r[col * 4 + row] = sum;
    }
  }
  out.set(r, o);
}

/** The inverse of a matrix that only turns and moves. */
function invert(m: Float32Array): Float32Array {
  const [tx, ty, tz] = [m[12]!, m[13]!, m[14]!];
  return new Float32Array([
    m[0]!, m[4]!, m[8]!, 0,
    m[1]!, m[5]!, m[9]!, 0,
    m[2]!, m[6]!, m[10]!, 0,
    -(m[0]! * tx + m[1]! * ty + m[2]! * tz), -(m[4]! * tx + m[5]! * ty + m[6]! * tz), -(m[8]! * tx + m[9]! * ty + m[10]! * tz), 1,
  ]);
}
