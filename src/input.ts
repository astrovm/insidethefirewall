import type { Input } from "./remaster/game.ts";

/** DOM key names to Scratch key names. */
export function scratchKey(key: string): string | null {
  const named: Record<string, string> = {
    " ": "space",
    ArrowUp: "up arrow",
    ArrowDown: "down arrow",
    ArrowLeft: "left arrow",
    ArrowRight: "right arrow",
  };
  if (key in named) return named[key] ?? null;
  return key.length === 1 ? key.toLowerCase() : null;
}

export type Move = "left" | "right" | "down" | "jump";
export const MOVES: Move[] = ["left", "right", "down", "jump"];

/** The keys for each move, as DOM key names, lower case for letters. */
export type Keys = Record<Move, string[]>;

/** The 2013 controls: W, A, S, D, Space and the arrows. */
export const defaultKeys: Keys = {
  left: ["a", "ArrowLeft"],
  right: ["d", "ArrowRight"],
  down: ["s", "ArrowDown"],
  jump: ["w", " ", "ArrowUp"],
};

/** Keys the game already uses for something else: pause, full screen, menus. */
export const RESERVED_KEYS = ["Escape", "p", "f", "r", "Tab", "Enter"];

/** Whether a key can be given to a move. */
export function canBind(key: string): boolean {
  return key !== "Unidentified" && key !== "Dead" && !RESERVED_KEYS.includes(normalKey(key));
}

/** DOM key name as stored in Keys: letters in lower case. */
export function normalKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function moveForKey(key: string, keys: Keys = defaultKeys): Move | null {
  const normal = normalKey(key);
  return MOVES.find((move) => keys[move].includes(normal)) ?? null;
}

/**
 * Keys with `key` as the only key for `move`. Another move that used it loses
 * it, and if that leaves it with no keys, it gets the old first key of `move`
 * (which can't be `key`, since no key does two moves).
 */
export function bindKey(keys: Keys, move: Move, key: string): Keys {
  const normal = normalKey(key);
  const bound = { ...keys, [move]: [normal] };
  for (const other of MOVES) {
    if (other === move || !keys[other].includes(normal)) continue;
    const rest = keys[other].filter((k) => k !== normal);
    bound[other] = rest.length > 0 ? rest : keys[move].slice(0, 1);
  }
  return bound;
}

const keyNames: Record<string, string> = { " ": "Space", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };

/** How a key is shown in Settings. */
export function keyLabel(key: string): string {
  return keyNames[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/**
 * Moves held by any source: keys, gamepad buttons or touch buttons. Presses
 * are kept until the next game update reads them, so quick taps still count.
 */
export class Controls {
  private readonly held = new Map<string, Move>();
  private jumpPressed = false;

  press(source: string, move: Move): void {
    if (this.held.has(source)) return;
    this.held.set(source, move);
    if (move === "jump") this.jumpPressed = true;
  }

  release(source: string): void {
    this.held.delete(source);
  }

  releaseAll(): void {
    this.held.clear();
  }

  isHeld(move: Move): boolean {
    for (const held of this.held.values()) if (held === move) return true;
    return false;
  }

  /** This update's input. Clears the presses it reports. */
  read(): Input {
    const input = {
      left: this.isHeld("left"),
      right: this.isHeld("right"),
      down: this.isHeld("down"),
      jump: this.isHeld("jump"),
      jumpPressed: this.jumpPressed,
      // Space jumps, and while driving it's the handbrake, so the gas is up held some other way.
      gas: [...this.held].some(([source, move]) => move === "jump" && source !== "key:Space"),
      handbrake: this.held.has("key:Space"),
    };
    this.jumpPressed = false;
    return input;
  }
}
