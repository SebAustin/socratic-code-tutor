#!/usr/bin/env node
/**
 * Records one .webm clip per beat with Playwright/Chromium against the live
 * production app (and the public GitHub repo). Each beat gets its own
 * browser context so recordVideo flushes a clean file per beat. localStorage
 * state (the running Socratic Code Tutor session) is carried forward between
 * beats 01->04 via context.storageState() so the hint-ladder escalation and
 * trace tab reflect one continuous, real session.
 *
 * Resumable: pass a beat id (e.g. `node record-beats.js 03-hints`) to re-run
 * a single beat. Requires demo-video/scripts/state-<prevBeat>.json to exist
 * for beats that continue a session (produced by the prior beat's run).
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const CLIPS_DIR = path.join(ROOT, "clips");
const RAW_DIR = path.join(ROOT, "clips", "_raw");
const STATE_DIR = path.join(ROOT, "scripts", "state");
const AUDIO_DURATIONS = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "audio-durations.json"), "utf8"));
const APP_URL = "https://socratic-code-tutor.vercel.app";
const REPO = "https://github.com/SebAustin/socratic-code-tutor";
const VIEWPORT = { width: 1920, height: 1080 };

fs.mkdirSync(CLIPS_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });
fs.mkdirSync(STATE_DIR, { recursive: true });

function narrationSecFor(id) {
  const entry = AUDIO_DURATIONS.find((d) => d.id === id);
  if (!entry) throw new Error(`No narration duration recorded for beat ${id}`);
  return entry.narrationSec;
}

async function padToAtLeast(page, startedAtMs, targetSec, extraSec = 0) {
  const elapsedSec = (Date.now() - startedAtMs) / 1000;
  const remaining = targetSec + extraSec - elapsedSec;
  if (remaining > 0.1) await page.waitForTimeout(Math.round(remaining * 1000));
}

async function robustClick(locator, timeoutMs = 12000, page = null, reloadUrl = null) {
  try {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    await locator.click({ timeout: timeoutMs });
    return;
  } catch (err) {
    console.warn(`[robustClick] normal click failed (${err.message.split("\n")[0]}), retrying with force`);
  }
  try {
    await locator.click({ timeout: timeoutMs, force: true });
    return;
  } catch (err) {
    console.warn(`[robustClick] force click failed too (${err.message.split("\n")[0]})`);
  }
  if (page && reloadUrl) {
    console.warn("[robustClick] reloading page and retrying once more");
    await page.goto(reloadUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500);
    await locator.click({ timeout: timeoutMs, force: true });
    return;
  }
  throw new Error("robustClick exhausted all retries");
}

async function pollForText(page, pattern, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (pattern.test(text)) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

async function finalizeClip(context, page, destName) {
  const video = page.video();
  await context.close();
  const destPath = path.join(CLIPS_DIR, destName);
  if (video) await video.saveAs(destPath);
  return destPath;
}

function newContextOpts(storageStatePath) {
  const opts = {
    viewport: VIEWPORT,
    recordVideo: { dir: RAW_DIR, size: VIEWPORT },
    reducedMotion: "no-preference",
  };
  if (storageStatePath && fs.existsSync(storageStatePath)) opts.storageState = storageStatePath;
  return opts;
}

// ---------------------------------------------------------------------------
// Beat 01 — Hook: clean landing, slow scroll, reveal broken sample (not run)
// ---------------------------------------------------------------------------
async function recordHook(browser) {
  const context = await browser.newContext(newContextOpts(null));
  const page = await context.newPage();
  const startedAt = Date.now();

  await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.mouse.move(960, 300);
  await page.waitForTimeout(600);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(900);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(900);
  // hover a couple of sample cards for a sense of the library
  const cards = page.locator("button", { hasText: "IndexError" });
  if (await cards.count()) await cards.first().hover().catch(() => {});
  await page.waitForTimeout(1200);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(800);

  await robustClick(page.getByRole("button", { name: "Try a broken sample →" }));
  await page.waitForTimeout(1500);

  const url = page.url();
  await padToAtLeast(page, startedAt, narrationSecFor("01-hook"), 1.5);

  await context.storageState({ path: path.join(STATE_DIR, "after-01-hook.json") });
  fs.writeFileSync(path.join(STATE_DIR, "url-01-hook.txt"), url);

  const dest = await finalizeClip(context, page, "01-hook.webm");
  console.log(`[01-hook] saved ${dest}`);
}

// ---------------------------------------------------------------------------
// Beat 02 — Run the broken sample, show traceback + first live tutor message
// ---------------------------------------------------------------------------
async function recordRun(browser) {
  const statePath = path.join(STATE_DIR, "after-01-hook.json");
  const url = fs.readFileSync(path.join(STATE_DIR, "url-01-hook.txt"), "utf8").trim();
  const context = await browser.newContext(newContextOpts(statePath));
  const page = await context.newPage();
  const startedAt = Date.now();

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);

  await robustClick(page.getByRole("button", { name: /Run/ }));
  const ok = await pollForText(page, /Hint 1 of 4/, 25000);
  if (!ok) {
    console.warn("[02-run] tutor reply did not arrive within 25s, retrying click once");
    await robustClick(page.getByRole("button", { name: /Run/ })).catch(() => {});
    await pollForText(page, /Hint 1 of 4/, 25000);
  }
  await page.waitForTimeout(1500);

  await padToAtLeast(page, startedAt, narrationSecFor("02-run"), 1.5);

  await context.storageState({ path: path.join(STATE_DIR, "after-02-run.json") });
  fs.writeFileSync(path.join(STATE_DIR, "url-02-run.txt"), page.url());

  const dest = await finalizeClip(context, page, "02-run.webm");
  console.log(`[02-run] saved ${dest}`);
}

// ---------------------------------------------------------------------------
// Beat 03 — Escalate the hint ladder, rung 1 -> 4 (3 more real tutor calls,
// each naturally spaced >=6s apart by the streaming wait itself).
// ---------------------------------------------------------------------------
async function recordHints(browser) {
  const statePath = path.join(STATE_DIR, "after-02-run.json");
  const url = fs.readFileSync(path.join(STATE_DIR, "url-02-run.txt"), "utf8").trim();
  const context = await browser.newContext(newContextOpts(statePath));
  const page = await context.newPage();
  const startedAt = Date.now();

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2500);

  // Hint button label changes per rung ("I'm stuck — hint" -> "One more nudge" ->
  // disabled at rung 4), so target it structurally rather than by text.
  const hintButton = page.locator(".composer-actions button").first();
  const debugDir = path.join(ROOT, "scripts", "debug");
  fs.mkdirSync(debugDir, { recursive: true });
  for (const rungPattern of [/Hint 2 of 4/, /Hint 3 of 4/, /Hint 4 of 4/]) {
    const beforeClick = Date.now();
    try {
      await robustClick(hintButton, 12000, page, page.url());
    } catch (err) {
      const tag = rungPattern.toString().replace(/\W/g, "");
      await page.screenshot({ path: path.join(debugDir, `fail-${tag}.png`) }).catch(() => {});
      fs.writeFileSync(
        path.join(debugDir, `fail-${tag}.txt`),
        await page.locator("body").innerText().catch(() => "(no body text)"),
      );
      throw err;
    }
    const ok = await pollForText(page, rungPattern, 20000);
    if (!ok) console.warn(`[03-hints] did not observe ${rungPattern} within 20s, continuing`);
    // keep spacing >=6s between tutor calls even if the stream finished fast
    const elapsed = Date.now() - beforeClick;
    if (elapsed < 6500) await page.waitForTimeout(6500 - elapsed);
  }
  await page.waitForTimeout(2500);

  await padToAtLeast(page, startedAt, narrationSecFor("03-hints"), 1.5);

  await context.storageState({ path: path.join(STATE_DIR, "after-03-hints.json") });
  fs.writeFileSync(path.join(STATE_DIR, "url-03-hints.txt"), page.url());

  const dest = await finalizeClip(context, page, "03-hints.webm");
  console.log(`[03-hints] saved ${dest}`);
}

// ---------------------------------------------------------------------------
// Beat 04 — Trace tab: scrub through steps with keyboard, watch variables
// ---------------------------------------------------------------------------
async function recordTrace(browser) {
  const statePath = path.join(STATE_DIR, "after-03-hints.json");
  const url = fs.readFileSync(path.join(STATE_DIR, "url-03-hints.txt"), "utf8").trim();
  const context = await browser.newContext(newContextOpts(statePath));
  const page = await context.newPage();
  const startedAt = Date.now();

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);

  await robustClick(page.locator("button", { hasText: "Trace" }));
  await page.waitForTimeout(800);

  const scrubber = page.locator('input[type="range"]').first();
  await scrubber.focus();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(750);
  }
  await page.waitForTimeout(1000);

  await padToAtLeast(page, startedAt, narrationSecFor("04-trace"), 1.2);

  await context.storageState({ path: path.join(STATE_DIR, "after-04-trace.json") });
  fs.writeFileSync(path.join(STATE_DIR, "url-04-trace.txt"), page.url());

  const dest = await finalizeClip(context, page, "04-trace.webm");
  console.log(`[04-trace] saved ${dest}`);
}

// ---------------------------------------------------------------------------
// Beat 05 — Teacher view: pre-seed 2 non-live sample sessions (per the
// recording checklist) so the ledger shows >=3 categories, then show the
// live session's real off-by-one tag, hover the chart, export.
// ---------------------------------------------------------------------------
function syntheticSession({ id, createdAt, title, code, category, freeText }) {
  return {
    id,
    createdAt,
    title,
    lang: "python",
    code,
    runs: [
      {
        id: `${id}-run-1`,
        status: "error",
        stdout: "",
        stderr: "",
        error: { excType: "Exception", message: "see transcript", line: 1 },
        durationMs: 2,
      },
    ],
    latestTrace: null,
    chat: [
      { id: `${id}-chat-0`, role: "tutor", content: "Run it when you're ready. We'll compare what you expected with what Python actually did." },
      { id: `${id}-chat-1`, role: "tutor", content: "Which value changes in a way you didn't expect — walk me through it.", rung: 1 },
    ],
    tags: [{ category, confidence: 0.95, evidenceTurn: 1, freeText }],
    currentRung: 1,
  };
}

async function seedExtraSessions(page) {
  const seeds = [
    syntheticSession({
      id: "seed-mutation-vs-copy",
      createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
      title: "The vanishing sword",
      code: `def remove_first(items):\n    result = items\n    result.pop(0)\n    return result\n\ninventory = ["sword", "shield", "potion"]\nremaining = remove_first(inventory)\nprint("Remaining:", remaining)\nprint("Original inventory:", inventory)`,
      category: "mutation_vs_copy",
      freeText: "result = items binds the same list object; popping from result also mutates inventory.",
    }),
    syntheticSession({
      id: "seed-scope-confusion",
      createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
      title: "Three identical counters",
      code: `def make_counters():\n    counters = []\n    for i in range(3):\n        def counter():\n            return i\n        counters.append(counter)\n    return counters\n\nfns = make_counters()\nprint([f() for f in fns])`,
      category: "scope_confusion",
      freeText: "Each closure captures the same variable i by reference, not its value at definition time.",
    }),
  ];

  await page.evaluate((seedSessions) => {
    const KEY = "socratic-code-tutor:sessions:v1";
    const raw = window.localStorage.getItem(KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const existingIds = new Set(existing.map((s) => s.id));
    const merged = [...existing, ...seedSessions.filter((s) => !existingIds.has(s.id))];
    window.localStorage.setItem(KEY, JSON.stringify(merged));
  }, seeds);
}

async function recordTeacher(browser) {
  const statePath = path.join(STATE_DIR, "after-04-trace.json");
  const context = await browser.newContext(newContextOpts(statePath));
  const page = await context.newPage();
  const startedAt = Date.now();

  await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 30000 });
  await seedExtraSessions(page);
  // The session store hydrates from localStorage once per full page load and
  // is a client-side singleton, so a soft (SPA) navigation to /teacher would
  // still see the pre-seed in-memory state. Force a full reload so the store
  // re-hydrates and picks up the two seeded sessions.
  await page.reload({ waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(500);

  await robustClick(page.getByRole("link", { name: "Teacher view →" }));
  await page.waitForTimeout(1200);

  const barRows = page.locator(".bar-row");
  const rowCount = await barRows.count();
  for (let i = 0; i < Math.min(rowCount, 3); i++) {
    await barRows.nth(i).hover().catch(() => {});
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1000);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
    robustClick(page.getByRole("button", { name: "Export JSON" })),
  ]);
  if (download) console.log(`[05-teacher] export triggered: ${await download.suggestedFilename()}`);
  await page.waitForTimeout(1500);

  await padToAtLeast(page, startedAt, narrationSecFor("05-teacher"), 1.2);

  const dest = await finalizeClip(context, page, "05-teacher.webm");
  console.log(`[05-teacher] saved ${dest}`);
}

// ---------------------------------------------------------------------------
// Beat 06 — Build story: GitHub commit history + README Codex narrative
// ---------------------------------------------------------------------------
async function recordBuild(browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: RAW_DIR, size: VIEWPORT },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const startedAt = Date.now();

  await page.goto(`${REPO}/commits/main`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(2500);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(2000);

  await page.goto(REPO, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  const narrativeHeading = page.getByRole("heading", { name: /Codex collaboration narrative/i });
  if (await narrativeHeading.count()) {
    await narrativeHeading.scrollIntoViewIfNeeded();
  } else {
    await page.mouse.wheel(0, 4000);
  }
  await page.waitForTimeout(4500);

  await page.goto(`${REPO}/blob/main/src/features/tutor/guardrail.ts`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(3000);

  await padToAtLeast(page, startedAt, narrationSecFor("06-build"), 1.2);

  const dest = await finalizeClip(context, page, "06-build.webm");
  console.log(`[06-build] saved ${dest}`);
}

// ---------------------------------------------------------------------------
// Beat 07 — Close: fresh landing page
// ---------------------------------------------------------------------------
async function recordClose(browser) {
  const context = await browser.newContext(newContextOpts(null));
  const page = await context.newPage();
  const startedAt = Date.now();

  await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.mouse.move(960, 400);
  await page.mouse.wheel(0, 150);
  await page.waitForTimeout(1000);

  await padToAtLeast(page, startedAt, narrationSecFor("07-close"), 1.0);

  const dest = await finalizeClip(context, page, "07-close.webm");
  console.log(`[07-close] saved ${dest}`);
}

const BEATS = {
  "01-hook": recordHook,
  "02-run": recordRun,
  "03-hints": recordHints,
  "04-trace": recordTrace,
  "05-teacher": recordTeacher,
  "06-build": recordBuild,
  "07-close": recordClose,
};

async function main() {
  const requested = process.argv[2];
  const ids = requested ? [requested] : Object.keys(BEATS);
  for (const id of ids) {
    if (!BEATS[id]) throw new Error(`Unknown beat id: ${id}`);
  }

  const browser = await chromium.launch();
  try {
    for (const id of ids) {
      const destPath = path.join(CLIPS_DIR, `${id}.webm`);
      if (fs.existsSync(destPath) && !requested) {
        console.log(`[${id}] already recorded, skipping (pass beat id explicitly to force re-record)`);
        continue;
      }
      console.log(`\n=== Recording beat ${id} ===`);
      await BEATS[id](browser);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
