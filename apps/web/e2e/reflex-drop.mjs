/** E2E — dev-login → play Reflex Drop in a real browser → results.
 * Drives the game honestly: polls a scanline across the rack for the released
 * (Signal Lime) rod, works out which column it is, and presses that rod's key
 * ~170 ms later, like a (very consistent) human.
 *
 * Also writes canvas snapshots of the three states worth looking at — rack at
 * rest, rod in free fall, rod caught — to e2e/shots/.
 *
 * Run: node e2e/reflex-drop.mjs   (requires web on :3000 and api on :8000)
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const LIME = { r: 201, g: 242, b: 78 };
const HANDLE = `rd_${Date.now().toString(36)}`;
const SHOTS = "e2e/shots";

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.on("pageerror", (e) => console.log("  page error:", e.message));

async function fail(msg) {
  console.error("FAIL:", msg);
  await page.screenshot({ path: `${SHOTS}/failure.png` });
  await browser.close();
  process.exit(1);
}

// 1) Login
await page.goto("http://localhost:3000/login");
await page.fill('input[placeholder="e.g. quickneuron"]', HANDLE);
await page.click("text=Start training");
await page.waitForURL("**/train", { timeout: 20000 });
console.log("✓ logged in as", HANDLE);

// 2) Train hub must list the new game under Processing speed
await page.waitForSelector("text=Reflex Drop", { timeout: 15000 });
await page.screenshot({ path: `${SHOTS}/train-hub.png`, fullPage: true });
console.log("✓ Reflex Drop card on the Train hub");

// 3) Pre-game sheet
await page.goto("http://localhost:3000/train/reflex_drop");
await page.waitForSelector("text=How scoring works", { timeout: 20000 });
await page.click("text=How scoring works");
await page.waitForTimeout(1200); // let the demo loop reach the drop
await page.screenshot({ path: `${SHOTS}/pre-game.png`, fullPage: true });
console.log("✓ pre-game sheet + demo loop rendered");

await page.click('button:has-text("Play")');
await page.waitForSelector("canvas[data-focus-canvas]", { timeout: 15000 });
console.log("✓ Focus Mode entered — playing 24 trials…");

// 4) Play honestly, snapshotting the three states on the way through.
const played = await page.evaluate(
  ([lime]) =>
    new Promise((resolve) => {
      const canvas = document.querySelector("canvas[data-focus-canvas]");
      const c = canvas.getContext("2d", { willReadFrequently: true });
      const KEYS = ["s", "d", "f", "j", "k", "l"];
      const shots = {};
      let presses = 0;
      let correctKeys = 0;
      let rodUp = false;
      const started = performance.now();

      const snap = (name) => {
        if (shots[name]) return;
        const o = document.createElement("canvas");
        o.width = canvas.width;
        o.height = canvas.height;
        o.getContext("2d").drawImage(canvas, 0, 0);
        shots[name] = o.toDataURL("image/png");
      };

      // Rod centres — mirrors layout() in packages/core/src/games/reflexDrop.ts.
      // Recomputed per tick: FocusSession only sizes the canvas once the 3-2-1
      // countdown clears, so anything measured up front sees a 300x150 default.
      const nearest = (x) => {
        const span = 5 + 0.7;
        const pitch = (canvas.width * 0.8) / span;
        const x0 = canvas.width / 2 - (span * pitch) / 2;
        const centres = [0, 1, 2, 3, 4, 5].map((i) => x0 + (i + (i >= 3 ? 0.7 : 0)) * pitch);
        let best = 0;
        for (let i = 1; i < 6; i++) {
          if (Math.abs(x - centres[i]) < Math.abs(x - centres[best])) best = i;
        }
        return best;
      };

      const timer = setInterval(() => {
        if (!document.body.contains(canvas)) {
          clearInterval(timer);
          resolve({ presses, correctKeys, shots, done: true });
          return;
        }
        if (performance.now() - started > 180000) {
          clearInterval(timer);
          resolve({ presses, correctKeys, shots, done: false });
          return;
        }
        // Scanline through the middle of a rod at rest.
        const scanY = Math.floor(canvas.height * 0.31);
        const row = c.getImageData(0, scanY, canvas.width, 1).data;
        let sum = 0;
        let n = 0;
        for (let x = 0; x < canvas.width; x++) {
          const i = x * 4;
          if (
            Math.abs(row[i] - lime.r) < 24 &&
            Math.abs(row[i + 1] - lime.g) < 24 &&
            Math.abs(row[i + 2] - lime.b) < 24
          ) {
            sum += x;
            n++;
          }
        }
        if (n > 0 && !rodUp) {
          rodUp = true;
          const rod = nearest(sum / n);
          snap("falling");
          setTimeout(() => {
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: KEYS[rod], bubbles: true }),
            );
            presses++;
            correctKeys++;
            setTimeout(() => snap("caught"), 60);
          }, 150 + Math.random() * 60);
        } else if (n === 0 && rodUp) {
          rodUp = false;
          snap("rest");
        }
      }, 20);
    }),
  [LIME],
);

for (const [name, data] of Object.entries(played.shots)) {
  writeFileSync(`${SHOTS}/focus-${name}.png`, Buffer.from(data.split(",")[1], "base64"));
}
console.log(
  `✓ played: ${played.presses} responses, focus closed: ${played.done}, states captured: ${Object.keys(played.shots).join(", ")}`,
);

// 5) Results screen (server truth)
try {
  await page.waitForSelector("text=Session score", { timeout: 25000 });
} catch {
  await fail("results screen did not appear");
}
const score = await page.textContent("p.display.num");
console.log("✓ results screen — session score:", score?.trim());
await page.screenshot({ path: `${SHOTS}/results.png`, fullPage: true });

await page.click("text=See every trial");
await page.waitForSelector("text=Reaction time per trial", { timeout: 15000 });
console.log("✓ trial data view rendered from server data");
await page.screenshot({ path: `${SHOTS}/trial-data.png`, fullPage: true });

// 6) Weekly Reflex Drop leaderboard
await page.goto("http://localhost:3000/leaderboard");
await page.click("text=Reflex Drop");
await page.waitForSelector(`text=${HANDLE}`, { timeout: 15000 });
console.log("✓ user appears on the weekly Reflex Drop leaderboard");

await browser.close();
console.log(`\nE2E PASS — screenshots in apps/web/${SHOTS}/`);
