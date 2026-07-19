import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto("http://localhost:3000/login");
await page.fill('input[placeholder="e.g. quickneuron"]', "e2e_tour");
await page.click("text=Start training");
await page.waitForURL("**/train");

// enable the pref via the Preferences UI
await page.goto("http://localhost:3000/profile");
await page.waitForSelector("text=In-game speed readout");
await page.check('input[type="checkbox"]');
await page.screenshot({ path: "e2e/shot-prefs.png" });

// play flash point; respond to two stimuli, then screenshot the gauge
await page.goto("http://localhost:3000/train/flash_point");
await page.waitForSelector("text=How scoring works");
await page.click('button:has-text("Play")');
await page.waitForSelector("canvas[data-focus-canvas]");
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const canvas = document.querySelector("canvas[data-focus-canvas]");
      const c = canvas.getContext("2d", { willReadFrequently: true });
      let hits = 0, up = false;
      const timer = setInterval(() => {
        const px = c.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data;
        const lime = Math.abs(px[0]-201)<12 && Math.abs(px[1]-242)<12 && Math.abs(px[2]-78)<12;
        if (lime && !up) {
          up = true;
          setTimeout(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
            if (++hits >= 2) { clearInterval(timer); setTimeout(resolve, 300); }
          }, 140 + Math.random() * 80);
        } else if (!lime) up = false;
      }, 25);
    }),
);
await page.screenshot({ path: "e2e/shot-speedo.png" });
await browser.close();
console.log("speedometer check done");
