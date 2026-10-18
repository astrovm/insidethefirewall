import { buildMask, fetchAll, loadImage } from "./assets.ts";
import { Audio } from "./audio.ts";
import { costumes, createClassic, sounds } from "./game/classic.ts";
import { Controls, moveForKey } from "./input.ts";
import type { Costume } from "./engine/sprite.ts";
import type { CostumeImages } from "./render.ts";
import { Effects } from "./remaster/effects.ts";
import { Fader } from "./remaster/fader.ts";
import { DT, Game, threatCostumes, type GameEvent } from "./remaster/game.ts";
import { Best, rankFor } from "./remaster/progress.ts";
import { formatTime, RemasterRenderer, toStage } from "./remaster/render.ts";
import { defaults, loadSettings, saveSettings, showTouch, type TouchControls } from "./remaster/settings.ts";

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
  // The 2013 title, credited to @astrovm instead of the old @astrolince.
  const title: Costume = { ...costumes.title[0]!, file: "title-remaster.png" };
  const allCostumes = [
    project.stage,
    ...project.sprites.flatMap(({ sprite }) => sprite.costumes),
    ...Object.values(threatCostumes).flat(),
    title,
  ];
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
  const renderer = new RemasterRenderer(canvas, images, { stage: costumes.stage, title });
  const ui = $("ui");
  const status = $("status");
  const menus = { title: $("title-menu"), pause: $("pause-menu"), over: $("over-menu"), settings: $("settings-menu") };
  const pauseButton = $<HTMLButtonElement>("pause-game");
  const settingsButton = $<HTMLButtonElement>("open-settings");
  const touch = $("touch");
  const touchScreen = window.matchMedia("(pointer: coarse)");
  const best = new Best(storage());
  const showBest = () => {
    $("title-best").hidden = best.value === 0;
    $("title-best").textContent = `Best ${formatTime(best.value)} · ${rankFor(best.value)}`;
  };
  showBest();
  let paused = false;
  let settingsOpen = false;

  const settings = loadSettings(storage());
  const applySettings = () => {
    audio.setLevels(settings.music, settings.effects);
    saveSettings(storage(), settings);
    showMenus();
  };

  (window as unknown as { insideTheFirewall: unknown }).insideTheFirewall = {
    game,
    audio,
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
  };
  window.addEventListener("resize", layout);
  layout();

  const showMenus = () => {
    const playing = game.phase === "playing";
    menus.settings.hidden = !settingsOpen;
    menus.title.hidden = game.phase !== "title" || fader.busy || settingsOpen;
    menus.pause.hidden = !(playing && paused) || settingsOpen;
    menus.over.hidden = game.phase !== "over";
    pauseButton.hidden = !playing || paused;
    settingsButton.hidden = game.phase !== "title" || fader.busy || settingsOpen;
    touch.hidden = !playing || paused || !showTouch(settings.touch, touchScreen.matches);
  };
  touchScreen.addEventListener("change", () => showMenus());

  const openSettings = () => {
    if (game.phase === "over" || fader.busy) return;
    settingsOpen = true;
    $<HTMLInputElement>("music-volume").value = String(Math.round(settings.music * 100));
    $<HTMLInputElement>("effects-volume").value = String(Math.round(settings.effects * 100));
    for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="touch"]')) {
      radio.checked = radio.value === settings.touch;
    }
    showMenus();
    $("music-volume").focus();
  };
  const closeSettings = () => {
    if (!settingsOpen) return;
    settingsOpen = false;
    showMenus();
    if (game.phase === "title") settingsButton.focus();
    else menus.pause.querySelector<HTMLElement>('[data-action="settings"]')?.focus();
  };
  $("music-volume").addEventListener("input", (event) => {
    settings.music = Number((event.target as HTMLInputElement).value) / 100;
    applySettings();
  });
  $("effects-volume").addEventListener("input", (event) => {
    settings.effects = Number((event.target as HTMLInputElement).value) / 100;
    applySettings();
  });
  // Let the player hear how loud the sound effects are.
  $("effects-volume").addEventListener("change", () => {
    audio.unlock();
    audio.play("laser");
  });
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="touch"]')) {
    radio.addEventListener("change", () => {
      settings.touch = radio.value as TouchControls;
      applySettings();
    });
  }
  settingsButton.addEventListener("click", openSettings);


  const setPaused = (value: boolean) => {
    if (value === paused || game.phase !== "playing") return;
    paused = value;
    settingsOpen = false;
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
    if (game.phase !== "title" || fader.busy || settingsOpen) return;
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


  const handle = (event: GameEvent) => {
    effects.handle(event);
    switch (event.type) {
      case "sound":
        audio.play(event.sound);
        break;
      case "music":
        audio.setMusic(event.playing ? "music" : null);
        break;
      case "lost": {
        effects.clear();
        fader.fadeIn();
        const isBest = best.record(event.time);
        const rank = rankFor(event.time);
        status.textContent = `Game over. You lasted ${formatTime(event.time)} seconds. Rank: ${rank}.${isBest ? " New best!" : ""}`;
        $("over-time").textContent = formatTime(event.time);
        $("over-best").textContent = formatTime(best.value);
        $("over-rank").textContent = rank;
        $("new-best").hidden = !isBest;
        showBest();
        showMenus();
        break;
      }
    }
  };

  // Buttons.
  $("play").addEventListener("click", play);
  pauseButton.addEventListener("click", () => setPaused(true));
  for (const button of document.querySelectorAll<HTMLButtonElement>("#ui [data-action]")) {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "resume") setPaused(false);
      else if (action === "settings") openSettings();
      else if (action === "close-settings") closeSettings();
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
    const onButton = event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (settingsOpen) {
      if (key === "Escape" || key === "p") closeSettings();
      return;
    }
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
    controls.release(`key:${event.code}`);
  });
  window.addEventListener("blur", () => {
    controls.releaseAll();
    setPaused(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setPaused(true);
  });
  // Touch buttons. Each finger holds its own button, so two can be held at once.
  for (const button of touch.querySelectorAll<HTMLButtonElement>("[data-move]")) {
    const move = button.dataset.move as "left" | "right" | "down" | "jump";
    const fingers = new Set<number>();
    const lift = (event: PointerEvent) => {
      fingers.delete(event.pointerId);
      controls.release(`touch:${event.pointerId}`);
      button.classList.toggle("held", fingers.size > 0);
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      audio.unlock();
      fingers.add(event.pointerId);
      controls.press(`touch:${event.pointerId}`, move);
      button.classList.add("held");
    });
    button.addEventListener("pointerup", lift);
    button.addEventListener("pointercancel", lift);
    button.addEventListener("lostpointercapture", lift);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }

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
  applySettings();

  let last = performance.now();
  let pending = 0;
  const frame = (now: number) => {
    const elapsed = Math.min(250, now - last);
    last = now;
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
    fader.update(elapsed / 1000);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** localStorage, or nothing when the browser blocks it. */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}

main().catch(showError);
