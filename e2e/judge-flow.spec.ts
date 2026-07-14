import { expect, test } from "@playwright/test";
import { installMockRuntime, mockTutorApis } from "./helpers";

test("judge can complete the core loop under three minutes", async ({ page }) => {
  const started = Date.now();
  await installMockRuntime(page);
  await mockTutorApis(page);
  await page.goto("/");
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Debug it yourself");
  await page.getByRole("button", { name: /Try a broken sample/ }).click();
  await expect(page.getByLabel("Python code editor")).toBeVisible();
  await page.getByRole("button", { name: /^Run/ }).click();
  await expect(page.getByText("IndexError", { exact: true })).toBeVisible();
  await expect(page.getByRole("log")).toContainText("final loop iteration?");
  await page.getByRole("button", { name: "I'm stuck — hint" }).click();
  await expect(page.getByText("Hint 2 of 4")).toBeVisible();
  await page.getByRole("tab", { name: /Trace/ }).click();
  await expect(page.getByLabel("Execution timeline")).toBeVisible();
  expect(Date.now() - started).toBeLessThan(180_000);
});
