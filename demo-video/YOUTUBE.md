# YouTube upload metadata — Socratic Code Tutor demo

Draft only. Nothing here has been posted. Fill in any bracketed items, review the
video one more time, then follow the upload steps at the bottom.

## Title (52 chars, limit 70)

```
Socratic Code Tutor — It Won't Give You the Answer
```

Alternate (58 chars) if the above feels too cute for the judges:

```
Socratic Code Tutor: an AI tutor that refuses to fix your code
```

## Description

```
Socratic Code Tutor never hands a student the fixed line — it asks the
question that gets them there themselves.

A student pastes or picks a buggy Python sample, runs it against a real
Pyodide interpreter in the browser (no student code ever touches a server),
and gets a structured traceback plus a step-through execution trace of real
variable state, captured live from Python's own sys.settrace. GPT-5.6 tutors
through a visible four-rung hint ladder — conceptual question, localization,
mechanism, near-solution scaffold — that is structurally blocked from ever
reaching "here's the fixed code": every reply is screened server-side, after
generation and before it's shown, so the no-solution rule holds even if a
reply drifts. Each session is tagged with a misconception category, and a
teacher view aggregates those tags across a class with export to JSON or
Markdown. No login, no database — it runs from the browser and Vercel.

The product contract and UX spec were written before any code. OpenAI Codex,
driving GPT-5.6, then implemented the core application — the sandboxed
Pyodide runner, the trace capture, the buffered guardrail pipeline, the hint
ladder, and the teacher export — in one continuous session. GPT-5.6 does two
jobs in the finished product: it's the model Codex used to write the code,
and it's the model generating every tutor turn and misconception tag live,
in production, right now.

Live demo: https://socratic-code-tutor.vercel.app
Source code: https://github.com/SebAustin/socratic-code-tutor

OpenAI Build Week — Education Track.
Built with OpenAI Codex + GPT-5.6, Next.js, TypeScript, Pyodide/WebAssembly,
CodeMirror 6, Zustand.

Timestamps:
0:00 Title
0:04 The problem: answer-first help skips the learning
0:20 Live run — real Pyodide, real traceback
0:40 The hint ladder: escalating, never the fix
1:12 Execution trace — real sys.settrace, not a simulation
1:32 Teacher view — misconceptions aggregated across a class
1:57 How it was built: Codex + GPT-5.6
2:31 Close
```

## Tags

```
socratic code tutor, openai build week, openai codex, gpt-5.6, ai coding tutor,
python debugging, pyodide, webassembly, education technology, ai pair programming,
hint ladder, socratic method, code tutor ai, learn to code, cs education,
next.js, typescript, ai tutoring system, edtech hackathon, devpost
```

## Upload steps

1. Go to https://www.youtube.com/upload (or youtube.com -> Create -> Upload video).
2. Select `demo-video/out/socratic-code-tutor-demo.mp4`.
3. Paste the **Title** from above (use the primary or alternate — pick one).
4. Paste the **Description** from above (fill in timestamps if YouTube doesn't
   auto-link them; edit the "Codex feedback session ID" line in the repo README
   first if that field is still a placeholder, since judges may click through).
5. Paste the **Tags** (comma-separated list above) into the tags field under
   "Show more".
6. Thumbnail: use `demo-video/frames/spot-03-60pct.png` (rung-4 hint moment /
   teacher view) or let YouTube auto-generate one, then pick the frame closest
   to the "It won't give you the answer" beat.
7. Playlist / audience: mark "No, it's not made for kids" (standard for a dev
   demo) unless your channel policy differs.
8. Visibility: set to **Public** (required so judges can view without a login).
9. Publish, then copy the resulting video URL.
10. Paste that URL into the Devpost submission form's video field, and update
    `SUBMISSION_PACK.md` / the README's `[YouTube URL]` placeholder with the
    same link.
