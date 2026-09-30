# Rollout — Track A (the Kyoto Trips slice) and Track B (the other groups)

> **Target: ten real Kyoto travelers using the Trips slice in November 2026.**
> Vertical slice Part 3 (`docs/planning/briefs/vertical-slice.md`). **Design only. Replaces §G of
> `docs/planning/trip-slip-product-map.md`.** **RATIFIED (decision-maker, Sep 28, 2026; ledger
> `2026-09-28-track-a-ratified`), with two A0 additions and A2 unconditional.** Every Track A step is a HARD STOP: it ships, the decision-maker
> ratifies, and only then does the next step start.

**Inputs.** Part 1 — `docs/planning/golden-path-trips-kyoto.md` (its Appendix A Playwright outline is the acceptance
test; "§1…§8" below are that outline's `describe` blocks). Part 2 — product map §M/§N (ratified Sep 28, 2026, R185–R188).
Part 4 — `docs/planning/slip-funnel-events.md` (events E1–E13 = its §3.1–§3.13). Part 5 —
`docs/planning/kyoto-supply-reality-check.md`.

**Rule for every step.** A step is done when (a) its Part 1 section passes with its `test.fixme` removed, in the
armed CI job for `j-kyoto-trips-golden-path.spec.ts`; (b) the Part 4 events it names are written; (c) the visual
artifact it names was ratified **before** build. A step never lands a surface without its event.

---

## Track A — the slice

| Step | Ships | Modules (§C) | Acceptance (Part 1) | Part 4 events | Visual artifact needed first | Depends on |
|---|---|---|---|---|---|---|
| **A0 — prerequisites** | Supply and plumbing only; nothing new is visible. (a) **Supply — named prerequisites from the production census (Part 5, R191):** (a1) Kyoto `hotel_cache` rows with their own latitude/longitude (for the slice such a row counts as exact; no migration — R193), refreshed by the live writer (P-1a/P-1b); (a2) the **two approved Kyoto experts given handles and one verified neighbourhood each**, through the existing claim → ratify flow, never by SQL (LD 27); (a3) at least the listing categories a five-day Trips plan books, live, with coordinates, a price, a cancellation tier and a future open slot — including one **instant-mode** listing with a `moderate` tier (P-1c) and located day-plan supply (P-1d). **A1 gate (R193): A1 starts only when a re-run of `scripts/report-kyoto-supply.cjs` against production shows ALL of — (1) `hotel_anchor_candidates` ≥ 3 in each of at least 4 Kyoto neighbourhoods (≥ 12 total, coordinates present); (2) `experts_with_verified_neighborhood` ≥ 2; (3) live listings meeting every slice field (coordinates, price, cancellation tier, future open slot) ≥ 3, across ≥ 2 of the categories Part 1's golden path books.** The script prints the three rows and "A1 may start". `can_anchor` is the listing-anchor count, not this gate. (b) The funnel fixes #1143 (tokens) and #1144 (revenue on paid) and the index declaration #1141, so every later event lands in a trustworthy table. (c) The spec file is created with every step `test.fixme` except §1, §4-today, §6-today, §7-today and §8-today, and wired into a required job. *Status Sep 28, 2026:* created and running (R200, #1161), made required (R203); §4-today now passes against the one explicit model stand-in, `E2E_AI_STUB=1`, set only in the job, asserting the draft's structure and its `slip_free_draft_run` row (E6, now written — R206). (d) **Production deploy of `main` once #1142 (landing hero copy) has merged** — Replit publishes; the session confirms `main` is clean (green, no conflict) at the deploy commit. (e) **The Part 6 validation sessions have run** — required before A4 starts (below). | — | §1 passes; the today-passable halves of §4, §6, §7, §8 pass | E1 (`trip_created` gains its door property — the event exists); E6 (`slip_free_draft_run`, written on drafted / refused / provider-failed — R206) | none | #1109, #1110 (landed); Part 5's production census (taken Sep 28, 2026 — its gaps are the named prerequisites in (a), R191) |
| **A1 — the Trips frame** | `experienceGroupFor` and the module frame, for the **Trips group only**: the slip draws Trips' modules in group order; list before rail on phone; the §K1 honesty fixes the path touches ("Duration needed", nights only where emitted). Other groups keep today's slip until Track B. | B1–B3, B5–B7 | §1 (group resolves; header), §8 honesty checks | E1 complete (occasion source) | **Slip frame at phone width** — Part 6's mock, screen 3 ("one day of the plan") | A0 |
| **A2 — Kyoto travel-time matrix** *(ahead of compare-options — Part 2 §M4, ratified: **unconditional**, R186)* | A neighbourhood-centroid × mode matrix for Kyoto, a refresh job, one read helper. Straight-line stays as the labelled "est." fallback. | S2 (data only) | None of its own; A4's "no est. on a located pair" assertion depends on it | — | none | A0. Cost ruled (R186): expected $0 inside the free caps, $72 ceiling per refresh at two modes; the operator confirms the billed rate in the Google Cloud console **after** the first refresh, which does not block the step. *Status Sep 30, 2026:* first production refresh confirmed by the operator (run 1b261a5a, 128 elements, 64/64, ok); the refresh now rides the jobs cron's DAILY bucket, a no-op while fresh (`2026-09-29-matrix-daily`), and A4's matrix assertion runs live in the kyoto-slice job against a stand-in refresh |
| **A3 — anchor question + option sets** | `plan_option_sets` / `plan_options` (§E2, approved R124) with their rails; the empty slip's first question for Trips, "Where are you staying?", adding up to three hotels from `hotel_cache` or as a `custom` option with a confirmed pin. An open set does **not** make the slip non-empty (R126). | S1, S2 (question) | §2 | E2 anchor set opened, E3 option added | **Anchor question card + "3 to compare" glance line** — Part 6 mock, screen 1 | A1; schema ratification (§E2) |
| **A4 — plan-fit in the compare view** | The compare view led by plan-fit (§M3): travel burden, neighbourhood coverage, "N of M located", "est." wherever a pair falls back. Readable at 375 px with no horizontal scroll. | S1 (§E4), S2 | §3 (including the phone viewport) | E4 plan-fit shown | **Hotel compare at 375 px** — Part 6 mock, screen 2 | A3; A2 (unconditional, R186); **the Part 6 validation sessions have run** (A0 (e)). *Status Sep 29, 2026:* BUILT ahead of the sessions under R211 by the decision-maker's dispatch (`2026-09-29-a4-plan-fit-compare`) — not ratified, and A5 does not start, until the sessions (five travelers, two experts) have run; their findings are an A4 follow-up. |
| **A5 — free draft around the open set** | The free first draft builds outward from the best plan-fit option and holds the stay slot open (R126); with no anchor it asks. **Plus the content sourcing brief's §10 A5 items** (`place_facts`, `content_sources`, `PlacesAdapter`, origin order through the upsell engine, `isPublishable`). | B5 | §4 (fixme lifted) | E6 free draft run | none (existing draft surface) | A3, A4 · *Status Sep 29, 2026:* BUILT ahead of the Part 6 sessions under R211 by the decision-maker's dispatch (`2026-09-29-a5-draft-open-set`) — the sessions test the anchor and compare screens, not the draft. Migration 333 approved. **A6 holds for the sessions.** |
| **A6 — gaps and suggestions (Trips)** | Completeness with "Not needed" (`plan_gap_dismissals`), day jump, move-to-day, and slip suggestions for Trips' REQ categories. Merges map steps 2 and 5 for this group only. | B4, S3, S4 | §5 | E7 gap shown/filled, E8 suggestion shown/added | **Gaps row + one suggestion card** | A5; brief phase 0 template-key mapping and phase 1 engine — **for Trips categories only** |
| **A7 — the paid run, one version per hotel** | §M5 / amended F2: with an open set each version anchors on one option; earned badges only (R128); `POST …/adopt-stops`; each version names its `optionId`. The paid preview and fee are shown before the charge (LD 41 (d)); the **Trip Pass waiver** reads on the preview when a pass covers the run. | S7, A1 | §6 (fixme lifted) | E9 run purchased, E10 version adopted | **Review board with one column per hotel** | A4, A5 |
| **A8 — choose, finalize, book, cancel** | Choose rail; Finalize refuses while a set is open (R125); the slip's bookings section (S5) with the **service fee shown before checkout** (R144) and the Trip Pass waiver where it applies; one booking; one cancellation whose refund equals its preview (R166) and which reads "Refunded" (R145); **the chosen partner hotel goes through the booking-agent rail and reads "prepared, awaiting purchase" (LD 44 (e)) — assigned here by the decision-maker's dispatch of Sep 29, 2026**. | S1, B7, S5 | §7 (both fixmes lifted, including the partner-hotel booking-agent test) | E5 option chosen, E11 finalized, E12 booking created, E13 booking cancelled | **Finalize chooser + bookings section** | A7 |
| **A9 — run records and history** | Part 2 §N: insert-only run record tied to its payment, `itinerary_variants.run_id`, outcome rows; "Your optimized plans" on the slip and in the PDF. | A1 (history) | §8 (fixme lifted) | E9/E10 read back from the run record | **History list on the slip** | A7; §N ratified |

**The ten travelers can start after A8.** A9 is the month-later view and can land while they are travelling; §8's
today-passable half (Home axis, Trip Card, refunded label) holds without it.

### What is deliberately NOT in Track A

- Any group other than Trips (Track B).
- Expert handoff changes (A8 in the map stays as it is today and moves into the frame at A1 unchanged).
- The apply-to-cart retirement beyond #1110's default-off flag (stays in the old step 7 scope; not on the path).
- Per-person burden for split lodging (§M2 flag) and any matrix outside Kyoto.

---

## Track B — the other four groups

Each group gets its own golden-path doc, written **when its turn comes** (the Part 1 format: steps, module, level,
NOT BUILT list, Playwright outline). Track B does not start until Track A's A8 ratifies. Order proposed by where the
mechanism holds best (§M2): **Hosted events → Group travel → Celebrations → Moments.** Plain plan rides Track A's
frame with no anchor until one is set and gets no track of its own.

Each Track B group is gated on: its golden path ratified; §M2's flag for that group answered (Group travel's split
lodging, Celebrations' and Moments' thin plan-fit); its supply census; its own visual artifacts.

