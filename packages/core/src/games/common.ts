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

/** How long a verdict holds — the design doc caps micro-states at 150 ms. */
export const VERDICT_MS = 140;
const ERROR_DASH = [6, 6];

/**
 * The shared verdict mark: a lime halo for a hit, a coral halo plus a coral X
 * for a miss. Draws onto the frame the caller has already composed — it never
 * clears — so games that already reveal the answer (Echo Grid's pattern, Drift
 * Watch's targets) can overlay it without spending extra time.
 *
 * The error halo is dashed and the hit halo solid, so the two never depend on
 * red-versus-green discrimination alone (design doc, Accessibility in Focus
 * Mode). Games that know *which* element was wrong should also mark it in
 * coral, so the verdict carries position as well as colour.
 */
export function drawVerdict(s: Stage, ok: boolean): void {
  const { c, cx, cy, u, r } = s;
  c.strokeStyle = ok ? FOCUS.lime : FOCUS.coral;
  c.globalAlpha = ok ? 0.5 : 0.6;
  c.lineWidth = Math.max(1, 1.3 * u);
  if (!ok) c.setLineDash(ERROR_DASH.map((d) => d * u));
  c.beginPath();
  c.arc(cx, cy, r * 0.99, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);

  if (!ok) {
    // A small X at fixation — unmistakable, but hairline and gone in 140 ms,
    // so it reads as a mark rather than a punishment.
    const a = 13 * u;
    c.globalAlpha = 0.9;
    c.lineWidth = Math.max(1, 2.2 * u);
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(cx - a, cy - a);
    c.lineTo(cx + a, cy + a);
    c.moveTo(cx + a, cy - a);
    c.lineTo(cx - a, cy + a);
    c.stroke();
    c.lineCap = "butt";
  }
  c.globalAlpha = 1;
}

/** Paint a verdict over `redraw`, hold it, then restore `redraw`. */
export async function verdict(
  ctx: GameContext,
  s: Stage,
  ok: boolean,
  redraw: () => void,
): Promise<void> {
  const clocks = clocksOf(ctx);
  await paintFrame(clocks, () => {
    redraw();
    drawVerdict(s, ok);
  });
  await waitMs(clocks, ctx.reducedMotion ? 60 : VERDICT_MS, ctx.abortSignal);
  await paintFrame(clocks, redraw);
}

export { paintFrame, waitMs, waitUntil };
export { FOCUS };
