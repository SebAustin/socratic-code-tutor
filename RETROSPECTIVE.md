# RETROSPECTIVE — Socratic Code Tutor (OpenAI Build Week, Education)

Date: 2026-07-14 · Blameless. One day, brief → accepted deployment. Verdict: **ACCEPTED**
(SOLID 97/100 + live production verified). See `ACCEPTANCE.md`.

## 1. How it went (metrics)

| Phase | Result | Evidence |
|---|---|---|
| Plan loop | PASS **94/100 on iteration 2** (iter-1 81 — critical: guardrail-vs-streaming contradiction the architect hand-waved) | `PLAN.md` Revision Log v2 (D1) |
| Build | Executed in **OpenAI Codex / GPT-5.6** via a paste-ready playbook, not built directly | `CODEX_PLAYBOOK.md` |
| Incident | Codex built the whole 19-WP MVP unprompted, then WP-1 "scaffold" prompt made it **delete the MVP**; nothing committed. Recovered byte-identical from Codex's own session log | commit `e0e572b` |
| Review | 4 parallel reviewers (ts, react, security, verifier) → **FIX 74/100**, 2 reproduced guardrail bypasses + cost-abuse holes → one consolidated `FIX_ROUND_1.md` → **one round → SOLID 97/100** (round-2 verifier re-ran the bypass strings) | `FIX_ROUND_1.md`, `SECURITY.md` |
| Ship | Gated `DEPLOY_RUNBOOK.md`, `SUBMISSION_PACK.md`, live judge-flow verified in browser | `ACCEPTANCE.md` |

Success criteria: **8/9 MET**; only SC-7 (public video) pending on the owner. No defect escaped
past the round it should have been caught in once the review loop ran.

