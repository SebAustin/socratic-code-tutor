import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing has no automatically detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("keyboard shortcut opens the sample library", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await expect(page.getByRole("dialog", { name: "Sample library" })).toBeVisible();
});
