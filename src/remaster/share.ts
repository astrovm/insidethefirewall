// The line the Share button sends.

import type { Grab } from "./game.ts";
import { formatTime } from "./render.ts";

const grabEmoji: Record<Grab, string> = {
  penguin: "🐧",
  jetpack: "🚀",
  shield: "🛡️",
  freeze: "❄️",
  pill: "💊",
  shoes: "👟",
  portal: "🌀",
  ball: "🧱",
};
/** Enough emoji to tell the story of a run without flooding the message. */
const MOST_EMOJI = 12;

/** The run, what was grabbed, and the link. */
export function shareText(seconds: number, grabbed: Grab[], url: string): string {
  const shown = grabbed.slice(0, MOST_EMOJI).map((grab) => grabEmoji[grab]).join("");
  const more = grabbed.length > MOST_EMOJI ? `+${grabbed.length - MOST_EMOJI}` : "";
  return [`Inside the firewall · ${formatTime(seconds)}`, shown + more, url].filter(Boolean).join("\n");
}
