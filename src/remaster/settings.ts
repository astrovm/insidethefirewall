// Player settings, kept in the browser.

import { canBind, defaultKeys, MOVES, normalKey, type Keys } from "../input.ts";

export type TouchControls = "auto" | "on" | "off";

export interface Settings {
  /** 0 to 1. */
  music: number;
  effects: number;
  touch: TouchControls;
  /** Game speed, from 0.05 to 5: slower for players who need more time to react, faster for a challenge. */
  speed: number;
  keys: Keys;
}

const KEY = "insidethefirewall.settings";

export const defaults: Settings = { music: 0.8, effects: 1, touch: "auto", speed: 1, keys: defaultKeys };

export const SLOWEST = 0.05;
export const FASTEST = 5;
/** The speed slider moves in 5% steps. */
const STEPS_PER_ONE = 20;

/** A speed from the slider's range, on a 5% step. */
export function gameSpeed(value: unknown, fallback = 1): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(FASTEST, Math.max(SLOWEST, value));
  return Math.round(clamped * STEPS_PER_ONE) / STEPS_PER_ONE;
}

/** Saved keys, if every move has some and no key does two moves. */
function parseKeys(value: unknown, fallback: Keys): Keys {
  if (!value || typeof value !== "object") return fallback;
  const keys: Partial<Keys> = {};
  const seen = new Set<string>();
  for (const move of MOVES) {
    const list: unknown = (value as Record<string, unknown>)[move];
    if (!Array.isArray(list) || list.length === 0 || list.length > 4) return fallback;
    for (const key of list) {
      if (typeof key !== "string" || key.length === 0 || key.length > 20 || !canBind(key)) return fallback;
      if (seen.has(normalKey(key))) return fallback;
      seen.add(normalKey(key));
    }
    keys[move] = list.map(normalKey);
  }
  return keys as Keys;
}

const volume = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

/** Saved settings, with anything missing or broken replaced by the defaults. */
export function parseSettings(saved: string | null, fallback = defaults): Settings {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(saved ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    // Broken JSON: use the defaults.
  }
  return {
    music: volume(data.music, fallback.music),
    effects: volume(data.effects, fallback.effects),
    touch: data.touch === "on" || data.touch === "off" || data.touch === "auto" ? data.touch : fallback.touch,
    speed: gameSpeed(data.speed, fallback.speed),
    keys: parseKeys(data.keys, fallback.keys),
  };
}

export function loadSettings(storage: Pick<Storage, "getItem"> | null, fallback = defaults): Settings {
  try {
    return parseSettings(storage?.getItem(KEY) ?? null, fallback);
  } catch {
    return { ...fallback };
  }
}

export function saveSettings(storage: Pick<Storage, "setItem"> | null, settings: Settings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage: the settings last until the page closes.
  }
}

/** Whether to show the on-screen buttons. Auto shows them on touch screens. */
export function showTouch(setting: TouchControls, touchScreen: boolean): boolean {
  return setting === "on" || (setting === "auto" && touchScreen);
}
