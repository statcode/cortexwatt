import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto("http://localhost:3000/login");
await page.fill('input[placeholder="e.g. quickneuron"]', "e2e_tour");
await page.click("text=Start training");
await page.waitForURL("**/train");
await page.goto("http://localhost:3000/train/flash_point");
await page.waitForSelector("text=How scoring works");
await page.click('button:has-text("Play")');
await page.waitForSelector("canvas[data-focus-canvas]");
await page.waitForTimeout(3800); // let the countdown finish
await page.screenshot({ path: "/Applications/MAMP/htdocs/cortexwatt/apps/web/e2e/shot-ingame.png" });
// exit works and returns to the sheet
await page.click('button[aria-label="Exit session"]');
await page.waitForSelector("text=How scoring works", { timeout: 5000 });
console.log("exit returns to pre-game sheet ✓");
await browser.close();
