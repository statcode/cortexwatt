/** Unified input adapter — pointerdown + keydown, timestamped via event.timeStamp (§4.3).
 * Deadlines resolve frame-driven (rAF), so the whole runtime shares one clock —
 * and headless tests can drive it with a virtual clock. */

import type { InputAdapter, InputEventLike } from "./types";

interface ClockLike {
  now: () => number;
  raf: (cb: (t: number) => void) => number;
}

type Waiter = {
  resolve: (ev: InputEventLike | null) => void;
  reject: (err: unknown) => void;
  deadline?: number;
  onAbort?: () => void;
  signal?: AbortSignal;
};

export class QueueInput implements InputAdapter {
  private queue: InputEventLike[] = [];
  private waiter: Waiter | null = null;
  private detachFns: (() => void)[] = [];
  private clocks: ClockLike;

  constructor(clocks?: ClockLike) {
    this.clocks =
      clocks ?? {
        now: () => performance.now(),
        raf: (cb) => requestAnimationFrame(cb),
      };
  }

  /** Attach DOM listeners scoped to an element (the focus stage). */
  attach(el: HTMLElement, canvas: HTMLCanvasElement): void {
    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.push({
        kind: "pointer",
        t: e.timeStamp,
        x: ((e.clientX - rect.left) / rect.width) * canvas.width,
        y: ((e.clientY - rect.top) / rect.height) * canvas.height,
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.push({ kind: "key", t: e.timeStamp, key: e.key.toLowerCase() });
    };
    el.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    this.detachFns.push(() => {
      el.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    });
  }

  detach(): void {
    this.detachFns.forEach((f) => f());
    this.detachFns = [];
    this.settle(null);
  }

  clear(): void {
    this.queue = [];
  }

  inject(ev: InputEventLike): void {
    this.push(ev);
  }

  private push(ev: InputEventLike): void {
    if (this.waiter) {
      if (this.waiter.deadline !== undefined && ev.t > this.waiter.deadline) {
        // Event stamped after the window closed; deliver the timeout first.
        this.settle(null);
        this.queue.push(ev);
        return;
      }
      this.settle(ev);
    } else {
      this.queue.push(ev);
    }
  }

  private settle(ev: InputEventLike | null): void {
    const w = this.waiter;
    if (!w) return;
    this.waiter = null;
    if (w.onAbort && w.signal) w.signal.removeEventListener("abort", w.onAbort);
    w.resolve(ev);
  }

  next(opts?: { deadline?: number; signal?: AbortSignal }): Promise<InputEventLike | null> {
    const queued = this.queue.shift();
    if (queued) {
      if (opts?.deadline !== undefined && queued.t > opts.deadline) {
        this.queue.unshift(queued);
        return Promise.resolve(null);
      }
      return Promise.resolve(queued);
    }
    if (opts?.signal?.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));

    return new Promise<InputEventLike | null>((resolve, reject) => {
      const w: Waiter = { resolve, reject, deadline: opts?.deadline, signal: opts?.signal };
      if (opts?.deadline !== undefined) {
        const check = (t: number) => {
          if (this.waiter !== w) return; // already settled
          if (t >= w.deadline!) {
            this.waiter = null;
            if (w.onAbort && w.signal) w.signal.removeEventListener("abort", w.onAbort);
            resolve(null);
            return;
          }
          this.clocks.raf(check);
        };
        this.clocks.raf(check);
      }
      if (opts?.signal) {
        w.onAbort = () => {
          if (this.waiter === w) {
            this.waiter = null;
            reject(new DOMException("aborted", "AbortError"));
          }
        };
        opts.signal.addEventListener("abort", w.onAbort, { once: true });
      }
      this.waiter = w;
    });
  }
}
