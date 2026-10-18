import { Scheduler, type Script, type Thread } from "./threads.ts";
import type { Costume, Sprite, SpriteState } from "./sprite.ts";

/** The 2013 game ran at Scratch's 30 frames per second. */
export const FPS = 30;

export type Hat = { flag: true } | { broadcast: string } | { key: string } | { click: true };

export interface ScriptDef {
  hat: Hat;
  run: (world: World, self: Sprite) => Script;
}

export interface SpriteDef {
  sprite: Sprite;
  scripts: ScriptDef[];
}

export interface MonitorDef {
  variable: string;
  label: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface Project {
  stage: Costume;
  /** Back to front. */
  sprites: SpriteDef[];
  variables: Record<string, number>;
  monitors: MonitorDef[];
  /** Sound lengths in seconds, for "play sound until done". */
  sounds: Record<string, number>;
}

export type SoundEvent = { type: "play"; owner: string; sound: string } | { type: "stopAll" };

const elapsedMs = (ticks: number) => (ticks * 1000) / FPS;

export class World {
  readonly scheduler = new Scheduler();
  readonly sprites = new Map<string, SpriteDef>();
  layers: string[] = [];
  vars: Record<string, number> = {};
  monitors: Record<string, boolean> = {};
  tick = 0;
  keys = new Set<string>();
  /** Scratch starts the pointer at the top-left corner of the stage. */
  mouse = { x: -240, y: 180 };
  soundEvents: SoundEvent[] = [];
  /** Counts "stop all sounds", so "play until done" can end early like Scratch. */
  private soundStops = 0;
  /** Sprite states before the last step, for drawing between frames. */
  previous = new Map<string, SpriteState>();

  constructor(
    readonly project: Project,
    readonly random: () => number = Math.random,
  ) {
    for (const def of project.sprites) this.sprites.set(def.sprite.name, def);
    this.reset();
  }

  /** Back to the state the project was saved in. */
  reset(): void {
    this.scheduler.stopAll();
    for (const { sprite } of this.project.sprites) sprite.reset();
    this.layers = this.project.sprites.map(({ sprite }) => sprite.name);
    this.vars = { ...this.project.variables };
    this.monitors = Object.fromEntries(this.project.monitors.map((m) => [m.variable, m.visible]));
    this.previous.clear();
  }

  sprite(name: string): Sprite {
    const def = this.sprites.get(name);
    if (!def) throw new Error(`No sprite ${name}`);
    return def.sprite;
  }

  /** Front-most sprite first, the order Scratch starts hats in. */
  private executionOrder(): SpriteDef[] {
    return [...this.layers].reverse().map((name) => this.sprites.get(name) as SpriteDef);
  }

  private startHats(match: (hat: Hat) => boolean, restart: boolean, only?: SpriteDef): Thread[] {
    const started: Thread[] = [];
    for (const def of only ? [only] : this.executionOrder()) {
      for (const script of def.scripts) {
        if (!match(script.hat)) continue;
        const thread = this.scheduler.start(def.sprite.name, script, () => script.run(this, def.sprite), restart);
        if (thread) started.push(thread);
      }
    }
    return started;
  }

  greenFlag(): void {
    this.stopAll();
    this.startHats((hat) => "flag" in hat, true);
  }

  stopAll(): void {
    this.scheduler.stopAll();
    this.stopAllSounds();
  }

  step(): void {
    this.previous.clear();
    for (const { sprite } of this.project.sprites) {
      if (sprite.visible) this.previous.set(sprite.name, sprite.snapshot());
    }
    this.tick++;
    this.scheduler.step();
  }

  // Input. Events start hats right away, and the threads run on the next step.

  keyDown(key: string): void {
    this.keys.add(key);
    this.startHats((hat) => "key" in hat && hat.key === key, false);
  }

  keyUp(key: string): void {
    this.keys.delete(key);
  }

  keyPressed(...keys: string[]): boolean {
    return keys.some((key) => this.keys.has(key));
  }

  mouseMove(x: number, y: number): void {
    this.mouse = { x, y };
  }

  /** Clicks go to the front-most visible sprite under the pointer. */
  mouseDown(x: number, y: number): void {
    this.mouseMove(x, y);
    const target = this.executionOrder().find(({ sprite }) => sprite.visible && sprite.isOpaqueAt(x, y));
    if (target) this.startHats((hat) => "click" in hat, true, target);
  }

  touchingMouse(sprite: Sprite): boolean {
    return sprite.visible && sprite.isOpaqueAt(this.mouse.x, this.mouse.y);
  }

  // Blocks used by the scripts.

  broadcast(name: string): Thread[] {
    return this.startHats((hat) => "broadcast" in hat && hat.broadcast === name, true);
  }

  *broadcastAndWait(name: string): Script {
    const threads = this.broadcast(name);
    while (threads.some((thread) => this.scheduler.isRunning(thread))) yield;
  }

  *wait(seconds: number): Script {
    const start = this.tick;
    yield;
    while (elapsedMs(this.tick - start) < seconds * 1000) yield;
  }

  *glide(sprite: Sprite, seconds: number, x: number, y: number): Script {
    const duration = Math.max(0, seconds * 1000);
    const startX = sprite.x;
    const startY = sprite.y;
    const start = this.tick;
    if (duration > 0) {
      yield;
      for (;;) {
        const t = elapsedMs(this.tick - start) / duration;
        if (t >= 1) break;
        sprite.setXY(startX + (x - startX) * t, startY + (y - startY) * t);
        yield;
      }
    }
    sprite.setXY(x, y);
  }

  playSound(owner: Sprite, sound: string): void {
    this.soundEvents.push({ type: "play", owner: owner.name, sound });
  }

  *playUntilDone(owner: Sprite, sound: string): Script {
    this.playSound(owner, sound);
    const stops = this.soundStops;
    const start = this.tick;
    const length = (this.project.sounds[sound] ?? 0) * 1000;
    yield;
    while (this.soundStops === stops && elapsedMs(this.tick - start) < length) yield;
  }

  stopAllSounds(): void {
    this.soundStops++;
    this.soundEvents.push({ type: "stopAll" });
  }

  goToFront(sprite: Sprite): void {
    this.layers = [...this.layers.filter((name) => name !== sprite.name), sprite.name];
  }

  stopOtherScripts(sprite: Sprite): void {
    this.scheduler.stopOthers(sprite.name);
  }

  /** Scratch's "pick random" with whole numbers. */
  randomInt(from: number, to: number): number {
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    return low + Math.floor(this.random() * (high + 1 - low));
  }
}
