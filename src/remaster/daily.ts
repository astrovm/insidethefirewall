// The daily run: one seed per day, the same for everyone, and a line to share.

import type { Grab } from "./game.ts";
import { formatTime } from "./render.ts";

/** Daily run #1 was on 18 October 2026. */
const FIRST_DAY = Date.UTC(2026, 9, 18);
const DAY = 24 * 60 * 60 * 1000;

/** Today's daily run number, by the player's own calendar day, like Wordle. */
export function dayNumber(date: Date): number {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.floor((today - FIRST_DAY) / DAY) + 1);
}

/** Small seeded random generator, so everyone gets the same spots and power-ups each day. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grabEmoji: Record<Grab, string> = { penguin: "🐧", jetpack: "🚀", shield: "🛡️", freeze: "❄️" };
/** Enough emoji to tell the story of a run without flooding the message. */
const MOST_EMOJI = 12;

/** What the Share button sends: the run, what was grabbed, and the link. */
export function shareText(seconds: number, grabbed: Grab[], url: string, day: number | null): string {
  const name = day === null ? "Inside the firewall" : `Inside the firewall daily #${day}`;
  const shown = grabbed.slice(0, MOST_EMOJI).map((grab) => grabEmoji[grab]).join("");
  const more = grabbed.length > MOST_EMOJI ? `+${grabbed.length - MOST_EMOJI}` : "";
  return [`${name} · ${formatTime(seconds)}`, shown + more, url].filter(Boolean).join("\n");
}
