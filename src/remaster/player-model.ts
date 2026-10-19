// The player as a character in The Simpsons: Hit & Run: yellow skin, big
// round eyes and an overbite, with their brown hair swept to one side, blue
// hoodie, backpack, dark jeans and shoes. Built from rounded shapes, each
// hung on a bone of Hit & Run's skeleton, so it moves with the game's moves.

import { restingJoints, type RigData, type Skin } from "./rig.ts";

type Vec = [number, number, number];
type Rgb = [number, number, number];

const SKIN: Rgb = [255, 217, 15];
const HAIR: Rgb = [92, 46, 24];
const HOODIE: Rgb = [30, 90, 235];
const STRAP: Rgb = [57, 57, 57];
const JEANS: Rgb = [24, 40, 110];
const SHOES: Rgb = [24, 24, 32];
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [10, 10, 12];

/** Which bones pull a corner, and how much, from where it is. */
type Hang = (at: Vec) => [number, number][];

/** The player's skin, hung on `rig`'s bones where they rest. */
export function playerSkin(rig: RigData): Skin {
  const joints = restingJoints(rig);
  const bone = (name: string) => rig.bones.findIndex((b) => b.name === name);
  const at = (name: string, [dx, dy, dz]: Vec = [0, 0, 0]): Vec => {
    const [x, y, z] = joints[name]!;
    return [x + dx, y + dy, z + dz];
  };
  const on = (name: string): Hang => () => [[bone(name), 1]];
  const skin: Skin = { position: [], normal: [], color: [], joints: [], weights: [], indices: [] };
  const add = (corners: { at: Vec; normal: Vec }[], triangles: number[], color: Rgb, hang: Hang) => {
    const first = skin.position.length / 3;
    for (const corner of corners) {
      skin.position.push(...corner.at);
      skin.normal.push(...corner.normal);
      skin.color.push(color[0] / 255, color[1] / 255, color[2] / 255);
      const pulls = hang(corner.at).slice(0, 4);
      while (pulls.length < 4) pulls.push([0, 0]);
      skin.joints.push(...pulls.map(([b]) => b));
      skin.weights.push(...pulls.map(([, w]) => w));
    }
    skin.indices.push(...triangles.map((i) => i + first));
  };
  const ball = (center: Vec, radii: Vec, color: Rgb, hang: Hang, options: BallOptions = {}) => add(...ellipsoid(center, radii, options), color, hang);
  const tube = (a: Vec, b: Vec, ra: number, rb: number, color: Rgb, hang: Hang) => add(...cylinder(a, b, ra, rb), color, hang);

  // The head: big, tall and round, as on the show, with a jutting mouth, big eyes, a nose and ears.
  const head = on("Head");
  const big = 1.25;
  const face = ([dx, dy, dz]: Vec): Vec => at("Head", [dx * big, dy * big, dz * big]);
  const size = (radii: Vec): Vec => [radii[0] * big, radii[1] * big, radii[2] * big];
  ball(face([0, 0.17, 0]), size([0.15, 0.21, 0.15]), SKIN, head);
  ball(face([0, 0.04, 0.06]), size([0.125, 0.085, 0.1]), SKIN, head);
  for (const side of [-1, 1]) {
    ball(face([side * 0.062, 0.2, 0.125]), size([0.058, 0.058, 0.058]), WHITE, head, { around: 12, down: 8 });
    ball(face([side * 0.062, 0.2, 0.177]), size([0.017, 0.017, 0.01]), BLACK, head, { around: 8, down: 5 });
    ball(face([side * 0.15, 0.13, -0.01]), size([0.028, 0.04, 0.025]), SKIN, head, { around: 8, down: 5 });
  }
  ball(face([0, 0.13, 0.16]), size([0.026, 0.028, 0.055]), SKIN, head, { around: 8, down: 5 });
  // Brown hair on top and at the back, and a fringe swept to one side.
  ball(face([0, 0.19, -0.03]), size([0.158, 0.225, 0.158]), HAIR, head, { bottom: 0.36 });
  ball(face([0, 0.16, -0.05]), size([0.165, 0.18, 0.125]), HAIR, head);
  ball(face([-0.03, 0.33, 0.08]), size([0.135, 0.045, 0.065]), HAIR, head, { tilt: 0.25 });
  tube(at("Neck"), at("Head", [0, 0.02, 0]), 0.055, 0.055, SKIN, on("Neck"));

  // The hoodie, bending between the spine's two bones, with its hood and the backpack.
  const [low, high] = [joints["Spine_1"]![1], joints["Spine_2"]![1]];
  const spine: Hang = ([, y]) => {
    const up = Math.min(1, Math.max(0, (y - low) / (high - low)));
    return [
      [bone("Spine_1"), 1 - up],
      [bone("Spine_2"), up],
    ];
  };
  const body = { center: [0, 0.92, -0.03] as Vec, radii: [0.21, 0.28, 0.16] as Vec };
  ball(body.center, body.radii, HOODIE, spine, { around: 16, down: 12 });
  ball([0, 1.13, -0.12], [0.16, 0.08, 0.09], HOODIE, on("Spine_2"));
  ball([0, 0.95, -0.21], [0.16, 0.19, 0.08], STRAP, on("Spine_2"));
  for (const side of [-1, 1]) {
    // Straps down the front, on the hoodie.
    const [x, y] = [side * 0.09, 0.98];
    const [u, v] = [(x - body.center[0]) / body.radii[0], (y - body.center[1]) / body.radii[1]];
    const z = body.center[2] + body.radii[2] * Math.sqrt(1 - u * u - v * v);
    ball([x, y, z], [0.028, 0.18, 0.022], STRAP, on("Spine_2"), { around: 8, down: 6 });
  }

  // Jeans and shoes.
  ball(at("Pelvis", [0, 0.02, -0.01]), [0.19, 0.11, 0.14], JEANS, on("Pelvis"));
  for (const side of ["L", "R"]) {
    tube(at(`Hip_${side}`), at(`Knee_${side}`), 0.078, 0.068, JEANS, on(`Hip_${side}`));
    ball(at(`Knee_${side}`), [0.068, 0.068, 0.068], JEANS, on(`Knee_${side}`), { around: 10, down: 6 });
    tube(at(`Knee_${side}`), at(`Ankle_${side}`), 0.066, 0.06, JEANS, on(`Knee_${side}`));
    ball(at(`Ankle_${side}`, [0, -0.035, 0.06]), [0.078, 0.058, 0.145], SHOES, on(`Ankle_${side}`));

    // Hoodie sleeves, and yellow hands with a thumb and fingers.
    const out = side === "L" ? 1 : -1;
    ball(at(`Shoulder_${side}`), [0.068, 0.068, 0.068], HOODIE, on(`Shoulder_${side}`), { around: 10, down: 6 });
    tube(at(`Shoulder_${side}`), at(`Elbow_${side}`), 0.062, 0.056, HOODIE, on(`Shoulder_${side}`));
    ball(at(`Elbow_${side}`), [0.056, 0.056, 0.056], HOODIE, on(`Elbow_${side}`), { around: 10, down: 6 });
    tube(at(`Elbow_${side}`), at(`Wrist_${side}`), 0.056, 0.052, HOODIE, on(`Elbow_${side}`));
    ball(at(`Wrist_${side}`, [out * 0.06, 0, 0.005]), [0.07, 0.036, 0.056], SKIN, on(`Wrist_${side}`), { around: 10, down: 6 });
    tube(at(`Middle_Base_${side}`), at(`Middle_${side}`, [out * 0.02, 0, 0]), 0.024, 0.02, SKIN, on(`Middle_Base_${side}`));
    tube(at(`Thumb_Base_${side}`), at(`Thumb_${side}`, [out * 0.01, 0, 0.015]), 0.022, 0.018, SKIN, on(`Thumb_Base_${side}`));
  }
  return skin;
}

