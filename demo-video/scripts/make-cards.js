#!/usr/bin/env node
/**
 * Renders the title/closing card HTML (assets/*-card.html) to 1920x1080 PNGs
 * via a headless Chromium screenshot. Re-run any time the card copy changes.
 */
const path = require("path");
const { chromium } = require("@playwright/test");

const ASSETS_DIR = path.resolve(__dirname, "..", "assets");
const CARDS = ["title-card", "closing-card"];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const name of CARDS) {
    const htmlPath = path.join(ASSETS_DIR, `${name}.html`);
    const pngPath = path.join(ASSETS_DIR, `${name}.png`);
    await page.goto(`file://${htmlPath}`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: pngPath });
    console.log(`saved ${pngPath}`);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
