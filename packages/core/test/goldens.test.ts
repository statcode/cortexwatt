/** Cross-check — PRD §12: core interprets each committed golden spec without
 * error (bot plays it; metrics compute; trial counts match). */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { botPlay, computeMetrics, type GameId, type GameSpec } from "../src";

const GOLDENS = join(__dirname, "../../../apps/api/tests/goldens");

function expectedTrialCount(spec: GameSpec): number {
  if (spec.game === "stackwise") return spec.presentations.length - spec.n;
  if (spec.game === "drift_watch") return spec.rounds.length;
  return spec.trials.length;
}

describe("golden specs interpret cleanly in core", () => {
  const files = readdirSync(GOLDENS).filter((f) => f.endsWith(".json"));
  it("has all 18 goldens", () => expect(files.length).toBe(18));

  for (const file of files) {
    it(file, () => {
      const spec = JSON.parse(readFileSync(join(GOLDENS, file), "utf8")) as GameSpec;
      const trials = botPlay(spec, { rt_median_ms: 300, rt_sigma: 0.2, accuracy: 0.85 });
      expect(trials.length).toBe(expectedTrialCount(spec));
      const m = computeMetrics(spec.game as GameId, trials);
      expect(m.performance_index).toBeGreaterThanOrEqual(0);
      expect(m.performance_index).toBeLessThanOrEqual(1);
    });
  }
});
