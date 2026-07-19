/** Echo Grid — memory. Pattern recall (PRD §6.6).
 * Cells light in rose, hold, clear; after a draining-hairline delay the user
 * rebuilds the pattern by tapping cells, with undo, then Confirm. */

import type { EchoGridSpec, GameContext, GameModule, TrialResult } from "../types";
import { FOCUS, clearField, clocksOf, paintFrame, stage, waitUntil } from "./common";

export const echoGrid: GameModule<EchoGridSpec> = {
  id: "echo_grid",
  domain: "memory",

  async run(spec: EchoGridSpec, ctx: GameContext): Promise<TrialResult[]> {
    const clocks = clocksOf(ctx);
    const s = stage(ctx.canvas);
    const results: TrialResult[] = [];
    const record = (r: TrialResult) => {
      results.push(r);
      ctx.onTrialResult?.(r);
    };
    const n = spec.trials.length;

    for (let i = 0; i < n; i++) {
      ctx.onTrialProgress(i, n);
      const trial = spec.trials[i]!;
      const g = trial.grid;
      const targetSet = new Set(trial.cells);

      const tile = Math.min(64 * s.u, (s.r * 1.7) / g);
      const gap = Math.max(6 * s.u, tile * 0.12);
      const side = g * tile + (g - 1) * gap;
      const gx = s.cx - side / 2;
      const gy = s.cy - side / 2;

      function cellRect(cell: number): [number, number] {
        const col = cell % g;
        const row = Math.floor(cell / g);
        return [gx + col * (tile + gap), gy + row * (tile + gap)];
      }

      function drawGrid(opts: { lit?: Set<number>; chosen?: number[]; cursor?: number | null; delayFrac?: number }) {
        clearField(s);
        const { c, u } = s;
        const chosenSet = new Set(opts.chosen ?? []);
        for (let cell = 0; cell < g * g; cell++) {
          const [x, y] = cellRect(cell);
          c.fillStyle = opts.lit?.has(cell)
            ? FOCUS.rose
            : chosenSet.has(cell)
              ? FOCUS.rose
              : FOCUS.dimmer;
          c.beginPath();
          c.roundRect(x, y, tile, tile, 6 * u);
          c.fill();
          if (opts.cursor === cell) {
            c.strokeStyle = FOCUS.lime;
            c.lineWidth = Math.max(1, 2 * u);
            c.beginPath();
            c.roundRect(x - 2 * u, y - 2 * u, tile + 4 * u, tile + 4 * u, 7 * u);
            c.stroke();
          }
        }
        if (opts.delayFrac !== undefined) {
          // draining hairline delay bar
          const bw = side * opts.delayFrac;
          c.strokeStyle = FOCUS.dim;
          c.lineWidth = Math.max(1, 1.5 * u);
          c.beginPath();
          c.moveTo(gx, gy + side + 18 * u);
          c.lineTo(gx + bw, gy + side + 18 * u);
          c.stroke();
        }
      }

      // 1) Expose
      const exposeT = await paintFrame(clocks, () => drawGrid({ lit: targetSet }));
      await waitUntil(clocks, exposeT + trial.expose_ms, ctx.abortSignal);

      // 2) Delay with draining bar
      const delayStart = clocks.now();
      await new Promise<void>((resolve, reject) => {
        const tick = (t: number) => {
          if (ctx.abortSignal.aborted) return reject(new DOMException("aborted", "AbortError"));
          const el = t - delayStart;
          if (el >= trial.delay_ms) return resolve();
          drawGrid({ delayFrac: ctx.reducedMotion ? 1 : 1 - el / trial.delay_ms });
          clocks.raf(tick);
        };
        clocks.raf(tick);
      });

      // 3) Rebuild
      ctx.controls.set([
        { id: "undo", label: "Undo · Z", key: "z" },
        { id: "confirm", label: "Confirm · ⏎", key: "enter", variant: "primary" },
      ]);
      ctx.input.clear();
      const chosen: number[] = [];
      let cursor: number | null = null;
      const onset = await paintFrame(clocks, () => drawGrid({ chosen }));
      ctx.onStimulus?.(onset);
      let responseT: number | null = null;
      let confirmed = false;

      const cellAt = (x: number, y: number): number | null => {
        const col = Math.floor((x - gx) / (tile + gap));
        const row = Math.floor((y - gy) / (tile + gap));
        if (col < 0 || col >= g || row < 0 || row >= g) return null;
        const [cx0, cy0] = cellRect(row * g + col);
        if (x > cx0 + tile || y > cy0 + tile) return null; // in the gap
        return row * g + col;
      };

      while (!confirmed) {
        const ev = await ctx.input.next({ deadline: onset + 60000, signal: ctx.abortSignal });
        if (ev === null) break; // hard timeout — score what's placed
        if (ev.kind === "pointer" && ev.x !== undefined && ev.y !== undefined) {
          const cell = cellAt(ev.x, ev.y);
          if (cell !== null) {
            const idx = chosen.indexOf(cell);
            idx >= 0 ? chosen.splice(idx, 1) : chosen.push(cell);
            responseT = ev.t;
          }
        } else if (ev.kind === "key" || ev.kind === "button") {
          const key = ev.kind === "key" ? ev.key : undefined;
          const btn = ev.kind === "button" ? ev.button : undefined;
          if (key === "z" || btn === "undo") {
            chosen.pop();
          } else if (key === "enter" || btn === "confirm") {
            if (chosen.length > 0) {
              confirmed = true;
              responseT = ev.t;
            }
          } else if (key === "arrowright") cursor = cursor === null ? 0 : (cursor + 1) % (g * g);
          else if (key === "arrowleft") cursor = cursor === null ? g * g - 1 : (cursor + g * g - 1) % (g * g);
          else if (key === "arrowdown") cursor = cursor === null ? 0 : (cursor + g) % (g * g);
          else if (key === "arrowup") cursor = cursor === null ? 0 : (cursor + g * g - g) % (g * g);
          else if (key === " " && cursor !== null) {
            const idx = chosen.indexOf(cursor);
            idx >= 0 ? chosen.splice(idx, 1) : chosen.push(cursor);
            responseT = ev.t;
          }
        }
        await paintFrame(clocks, () => drawGrid({ chosen, cursor }));
      }

      const nCorrect = chosen.filter((cell) => targetSet.has(cell)).length;
      const nExtra = chosen.length - nCorrect;
      record({
        trial_index: i,
        onset_ms: onset,
        response_ms: responseT,
        correct: nCorrect === trial.cells.length && nExtra === 0,
        false_start: false,
        interrupted: ctx.interruption.consume(),
        payload: {
          chosen: chosen.slice().sort((a, b) => a - b),
          n_correct: nCorrect,
          n_extra: nExtra,
          n_cells: trial.cells.length,
        },
      });

      // brief reveal of the true pattern
      await paintFrame(clocks, () => drawGrid({ lit: targetSet }));
      await waitUntil(clocks, clocks.now() + (ctx.reducedMotion ? 350 : 650), ctx.abortSignal);
      ctx.controls.clear();
    }

    ctx.onTrialProgress(n, n);
    return results;
  },
};
