/** Wide Angle — visual. Useful field of view (PRD §6.5).
 * A center symbol flashes at fixation while a peripheral blip appears at some
 * bearing/eccentricity among distractor speckles. Then a two-part, untimed
 * response: which center symbol, then where the blip was (12-arc ring). */

import type { GameContext, GameModule, TrialResult, WideAngleSpec } from "../types";
import { mulberry32 } from "../prng";
import {
  FOCUS,
  clearField,
  clocksOf,
  drawFixation,
  flashFalseStart,
  paintFrame,
  runForeperiod,
  stage,
  waitUntil,
} from "./common";

function arcDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d);
}

export const wideAngle: GameModule<WideAngleSpec> = {
  id: "wide_angle",
  domain: "visual",

  async run(spec: WideAngleSpec, ctx: GameContext): Promise<TrialResult[]> {
    const clocks = clocksOf(ctx);
    const s = stage(ctx.canvas);
    const results: TrialResult[] = [];
    const record = (r: TrialResult) => {
      results.push(r);
      ctx.onTrialResult?.(r);
    };
    const n = spec.trials.length;

    const { c, cx, cy, r, u } = s;

    function drawSymbol(sym: 0 | 1) {
      c.fillStyle = FOCUS.ink;
      if (sym === 0) {
        // ◆
        const a = 13 * u;
        c.beginPath();
        c.moveTo(cx, cy - a);
        c.lineTo(cx + a, cy);
        c.lineTo(cx, cy + a);
        c.lineTo(cx - a, cy);
        c.closePath();
        c.fill();
      } else {
        // ●
        c.beginPath();
        c.arc(cx, cy, 11 * u, 0, Math.PI * 2);
        c.fill();
      }
    }

    function drawFlash(trial: WideAngleSpec["trials"][number], trialIdx: number) {
      clearField(s);
      drawSymbol(trial.center_symbol);
      // peripheral blip at bearing_arc·30°, eccentricity% of field radius
      const ang = ((trial.bearing_arc * 30 - 90) * Math.PI) / 180;
      const ecc = (trial.eccentricity_pct / 100) * r;
      c.fillStyle = FOCUS.lime;
      c.beginPath();
      c.arc(cx + ecc * Math.cos(ang), cy + ecc * Math.sin(ang), 6 * u, 0, Math.PI * 2);
      c.fill();
      // distractor speckles — cosmetic clutter, client-seeded (non-scored)
      const rng = mulberry32(0x5eed + trialIdx * 7919);
      c.fillStyle = FOCUS.dim;
      for (let k = 0; k < trial.distractors; k++) {
        const da = rng() * Math.PI * 2;
        const de = (0.12 + rng() * 0.75) * r;
        const px = cx + de * Math.cos(da);
        const py = cy + de * Math.sin(da);
        if (Math.hypot(px - (cx + ecc * Math.cos(ang)), py - (cy + ecc * Math.sin(ang))) < 22 * u) continue;
        c.beginPath();
        c.arc(px, py, 3 * u, 0, Math.PI * 2);
        c.fill();
      }
    }

    function drawRing(cursorArc: number | null, chosenArc: number | null) {
      clearField(s);
      c.fillStyle = FOCUS.dim;
      c.font = `${13 * u}px system-ui, sans-serif`;
      c.textAlign = "center";
      c.fillText("Where was the blip?", cx, cy + 4 * u);
      for (let k = 0; k < 12; k++) {
        const a0 = ((k * 30 - 15 + 3 - 90) * Math.PI) / 180;
        const a1 = ((k * 30 + 15 - 3 - 90) * Math.PI) / 180;
        const active = k === cursorArc || k === chosenArc;
        c.strokeStyle = active ? FOCUS.lime : FOCUS.dim;
        c.lineWidth = active ? 5 * u : Math.max(1, 1.5 * u);
        c.beginPath();
        c.arc(cx, cy, r * 0.82, a0, a1);
        c.stroke();
      }
    }

    const drawWaiting = () => {
      clearField(s);
      drawFixation(s);
    };

    for (let i = 0; i < n; i++) {
      ctx.onTrialProgress(i, n);
      const trial = spec.trials[i]!;
      ctx.controls.clear();

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
          payload: { center_ok: false, bearing_ok: false, chosen_arc: null },
        });
        await flashFalseStart(ctx, s, drawWaiting);
        continue;
      }

      // Flash
      const onset = await paintFrame(clocks, () => drawFlash(trial, i));
      ctx.onStimulus?.(onset);
      await waitUntil(clocks, onset + trial.flash_ms, ctx.abortSignal);
      await paintFrame(clocks, () => clearField(s));

      // Part 1 — which center symbol (untimed, recorded)
      ctx.controls.set([
        { id: "sym0", label: "◆ · F", key: "f" },
        { id: "sym1", label: "● · J", key: "j" },
      ]);
      await paintFrame(clocks, () => {
        clearField(s);
        c.fillStyle = FOCUS.dim;
        c.font = `${13 * u}px system-ui, sans-serif`;
        c.textAlign = "center";
        c.fillText("Which symbol was at center?", cx, cy);
      });
      ctx.input.clear();
      let chosenSym: 0 | 1 | null = null;
      while (chosenSym === null) {
        const ev = await ctx.input.next({ signal: ctx.abortSignal });
        if (ev === null) continue;
        if ((ev.kind === "key" && ev.key === "f") || (ev.kind === "button" && ev.button === "sym0")) chosenSym = 0;
        else if ((ev.kind === "key" && ev.key === "j") || (ev.kind === "button" && ev.button === "sym1")) chosenSym = 1;
      }

      // Part 2 — bearing on the response ring
      ctx.controls.clear();
      let cursorArc: number | null = null;
      let chosenArc: number | null = null;
      let responseT: number | null = null;
      ctx.input.clear();
      await paintFrame(clocks, () => drawRing(cursorArc, null));
      while (chosenArc === null) {
        const ev = await ctx.input.next({ signal: ctx.abortSignal });
        if (ev === null) continue;
        if (ev.kind === "pointer" && ev.x !== undefined && ev.y !== undefined) {
          const dx = ev.x - cx;
          const dy = ev.y - cy;
          if (Math.hypot(dx, dy) > r * 0.35) {
            const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
            chosenArc = Math.round(deg / 30) % 12;
            responseT = ev.t;
          }
        } else if (ev.kind === "key") {
          if (ev.key === "arrowright" || ev.key === "arrowdown") {
            cursorArc = cursorArc === null ? 0 : (cursorArc + 1) % 12;
            await paintFrame(clocks, () => drawRing(cursorArc, null));
          } else if (ev.key === "arrowleft" || ev.key === "arrowup") {
            cursorArc = cursorArc === null ? 11 : (cursorArc + 11) % 12;
            await paintFrame(clocks, () => drawRing(cursorArc, null));
          } else if (ev.key === " " && cursorArc !== null) {
            chosenArc = cursorArc;
            responseT = ev.t;
          }
        }
      }

      const centerOk = chosenSym === trial.center_symbol;
      const bearingOk = arcDelta(chosenArc, trial.bearing_arc) <= 1;
      record({
        trial_index: i,
        onset_ms: onset,
        response_ms: responseT,
        correct: centerOk && bearingOk,
        false_start: false,
        interrupted: ctx.interruption.consume(),
        payload: { center_ok: centerOk, bearing_ok: bearingOk, chosen_arc: chosenArc },
      });

      await paintFrame(clocks, () => drawRing(null, chosenArc));
    }

    ctx.onTrialProgress(n, n);
    ctx.controls.clear();
    return results;
  },
};
