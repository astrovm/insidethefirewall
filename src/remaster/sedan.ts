// Homer's car from The Simpsons: Hit & Run, drawn with WebGL: with its own
// textures, and a depth buffer so its parts, and the player sitting in it,
// cover each other the right way. The rest of the 3D world is canvas 2D, so
// the car is drawn on its own canvas and pasted in.

import { STAGE_HEIGHT, STAGE_WIDTH } from "../engine/sprite.ts";
import type { View } from "./render.ts";
import { SEDAN_MATERIALS, SEDAN_PARTS } from "./sedan-model.ts";

type Vec = [number, number, number];
type Rgb = [number, number, number];

/** World units in a centimeter of the car: about three times as long as the player is tall. */
export const SEDAN_SCALE = 0.32;
/** Where the driver's hips go, on the seat behind the wheel, in centimeters. */
export const DRIVER_SEAT: Vec = [-48, 42, 6];

/** What the car is drawn with: the 3D camera's view of the world. */
export interface SedanCamera {
  readonly view: View;
  readonly focal: number;
  toCamera(point: Vec): Vec;
}

/** Faces drawn in one color each, already lit: the player in the driver's seat. */
export interface ColoredFace {
  corners: Vec[];
  color: Rgb;
}

/** Where the car is: its middle on the floor, which way it points, and how big it is. */
export interface SedanPlace {
  at: Vec;
  heading: number;
  scale: number;
  /**
   * How it sits on its springs: nose up and right side up, in radians, around
   * its center of mass, `center` cm ahead of the middle. Each wheel's bottom
   * stays at its own height in `wheelY`: rear left, rear right, front left,
   * front right. The wheels have rolled `wheelTurn` and the front ones steer by `steer` radians.
   */
  pose?: { pitch: number; roll: number; center: number; wheelY: readonly number[]; wheelTurn: number; steer: number };
  /** A color for its pink paint, for the traffic. */
  paint?: Rgb;
  /** Burnt: 0 shiny, 1 a black husk. */
  burnt?: number;
}

/** Where the car's picture is on its canvas, to paste just that part. */
export interface SedanDrawn {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The model's painted parts: back, doors, hood and sides. */
const PAINTED = new Set(["famil_vbacknorm.png", "famil_vdoordnorm.png", "famil_vdoorpnorm.png", "famil_vhoodnorm.png", "famil_vside.png"]);
/** Where the hips of the body sit on its springs, in cm up. */
const BODY_PIVOT_HEIGHT = 50;

const NEAR = 12;
const FAR = 20000;
/** Of every 8 numbers for a corner: x y z from the camera, u v on the texture, and r g b. */
const STRIDE = 8;

const VERTEX = `
attribute vec3 position;
attribute vec2 uv;
attribute vec3 color;
uniform vec2 center;
uniform vec2 focal;
uniform vec2 depth;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float z = position.z;
  gl_Position = vec4(center * z + focal * position.xy, depth.x * z + depth.y, z);
  vUv = uv;
  vColor = color;
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D image;
uniform float alpha;
uniform vec4 paint;
uniform float burnt;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vec3 color = texture2D(image, vUv).rgb;
  // Repainted: the pink's brightness, in the new color.
  float bright = dot(color, vec3(0.3, 0.55, 0.15));
  color = mix(color, min(vec3(1.0), bright * paint.rgb * 1.6), paint.a);
  color *= 1.0 - burnt * 0.85;
  gl_FragColor = vec4(color * vColor * alpha, alpha);
}`;

export class SedanRenderer {
  readonly canvas = document.createElement("canvas");
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  /** The car's corners as converted, 8 numbers each: x y z, u v, and the normal. */
  private readonly model: Float32Array;
  private readonly textures: WebGLTexture[];
  private readonly white: WebGLTexture;
  private readonly vertices: Float32Array;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private readonly extraVertexBuffer: WebGLBuffer;
  private readonly extraIndexBuffer: WebGLBuffer;
  /** Where each part's triangles start in the index buffer, and how many corners they have. */
  private readonly ranges: { material: number; start: number; count: number }[] = [];
  private readonly uniforms: Record<"center" | "focal" | "depth" | "alpha" | "paint" | "burnt", WebGLUniformLocation | null>;
  /** Which wheel each corner is part of, -1 for the body, and each wheel's axle: x, y and z in cm. */
  private readonly wheelOf: Int8Array;
  private readonly axles: Vec[];