## 2. What went well
- **Plan-critic earned its seat.** It caught a genuine two-NFR contradiction (FR-14 "screen
  before display" vs NFR-2 "first token < 2s") the architect had glossed; the fix (server-buffered
  progressive-reveal, ASSUMPTIONS #8) became the product's core invariant.
- **Parallel-4 fan-in → single consolidated fix prompt → one round to SOLID.** Heavy overlap
  between reviewers acted as a confidence signal; consolidation into one ordered A→E prompt let
  Codex fix ~30 items in a single commit with no thrash.
- **Verifier reproduced, didn't read.** It ran the two bypass strings against shipped code
  (FIX_ROUND_1 A1) and re-ran them after the fix — the difference between "looks fixed" and "is
  fixed".
- **Fast recovery from a catastrophic delete** with zero committed work, via the external agent's
  local session log.

## 3. What was hard — root causes (process, not people)
- **R1 — Third-party-agent handoff had no idempotency/commit contract.** The playbook assumed a
  cold, empty repo and Codex overshot (built everything), so a literal "WP-1 scaffold" prompt was
  destructive. Root cause: the playbook lacked (a) an "obsolete if the agent already built ahead"
  clause and (b) a commit-after-every-turn rule in its *own* instructions. Uncommitted work had no
  floor.
- **R2 — Orchestrator fanned out reviewers against a tree another agent was mid-mutation on.**
  4 reviewers launched against the half-deleted tree and were killed mid-flight — wasted cycles.
  No "write-lock" discipline for external-agent turns.
- **R3 — Contradicting-NFR class of defect only caught at plan-critic, not at architecture time.**
  Two constraints on the same data path can't both hold, but nothing forced the architect to prove
  co-satisfaction before scoring.

## 4. Proposed skill/prompt updates (numbered, reviewable — NONE applied yet)

Each: target file · exact additive change · motivating evidence. Additive only; nothing weakens a
guardrail or lowers a bar.

**P1 — Third-party-agent build handoff protocol** (answers *a*)
· Target: `~/.claude/skills/agency-orchestration/SKILL.md`, new subsection after Workflow step 3.
· Add: *"### External build-agent handoffs (Codex/Cursor/other AI agents). When the build is
executed by a third-party agent from a playbook: (1) The playbook's own instructions MUST require
`git commit` after every turn with the exact conventional message — uncommitted work has no floor.
(2) The playbook MUST open with an idempotency/overshoot clause: 'If the agent has already built
ahead of this step, treat later scaffold/setup prompts as OBSOLETE — reconcile against the existing
tree, never recreate or delete.' (3) The orchestrator holds a single logical write-lock on the
tree: NEVER launch reviewers/verifiers against a tree while an agent is mid-mutation; wait for a
committed, quiescent SHA. (4) Before the first destructive-capable prompt, snapshot (commit or
branch) the current tree."*
· Evidence: R1, R2; commit `e0e572b` recovery; 4 reviewers killed mid-flight.

**P2 — Playbook-authoring rule in the same skill** (answers *a*)
· Target: `agency-orchestration/SKILL.md`, Guardrails list.
· Add bullet: *"Playbooks/handoff kits for an external agent are executable artifacts: every step
is idempotent and self-describes its precondition (what must/must not already exist); a
'scaffold/init' step must be a no-op or reconcile when the target already exists, never a
recreate-from-scratch that can clobber prior work."*
· Evidence: WP-1 "Scaffold the project" obeyed literally → MVP deleted.

**P3 — NFR-pair consistency check at plan time** (answers *b*)
· Target: `~/.claude/skills/plan-rubric/SKILL.md`, Criterion guidance.
· Add: *"Architecture soundness '5' also requires: when two NFRs or a guardrail + a latency/UX
budget constrain the **same data path** (e.g. 'screen text before display' vs 'first token < 2s'),
the plan must show a single design on which both co-hold, or explicitly reconcile them with a
named trade-off. An unreconciled contradicting-constraint pair caps Architecture soundness at 3."*
· Companion tip to `~/.claude/agents/plan-critic.md`: *"Actively hunt for two requirements that
constrain the same path and cannot both hold at once; a hand-waved 'streaming + screen-before-
display' style pair is a REVISE, not a rounding detail."*
· Evidence: iter-1 81 → the single critical defect was exactly this pair (PLAN.md D1).

**P4 — "Reproduce, don't just read" for security-class findings** (answers *c*)
· Target: `~/.claude/skills/solution-rubric/SKILL.md`, Security criterion guidance; mirror into
`~/.claude/agents/solution-verifier.md`.
· Add: *"Security-class findings (guardrail bypass, injection, authz, cost-abuse) are scored from
**reproduction**, not code reading: run the actual exploit input to confirm the vuln, and re-run
the same input after the claimed fix to confirm closure. A finding marked fixed on the strength of
a diff alone does NOT count toward a clean Security score."*
· Evidence: verifier reproduced both bypass strings (FIX_ROUND_1 A1) and re-ran them at round 2 →
SOLID 97; reading the patch alone would have missed the per-line-flush gap (A2).

**P5 — Standardize parallel-fan-in → single-consolidated-fix** (answers *d*)
· Target: `agency-orchestration/SKILL.md`, Workflow step 3.
· Add: *"On a FIX verdict, run independent reviewers in parallel (language/framework + security +
verifier); treat overlapping findings as a confidence signal, then **consolidate all findings into
one ordered fix prompt** (severity-grouped A→E, 'increase total test count, weaken no acceptance
criterion, keep all tests green') dispatched as a single build round. Prefer one consolidated round
over serial per-reviewer patches — it avoids thrash and re-review churn."*
· Evidence: 4 reviewers → one `FIX_ROUND_1.md` → one commit `11b777d` → SOLID.

**P6 — Gotcha: recover external-agent work from its session log** (answers *e*, reusable)
· Target: `agency-orchestration/SKILL.md`, new `## Gotchas` section.
· Add: *"If an external build-agent destroys uncommitted work, its local session log usually holds
every applied patch. For Codex: `~/.codex/sessions/.../rollout-*.jsonl` contains each `apply_patch`;
an in-session restore prompt can rebuild byte-identical from the agent's own record. Check for a
session/rollout log before treating uncommitted work as lost — but this is recovery, not a
substitute for the commit-after-every-turn rule (P1)."*
· Evidence: byte-identical rebuild, commit `e0e572b`.

## 5. One-off vs. reusable (answers *e*)
- **Reusable:** P1–P6 above; session-log recovery as a general technique; the
  fan-in→consolidate→one-round build cadence; the reproduce-don't-read verifier stance.
- **One-off (stays here, not generalized):** the specific Codex overshoot behavior, `gpt-5.6`
  model-id config, Pyodide/CSP exception, Education-track authenticity framing, and the
  hackathon's "build must happen in a rival agent" constraint. Do not encode hackathon-specific
  facts into shared skills.

## 6. Approval gate
None of P1–P6 is applied. They await the owner's explicit, per-item approval; approved items land
on a feature branch and in `SKILL-UPDATES.md` only — never auto-merged to shared skills. Nothing
here weakens a guardrail or lowers a quality bar.

## 7. Addendum — post-acceptance polish round (Jul 15)

Recorded after the original retrospective; same blameless lens, three small lessons.

- **CI broke twice after acceptance, both from outside the app's code.** (1) Committing the
  demo-video tooling put plain-Node CJS scripts inside the app's `eslint .` surface — fixed by
  scoping lint ignores to the app (`demo-video/**`, local editor dirs). (2) npm retired its legacy
  audit endpoint (HTTP 410), silently breaking `pnpm audit` in CI for every push regardless of
  code; replaced with a pinned OSV-Scanner reading `pnpm-lock.yaml`, verified locally before the
  CI change. Lesson: *a green gate can rot from third-party API retirement alone — when CI fails
  on a docs-only commit, suspect the gate, not the diff.*
- **README architecture diagram rebuilt for legibility — and mermaid ultimately replaced.**
  The first mermaid diagram used `\n` in node labels (GitHub renders those literally), declared a
  cross-zone edge inside the wrong subgraph, and gave the guardrail no visual emphasis. A
  GitHub-compatible mermaid rewrite fixed rendering, but theming limits capped the quality, so the
  final iteration replaced mermaid entirely with a **hand-crafted SVG in the react.dev
  documentation style**: dark slate canvas (#23272F), rounded cards, cyan (#61DAFB) zone headers
  and flow accents, color-coded trust zones, the `screen()` gate in accent orange as the visual
  centerpiece, and label backplates so no text crosses an arrow. Verified by rendering with
  Playwright chromium and inspecting the pixels before pushing. Lessons: *diagrams are judged
  artifacts — render-check them on the actual host; and past a certain polish bar, a committed
  SVG beats fighting a renderer's theming limits.*

  **Owner-approved standard (record for future projects — proposal P7):** the owner explicitly
  approved this style as the house look for architecture diagrams. Target:
  `agency-orchestration/SKILL.md` (or the architect/doc-writer prompts), add: *"Architecture
  diagrams in judged/public READMEs are hand-crafted SVGs in the react.dev documentation style —
  dark #23272F canvas, rounded cards, #61DAFB accents, color-coded trust zones, the security
  boundary as the visual centerpiece, label backplates, self-contained (system fonts, no external
  resources) — committed under docs/images/ and pixel-verified via a headless-browser screenshot
  before pushing. Mermaid remains acceptable for internal/working docs only."* Like P1–P6, this
  awaits explicit application to shared skills; recorded here as an approved preference.
- **Repo hygiene as a final pass:** submission logistics and video tooling were untracked
  (kept locally, gitignored) so the public repo reads as product + evidence only — while
  everything cited by the README or the Devpost text (playbook, fix round, plan, specs) stayed
  public as proof of the build story.
