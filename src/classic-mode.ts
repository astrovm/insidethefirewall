// Classic mode: the 2013 Scratch game as it was, with the Scratch stage,
// variable monitors and green flag bar.

import type { Audio } from "./audio.ts";
import { FPS, World } from "./engine/world.ts";
import { createClassic } from "./game/classic.ts";
import { scratchKey } from "./input.ts";
import { Renderer, type CostumeImages } from "./render.ts";

const MAX_STEPS_PER_FRAME = 4;
const CONTROLS_HEIGHT = 48;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class ClassicMode {
  world = new World(createClassic());
  private readonly root = $("classic");
  private readonly canvas = $<HTMLCanvasElement>("stage");
  private readonly controls = $("controls");
  private readonly pauseButton = $<HTMLButtonElement>("pause");
  private readonly flag = $("flag");
  private readonly renderer: Renderer;
  private paused = false;
  private pending = 0;
  private readonly padKeys = new Set<string>();

  constructor(
    images: CostumeImages,
    private readonly audio: Audio,
    onBack: () => void,
  ) {
    this.renderer = new Renderer(this.canvas, images);
    this.canvas.addEventListener("pointermove", (event) => this.world.mouseMove(...this.stagePoint(event)));
    this.canvas.addEventListener("pointerdown", (event) => {
      audio.unlock();
      this.world.mouseDown(...this.stagePoint(event));
    });
    this.flag.addEventListener("click", () => {
      this.setPaused(false);
      this.world.greenFlag();
    });
    this.pauseButton.addEventListener("click", () => this.setPaused(!this.paused));
    $("stop").addEventListener("click", () => this.world.stopAll());
    $("back").addEventListener("click", onBack);
    $("fullscreen").addEventListener("click", () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    });
  }

  get active(): boolean {
    return !this.root.hidden;
  }

  enter(): void {
    this.root.hidden = false;
    this.world = new World(createClassic());
    this.pending = 0;
    this.setPaused(false);
    this.layout();
    this.world.greenFlag();
  }

  exit(): void {
    this.world.stopAll();
    this.audio.handle(this.world.soundEvents.splice(0));
    this.root.hidden = true;
  }

  layout(): void {
    if (!this.active) return;
    const scale = Math.max(0.1, Math.min(window.innerWidth / 480, (window.innerHeight - CONTROLS_HEIGHT) / 360));
    const width = Math.floor(480 * scale);
    const height = Math.floor(360 * scale);
    this.renderer.resize(width, height, window.devicePixelRatio || 1);
    this.canvas.style.left = `${Math.floor((window.innerWidth - width) / 2)}px`;
    this.canvas.style.top = `${CONTROLS_HEIGHT + Math.floor((window.innerHeight - CONTROLS_HEIGHT - height) / 2)}px`;
    this.controls.style.width = `${width}px`;
    this.controls.style.left = this.canvas.style.left;
  }

  keyDown(event: KeyboardEvent): void {
    const key = scratchKey(event.key);
    if (!key || event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === "space" || key.endsWith("arrow")) event.preventDefault();
    this.world.keyDown(key);
  }

  keyUp(event: KeyboardEvent): void {
    const key = scratchKey(event.key);
    if (key) this.world.keyUp(key);
  }

  releaseKeys(): void {
    for (const key of [...this.world.keys]) this.world.keyUp(key);
  }

  frame(elapsedMs: number): void {
    const stepMs = 1000 / FPS;
    this.pending = this.paused ? 0 : this.pending + elapsedMs;
    let steps = 0;
    while (this.pending >= stepMs && steps < MAX_STEPS_PER_FRAME) {
      this.pollGamepads();
      this.world.step();
      this.audio.handle(this.world.soundEvents.splice(0));
      this.pending -= stepMs;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.pending = 0;
    this.flag.classList.toggle("active", this.world.scheduler.threads.length > 0);
    this.renderer.draw(this.world, Math.min(1, this.pending / stepMs));
  }

  private setPaused(value: boolean): void {
    this.paused = value;
    this.pauseButton.classList.toggle("paused", value);
    this.pauseButton.title = value ? "Resume" : "Pause";
    this.pauseButton.setAttribute("aria-label", this.pauseButton.title);
    if (value) this.audio.pause();
    else this.audio.unlock();
  }

  private stagePoint(event: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [((event.clientX - rect.left) / rect.width) * 480 - 240, 180 - ((event.clientY - rect.top) / rect.height) * 360];
  }

  /** Gamepads: D-pad or left stick move, A jumps, Start restarts. */
  private pollGamepads(): void {
    const pressed = new Set<string>();
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const button = (i: number) => pad.buttons[i]?.pressed ?? false;
      const [ax = 0, ay = 0] = pad.axes;
      if (button(12) || ay < -0.5) pressed.add("up arrow");
      if (button(13) || ay > 0.5) pressed.add("down arrow");
      if (button(14) || ax < -0.5) pressed.add("left arrow");
      if (button(15) || ax > 0.5) pressed.add("right arrow");
      if (button(0)) pressed.add("space");
      if (button(9)) pressed.add("r");
    }
    for (const key of pressed) if (!this.padKeys.has(key)) this.world.keyDown(key);
    for (const key of this.padKeys) if (!pressed.has(key)) this.world.keyUp(key);
    this.padKeys.clear();
    for (const key of pressed) this.padKeys.add(key);
  }
}
