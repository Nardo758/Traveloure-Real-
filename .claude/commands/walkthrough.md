---
description: Run one autonomous persona walkthrough of the live app, judge every screen against the ratified oracle, and file/draft findings by class. Read-only against the app; never merges; never fixes without a ruling.
argument-hint: "next | guest | traveler | trip-pass | plus | expert | provider | admin"
allowed-tools: Bash, Read, Grep, Glob, Write, Edit
---

Invoke the **walkthrough** skill and run one persona walk.

Argument: `$ARGUMENTS`
- empty or `next` → the matrix row **after the last committed report** in
  `docs/testing/walkthroughs/` (rotation is state-in-repo).
- a persona name (`guest`, `traveler`, `trip-pass`, `plus`, `expert`, `provider`, `admin`)
  → that row from `docs/testing/WALKTHROUGH_MATRIX.md`.

Follow `.claude/skills/walkthrough/SKILL.md` exactly:

1. **Load the oracle first** — `docs/DECISIONS.md`, `CLAUDE.md`, the mocks in
   `docs/design/*.html` + their `docs/design/mock-audits/*.audit.md` briefs, the grammar
   specs, `docs/testing/PERSONA_JOURNEYS.md`, and `docs/testing/WALKTHROUGH_MATRIX.md`.
2. **Pick the row** for `$ARGUMENTS`.
3. **Walk the goal** with Playwright/Chromium against the running dev server — act as the
   persona, screenshot every step, READ each screenshot before the next action.
4. **Judge** each screen on honesty (§13), grammar, behavior, judgment.
5. **Record findings** — every finding carries its screenshot, the oracle citation, a
   `file:line` hypothesis, and a severity.
6. **Report** to `docs/testing/walkthroughs/<YYYY-MM-DD>-<persona>.md` and commit it.
7. **Dispose by class** — BUG/DESIGN may open a **draft** fix PR (one finding + a
   regression test, ruling cited, **never merged**); SPEC-GAP/JUDGMENT are filed as issues
   for the decision-maker, **never auto-fixed**.

THE LINE: read-only against the app; booking stops at the confirm step; never runs against
production; never merges; never fixes anything that lacks a ratified ruling. On exceeding
the row's turn budget, commit the partial report with a `STALLED` marker and exit.

Ruling `2026-08-30-autonomous-walkthroughs`.
