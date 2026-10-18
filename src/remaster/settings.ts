// Player settings, kept in the browser.

export type TouchControls = "auto" | "on" | "off";

export interface Settings {
  /** 0 to 1. */
  music: number;
  effects: number;
  touch: TouchControls;
}

const KEY = "insidethefirewall.settings";

export const defaults: Settings = { music: 0.8, effects: 1, touch: "auto" };

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
