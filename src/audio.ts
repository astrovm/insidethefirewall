import type { SoundEvent } from "./engine/world.ts";

/** Plays the game's sounds. Each sprite plays one copy of a sound at a time, like Scratch. */
export class Audio {
  readonly context = new AudioContext();
  private readonly output = this.context.createGain();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly playing = new Map<string, AudioBufferSourceNode>();
  private music: AudioBufferSourceNode | null = null;
  private level = 1;

  constructor() {
    this.output.connect(this.context.destination);
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

  /** Loops the music from the start, or stops it. */
  setMusic(name: string | null): void {
    this.music?.stop();
    this.music = null;
    const buffer = name && this.buffers.get(name);
    if (!buffer) return;
    this.music = this.context.createBufferSource();
    this.music.buffer = buffer;
    this.music.loop = true;
    this.music.connect(this.output);
    this.music.start();
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
      source.connect(this.output);
      source.onended = () => {
        if (this.playing.get(key) === source) this.playing.delete(key);
      };
      source.start();
      this.playing.set(key, source);
    }
  }
}
