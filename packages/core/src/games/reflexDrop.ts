/** Reflex Drop — processing_speed. Spatial-choice reaction with a visible
 * deadline (PRD §6.1b). A rack of rods hangs from a hairline rail; after an
 * unpredictable pause one is released — catch it before it clears the catch
 * line.
 *
 * Two properties make this measurable rather than merely pretty:
 *   1. The onset is a colour change, not the motion. Under gravity a rod has
 *      barely moved for the first few frames, so "it started falling" is a weak
 *      detection cue; the released rod switches to Signal Lime instantly on the
 *      onset frame (no easing — easing is measurement error, design doc §Motion).
 *   2. The fall is real free-fall (s = ½gt²) scaled so the rod's tip reaches the
 *      catch line exactly as the response window closes. The deadline is
 *      therefore legible, and how far the rod fell *is* the reaction time —
 *      which is why this game needs no HUD to feel fair.
 */

import type { GameContext, GameModule, ReflexDropSpec, TrialResult } from "../types";
import {
  FOCUS,
  clearField,
  clocksOf,
  flashFalseStart,
  paintFrame,
  runForeperiod,
  stage,
  waitMs,
} from "./common";

/** Home-row keys, left hand then right — the rack splits at the same point. */
const ROD_KEYS = ["s", "d", "f", "j", "k", "l"];

/** Extra pitch between the two hand groups (mirrors the rack's centre gap). */
const HAND_GAP = 0.7;

const CATCH_LINE_DASH = [4, 7];

interface Rack {
  /** Rod centre x, left to right. */
  x: number[];
  railY: number;
  rodW: number;
  rodH: number;
  catchY: number;
  /** Distance a rod's tip travels from rest to the catch line. */
  fall: number;
  span: [number, number];
}

function layout(s: ReturnType<typeof stage>, n: number): Rack {
  const railY = s.h * 0.14;
  const rodH = s.h * 0.34;
  const catchY = s.h * 0.8;
  const half = Math.ceil(n / 2);
  const spanUnits = n - 1 + (n > 1 ? HAND_GAP : 0);
  const pitch = (s.w * 0.8) / Math.max(spanUnits, 1);
  const x0 = s.cx - (spanUnits * pitch) / 2;
  const x = Array.from({ length: n }, (_, i) => x0 + (i + (i >= half ? HAND_GAP : 0)) * pitch);
  return {
    x,
    railY,
    rodH,
    catchY,
    rodW: Math.min(pitch * 0.46, 26 * s.u),
    fall: catchY - (railY + rodH),
    span: [x[0]! - pitch * 0.4, x[n - 1]! + pitch * 0.4],
  };
}

