# PLAN — Socratic Code Tutor

Architecture + build plan. Contract: `REQUIREMENTS.md`. Deploy: `DEPLOYMENT_CONTEXT.md`.
Assumptions: `ASSUMPTIONS.md`. Judged against `plan-rubric` (6 criteria).

**Build model:** Claude agency plans/reviews; **OpenAI Codex (GPT-5.6) implements** in discrete
sessions from work packages (WPs) below. WPs are sized ≤ half a day, independently verifiable,
with explicit file seams so Codex needs no cross-session context.

**Stack (fixed, not relitigated):** Next.js App Router + TypeScript, Vercel (Fluid Compute, Node
24), OpenAI SDK server-side → model `gpt-5.6` (env `OPENAI_MODEL`), streaming; Pyodide (pinned,
jsDelivr CDN) in a Web Worker; no DB (localStorage + file export); pnpm.

---

## 1. Architecture Overview

Three trust zones. **Untrusted student code never leaves the browser and never runs server-side.**

```
┌──────────────────────────── BROWSER (client, untrusted zone) ────────────────────────────┐
│  ┌───────────── Main thread (React / Next client components) ──────────────┐              │
│  │  Editor ── Run panel ── Chat ── Trace visualizer ── Teacher view ── Demo │              │
│  │        │            │        │            │                │             │              │
│  │        └────────────┴────────┴─ session store (Zustand) ───┴─ localStorage repo         │
│  │                              │                                            │              │
│  └──── postMessage (RunRequest) │ ────────────── fetch/SSE (TutorRequest) ───┼──────┐       │
│              │ ▲ RunResult/fatal │                                            │      │       │
│  ┌───────────▼─┴──────────────┐ │                                           trust   │       │
│  │  SANDBOX WEB WORKER        │ │                                          boundary │       │
│  │  Pyodide (jsDelivr, pinned)│ │                                            │      │       │
│  │  run + sys.settrace + kill │ │  code + output stay client-side           │      │       │
│  └────────────────────────────┘ │  (only sent to server as LLM context)     │      │       │
└──────────────────────────────────┼───────────────────────────────────────────┼──────┼──────┘
        ═══════════ TRUST BOUNDARY (network) ══════════════════════════════════▼══════▼═════
┌───────────────────────── VERCEL (server, trusted zone) ──────────────────────────────────┐
│  app/api/tutor/route.ts  — PROGRESSIVE-REVEAL GUARDRAIL PIPELINE                            │
│   1. validate + rate-limit (per-IP soft cap, turn cap, token cap)                          │
│   2. assemble prompt (system role + hint-rung directive + code/trace/output/history)       │
│   3. stream GPT-5.6 tokens into a SERVER-SIDE BUFFER (OPENAI_API_KEY, server-only)          │
│   4. on each completed sentence / code-fence boundary → deterministic screen()             │
│   5. screened chunk PASSES → flush to client SSE │ FLAGGED → stop flush, redact,            │
│                                                     emit safe fallback + log near-miss      │
│      ⇒ INVARIANT: no unscreened text ever reaches the client (FR-14)                        │
│  app/api/tag/route.ts → GPT-5.6 structured output → MisconceptionRecord                     │
│  app/api/health/route.ts → 200 (uptime through Aug 5)                                       │
└────────────────────────────────────┼───────────────────────────────────────────────────────┘
                                     ▼   OpenAI API (gpt-5.6)
```

**Guardrail-vs-streaming decision (committed):** tokens are **not** streamed raw to the client.
The route buffers model output server-side and runs the deterministic `screen()` incrementally at
each completed sentence or fenced-code boundary; only screened chunks are flushed over SSE. A
flagged chunk halts the flush and triggers the redact/fallback path. This trades a little latency
for a hard "nothing unscreened is shown" guarantee. Honest budget: **first *visible* chunk < 3s**
(one buffered sentence), superseding the naive "first-token < 2s" reading of NFR-2 — the underlying
model first-token is still measured (< 2s target) but is not user-visible until screened.