  /** A renderer, or null where WebGL doesn't work. */
  static create(): SedanRenderer | null {
    try {
      return new SedanRenderer();
    } catch {
      return null;
    }
  }

  private constructor() {
    const gl = this.canvas.getContext("webgl", { antialias: true, premultipliedAlpha: true });
    if (!gl) throw new Error("No WebGL");
    this.gl = gl;
    const program = gl.createProgram()!;
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Shaders don't link");
    gl.useProgram(program);
    this.program = program;
    this.uniforms = {
      center: gl.getUniformLocation(program, "center"),
      focal: gl.getUniformLocation(program, "focal"),
      depth: gl.getUniformLocation(program, "depth"),
      alpha: gl.getUniformLocation(program, "alpha"),
      paint: gl.getUniformLocation(program, "paint"),
      burnt: gl.getUniformLocation(program, "burnt"),
    };

    // Every part's corners in one buffer, and their triangles in another.
    const corners = SEDAN_PARTS.reduce((sum, part) => sum + part.corners.length / 8, 0);
    this.model = new Float32Array(corners * 8);
    this.vertices = new Float32Array(corners * STRIDE);
    const indices: number[] = [];
    let offset = 0;
    for (const part of SEDAN_PARTS) {
      this.model.set(part.corners, offset * 8);
      this.ranges.push({ material: part.material, start: indices.length, count: part.triangles.length });
      for (const corner of part.triangles) indices.push(corner + offset);
      offset += part.corners.length / 8;
    }
    // The wheels: the corners of the wheel texture low down at each corner of the car.
    this.wheelOf = new Int8Array(corners).fill(-1);
    const wheelMaterial = SEDAN_MATERIALS.findIndex((material) => material.file === "famil_vwheel.png");
    const bounds = Array.from({ length: 4 }, () => [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity]);
    offset = 0;
    for (const part of SEDAN_PARTS) {
      for (let i = 0; i < part.corners.length / 8; i++) {
        const [x, y, z] = [part.corners[i * 8]!, part.corners[i * 8 + 1]!, part.corners[i * 8 + 2]!];
        if (part.material !== wheelMaterial || y > 80 || Math.abs(x) < 60) continue;
        const wheel = (z > 0 ? 2 : 0) + (x > 0 ? 1 : 0);
        this.wheelOf[offset + i] = wheel;
        const b = bounds[wheel]!;
        [b[0], b[1], b[2], b[3], b[4], b[5]] = [Math.min(b[0]!, x), Math.max(b[1]!, x), Math.min(b[2]!, y), Math.max(b[3]!, y), Math.min(b[4]!, z), Math.max(b[5]!, z)];
      }
      offset += part.corners.length / 8;
    }
    this.axles = bounds.map((b) => [(b[0]! + b[1]!) / 2, (b[2]! + b[3]!) / 2, (b[4]! + b[5]!) / 2] as Vec);
    this.vertexBuffer = gl.createBuffer()!;
    this.indexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    this.extraVertexBuffer = gl.createBuffer()!;
    this.extraIndexBuffer = gl.createBuffer()!;

    // Each texture starts as its average color, until its image loads.
    this.white = this.solid([255, 255, 255]);
    this.textures = SEDAN_MATERIALS.map((material) => {
      const texture = this.solid(material.color);
      const image = new Image();
      image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      };
      image.src = `assets/sedan/${material.file}`;
      return texture;
    });
  }

