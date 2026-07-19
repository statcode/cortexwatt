import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto("http://localhost:3000/login");
await page.fill('input[placeholder="e.g. quickneuron"]', "e2e_tour");
await page.click("text=Start training");
await page.waitForURL("**/train");
await page.evaluate(() => localStorage.setItem("cw_prefs", '{"speedometer":true}'));

await page.goto("http://localhost:3000/train/flash_point");
await page.waitForSelector("text=How scoring works");
await page.click('button:has-text("Play")');
await page.waitForSelector("canvas[data-focus-canvas]");

// wait for the first stimulus, then screenshot MID-SWEEP (before responding)
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const canvas = document.querySelector("canvas[data-focus-canvas]");
      const c = canvas.getContext("2d", { willReadFrequently: true });
      const timer = setInterval(() => {
        const px = c.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data;
        if (Math.abs(px[0]-201)<12 && Math.abs(px[1]-242)<12 && Math.abs(px[2]-78)<12) {
          clearInterval(timer);
          setTimeout(resolve, 400); // 400 ms into the sweep, stimulus still up
        }
      }, 20);
    }),
);
await page.screenshot({ path: "e2e/shot-speedo-live.png" });
const liveText = await page.evaluate(() => document.querySelector(".num span")?.textContent);

// now respond and screenshot the FROZEN state
await page.evaluate(() =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })),
);
await page.waitForTimeout(250);
await page.screenshot({ path: "e2e/shot-speedo-frozen.png" });
const frozenText = await page.evaluate(() => document.querySelector(".num span")?.textContent);
console.log("mid-sweep readout:", liveText, "ms · frozen readout:", frozenText, "ms");
await browser.close();
