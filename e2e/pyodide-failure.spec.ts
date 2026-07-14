import { expect, test } from "@playwright/test";

test("runtime load failure surfaces a retry action", async ({ page }) => {
  await page.addInitScript(() => {
    class FailedWorker extends EventTarget {
      constructor() { super(); setTimeout(() => this.dispatchEvent(new MessageEvent("message", { data: { type: "fatal", stage: "load", message: "Python could not load from the CDN." } })), 10); }
      postMessage() {}
      terminate() {}
    }
    Object.defineProperty(window, "Worker", { configurable: true, value: FailedWorker });
  });
  await page.goto("/");
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: /Try a broken sample/ }).click();
  await page.getByRole("button", { name: /^Run/ }).click();
  await expect(page.getByRole("button", { name: "Retry Python load" })).toBeVisible();
});
