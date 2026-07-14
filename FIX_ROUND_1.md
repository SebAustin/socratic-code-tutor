# Fix Round 1 — paste into the SAME Codex session

Consolidated findings from 4 independent reviews (TypeScript, React, security/STRIDE, solution
verification) of commit `e0e572b`. Verifier score: 74/100 (needs ≥90). Details live in
`SECURITY.md` and the review transcripts; everything actionable is below.

**Paste everything between the lines into Codex as one message.**

---

Fix round 1 from the agency review of the restored MVP. Work through ALL items below in order
(A → E). Rules: keep every existing test green; total collected test count must strictly
increase; no item may be "fixed" by weakening an acceptance criterion or deleting a test.
When done: run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` and
`pnpm exec playwright test --project=chromium`, report exact measured counts, and commit
everything as one commit: `fix: agency review round 1 — guardrail integrity, abuse hardening, streaming lifecycle, a11y, tests`.

## A. Guardrail integrity (CRITICAL — the product's core invariant is currently bypassable)

A1. `screen()` bypasses (reproduced against the shipped code, src/features/tutor/guardrail.ts):
these two strings currently pass unflagged at rung 2 and must be flagged:
  - "Consider changing to `range(len(nums) - 1)` instead of what you have on line 3."
  - "What if line 4 were `s = s + nums[i]` — try that and rerun."
Fix the detector:
  (i) Treat INLINE single-backtick spans as code candidates, not just triple-backtick fences.
      An inline span is "runnable-fix" if it contains an assignment, call, subscript, or
      operator expression (heuristic regex) AND is not a verbatim line/fragment of the
      student's own submitted code. At rung ≤ 3, any such non-verbatim code span → flag.
  (ii) Broaden imperative-fix phrasing to morphological variants: change/changing/changed,
      replace/replacing, rewrite/rewriting, fix/fixing, use/using X instead, "try `X`".
  (iii) Rung-4 ceiling: count assignment/expression lines (e.g. `s = s + nums[i]`) as runnable
      code, not just lines starting with def/class/import/for/while/if.
Add adversarial fixtures for BOTH reproduced strings plus gerund phrasings and a bare
assignment line; keep the existing negative cases passing (tutor quoting the student's own
line verbatim must still pass; conceptual prose with `variable` mentions must still pass).

A2. The screen has no memory across flush boundaries and a flag does not stop the turn
(src/app/api/tutor/route.ts, src/lib/sse.ts): per-line flushing means the 3-consecutive-
similar-lines echo detector can never fire, and after a chunk is flagged the loop keeps
screening/flushing later chunks of the same reply. Fix:
  - Screen CUMULATIVELY: keep the full accumulated turn text; on each flush boundary run
    `screen()` over the accumulated text (or a sliding window ≥ GUARDRAIL_SIMILAR_LINES_N
    lines), not just the pending fragment.
  - On first flag: STOP the turn — abort the upstream OpenAI stream, do not flush the flagged
    chunk or anything after it, emit the fallback message and `done{flagged:true}`.

A3. Add the plan-mandated integration test `src/features/tutor/guardrail.integration.test.ts`:
mock the OpenAI SDK stream and drive the REAL route pipeline. Cases: (a) full solution
injected mid-stream in one delta; (b) solution split across chunk/sentence boundaries;
(c) solution streamed line-by-line (defeats old per-line screening); (d) clean Socratic reply
passes through unchanged. Assert: no substring of the corrected code ever appears in the
client-visible SSE chunks; fallback + `done{flagged:true}` emitted; nothing flushed after the
flag.

## B. Cost & abuse hardening (HIGH — public deploy runs on the owner's API key)

B1. `/api/tag` has NO rate limiting, turn cap, or size validation (src/app/api/tag/route.ts):
apply the same `checkRateLimit` as `/api/tutor`, import `MAX_CODE_LEN` from lib/constants
instead of the inline `20_000`, and name the `180` literal (`TAG_MAX_OUTPUT_TOKENS` in
lib/constants.ts). Add a 429 test.

B2. Abort propagation end-to-end (src/app/api/tutor/route.ts, src/server/openai.ts,
src/features/tutor/useTutorStream.ts):
  - Server: create an AbortController per request; pass its `signal` to
    `openai.chat.completions.create` (both routes); implement `cancel()` on the
    ReadableStream that aborts the upstream call; wire `request.signal` (client disconnect)
    to the same controller. Guard ALL `controller.enqueue()` calls against a closed
    controller (the current catch block double-enqueues after close → unhandled rejection).
  - Client: AbortController per `askTutor` call, `signal` on the fetch, `reader.cancel()` in
    a `finally`, expose a `cancel()` from the hook, and call it on unmount from the consuming
    component.
  - Test: mocked-SDK route test asserting the upstream abort fires when the client disconnects
    mid-stream.

B3. Rate-limit keying is spoofable (src/app/api/tutor/route.ts clientIp): the FIRST entry of
`x-forwarded-for` is attacker-controlled. Key off `x-vercel-forwarded-for` when present, else
the LAST entry of `x-forwarded-for`, else 'unknown'. Also make bucket eviction recency-aware
(Map delete+set on hit) so spoof bursts can't evict legitimate long-lived IPs. Update
ratelimit tests for both.

B4. Delimiter collision (src/features/tutor/promptBuilder.ts): student code containing the
literal delimiter tokens (e.g. `<<<END_STUDENT_CODE>>>`) can escape its block. Neutralize the
token sequence inside student content before embedding (e.g. break it with a zero-width or
substitute marker) and add a unit test that an escape attempt stays inside the delimiters.

## C. Client correctness (CRITICAL/HIGH)

C1. Cross-session misattribution (src/features/session/Workbench.tsx talkToTutor): the tutor
reply and misconception tag are appended to whatever session is active AT COMPLETION, not the
session that issued the request. Capture the originating sessionId and route
`appendChat`/`addTag` to it explicitly (add a sessionId parameter to those store actions).
Test: switch active session mid-stream (mock) → reply lands in the originating session.

C2. Pyodide worker leaks on unmount (src/features/sandbox/useSandbox.ts): add
`useEffect(() => () => runnerRef.current?.reset(), [])`. Also add an in-flight guard in
`PyodideRunner.run()` (src/features/sandbox/pyodideRunner.ts) rejecting or queueing a second
`run()` while one is pending — the worker's Python globals are shared and currently race.

C3. Drawers claim `aria-modal="true"` but implement no modal behavior (Workbench samples
drawer, TeacherView transcript drawer): on open, move focus into the dialog; trap Tab/Shift+Tab;
Escape closes and restores focus to the trigger element. Extend the a11y e2e to assert
Escape-close and focus restoration.

## D. Robustness + mandated test coverage (HIGH/MEDIUM)

D1. Quota fallback can itself crash (src/features/session/storage.ts): the drop-traces retry
`setItem` is not wrapped — if still over quota it throws out of every store action. Wrap it;
final fallback: drop oldest sessions' chat beyond the most recent 5, and if that still fails,
warn and skip persistence (never throw). Extend the quota test to cover retry-also-fails.

D2. Unchecked `JSON.parse` + cast on SSE payloads (src/lib/sse.ts parseSseBlock): validate the
parsed shape (zod); a malformed block is skipped (warn) without aborting the whole turn —
currently one bad block discards the entire assembled reply in useTutorStream. Unit test both.

D3. SC-5 (trace fidelity) has zero runnable verification: `features/sandbox` has no tests and
the real-Pyodide e2e is excluded from CI. Fix: remove the `@runtime` tag exclusion for
`runtime-smoke.spec.ts` so it runs in the default chromium job, and extend it to assert REAL
trace content for at least 2 bundled samples (e.g. off_by_one: variable `i`/accumulator values
at specific steps; mutation_vs_copy: aliased list identity visible in locals) — not just that
a timeline renders. Report the measured Pyodide init time in your summary.

D4. Missing specced route integration tests (mock the OpenAI SDK): (a) student code is
delimiter-wrapped in the outbound prompt (SDK spy); (b) SSE chunks to the client are exactly
the screened chunks; (c) `MAX_OUTPUT_TOKENS` is passed server-side; (d) `/api/tag` happy path
returns a schema-valid MisconceptionRecord from mocked structured output (unknown category →
`other`).

D5. Dead duplicate tracer: `src/features/sandbox/trace.py` is never imported; `worker.ts`
embeds its own copy as TRACE_RUNNER. Delete trace.py and add a comment on TRACE_RUNNER noting
it is the single source of truth (or make it the loaded source — pick one, no duplicates).

## E. Hardening & polish (MEDIUM/LOW — do after A–D)

E1. CSP/headers (next.config.ts): add `Strict-Transport-Security` (max-age=31536000;
includeSubDomains). Replace `script-src 'unsafe-inline'` with a safer production posture if
feasible without breaking Next inline runtime (nonce or hash based); if not feasible today,
add a comment documenting the residual risk and why.
E2. Replace remaining inline magic numbers with named constants (tutor route validation bounds
20_000/40/8_000/6_000/120; tag route items from B1) — all in lib/constants.ts.
E3. Remove the redundant `as TutorRequest` cast (src/app/api/tutor/route.ts) — let zod's
inferred type flow.
E4. A11y: give the hint caption an id and `aria-describedby="hint-caption"` on the composer
textarea (src/features/tutor/TutorPanel.tsx) per UX-SPEC §7.
E5. Render perf: hoist CodeMirror `extensions`/`basicSetup` to module scope or useMemo
(EditorPane); memoize `meaningful` on `[sessions]` in TeacherView; stop `handleRun`/shortcut
effect churning on every keystroke (depend on primitives or read session via ref).
E6. Replace raw `oklch(...)` literals in globals.css with tokens from styles/tokens.css
(add terminal-surface variants where needed).
E7. Stable chat keys: give ChatTurn an id at `appendChat` time; key on it (TutorPanel,
TeacherView).
E8. Add a comment on the module-level Zustand store noting the SSR-singleton caveat (no
refactor needed now).

## Explicitly OUT OF SCOPE for this round (agency-accepted deviations)
- Mobile tab-bar layout from UX-SPEC §8 (primary viewport is 1024px+; logged as accepted
  deviation).
- Pyodide SRI (not feasible with the loader; documented residual risk).
- aria-relevant screen-reader behavior: manual SR pass stays on the submission checklist.
- README `/feedback` ID placeholder: filled on submission day.

---

After Codex finishes: run the verify checklist yourself (`pnpm lint && pnpm test && pnpm build`,
plus the chromium e2e), **commit**, and bring the result back to the agency for re-verification.
