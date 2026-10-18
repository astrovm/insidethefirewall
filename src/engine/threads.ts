// A tiny Scratch-style thread scheduler. Each script is a generator that
// yields once per frame, so the original scripts port almost line by line.

export type Script = Generator<void, void, void>;

export interface Thread {
  readonly owner: string;
  /** Identifies the script, so restarting a hat replaces its thread. */
  readonly key: object;
  readonly script: Script;
  done: boolean;
}

export class Scheduler {
  threads: Thread[] = [];
  current: Thread | null = null;

  /**
   * Starts a script. Broadcast hats restart a running copy in place, like
   * Scratch. Key hats ignore the press while their script still runs.
   */
  start(owner: string, key: object, make: () => Script, restart: boolean): Thread | null {
    const index = this.threads.findIndex((thread) => thread.key === key && !thread.done);
    const existing = index >= 0 ? this.threads[index] : undefined;
    if (existing && !restart) return null;
    const thread: Thread = { owner, key, script: make(), done: false };
    if (existing) {
      existing.done = true;
      this.threads[index] = thread;
    } else {
      this.threads.push(thread);
    }
    return thread;
  }

  /** Runs every thread until it yields. Threads started now also run this frame. */
  step(): void {
    for (let i = 0; i < this.threads.length; i++) {
      const thread = this.threads[i];
      if (!thread || thread.done) continue;
      this.current = thread;
      if (thread.script.next().done) thread.done = true;
    }
    this.current = null;
    this.threads = this.threads.filter((thread) => !thread.done);
  }

  /** Scratch's "stop other scripts in sprite". */
  stopOthers(owner: string): void {
    for (const thread of this.threads) {
      if (thread.owner === owner && thread !== this.current) thread.done = true;
    }
  }

  stopAll(): void {
    for (const thread of this.threads) thread.done = true;
    this.threads = [];
  }

  isRunning(thread: Thread): boolean {
    return !thread.done && this.threads.includes(thread);
  }
}
