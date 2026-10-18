import type { SoundEvent } from "./engine/world.ts";

/** Plays the game's sounds. Each sprite plays one copy of a sound at a time, like Scratch. */
export class Audio {
  readonly context = new AudioContext();
  private readonly output = this.context.createGain();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly playing = new Map<string, AudioBufferSourceNode>();
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

  handle(events: SoundEvent[]): void {
    for (const event of events) {
      if (event.type === "stopAll") {
        for (const source of this.playing.values()) source.stop();
        this.playing.clear();
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
