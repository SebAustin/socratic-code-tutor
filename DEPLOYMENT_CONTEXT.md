# Deployment Context — Socratic Code Tutor

Intake notes for deployment/rollout. See `ASSUMPTIONS.md` for build-time assumptions this depends on (#5 deploy target, #7 public repo).

## 1. Target Platform

- **Vercel**, Fluid Compute default (no special config needed for a standard Next.js App Router project).
- Node **24** default runtime for route handlers — to-verify at first deploy that the account's default Node version matches; pin via `"engines"` in `package.json` if it drifts.
- Route handler (`app/api/tutor/route.ts` or similar) streams the OpenAI response (SSE / `ReadableStream`) back to the client — Fluid Compute's 300s default function timeout is far more than needed for a chat turn; no timeout config required.
- No `vercel.json` needed for a standard app. If routing/headers config becomes necessary (e.g., custom CSP headers, redirects), add `vercel.json` (or `next.config.ts` `headers()`) at that point rather than pre-building it now.

## 2. Environment / Config Matrix

| Var | Required | Scope | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | Yes | Server-only | Never referenced in any client component / `"use client"` file / `NEXT_PUBLIC_*` var. Read only inside the route handler. |
| `OPENAI_MODEL` | No | Server-only | Optional override; defaults to `gpt-5.6` in code so judges/local dev need zero config beyond the key. |

- **Local dev:** `.env.local` (gitignored) with `OPENAI_API_KEY=...`. Document `.env.local.example` with the two vars (no real values) since repo is public.
- **Vercel:** set via `vercel env add OPENAI_API_KEY production` (and `preview`/`development` as needed) or the dashboard. Do not commit any `.env*` file with a real key.
- Public-repo risk: double-check `.gitignore` covers `.env*.local` before first push (rule already flags this in security checklist).

## 3. Pyodide Delivery

**Recommendation: load Pyodide from the jsDelivr CDN (`cdn.jsdelivr.net/pyodide/v<version>/full/pyodide.js`), not self-hosted**, for v0/hackathon scope:

- Self-hosting means shipping/serving 10MB+ of wasm+data through Vercel's asset pipeline and counting against the frontend bundle budget — not worth it for a 1-week build.
- jsDelivr already sets correct CORS + wasm MIME types and is what Pyodide's own docs point to for worker usage.
- Latest stable line observed at intake time is Pyodide v0.26.x (jsDelivr also lists a `v314.0.2` "full" build path — **to-verify which is the actual current stable release tag before pinning**; do not use a `latest`-style floating tag, pin an exact version for reproducibility).
- **Pin the exact version string** used in the `<script src>` / dynamic import so a judge's demo doesn't silently break if Pyodide ships a breaking release mid-event.
- Run Pyodide in a Web Worker (recommended by Pyodide docs) to keep the main thread responsive for the Socratic chat UI while code executes.
- **CSP implications:** Pyodide needs `wasm-unsafe-eval` (or `unsafe-eval` on older CSP syntax) in `script-src`, plus `worker-src 'self' blob:` for the worker, plus `connect-src` allowing `https://cdn.jsdelivr.net` (for fetching the wasm/data files) and `script-src https://cdn.jsdelivr.net`. This must be reflected in the project's CSP config (see `web/security.md` house rule) — flag as a required deviation from the "no unsafe-eval" default, scoped narrowly to the Pyodide worker context if possible.
- First-load UX: Pyodide init (~1-3s+ download/compile) should show a loading state; consider a `<link rel="preconnect">` to `cdn.jsdelivr.net` and lazy-init Pyodide on first "Run" click rather than on page load, to keep initial LCP clean per performance targets.

## 4. Judge Access Plan

- Production Vercel URL must stay live and reachable **without login** from submission (Tue Jul 21, 5PM PT) through judging close (Aug 5 2026).
- Bundle sample buggy Python programs in-repo (e.g., `samples/*.py` or a TS constant) so judges can test with one click, no upload required.
- **Spend guardrails on the API route** (public demo + public repo = anyone can hit it):
  - Per-IP soft rate limit on the tutor route (e.g., N requests/minute via an in-memory or edge-config counter — no DB in v0, so a simple in-memory LRU per Vercel instance is an acceptable stopgap; note it resets per cold start / isn't cross-instance-consistent, document as a known gap).
  - Cap `max_output_tokens` (or equivalent) per request server-side regardless of what the client requests.
  - Consider a max conversation-turns cap per session to bound total spend per interaction.
  - Log request volume/cost signals (see observability in rollout checklist) so abuse is visible quickly.
- **If the key is abused / rate-limited by OpenAI:** rotate the key in the OpenAI dashboard, update `OPENAI_API_KEY` in Vercel env, redeploy (env var change requires a redeploy or Vercel's env-var-only redeploy path) — keep this as a documented 5-minute recovery step, not a fire drill.

## 5. Demo / Recording Needs

- Bundled sample programs must be **stable and deterministic** (same bug, same Socratic path) for repeatable recordings — avoid samples whose failure mode depends on timing/randomness unless intentional.
- Provide a visible **"Reset session"** action that clears localStorage state and Pyodide runtime state in one click, so a clean take can be re-recorded without a full page reload losing the loaded Pyodide runtime unnecessarily (or, if reload is simpler/safer, make sure reload is fast — Pyodide already cached by the browser after first load).

## 6. Rollout Checklist (stub — complete at deploy phase)

- [ ] Vercel project created and linked to GitHub repo (`vercel link`)
- [ ] `OPENAI_API_KEY` (and optional `OPENAI_MODEL`) set for Production + Preview envs via `vercel env`
- [ ] `.env.local.example` committed; real `.env.local` confirmed gitignored
- [ ] Smoke test script/checklist run against the deployed URL: load page → paste sample buggy code → run in Pyodide → get streamed Socratic response → reset session
- [ ] Health check: a trivial `/api/health` route or equivalent, or rely on the tutor route's own 200 for uptime checks through Aug 5
- [ ] Rate limit / token cap verified live (not just in code) before sharing URL with judges
- [ ] Custom domain — optional, not required for judging; default `*.vercel.app` URL is sufficient
- [ ] Confirm production URL responds correctly after Jul 21 submission and spot-check again before Aug 5 judging close

## 7. Risks / Unknowns (with working defaults)

| Risk/Unknown | Default assumption | Verify when |
|---|---|---|
| Exact `gpt-5.6` API model id string | Use literal `gpt-5.6` in `OPENAI_MODEL` default; if the API rejects it, the fix is a one-line constant change | First real API call during build |
| Node 24 as Vercel's actual default | Assume yes; Vercel Node version can drift by account/project settings | First deploy — check Vercel dashboard project settings |
| Current stable Pyodide version tag (0.26.x vs. a newer major line) | Pin whatever exact version is confirmed stable at build time; avoid floating `latest` | Before first Pyodide integration commit |
| In-memory per-IP rate limiter surviving Vercel's multi-instance/cold-start model | Accept it as a soft, best-effort guardrail for v0, not a hard cap | If abuse is observed, escalate to a real store (e.g., Vercel KV) — out of scope for v0 |
| CSP `wasm-unsafe-eval` + jsDelivr allowlist interacting with any other third-party scripts | Assume Pyodide + OpenAI SDK are the only external origins needed | When CSP header is actually authored, cross-check against `web/security.md` house CSP template |
