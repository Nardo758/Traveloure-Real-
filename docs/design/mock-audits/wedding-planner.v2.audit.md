# `Planner.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Planner.dc.html` (`/start/events` · three doors)
**Live surface:** `client/src/pages/start-events.tsx`; `client/src/components/planning/plan-entry-cta.tsx`; `scripts/check-planning-entry.cjs`
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-04-wedding-entry-doors` (+ `2026-09-04-entry-unification` for the shared CTA); CLAUDE.md Locked Decision 33.
**v1 brief:** `wedding-planner.audit.md` — both divergences it found are **closed**.

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Masthead "**Which side of the event are you on?**" | `start-events.tsx:71`–`73` (`text-start-events-title`) | **MATCH (verbatim)** | v1's finding ("the page asks which event *business* you are starting") is closed. |
| 2 | Sub "**Two of these are for people who work events. One is for you.**" | `start-events.tsx:74`–`76` | **MATCH (verbatim)** | |
| 3 | Three doors, host **first** | `start-events.tsx:78`–`117` | **MATCH — order and count** | The host card is rendered before the `OPTIONS.map`. |
| 4 | Host card "**new**" badge | `start-events.tsx:85`–`87` | MATCH (verbatim, lowercase) | |
| 5 | Host title "**I'm planning my own event**" | `start-events.tsx:88`–`90` | MATCH (verbatim) | |
| 6 | Host body "**A wedding, a proposal, a reunion — you're the host.**" | `start-events.tsx:91`–`93` | MATCH (verbatim) | |
| 7 | Host CTA "**Start a plan**" | `start-events.tsx:97` → `plan-entry-cta.tsx:69`; `plan-vocabulary.ts:74` (`START_PLAN_LABEL`) | **MATCH (verbatim)** | It is the SHARED `PlanEntryCta` — never a second modal, never a raw route push (`start-events.tsx:11`–`17`). |
| 8 | The host door invents **no occasion** | `start-events.tsx:19`–`22`, `:95`–`97` | **MATCH (§13)** | `<PlanEntryCta />` with **no `source`**: the page is reached from /earn, the nav and partner links, none of which names a wedding rather than a reunion. → `resolvePlanSteps` returns `startStep:"occasion"` (`plan-steps.ts:131`–`133`), which is Locked Decision 33's `/start/events` → step 1 row. |
| 9 | Door 2 title "I provide event services" | `start-events.tsx:33` | MATCH (verbatim) | |
| 10 | Door 2 body "Catering, photography, floral, venues — list what you offer." | `start-events.tsx:34`–`36` | **DIVERGENCE — expanded paraphrase** | Live: "You run an event business travelers book directly — catering, flowers, officiating, photography or videography, hair & makeup, AV, rentals, entertainment." Longer and more specific; same meaning. Live also adds a `detail` line the artboard has no slot for. |
| 11 | Door 2 CTA "**Become a provider**" | `start-events.tsx:37` | **DIVERGENCE — copy** | Live: "**Continue as a Service Provider**". |
| 12 | Door 3 title "I plan & coordinate events" | `start-events.tsx:43` | MATCH (verbatim) | |
| 13 | Door 3 body "You run the whole day for clients." | `start-events.tsx:44`–`46` | **DIVERGENCE — expanded paraphrase** | Live: "You design and run the whole event — weddings, proposals, birthdays, corporate events — coordinating vendors, timelines, and budgets for clients." |
| 14 | Door 3 CTA "**Become an expert**" | `start-events.tsx:47` | **DIVERGENCE — copy** | Live: "**Apply as an Event Planner**". More precise about which application it opens (Locked Decision 36 partitions that track). |
| 15 | Footnote "Before: only (b) and (c) existed, so a couple following 'Event Planner' was sent to sell." | `start-events.tsx:11`–`17` | MATCH (as intent) | Annotation; the comment states the same bug as the reason the host door exists. |
| 16 | The page is guarded as an entry surface | `scripts/check-planning-entry.cjs:73`–`77` | **MATCH** | `/start/events` is in `ENTRY_SURFACES` with its own `why` string, and the guard's stated negative space is honest ("it does not check that the entry is VISIBLE, placed where a mock says, or reachable by keyboard"). |
| 17 | `?offeringTypeKey=` forwarding through the two supply doors | `start-events.tsx:52`–`58` | MATCH (additive, ruled) | Not drawn in the artboard; required by `2026-09-04-earn-planner-roles`. |

## Classification

- **(A) contained:** #11 and #14 are the only copy divergences that change the *words on a button*. Both live labels are more precise than the artboard's and are consistent with Locked Decision 36. **Recommendation: leave the code, amend the artboard.** If the artboard is authoritative, the two strings are `client/src/pages/start-events.tsx:37` and `:47`.
- **(B) needs a ruling:** none.
- **(C) ruled omission / correct as is:** #8 (no invented occasion), #10, #13 (expanded bodies), #15, #17.

**Not verifiable without a running server:** that the host CTA actually opens the modal at step 1 in a browser (asserted from `resolvePlanSteps` + the absent `source`).
