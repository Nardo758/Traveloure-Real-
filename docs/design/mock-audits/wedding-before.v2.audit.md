# `Before.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Before.dc.html` ("Today · Moments section · main @ 0437692f · seven keys, none of them a wedding")
**Live surface:** `server/services/landing-moments.ts` (`MOMENTS`), `client/src/components/landing/moments-section.tsx`, `client/src/components/landing/moments-slot.tsx`
**Repo state audited:** `origin/main` @ `fcbc1d097` (merge of #764), 2026-09-04
**Authority:** ledger `2026-09-04-wedding-landing-moment` > the artboard. This artboard is a **dated baseline**, not a target: it draws the roster *before* the Wedding moment existed.
**v1 brief:** `wedding-before.audit.md` (1 divergence: live render is empty — the ruled §13 photo gate).

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Eyebrow "Plan the moment · not just the trip"; H2 "Some trips are really one evening." | `client/src/components/landing/moments-section.tsx:120`–`126` (section chrome + `link-all-occasions`) | MATCH | Section header + the "All occasions →" link are present with the artboard's own words. |
| 2 | Seven tabs, **no Wedding**: Proposal, Golf trip, Girls' trip, Anniversary, Honeymoon, Milestone birthday, Family occasion | `server/services/landing-moments.ts:55,72,86,104,118,134,151,168` | **ALREADY-RULED — artboard superseded** | The roster now holds **eight** keys with `wedding` FIRST (`landing-moments.ts:55`). That is exactly what `Main.dc.html` ratifies and what ledger `2026-09-04-wedding-landing-moment` landed. This artboard is the "today" half of a before/after pair and is now the stale one. Do not audit toward it. |
| 3 | Active card = Anniversary ("An anniversary in Porto", @portobyines) | `landing-moments.ts:118`–`133` | MATCH (as a row) — position moved | The anniversary row still exists with its own copy; it is no longer index 0 because Wedding leads. Roster order IS active-by-default order (`landing-moments.ts:46`–`48`). |
| 4 | The card renders at all (photo, builder byline, three numbered pieces, "Plan this moment") | `moments-section.tsx:195`–`226` | **ALREADY-RULED (§13 photo gate)** | Structure matches. The *live* Moments section still renders **empty** in production because a moment goes live only when its city has ≥1 attributed real (non-stock) expert-curated photo, and Kyoto/Porto have none. `moments-slot.tsx` falls back to `ExperiencesRail`. Unchanged from the v1 brief; correct as is. |
| 5 | "Plan this moment" is the one planning opener on the section | `moments-section.tsx:209`–`218` | MATCH | `open({ branch:"ai", experienceType, experienceSlug, momentKey })` — one opener, ruling `2026-08-28-single-planning-entry` upheld. |

## Classification

- **(A) contained:** none.
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** #2 (this artboard is a superseded baseline — `Main.dc.html` is the target), #4 (photo gate empty state).

**Not verifiable without a running server:** whether the production photo gate now passes for any market (this is a data question, not a code question).
