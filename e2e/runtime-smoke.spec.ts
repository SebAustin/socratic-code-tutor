import { expect, test } from "@playwright/test";
import { mockTutorApis } from "./helpers";
import { STORAGE_KEY } from "../src/lib/constants";

type StoredTrace = Array<{ step: number; line: number; event: string; locals: Record<string, string> }>;

async function latestTrace(page: import("@playwright/test").Page): Promise<StoredTrace> {
  return page.evaluate((key) => {
    const sessions = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{ latestTrace: StoredTrace }>;
    return sessions[0]?.latestTrace ?? [];
  }, STORAGE_KEY);
}

test("@runtime real Pyodide verifies trace fidelity for two samples", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The default real-runtime gate runs in Chromium.");
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
  console.log(`[runtime-smoke] Pyodide init + first visible result ${visibleResultMs}ms; Python run+trace ${pythonDurationMs}ms`);
  await expect(page.getByText("line 4", { exact: true })).toBeVisible();
  const offByOneTrace = await latestTrace(page);
  const loopSnapshots = offByOneTrace.filter(({ line, event }) => line === 4 && event === "line");
  expect(loopSnapshots).toEqual(expect.arrayContaining([
    expect.objectContaining({ step: 6, locals: expect.objectContaining({ i: "0", s: "0" }) }),
    expect.objectContaining({ step: 8, locals: expect.objectContaining({ i: "1", s: "2" }) }),
    expect.objectContaining({ step: 10, locals: expect.objectContaining({ i: "2", s: "5" }) }),
  ]));
  await page.getByRole("tab", { name: /Trace/ }).click();
  const timeline = page.getByLabel("Execution timeline");
  await expect(timeline).toBeVisible();
  expect(Number(await timeline.getAttribute("max"))).toBeGreaterThan(0);

  await page.getByRole("button", { name: /Samples/ }).click();
  await page.getByRole("dialog", { name: "Sample library" })
    .getByRole("button", { name: /The vanishing sword/ })
    .click();
  await page.getByRole("button", { name: /^Run/ }).click();
  await expect(page.getByText(/Python reached the end of the program/)).toBeVisible();
  const mutationTrace = await latestTrace(page);
  const aliasSnapshot = mutationTrace.find(({ locals }) => locals.items && locals.result);
  expect(aliasSnapshot).toBeTruthy();
  const itemsId = aliasSnapshot?.locals.items.match(/<id:(\d+)>/)?.[1];
  const resultId = aliasSnapshot?.locals.result.match(/<id:(\d+)>/)?.[1];
  expect(itemsId).toBeTruthy();
  expect(resultId).toBe(itemsId);
});
