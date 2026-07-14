# Deploy Runbook — Socratic Code Tutor → Vercel

Copy-paste in order. `SEBASTIEN:` markers are the only steps that touch a secret or push;
everyone else is safe to run ahead of time. Nothing here runs a real deploy — the gated
production step is called out explicitly at the end of Section 2.

## 0. Preflight (this machine, checked 2026-07-14)

- `vercel --version` → **54.14.2**, logged in as `henrysebastien1982-6771` (`vercel whoami` OK).
  Vercel's own CLI update check reports **54.14.5** as latest, not 56.x — update anyway,
  it's a small patch bump and keeps `vercel env`/`vercel link` behavior current:
  ```bash
  pnpm add -g vercel@latest
  vercel --version   # confirm 54.14.5 or newer
  ```
- `gh auth status` → already logged in as `SebAustin`, `repo` + `workflow` scopes present. No `gh auth login` needed.
- **Git identity is not configured** (`git config user.email` returns empty, local and global). Set it before the first commit/push from this machine:
  ```bash
  git config --global user.email "henry.sebastien1982@gmail.com"
  git config --global user.name "Sebastien Henry"
  ```
- No git remote configured yet (`git remote -v` empty). Create the GitHub repo and push:
  ```bash
  cd "/Users/sebastienhenry/Documents/Hackathons/OpenAI Build Week"
  gh repo create socratic-code-tutor --public --source=. --remote=origin --push
  ```
  (MIT `LICENSE` is already committed in-tree, `.gitignore` already excludes `.env*.local` and allowlists `.env.local.example` — confirmed by reading both files, no changes needed before pushing publicly.)

## 1. Vercel project setup

```bash
cd "/Users/sebastienhenry/Documents/Hackathons/OpenAI Build Week"
vercel link          # creates/links the Vercel project, choose scope + accept detected Next.js preset
```

**SEBASTIEN — paste your own key here (never share it with the assistant):**
```bash
vercel env add OPENAI_API_KEY production
# paste your real sk-... key when prompted
vercel env add OPENAI_API_KEY preview
# paste the same (or a separate) key for Preview deployments
```

Optional, only if you want to override the code default (`gpt-5.6`):
```bash
vercel env add OPENAI_MODEL production
```

Runtime/config notes (verified against this repo, not assumed):
- `package.json` pins `"engines": { "node": "24.x" }`. Vercel's current default project Node runtime is 24.x (confirmed via Vercel docs, July 2026), so no dashboard override should be needed — but check **Project Settings → Build and Deployment → Node.js Version** shows `24.x` after `vercel link` creates the project.
- No `vercel.json` exists and none is needed: `next.config.ts` already defines CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` via `headers()`, which Vercel picks up natively from the Next.js build. Both API routes (`src/app/api/health/route.ts`, `src/app/api/tutor/route.ts`) declare `export const runtime = "nodejs"`, matching Fluid Compute's default (no `maxDuration` override needed — a tutor turn finishes well inside the 300s default).

**GATED — do not run until Sebastien explicitly says go:**
```bash
vercel --prod
```

## 2. Post-deploy smoke test

Set `URL` to the printed production URL first: `export URL="https://<your-project>.vercel.app"`

```bash
# 1. Health check — expect HTTP 200 and {"ok":true,...}
curl -sS -o - -w "\nHTTP %{http_code}\n" "$URL/api/health"

