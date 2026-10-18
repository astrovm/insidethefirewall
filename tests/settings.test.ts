import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { defaults, loadSettings, parseSettings, saveSettings, showTouch } from "../src/remaster/settings.ts";

const KEY = "insidethefirewall.settings";

/** In-memory storage, like localStorage. */
function memory(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("settings", () => {
  test("default to full sound effects, quieter music and auto touch buttons", () => {
    expect(defaults).toEqual({ music: 0.8, effects: 1, touch: "auto" });
  });

  test("come back the same after saving", () => {
    const storage = memory();
    const settings = { music: 0.25, effects: 0, touch: "off" as const };
    saveSettings(storage, settings);
    expect(JSON.parse(storage.items.get(KEY)!)).toEqual(settings);
    expect(loadSettings(storage)).toEqual(settings);
  });

  test("fill in anything missing with the defaults", () => {
    expect(parseSettings('{"music":0.5}')).toEqual({ ...defaults, music: 0.5 });
    expect(parseSettings(null)).toEqual(defaults);
  });

  test("replace broken or strange values with the defaults", () => {
    for (const saved of ["", "not json", "[1,2]", "null", "42", '"text"', "{"]) {
      expect(parseSettings(saved)).toEqual(defaults);
    }
    expect(parseSettings('{"music":"loud","effects":null,"touch":"sometimes"}')).toEqual(defaults);
    expect(parseSettings('{"music":1e999,"effects":-1e999}')).toEqual(defaults);
  });

  test("ignore settings that no longer exist", () => {
    expect(parseSettings('{"calm":true,"music":0.1}')).toEqual({ ...defaults, music: 0.1 });
  });

  test("keep volumes between 0 and 1", () => {
    expect(parseSettings('{"music":3,"effects":-2}')).toMatchObject({ music: 1, effects: 0 });
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (music, effects) => {
        const result = parseSettings(JSON.stringify({ music, effects }) ?? null);
        return [result.music, result.effects].every((v) => v >= 0 && v <= 1);
      }),
    );
  });

  test("accept every touch choice", () => {
    for (const touch of ["auto", "on", "off"] as const) {
      for (const fallback of ["auto", "on", "off"] as const) {
        expect(parseSettings(JSON.stringify({ touch }), { ...defaults, touch: fallback }).touch).toBe(touch);
      }
    }
  });

  test("work without storage, or when the browser blocks it", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    for (const storage of [null, blocked]) {
      const settings = loadSettings(storage);
      expect(settings).toEqual(defaults);
      // A copy, so changing it leaves the defaults alone.
      expect(settings).not.toBe(defaults);
      expect(() => saveSettings(storage, settings)).not.toThrow();
    }
  });
});

test("touch buttons show on touch screens, unless turned on or off", () => {
  expect(showTouch("auto", true)).toBe(true);
  expect(showTouch("auto", false)).toBe(false);
  expect(showTouch("on", false)).toBe(true);
  expect(showTouch("off", true)).toBe(false);
});
