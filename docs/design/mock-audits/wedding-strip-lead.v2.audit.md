# `StripLead.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/StripLead.dc.html` (Trip Strip · one new chip — "Today" vs "After")
**Live surface:** `client/src/components/trip/trip-strip.tsx`; `client/src/lib/which-event.ts` (`eventsForTrip`); `client/src/lib/plan-vocabulary.ts` (`eventCountLabel`)
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-04-slip-events`; CLAUDE.md Locked Decisions 29 / 33. Pinned by `client/src/components/__tests__/trip-strip-lead.test.tsx` (17/17).
**v1 brief:** none (README marked it **built**).

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Eyebrow "Your Trip" | `trip-strip.tsx:207`–`213` | MATCH (verbatim) | One of the chrome's three ratified coral touches. |
| 2 | Lead "Your Kyoto wedding" | `trip-strip.tsx:214`–`232` (`trip-strip-lead`) | MATCH | |
| 3 | Chip "Kyoto, Japan" | `trip-strip.tsx:234`–`242` (`trip-strip-destination`) | MATCH | Rendered only for `vocab === "travel"` — an occasion-class gate the artboard does not draw. |
| 4 | Chip "Oct 2 → Oct 4" | `trip-strip.tsx:244`–`253` (`trip-strip-dates`) | **MATCH — including the `→` separator** | `trip-strip.tsx:192`–`196`. |
| 5 | Chip "2 travelers" | `trip-strip.tsx:255`–`264` (`trip-strip-party`) | MATCH | Noun from `partyCountLabel` / the occasion row, never a fabricated "travelers" (`:161`–`176`). |
| 6 | **NEW chip "4 events"**, between party and cart | `trip-strip.tsx:266`–`276` (`trip-strip-events`) | **MATCH — the artboard's whole point, built** | Count is `eventsForTrip(planEvents, ctx.tripId).length`; label is `eventCountLabel` (`plan-vocabulary.ts:233`–`236`) → exactly `"4 events"`. |
| 7 | The chip is ABSENT in the "Today" row | `trip-strip.tsx:179`–`188`, `:266` | **MATCH (§13)** | Hidden at zero **and hidden while unknown** — a plan with no `user_experiences` row has only its implicit unnamed event, and a list that never loaded reads as the same absence. Never "0 events". |
| 8 | Chip "3 · $1,240" (cart) | `trip-strip.tsx:278`–`293` (`trip-strip-cart`) | MATCH | |
| 9 | **Both** "Edit" and "Continue planning ›" rendered side by side | `trip-strip.tsx:295`–`324` (one `trip-strip-edit`) | **DIVERGENCE** | Live renders **one** control whose label is `marketing ? "Continue planning ›" : "Edit trip ›" / "Edit ›"`. The artboard draws two. |
| 10 | "Edit" opens the plan modal | `trip-strip.tsx:305`–`323` | **DIVERGENCE — only when NO trip is bound** | With `ctx.tripId` set, the control is a `<Link>` to `planningRouteForTrip(...)` (a navigation), and the modal opens only in the trip-less branch (`:317`, `openPlanModal()`). Locked Decision 33's door table says *"the Trip Strip's Edit → step 1 or 2 by what the plan already holds"* — that door is unreachable once a plan exists. |
| 11 | Locked state during payment | `trip-strip.tsx:296`–`303` (`trip-strip-locked`) | MATCH (pre-existing) | Not drawn in the artboard; additive and ruled elsewhere. |

## Classification

- **(A) contained:** none for #9 alone — see (B).
- **(B) needs a ruling:** **#9 + #10 together.** They are one question: *should the Trip Strip carry a modal "Edit" beside the "Continue planning ›" navigation once a plan is bound?* Today it carries one control that is a link. Adding a second is a chrome change (`client/src/components/trip/trip-strip.tsx:295`–`324`), and Locked Decision 33's door table currently describes a door the code does not expose. Either the code grows the door or the decision text is corrected — decision-maker call, since ruling 33 is a Locked Decision.
- **(C) ruled omission / correct as is:** #3 (occasion-class gate), #7 (chip hidden at zero **and** while unknown), #11.

**Not verifiable without a running server:** the chip's live count against a real plan (covered by `trip-strip-lead.test.tsx`).
