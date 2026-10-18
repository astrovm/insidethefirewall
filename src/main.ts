import { Audio } from "./audio.ts";
import { applyMask, type Costume } from "./engine/sprite.ts";
import { FPS, World } from "./engine/world.ts";
import { createClassic, sounds } from "./game/classic.ts";
import { scratchKey } from "./input.ts";
import { Renderer, type CostumeImages } from "./render.ts";

const MASK_SCALE = 2;
const MAX_STEPS_PER_FRAME = 4;
const CONTROLS_HEIGHT = 48;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function fetchAll(files: string[], onProgress: (fraction: number) => void): Promise<Map<string, ArrayBuffer>> {
  const loaded = new Map<string, number>();
  const totals = new Map<string, number>();
  const report = () => {
    const total = [...totals.values()].reduce((a, b) => a + b, 0);
    const done = [...loaded.values()].reduce((a, b) => a + b, 0);
    if (totals.size === files.length && total > 0) onProgress(Math.min(1, done / total));
  };
  const entries = await Promise.all(
    files.map(async (file) => {
      const response = await fetch(`assets/${file}`);
      if (!response.ok || !response.body) throw new Error(`Could not load ${file} (HTTP ${response.status})`);
      totals.set(file, Number(response.headers.get("content-length")) || 1);
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
        loaded.set(file, size);
        report();
      }
      const data = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }
      totals.set(file, size);
      report();
      return [file, data.buffer] as const;
    }),
  );
  return new Map(entries);
}

async function loadImage(costume: Costume, data: ArrayBuffer): Promise<HTMLImageElement> {
  const type = costume.file.endsWith(".svg") ? "image/svg+xml" : "image/png";
  const image = new Image();
  image.src = URL.createObjectURL(new Blob([data], { type }));
  await image.decode();
  return image;
}

function buildMask(costume: Costume, image: CanvasImageSource): void {
  const width = Math.ceil(costume.width * MASK_SCALE);
  const height = Math.ceil(costume.height * MASK_SCALE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is not available");
  ctx.imageSmoothingEnabled = costume.smooth;
  ctx.drawImage(image, 0, 0, costume.width * MASK_SCALE, costume.height * MASK_SCALE);
  applyMask(costume, ctx.getImageData(0, 0, width, height).data, width, height, MASK_SCALE);
}

function showError(error: unknown): void {
  console.error(error);
  $("loading").hidden = true;
  $("error").hidden = false;
  $("error-message").textContent = String(error);
}

async function main(): Promise<void> {
  const project = createClassic();
  const allCostumes = [project.stage, ...project.sprites.flatMap(({ sprite }) => sprite.costumes)];
  const soundFiles = Object.keys(sounds).map((name) => `sounds/${name}.${name === "laser" || name === "meow" ? "wav" : "mp3"}`);
  const files = await fetchAll([...allCostumes.map((c) => `costumes/${c.file}`), ...soundFiles], (fraction) => {
    $("loading-bar").style.width = `${fraction * 100}%`;
  });

  const audio = new Audio();
  const images: CostumeImages = new Map();
  await Promise.all([
    ...allCostumes.map(async (costume) => {
      const image = await loadImage(costume, files.get(`costumes/${costume.file}`) as ArrayBuffer);
      images.set(costume, image);
      if (costume !== project.stage) buildMask(costume, image);
    }),
    ...soundFiles.map((file) => {
      const name = file.slice("sounds/".length, file.lastIndexOf("."));
      return audio.load(name, files.get(file) as ArrayBuffer);
    }),
  ]);

  const world = new World(project);
  const canvas = $<HTMLCanvasElement>("stage");
  const renderer = new Renderer(canvas, images);
  (window as unknown as { insideTheFirewall: unknown }).insideTheFirewall = { world, audio };

  // Layout: controls on top, the stage scaled to fit and centered below.
  const controls = $("controls");
  const layout = () => {
    const top = controls.hidden ? 0 : CONTROLS_HEIGHT;
    const scale = Math.max(0.1, Math.min(window.innerWidth / 480, (window.innerHeight - top) / 360));
    const width = Math.floor(480 * scale);
    const height = Math.floor(360 * scale);
    renderer.resize(width, height, window.devicePixelRatio || 1);
    canvas.style.left = `${Math.floor((window.innerWidth - width) / 2)}px`;
    canvas.style.top = `${top + Math.floor((window.innerHeight - top - height) / 2)}px`;
    controls.style.width = `${width}px`;
    controls.style.left = canvas.style.left;
  };
  window.addEventListener("resize", layout);
  layout();

  // Input.
  const stagePoint = (event: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    return [((event.clientX - rect.left) / rect.width) * 480 - 240, 180 - ((event.clientY - rect.top) / rect.height) * 360];
  };
  window.addEventListener("keydown", (event) => {
    audio.unlock();
    const key = scratchKey(event.key);
    if (!key || event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === "space" || key.endsWith("arrow")) event.preventDefault();
    world.keyDown(key);
  });
  window.addEventListener("keyup", (event) => {
    const key = scratchKey(event.key);
    if (key) world.keyUp(key);
  });
  window.addEventListener("blur", () => {
    for (const key of [...world.keys]) world.keyUp(key);
  });
  canvas.addEventListener("pointermove", (event) => world.mouseMove(...stagePoint(event)));
  canvas.addEventListener("pointerdown", (event) => {
    audio.unlock();
    world.mouseDown(...stagePoint(event));
  });

  // Gamepads: D-pad or left stick move, A jumps, Start restarts.
  const padKeys = new Set<string>();
  const pollGamepads = () => {
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
    for (const key of pressed) if (!padKeys.has(key)) world.keyDown(key);
    for (const key of padKeys) if (!pressed.has(key)) world.keyUp(key);
    padKeys.clear();
    for (const key of pressed) padKeys.add(key);
  };

  // Controls bar.
  let paused = false;
  const pauseButton = $<HTMLButtonElement>("pause");
  const setPaused = (value: boolean) => {
    paused = value;
    pauseButton.classList.toggle("paused", paused);
    pauseButton.title = paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-label", pauseButton.title);
    if (paused) audio.pause();
    else audio.unlock();
  };
  $("flag").addEventListener("click", () => {
    setPaused(false);
    world.greenFlag();
  });
  pauseButton.addEventListener("click", () => setPaused(!paused));
  $("stop").addEventListener("click", () => world.stopAll());
  $("fullscreen").addEventListener("click", () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  });

  // xp sets the volume from its own volume slider.
  window.addEventListener("message", (event: MessageEvent<{ type?: string; volume?: number }>) => {
    if (event.data?.type !== "setVolume" || typeof event.data.volume !== "number") return;
    audio.volume = event.data.volume;
    window.parent.postMessage({ type: "volumeUpdate", volume: audio.volume }, "*");
  });

  $("loading").hidden = true;
  world.greenFlag();

  const stepMs = 1000 / FPS;
  let last = performance.now();
  let pending = 0;
  const frame = (now: number) => {
    pending += now - last;
    last = now;
    if (paused) pending = 0;
    let steps = 0;
    while (pending >= stepMs && steps < MAX_STEPS_PER_FRAME) {
      pollGamepads();
      world.step();
      audio.handle(world.soundEvents.splice(0));
      pending -= stepMs;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) pending = 0;
    renderer.draw(world, Math.min(1, pending / stepMs));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch(showError);
