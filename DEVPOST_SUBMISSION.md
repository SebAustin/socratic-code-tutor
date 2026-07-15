# Devpost Submission Dossier — copy-paste per form field

Form: openai.devpost.com → "Enter a submission". Deadline: **Tue Jul 21, 2026, 5:00 PM PT**.
Everything below is final except ONE placeholder: the YouTube URL (fill after upload).

## Project name
```
Socratic Code Tutor
```

## Elevator pitch / tagline
```
Debug it yourself. We'll only ask questions.
```

## Category / track
**Education**

## Demo video URL
`[YOUTUBE URL — upload demo-video/out/socratic-code-tutor-demo.mp4 per demo-video/YOUTUBE.md, visibility PUBLIC, then paste the watch link here]`

## Code repository URL
```
https://github.com/SebAustin/socratic-code-tutor
```
(Public, MIT license in the tree — satisfies the "public with relevant licensing" rule.)

## Codex /feedback session ID
```
019f6114-370f-7750-854f-c0b7a5cf32a9
```
(Also recorded in the README's "Codex collaboration narrative" section.)

## Try it out / testing instructions
```
Live demo (no login, free to test): https://socratic-code-tutor.vercel.app

Fastest judge path (~90 seconds):
1. Click "Try a broken sample" — the off-by-one sample loads.
2. Click Run (or Cmd/Ctrl+Enter): the code executes in a real in-browser Python
   (Pyodide); a structured IndexError traceback appears.
3. The GPT-5.6 tutor responds with a question — never the fix. Click
   "I'm stuck — hint" to climb the 4-rung hint ladder; rung 4 is still not code.
4. Open the Trace tab: scrub real sys.settrace execution steps and watch
   variable state change.
5. Click "Teacher view →" (top right): aggregated misconception ledger with
   JSON/Markdown export.

Notes for testers: per-IP rate limit is 12 tutor requests/min (abuse protection
on a public demo). Local setup: clone the repo, pnpm install, add OPENAI_API_KEY
to .env.local, pnpm dev — full steps and sample data in the README.
```

## Project story (main description)
Use SUBMISSION_PACK.md §2 verbatim — the sections map 1:1 to Devpost's fields:
Inspiration / What it does / How we built it / Challenges / Accomplishments /
What we learned / What's next. (~450 words, all claims anchored to the repo.)

## Built with (tags)
```
next.js, typescript, vercel, openai, gpt-5.6, codex, pyodide, webassembly,
codemirror, zustand, vitest, playwright
```

## Image gallery (optional but recommended)
Upload these four (already on disk, 1920×1080):
- demo-video/frames/spot-02-25pct.png — live traceback + Socratic hint (the money shot)
- demo-video/frames/spot-03-60pct.png — teacher misconception ledger
- demo-video/frames/spot-01-start.png — title card
- demo-video/frames/spot-04-closing.png — closing card with URLs

## Pre-submit checklist (final pass)
- [ ] Video uploaded to YouTube, visibility **Public**, plays with audio, <3:00
- [ ] Video URL pasted above AND into the form
- [ ] Repo still public; live URL responds (check morning of submission)
- [ ] Category = Education selected
- [ ] /feedback ID pasted into its form field
- [ ] Submit — then do NOT edit the project until judging ends (Aug 5)

## Facts bank (if a form field asks for specifics)
- Verified test state at submission: 84/84 unit/integration tests (16 files),
  7/7 Playwright e2e incl. real-Pyodide runtime spec; independent verifier score 97/100 (ACCEPTANCE.md).
- Built during Submission Period: full dated commit history Jul 14, 2026
  (docs → restore → fix round → acceptance), majority of core functionality in
  the single Codex session above.
- Team: solo — Sebastien Henry (Devpost account = submitter/Representative).
