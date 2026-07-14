import { expect, test } from "@playwright/test";
import { mockTutorApis } from "./helpers";
import { STORAGE_KEY } from "../src/lib/constants";

test("@runtime real Pyodide produces the expected error and trace", async ({ page }) => {
  test.setTimeout(45_000);
  await mockTutorApis(page);
  await page.goto("/");
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: /Try a broken sample/ }).click();
  const runStarted = Date.now();
  await page.getByRole("button", { name: /^Run/ }).click();
  await expect(page.getByText("IndexError", { exact: true })).toBeVisible({ timeout: 20_000 });
  const visibleResultMs = Date.now() - runStarted;
  const pythonDurationMs = await page.evaluate((key) => {
    const sessions = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{ runs: Array<{ durationMs: number }> }>;
    return sessions[0]?.runs.at(-1)?.durationMs ?? -1;
  }, STORAGE_KEY);
  console.log(`[runtime-smoke] visible result ${visibleResultMs}ms; Python run+trace ${pythonDurationMs}ms`);
  await expect(page.getByText("line 4", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /Trace/ }).click();
  const timeline = page.getByLabel("Execution timeline");
  await expect(timeline).toBeVisible();
  expect(Number(await timeline.getAttribute("max"))).toBeGreaterThan(0);
});