interface BallOptions {
  around?: number;
  down?: number;
  /** Only down to this far, 0 the top and 1 the bottom: a cap. */
  bottom?: number;
  /** Tipped round the way it faces, in radians. */
  tilt?: number;
}

/** A smooth ball, stretched by `radii`: its corners, with normals, and its triangles. */
function ellipsoid([cx, cy, cz]: Vec, [rx, ry, rz]: Vec, { around = 14, down = 9, bottom = 1, tilt = 0 }: BallOptions): [{ at: Vec; normal: Vec }[], number[]] {
  const corners: { at: Vec; normal: Vec }[] = [];
  const [cos, sin] = [Math.cos(tilt), Math.sin(tilt)];
  for (let j = 0; j <= down; j++) {
    const phi = (j / down) * Math.PI * bottom;
    for (let i = 0; i < around; i++) {
      const theta = (i / around) * Math.PI * 2;
      const unit: Vec = [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];
      const [x, y] = [unit[0] * rx, unit[1] * ry];
      const [nx, ny, nz] = normalize([unit[0] / rx, unit[1] / ry, unit[2] / rz]);
      corners.push({ at: [cx + x * cos - y * sin, cy + x * sin + y * cos, cz + unit[2] * rz], normal: [nx * cos - ny * sin, nx * sin + ny * cos, nz] });
    }
  }
  return [corners, rings(around, down)];
}

/** A tube from `a` to `b`, `ra` thick at `a` and `rb` at `b`. */
function cylinder(a: Vec, b: Vec, ra: number, rb: number): [{ at: Vec; normal: Vec }[], number[]] {
  const axis = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  // Two directions across the tube.
  const side = normalize(Math.abs(axis[1]) < 0.9 ? cross(axis, [0, 1, 0]) : cross(axis, [1, 0, 0]));
  const other = cross(axis, side);
  const around = 10;
  const corners: { at: Vec; normal: Vec }[] = [];
  for (const [end, radius] of [[a, ra], [b, rb]] as const) {
    for (let i = 0; i < around; i++) {
      const theta = (i / around) * Math.PI * 2;
      const normal: Vec = [0, 1, 2].map((k) => side[k]! * Math.cos(theta) + other[k]! * Math.sin(theta)) as Vec;
      corners.push({ at: [0, 1, 2].map((k) => end[k]! + normal[k]! * radius) as Vec, normal });
    }
  }
  return [corners, rings(around, 1)];
}

/** Triangles joining `down` + 1 rings of `around` corners. */
function rings(around: number, down: number): number[] {
  const triangles: number[] = [];
  for (let j = 0; j < down; j++) {
    for (let i = 0; i < around; i++) {
      const [a, b] = [j * around + i, j * around + ((i + 1) % around)];
      triangles.push(a, a + around, b, b, a + around, b + around);
    }
  }
  return triangles;
}

function normalize([x, y, z]: Vec): Vec {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
