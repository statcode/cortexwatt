/** Drift Watch — attention. Multi-object tracking (PRD §6.4).
 * Targets pulse amber, all orbs become identical, drift with elastic bounces,
 * freeze, then the user picks the targets. Physics run from motion_seed with a
 * fixed timestep so a round is exactly reproducible. */

import type { DriftWatchSpec, GameContext, GameModule, TrialResult } from "../types";
import { mulberry32 } from "../prng";
import { FOCUS, clearField, clocksOf, paintFrame, stage, waitMs } from "./common";

const PHYSICS_HZ = 120;
const PAD = 0.06; // normalized wall padding
const ORB_R = 0.035; // normalized orb radius

export interface Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Deterministic initial state from motion_seed. Exported for the golden test. */
export function initOrbs(seed: number, count: number, speedNorm: number): Orb[] {
  const rng = mulberry32(seed);
  const orbs: Orb[] = [];
  while (orbs.length < count) {
    const x = PAD + ORB_R + rng() * (1 - 2 * (PAD + ORB_R));
    const y = PAD + ORB_R + rng() * (1 - 2 * (PAD + ORB_R));
    if (orbs.some((o) => Math.hypot(o.x - x, o.y - y) < ORB_R * 2.4)) continue;
    const a = rng() * Math.PI * 2;
    orbs.push({ x, y, vx: Math.cos(a) * speedNorm, vy: Math.sin(a) * speedNorm });
  }
  return orbs;
}

/** One fixed physics step (dt = 1/PHYSICS_HZ). Exported for the golden test. */
export function stepOrbs(orbs: Orb[]): void {
  const dt = 1 / PHYSICS_HZ;
  for (const o of orbs) {
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    if (o.x < PAD + ORB_R) { o.x = PAD + ORB_R; o.vx = Math.abs(o.vx); }
    if (o.x > 1 - PAD - ORB_R) { o.x = 1 - PAD - ORB_R; o.vx = -Math.abs(o.vx); }
    if (o.y < PAD + ORB_R) { o.y = PAD + ORB_R; o.vy = Math.abs(o.vy); }
    if (o.y > 1 - PAD - ORB_R) { o.y = 1 - PAD - ORB_R; o.vy = -Math.abs(o.vy); }
  }
  // elastic orb-orb: equal masses — swap velocity components along the normal
  for (let i = 0; i < orbs.length; i++) {
    for (let j = i + 1; j < orbs.length; j++) {
      const a = orbs[i]!;
      const b = orbs[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0 || dist >= ORB_R * 2) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const va = a.vx * nx + a.vy * ny;
      const vb = b.vx * nx + b.vy * ny;
      if (va - vb <= 0) continue; // separating already
      a.vx += (vb - va) * nx; a.vy += (vb - va) * ny;
      b.vx += (va - vb) * nx; b.vy += (va - vb) * ny;
      const overlap = ORB_R * 2 - dist;
      a.x -= (nx * overlap) / 2; a.y -= (ny * overlap) / 2;
      b.x += (nx * overlap) / 2; b.y += (ny * overlap) / 2;
    }
  }
}

