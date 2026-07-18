/** Timing primitives — PRD §4. All timestamps are performance.now() time-base. */

export interface Clocks {
  now: () => number;
  raf: (cb: (t: number) => void) => number;
}

export function defaultClocks(): Clocks {
  return {
    now: () => performance.now(),
    raf: (cb) => requestAnimationFrame(cb),
  };
}

/**
 * Draw a stimulus inside a rAF callback and resolve with that frame's
 * timestamp — the canonical stimulus onset time (§4.2). The draw function
 * must not allocate/decode/layout; pre-render everything beforehand.
 */
export function paintFrame(clocks: Clocks, draw: (t: number) => void): Promise<number> {
  return new Promise((resolve) => {
    clocks.raf((t) => {
      draw(t);
      resolve(t);
    });
  });
}

/** rAF-aligned wait (keeps the loop frame-driven; no setTimeout drift). */
export function waitUntil(clocks: Clocks, deadline: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const tick = (t: number) => {
      if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
      if (t >= deadline) return resolve();
      clocks.raf(tick);
    };
    clocks.raf(tick);
  });
}

export function waitMs(clocks: Clocks, ms: number, signal?: AbortSignal): Promise<void> {
  return waitUntil(clocks, clocks.now() + ms, signal);
}

/**
 * Measure ~20 rAF deltas → estimated refresh interval (§4.7).
 * Returns median delta in ms and derived Hz.
 */
export async function estimateRefresh(clocks: Clocks = defaultClocks()): Promise<{
  interval_ms: number;
  hz: number;
  samples: number[];
}> {
  const stamps: number[] = [];
  await new Promise<void>((resolve) => {
    const tick = (t: number) => {
      stamps.push(t);
      if (stamps.length >= 21) return resolve();
      clocks.raf(tick);
    };
    clocks.raf(tick);
  });
  const deltas = stamps.slice(1).map((t, i) => t - stamps[i]!).filter((d) => d > 0);
  const sorted = deltas.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 16.67;
  return { interval_ms: median, hz: Math.round(1000 / median), samples: deltas };
}

/** Watches visibility/blur; runner marks the in-flight trial interrupted (§4.6). */
export class InterruptionWatcher {
  private flag = false;
  private off: (() => void) | null = null;

  attach(target: Window & typeof globalThis = window): void {
    const onHide = () => {
      if (document.visibilityState === "hidden") this.flag = true;
    };
    const onBlur = () => {
      this.flag = true;
    };
    document.addEventListener("visibilitychange", onHide);
    target.addEventListener("blur", onBlur);
    this.off = () => {
      document.removeEventListener("visibilitychange", onHide);
      target.removeEventListener("blur", onBlur);
    };
  }

  detach(): void {
    this.off?.();
    this.off = null;
  }

  /** Returns true if an interruption happened since the last consume. */
  consume(): boolean {
    const v = this.flag;
    this.flag = false;
    return v;
  }
}
