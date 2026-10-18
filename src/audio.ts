import type { SoundEvent } from "./engine/world.ts";

/** Seconds blended at a loop point. */
const LOOP_BLEND = 0.02;

/** Short sounds made on the fly, for cues the 2013 game had no sound for. */
export type Synth = "whoosh" | "appear" | "tick";

/** Plays the game's sounds. Each sprite plays one copy of a sound at a time, like Scratch. */
export class Audio {
  readonly context = new AudioContext();
  private readonly output = this.context.createGain();
  private readonly musicOutput = this.context.createGain();
  private readonly effectsOutput = this.context.createGain();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly playing = new Map<string, AudioBufferSourceNode>();
  private music: AudioBufferSourceNode | null = null;
  /** Where each song loops, in seconds, when it shouldn't loop from end to start. */
  private readonly loops = new Map<string, { start: number; end: number }>();
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

  /** Browsers only allow sound after the player interacts with the page. */
  unlock(): void {
    if (this.context.state === "suspended") void this.context.resume();
  }

  pause(): void {
    void this.context.suspend();
  }

  /** Plays a sound for the remaster. A new copy cuts off the last one, as in the 2013 game. */
  play(sound: string): void {
    this.handle([{ type: "play", owner: "remaster", sound }]);
  }

  /**
   * Makes a song loop from `end` back to `start` instead of from its end to its
   * start, skipping a fade out. The few milliseconds before `end` blend into
   * the ones before `start`, so the jump doesn't click.
   */
  setLoop(name: string, start: number, end: number): void {
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const blend = Math.round(buffer.sampleRate * LOOP_BLEND);
    const to = Math.round(end * buffer.sampleRate);
    const from = Math.round(start * buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < blend; i++) {
        const mix = (i + 1) / blend;
        data[to - blend + i] = data[to - blend + i]! * (1 - mix) + data[from - blend + i]! * mix;
      }
    }
    this.loops.set(name, { start, end });
  }

  /** Loops the music, or stops it. */
  setMusic(name: string | null): void {
    this.music?.stop();
    this.music = null;
    const buffer = name && this.buffers.get(name);
    if (!buffer) return;
    this.music = this.context.createBufferSource();
    this.music.buffer = buffer;
    this.music.loop = true;
    const loop = this.loops.get(name);
    if (loop) {
      this.music.loopStart = loop.start;
      this.music.loopEnd = loop.end;
    }
    this.music.playbackRate.value = this.musicRate;
    this.music.connect(this.musicOutput);
    this.music.start();
  }

  /** Plays the music faster or slower, 1 for normal. */
  setMusicRate(rate: number): void {
    if (rate === this.musicRate) return;
    this.musicRate = rate;
    // Glide over about a second, like a record speeding up.
    this.music?.playbackRate.setTargetAtTime(rate, this.context.currentTime, 0.3);
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
    // Square wave blips, in the 8-bit style of the art.
    const notes = name === "appear" ? [660, 990] : [1200];
    const length = name === "appear" ? 0.07 : 0.04;
    gain.gain.value = name === "appear" ? 0.08 : 0.06;
    notes.forEach((frequency, i) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = "square";
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