export const reflexDrop: GameModule<ReflexDropSpec> = {
  id: "reflex_drop",
  domain: "processing_speed",

  async run(spec: ReflexDropSpec, ctx: GameContext): Promise<TrialResult[]> {
    const clocks = clocksOf(ctx);
    const s = stage(ctx.canvas);
    const results: TrialResult[] = [];
    const record = (r: TrialResult) => {
      results.push(r);
      ctx.onTrialResult?.(r);
    };
    const n = spec.trials.length;
    const rods = spec.rod_count;
    const rack = layout(s, rods);
    ctx.controls.clear();

    const keyToRod: Record<string, number> = {};
    for (let i = 0; i < rods; i++) keyToRod[ROD_KEYS[i % ROD_KEYS.length]!] = i;

    /** Nearest rod column — every point in the field resolves to one, so the
     * effective touch target is far wider than the rod itself. */
    const rodOfPoint = (x: number): number => {
      let best = 0;
      for (let i = 1; i < rods; i++) {
        if (Math.abs(x - rack.x[i]!) < Math.abs(x - rack.x[best]!)) best = i;
      }
      return best;
    };

    /** Free-fall displacement at `dt` ms after release, clamped to the line. */
    const fallAt = (dt: number) => {
      const f = Math.min(1, Math.max(0, dt / spec.catch_window_ms));
      return rack.fall * f * f;
    };

    function draw(dropping: number | null, fallPx: number, grabbed: number | null) {
      clearField(s);
      const { c, u } = s;
      const lw = Math.max(1, 1.5 * u);

      // rail
      c.strokeStyle = FOCUS.dim;
      c.lineWidth = lw;
      c.beginPath();
      c.moveTo(rack.span[0], rack.railY);
      c.lineTo(rack.span[1], rack.railY);
      c.stroke();

      // catch line — the deadline. Same weight as the rail: it is the thing the
      // player is racing, so it has to read at a glance.
      c.strokeStyle = FOCUS.dim;
      c.setLineDash(CATCH_LINE_DASH);
      c.beginPath();
      c.moveTo(rack.span[0], rack.catchY);
      c.lineTo(rack.span[1], rack.catchY);
      c.stroke();
      c.setLineDash([]);

      const r = rack.rodW / 2;
      for (let i = 0; i < rods; i++) {
        const cxi = rack.x[i]!;
        const active = i === dropping;
        const y = rack.railY + (active ? fallPx : 0);

        // clamp at the rail — stays behind when its rod is released
        c.fillStyle = FOCUS.dim;
        c.beginPath();
        c.roundRect(cxi - r * 0.75, rack.railY - 3 * u, r * 1.5, 6 * u, 2 * u);
        c.fill();

        c.beginPath();
        c.roundRect(cxi - r, y, rack.rodW, rack.rodH, r);
        if (active) {
          c.fillStyle = FOCUS.lime;
          c.fill();
        } else {
          c.fillStyle = FOCUS.dimmer;
          c.fill();
          c.strokeStyle = FOCUS.dim;
          c.lineWidth = lw;
          c.stroke();
        }

        if (i === grabbed && i !== dropping) {
          c.strokeStyle = FOCUS.coral;
          c.lineWidth = Math.max(1, 2 * u);
          c.beginPath();
          c.roundRect(cxi - r - 3 * u, y - 3 * u, rack.rodW + 6 * u, rack.rodH + 6 * u, r);
          c.stroke();
        }
      }
    }

    const drawWaiting = () => draw(null, 0, null);

    for (let i = 0; i < n; i++) {
      ctx.onTrialProgress(i, n);
      const trial = spec.trials[i]!;

      const { falseStart, scheduledOnset } = await runForeperiod(
        ctx,
        trial.foreperiod_ms,
        drawWaiting,
      );
      if (falseStart) {
        record({
          trial_index: i,
          onset_ms: scheduledOnset,
          response_ms: falseStart.t,
          correct: false,
          false_start: true,
          interrupted: ctx.interruption.consume(),
          payload: { rod: trial.rod, responded_rod: null },
        });
        await flashFalseStart(ctx, s, drawWaiting);
        await waitMs(clocks, 350, ctx.abortSignal);
        continue;
      }

      // Release frame: the rod turns lime at zero displacement — this paint is
      // the measured onset.
      const onset = await paintFrame(clocks, () => draw(trial.rod, 0, null));
      ctx.onStimulus?.(onset);

      // Animate the fall alongside the open response window. Both are driven by
      // the same rAF clock, so a headless virtual clock drives them together.
      let falling = true;
      const tick = (t: number) => {
        if (!falling || ctx.abortSignal.aborted) return;
        draw(trial.rod, fallAt(t - onset), null);
        clocks.raf(tick);
      };
      clocks.raf(tick);

      let responded: number | null = null;
      let responseT: number | null = null;
      const deadline = onset + spec.catch_window_ms;
      try {
        for (;;) {
          const ev = await ctx.input.next({ deadline, signal: ctx.abortSignal });
          if (ev === null) break; // window closed — the rod cleared the line
          if (ev.t < onset) continue; // pre-paint straggler
          if (ev.kind === "key") {
            const rod = ev.key === undefined ? undefined : keyToRod[ev.key];
            if (rod === undefined) continue;
            responded = rod;
            responseT = ev.t;
            break;
          }
          if (ev.kind === "pointer" && ev.x !== undefined) {
            responded = rodOfPoint(ev.x);
            responseT = ev.t;
            break;
          }
        }
      } finally {
        falling = false;
      }

      const correct = responded === trial.rod;
      record({
        trial_index: i,
        onset_ms: onset,
        response_ms: responseT,
        correct,
        false_start: false,
        interrupted: ctx.interruption.consume(),
        payload: { rod: trial.rod, responded_rod: responded },
      });

      if (responded !== null) {
        // Freeze the rod where it was caught — the drop distance is the RT.
        const held = fallAt(responseT! - onset);
        const frozen = () => draw(trial.rod, held, responded);
        await paintFrame(clocks, frozen);
        // Not the shared microFeedback(): its glow is a ring around the stage
        // centre, which suits the centre-focused games but reads as an unrelated
        // circle over a rack that spans the field. Same semantics and timings —
        // hairline glow vs brief dim, ≤150 ms, never a red X slap.
        await paintFrame(clocks, () => {
          frozen();
          if (correct) {
            s.c.strokeStyle = FOCUS.lime;
            s.c.globalAlpha = 0.5;
            s.c.lineWidth = Math.max(1, 1.2 * s.u);
            s.c.beginPath();
            s.c.roundRect(
              rack.x[trial.rod]! - rack.rodW / 2 - 5 * s.u,
              rack.railY + held - 5 * s.u,
              rack.rodW + 10 * s.u,
              rack.rodH + 10 * s.u,
              rack.rodW / 2 + 5 * s.u,
            );
            s.c.stroke();
            s.c.globalAlpha = 1;
          } else {
            s.c.fillStyle = "rgba(14,21,19,0.45)";
            s.c.fillRect(0, 0, s.w, s.h);
          }
        });
        await waitMs(clocks, ctx.reducedMotion ? 60 : 130, ctx.abortSignal);
        await paintFrame(clocks, frozen);
      } else {
        await paintFrame(clocks, () => draw(trial.rod, rack.fall, null));
      }
      await paintFrame(clocks, drawWaiting);
      await waitMs(clocks, 350, ctx.abortSignal);
    }

    ctx.onTrialProgress(n, n);
    return results;
  },
};
