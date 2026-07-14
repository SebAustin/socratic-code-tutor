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
  const dialog = page.getByRole("dialog", { name: "Sample library" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close sample library" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: /Numbers wearing quotes/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /Samples/ })).toBeFocused();
});

test("transcript drawer closes with Escape and restores focus", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("socratic-code-tutor:sessions:v1", JSON.stringify([{
      id: "a11y-session", createdAt: 1, title: "Loop", lang: "python", code: "print(1)",
      runs: [], latestTrace: null, currentRung: 1, tags: [],
      chat: [{ id: "chat-1", role: "student", content: "Why?" }],
    }]));
  });
  await page.goto("/teacher");
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  const trigger = page.getByRole("button", { name: "View transcript" });
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Loop transcript" });
  await expect(dialog.getByRole("button", { name: /Close/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
