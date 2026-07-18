/** Shared drawing + trial-phase helpers for the six Focus Mode games. */

import type { GameContext, InputEventLike } from "../types";
import { FOCUS } from "../theme";
import { type Clocks, defaultClocks, paintFrame, waitMs, waitUntil } from "../timing";

export interface Stage {
  c: CanvasRenderingContext2D;
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** Field radius — the play zone. */
  r: number;
  /** Resolution-independent unit: 1u ≈ 1px on a 420px reference stage. */
  u: number;
}

export function stage(canvas: HTMLCanvasElement): Stage {
  const c = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  const m = Math.min(w, h);
  return { c, w, h, cx: w / 2, cy: h / 2, r: m * 0.42, u: m / 420 };
}

export function clocksOf(ctx: GameContext): Clocks {
  const d = defaultClocks();
  return { now: ctx.now ?? d.now, raf: ctx.raf ?? d.raf };
}

export function clearField(s: Stage): void {
  s.c.fillStyle = FOCUS.bg;
  s.c.fillRect(0, 0, s.w, s.h);
}

export function drawFixation(s: Stage, color: string = FOCUS.dim): void {
  const { c, cx, cy, u } = s;
  c.strokeStyle = color;
  c.lineWidth = Math.max(1, 1.5 * u);
  const a = 7 * u;
  c.beginPath();
  c.moveTo(cx - a, cy);
  c.lineTo(cx + a, cy);
  c.moveTo(cx, cy - a);
  c.lineTo(cx, cy + a);
  c.stroke();
}

/** Quiet coral hairline ring — the false-start acknowledgement (≤150 ms). */
export async function flashFalseStart(ctx: GameContext, s: Stage, redraw: () => void): Promise<void> {
  const clocks = clocksOf(ctx);
  await paintFrame(clocks, () => {
    redraw();
    s.c.strokeStyle = FOCUS.coral;
    s.c.lineWidth = Math.max(1, 1.5 * s.u);
    s.c.beginPath();
    s.c.arc(s.cx, s.cy, s.r * 0.7, 0, Math.PI * 2);
    s.c.stroke();
  });
  await waitMs(clocks, ctx.reducedMotion ? 60 : 140, ctx.abortSignal);
  await paintFrame(clocks, redraw);
}

/**
 * Run a foreperiod: paint the waiting state, then watch for premature input
 * until the scheduled onset. Returns the false-start event (if any) plus the
 * scheduled onset time (§4.4/§4.5).
 */
export async function runForeperiod(
  ctx: GameContext,
  foreperiod_ms: number,
  drawWaiting: (t: number) => void,
): Promise<{ falseStart: InputEventLike | null; scheduledOnset: number }> {
  const clocks = clocksOf(ctx);
  const tw = await paintFrame(clocks, drawWaiting);
  const scheduledOnset = tw + foreperiod_ms;
  ctx.input.clear();
  const ev = await ctx.input.next({ deadline: scheduledOnset, signal: ctx.abortSignal });
  return { falseStart: ev, scheduledOnset };
}

/** Correct/incorrect micro-feedback: hairline glow vs brief dim (≤150 ms). */
export async function microFeedback(
  ctx: GameContext,
  s: Stage,
  ok: boolean,
  redraw: () => void,
): Promise<void> {
  const clocks = clocksOf(ctx);
  await paintFrame(clocks, () => {
    redraw();
    if (ok) {
      s.c.strokeStyle = FOCUS.lime;
      s.c.globalAlpha = 0.5;
      s.c.lineWidth = Math.max(1, 1.2 * s.u);
      s.c.beginPath();
      s.c.arc(s.cx, s.cy, s.r * 0.96, 0, Math.PI * 2);
      s.c.stroke();
      s.c.globalAlpha = 1;
    } else {
      s.c.fillStyle = "rgba(14,21,19,0.45)"; // brief dim — never a red X slap
      s.c.fillRect(0, 0, s.w, s.h);
    }
  });
  await waitMs(clocks, ctx.reducedMotion ? 60 : 130, ctx.abortSignal);
  await paintFrame(clocks, redraw);
}

export { paintFrame, waitMs, waitUntil };
export { FOCUS };
