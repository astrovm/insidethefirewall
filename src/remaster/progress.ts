// Stages, ranks and the best time. The game gets harder in clear steps, and
// the rank is named after the last stage reached.

export type ThreatKind = "worm" | "popup" | "trojan";

export interface Stage {
  /** Seconds survived when the stage starts. */
  from: number;
  name: string;
  rank: string;
  /** Virus speed in stage pixels per second. */
  virusSpeed: number;
  /** Seconds between threats of each kind, from shortest to longest. */
  every: Partial<Record<ThreatKind, [number, number]>>;
}

export const STAGES: Stage[] = [
  { from: 0, name: "Infected", rank: "Script kiddie", virusSpeed: 165, every: {} },
  { from: 20, name: "Worms", rank: "Antivirus trial", virusSpeed: 210, every: { worm: [6, 9] } },
  { from: 45, name: "Popups", rank: "Sysadmin", virusSpeed: 255, every: { worm: [6, 9], popup: [3, 5] } },
  {
    from: 75,
    name: "Trojan horse",
    rank: "Firewall",
    virusSpeed: 300,
    every: { worm: [5, 8], popup: [3, 5], trojan: [10, 14] },
  },
  {
    from: 110,
    name: "Meltdown",
    rank: "Root",
    virusSpeed: 345,
    every: { worm: [3, 6], popup: [2, 4], trojan: [8, 12] },
  },
];

/** The stage reached after this many seconds. */
export function stageAt(seconds: number): number {
  let stage = 0;
  for (const [i, s] of STAGES.entries()) if (seconds >= s.from) stage = i;
  return stage;
}

export function rankFor(seconds: number): string {
  return STAGES[stageAt(seconds)]!.rank;
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
