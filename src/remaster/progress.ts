// Difficulty, ranks and the best time. The game gets harder little by little.

/** Seconds until the game is as hard as it gets. */
export const HARDEST_AT = 150;

/** How hard the game is after this many seconds: 0 at the start, 1 from HARDEST_AT on. */
export function difficulty(seconds: number): number {
  return Math.min(1, Math.max(0, seconds / HARDEST_AT));
}

/** Ranks by seconds survived. */
export const RANKS = [
  { from: 0, name: "Script kiddie" },
  { from: 20, name: "Antivirus trial" },
  { from: 45, name: "Sysadmin" },
  { from: 75, name: "Firewall" },
  { from: 110, name: "Root" },
];

export function rankFor(seconds: number): string {
  let rank = RANKS[0]!.name;
  for (const r of RANKS) if (seconds >= r.from) rank = r.name;
  return rank;
}

const KEY = "insidethefirewall.best";

/** The longest time survived, kept in the browser. Works without storage too, it just forgets. */
export class Best {
  private seconds = 0;

  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem"> | null) {
    try {
      const saved = Number(storage?.getItem(KEY));
      if (Number.isFinite(saved) && saved > 0) this.seconds = Math.floor(saved);
    } catch {
      // Storage can be blocked. Start from zero.
    }
  }

  get value(): number {
    return this.seconds;
  }

  /** Saves the time if it's a new best, and says whether it was. */
  record(seconds: number): boolean {
    const whole = Math.floor(seconds);
    if (whole <= this.seconds) return false;
    this.seconds = whole;
    try {
      this.storage?.setItem(KEY, String(whole));
    } catch {
      // Keep it for this visit at least.
    }
    return true;
  }
}
