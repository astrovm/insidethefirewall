// The virus in the 3D world, made over in The Simpsons: Hit & Run's look:
// smooth and rounded, in bright cartoon colors, lit like Homer and his car.
// It's the pixel art's shape: a yellow blob with a bump on top, stubby arms,
// seven black eyes with red pupils, and four legs that wiggle as it flies.

type Vec = [number, number, number];
type Rgb = [number, number, number];

/** Corners with their normals and colors, and triangles, three corners each. In costume units, standing on y 0, facing +z. */
export interface VirusMesh {
  positions: Vec[];
  normals: Vec[];
  colors: Rgb[];
  triangles: number[];
}

/** How tall the virus is, in costume units, legs and all. */
export const VIRUS_HEIGHT = 20;

const BODY: Rgb = [200, 194, 28];
const EYE: Rgb = [22, 22, 28];
const PUPIL: Rgb = [215, 24, 24];
/** The eyes, where they sit on the front: across and up. */
const EYES: [number, number][] = [
  [0, 17],
  [-5, 14.5],
  [5, 14.5],
  [-2.6, 12],
  [2.6, 12],
  [-5.6, 9],
  [5.6, 9],
];
const LEGS = [-4.5, -1.5, 1.5, 4.5];

/** The virus at `time` seconds, its legs wiggling. */
export function virusMesh(time: number): VirusMesh {
  const mesh: VirusMesh = { positions: [], normals: [], colors: [], triangles: [] };
  const body = { at: [0, 10, 0] as Vec, radii: [6.5, 6.5, 5.5] as Vec };
  ellipsoid(mesh, body.at, body.radii, BODY, 14, 9);
  ellipsoid(mesh, [0, 16, -0.5], [3.4, 3.2, 3], BODY, 10, 7);
  for (const side of [-1, 1]) ellipsoid(mesh, [side * 7.2, 11, 0], [2.6, 1.7, 1.7], BODY, 8, 6);
  for (const [i, across] of LEGS.entries()) {
    const swing = Math.sin(time * 9 + i * 1.7) * 0.5;
    leg(mesh, [across, 4.5, 0], 1.25, 0.6, 5.5, swing);
    ellipsoid(mesh, [across, 4.2, 0], [1.4, 0.9, 1.4], PUPIL, 8, 5);
  }
  for (const [x, y] of EYES) {
    // On the front of the body, or the bump on top.
    const [cx, cy, cz, rx, ry, rz] = y > 15.5 ? [0, 16, -0.5, 3.4, 3.2, 3] : [...body.at, ...body.radii];
    const [u, v] = [(x - cx) / rx, (y - cy) / ry];
    const z = cz + rz * Math.sqrt(Math.max(0.05, 1 - u * u - v * v));
    ellipsoid(mesh, [x, y, z - 0.4], [1.5, 1.5, 1.1], EYE, 8, 6);
    ellipsoid(mesh, [x + 0.35, y - 0.35, z + 0.55], [0.65, 0.65, 0.4], PUPIL, 6, 4);
  }
  return mesh;
}

/** A smooth ball, stretched by `radii`, with `around` × `down` corners. */
function ellipsoid(mesh: VirusMesh, [cx, cy, cz]: Vec, [rx, ry, rz]: Vec, color: Rgb, around: number, down: number): void {
  const first = mesh.positions.length;
  for (let j = 0; j <= down; j++) {
    const phi = (j / down) * Math.PI;
    for (let i = 0; i < around; i++) {
      const theta = (i / around) * Math.PI * 2;
      const unit: Vec = [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];
      mesh.positions.push([cx + unit[0] * rx, cy + unit[1] * ry, cz + unit[2] * rz]);
      mesh.normals.push(normalize([unit[0] / rx, unit[1] / ry, unit[2] / rz]));
      mesh.colors.push(color);
    }
  }
  band(mesh, first, around, down);
}

/** A leg hanging down from `top`, thinner toward its tip, swung `swing` radians forward and back. */
function leg(mesh: VirusMesh, [tx, ty, tz]: Vec, thick: number, thin: number, length: number, swing: number): void {
  const first = mesh.positions.length;
  const [around, down] = [8, 4];
  let tip: Vec = [tx, ty, tz];
  for (let j = 0; j <= down; j++) {
    const along = j / down;
    // It curls more toward the tip.
    const bend = swing * along * along;
    tip = [tx, ty - Math.cos(bend) * length * along, tz + Math.sin(bend) * length * along];
    const radius = thick + (thin - thick) * along;
    for (let i = 0; i < around; i++) {
      const theta = (i / around) * Math.PI * 2;
      const [ox, oz] = [Math.sin(theta), Math.cos(theta)];
      mesh.positions.push([tip[0] + ox * radius, tip[1], tip[2] + oz * radius]);
      mesh.normals.push([ox, 0, oz]);
      mesh.colors.push(BODY);
    }
  }
  band(mesh, first, around, down);
  // A round tip.
  ellipsoid(mesh, tip, [thin, thin, thin], BODY, 6, 4);
}

/** Triangles joining rings of `around` corners, `down` + 1 rings from `first`. */
function band(mesh: VirusMesh, first: number, around: number, down: number): void {
  for (let j = 0; j < down; j++) {
    for (let i = 0; i < around; i++) {
      const [a, b] = [first + j * around + i, first + j * around + ((i + 1) % around)];
      const [c, d] = [a + around, b + around];
      mesh.triangles.push(a, c, b, b, c, d);
    }
  }
}

function normalize([x, y, z]: Vec): Vec {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}
