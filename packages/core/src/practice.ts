/** Client-side spec generation — PRACTICE MODE ONLY (PRD §3).
 * Rated specs always come from the server. This mirrors the server's
 * difficulty→parameter mapping (§6) so practice feels like the real thing. */

import type { GameId, GameSpec } from "./types";
import { mulberry32, randInt, sampleForeperiod, shuffle } from "./prng";

export function stackwiseN(d: number): number {
  if (d >= 85) return 4;
  if (d >= 55) return 3;
  if (d >= 25) return 2;
  return 1;
}

export interface PracticeOptions {
  /** Cap trial/round count (guided practice uses 3). */
  trialCap?: number;
  seed?: number;
}

export function generatePracticeSpec(
  gameId: GameId,
  difficulty: number,
  opts: PracticeOptions = {},
): GameSpec {
  const d = Math.max(0, Math.min(100, difficulty));
  const rng = mulberry32(opts.seed ?? ((Math.random() * 2 ** 32) >>> 0));
  const cap = (n: number) => (opts.trialCap ? Math.min(opts.trialCap, n) : n);

  switch (gameId) {
    case "flash_point":
      return {
        game: "flash_point",
        trials: Array.from({ length: cap(20) }, () => ({ foreperiod_ms: sampleForeperiod(rng) })),
        response_window_ms: Math.round(900 - 3 * d),
      };

    case "reflex_drop": {
      const rodCount = 6;
      const trials: { rod: number; foreperiod_ms: number }[] = [];
      let prev = -1;
      for (let i = 0; i < cap(24); i++) {
        let rod = randInt(rng, 0, rodCount - 1);
        while (rod === prev) rod = randInt(rng, 0, rodCount - 1); // no immediate repeats
        trials.push({ rod, foreperiod_ms: sampleForeperiod(rng) });
        prev = rod;
      }
      return {
        game: "reflex_drop",
        rod_count: rodCount,
        trials,
        catch_window_ms: Math.round(900 - 4 * d),
      };
    }

    case "vector": {
      const n = cap(24);
      const reverseCount = Math.round((n * (10 + 0.2 * d)) / 100);
      const flags = shuffle(rng, [
        ...Array.from({ length: reverseCount }, () => true),
        ...Array.from({ length: n - reverseCount }, () => false),
      ]);
      return {
        game: "vector",
        trials: flags.map((reverse) => ({
          sector: randInt(rng, 0, 5),
          reverse,
          foreperiod_ms: sampleForeperiod(rng),
        })),
        response_window_ms: Math.round(1500 - 8 * d),
      };
    }

    case "stackwise": {
      const nBack = stackwiseN(d);
      const total = opts.trialCap ? opts.trialCap + nBack : 20 + 2 * nBack;
      const cells: number[] = [];
      let consecutiveMatches = 0;
      for (let i = 0; i < total; i++) {
        if (i < nBack) {
          cells.push(randInt(rng, 0, 8));
          continue;
        }
        const wantMatch = rng() < 0.3 && consecutiveMatches < 2;
        if (wantMatch) {
          cells.push(cells[i - nBack]!);
          consecutiveMatches++;
        } else {
          let cell = randInt(rng, 0, 8);
          while (cell === cells[i - nBack]) cell = randInt(rng, 0, 8);
          cells.push(cell);
          consecutiveMatches = 0;
        }
      }
      return {
        game: "stackwise",
        n: nBack,
        presentations: cells.map((cell) => ({ cell })),
        isi_ms: Math.round(2300 - 6 * d),
      };
    }

    case "drift_watch": {
      const orbCount = 8 + Math.floor(d / 25);
      const nTargets = d >= 70 ? 4 : 3;
      return {
        game: "drift_watch",
        rounds: Array.from({ length: cap(6) }, () => ({
          orb_count: orbCount,
          target_ids: shuffle(rng, Array.from({ length: orbCount }, (_, i) => i)).slice(0, nTargets).sort((a, b) => a - b),
          motion_seed: randInt(rng, 1, 2 ** 31 - 1),
        })),
        drift_speed: Math.round(70 + 1.2 * d),
        duration_ms: 8000,
      };
    }

    case "wide_angle":
      return {
        game: "wide_angle",
        trials: Array.from({ length: cap(16) }, () => ({
          center_symbol: (randInt(rng, 0, 1) as 0 | 1),
          bearing_arc: randInt(rng, 0, 11),
          eccentricity_pct: Math.round(15 + 0.3 * d),
          distractors: Math.floor(d / 8),
          flash_ms: Math.round(300 - 1.8 * d),
          foreperiod_ms: sampleForeperiod(rng),
        })),
      };

    case "echo_grid": {
      const grid = 4 + Math.floor(d / 40);
      const nCells = 3 + Math.floor(d / 16);
      return {
        game: "echo_grid",
        trials: Array.from({ length: cap(8) }, () => ({
          grid,
          cells: shuffle(rng, Array.from({ length: grid * grid }, (_, i) => i)).slice(0, nCells).sort((a, b) => a - b),
          expose_ms: Math.round(1500 - 6 * d),
          delay_ms: Math.round(1000 + 20 * d),
        })),
      };
    }
  }
}
