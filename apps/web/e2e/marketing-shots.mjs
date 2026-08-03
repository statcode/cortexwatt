/** Marketing capture — grabs real gameplay frames off the live Focus Mode canvas
 * for all six games, for use on the cortexwatt-lp landing page.
 *
 * Plays each game for real (dev-login → pre-game sheet → Play), then samples the
 * canvas during play and keeps the most visually "loaded" frames as candidates.
 * Captures canvas pixels only (no HUD chrome), at devicePixelRatio 2.
 *
 * Run: WEB_URL=http://localhost:3000 node e2e/marketing-shots.mjs
 *   (the CortexWatt app, plus api on :8000 — note :3100 is the landing page)
 * Limit to specific games with ONLY=reflex_drop,vector
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const WEB = process.env.WEB_URL ?? "http://localhost:3100";
const OUT = process.env.SHOT_OUT ?? "/private/tmp/claude-501/cw-shots";
const HANDLE = `shots_${Date.now().toString(36)}`;
const PER_GAME = 6; // candidate frames kept per game
const PLAY_MS = 10000; // watch window per pass (two passes: score, then grab)

const GAMES = [
  { id: "flash_point", domain: "processing_speed" },
  { id: "reflex_drop", domain: "processing_speed" },
  { id: "vector", domain: "decision_control" },
  { id: "stackwise", domain: "working_memory" },
  { id: "drift_watch", domain: "attention" },
  { id: "wide_angle", domain: "visual" },
  { id: "echo_grid", domain: "memory" },
].filter((g) => !process.env.ONLY || process.env.ONLY.split(",").includes(g.id));

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1000, height: 680 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.log("  page error:", e.message));

// ── dev login ──
await page.goto(`${WEB}/login`);
await page.fill('input[placeholder="e.g. quickneuron"]', HANDLE);
await page.click("text=Start training");
await page.waitForURL("**/train", { timeout: 20000 });
console.log("✓ logged in as", HANDLE);

/** Sample the focus canvas during play; return the top-N most loaded frames.
 * "Loaded" = fraction of pixels that differ from the Focus bg (#0E1513),
 * scored to prefer real stimulus frames over blank/fixation-only frames and
 * over full-screen feedback flashes. */
async function captureFrames(ms, want) {
  return page.evaluate(
    async ([ms, want]) => {
      const canvas = document.querySelector("canvas[data-focus-canvas]");
      if (!canvas) return { error: "no canvas" };
      const BG = [14, 21, 19];

      // Score on a cheap downscaled copy: one drawImage + one getImageData per
      // frame, so we can sample every rAF and still catch brief stimuli.
      const small = document.createElement("canvas");
      small.width = 160;
      small.height = 108;
      const sg = small.getContext("2d", { willReadFrequently: true });

      // Every game's *stimulus* is a saturated domain-hue mark (lime disc, violet
      // tile, rose cells, amber orbs…), while its idle/answer phases are grey
      // structure on the Focus bg. So score on saturated-hue coverage, not on
      // brightness — that's what separates "mid-trial" from "waiting".
      const score = () => {
        if (!canvas.width || !canvas.height) return 0;
        sg.drawImage(canvas, 0, 0, small.width, small.height);
        const d = sg.getImageData(0, 0, small.width, small.height).data;
        const total = small.width * small.height;
        let hue = 0;
        let lit = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g2 = d[i + 1];
          const b = d[i + 2];
          const max = Math.max(r, g2, b);
          const chroma = max - Math.min(r, g2, b);
          if (chroma > 40 && max > 70) hue++;
          if (
            Math.abs(r - BG[0]) + Math.abs(g2 - BG[1]) + Math.abs(b - BG[2]) > 36
          )
            lit++;
        }
        const h = hue / total;
        if (h === 0) return 0;
        // penalise a near-total flood (false-start feedback fills the screen)
        const flood = lit / total;
        const damp = flood > 0.7 ? Math.max(0.05, 1 - (flood - 0.7) * 3) : 1;
        return h * damp;
      };

      // Single ratcheting pass: score every frame and keep the top `want`.
      // Snapshotting copies pixels to an offscreen canvas (a fast GPU blit) —
      // PNG encoding happens after play, so we never stall the timed game loop.
      const best = []; // sorted desc by score
      let sampled = 0;
      let peak = 0;
      const started = performance.now();

      const snap = (s, t) => {
        const c = document.createElement("canvas");
        c.width = canvas.width;
        c.height = canvas.height;
        c.getContext("2d").drawImage(canvas, 0, 0);
        best.push({ s, t, c });
        best.sort((a, b) => b.s - a.s);
        if (best.length > want) best.length = want;
      };

      await new Promise((resolve) => {
        const tick = () => {
          if (!document.body.contains(canvas) || performance.now() - started > ms) {
            resolve();
            return;
          }
          let s = 0;
          try {
            s = score();
          } catch {
            requestAnimationFrame(tick);
            return;
          }
          sampled++;
          if (s > peak) peak = s;
          const t = Math.round(performance.now() - started);
          if (s > 0) {
            // don't hoard near-identical frames from one long-held stimulus
            const near = best.find((b) => Math.abs(b.t - t) < 220);
            if (near) {
              if (s > near.s) {
                best.splice(best.indexOf(near), 1);
                snap(s, t);
              }
            } else if (best.length < want || s > best[best.length - 1].s) {
              snap(s, t);
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      return {
        frames: best.map((b) => ({ s: b.s, t: b.t, data: b.c.toDataURL("image/png") })),
        peak,
        sampled,
        size: [canvas.width, canvas.height],
        alive: document.body.contains(canvas),
      };
    },
    [ms, want],
  );
}

for (const game of GAMES) {
  console.log(`\n── ${game.id}`);
  await page.goto(`${WEB}/train/${game.id}`);
  try {
    await page.waitForSelector("text=How scoring works", { timeout: 20000 });
  } catch {
    console.log("  ! pre-game sheet never rendered — skipping");
    continue;
  }

  await page.click('button:has-text("Play")');
  try {
    await page.waitForSelector("canvas[data-focus-canvas]", { timeout: 15000 });
  } catch {
    console.log("  ! focus canvas never appeared — skipping");
    continue;
  }
  await page.waitForTimeout(3600); // let the 3-2-1 countdown clear

  const res = await captureFrames(PLAY_MS, PER_GAME);
  if (res.error) {
    console.log("  !", res.error);
    continue;
  }
  console.log(
    `  canvas ${res.size[0]}x${res.size[1]}, ${res.sampled} frames sampled, ` +
      `peak=${res.peak.toFixed(3)}, ${res.frames.length} candidates`,
  );
  res.frames.forEach((f, i) => {
    const file = `${OUT}/${game.id}-${i}.png`;
    writeFileSync(file, Buffer.from(f.data.split(",")[1], "base64"));
    console.log(`  ${file}  score=${f.s.toFixed(3)} t=${f.t}ms`);
  });

  // leave the session without submitting
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Exit session",
    );
    btn?.click();
  });
  await page.waitForTimeout(500);
}

await browser.close();
console.log(`\ndone — candidates in ${OUT}`);