  private solid([r, g, b]: Rgb): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([r, g, b, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  /**
   * Draws the car at `place`, lit by `light`, with `extra` faces in it, on a
   * see-through canvas as big as `size`, and returns that canvas.
   */
  draw(camera: SedanCamera, size: { width: number; height: number }, place: SedanPlace, light: Vec, extra: ColoredFace[]): SedanDrawn {
    const { gl, canvas } = this;
    if (canvas.width !== size.width || canvas.height !== size.height) [canvas.width, canvas.height] = [size.width, size.height];
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    const { view, focal } = camera;
    gl.uniform2f(this.uniforms.center, ((view.x + (STAGE_WIDTH / 2) * view.scale) * 2) / canvas.width - 1, 1 - ((view.y + (STAGE_HEIGHT / 2) * view.scale) * 2) / canvas.height);
    gl.uniform2f(this.uniforms.focal, (focal * view.scale * 2) / canvas.width, (focal * view.scale * 2) / canvas.height);
    gl.uniform2f(this.uniforms.depth, (FAR + NEAR) / (FAR - NEAR), (-2 * FAR * NEAR) / (FAR - NEAR));

    // Turned, sized and put in place, then seen from the camera, on the CPU: it's only a thousand corners.
    const [cos, sin] = [Math.cos(place.heading), Math.sin(place.heading)];
    const k = SEDAN_SCALE * place.scale;
    const pose = place.pose;
    const [pitchCos, pitchSin] = [Math.cos(pose?.pitch ?? 0), Math.sin(pose?.pitch ?? 0)];
    const [rollCos, rollSin] = [Math.cos(pose?.roll ?? 0), Math.sin(pose?.roll ?? 0)];
    const [spinCos, spinSin] = [Math.cos(pose?.wheelTurn ?? 0), Math.sin(pose?.wheelTurn ?? 0)];
    const [steerCos, steerSin] = [Math.cos(pose?.steer ?? 0), Math.sin(pose?.steer ?? 0)];
    const center = pose?.center ?? 0;
    const { model, vertices, wheelOf, axles } = this;
    // Where the picture is on the canvas, to paste only that.
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0, j = 0, n = 0; i < model.length; i += 8, j += STRIDE, n++) {
      let [x, y, z] = [model[i]!, model[i + 1]!, model[i + 2]!];
      let [nx, ny, nz] = [model[i + 5]! / 100, model[i + 6]! / 100, model[i + 7]! / 100];
      let lift = place.at[1];
      const wheel = wheelOf[n]!;
      if (pose && wheel >= 0) {
        // A wheel rolls round its axle, the front ones steer, and each stays on its own bit of floor.
        const [ax, ay, az] = axles[wheel]!;
        let [dy, dz] = [y - ay, z - az];
        [dy, dz] = [dy * spinCos - dz * spinSin, dy * spinSin + dz * spinCos];
        let dx = x - ax;
        if (wheel >= 2) [dx, dz] = [dx * steerCos + dz * steerSin, -dx * steerSin + dz * steerCos];
        [x, y, z] = [ax + dx, ay + dy, az + dz];
        lift = pose.wheelY[wheel]!;
      } else if (pose) {
        // The body leans on its springs around its center of mass.
        let [dy, dz] = [y - BODY_PIVOT_HEIGHT, z - center];
        [dy, dz] = [dy * pitchCos + dz * pitchSin, -dy * pitchSin + dz * pitchCos];
        [ny, nz] = [ny * pitchCos + nz * pitchSin, -ny * pitchSin + nz * pitchCos];
        let dx = x;
        [dx, dy] = [dx * rollCos - dy * rollSin, dx * rollSin + dy * rollCos];
        [nx, ny] = [nx * rollCos - ny * rollSin, nx * rollSin + ny * rollCos];
        [x, y, z] = [dx, BODY_PIVOT_HEIGHT + dy, center + dz];
      }
      const seen = camera.toCamera([place.at[0] + (x * cos + z * sin) * k, lift + y * k, place.at[2] + (-x * sin + z * cos) * k]);
      const lit = 0.45 + 0.55 * Math.max(0, (nx * cos + nz * sin) * light[0] + ny * light[1] + (-nx * sin + nz * cos) * light[2]);
      vertices.set(seen, j);
      vertices[j + 3] = model[i + 3]! / 1024;
      vertices[j + 4] = model[i + 4]! / 1024;
      vertices[j + 5] = vertices[j + 6] = vertices[j + 7] = lit;
      if (seen[2] > NEAR) {
        const scale = (camera.focal / seen[2]) * view.scale;
        const sx = view.x + STAGE_WIDTH / 2 * view.scale + seen[0] * scale;
        const sy = view.y + STAGE_HEIGHT / 2 * view.scale - seen[1] * scale;
        [left, top, right, bottom] = [Math.min(left, sx), Math.min(top, sy), Math.max(right, sx), Math.max(bottom, sy)];
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    this.attributes();
    gl.uniform1f(this.uniforms.alpha, 1);
    gl.uniform1f(this.uniforms.burnt, place.burnt ?? 0);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    const glass = this.ranges.filter((range) => SEDAN_MATERIALS[range.material]!.glass);
    for (const range of this.ranges) {
      if (glass.includes(range)) continue;
      const paint = place.paint && PAINTED.has(SEDAN_MATERIALS[range.material]!.file) ? place.paint : null;
      gl.uniform4f(this.uniforms.paint, (paint?.[0] ?? 0) / 255, (paint?.[1] ?? 0) / 255, (paint?.[2] ?? 0) / 255, paint ? 1 : 0);
      this.drawRange(range);
    }
    gl.uniform4f(this.uniforms.paint, 0, 0, 0, 0);

    if (extra.length > 0) {
      const extraVertices: number[] = [];
      const extraIndices: number[] = [];
      for (const face of extra) {
        const first = extraVertices.length / STRIDE;
        for (const corner of face.corners) extraVertices.push(...camera.toCamera(corner), 0, 0, face.color[0] / 255, face.color[1] / 255, face.color[2] / 255);
        for (let i = 1; i < face.corners.length - 1; i++) extraIndices.push(first, first + i, first + i + 1);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.extraVertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(extraVertices), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.extraIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(extraIndices), gl.DYNAMIC_DRAW);
      this.attributes();
      gl.bindTexture(gl.TEXTURE_2D, this.white);
      gl.drawElements(gl.TRIANGLES, extraIndices.length, gl.UNSIGNED_SHORT, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      this.attributes();
    }

    // The windshield last, see-through, over whatever is behind it.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(this.uniforms.alpha, 0.45);
    for (const range of glass) this.drawRange(range);
    gl.depthMask(true);
    // The player sitting in it can reach a little past the car.
    const [x, y] = [Math.max(0, Math.floor(left) - 40), Math.max(0, Math.floor(top) - 40)];
    const [width, height] = [Math.min(canvas.width, Math.ceil(right) + 40) - x, Math.min(canvas.height, Math.ceil(bottom) + 40) - y];
    return { canvas, x, y, width: Math.max(0, width), height: Math.max(0, height) };
  }

  private drawRange(range: { material: number; start: number; count: number }): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textures[range.material]!);
    gl.drawElements(gl.TRIANGLES, range.count, gl.UNSIGNED_SHORT, range.start * 2);
  }

  /** Points the shader at the bound vertex buffer. */
  private attributes(): void {
    const gl = this.gl;
    const bytes = STRIDE * 4;
    for (const [name, count, offset] of [["position", 3, 0], ["uv", 2, 3], ["color", 3, 5]] as const) {
      const location = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, count, gl.FLOAT, false, bytes, offset * 4);
    }
  }
}
