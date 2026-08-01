/** Session metrics + per-game performance index — PRD §5/§6.
 * Implemented identically server-side (Python) as truth; this copy powers
 * instant client display and the bot/staircase tests. */

import type { GameId, SessionMetrics, TrialResult } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function iqr(xs: number[]): number | null {
  if (xs.length < 4) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = p * (s.length - 1);
    const lo = Math.floor(idx);
    const frac = idx - lo;
    return s[lo]! + (s[Math.min(lo + 1, s.length - 1)]! - s[lo]!) * frac;
  };
  return q(0.75) - q(0.25);
}

function rts(trials: TrialResult[]): number[] {
  return trials
    .filter((t) => !t.false_start && !t.interrupted && t.response_ms !== null && t.correct)
    .map((t) => t.response_ms! - t.onset_ms);
}

function scoreable(trials: TrialResult[]): TrialResult[] {
  return trials.filter((t) => !t.false_start && !t.interrupted);
}

export function computeMetrics(gameId: GameId, trials: TrialResult[]): SessionMetrics {
  const sc = scoreable(trials);
  const rt = rts(trials);
  const falseStarts = trials.filter((t) => t.false_start).length;
  const accuracy = sc.length ? sc.filter((t) => t.correct).length / sc.length : 0;
  const med = median(rt);
  const base: Omit<SessionMetrics, "performance_index"> = {
    accuracy,
    median_rt_ms: med,
    rt_iqr_ms: iqr(rt),
    false_start_rate: trials.length ? falseStarts / trials.length : 0,
    scoreable_trials: sc.length,
  };
  return { ...base, performance_index: performanceIndex(gameId, trials, base) };
}

export function performanceIndex(
  gameId: GameId,
  trials: TrialResult[],
  m: Omit<SessionMetrics, "performance_index">,
): number {
  const med = m.median_rt_ms;
  switch (gameId) {
    case "flash_point": {
      // 0.7·speed + 0.3·(1 − false_start_rate); speed = clamp((450 − medRT)/250)
      const speed = med === null ? 0 : clamp((450 - med) / 250, 0, 1);
      return clamp(0.7 * speed + 0.3 * (1 - m.false_start_rate), 0, 1);
    }
    case "reflex_drop": {
      // 0.5·speed + 0.35·accuracy + 0.15·(1 − false_start_rate).
      // speed anchors to six-choice RT (700 ms → 0, 400 ms → 1), not the simple-RT
      // scale Flash Point uses — picking a rod costs a Hick's-law step.
      const speed = med === null ? 0 : clamp((700 - med) / 300, 0, 1);
      return clamp(0.5 * speed + 0.35 * m.accuracy + 0.15 * (1 - m.false_start_rate), 0, 1);
    }
    case "vector": {
      // 0.55·acc + 0.35·speed + 0.10·reverse_accuracy; speed = clamp((900 − medRT)/500)
      const speed = med === null ? 0 : clamp((900 - med) / 500, 0, 1);
      const rev = scoreable(trials).filter((t) => (t.payload as { reverse?: boolean }).reverse);
      const revAcc = rev.length ? rev.filter((t) => t.correct).length / rev.length : 0;
      return clamp(0.55 * m.accuracy + 0.35 * speed + 0.1 * revAcc, 0, 1);
    }
    case "stackwise": {
      // balanced accuracy over responded presentations (is_match != null)
      const resp = scoreable(trials).filter(
        (t) => (t.payload as { is_match?: boolean | null }).is_match !== null &&
               (t.payload as { is_match?: boolean | null }).is_match !== undefined,
      );
      const matches = resp.filter((t) => (t.payload as { is_match: boolean }).is_match);
      const nonMatches = resp.filter((t) => !(t.payload as { is_match: boolean }).is_match);
      const hitRate = matches.length ? matches.filter((t) => t.correct).length / matches.length : 0;
      const crRate = nonMatches.length
        ? nonMatches.filter((t) => t.correct).length / nonMatches.length
        : 0;
      return clamp((hitRate + crRate) / 2, 0, 1);
    }
    case "drift_watch": {
      // mean(n_correct / n_targets) across rounds
      const rounds = scoreable(trials);
      if (!rounds.length) return 0;
      const fr = rounds.map((t) => {
        const p = t.payload as { n_correct: number; target_ids: number[] };
        return p.target_ids.length ? p.n_correct / p.target_ids.length : 0;
      });
      return clamp(fr.reduce((a, b) => a + b, 0) / fr.length, 0, 1);
    }
    case "wide_angle": {
      const sc = scoreable(trials);
      if (!sc.length) return 0;
      const cAcc = sc.filter((t) => (t.payload as { center_ok: boolean }).center_ok).length / sc.length;
      const bAcc = sc.filter((t) => (t.payload as { bearing_ok: boolean }).bearing_ok).length / sc.length;
      return clamp(0.5 * cAcc + 0.5 * bAcc, 0, 1);
    }
    case "echo_grid": {
      // mean Jaccard |chosen ∩ cells| / |chosen ∪ cells|
      const sc = scoreable(trials);
      if (!sc.length) return 0;
      const js = sc.map((t) => {
        const p = t.payload as { chosen: number[]; n_cells: number; n_correct: number; n_extra: number };
        const inter = p.n_correct;
        const union = p.n_cells + p.chosen.length - inter;
        return union ? inter / union : 0;
      });
      return clamp(js.reduce((a, b) => a + b, 0) / js.length, 0, 1);
    }
  }
}

/** Display score per session — PRD §9. */
export function displayScore(performance_index: number, difficulty: number): number {
  return Math.round(1000 * performance_index * (0.5 + difficulty / 200));
}
