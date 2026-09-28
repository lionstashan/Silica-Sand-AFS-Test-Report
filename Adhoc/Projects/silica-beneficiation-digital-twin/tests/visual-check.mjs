import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));

await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.screenshot({ path: "tests/desktop.png", fullPage: true });
const canvasImage = await page.locator("#plant-canvas").screenshot();

const desktop = await page.evaluate(() => {
  const canvas = document.querySelector("#plant-canvas");
  return { canvas: { width: canvas.width, height: canvas.height }, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
});
await page.locator("#scene-area").selectOption("wet");
await page.waitForTimeout(120);
const wetCanvasImage = await page.locator("#plant-canvas").screenshot();
await page.locator("#scene-area").selectOption("rotary");

await page.getByRole("button", { name: "Calculations" }).click();
const calculationCount = await page.locator("#calculation-list article").count();
await page.getByRole("button", { name: "Process builder" }).click();
await page.getByRole("button", { name: "Build sequence" }).click();
const sequenceCount = await page.locator("#process-sequence li").count();
await page.getByRole("button", { name: "Streams & sizing" }).click();
await page.getByRole("button", { name: "Recommend screens" }).click();
const plannedStages = await page.locator("#mesh-plan-result ol li").count();
await page.locator("#actual-afs").fill("34");
await page.locator("#target-afs").fill("44");
await page.getByRole("button", { name: "Suggest adjustments" }).click();
const calibrationHeading = await page.locator("#calibration-result > strong").textContent();
await page.screenshot({ path: "tests/streams.png", fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: "networkidle" });
await page.screenshot({ path: "tests/mobile.png", fullPage: true });
const mobile = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, canvasHeight: document.querySelector("#plant-canvas").getBoundingClientRect().height }));

console.log(JSON.stringify({ desktop: { ...desktop, rotaryCanvasBytes: canvasImage.length, wetCanvasBytes: wetCanvasImage.length }, mobile, calculationCount, sequenceCount, plannedStages, calibrationHeading, errors }, null, 2));
if (errors.length || canvasImage.length < 20000 || wetCanvasImage.length < 20000 || calculationCount !== 7 || sequenceCount < 5 || plannedStages !== 4 || calibrationHeading !== "Shift product finer" || desktop.scrollWidth > desktop.clientWidth || mobile.scrollWidth > mobile.clientWidth) process.exitCode = 1;
await browser.close();
