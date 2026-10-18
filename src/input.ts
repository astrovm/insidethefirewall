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

/** The 2013 controls: W, A, S, D, Space and the arrows. */
export function moveForKey(key: string): Move | null {
  switch (key.length === 1 ? key.toLowerCase() : key) {
    case "a":
    case "ArrowLeft":
      return "left";
    case "d":
    case "ArrowRight":
      return "right";
    case "s":
    case "ArrowDown":
      return "down";
    case "w":
    case " ":
    case "ArrowUp":
      return "jump";
    default:
      return null;
  }
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
    };
    this.jumpPressed = false;
    return input;
  }
}
