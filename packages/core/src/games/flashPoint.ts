/** Flash Point — processing_speed. Simple reaction time (PRD §6.1).
 * Vast empty field, faint fixation; a Signal Lime disc appears after an
 * unpredictable pause — respond the instant it appears. */

import type { FlashPointSpec, GameContext, GameModule, TrialResult } from "../types";
import {
  FOCUS,
  clearField,
  clocksOf,
  drawFixation,
  flashFalseStart,
  paintFrame,
  runForeperiod,
  stage,
  waitMs,
} from "./common";

export const flashPoint: GameModule<FlashPointSpec> = {
  id: "flash_point",
  domain: "processing_speed",

  async run(spec: FlashPointSpec, ctx: GameContext): Promise<TrialResult[]> {
    const clocks = clocksOf(ctx);
    const s = stage(ctx.canvas);
    const results: TrialResult[] = [];
    const record = (r: TrialResult) => {
      results.push(r);
      ctx.onTrialResult?.(r);
    };
    const n = spec.trials.length;
    ctx.controls.clear();

    const drawWaiting = () => {
      clearField(s);
      drawFixation(s);
    };
    const drawStimulus = () => {
      clearField(s);
      s.c.fillStyle = FOCUS.lime;
      s.c.beginPath();
      s.c.arc(s.cx, s.cy, 32 * s.u, 0, Math.PI * 2); // Ø64 reference px
      s.c.fill();
    };

    for (let i = 0; i < n; i++) {
      ctx.onTrialProgress(i, n);
      const fp = spec.trials[i]!.foreperiod_ms;

      const { falseStart, scheduledOnset } = await runForeperiod(ctx, fp, drawWaiting);
      if (falseStart) {
        record({
          trial_index: i,
          onset_ms: scheduledOnset,
          response_ms: falseStart.t,
          correct: false,
          false_start: true,
          interrupted: ctx.interruption.consume(),
          payload: {},
        });
        await flashFalseStart(ctx, s, drawWaiting);
        await waitMs(clocks, 350, ctx.abortSignal);
        continue;
      }

      const onset = await paintFrame(clocks, drawStimulus);
      ctx.onStimulus?.(onset);
      const ev = await ctx.input.next({
        deadline: onset + spec.response_window_ms,
        signal: ctx.abortSignal,
      });

      // Event painted-race guard: a response stamped before the actual paint
      // is a false start, not a superhuman RT.
      const isFalseStart = ev !== null && ev.t < onset;
      record({
        trial_index: i,
        onset_ms: onset,
        response_ms: ev?.t ?? null,
        correct: ev !== null && !isFalseStart,
        false_start: isFalseStart,
        interrupted: ctx.interruption.consume(),
        payload: {},
      });

      await paintFrame(clocks, drawWaiting);
      await waitMs(clocks, 350, ctx.abortSignal);
    }

    ctx.onTrialProgress(n, n);
    return results;
  },
};