---

## What happens to the current §G

| §G step | Fate |
|---|---|
| 0 | **Splits.** The Trips-relevant parts move to A0/A1; `trips.experience_type_id` (R132 0a) and `venue` matrix rows wait for Track B (the Trips slice resolves its group from the occasion row it already has). #1109/#1110 are landed. |
| 1 | **Moves** to A1, **Trips only**; the other groups' frame waits for their Track B turn. |
| 2 | **Merges** into A6 with step 5, Trips only. |
| 3 | **Moves** to A3 + A4, now traveler-picked **and** catalog (`hotel_cache`) options for hotels. |
| 4 | **Merges** into A8 (bookings section, fee preview, refunded status); the cart plan/standalone grouping (R142) waits — it is not on the path. |
| 5 | **Merges** into A6, Trips categories only. |
| 6 | **Moves ahead**: the matrix becomes A2 (Kyoto); the anchor pin and travel-time labels ride A3/A4. |
| 7 | **Moves** to A7 (fixed objectives, open sets in the run, batch adopt); apply-to-cart retirement waits. |
| 8 | **Waits** for Track B (group-specific ADVANCED modules). |

## Ratification

Each Track A step is ratified on its own, in order, with its Part 1 section green in CI on the step's own branch
(a PR is Ready only after its own branch CI is fully green). A step whose visual artifact is not ratified does not
start build.

*HARD STOP — design only; no code until ratified.*