**Data flow (happy path):** Run → Worker executes + traces → `RunResult` to main thread → store
persists to localStorage → user asks for help → `POST /api/tutor` → server buffers+screens+streams
guarded Socratic text → chat → on session end, `POST /api/tag` → `MisconceptionRecord` → teacher
view aggregates from localStorage.

**Trust boundaries:** (1) Worker↔main: worker is compute-only, no network, no key. (2) Client↔server:
student code crosses only as *quoted LLM context*, never as executable. (3) Server↔OpenAI: key
server-only; student code/output treated as **untrusted data**, delimiter-wrapped, never obeyed (NFR-5).

---

## 2. Tech Choices (with trade-offs)

| Choice | Why | Alternative rejected |
|---|---|---|
| **Pyodide in a Web Worker** | Satisfies FR-4/NFR-6 (zero server exec) by construction; keeps main thread responsive; `sys.settrace` gives real runtime state (FR-15/SC-5). | Server sandbox (Docker/Firecracker): violates NFR-6, infra/cost, slower judge path. Main-thread Pyodide: freezes chat on runaway loops. Skulpt: weaker stdlib/traceback fidelity. |
| **Direct route handler + OpenAI SDK streaming** (not Vercel AI SDK) | SC-1/SC-7 need *unambiguous direct GPT-5.6 usage*; raw `openai.chat.completions.create({stream:true})` is auditable + narratable; full control to insert the buffered guardrail between model and client. | Vercel AI SDK `streamText`: hides the model call, and its passthrough streaming fights the buffered-screen requirement (FR-14). |
| **Server-buffered progressive-reveal guardrail** | Only way to honor FR-14 ("screen *before* display") while still streaming; see §1. | Raw passthrough + post-hoc redaction: impossible — shown tokens can't be un-shown. |
| **localStorage + file export** (no DB) | Non-goal #2; no-login judge path (FR-23/SC-3); zero setup friction; single-browser teacher scope accepted (Assumption #4). | Vercel KV/Postgres: setup + auth friction, out of v0 scope. |
| **Deterministic guardrail first** (Open-Q #3) | Cheap, fast, zero extra token cost (NFR-9); AST/pattern + line-similarity. Model-graded layer only if time allows. | Model-only: cost + latency + single point of failure. Prompt-only: fails defense-in-depth. |
| **Zustand** client/session state | Small, typed; avoids prop drilling across editor/chat/trace/teacher; cheap on trace scrub. | Redux (heavier); Context-only (re-render churn). |
| **CodeMirror 6 editor** | Python highlighting + line numbers (FR-1), keyboard-first (NFR-7), small lazy bundle. | Monaco: heavier, slower first paint vs NFR-1. |
| **SSE via `ReadableStream`** | Native to App Router; one-way token stream. | WebSockets: needless bidirectionality/infra. |

**Required security deviation (documented):** Pyodide needs `wasm-unsafe-eval` in `script-src`
plus `worker-src 'self' blob:` and jsDelivr in `script-src`/`connect-src` — a narrow, justified
exception to the house "no unsafe-eval" CSP rule, scoped to Pyodide. Authored in `next.config.ts`
`headers()` (WP-11).

---

## 3. Repo Layout + Module Seams

Feature-organized `src/`. Files kept < 400 lines (house rule).

```
src/
├── app/
│   ├── page.tsx, layout.tsx           # shell + CSP wiring
│   └── api/{tutor,tag,health}/route.ts
├── features/
│   ├── editor/    EditorPane.tsx, useEditor.ts
│   ├── sandbox/   worker.ts, pyodideRunner.ts, trace.py, useSandbox.ts
│   ├── tutor/     useTutorStream.ts, hintLadder.ts, promptBuilder.ts, guardrail.ts
│   ├── trace/     TraceVisualizer.tsx, useTraceCursor.ts
│   ├── teacher/   TeacherView.tsx, aggregate.ts, export.ts
│   ├── session/   store.ts, storage.ts, types.ts
│   └── demo/      samples.ts, DemoLanding.tsx
├── server/        openai.ts, ratelimit.ts, systemPrompt.ts
└── lib/           sse.ts, similarity.ts, constants.ts
```

### Named constants (`lib/constants.ts`) — single source of truth

| Constant | Default | Used by |
|---|---|---|
| `WALL_MS` | 5000 | WP-2 run timeout (NFR-6) |
| `MAX_STEPS` | 10000 | WP-2/10 settrace step guard |
| `WORKER_INIT_TIMEOUT_MS` | 15000 | WP-2 Pyodide CDN-load watchdog |
| `RUN_TIMEOUT_MS` | 8000 | WP-2 main-thread request timeout (= WALL_MS + margin) |
| `REQ_PER_MIN` | 12 | WP-9 per-IP soft rate limit |
| `MAX_TURNS_PER_SESSION` | 30 | WP-9 turn cap |
| `MAX_OUTPUT_TOKENS` | 700 | WP-5/9 server token cap |
| `TRACE_SUMMARY_TOKEN_BUDGET` | 1200 | WP-4 trace summary sent to model |
| `LOCALS_REPR_MAXLEN` | 200 | WP-10 per-var repr truncation |
| `GUARDRAIL_SIMILAR_LINES_N` | 3 | WP-8 secondary similarity trigger |
| `GUARDRAIL_SIMILARITY_THRESHOLD` | 0.8 | WP-8 per-line similarity ratio |
| `PERSISTED_TRACE_MAX_EVENTS` | 500 | WP-14 latest-run trace persistence cap |

All are env-overridable where a live tuning knob helps (rate/token caps); the rest are code
constants. WP acceptance criteria reference these names, not inline literals.

### Seam contracts (interfaces Codex builds against — stable across WPs)

```ts
// features/sandbox — worker message protocol (postMessage)
type RunRequest = { type: 'run'; id: string; code: string; lang: 'python';
                    limits: { wallMs: number; maxSteps: number } };
type RunResult  = { type: 'result'; id: string; stdout: string; stderr: string;
                    error: TracebackInfo | null;                 // structured, FR-5
                    trace: TraceEvent[];                          // FR-15, cap = maxSteps
                    status: 'ok'|'error'|'timeout'|'step_limit';
                    durationMs: number };
type WorkerFatal = { type: 'fatal'; id?: string;                 // DEFECT-4: init/run crash
                     stage: 'load'|'run'; message: string };     // CDN load fail, OOM, worker crash
type WorkerMsg  = RunResult | WorkerFatal
                | { type: 'ready' } | { type: 'progress'; id: string };

interface TracebackInfo { excType: string; message: string; line: number | null; }
interface TraceEvent {                                           // SC-5: real state, no fabrication
  step: number; line: number; event: 'line'|'call'|'return'|'exception';
  depth: number; func: string; locals: Record<string, string>;  // repr, ≤ LOCALS_REPR_MAXLEN
}

// features/tutor — POST /api/tutor
interface TutorRequest {
  sessionId: string; code: string;                               // untrusted → quoted
  run: { stdout: string; stderr: string; error: TracebackInfo | null; status: string };
  traceSummary: string;                                          // ≤ TRACE_SUMMARY_TOKEN_BUDGET
  history: ChatTurn[]; requestedRung: 1|2|3|4;                   // FR-11 ceiling = 4
  lang: 'python'|'javascript';
}
interface ChatTurn { role: 'student'|'tutor'; content: string; rung?: number; }
// Response: SSE; events {chunk}|{done, rung, flagged}|{error}. Each {chunk} is ALREADY screened.

// features/teacher — persisted per session
interface MisconceptionRecord {                                  // FR-17 fixed taxonomy
  category: 'off_by_one'|'mutation_vs_copy'|'scope_confusion'|'type_coercion'
          | 'operator_precedence'|'loop_condition'|'mutable_default_arg'|'other';
  freeText?: string; confidence: number; evidenceTurn: number;
}
interface Session {                                              // FR-20 localStorage unit
  id: string; createdAt: number; title: string; lang: 'python'|'javascript';
  code: string;
  runs: RunMeta[];                                               // DEFECT-3: metadata + output only
  latestTrace: TraceEvent[] | null;                             // only latest, ≤ PERSISTED_TRACE_MAX_EVENTS
  chat: ChatTurn[]; tags: MisconceptionRecord[]; currentRung: 0|1|2|3|4;
}
interface RunMeta { id: string; status: RunResult['status']; stdout: string;
                    stderr: string; error: TracebackInfo | null; durationMs: number; }
```

### Guardrail detector (`features/tutor/guardrail.ts`) — DEFECT-2 restructured

`screen(text, studentCode, rung): { pass: boolean; reason?: string; safeFallback: string }`

- **PRIMARY (deterministic, high-signal):**
  (a) a complete fenced code block whose parsed AST / line count covers the failing region, or
  (b) imperative-fix phrasing ("replace line X with…", "change `a` to `b`") that *contains the
  corrected expression*. Either ⇒ flag.
- **SECONDARY (echo catcher):** ≥ `GUARDRAIL_SIMILAR_LINES_N` consecutive output lines with
  per-line similarity > `GUARDRAIL_SIMILARITY_THRESHOLD` to student code (`lib/similarity.ts`) ⇒
  flag verbatim echo of a fixed line.
- **Rung-scoped rule:** rung ≤ 3 may contain **no** fenced code beyond the student's own quoted
  lines; rung 4 may contain **≤ 1 line of pseudo-code**, never runnable.
- **Trade-off, stated:** primary favors low false-negatives on real fixes (accepts occasional false
  positives on legitimately-quoted student code, which the "beyond student's own lines" carve-out
  reduces); secondary favors catching echo at some false-positive risk on short shared lines,
  bounded by the N-consecutive requirement. Bound to assert: **screen latency < 5ms/response
  (measure and report actual).** Failure mode is always safe (substitute fallback question).

---

## 4. Milestones (Jul 14 → 21) — Codex builds, agency reviews

Cadence: Codex implements WPs → agency review + guardrail/adversarial spot check → merge. Each M
demoable. **Rollback lever ordered: drop JS (FR-7) first, then model-graded 2nd guardrail, then
trace step-back polish.**

| M | Day | Outcome (demoable) | WPs | Rollback-to-smaller |
|---|---|---|---|---|
| **M0** | Mon Jul 14 | Repo scaffold, CI, Vercel deploy; `/api/health` 200; `.env.local.example`. **Precondition: Codex credits requested (deadline Fri Jul 17 12:00 PT) OR personal-key fallback confirmed before WP-1 starts (Assumption #6).** | WP-1 | — |
| **M1** | Tue Jul 15 | Editor + Run → Pyodide worker prints stdout/traceback. **Thinnest runnable slice.** | WP-2,3 | Skip trace, keep run. |
| **M2** | Wed Jul 16 | Streaming Socratic reply from GPT-5.6; system-prompt no-solution + anti-injection. | WP-4,5,6 | Non-streaming JSON reply. |
| **M3** | Thu Jul 17 (credits due 12pm) | Hint ladder 1–4 + buffered guardrail + rate/token caps. | WP-7,8,9 | Prompt-only guardrail. |
| **M4** | Fri Jul 18 | `sys.settrace` trace → scrubbable timeline; step fwd/back. | WP-10,11 | Static final-state view. |
| **M5** | Sat Jul 19 | Misconception tagging + teacher view aggregate + JSON/MD export; session switcher. | WP-12,13,14 | Single-session report. |
| **M6** | Sun Jul 20 | Demo mode + ≥6 samples, a11y, CSP, responsive ≥1024px, cross-browser smoke, adversarial suite (SC-4). | WP-15,16,17 | Cut JS entirely. |
| **M7** | Mon Jul 21 AM | E2E green, README + Codex `/feedback` id, < 3-min video, submit < 5pm PT. | WP-18,19 | — |

Buffer: JS support (FR-7) opportunistic in M6 only if M4/M5 finished early; else dropped (Open-Q #2).

---

## 5. Work Packages (WP-1..WP-19)

Each: goal · files · deps · acceptance → become `CODEX_PLAYBOOK.md` prompts. **Regression gate
(all WPs): prior suites stay green and collected test count does not decrease.**

**WP-1 Scaffold + deploy.** Next.js+TS+pnpm, Zustand, CodeMirror deps, ESLint/Prettier, Vitest,
Playwright, `/api/health`, Vercel link. Files: root config, `app/layout.tsx`, `app/page.tsx` stub,
`api/health/route.ts`. Deps: none (M0 precondition: Codex credits or fallback key confirmed).
Accept: `pnpm build` passes; Vercel preview health 200; CI runs lint+test on push.

**WP-2 Sandbox worker (run only).** Pyodide from pinned jsDelivr version; `RunRequest`→`RunResult`;
stdout/stderr/structured traceback; `WALL_MS` timeout + `MAX_STEPS` guard/kill; **`WorkerFatal` on
CDN-load failure or worker crash; main-thread `WORKER_INIT_TIMEOUT_MS`/`RUN_TIMEOUT_MS` watchdogs**.
Files: `features/sandbox/{worker.ts,pyodideRunner.ts,useSandbox.ts}`, `lib/constants.ts`. Deps: WP-1.
Accept: ZeroDivisionError sample → `error.excType==='ZeroDivisionError'` + `error.line`; infinite
loop → `status:'timeout'` in < WALL_MS+500ms; simulated CDN-load failure → `fatal{stage:'load'}`
surfaced (not a silent hang). **Pin exact Pyodide version; measure+report init time (bound: init <5s
broadband, SC-3).**

**WP-3 Editor + Run panel.** CodeMirror Python editor (FR-1); Run button; output pane with
running/timeout/error/**worker-fatal (CDN load failed)** states (FR-6). Files: `features/editor/*`,
run panel in `page.tsx`, minimal `session/store.ts`. Deps: WP-2. Accept: type→Run→stdout renders;
keyboard-only run (NFR-7); **FMP of editor/UI shell < 2.5s on broadband, Pyodide lazy (NFR-1),
measure+report.**

**WP-4 Prompt builder + system prompt.** TutorRequest→messages; delimiter-wrapped untrusted
code/output; trace summary truncated to `TRACE_SUMMARY_TOKEN_BUDGET`; rung directive per request.
Files: `features/tutor/promptBuilder.ts`, `server/systemPrompt.ts`. Deps: none. Accept: system role
forbids runnable code/full solutions, instructs ignoring embedded instructions (NFR-5); injection
strings appear only inside quoted delimiters.

**WP-5 OpenAI server client.** `server/openai.ts`: SDK client, `MODEL=process.env.OPENAI_MODEL ??
'gpt-5.6'`, `MAX_OUTPUT_TOKENS` enforced. Deps: WP-1. Accept: unit test mocks SDK; **verify real
`gpt-5.6` id against OpenAI docs at build start (Open-Q #1); one-line swap if dated suffix.**

**WP-6 Tutor route (buffered progressive-reveal streaming).** `api/tutor/route.ts`: validate
schema; call model `stream:true` into server buffer; flush per sentence/fence boundary via
`lib/sse.ts`. Files: `api/tutor/route.ts`, `lib/sse.ts`, `features/tutor/useTutorStream.ts`. Deps:
WP-4,5. Accept: run→screened chunks appear; malformed body → 400; **first *visible* chunk < 3s and
model first-token < 2s, both measured+reported (NFR-2 per §1).**

**WP-7 Hint ladder state machine.** `hintLadder.ts`: pure reducer, rung 1→4, clamp at 4; "more
help" advances one rung; badge "Hint N of 4" (FR-12). Deps: WP-6. Accept: advance past 4 stays 4;
each rung maps to its directive; rung persisted on `Session.currentRung`.

**WP-8 Buffered deterministic guardrail.** `guardrail.ts` + `lib/similarity.ts`, wired into the
WP-6 pipeline: `screen()` runs per sentence/fence boundary; PASS flushes, FLAG stops flush + emits
safe fallback + logs near-miss (primary/secondary/rung rules per §3). Deps: WP-6. Accept: unit suite
— fenced `def fix():…` flagged; imperative "replace line 4 with `x = …`" flagged; verbatim echo (≥
`GUARDRAIL_SIMILAR_LINES_N` lines) flagged; legitimate Socratic question passes; rung-3 fenced code
flagged, rung-4 single pseudo-code line passes. **Integration test asserts NO unscreened text ever
reaches the client (inject a solution mid-stream → client receives only fallback). screen latency
<5ms, report actual.**

**WP-9 Rate/cost guardrails.** `server/ratelimit.ts` in-memory per-IP LRU (`REQ_PER_MIN`, soft,
per-instance); server `MAX_OUTPUT_TOKENS`; `MAX_TURNS_PER_SESSION` cap. Deps: WP-6. Accept: over
`REQ_PER_MIN` → 429; turns over cap → 429; token cap applied regardless of client input (NFR-9).
Document cold-start reset as known gap.

**WP-10 settrace capture.** `features/sandbox/trace.py` via `sys.settrace`; emit `TraceEvent[]`,
locals repr truncated to `LOCALS_REPR_MAXLEN`, capped at `MAX_STEPS`→`step_limit`. Files: trace.py,
extend `pyodideRunner.ts`. Deps: WP-2. Accept: 3-var loop sample → trace line/locals match
hand-computed expected sequence (SC-5, no fabrication); step cap enforced; **run+trace for a <200
LOC sample completes < 3s (NFR-3), measure+report.**

**WP-11 Trace visualizer + CSP.** Scrubbable timeline, step fwd/back, vars-in-scope + call depth
(FR-15/16); `prefers-reduced-motion` (NFR-7); **worker-fatal state rendered in trace panel**; CSP
headers in `next.config.ts` (Pyodide exception). Files: `features/trace/*`, `next.config.ts`. Deps:
WP-10. Accept: scrubber reflects trace; keyboard step; CSP present in headers, Pyodide still runs.

**WP-12 Misconception tagging.** `api/tag/route.ts`: GPT-5.6 structured output → `MisconceptionRecord`
constrained to taxonomy (FR-17). Deps: WP-5. Accept: mocked test validates schema + enum; unknown →
`other` + freeText.

**WP-13 Teacher view + aggregate.** `aggregate.ts` counts per category across localStorage sessions;
`TeacherView.tsx` counts + session list (FR-18). Deps: WP-12. Accept: aggregate 3 sessions → correct
counts (SC-6).

**WP-14 Export + session mgmt + persistence hardening.** `export.ts` JSON+MD (FR-19); switcher,
new/delete, autosave (FR-20/21); Reset action (deploy §5). **DEFECT-3: persist only `latestTrace`
(≤ `PERSISTED_TRACE_MAX_EVENTS`, first+last biased); older runs persist `RunMeta` only; on
`QuotaExceededError` fall back to dropping traces while keeping chat + tags.** Deps: WP-13. Accept:
export opens as valid JSON/MD; reload restores session; delete removes it; **simulated quota-exceeded
→ traces dropped, chat/tags survive (no crash).**

**WP-15 Sample pack + demo mode.** `samples.ts` ≥6 deterministic buggy programs across taxonomy
(FR-2); one-click load; `DemoLanding.tsx` inline explainer + preloaded sample (FR-22). Deps: WP-3.
Accept: each sample loads+runs; demo path run→hints→trace→tag→teacher completes < 3 min (SC-3).

**WP-16 A11y + responsive pass.** Keyboard for editor/chat/ladder/scrubber, focus states, WCAG AA
contrast, ≥1024px layout (NFR-7/10). Deps: WP-3, WP-7, WP-11, WP-13. Accept: automated a11y check
passes on main surfaces; keyboard-only full loop possible.

**WP-17 Adversarial guardrail suite (SC-4).** ≥10 "just give me the answer" / injection inputs as a
test fixture; assert 0 produce runnable corrected code through the WP-6/8 pipeline. Deps: WP-8.
Accept: suite green; near-misses logged; documented in README.

**WP-18 E2E + README + cross-browser.** Playwright student flow (load sample→run→2 rungs→trace→tag→
teacher); **cross-browser smoke on Chrome/Firefox/Safari latest-2 (NFR-8)**; README with setup,
samples, Codex-collaboration narrative + `/feedback` id, MIT license (SC-1/8). Deps: most. Accept:
e2e green in CI; smoke passes 3 browsers; README complete.

**WP-19 Demo video + submit.** < 3-min YouTube narrating Codex build + runtime GPT-5.6 (SC-7); final
Vercel smoke test; submit. Deps: all. Accept: submitted before 5pm PT Jul 21.

---

## 6. Risks + Mitigations · Scope-Cut Order

| Risk | Mitigation |
|---|---|
| **Pyodide size/latency** (10MB+ wasm) | jsDelivr CDN, lazy-init on first Run, preconnect, visible loader; `WorkerFatal{stage:'load'}` + `WORKER_INIT_TIMEOUT_MS` watchdog on CDN failure. Bound: interactive <5s incl. init (SC-3), measure actual. |
| **`gpt-5.6` id wrong** | Single `OPENAI_MODEL` const; verify at build start (WP-5); one-line swap. Personal-key fallback if credits stall (Assumption #6). |
| **Guardrail solution-leak** | Defense in depth: system prompt (FR-13) + **buffered** post-gen screen so nothing unscreened ships (FR-14/WP-8) + adversarial gate (SC-4/WP-17). Failure mode = safe fallback question + logged near-miss. Rung-4 ceiling never emits runnable code. |
| **Public-demo abuse** | Per-IP soft limit, token cap, turn cap (WP-9); documented 5-min key-rotation (deploy §4). Cold-start reset = documented known gap, escalate to KV only if abused. |
| **Prompt injection via student code** | Delimiter-wrapped untrusted data; fixed system role ignores embedded instructions (NFR-5/WP-4); covered by WP-17 fixtures. |
| **localStorage overflow** | Persist latest trace only (capped) + `RunMeta`; quota-exceeded fallback drops traces, keeps chat/tags (WP-14). |
| **Deadline compression** | Thin slice at M1; each M demoable; scope-cut lever ordered; WPs independently mergeable. |

**Scope-cut order (first to drop):** 1) JavaScript (FR-7) → 2) model-graded 2nd guardrail layer →
3) trace step-*back* (keep forward) → 4) MD export (keep JSON) → 5) session switcher (keep single).
Python-only satisfies all FRs (Assumption #3).

---

## 7. Testing Strategy

- **Unit (Vitest):** hint ladder reducer (WP-7); guardrail primary/secondary/rung cases + rung-4
  pseudo-code allow (WP-8); traceback parse + settrace fidelity vs hand-computed (WP-2/10); prompt
  anti-injection wrapping (WP-4); aggregate counts (WP-13); similarity (WP-8); quota-fallback (WP-14).
- **Integration:** tutor route validation/buffered-screen/token-cap (mocked SDK, WP-6/8/9) —
  including the **no-unscreened-text invariant**; tag route schema (WP-12).
- **Adversarial (fixture-driven, SC-4):** ≥10 solution-baiting/injection inputs → 0 runnable-code
  leaks (WP-17). This is a **gate**, not advisory.
- **E2E (Playwright, WP-18):** full student loop on a sample; keyboard-only variant (NFR-7);
  cross-browser smoke Chrome/Firefox/Safari (NFR-8).
- **Manual:** demo script (deploy §5) pre-record; live rate-limit + token-cap verification on the
  deployed URL before sharing.
- **Regression invariant (all WPs):** prior suites stay green and collected test count does not
  decrease. Coverage target ≥ 80% on `features/tutor`, `features/sandbox`, `features/teacher` logic
  (house rule; visual/UI shells exempt where visual-regression carries the signal).

Security designed-in: key server-only (NFR-4, grep-gate no `NEXT_PUBLIC_*`/client file references
it); no server exec (NFR-6, structural); CSP scoped Pyodide exception (WP-11); input validation at
both boundaries (worker protocol + route schema). Observability: structured server logs for request
volume, token usage, 429s, and guardrail near-misses (WP-8/9) so abuse and leaks are visible fast.

---

## 8. Traceability — Success Criteria + NFRs

| ID | Requirement | Satisfied by |
|---|---|---|
| SC-1 | Codex + GPT-5.6 usage unambiguous; `/feedback` id | WP-5/6 (direct call site), WP-18 (README) |
| SC-2 | Education-track impact case in demo | §1 requirements + WP-19 narration |
| SC-3 | Hosted, no-login, <5s interactive, full loop <3 min | WP-1, WP-2 (init bound), WP-15, M6 |
| SC-4 | Guardrail holds vs ≥10 adversarial inputs, 0 leaks | WP-8 + WP-17 (gate) |
| SC-5 | Trace reflects real Pyodide state, no fabrication | WP-10 (hand-verified) |
| SC-6 | Teacher view aggregates ≥3 sessions; valid export | WP-13, WP-14 |
| SC-7 | <3-min video narrating Codex build + runtime GPT-5.6 | WP-19 |
| SC-8 | Public repo + MIT + README + samples + Codex narrative | WP-1, WP-15, WP-18 |
| SC-9 | Differentiated from generic chatbot in writeup | WP-18 README |
| NFR-1 | Editor/shell FMP <2.5s, Pyodide lazy | WP-3 (measure+report) |
| NFR-2 | Stream; first-visible chunk <3s, model first-token <2s | WP-6 (measure+report) |
| NFR-3 | Run+trace <3s for <200 LOC | WP-10 (measure+report) |
| NFR-4 | Key server-only, never client/logs | WP-5 + grep-gate (§7) |
| NFR-5 | Prompt-injection: untrusted code, fixed role | WP-4, WP-17 |
| NFR-6 | No server exec; wall-clock + iteration guard | WP-2 (structural) |
| NFR-7 | Keyboard, reduced-motion, WCAG AA, focus | WP-3/11/16 |
| NFR-8 | Chrome/Firefox/Safari latest-2 | WP-18 smoke |
| NFR-9 | Turn + token ceilings + rate limit | WP-9 |
| NFR-10 | Usable ≥1024px | WP-16 |

Every FR maps to a WP: FR-1→WP-3, FR-2→WP-15, FR-3→WP-3, FR-4/5/6→WP-2, FR-7→(opportunistic M6),
FR-8/9/10→WP-4/6, FR-11/12→WP-7, FR-13→WP-4, FR-14→WP-6/8, FR-15/16→WP-10/11, FR-17→WP-12,
FR-18→WP-13, FR-19→WP-14, FR-20/21→WP-14, FR-22→WP-15, FR-23→WP-1.

---

## Revision Log

- **2026-07-14 · v1 (initial).** Full architecture + WP decomposition for Codex execution. Open
  questions resolved to REQUIREMENTS defaults; CSP Pyodide exception flagged.
- **2026-07-14 · v2 (critic pass, addresses 8 defects).**
  - **D1 (guardrail vs streaming):** committed to server-buffered progressive-reveal — screen per
    sentence/fence boundary, flush only screened chunks; added §1 pipeline + invariant; revised
    budget to first-*visible* chunk <3s (model first-token <2s still measured); WP-6/8 assert "no
    unscreened text reaches client" with an integration test.
  - **D2 (similarity heuristic):** restructured detector to PRIMARY (AST/fence-covers-region +
    imperative-fix phrasing) and SECONDARY (echo via N-consecutive similar lines); pinned
    `GUARDRAIL_SIMILAR_LINES_N=3` + threshold; added rung-scoped rule + FP/FN trade-off note.
  - **D3 (localStorage overflow):** `Session` now stores only `latestTrace` (≤500 events) +
    `RunMeta`; WP-14 adds quota-exceeded fallback (drop traces, keep chat/tags).
  - **D4 (worker fatal):** added `WorkerFatal{stage:'load'|'run'}`, `WORKER_INIT_TIMEOUT_MS`/
    `RUN_TIMEOUT_MS`, CDN-load-failure UI state in WP-2/3/11.
  - **D5 (NFR traceability):** added measurable bounds to WP-3/6/10/18 and an NFR block in §8.
  - **D6 (Codex credits gate):** added M0 precondition (credits requested by Fri Jul 17 12:00 PT or
    personal-key fallback) before WP-1.
  - **D7 (constants):** added `lib/constants.ts` named-constants table; WP acceptance references
    names, not literals.
  - **D8 (WP-16 deps):** expressed as concrete WP list (WP-3, WP-7, WP-11, WP-13).
