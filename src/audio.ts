import type { SoundEvent } from "./engine/world.ts";

/** Seconds one song takes to fade into the next. */
const CROSSFADE = 2;
/** Quieter than this counts as silence at the start and end of a song. */
const SILENCE = 0.02;

interface Song {
  index: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** Seconds into the song. */
  position: number;
  /** Where the sound ends, before any silence. */
  end: number;
}

/** Short sounds made on the fly, for cues the 2013 game had no sound for. */
export type Synth = "whoosh" | "appear" | "tick" | "shatter" | "zap" | "portal" | "hev" | "brick" | "honk";

/** Square wave notes for the blip sounds: frequencies, how long each is, and how loud. */
const blips: Partial<Record<Synth, { notes: number[]; length: number; level: number; type?: OscillatorType }>> = {
  appear: { notes: [660, 990], length: 0.07, level: 0.08 },
  tick: { notes: [1200], length: 0.04, level: 0.06 },
  brick: { notes: [880], length: 0.05, level: 0.07 },
  // The HEV suit's warning beeps, falling.
  hev: { notes: [1050, 1050, 790], length: 0.11, level: 0.07 },
  // Two low notes at once would be a chord; one after the other honks.
  honk: { notes: [330, 262, 330, 262], length: 0.12, level: 0.09, type: "sawtooth" },
};

/** Plays the game's sounds. Each sprite plays one copy of a sound at a time, like Scratch. */
export class Audio {
  readonly context = new AudioContext();
  private readonly output = this.context.createGain();
  private readonly musicOutput = this.context.createGain();
  private readonly effectsOutput = this.context.createGain();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly playing = new Map<string, AudioBufferSourceNode>();
  private songs: string[] = [];
  private song: Song | null = null;
  /** The song fading out while the next one fades in. */
  private fading: Song | null = null;
  private readonly ranges = new Map<AudioBuffer, { start: number; end: number }>();
  private musicClock = 0;
  private musicRate = 1;
  private level = 1;
  private noise: AudioBuffer | null = null;

  constructor() {
    this.output.connect(this.context.destination);
    this.musicOutput.connect(this.output);
    this.effectsOutput.connect(this.output);
  }

  async load(name: string, data: ArrayBuffer): Promise<void> {
    this.buffers.set(name, await this.context.decodeAudioData(data));
  }

  get volume(): number {
    return this.level;
  }

  set volume(value: number) {
    this.level = Math.min(1, Math.max(0, value));
    this.output.gain.value = this.level;
  }

  /** The player's own music and sound effect levels, under the overall volume. */
  setLevels(music: number, effects: number): void {
    this.musicOutput.gain.value = Math.min(1, Math.max(0, music));
    this.effectsOutput.gain.value = Math.min(1, Math.max(0, effects));
  }

  /** Paused by the game, so a key or click doesn't bring the sound back. */
  private held = false;

  /** Browsers only allow sound after the player interacts with the page. */
  unlock(): void {
    if (!this.held && this.context.state === "suspended") void this.context.resume();
  }

  pause(): void {
    this.held = true;
    void this.context.suspend();
  }

  resume(): void {
    this.held = false;
    this.unlock();
  }

  /** Plays a sound for the remaster. A new copy cuts off the last one, as in the 2013 game. */
  play(sound: string): void {
    this.handle([{ type: "play", owner: "remaster", sound }]);
  }

  /**
   * Plays the songs one after another, starting with `first`, and back to the
   * first after the last. Each one crossfades into the next, skipping the
   * silence at its start and end. Null stops the music.
   */
  setMusic(songs: string[] | null, first = 0): void {
    for (const song of [this.song, this.fading]) song?.source.stop();
    this.song = this.fading = null;
    this.songs = songs ?? [];
    // A new run starts at normal speed, without gliding down from the last one.
    this.musicRate = 1;
    if (this.songs.length > 0) this.song = this.startSong((first % this.songs.length + this.songs.length) % this.songs.length, false);
  }

  /** The songs in the order they play. */
  get playlist(): readonly string[] {
    return this.songs;
  }

  /** The song playing, if any. */
  get songName(): string | null {
    return this.song ? this.songs[this.song.index]! : null;
  }

  private startSong(index: number, fadeIn: boolean): Song | null {
    const buffer = this.buffers.get(this.songs[index]!);
    if (!buffer) return null;
    const range = this.ranges.get(buffer) ?? audibleRange(buffer.getChannelData(0), buffer.sampleRate);
    this.ranges.set(buffer, range);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.musicRate;
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    gain.gain.setValueAtTime(fadeIn ? 0 : 1, now);
    if (fadeIn) gain.gain.linearRampToValueAtTime(1, now + CROSSFADE);
    source.connect(gain).connect(this.musicOutput);
    source.start(now, range.start);
    this.musicClock = now;
    return { index, source, gain, position: range.start, end: range.end };
  }

