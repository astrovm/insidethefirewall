import { buildMask, fetchAll, loadImage } from "./assets.ts";
import { Audio } from "./audio.ts";
import { costumes, createClassic, sounds } from "./game/classic.ts";
import { bindKey, canBind, Controls, defaultKeys, keyLabel, MOVES, moveForKey, type Move } from "./input.ts";
import type { Costume } from "./engine/sprite.ts";
import type { CostumeImages } from "./render.ts";
import { Effects } from "./remaster/effects.ts";
import { Fader } from "./remaster/fader.ts";
import {
  DT,
  flameCostumes,
  Game,
  PENGUIN_SHIELD,
  POWER_UP_TIME,
  powerUpCostumes,
  type GameEvent,
  type Grab,
  type PowerUpKind,
} from "./remaster/game.ts";
import { Best, DAILY_KEY } from "./remaster/best.ts";
import { dayNumber, seeded, shareText } from "./remaster/daily.ts";
import { formatTime, RemasterRenderer, toStage } from "./remaster/render.ts";
import { gameSpeed, loadSettings, saveSettings, showTouch, type TouchControls } from "./remaster/settings.ts";

const MAX_UPDATES_PER_FRAME = 8;

/** What the screen reader says when the player grabs a power-up. */
const powerUpMessages: Record<PowerUpKind, (seconds: number) => string> = {
  jetpack: (seconds) => `Jetpack for ${seconds} seconds. Fly with up and down.`,
  shield: (seconds) => `Shield for ${seconds} seconds`,
  freeze: (seconds) => `Virus frozen for ${seconds} seconds`,
};

