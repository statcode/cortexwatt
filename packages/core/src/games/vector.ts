/** Vector — decision_control. Choice RT + inhibition (PRD §6.2).
 * A hairline compass ring of four sectors — up, right, down, left, one per
 * arrow key; one glows — respond in its direction. When the core ignites,
 * respond in the OPPOSITE direction.
 *
 * Diverges from PRD §6.2, which specifies six sectors on Q/W/E/A/S/D: four
 * cardinal directions map onto keys every player already knows, so the
 * stimulus→key translation stops being part of what's measured. Response
 * windows and the reverse-trial proportion are unchanged from the spec. */

import type { GameContext, GameModule, TrialResult, VectorSpec } from "../types";
import {
  FOCUS,
  clearField,
  clocksOf,
  flashFalseStart,
  microFeedback,
  paintFrame,
  runForeperiod,
  stage,
  waitMs,
} from "./common";

/** Sectors, and the arc each one spans. */
const SECTORS = 4;
const ARC = 360 / SECTORS;

// Sector k centered at bearing k·90° from up, clockwise, mapped to the arrow
// keys: 0 = ↑ up, 1 = → right, 2 = ↓ down, 3 = ← left.
const KEY_TO_SECTOR: Record<string, number> = {
  arrowup: 0,
  arrowright: 1,
  arrowdown: 2,
  arrowleft: 3,
};

/** The reverse-trial answer — the sector directly across the ring. */
const opposite = (sector: number) => (sector + SECTORS / 2) % SECTORS;

function sectorOfPoint(cx: number, cy: number, x: number, y: number): number | null {
  const dx = x - cx;
  const dy = y - cy;
  if (Math.hypot(dx, dy) < 1e-6) return null;
  // bearing from up, clockwise, degrees
  const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  return Math.round(deg / ARC) % SECTORS;
}

export const vector: GameModule<VectorSpec> = {
  id: "vector",
  domain: "decision_control",

  async run(spec: VectorSpec, ctx: GameContext): Promise<TrialResult[]> {
    const clocks = clocksOf(ctx);
    const s = stage(ctx.canvas);
    const results: TrialResult[] = [];
    const record = (r: TrialResult) => {
      results.push(r);
      ctx.onTrialResult?.(r);
    };
    const n = spec.trials.length;
    ctx.controls.clear();

    const R = s.r * 0.9;
    const GAP = 4; // degrees between sectors

    function drawRing(glowSector: number | null, coreIgnited: boolean) {
      clearField(s);
      const { c, cx, cy, u } = s;
      for (let k = 0; k < SECTORS; k++) {
        const a0 = ((k * ARC - ARC / 2 + GAP / 2 - 90) * Math.PI) / 180;
        const a1 = ((k * ARC + ARC / 2 - GAP / 2 - 90) * Math.PI) / 180;
        c.strokeStyle = k === glowSector ? FOCUS.lime : FOCUS.dim;
        c.lineWidth = k === glowSector ? 5 * u : Math.max(1, 1.5 * u);
        c.beginPath();
        c.arc(cx, cy, R, a0, a1);
        c.stroke();
      }
      // core — one vertex per direction, so it reads as the same compass
      c.strokeStyle = coreIgnited ? FOCUS.coral : FOCUS.dimmer;
      c.fillStyle = coreIgnited ? FOCUS.coral : "transparent";
      c.lineWidth = Math.max(1, 1.5 * u);
      const hr = 16 * u;
      c.beginPath();
      for (let k = 0; k < SECTORS; k++) {
        const a = ((k * ARC - 90) * Math.PI) / 180;
        const px = cx + hr * Math.cos(a);
        const py = cy + hr * Math.sin(a);
        k === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
      }
      c.closePath();
      if (coreIgnited) c.fill();
      c.stroke();
    }

    const drawWaiting = () => drawRing(null, false);

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
          payload: { sector: trial.sector, reverse: trial.reverse, responded_sector: null },
        });
        await flashFalseStart(ctx, s, drawWaiting);
        continue;
      }

      const onset = await paintFrame(clocks, () => drawRing(trial.sector, trial.reverse));
      ctx.onStimulus?.(onset);

      // Await the first *directional* input in the window.
      let responded: number | null = null;
      let responseT: number | null = null;
      const deadline = onset + spec.response_window_ms;
      for (;;) {
        const ev = await ctx.input.next({ deadline, signal: ctx.abortSignal });
        if (ev === null) break;
        if (ev.t < onset) continue; // pre-paint stragglers
        if (ev.kind === "key" && ev.key !== undefined && KEY_TO_SECTOR[ev.key] !== undefined) {
          responded = KEY_TO_SECTOR[ev.key]!;
          responseT = ev.t;
          break;
        }
        if (ev.kind === "pointer" && ev.x !== undefined && ev.y !== undefined) {
          const sec = sectorOfPoint(s.cx, s.cy, ev.x, ev.y);
          if (sec !== null) {
            responded = sec;
            responseT = ev.t;
            break;
          }
        }
      }

      const target = trial.reverse ? opposite(trial.sector) : trial.sector;
      const correct = responded !== null && responded === target;
      record({
        trial_index: i,
        onset_ms: onset,
        response_ms: responseT,
        correct,
        false_start: false,
        interrupted: ctx.interruption.consume(),
        payload: { sector: trial.sector, reverse: trial.reverse, responded_sector: responded },
      });

      if (responded !== null) await microFeedback(ctx, s, correct, drawWaiting);
      else await paintFrame(clocks, drawWaiting);
      await waitMs(clocks, 800, ctx.abortSignal); // ISI
    }

    ctx.onTrialProgress(n, n);
    return results;
  },
};
