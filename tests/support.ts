import { World } from "../src/engine/world.ts";
import { createClassic } from "../src/game/classic.ts";

/** Small seeded random generator, so every run plays out the same. */
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

export function newWorld(seed = 1): World {
  const world = new World(createClassic(), seeded(seed));
  world.greenFlag();
  world.step();
  return world;
}

export function run(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.step();
}

export function runUntil(world: World, done: () => boolean, limit = 3000): number {
  for (let i = 0; i < limit; i++) {
    if (done()) return i;
    world.step();
  }
  throw new Error(`Condition not met after ${limit} ticks`);
}

export function press(world: World, key: string): void {
  world.keyDown(key);
  world.keyUp(key);
}

/** Presses Space on the title screen and returns once the game has started. */
export function startGame(world: World): void {
  press(world, "space");
  runUntil(world, () => world.vars.time === 0, 20);
}

/** Puts the virus right on the player, so the next step registers a hit. */
export function touchPlayer(world: World): void {
  const player = world.sprite("player");
  const virus = world.sprite("virus");
  virus.x = player.x;
  virus.y = player.y;
}

export function soundsPlayed(world: World): string[] {
  return world.soundEvents.flatMap((event) => (event.type === "play" ? [event.sound] : ["stop"]));
}
