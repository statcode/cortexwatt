/** E2E — PRD §12: dev-login → play Flash Point in a real browser → results.
 * Drives the game honestly: polls the canvas for the Signal Lime disc and
 * presses Space ~120 ms later, like a (very consistent) human.
 *
 * Run: node e2e/flash-point.mjs   (requires web on :3000 and api on :8000)
 */

import { chromium } from "playwright";

const LIME = { r: 201, g: 242, b: 78 };
const HANDLE = `e2e_${Date.now().toString(36)}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
  return browser.close().then(() => process.exit(1));
}

// 1) Login
await page.goto("http://localhost:3000/login");
await page.fill('input[placeholder="e.g. quickneuron"]', HANDLE);
await page.click("text=Start training");
await page.waitForURL("**/train", { timeout: 15000 });
console.log("✓ logged in as", HANDLE);

// 2) Open Flash Point pre-game sheet and start
await page.goto("http://localhost:3000/train/flash_point");
await page.waitForSelector("text=How scoring works", { timeout: 15000 });
console.log("✓ pre-game sheet rendered");
await page.click('button:has-text("Play")');

// 3) Countdown, then play: poll canvas center for the lime disc
await page.waitForSelector("canvas[data-focus-canvas]", { timeout: 10000 });
console.log("✓ Focus Mode entered — playing 20 trials…");

const played = await page.evaluate(
  ([lime]) =>
    new Promise((resolve) => {
      const canvas = document.querySelector("canvas[data-focus-canvas]");
      const c = canvas.getContext("2d", { willReadFrequently: true });
      let presses = 0;
      let stimulusUp = false;
      const started = performance.now();
      const timer = setInterval(() => {
        if (!document.body.contains(canvas)) {
          clearInterval(timer);
          resolve({ presses, done: true });
          return;
        }
        if (performance.now() - started > 120000) {
          clearInterval(timer);
          resolve({ presses, done: false });
          return;
        }
        const px = c.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
        ).data;
        const isLime =
          Math.abs(px[0] - lime.r) < 12 &&
          Math.abs(px[1] - lime.g) < 12 &&
          Math.abs(px[2] - lime.b) < 12;
        if (isLime && !stimulusUp) {
          stimulusUp = true;
          setTimeout(() => {
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: " ", bubbles: true }),
            );
            presses++;
          }, 110 + Math.random() * 90);
        } else if (!isLime && stimulusUp) {
          stimulusUp = false;
        }
      }, 25);
    }),
  [LIME],
);
console.log(`✓ played: ${played.presses} responses, focus closed: ${played.done}`);

// 4) Results screen
try {
  await page.waitForSelector("text=Session score", { timeout: 20000 });
} catch {
  await page.screenshot({ path: "e2e/failure.png" });
  await fail("results screen did not appear (screenshot: e2e/failure.png)");
}
const score = await page.textContent("p.display.num");
console.log("✓ results screen — session score:", score?.trim());

// 5) Trial data view (server truth)
await page.click("text=See every trial");
await page.waitForSelector("text=Reaction time per trial", { timeout: 10000 });
console.log("✓ trial data view rendered from server data");

// 6) Leaderboard shows the user
await page.goto("http://localhost:3000/leaderboard");
await page.click("text=Flash Point");
await page.waitForSelector(`text=${HANDLE}`, { timeout: 10000 });
console.log("✓ user appears on the weekly Flash Point leaderboard");

await page.screenshot({ path: "e2e/results.png", fullPage: true });
await browser.close();
console.log("\nE2E PASS — screenshot: e2e/results.png");
