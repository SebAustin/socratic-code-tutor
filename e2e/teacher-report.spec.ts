import { expect, test } from "@playwright/test";
import { STORAGE_KEY } from "../src/lib/constants";

test("teacher report aggregates seeded sessions and exports JSON", async ({ page }) => {
  const sessions = ["a", "b", "c"].map((id, index) => ({
    id, createdAt: 1 + index, title: `Session ${id}`, lang: "python", code: "print(1)", runs: [], latestTrace: null,
    chat: [{ role: "student", content: "Why?" }], currentRung: 1,
    tags: [{ category: index < 2 ? "off_by_one" : "mutation_vs_copy", confidence: .9, evidenceTurn: 1 }],
  }));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: JSON.stringify(sessions) });
  await page.goto("/teacher");
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByText("Off-by-one").first()).toBeVisible();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await download).suggestedFilename()).toBe("socratic-report.json");
});