export const driftWatch: GameModule<DriftWatchSpec> = {
  id: "drift_watch",
  domain: "attention",

  async run(spec: DriftWatchSpec, ctx: GameContext): Promise<TrialResult[]> {
    const clocks = clocksOf(ctx);
    const s = stage(ctx.canvas);
    const results: TrialResult[] = [];
    const record = (r: TrialResult) => {
      results.push(r);
      ctx.onTrialResult?.(r);
    };
    const nRounds = spec.rounds.length;
    ctx.controls.clear();

    const S = Math.min(s.w, s.h) * 0.92; // square stage side
    const ox = s.cx - S / 2;
    const oy = s.cy - S / 2;
    const toPx = (v: number) => v * S;

    function drawOrbs(
      orbs: Orb[],
      opts: { highlight?: Set<number>; highlightColor?: string; selected?: Set<number>; cursor?: number | null; alpha?: number },
    ) {
      clearField(s);
      const { c, u } = s;
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i]!;
        const x = ox + toPx(o.x);
        const y = oy + toPx(o.y);
        const r = toPx(ORB_R);
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        if (opts.highlight?.has(i)) {
          c.fillStyle = opts.highlightColor ?? FOCUS.amber;
          c.globalAlpha = opts.alpha ?? 1;
          c.fill();
          c.globalAlpha = 1;
        } else if (opts.selected?.has(i)) {
          c.fillStyle = FOCUS.lime;
          c.fill();
        } else {
          c.fillStyle = FOCUS.ink;
          c.globalAlpha = 0.85;
          c.fill();
          c.globalAlpha = 1;
        }
        if (opts.cursor === i) {
          c.strokeStyle = FOCUS.lime;
          c.lineWidth = Math.max(1, 2 * u);
          c.beginPath();
          c.arc(x, y, r + 5 * u, 0, Math.PI * 2);
          c.stroke();
        }
      }
    }

    for (let round = 0; round < nRounds; round++) {
      ctx.onTrialProgress(round, nRounds);
      const rSpec = spec.rounds[round]!;
      const speedNorm = spec.drift_speed / 600; // normalized units/s
      const orbs = initOrbs(rSpec.motion_seed, rSpec.orb_count, speedNorm);
      const targets = new Set(rSpec.target_ids);

      // 1) Pulse targets amber for 1.5 s
      const pulseStart = clocks.now();
      if (ctx.reducedMotion) {
        await paintFrame(clocks, () => drawOrbs(orbs, { highlight: targets }));
        await waitMs(clocks, 1500, ctx.abortSignal);
      } else {
        await new Promise<void>((resolve, reject) => {
          const tick = (t: number) => {
            if (ctx.abortSignal.aborted) return reject(new DOMException("aborted", "AbortError"));
            const el = t - pulseStart;
            if (el >= 1500) return resolve();
            const alpha = 0.55 + 0.45 * Math.sin((el / 250) * Math.PI);
            drawOrbs(orbs, { highlight: targets, alpha: Math.abs(alpha) });
            clocks.raf(tick);
          };
          clocks.raf(tick);
        });
      }

      // 2) Drift — fixed-timestep physics accumulated from rAF time
      const totalSteps = Math.round((spec.duration_ms / 1000) * PHYSICS_HZ);
      let stepsDone = 0;
      await new Promise<void>((resolve, reject) => {
        let start: number | null = null;
        const tick = (t: number) => {
          if (ctx.abortSignal.aborted) return reject(new DOMException("aborted", "AbortError"));
          if (start === null) start = t;
          const due = Math.min(totalSteps, Math.floor(((t - start) / 1000) * PHYSICS_HZ));
          while (stepsDone < due) {
            stepOrbs(orbs);
            stepsDone++;
          }
          drawOrbs(orbs, {});
          if (stepsDone >= totalSteps) return resolve();
          clocks.raf(tick);
        };
        clocks.raf(tick);
      });

      // 3) Freeze → selection
      ctx.input.clear();
      const selected = new Set<number>();
      let cursor: number | null = null;
      const onset = await paintFrame(clocks, () => drawOrbs(orbs, { selected }));
      ctx.onStimulus?.(onset);
      let lastT: number | null = null;

      const nearestOrb = (x: number, y: number): number | null => {
        let best: number | null = null;
        let bestD = toPx(ORB_R) * 1.8;
        for (let i = 0; i < orbs.length; i++) {
          const d = Math.hypot(ox + toPx(orbs[i]!.x) - x, oy + toPx(orbs[i]!.y) - y);
          if (d < bestD) { bestD = d; best = i; }
        }
        return best;
      };

      while (selected.size < targets.size) {
        const ev = await ctx.input.next({ deadline: onset + 30000, signal: ctx.abortSignal });
        if (ev === null) break; // selection timeout — score what we have
        if (ev.kind === "pointer" && ev.x !== undefined && ev.y !== undefined) {
          const hit = nearestOrb(ev.x, ev.y);
          if (hit !== null) {
            selected.has(hit) ? selected.delete(hit) : selected.add(hit);
            lastT = ev.t;
          }
        } else if (ev.kind === "key") {
          if (ev.key === "arrowright" || ev.key === "arrowdown") {
            cursor = cursor === null ? 0 : (cursor + 1) % orbs.length;
          } else if (ev.key === "arrowleft" || ev.key === "arrowup") {
            cursor = cursor === null ? orbs.length - 1 : (cursor + orbs.length - 1) % orbs.length;
          } else if (ev.key === " " && cursor !== null) {
            selected.has(cursor) ? selected.delete(cursor) : selected.add(cursor);
            lastT = ev.t;
          }
        }
        await paintFrame(clocks, () => drawOrbs(orbs, { selected, cursor }));
      }

      const selectedIds = [...selected].sort((a, b) => a - b);
      const nCorrect = selectedIds.filter((id) => targets.has(id)).length;
      record({
        trial_index: round,
        onset_ms: onset,
        response_ms: lastT,
        correct: nCorrect === targets.size && selected.size === targets.size,
        false_start: false,
        interrupted: ctx.interruption.consume(),
        payload: { selected_ids: selectedIds, target_ids: rSpec.target_ids, n_correct: nCorrect },
      });

      // reveal: show true targets briefly
      await paintFrame(clocks, () => drawOrbs(orbs, { highlight: targets, selected }));
      await waitMs(clocks, ctx.reducedMotion ? 400 : 700, ctx.abortSignal);
    }

    ctx.onTrialProgress(nRounds, nRounds);
    return results;
  },
};