# 2. Validation guardrail — oversized code payload, expect 400 (Zod rejects >20000 chars), no tokens spent
python3 -c "print('x'*25000)" > /tmp/oversized_code.txt 2>/dev/null || printf 'x%.0s' {1..25000} > /tmp/oversized_code.txt
curl -sS -o - -w "\nHTTP %{http_code}\n" -X POST "$URL/api/tutor" \
  -H "Content-Type: application/json" \
  --data-binary @<(python3 -c "
import json
with open('/tmp/oversized_code.txt') as f: code = f.read()
print(json.dumps({
  'sessionId': 's1', 'code': code,
  'run': {'stdout': '', 'stderr': '', 'error': None, 'status': 'ok'},
  'traceSummary': '', 'history': [], 'requestedRung': 1, 'lang': 'python'
}))
")

# 3. Rate-limit guardrail — 13 rapid *malformed* (empty-body) requests to /api/tutor, expect the 13th to be 400/429
#    without ever reaching OpenAI (rate limit is checked before body parsing; REQ_PER_MIN = 12/60s per IP)
for i in $(seq 1 13); do
  curl -sS -o /dev/null -w "req $i: HTTP %{http_code}\n" -X POST "$URL/api/tutor" -H "Content-Type: application/json" -d '{}'
done
```
Expect: `/api/health` → 200; step 2 → 400 `{"error":"Invalid tutor request."}`; step 3 → first 12 requests 400 (schema fails on empty body), the 13th flips to 429 with `Retry-After` — proving the per-IP limiter (`REQ_PER_MIN=12`, `src/server/ratelimit.ts`) is live.

**Manual, in the browser (spends real tokens — do once):**
Open `$URL`, click **Try a broken sample →**, press **Run**, then answer/ask for a hint so a real
`/api/tutor` call streams. This is the moment the exact `gpt-5.6` model id gets verified against
the live OpenAI API. Watch the network tab / visible first token:
- If the model resolves: note the time from clicking the hint action to the first visible streamed character (target: comparable to the ~2.4s Run-to-result number already measured for Pyodide in `README.md`).
- If OpenAI 404s the model id: `vercel env rm OPENAI_MODEL production` (if set) then `vercel env add OPENAI_MODEL production` with the corrected dated model id (e.g. `gpt-5.6-YYYY-MM-DD` per OpenAI's model page), then redeploy (`vercel --prod`, gated as above).

## 3. Judge-access verification checklist

- [ ] Open `$URL` in a fresh incognito/private window (no cached session, no login prompt anywhere).
- [ ] Click **Try a broken sample →**, press **Run** — Pyodide loads from jsDelivr and the structured error/trace appears.
- [ ] Trigger a tutor turn — confirm the response streams token-by-token (SSE), not a single blob.
- [ ] View page source / DevTools → Sources: confirm no `OPENAI_API_KEY` string appears anywhere in HTML, JS bundles, or `NEXT_PUBLIC_*` values.
- [ ] Confirm **Teacher view** export works client-side with no network call.
- [ ] Confirm the deployment stays reachable, unauthenticated, through **Aug 5, 2026** (submission Jul 21 → judging close Aug 5) — do not delete the project or let the domain lapse in between; re-check once right after Jul 21 submission and again a day or two before Aug 5.

## 4. Spend guardrails recap

Enforced in code (verified in `src/lib/constants.ts`, `src/server/ratelimit.ts`, `src/app/api/tutor/route.ts`):
- `REQ_PER_MIN = 12` — soft per-IP rate limit, in-memory, resets per cold start/instance (documented v0 gap).
- `MAX_OUTPUT_TOKENS = 700` — passed as `max_completion_tokens` on every OpenAI call, regardless of client input.
- `MAX_TURNS_PER_SESSION = 30` — student-turn cap per session, checked server-side before calling OpenAI.
- Abort-on-disconnect: the route listens for `request.signal` abort and aborts the upstream OpenAI stream via `AbortController`, so a closed browser tab stops token generation immediately.

Not enforced in code (do manually):
- **Set a hard monthly budget cap**: platform.openai.com → **Settings → Limits** (organization usage limits) — set a dollar ceiling comfortably above expected hackathon traffic.
- Check **platform.openai.com → Usage** once during the first day live, and again after the Jul 21 submission spike, to confirm actual spend matches expectations before Aug 5 judging close.

## 5. Rollback / incident response

**Bad deploy (build succeeded but behaves wrong):**
```bash
vercel ls                      # list recent deployments for the project
vercel rollback [deployment-url-or-id]   # instantly point production alias at the previous good deployment
```

**Key abused / rate-limited by OpenAI:**
1. Rotate the key at platform.openai.com (revoke the old one, generate a new one).
2. ```bash
   vercel env rm OPENAI_API_KEY production
   vercel env add OPENAI_API_KEY production   # paste the new key
   ```
3. **GATED** — redeploy to pick up the new env var: `vercel --prod`.
4. Re-run Section 2's smoke test to confirm the new key works before walking away.

---

## README "Deploying to Vercel" section — verification against this runbook

Read `README.md` lines 111-119 against the repo's actual config. Corrections needed (not applied — report only):

1. **Missing CLI path.** README only describes dashboard import ("Import the repository into Vercel"). It never mentions `vercel link` / `vercel env add` / `vercel --prod`, which is the path this runbook and the CLI already logged in on this machine actually use. Not wrong, just incomplete — add a CLI-equivalent subsection so a judge or teammate without dashboard access can deploy the same way.
2. **No mention of `/api/health` in the smoke test step.** README step 5 says "run the live tutor smoke and the three-browser judge-flow smoke" but never references hitting `/api/health` first, even though the route exists and DEPLOYMENT_CONTEXT.md's rollout checklist explicitly calls for a health check. Add it.
3. **No mention of the rate-limit/validation smoke test.** Nothing in README verifies `REQ_PER_MIN` or Zod validation post-deploy without spending tokens — this runbook's Section 2 step 2/3 fills that gap; worth a one-line pointer from README to this file.
4. **"Node runtime at 24" is correct, not a bug** — confirmed current Vercel default is Node 24.x LTS as of July 2026, matching `package.json`'s `"engines": {"node": "24.x"}`. No change needed there.
5. Everything else checked (CSP ownership by `next.config.ts`, no `vercel.json` needed, `OPENAI_API_KEY`/`OPENAI_MODEL` env var names and defaults, MIT license, no-login/no-database claims) matches the actual code — no other corrections found.
