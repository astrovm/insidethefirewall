import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import type { Costume } from "../src/engine/sprite.ts";
import { costumes, createClassic, sounds } from "../src/game/classic.ts";

// The 2013 project file, as exported to /classic/. The port has to match it.

interface ScratchCostume {
  md5ext: string;
  bitmapResolution?: number;
  rotationCenterX: number;
  rotationCenterY: number;
}
interface ScratchTarget {
  isStage: boolean;
  name: string;
  layerOrder: number;
  x: number;
  y: number;
  size: number;
  direction: number;
  visible: boolean;
  rotationStyle: string;
  currentCostume: number;
  costumes: ScratchCostume[];
  sounds: { name: string; md5ext: string; sampleCount: number; rate: number }[];
  variables: Record<string, [string, number]>;
}

const root = new URL("..", import.meta.url).pathname;
const project = JSON.parse(readFileSync(`${root}docs/classic/assets/project.json`, "utf8")) as {
  targets: ScratchTarget[];
  monitors: { params: { VARIABLE: string }; x: number; y: number; visible: boolean }[];
};
const targets = [...project.targets].sort((a, b) => a.layerOrder - b.layerOrder);
const md5 = (path: string) => createHash("md5").update(readFileSync(path)).digest("hex");

/** The original sprite names, back to front. */
const originals = ["Objeto4", "hl3", "Objeto5", "Objeto1", "Objeto3", "Objeto2", "Objeto6", "Button2"];

function costumeBox(costume: Costume): number[] {
  const path = `${root}src/assets/costumes/${costume.file}`;
  if (costume.file.endsWith(".svg")) {
    const viewBox = /viewBox="([^"]+)"/.exec(readFileSync(path, "utf8"))?.[1] ?? "";
    return viewBox.split(/\s+/).map(Number);
  }
  // PNG width and height, at Scratch's double resolution.
  const png = readFileSync(path);
  return [0, 0, png.readUInt32BE(16) / 2, png.readUInt32BE(20) / 2];
}

function expectSameCostumes(ours: Costume[], theirs: ScratchCostume[]): void {
  const files = ours.map((c) => md5(`${root}src/assets/costumes/${c.file}`));
  expect(files).toEqual(theirs.map((c) => c.md5ext.replace(/\..*$/, "")));
  for (const [i, costume] of ours.entries()) {
    const original = theirs[i]!;
    const resolution = original.bitmapResolution ?? 1;
    expect([costume.x, costume.y, costume.width, costume.height]).toEqual(costumeBox(costume));
    expect([costume.centerX, costume.centerY]).toEqual([
      original.rotationCenterX / resolution,
      original.rotationCenterY / resolution,
    ]);
  }
}

describe("the port matches the 2013 project file", () => {
  const classic = createClassic();

  test("sprites, in the same layer order and starting state", () => {
    expect(targets.filter((t) => !t.isStage).map((t) => t.name)).toEqual(originals);
    for (const [i, { sprite }] of classic.sprites.entries()) {
      const original = targets.find((t) => t.name === originals[i])!;
      expect(sprite.initial).toEqual({
        x: original.x,
        y: original.y,
        size: original.size,
        direction: original.direction,
        visible: original.visible,
        rotationStyle: original.rotationStyle as never,
        costume: original.currentCostume,
      });
      expectSameCostumes(sprite.costumes, original.costumes);
    }
  });

  test("the stage", () => {
    expectSameCostumes([classic.stage], targets[0]!.costumes);
    expect(classic.stage).toBe(costumes.stage);
  });

  test("variables and their monitors", () => {
    const values = Object.fromEntries(Object.values(targets[0]!.variables));
    expect(classic.variables).toEqual({ speed: values.velocidad!, health: values.Health!, time: values.Time! });
    const monitor = (name: string) => project.monitors.find((m) => m.params.VARIABLE === name)!;
    expect(classic.monitors).toEqual(
      ["Health", "Time"].map((label) => ({
        variable: label.toLowerCase(),
        label,
        x: monitor(label).x,
        y: monitor(label).y,
        visible: monitor(label).visible,
      })),
    );
  });

  test("sounds, with the same files and lengths", () => {
    const names: Record<string, keyof typeof sounds> = {
      musicloop: "music",
      glados: "glados",
      death: "death",
      laser2: "laser",
      miau: "meow",
    };
    const files = Object.fromEntries(
      readdirSync(`${root}src/assets/sounds`).map((file) => [file.split(".")[0], md5(`${root}src/assets/sounds/${file}`)]),
    );
    const originalSounds = targets.flatMap((t) => t.sounds);
    expect(originalSounds.map((s) => String(names[s.name])).sort()).toEqual(Object.keys(sounds).sort());
    for (const sound of originalSounds) {
      const name = names[sound.name]!;
      expect(classic.sounds[name]).toBe(sound.sampleCount / sound.rate);
      expect(files[name]).toBe(sound.md5ext.split(".")[0]);
    }
  });
});
