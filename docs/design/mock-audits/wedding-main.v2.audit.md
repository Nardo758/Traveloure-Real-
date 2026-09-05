# `Main.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Main.dc.html` (landing page with Wedding as an 8th moment + the "Planning your own?" callout)
**Live surface:** `client/src/pages/landing.tsx`, `client/src/components/landing/moments-slot.tsx`, `client/src/components/landing/moments-section.tsx`, `server/services/landing-moments.ts`
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-04-wedding-landing-moment` > the artboard.
**v1 brief:** `wedding-main.audit.md` (built; caveat = the photo gate).

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Tab strip, in order: **Wedding**, Proposal, Golf trip, Girls' trip, Anniversary, Honeymoon, Milestone birthday, Family occasion | `server/services/landing-moments.ts:55,72,86,104,118,134,151,168` | **MATCH — exact, including order** | Eight `MomentConfig` rows in the artboard's order. `landing-moments.ts:46`–`48` states that roster order IS the rotation start, so "Wedding active by default" is that position and not a second concept. |
| 2 | Wedding card eyebrow "A wedding weekend in Kyoto" | `landing-moments.ts:57` | MATCH (verbatim) | |
| 3 | Headline "Three days, one plan — the rehearsal dinner Friday, the ceremony at three, the brunch nobody has to organize." | `landing-moments.ts:58`–`59` | MATCH (verbatim) | |
| 4 | Three numbered pieces (temple garden / welcome drinks + hair and makeup + reception / guests from four countries) | `landing-moments.ts:60`–`64` | MATCH (verbatim, all three) | |
| 5 | "Plan this moment" opens the plan with the occasion already set | `moments-section.tsx:209`–`218`; `client/src/lib/plan-steps.ts:119`–`134` | MATCH | The CTA passes `experienceType:"wedding"` + `experienceSlug:"wedding"` (`landing-moments.ts:66,68`); `resolvePlanSteps` resolves that row and opens at **step 2** under a "Wedding · change" pill — the Locked Decision 33 door table's Moment row. |
| 6 | Builder byline "built by @kyotobyaya · 9 reviews" | `moments-section.tsx:221`–`226` | **MATCH in shape, NOT SEEDED** (§13) | The byline renders only when `moment.builder` exists. No builder is seeded for the wedding row — an invented handle would be a claim about a real expert. Correct as is. |
| 7 | The photo behind the card | `landing-moments.ts:49`–`54` | **ALREADY-RULED (§13 photo gate)** | "NO PHOTO IS SEEDED FOR THIS ROW, deliberately". The row is configured and **invisible** until Kyoto has ≥1 attributed real, non-stock, expert-curated photo. The gate is never loosened to make a moment appear. In production today the *whole* Moments section is still the ruled empty state. |
| 8 | Callout: eyebrow "Planning your own?" + "The Earn page's "Event Planner" track is for people who *sell* event services. Couples start here: **Plan this moment** opens your plan with the occasion already set." | `moments-section.tsx:299`–`326` | **MATCH — verbatim, including the italic *sell* and the coral "Plan this moment"** | `"Event Planner"` is the only link (→ `/start/events`, `link-event-planner-track`); "Plan this moment" is deliberately TEXT, not a second opener (`moments-section.tsx:293`–`296`). |
| 9 | Callout lives with the card, so it disappears with it | `moments-section.tsx:288`–`292` | MATCH (by design) | Stated in the comment: in the empty-state fallback the CTA does not exist, so neither does the note. Consequence: **with today's production data neither the Wedding moment nor its callout is on screen.** |
| 10 | Masthead / hero / ticker rows above the fold | `client/src/pages/landing.tsx:32,46`; `client/src/components/CityTickerTape.tsx:69` | MATCH (pre-existing) | Hero and ticker CTAs both call `open()` with no source → step 1, which is the Locked Decision 33 hero row. |

## Classification

- **(A) contained:** none.
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** #6 (no fabricated builder), #7 + #9 (photo gate: the moment and its callout are configured and invisible).

**Not verifiable without a running server:** whether any market's photo gate passes today (data question). Everything else was verified from source.
