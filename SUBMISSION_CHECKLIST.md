# Submission Checklist — OpenAI Build Week

Deadline: **Tuesday, July 21, 2026, 5:00 PM PT** (submit on openai.devpost.com).
Category: **Education**. Each item maps to a line in the Official Rules — do not skip any.

## Hard deadlines
- [ ] **Fri Jul 17, 12:00 PM PT** — request $100 Codex credits: https://forms.gle/Ncu6iGkaHq1SwUmEA (must be registered on Devpost first; credits expire Jul 31)
- [ ] Registered on openai.devpost.com ("Join Hackathon")
- [ ] **Tue Jul 21, 5:00 PM PT** — submission complete on Devpost (aim for Jul 20 evening; the form takes ~30 min)

## Build evidence (Stage-1 pass/fail + Technological Implementation)
- [ ] Majority of core functionality built in ONE primary Codex session (WP-1..WP-12 per CODEX_PLAYBOOK.md)
- [ ] `/feedback` run in that primary Codex session — **session ID saved** and pasted into the submission form
- [ ] Commit history is dated within the Submission Period (Jul 13–21) — already satisfied by committing per work package
- [ ] App calls model `gpt-5.6` (verifiable in code + README)

## Working project (Design + Functionality)
- [ ] All tests green in CI (lint, typecheck, unit, Playwright e2e on chromium)
- [ ] Deployed Vercel URL live, no login required, stays up through **Aug 5** (end of judging)
- [ ] Judge path works end-to-end: land → one click to a demo sample → run → tutor conversation → hint ladder → trace view → teacher report
- [ ] Rate limiting + token caps active on the public demo (credit-drain protection)

## Repository
- [ ] Repo public on GitHub **with a LICENSE file (MIT)** — or private and shared with testing@devpost.com AND build-week-event@openai.com
- [ ] README includes: setup instructions, `.env` example, sample data note, and the **Codex + GPT-5.6 collaboration narrative** (where Codex accelerated work, where key decisions were made — judges score this)
- [ ] `git config user.email` set to your GitHub email before pushing (currently machine-local identity)

## Demo video (required format)
- [ ] Under 3 minutes
- [ ] Audio voiceover explicitly covers BOTH: what you built with **Codex** AND how **GPT-5.6** is used
- [ ] Shows the project actually working (real run, real tutor conversation)
- [ ] No third-party trademarks or copyrighted music
- [ ] Uploaded to YouTube, visibility **public**, link pasted in submission form

## Devpost form fields
- [ ] Project name + text description (features and functionality)
- [ ] Category: Education
- [ ] YouTube URL
- [ ] Repo URL
- [ ] Codex /feedback session ID
- [ ] Testing instructions incl. the live demo URL

## Nice-to-have (score protection)
- [ ] README "Try it in 60 seconds" section for judges
- [ ] Screenshots in the Devpost gallery
- [ ] Impact paragraph names the specific audience (intro CS students, TAs/teachers) and the mechanism (guardrailed hints ≠ answer-giving)
