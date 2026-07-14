# Socratic Code Tutor

Debug it yourself. We’ll only ask questions.

Socratic Code Tutor is an education-track hackathon app for students learning Python. It combines a real in-browser runtime trace, a four-rung hint ladder, a dual no-solution guardrail, and a local teacher misconception report. There is no login and no database.

## Try it in 60 seconds

1. Open the app and choose **Try a broken sample →**.
2. Press **Run**. The pinned Pyodide runtime starts lazily in a Web Worker.
3. Read the structured error and open **Trace** to inspect the real variable state.
4. Answer the tutor or choose **I’m stuck — hint** to climb one rung.
5. Open **Teacher view** to see the misconception tag and export the report.

## Why this is different

Most coding assistants optimize for completion. This app is designed around productive struggle:

- GPT-5.6 receives the actual run result and trace, but is instructed to ask rather than fix.
- A second deterministic screen checks every complete sentence or code-fence boundary before it can reach the browser.
- The hint ladder makes escalation visible and stops at non-runnable scaffolding.
- Teachers see recurring mental-model gaps, not just pass/fail outcomes.

## Security boundaries

- Student Python is executed only in a browser Web Worker using Pyodide. No route handler contains `eval`, `exec`, a subprocess, or any other code-execution path.
- `OPENAI_API_KEY` is read only inside `src/app/api/tutor/route.ts` and `src/app/api/tag/route.ts`. It is never exposed through a `NEXT_PUBLIC_*` variable or client component.
- Code, output, trace, and chat are delimiter-wrapped as untrusted evidence. The system role explicitly ignores instructions embedded inside them.
- Model tokens are buffered on the server. Only complete chunks that pass `screenForClient()` are sent over SSE. A flagged chunk is replaced with a safe Socratic question.
- Runaway programs are terminated by destroying the Worker at the five-second wall limit; a trace-step ceiling also stops high-step programs.
- Public API spend is bounded by a per-instance request limit, session turn cap, and server-owned output-token cap.

## Local setup

Requires Node 24 and pnpm.

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev
```

Set a server-side API key in `.env.local`:

```dotenv
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-5.6
```

`OPENAI_MODEL` is optional. The server defaults to `process.env.OPENAI_MODEL ?? 'gpt-5.6'`.

## Useful commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm e2e --project=chromium
pnpm e2e:cross-browser
```

The `@live` Playwright smoke is excluded from the default suite so CI never spends API credits. Run it manually against the final deployment before submission.

## Architecture

```text
Browser main thread
  CodeMirror → Zustand session store → localStorage / export
       │                 │
       │ RunRequest      └── quoted TutorRequest → /api/tutor
       ▼                                      │
Pyodide module Worker                         ▼
  compile + sys.settrace              GPT-5.6 stream (server only)
  stdout / error / trace                      │
       │                              sentence/fence buffer
       └── RunResult                           │
                                        deterministic screen
                                               │
                                        screened SSE only
```

The teacher report reads the same local sessions and never requires a backend database. This is intentionally single-browser scope for v0.

## Bundled debugging samples

| Sample | Misconception |
| --- | --- |
| One step too far | off-by-one |
| The vanishing sword | mutation vs copy |
| Three identical counters | closure/scope confusion |
| A search with no answer | loop condition |
| Alice meets Bob’s grades | mutable default argument |
| Numbers wearing quotes | type coercion |

All samples are deterministic and live in `src/features/demo/samples.ts`.

## Verification snapshot

- 84 Vitest unit/integration tests across 16 files
- 7 deterministic Chromium checks pass, including real Pyodide trace fidelity
- A separate real-runtime Chromium smoke confirms Pyodide 314.0.2 returns `IndexError` on line 4 plus a non-empty trace
- Measured real-runtime smoke: 2,395 ms from Run click to visible structured result; 4 ms inside Python for execution plus trace capture
- 93.25% line coverage on the priority logic surface
- 10 adversarial solution-shaped outputs; 0 runnable fixes reach the client fixture
- Guardrail performance test bound: under 5 ms for a 700-token-style response
- ESLint, TypeScript, unit coverage, and the Next.js production build pass locally
- Node 24 is pinned for Vercel; the local build may print an engine warning if run under another Node version

## Deploying to Vercel

1. Import the repository into Vercel.
2. Keep the framework preset as Next.js and Node runtime at 24.
3. Add `OPENAI_API_KEY` to Production and Preview server environment variables.
4. Optionally add `OPENAI_MODEL`; otherwise the app uses `gpt-5.6`.
5. Deploy, then run the live tutor smoke and the three-browser judge-flow smoke.

The CSP in `next.config.ts` deliberately allows only the pinned jsDelivr Pyodide origin plus the narrow WebAssembly/Worker capabilities Pyodide needs.

## Codex collaboration narrative

The product contract, UX specification, and trust-zone plan were prepared before implementation. Codex then built the core application in one primary workspace session: the typed seams, client-only Pyodide runner, real `sys.settrace` capture, buffered server guardrail, GPT-5.6 routes, state persistence, teacher export, Marginalia interface, and acceptance suite. Codex also verified current package/model/runtime identifiers, caught peer-version conflicts, and hardened failure paths for quota exhaustion and CDN/runtime load failure.

The majority of core functionality was built in a single primary Codex session:

> Codex feedback session ID: **`019f6114-370f-7750-854f-c0b7a5cf32a9`**

## Known v0 limits

- Rate limiting is in memory and therefore best-effort across Vercel cold starts/instances.
- Teacher aggregation is intentionally local to one browser.
- JavaScript execution is a stretch goal; Python is the first-class path.
- The post-generation screen is deterministic. It is defense in depth, not a formal proof that every possible natural-language hint is non-spoilery.

## License

MIT