  /** Moves the songs along. Call it every frame. */
  update(): void {
    const now = this.context.currentTime;
    const elapsed = now - this.musicClock;
    this.musicClock = now;
    const song = this.song;
    if (!song) return;
    song.position += elapsed * song.source.playbackRate.value;
    if (song.position < song.end - CROSSFADE * song.source.playbackRate.value) return;
    // Fade this one out while the next one fades in.
    this.fading?.source.stop();
    song.gain.gain.setValueAtTime(song.gain.gain.value, now);
    song.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE);
    song.source.stop(now + CROSSFADE);
    this.fading = song;
    this.song = this.startSong((song.index + 1) % this.songs.length, true);
  }

  /** Plays the music faster or slower, 1 for normal. */
  setMusicRate(rate: number): void {
    if (rate === this.musicRate) return;
    this.musicRate = rate;
    // Glide over about a second, like a record speeding up.
    for (const song of [this.song, this.fading]) song?.source.playbackRate.setTargetAtTime(rate, this.context.currentTime, 0.3);
  }

  /** Plays a short made-up sound through the sound effects volume. */
  synth(name: Synth): void {
    const ctx = this.context;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(this.effectsOutput);
    if (name === "whoosh") {
      // A burst of noise swept upward, like air rushing past.
      this.noise ??= noiseBuffer(ctx, 0.3);
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 2;
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.exponentialRampToValueAtTime(2500, now + 0.25);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.35, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      source.connect(filter).connect(gain);
      source.start(now);
      return;
    }
    if (name === "shatter") {
      // Ice breaking: a sharp, bright crack of noise.
      this.noise ??= noiseBuffer(ctx, 0.3);
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 2500;
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      source.connect(filter).connect(gain);
      source.start(now);
      return;
    }
    if (name === "zap" || name === "portal") {
      // A sweep: down for the gravity gun, up for a portal.
      const oscillator = ctx.createOscillator();
      oscillator.type = name === "portal" ? "sine" : "square";
      const [from, to, length] = name === "zap" ? [1400, 180, 0.18] : [300, 1200, 0.3];
      oscillator.frequency.setValueAtTime(from, now);
      oscillator.frequency.exponentialRampToValueAtTime(to, now + length);
      gain.gain.setValueAtTime(name === "portal" ? 0.15 : 0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
      oscillator.connect(gain);
      oscillator.start(now);
      oscillator.stop(now + length);
      return;
    }
    // Square wave blips, in the 8-bit style of the art.
    const { notes, length, level, type = "square" } = blips[name]!;
    gain.gain.value = level;
    notes.forEach((frequency, i) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(now + i * length);
      oscillator.stop(now + (i + 1) * length);
    });
  }

  /** Stops every sound but the music, like the game over song when leaving that screen. */
  stopEffects(): void {
    for (const source of this.playing.values()) source.stop();
    this.playing.clear();
  }

  /** Sounds playing now, by owner and name. */
  get playingSounds(): string[] {
    return [...this.playing.keys()];
  }

  handle(events: SoundEvent[]): void {
    for (const event of events) {
      if (event.type === "stopAll") {
        for (const source of this.playing.values()) source.stop();
        this.playing.clear();
        this.setMusic(null);
        continue;
      }
      const buffer = this.buffers.get(event.sound);
      if (!buffer) continue;
      const key = `${event.owner}:${event.sound}`;
      this.playing.get(key)?.stop();
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.effectsOutput);
      source.onended = () => {
        if (this.playing.get(key) === source) this.playing.delete(key);
      };
      source.start();
      this.playing.set(key, source);
    }
  }
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Where a song's sound starts and ends, in seconds, leaving out silence at both ends. */
export function audibleRange(samples: Float32Array, sampleRate: number): { start: number; end: number } {
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]!) < SILENCE) first++;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]!) < SILENCE) last--;
  if (first >= samples.length) return { start: 0, end: samples.length / sampleRate };
  return { start: first / sampleRate, end: (last + 1) / sampleRate };
}

/** The songs in a random order. It never starts with `notFirst`, so two runs in a row start differently. */
export function shuffled(songs: readonly string[], notFirst: string | null, random = Math.random): string[] {
  const order = [...songs];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (order.length > 1 && order[0] === notFirst) [order[0], order[1]] = [order[1]!, order[0]!];
  return order;
}
