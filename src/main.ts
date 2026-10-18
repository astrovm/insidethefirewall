import { buildMask, fetchAll, loadImage } from "./assets.ts";
import { Audio } from "./audio.ts";
import { ClassicMode } from "./classic-mode.ts";
import { costumes, createClassic, sounds } from "./game/classic.ts";
import { Controls, moveForKey } from "./input.ts";
import type { CostumeImages } from "./render.ts";
import { Effects } from "./remaster/effects.ts";
import { Fader } from "./remaster/fader.ts";
import { DT, Game, type GameEvent } from "./remaster/game.ts";
import { formatTime, RemasterRenderer, toStage } from "./remaster/render.ts";

const MAX_UPDATES_PER_FRAME = 8;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function showError(error: unknown): void {
  console.error(error);
  $("loading").hidden = true;
  $("error").hidden = false;
  $("error-message").textContent = String(error);
}

async function loadFont(): Promise<void> {
  const font = new FontFace("Noto Sans", "url(assets/fonts/noto-sans-medium.woff2)", { weight: "500" });
  document.fonts.add(await font.load());
}

async function main(): Promise<void> {
  const project = createClassic();
  const allCostumes = [project.stage, ...project.sprites.flatMap(({ sprite }) => sprite.costumes)];
  const soundFiles = Object.keys(sounds).map((name) => `sounds/${name}.${name === "laser" || name === "meow" ? "wav" : "mp3"}`);
  const [files] = await Promise.all([
    fetchAll([...allCostumes.map((c) => `costumes/${c.file}`), ...soundFiles], (fraction) => {
      $("loading-bar").style.width = `${fraction * 100}%`;
    }),
    loadFont(),
  ]);

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

  const game = new Game();
  const controls = new Controls();
  const fader = new Fader();
  const effects = new Effects();
  const canvas = $<HTMLCanvasElement>("game");
  const renderer = new RemasterRenderer(canvas, images, { stage: costumes.stage, title: costumes.title[0]! });
  const ui = $("ui");
  const status = $("status");
  const menus = { title: $("title-menu"), pause: $("pause-menu"), over: $("over-menu") };
  const pauseButton = $<HTMLButtonElement>("pause-game");
  const corner = $("corner");
  let paused = false;

  const classic = new ClassicMode(images, audio, () => leaveClassic());
  (window as unknown as { insideTheFirewall: unknown }).insideTheFirewall = {
    game,
    audio,
    get classic() {
      return classic.world;
    },
    get view() {
      return renderer.view;
    },
  };

  // Layout: the canvas fills the window, and the menus sit on top of the stage.
  const layout = () => {
    const ratio = window.devicePixelRatio || 1;
    renderer.resize(window.innerWidth, window.innerHeight, ratio);
    const { x, y, scale } = renderer.view;
    ui.style.left = `${x / ratio}px`;
    ui.style.top = `${y / ratio}px`;
    ui.style.setProperty("--s", `${scale / ratio}px`);
    classic.layout();
  };
  window.addEventListener("resize", layout);
  layout();

  const showMenus = () => {
    const playing = game.phase === "playing";
    menus.title.hidden = game.phase !== "title" || fader.busy;
    menus.pause.hidden = !(playing && paused);
    menus.over.hidden = game.phase !== "over";
    pauseButton.hidden = !playing || paused;
  };

  const setPaused = (value: boolean) => {
    if (value === paused || game.phase !== "playing") return;
    paused = value;
    controls.releaseAll();
    if (paused) {
      audio.pause();
      status.textContent = "Paused";
    } else {
      audio.unlock();
      status.textContent = "";
    }
    showMenus();
    if (paused) menus.pause.querySelector("button")?.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  };

  const startGame = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    paused = false;
    audio.unlock();
    fader.to(() => {
      game.start();
      effects.clear();
      status.textContent = "";
      showMenus();
    });
    showMenus();
  };
  const play = () => {
    if (game.phase !== "title" || fader.busy) return;
    audio.unlock();
    audio.play("laser");
    startGame();
  };
  const toTitle = () => {
    paused = false;
    audio.unlock();
    fader.to(() => {
      game.toTitle();
      showMenus();
      menus.title.querySelector("button")?.focus();
    });
  };

  const enterClassic = () => {
    fader.to(() => {
      game.toTitle();
      audio.setMusic(null);
      canvas.hidden = true;
      ui.hidden = true;
      corner.hidden = true;
      classic.enter();
    });
  };
  const leaveClassic = () => {
    classic.exit();
    canvas.hidden = false;
    ui.hidden = false;
    corner.hidden = false;
    fader.fadeIn();
    game.toTitle();
    showMenus();
    menus.title.querySelector("button")?.focus();
  };

  const handle = (event: GameEvent) => {
    effects.handle(event);
    switch (event.type) {
      case "sound":
        audio.play(event.sound);
        break;
      case "music":
        audio.setMusic(event.playing ? "music" : null);
        break;
      case "lost":
        effects.clear();
        fader.fadeIn();
        status.textContent = `Game over. You lasted ${formatTime(event.time)} seconds.`;
        $("over-time").textContent = formatTime(event.time);
        showMenus();
        break;
    }
  };

  // Buttons.
  $("play").addEventListener("click", play);
  $("open-classic").addEventListener("click", enterClassic);
  pauseButton.addEventListener("click", () => setPaused(true));
  for (const button of document.querySelectorAll<HTMLButtonElement>("#ui [data-action]")) {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "resume") setPaused(false);
      else if (action === "restart") startGame();
      else if (action === "menu") toTitle();
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-fullscreen]")) {
    button.addEventListener("click", () => toggleFullscreen());
  }

  // Keyboard.
  window.addEventListener("keydown", (event) => {
    audio.unlock();
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (classic.active) {
      if (event.key === "Escape") leaveClassic();
      else classic.keyDown(event);
      return;
    }
    const onButton = event.target instanceof HTMLButtonElement;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === "f") return toggleFullscreen();
    if (game.phase === "title") {
      if ((key === " " || key === "Enter") && !onButton) {
        event.preventDefault();
        play();
      }
      return;
    }
    if (game.phase === "over") {
      if (key === "r") startGame();
      else if (key === "Escape") toTitle();
      return;
    }
    if (key === "Escape" || key === "p") {
      setPaused(!paused);
      return;
    }
    const move = moveForKey(event.key);
    if (!move || paused) return;
    event.preventDefault();
    controls.press(`key:${event.code}`, move);
  });
  window.addEventListener("keyup", (event) => {
    if (classic.active) classic.keyUp(event);
    controls.release(`key:${event.code}`);
  });
  window.addEventListener("blur", () => {
    controls.releaseAll();
    classic.releaseKeys();
    setPaused(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setPaused(true);
  });
  canvas.addEventListener("pointerdown", (event) => {
    audio.unlock();
    const ratio = window.devicePixelRatio || 1;
    game.click(...toStage(renderer.view, event.offsetX * ratio, event.offsetY * ratio));
  });

  // xp sets the volume from its own volume slider.
  window.addEventListener("message", (event: MessageEvent<{ type?: string; volume?: number }>) => {
    if (event.data?.type !== "setVolume" || typeof event.data.volume !== "number") return;
    audio.volume = event.data.volume;
    window.parent.postMessage({ type: "volumeUpdate", volume: audio.volume }, "*");
  });

  // Gamepads: D-pad or left stick move, A jumps, Start pauses or starts.
  const padStart = { down: false };
  const pollGamepads = () => {
    let start = false;
    const held = new Set<string>();
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const button = (i: number) => pad.buttons[i]?.pressed ?? false;
      const [ax = 0, ay = 0] = pad.axes;
      if (button(14) || ax < -0.5) held.add("left");
      if (button(15) || ax > 0.5) held.add("right");
      if (button(13) || ay > 0.5) held.add("down");
      if (button(0) || button(12)) held.add("jump");
      start ||= button(9);
    }
    for (const move of ["left", "right", "down", "jump"] as const) {
      if (held.has(move) && !paused) controls.press(`pad:${move}`, move);
      else controls.release(`pad:${move}`);
    }
    if (start && !padStart.down) {
      if (game.phase === "title") play();
      else if (game.phase === "over") startGame();
      else setPaused(!paused);
    }
    padStart.down = start;
  };

  $("loading").hidden = true;
  showMenus();

  let last = performance.now();
  let pending = 0;
  const frame = (now: number) => {
    const elapsed = Math.min(250, now - last);
    last = now;
    if (classic.active) {
      classic.frame(elapsed);
    } else {
      pollGamepads();
      pending = paused ? 0 : pending + elapsed / 1000;
      let updates = 0;
      while (pending >= DT && updates < MAX_UPDATES_PER_FRAME) {
        game.update(controls.read());
        for (const event of game.events.splice(0)) handle(event);
        pending -= DT;
        updates++;
      }
      if (updates === MAX_UPDATES_PER_FRAME) pending = 0;
      if (!paused) effects.update(elapsed / 1000);
      renderer.fade = fader.value;
      renderer.draw(game, paused || game.frozen > 0 ? 1 : Math.min(1, pending / DT), effects);
    }
    fader.update(elapsed / 1000);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}

main().catch(showError);