/** The run summary on the game over screen: an icon and a count for each thing grabbed. */
const grabIcons: Record<Grab, { file: string; name: string }> = {
  penguin: { file: "pickup.svg", name: "Penguins" },
  jetpack: { file: "jetpack.svg", name: "Jetpacks" },
  shield: { file: "shield.svg", name: "Shields" },
  freeze: { file: "freeze.svg", name: "Freezes" },
};

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
    ...powerUpCostumes,
    ...flameCostumes,
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
  const menus = {
    title: $("title-menu"),
    pause: $("pause-menu"),
    over: $("over-menu"),
    settings: $("settings-menu"),
    keys: $("keys-menu"),
  };
  const pauseButton = $<HTMLButtonElement>("pause-game");
  const settingsButton = $<HTMLButtonElement>("open-settings");
  const touch = $("touch");
  const touchScreen = window.matchMedia("(pointer: coarse)");
  const best = new Best(storage());
  const showBest = () => {
    $("title-best").hidden = best.value === 0;
    $("title-best").textContent = `Best ${best.label}`;
    $("daily").textContent = `Daily #${dayNumber(new Date())}`;
  };
  showBest();
  let paused = false;
  let settingsOpen = false;
  let keysOpen = false;
  /** The move waiting for a key in the Keys panel. */
  let binding: Move | null = null;
  /** Today's daily run number while playing it. */
  let daily: number | null = null;
  /** The slowest game speed used this run, for the best time. */
  let runSpeed = 1;
  let lastTime = 0;

  const settings = loadSettings(storage());
  const applySettings = () => {
    audio.setLevels(settings.music, settings.effects);
    saveSettings(storage(), settings);
    showMenus();
  };

  (window as unknown as { insideTheFirewall: unknown }).insideTheFirewall = {
    game,
    audio,
    settings,
    get view() {
      return renderer.view;
    },
    get daily() {
      return daily;
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
    menus.settings.hidden = !settingsOpen || keysOpen;
    menus.keys.hidden = !keysOpen;
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
    $<HTMLInputElement>("game-speed").value = String(Math.round(settings.speed * 100));
    showSpeed();
    for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="touch"]')) {
      radio.checked = radio.value === settings.touch;
    }
    showMenus();
    $("music-volume").focus();
  };
  const closeSettings = () => {
    if (!settingsOpen) return;
    if (keysOpen) return closeKeys();
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
  const showSpeed = () => {
    $("game-speed-value").textContent = `${Math.round(settings.speed * 100)}%`;
  };
  $("game-speed").addEventListener("input", (event) => {
    settings.speed = gameSpeed(Number((event.target as HTMLInputElement).value) / 100);
    runSpeed = Math.min(runSpeed, settings.speed);
    showSpeed();
    applySettings();
  });

  // Keys: click a move, then press the key for it. Escape cancels.
  const bindButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-bind]")];
  const showKeys = () => {
    for (const button of bindButtons) {
      const move = button.dataset.bind as Move;
      button.classList.toggle("listening", binding === move);
      button.textContent = binding === move ? "Press a key" : settings.keys[move].map(keyLabel).join(" · ");
    }
  };
  const openKeys = () => {
    keysOpen = true;
    binding = null;
    showKeys();
    showMenus();
    bindButtons[0]?.focus();
  };
  const closeKeys = () => {
    keysOpen = false;
    binding = null;
    showMenus();
    menus.settings.querySelector<HTMLElement>('[data-action="keys"]')?.focus();
  };
  for (const button of bindButtons) {
    button.addEventListener("click", () => {
      binding = button.dataset.bind as Move;
      showKeys();
    });
  }
  const bindTo = (key: string) => {
    if (!binding) return;
    if (key !== "Escape" && !canBind(key)) return;
    if (key !== "Escape") settings.keys = bindKey(settings.keys, binding, key);
    binding = null;
    showKeys();
    applySettings();
  };

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

  // The game over song and the death sound stop as soon as the player leaves that screen.
  const leaveGameOver = () => {
    if (game.phase === "over") audio.stopEffects();
  };

  const startGame = () => {
    leaveGameOver();
    (document.activeElement as HTMLElement | null)?.blur();
    paused = false;
    audio.unlock();
    fader.to(() => {
      // The daily run starts from the same seed for everyone, every try.
      if (daily !== null) daily = dayNumber(new Date());
      game.random = daily === null ? Math.random : seeded(daily);
      runSpeed = settings.speed;
      game.start();
      effects.clear();
      status.textContent = "";
      showMenus();
    });
    showMenus();
  };
  const play = (dailyRun = false) => {
    if (game.phase !== "title" || fader.busy || settingsOpen) return;
    daily = dailyRun ? dayNumber(new Date()) : null;
    audio.unlock();
    audio.play("laser");
    startGame();
  };
  const toTitle = () => {
    leaveGameOver();
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
      case "powerUp":
        audio.play("laser");
        status.textContent = powerUpMessages[event.kind](POWER_UP_TIME[event.kind]);
        break;
      case "pickup":
        if (event.full) status.textContent = `Full hearts. Shield for ${PENGUIN_SHIELD} seconds`;
        break;
      case "nearMiss":
        audio.synth("whoosh");
        break;
      case "appear":
        audio.synth("appear");
        break;
      case "ending":
        audio.synth("tick");
        break;
      case "shield":
        status.textContent = "The shield blocked a hit";
        break;
      case "music":
        audio.setMusic(event.playing ? "music" : null);
        break;
      case "lost": {
        effects.clear();
        fader.fadeIn();
        lastTime = event.time;
        const runBest = daily === null ? best : new Best(storage(), DAILY_KEY, daily);
        const isBest = runBest.record(event.time, runSpeed);
        status.textContent = `Game over. You lasted ${formatTime(event.time)} seconds.${isBest ? " New best!" : ""}`;
        $("over-time").textContent = formatTime(event.time);
        $("over-best").textContent = runBest.label;
        $("new-best").hidden = !isBest;
        $("over-daily").hidden = daily === null;
        $("over-daily").textContent = `Daily #${daily}`;
        showGrabs(game.grabbed);
        $("share").textContent = "Share";
        showBest();
        showMenus();
        break;
      }
    }
  };

  const showGrabs = (grabbed: Grab[]) => {
    const list = $("over-grabs");
    list.replaceChildren();
    for (const [grab, icon] of Object.entries(grabIcons) as [Grab, (typeof grabIcons)[Grab]][]) {
      const count = grabbed.filter((g) => g === grab).length;
      if (count === 0) continue;
      const item = document.createElement("span");
      const image = document.createElement("img");
      image.src = `assets/costumes/${icon.file}`;
      image.alt = icon.name;
      item.append(image, String(count));
      list.append(item);
    }
  };

  // Share the run: the phone's share sheet, or the clipboard.
  $("share").addEventListener("click", async () => {
    const text = shareText(lastTime, game.grabbed, location.origin + location.pathname, daily);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      $("share").textContent = "Copied";
      status.textContent = "Copied to the clipboard";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      $("share").textContent = "Couldn't copy";
      status.textContent = "Couldn't copy the result";
    }
  });

  // Buttons.
  $("play").addEventListener("click", () => play());
  $("daily").addEventListener("click", () => play(true));
  pauseButton.addEventListener("click", () => setPaused(true));
  for (const button of document.querySelectorAll<HTMLButtonElement>("#ui [data-action]")) {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "resume") setPaused(false);
      else if (action === "settings") openSettings();
      else if (action === "close-settings") closeSettings();
      else if (action === "keys") openKeys();
      else if (action === "close-keys") closeKeys();
      else if (action === "reset-keys") {
        settings.keys = defaultKeys;
        binding = null;
        showKeys();
        applySettings();
      }
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
    if (binding) {
      event.preventDefault();
      bindTo(event.key);
      return;
    }
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
      // R, or jump once the screen has been up a moment, starts again right away.
      const jump = moveForKey(event.key, settings.keys) === "jump" && !event.repeat && !onButton && game.canRetry;
      if (key === "r" || jump) {
        event.preventDefault();
        startGame();
      } else if (key === "Escape") toTitle();
      return;
    }
    if (key === "Escape" || key === "p") {
      setPaused(!paused);
      return;
    }
    const move = moveForKey(event.key, settings.keys);
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
  const padStart = { down: false, jump: false };
  const pollGamepads = () => {
    let start = false;
    let jump = false;
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
      jump ||= button(0);
    }
    for (const move of ["left", "right", "down", "jump"] as const) {
      if (held.has(move) && !paused) controls.press(`pad:${move}`, move);
      else controls.release(`pad:${move}`);
    }
    if (start && !padStart.down) {
      if (game.phase === "title") play();
      else if (game.phase === "over") startGame();
      else setPaused(!paused);
    } else if (jump && !padStart.jump && game.canRetry && !fader.busy) startGame();
    padStart.down = start;
    padStart.jump = jump;
  };

  $("loading").hidden = true;
  applySettings();

  let last = performance.now();
  let pending = 0;
  const frame = (now: number) => {
    const elapsed = Math.min(250, now - last);
    last = now;
    pollGamepads();
    // A slower game speed gives the player more time to react.
    pending = paused ? 0 : pending + (elapsed / 1000) * settings.speed;
    let updates = 0;
    while (pending >= DT && updates < MAX_UPDATES_PER_FRAME) {
      game.update(controls.read());
      for (const event of game.events.splice(0)) handle(event);
      pending -= DT;
      updates++;
    }
    if (updates === MAX_UPDATES_PER_FRAME) pending = 0;
    if (game.phase === "playing") audio.setMusicRate(game.musicRate);
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
