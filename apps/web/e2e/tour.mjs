/** Screenshot tour of the main screens (uses the E2E user's history). */
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });

await page.goto("http://localhost:3000/login");
await page.fill('input[placeholder="e.g. quickneuron"]', "e2e_tour");
await page.click("text=Start training");
await page.waitForURL("**/train");
await page.waitForTimeout(800);
await page.screenshot({ path: "e2e/shot-hub.png" });

await page.goto("http://localhost:3000/train/vector");
await page.waitForSelector("text=How scoring works");
await page.waitForTimeout(900);
await page.screenshot({ path: "e2e/shot-pregame.png" });

await browser.close();
console.log("tour done");
