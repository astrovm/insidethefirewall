import { expect, test } from "bun:test";
import fc from "fast-check";
import { bindKey, canBind, defaultKeys, keyLabel, MOVES, moveForKey, type Keys } from "../src/input.ts";

test("a new key replaces the move's keys, and the move it came from loses it", () => {
  const keys = bindKey(defaultKeys, "jump", "a");
  expect(keys.jump).toEqual(["a"]);
  expect(keys.left).toEqual(["ArrowLeft"]);
  expect(moveForKey("A", keys)).toBe("jump");
  expect(moveForKey(" ", keys)).toBeNull();
  expect(moveForKey("ArrowLeft", keys)).toBe("left");
  expect(defaultKeys.jump).toEqual(["w", " ", "ArrowUp"]);
});

test("a move left with no keys gets the old key of the move that took its key", () => {
  const keys: Keys = { left: ["j"], right: ["l"], down: ["k"], jump: ["i"] };
  expect(bindKey(keys, "jump", "J")).toEqual({ left: ["i"], right: ["l"], down: ["k"], jump: ["j"] });
  expect(bindKey(keys, "jump", "i")).toEqual(keys);
});

test("every move keeps a key and no key does two moves, whatever gets bound", () => {
  const key = fc.constantFrom("a", "d", "s", "w", " ", "ArrowLeft", "ArrowUp", "j", "K", "Shift");
  fc.assert(
    fc.property(fc.array(fc.tuple(fc.constantFrom(...MOVES), key), { maxLength: 30 }), (steps) => {
      let keys = defaultKeys;
      for (const [move, k] of steps) keys = bindKey(keys, move, k);
      const all = MOVES.flatMap((move) => keys[move]);
      return MOVES.every((move) => keys[move].length > 0) && new Set(all).size === all.length;
    }),
  );
});

test("keys the game uses for other things can't be bound", () => {
  expect(["Escape", "p", "P", "f", "r", "Tab", "Enter", "Dead", "Unidentified"].map(canBind)).toEqual(Array(9).fill(false));
  expect(["a", "Shift", "ArrowUp", " ", "1"].map(canBind)).toEqual(Array(5).fill(true));
});

test("keys show as short names", () => {
  expect([" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "Shift"].map(keyLabel)).toEqual([
    "Space",
    "←",
    "→",
    "↑",
    "↓",
    "A",
    "Shift",
  ]);
});
