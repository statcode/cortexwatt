/** Headless bot player — PRD §12. Plays any spec with a configurable simulated
 * RT distribution (lognormal) and error rate. Used to test staircase
 * convergence and every server validation gate. */

import type { GameSpec, TrialResult } from "./types";
import { mulberry32, shuffle } from "./prng";
import { stackwiseN } from "./practice";

export interface BotAbility {
  /** Median RT in ms (lognormal median = exp(mu)). */
  rt_median_ms: number;
  /** Lognormal sigma (0.15–0.35 realistic). */
  rt_sigma: number;
  /** Probability of a correct response on accuracy-driven decisions. */
  accuracy: number;
  /** Probability a foreperiod trial ends in a false start. */
  false_start_rate?: number;
}

export function botPlay(spec: GameSpec, ability: BotAbility, seed = 42): TrialResult[] {
  const rng = mulberry32(seed);
  const gauss = () => {
    // Box-Muller
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  const sampleRT = () => Math.exp(Math.log(ability.rt_median_ms) + ability.rt_sigma * gauss());
  const fsRate = ability.false_start_rate ?? 0.02;
  let clock = 1000; // synthetic performance.now() timeline

  const mk = (
    i: number,
    over: Partial<TrialResult> & { payload?: Record<string, unknown> },
  ): TrialResult => ({
    trial_index: i,
    onset_ms: 0,
    response_ms: null,
    correct: false,
    false_start: false,
    interrupted: false,
    payload: {},
    ...over,
  });

  const out: TrialResult[] = [];

  switch (spec.game) {
    case "flash_point": {
      spec.trials.forEach((t, i) => {
        clock += t.foreperiod_ms + 400;
        const onset = clock;
        if (rng() < fsRate) {
          out.push(mk(i, { onset_ms: onset, response_ms: onset - 50 - rng() * 200, false_start: true }));
          return;
        }
        const rt = sampleRT();
        const hit = rt <= spec.response_window_ms;
        out.push(mk(i, { onset_ms: onset, response_ms: hit ? onset + rt : null, correct: hit }));
        clock = onset + Math.min(rt, spec.response_window_ms);
      });
      break;
    }
    case "reflex_drop": {
      spec.trials.forEach((t, i) => {
        clock += t.foreperiod_ms + 400;
        const onset = clock;
        const payload = { rod: t.rod, responded_rod: null as number | null };
        if (rng() < fsRate) {
          out.push(
            mk(i, {
              onset_ms: onset,
              response_ms: onset - 50 - rng() * 200,
              false_start: true,
              payload,
            }),
          );
          return;
        }
        const rt = sampleRT() * 1.5; // six-choice RT costs a Hick's-law step
        if (rt > spec.catch_window_ms) {
          out.push(mk(i, { onset_ms: onset, payload })); // rod cleared the line
          clock = onset + spec.catch_window_ms;
          return;
        }
        const responded =
          rng() < ability.accuracy
            ? t.rod
            : (t.rod + 1 + Math.floor(rng() * (spec.rod_count - 1))) % spec.rod_count;
        out.push(
          mk(i, {
            onset_ms: onset,
            response_ms: onset + rt,
            correct: responded === t.rod,
            payload: { rod: t.rod, responded_rod: responded },
          }),
        );
        clock = onset + rt;
      });
      break;
    }
    case "vector": {
      spec.trials.forEach((t, i) => {
        clock += t.foreperiod_ms + 800;
        const onset = clock;
        const rt = sampleRT() * 1.6; // choice RT is slower
        if (rt > spec.response_window_ms) {
          out.push(mk(i, { onset_ms: onset, payload: { sector: t.sector, reverse: t.reverse, responded_sector: null } }));
          return;
        }
        const target = t.reverse ? (t.sector + 3) % 6 : t.sector;
        const acc = t.reverse ? ability.accuracy * 0.85 : ability.accuracy;
        const responded = rng() < acc ? target : (target + 1 + Math.floor(rng() * 5)) % 6;
        out.push(
          mk(i, {
            onset_ms: onset,
            response_ms: onset + rt,
            correct: responded === target,
            payload: { sector: t.sector, reverse: t.reverse, responded_sector: responded },
          }),
        );
        clock = onset + rt;
      });
      break;
    }
    case "stackwise": {
      const n = spec.n ?? stackwiseN(50);
      spec.presentations.forEach((p, i) => {
        clock += 500 + spec.isi_ms;
        if (i < n) return;
        const isMatch = p.cell === spec.presentations[i - n]!.cell;
        const onset = clock;
        const responded = rng() < ability.accuracy ? isMatch : !isMatch;
        out.push(
          mk(i, {
            onset_ms: onset,
            response_ms: onset + sampleRT() * 1.8,
            correct: responded === isMatch,
            payload: { is_match: isMatch, responded_match: responded },
          }),
        );
      });
      break;
    }
    case "drift_watch": {
      spec.rounds.forEach((r, i) => {
        clock += 1500 + spec.duration_ms;
        const onset = clock;
        const ids = Array.from({ length: r.orb_count }, (_, k) => k);
        const nonTargets = ids.filter((id) => !r.target_ids.includes(id));
        const selected: number[] = [];
        for (const t of r.target_ids) {
          selected.push(rng() < ability.accuracy ? t : nonTargets[Math.floor(rng() * nonTargets.length)]!);
        }
        const uniq = [...new Set(selected)].sort((a, b) => a - b);
        const nCorrect = uniq.filter((id) => r.target_ids.includes(id)).length;
        clock = onset + 2500 + rng() * 2000;
        out.push(
          mk(i, {
            onset_ms: onset,
            response_ms: clock,
            correct: nCorrect === r.target_ids.length && uniq.length === r.target_ids.length,
            payload: { selected_ids: uniq, target_ids: r.target_ids, n_correct: nCorrect },
          }),
        );
      });
      break;
    }
    case "wide_angle": {
      spec.trials.forEach((t, i) => {
        clock += t.foreperiod_ms + t.flash_ms + 1500;
        const onset = clock;
        const centerOk = rng() < ability.accuracy;
        const bearingOk = rng() < ability.accuracy;
        const chosenArc = bearingOk
          ? (t.bearing_arc + (rng() < 0.5 ? 0 : rng() < 0.5 ? 1 : 11)) % 12
          : (t.bearing_arc + 3 + Math.floor(rng() * 7)) % 12;
        clock = onset + 1200 + rng() * 1500;
        out.push(
          mk(i, {
            onset_ms: onset,
            response_ms: clock,
            correct: centerOk && bearingOk,
            payload: { center_ok: centerOk, bearing_ok: bearingOk, chosen_arc: chosenArc },
          }),
        );
      });
      break;
    }
    case "echo_grid": {
      spec.trials.forEach((t, i) => {
        clock += t.expose_ms + t.delay_ms + 500;
        const onset = clock;
        const all = Array.from({ length: t.grid * t.grid }, (_, k) => k);
        const wrongPool = shuffle(rng, all.filter((c) => !t.cells.includes(c)));
        const chosen: number[] = [];
        let wrongIdx = 0;
        for (const cell of t.cells) {
          if (rng() < ability.accuracy) chosen.push(cell);
          else if (wrongIdx < wrongPool.length) chosen.push(wrongPool[wrongIdx++]!);
        }
        const uniq = [...new Set(chosen)].sort((a, b) => a - b);
        const nCorrect = uniq.filter((c) => t.cells.includes(c)).length;
        clock = onset + 2500 + rng() * 3000;
        out.push(
          mk(i, {
            onset_ms: onset,
            response_ms: clock,
            correct: nCorrect === t.cells.length && uniq.length === t.cells.length,
            payload: {
              chosen: uniq,
              n_correct: nCorrect,
              n_extra: uniq.length - nCorrect,
              n_cells: t.cells.length,
            },
          }),
        );
      });
      break;
    }
  }
  return out;
}
