const FADE_OUT = 0.2;
const FADE_IN = 0.3;

/** Fades to black, makes a change while the screen is black, then fades back in. */
export class Fader {
  /** 0 is clear, 1 is black. */
  value = 0;
  private change: (() => void) | null = null;
  private direction: -1 | 0 | 1 = 0;

  get busy(): boolean {
    return this.change !== null;
  }

  /** Ignored while another change is waiting, so double clicks don't start two games. */
  to(change: () => void): void {
    if (this.change) return;
    this.change = change;
    this.direction = 1;
  }

  /** Starts black and fades in, for things that already happened. */
  fadeIn(): void {
    this.value = 1;
    this.direction = -1;
  }

  update(seconds: number): void {
    if (this.direction > 0) {
      this.value = Math.min(1, this.value + seconds / FADE_OUT);
      if (this.value < 1) return;
      const change = this.change;
      this.change = null;
      this.direction = -1;
      change?.();
    } else if (this.direction < 0) {
      this.value = Math.max(0, this.value - seconds / FADE_IN);
      if (this.value === 0) this.direction = 0;
    }
  }
}
