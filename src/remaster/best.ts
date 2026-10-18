// The best time, kept in the browser.

import { formatTime } from "./render.ts";

const KEY = "insidethefirewall.best";
export const DAILY_KEY = "insidethefirewall.daily";

/**
 * The longest time survived, kept in the browser, with the game speed it was
 * played at. Works without storage too, it just forgets. A daily best only
 * counts for its own day.
 */
export class Best {
  private seconds = 0;
  private playedAt = 1;

  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem"> | null,
    private readonly key = KEY,
    private readonly day: number | null = null,
  ) {
    try {
      this.load(storage?.getItem(key) ?? null);
    } catch {
      // Storage can be blocked. Start from zero.
    }
  }

  /** Saved as {"seconds", "speed", "day"}. Older versions saved only the seconds. */
  private load(saved: string | null): void {
    let data: unknown = null;
    try {
      data = JSON.parse(saved ?? "null");
    } catch {
      return;
    }
    if (typeof data === "number") data = { seconds: data, speed: 1, day: null };
    if (!data || typeof data !== "object") return;
    const { seconds, speed, day = null } = data as Record<string, unknown>;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0 || day !== this.day) return;
    this.seconds = Math.floor(seconds);
    this.playedAt = typeof speed === "number" && speed > 0 && speed < 1 ? speed : 1;
  }

  get value(): number {
    return this.seconds;
  }

  /** The game speed the best time was played at, 1 for full speed. */
  get speed(): number {
    return this.playedAt;
  }

  /** The best time, with the game speed when it wasn't full speed. */
  get label(): string {
    const time = formatTime(this.seconds);
    return this.playedAt < 1 ? `${time} at ${Math.round(this.playedAt * 100)}%` : time;
  }

  /** Saves the time if it's a new best, and says whether it was. */
  record(seconds: number, speed = 1): boolean {
    const whole = Math.floor(seconds);
    if (whole <= this.seconds) return false;
    this.seconds = whole;
    this.playedAt = speed;
    try {
      this.storage?.setItem(this.key, JSON.stringify({ seconds: whole, speed, day: this.day }));
    } catch {
      // Keep it for this visit at least.
    }
    return true;
  }
}
