/** Headless runtime test — drives flashPoint.run() with a virtual clock and
 * synthetic timestamped input (PRD §12). Verifies onset timing, RT math,
 * false-start classification, and timeout handling in the real game loop. */

import { describe, expect, it } from "vitest";
import { flashPoint } from "../src/games/flashPoint";
import { reflexDrop } from "../src/games/reflexDrop";
import { QueueInput } from "../src/input";
import type { FlashPointSpec, GameContext, ReflexDropSpec } from "../src";

/** Virtual frame clock: rAF fires every 16.67 ms of virtual time. */
class VirtualClock {
  t = 0;
  private frame = 16.6667;
  private queue: ((t: number) => void)[] = [];

  now = () => this.t;
  raf = (cb: (t: number) => void) => {
    this.queue.push(cb);
    return this.queue.length;
  };

  async pump(until: number, onFrame?: (t: number) => void): Promise<void> {
    const end = this.t + until;
    while (this.t < end) {
      this.t += this.frame;
      const batch = this.queue;
      this.queue = [];
      for (const cb of batch) cb(this.t);
      onFrame?.(this.t);
      // let awaiting microtask chains progress between frames
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
  }
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 420;
  canvas.height = 420;
  // jsdom has no 2D context — stub the drawing surface
  const noop = () => {};
  const ctx = new Proxy({}, { get: (_, p) => (p === "canvas" ? canvas : noop), set: () => true });
  (canvas as unknown as { getContext: () => unknown }).getContext = () => ctx;
  return canvas;
}

function makeCtx(clock: VirtualClock, input: QueueInput): GameContext {
  return {
    canvas: makeCanvas(),
    input,
    controls: { set: () => {}, clear: () => {} },
    onTrialProgress: () => {},
    abortSignal: new AbortController().signal,
    interruption: { consume: () => false },
    reducedMotion: true,
    now: clock.now,
    raf: clock.raf,
  };
}

describe("flashPoint runtime", () => {
  it("records a correct RT from synthetic input", async () => {
    const clock = new VirtualClock();
    const input = new QueueInput(clock);
    const ctx = makeCtx(clock, input);
    const spec: FlashPointSpec = {
      game: "flash_point",
      trials: [{ foreperiod_ms: 1200 }],
      response_window_ms: 900,
    };

    const run = flashPoint.run(spec, ctx);
    // Fixation paints on the first frame (~16.7); onset ≈ 16.7 + 1200,
    // quantized to the next frame. Respond 250 ms after the scheduled onset.
    const respondAt = 16.6667 + 1200 + 250;
    let injected = false;
    await clock.pump(4000, (t) => {
      if (!injected && t >= respondAt) {
        input.inject({ kind: "key", t, key: " " });
        injected = true;
      }
    });

    const trials = await run;
    expect(trials.length).toBe(1);
    const tr = trials[0]!;
    expect(tr.false_start).toBe(false);
    expect(tr.correct).toBe(true);
    const rt = tr.response_ms! - tr.onset_ms;
    expect(rt).toBeGreaterThan(180);
    expect(rt).toBeLessThan(300);
  });

  it("runs a full 3-trial session with responses inside each window", async () => {
    const clock = new VirtualClock();
    const input = new QueueInput(clock);
    const ctx = makeCtx(clock, input);
    const spec: FlashPointSpec = {
      game: "flash_point",
      trials: [{ foreperiod_ms: 1200 }, { foreperiod_ms: 1500 }, { foreperiod_ms: 1100 }],
      response_window_ms: 900,
    };

    const run = flashPoint.run(spec, ctx);
    // Reactive driver: respond ~150 ms after each response window would open.
    // We detect windows by tracking quiet gaps: simpler — respond every frame
    // 350 ms apart; extra taps during foreperiods become false starts, so
    // instead compute the exact schedule: trial i fixation paints ~1 frame
    // after the previous trial fully ends (response + post-paint + 350 wait).
    let expectedOnset = 16.6667 + 1200;
    let idx = 0;
    let responded = false;
    let respondedAt = 0;
    await clock.pump(15000, (t) => {
      if (idx >= 3) return;
      if (!responded && t >= expectedOnset + 200) {
        input.inject({ kind: "key", t, key: " " });
        responded = true;
        respondedAt = t;
      } else if (responded && t >= respondedAt + 420) {
        idx += 1;
        if (idx < 3) {
          // next fixation painted ≈ respondedAt + frame + 350 + frame
          expectedOnset = respondedAt + 16.6667 * 2 + 350 + spec.trials[idx]!.foreperiod_ms;
          responded = false;
        }
      }
    });

    const trials = await run;
    expect(trials.length).toBe(3);
    for (const tr of trials) {
      expect(tr.response_ms).not.toBeNull();
      expect(tr.false_start).toBe(false);
      expect(tr.correct).toBe(true);
      const rt = tr.response_ms! - tr.onset_ms;
      expect(rt).toBeGreaterThan(100);
      expect(rt).toBeLessThan(900);
    }
  });

  it("classifies premature input as a false start", async () => {
    const clock = new VirtualClock();
    const input = new QueueInput(clock);
    const ctx = makeCtx(clock, input);

    const run = flashPoint.run(
      { game: "flash_point", trials: [{ foreperiod_ms: 1500 }], response_window_ms: 900 },
      ctx,
    );
    let injected = false;
    await clock.pump(6000, (t) => {
      if (!injected && t > 400) {
        input.inject({ kind: "pointer", t, x: 210, y: 210 });
        injected = true;
      }
    });
    const trials = await run;
    expect(trials.length).toBe(1);
    expect(trials[0]!.false_start).toBe(true);
    expect(trials[0]!.correct).toBe(false);
  });

  it("records a miss on timeout", async () => {
    const clock = new VirtualClock();
    const input = new QueueInput(clock);
    const ctx = makeCtx(clock, input);

    const run = flashPoint.run(
      { game: "flash_point", trials: [{ foreperiod_ms: 1100 }], response_window_ms: 900 },
      ctx,
    );
    await clock.pump(6000); // no input at all
    const trials = await run;
    expect(trials.length).toBe(1);
    expect(trials[0]!.response_ms).toBeNull();
    expect(trials[0]!.correct).toBe(false);
    expect(trials[0]!.false_start).toBe(false);
  });
});

describe("reflexDrop runtime", () => {
  // Rod keys are S D F · J K L, so rod 2 = "f" and rod 0 = "s".
  const oneTrial = (rod: number, foreperiod_ms = 1200): ReflexDropSpec => ({
    game: "reflex_drop",
    rod_count: 6,
    trials: [{ rod, foreperiod_ms }],
    catch_window_ms: 900,
  });

  /** Play one trial, optionally pressing `key` at `foreperiod + delay` ms. */
  async function playOne(spec: ReflexDropSpec, key: string | null, delayAfterOnset: number) {
    const clock = new VirtualClock();
    const input = new QueueInput(clock);
    const ctx = makeCtx(clock, input);
    const run = reflexDrop.run(spec, ctx);
    const respondAt = 16.6667 + spec.trials[0]!.foreperiod_ms + delayAfterOnset;
    let injected = false;
    await clock.pump(8000, (t) => {
      if (key !== null && !injected && t >= respondAt) {
        input.inject({ kind: "key", t, key });
        injected = true;
      }
    });
    return (await run)[0]!;
  }

  it("catches the released rod and records the RT", async () => {
    const tr = await playOne(oneTrial(2), "f", 250);
    expect(tr.false_start).toBe(false);
    expect(tr.correct).toBe(true);
    expect(tr.payload).toEqual({ rod: 2, responded_rod: 2 });
    const rt = tr.response_ms! - tr.onset_ms;
    expect(rt).toBeGreaterThan(180);
    expect(rt).toBeLessThan(300);
  });

  it("scores a grab at the wrong rod as incorrect, not as a miss", async () => {
    const tr = await playOne(oneTrial(2), "s", 250);
    expect(tr.correct).toBe(false);
    expect(tr.false_start).toBe(false);
    expect(tr.response_ms).not.toBeNull(); // committed to a rod — RT still real
    expect(tr.payload).toEqual({ rod: 2, responded_rod: 0 });
  });

  it("records a miss once the rod clears the catch line", async () => {
    const tr = await playOne(oneTrial(2), null, 0);
    expect(tr.response_ms).toBeNull();
    expect(tr.correct).toBe(false);
    expect(tr.false_start).toBe(false);
    expect(tr.payload).toEqual({ rod: 2, responded_rod: null });
  });

  it("ignores keys that map to no rod", async () => {
    const tr = await playOne(oneTrial(2), "z", 250);
    expect(tr.response_ms).toBeNull(); // "z" is not a rod — window ran out
    expect(tr.payload).toEqual({ rod: 2, responded_rod: null });
  });

  it("classifies a press before release as a false start", async () => {
    const clock = new VirtualClock();
    const input = new QueueInput(clock);
    const ctx = makeCtx(clock, input);
    const run = reflexDrop.run(oneTrial(2, 1500), ctx);
    let injected = false;
    await clock.pump(8000, (t) => {
      if (!injected && t > 400) {
        input.inject({ kind: "key", t, key: "f" });
        injected = true;
      }
    });
    const tr = (await run)[0]!;
    expect(tr.false_start).toBe(true);
    expect(tr.correct).toBe(false);
    expect(tr.payload).toEqual({ rod: 2, responded_rod: null });
  });

  it("resolves a tap to the nearest rod column", async () => {
    const clock = new VirtualClock();
    const input = new QueueInput(clock);
    const ctx = makeCtx(clock, input);
    const run = reflexDrop.run(oneTrial(0), ctx);
    let injected = false;
    await clock.pump(8000, (t) => {
      if (!injected && t >= 16.6667 + 1200 + 200) {
        // far left of a 420px stage — nearest column is rod 0
        input.inject({ kind: "pointer", t, x: 20, y: 300 });
        injected = true;
      }
    });
    const tr = (await run)[0]!;
    expect(tr.correct).toBe(true);
    expect(tr.payload).toEqual({ rod: 0, responded_rod: 0 });
  });
});
