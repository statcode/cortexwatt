/** Stackwise — working_memory. Spatial n-back on a 3×3 grid (PRD §6.3).
 * Tile lights 500 ms; respond Match / No-match for every presentation after
 * the first N. Emits TrialResults only for scoreable presentations (i ≥ N);
 * trial_index is the presentation index. */

import type { GameContext, GameModule, StackwiseSpec, TrialResult } from "../types";
import { FOCUS, clearField, clocksOf, paintFrame, stage, verdict, waitUntil } from "./common";

const LIT_MS = 500;

export const stackwise: GameModule<StackwiseSpec> = {
  id: "stackwise",
  domain: "working_memory",

  async run(spec: StackwiseSpec, ctx: GameContext): Promise<TrialResult[]> {
    const clocks = clocksOf(ctx);
    const s = stage(ctx.canvas);
    const results: TrialResult[] = [];
    const record = (r: TrialResult) => {
      results.push(r);
      ctx.onTrialResult?.(r);
    };
    const total = spec.presentations.length;
    const scoreableTotal = total - spec.n;

    ctx.controls.set([
      { id: "no_match", label: "No match · F", key: "f" },
      { id: "match", label: "Match · J", key: "j", variant: "primary" },
    ]);

    const tile = 74 * s.u;
    const gap = 12 * s.u;
    const gridSize = 3 * tile + 2 * gap;
    const gx = s.cx - gridSize / 2;
    const gy = s.cy - gridSize / 2;

    function drawGrid(litCell: number | null) {
      clearField(s);
      const { c, u } = s;
      for (let cell = 0; cell < 9; cell++) {
        const col = cell % 3;
        const row = Math.floor(cell / 3);
        const x = gx + col * (tile + gap);
        const y = gy + row * (tile + gap);
        c.fillStyle = cell === litCell ? FOCUS.violet : FOCUS.dimmer;
        c.beginPath();
        c.roundRect(x, y, tile, tile, 8 * u);
        c.fill();
      }
      // "N = k" level marker, outside the play zone
      c.fillStyle = FOCUS.dim;
      c.font = `${13 * u}px system-ui, sans-serif`;
      c.textAlign = "center";
      c.fillText(`N = ${spec.n}`, s.cx, gy - 22 * u);
    }

    const readResponse = (ev: { kind: string; key?: string; button?: string }): boolean | null => {
      if (ev.kind === "key") {
        if (ev.key === "j") return true;
        if (ev.key === "f") return false;
      }
      if (ev.kind === "button") {
        if (ev.button === "match") return true;
        if (ev.button === "no_match") return false;
      }
      return null;
    };

    for (let i = 0; i < total; i++) {
      const scoreableIdx = i - spec.n;
      if (scoreableIdx >= 0) ctx.onTrialProgress(scoreableIdx, scoreableTotal);

      const cell = spec.presentations[i]!.cell;
      const isMatch = i >= spec.n ? cell === spec.presentations[i - spec.n]!.cell : null;

      ctx.input.clear();
      const onset = await paintFrame(clocks, () => drawGrid(cell));
      if (isMatch !== null) ctx.onStimulus?.(onset);
      const windowEnd = onset + LIT_MS + spec.isi_ms;

      let responded: boolean | null = null;
      let responseT: number | null = null;
      let litOff = false;

      // Poll input across the lit + ISI window; turn the tile off at 500 ms.
      for (;;) {
        const phaseDeadline = litOff ? windowEnd : onset + LIT_MS;
        const ev = await ctx.input.next({ deadline: phaseDeadline, signal: ctx.abortSignal });
        if (ev !== null && ev.t >= onset && responded === null) {
          const r = readResponse(ev);
          if (r !== null && isMatch !== null) {
            responded = r;
            responseT = ev.t;
            // Verdict runs *inside* the ISI, never after it: this is a capacity
            // game on a fixed schedule, and the waitUntil(windowEnd) below has
            // to stay the thing that decides when the next tile lights. The
            // redraw re-checks the lit phase each paint, so it self-corrects if
            // the 500 ms lit window closes mid-hold.
            await verdict(ctx, s, r === isMatch, () =>
              drawGrid(clocks.now() < onset + LIT_MS ? cell : null),
            );
          }
          continue;
        }
        if (ev === null) {
          if (!litOff) {
            litOff = true;
            await paintFrame(clocks, () => drawGrid(null));
            continue;
          }
          break;
        }
      }
      // Guarantee schedule integrity even if inputs kept the loop busy.
      await waitUntil(clocks, windowEnd, ctx.abortSignal);

      if (isMatch !== null) {
        record({
          trial_index: i,
          onset_ms: onset,
          response_ms: responseT,
          correct: responded !== null && responded === isMatch,
          false_start: false,
          interrupted: ctx.interruption.consume(),
          payload: { is_match: isMatch, responded_match: responded },
        });
      } else {
        ctx.interruption.consume(); // keep the watcher per-trial scoped
      }
    }

    ctx.onTrialProgress(scoreableTotal, scoreableTotal);
    ctx.controls.clear();
    return results;
  },
};
