# Assumptions Log

Documented assumptions made by the agency while running autonomously. Each entry: what we assumed, why, and the risk if wrong.

| # | Date | Assumption | Rationale | Risk if wrong |
|---|------|-----------|-----------|---------------|
| 1 | 2026-07-14 | Track = **Education**; project = Socratic code tutor. | Confirmed by Sebastien via plan-mode Q&A. | — (user-confirmed) |
| 2 | 2026-07-14 | Split of labor: Claude agency plans/reviews/documents; **core functionality is implemented in Codex sessions with GPT-5.6** driven by Sebastien, per hackathon rules (Codex `/feedback` session ID required). | Confirmed by Sebastien. Judging criterion #1 scores Codex usage. | — (user-confirmed) |
| 3 | 2026-07-14 | v0 languages supported: **Python (Pyodide)** first-class incl. execution trace; JavaScript (sandboxed Worker) secondary, may slip to stretch. | Python dominates CS education; one deep language beats two shallow ones in a 3-min demo. | If judges test JS-only code, experience degrades — mitigated by clear language selector and bundled samples. |
| 4 | 2026-07-14 | No database in v0; sessions in localStorage, teacher report exported as file/shareable JSON. | 7-day timeline; DB adds setup friction for judges. | Multi-device teacher aggregation impossible in v0 — acceptable, documented as roadmap. |
| 5 | 2026-07-14 | Deploy target: **Vercel** (hosted demo instance for judges) with `OPENAI_API_KEY` server-side; the model id used is `gpt-5.6`. | Vercel is the fastest judge-testable path for Next.js; rules require a working hosted demo or test build. | If GPT-5.6 API model id differs (e.g. dated suffix), config is a single env/constant change — verified during build. |
| 6 | 2026-07-14 | Sebastien holds an OpenAI account and will request the $100 Codex credits **before Fri Jul 17, 12:00 PM PT**. | Stated in the rules; flagged in SUBMISSION_CHECKLIST.md. | Build stalls on credits — personal API key as fallback (costs borne by entrant). |
| 7 | 2026-07-14 | Repo will be made **public** on GitHub at submission time (simplest judge access), MIT license. | Rules allow public-with-license or private-shared; public is lower-friction. | If Sebastien prefers private, share with testing@devpost.com and build-week-event@openai.com instead. |
| 8 | 2026-07-14 | **NFR-2 reinterpreted**: "first token < 2s" becomes "first *visible* screened chunk < 3s (model first-token < 2s still measured)". | The no-solution guardrail (FR-14) requires screening text before display; a server-buffered progressive-reveal pipeline is the only design satisfying both, at the cost of ~1s perceived latency. Per PLAN.md v2 §1, critic-approved. | Slightly slower perceived response; acceptable trade for the guarantee that no unscreened text ever reaches a student. |
