/** Drift Watch physics — PRD §12: motion_seed physics reproduce identical
 * final orb positions across two runs. */

import { describe, expect, it } from "vitest";
import { initOrbs, stepOrbs } from "../src";

describe("drift watch determinism", () => {
  it("two runs from the same motion_seed are byte-identical", () => {
    const run = () => {
      const orbs = initOrbs(123456789, 10, 130 / 600);
      for (let i = 0; i < 960; i++) stepOrbs(orbs); // 8 s at 120 Hz
      return JSON.stringify(orbs);
    };
    expect(run()).toBe(run());
  });

  it("different seeds diverge", () => {
    const a = initOrbs(1, 8, 0.2);
    const b = initOrbs(2, 8, 0.2);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("orbs stay in bounds under long simulation", () => {
    const orbs = initOrbs(42, 12, 190 / 600);
    for (let i = 0; i < 5000; i++) stepOrbs(orbs);
    for (const o of orbs) {
      expect(o.x).toBeGreaterThan(0);
      expect(o.x).toBeLessThan(1);
      expect(o.y).toBeGreaterThan(0);
      expect(o.y).toBeLessThan(1);
    }
  });
});
