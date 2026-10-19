import { describe, expect, test } from "bun:test";
import { BLEND, fromTurn, Homer, HomerMoves, toQuat, type HomerData, type MoveAt } from "../src/remaster/homer.ts";
import { VIRUS_HEIGHT, virusMesh } from "../src/remaster/virus.ts";

const QUARTER: [number, number, number, number] = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
const STILL: [number, number, number, number] = [0, 0, 0, 1];

/** A made-up arm: a root, and an elbow a meter up it that turns a quarter round z over a second. */
function arm(): Homer {
  const data: HomerData = {
    bones: [
      { name: "Root", parent: 0, matrix: [...fromTurn(STILL, [0, 0, 0])] },
      { name: "Elbow", parent: 0, matrix: [...fromTurn(STILL, [0, 1, 0])] },
    ],
    parts: [
      {
        texture: "skin.png",
        // A hand a meter past the elbow, and a foot on the root.
        position: [0, 2, 0, 1, 0, 0],
        uv: [0, 0, 1, 1],
        normal: [0, 1, 0, 1, 0, 0],
        joints: [1, 0, 0, 0, 0, 0, 0, 0],
        weights: [1, 0, 0, 0, 1, 0, 0, 0],
        indices: [0, 1, 0],
      },
    ],
    animations: {
      loco_walk: { duration: 1, tracks: [{ bone: 1, kind: "quaternion", times: [0, 1], values: [...STILL, ...QUARTER] }] },
      jump_idle_land: { duration: 1, tracks: [{ bone: 1, kind: "quaternion", times: [0, 1], values: [...STILL, ...QUARTER] }] },
    },
  };
  return new Homer(data);
}

function posed(homer: Homer, now: MoveAt, from: MoveAt | null, blend: number) {
  const [positions, normals] = [new Float32Array(homer.corners * 3), new Float32Array(homer.corners * 3)];
  homer.pose(now, from, blend, positions, normals);
  return { hand: [...positions.slice(0, 3)], handNormal: [...normals.slice(0, 3)], foot: [...positions.slice(3, 6)] };
}

const close = (actual: number[], expected: number[]) => actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 5));

describe("Homer's skin", () => {
  test("follows the bones it hangs on, turning with them", () => {
    const homer = arm();
    expect(homer.corners).toBe(2);
    let pose = posed(homer, { move: "loco_walk", time: 0 }, null, 1);
    close(pose.hand, [0, 2, 0]);
    pose = posed(homer, { move: "loco_walk", time: 0.5 }, null, 1);
    // Halfway: an eighth of a turn round the elbow, and its normal turns too.
    close(pose.hand, [-Math.SQRT1_2, 1 + Math.SQRT1_2, 0]);
    close(pose.handNormal, [-Math.SQRT1_2, Math.SQRT1_2, 0]);
    // The foot hangs on the root, which doesn't move.
    close(pose.foot, [1, 0, 0]);
  });

  test("loops the moves that loop, and holds the end of the others", () => {
    const homer = arm();
    close(posed(homer, { move: "loco_walk", time: 1.5 }, null, 1).hand, posed(homer, { move: "loco_walk", time: 0.5 }, null, 1).hand);
    close(posed(homer, { move: "jump_idle_land", time: 5 }, null, 1).hand, [-1, 1, 0]);
    // A move it doesn't have is its resting pose.
    close(posed(homer, { move: "flail", time: 0.3 }, null, 1).hand, [0, 2, 0]);
  });

  test("blends from the last move into the next", () => {
    const homer = arm();
    const pose = posed(homer, { move: "jump_idle_land", time: 1 }, { move: "loco_walk", time: 0 }, 0.5);
    close(pose.hand, [-Math.SQRT1_2, 1 + Math.SQRT1_2, 0]);
  });

  test("moves blend for a moment when Homer changes what he's doing", () => {
    const moves = new HomerMoves();
    moves.update("loco_idle_rest", 0.5);
    expect([moves.now.move, moves.from, moves.blend]).toEqual(["loco_idle_rest", null, 1]);
    moves.update("loco_walk", 0.05, 2);
    expect([moves.now, moves.from?.move]).toEqual([{ move: "loco_walk", time: 0 }, "loco_idle_rest"]);
    expect(moves.blend).toBeCloseTo(1 / 3, 9);
    moves.update("loco_walk", 0.05, 2);
    // Twice as fast.
    expect(moves.now.time).toBeCloseTo(0.1, 9);
    moves.update("loco_walk", BLEND);
    expect([moves.from, moves.blend]).toEqual([null, 1]);
  });

  test("turns read off a matrix are the turns that made it", () => {
    for (const q of [STILL, QUARTER, [0.5, 0.5, 0.5, 0.5], [0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 0]] as [number, number, number, number][]) {
      const back = toQuat(fromTurn(q, [1, 2, 3]));
      const sign = Math.sign(back.find((c) => Math.abs(c) > 1e-6)!) * Math.sign(q.find((c) => Math.abs(c) > 1e-6)!);
      close(back.map((c) => c * sign), q);
    }
  });
});

describe("the 3D virus", () => {
  test("is a whole shape, as tall as its pixel art, with legs that wiggle", () => {
    const mesh = virusMesh(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.colors.length).toBe(mesh.positions.length);
    expect(mesh.triangles.length % 3).toBe(0);
    for (const i of mesh.triangles) expect(i).toBeLessThan(mesh.positions.length);
    for (const normal of mesh.normals) expect(Math.hypot(...normal)).toBeCloseTo(1, 5);
    const heights = mesh.positions.map((p) => p[1]);
    expect(Math.max(...heights)).toBeLessThanOrEqual(VIRUS_HEIGHT + 0.5);
    expect(Math.min(...heights)).toBeGreaterThan(-2);
    // Under 65536 corners, for WebGL's 16-bit triangles.
    expect(mesh.positions.length).toBeLessThan(65536);
    expect(virusMesh(0.2).positions).not.toEqual(mesh.positions);
  });
});
