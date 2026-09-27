# Trip Slip product map — one Slip, capability modules, experience groups

**Status:** DESIGN ONLY — no code. **§I is RULED** (decision-maker, Sep 26, 2026; ledger R124–R129). The map as a
whole is **not yet ratified**: ratification waits on §J (per-experience specification), §K (information levels) and §L
(ingredient inventory), per ledger `2026-09-26-slip-map-ratification-gate`. Nothing here is authorized to build until
then. Every schema change below is **PROPOSED and needs ratification**, except the option tables that §I Q1 approved.
**Code base:** `origin/main` @ `da3174289` (the same commit as the UI audit). Every `path:line` is on that commit.
**Inputs:** `docs/planning/trip-slip-ui-audit.md` (cited as **audit F2**, **audit G3**, …) and
`docs/planning/recommendation-convergence-brief.md` (cited as **brief §B1**, …). The brief's section H is paused; once
this map is ratified, H is rewritten as this map's steps 1–2 (§G).
**Markers:** **DOC-ONLY** = stated in a doc, not seen in code. **GAP** = docs and code disagree; code wins.
**Not designed here (open elsewhere):** per-plan cart scoping (pending the decision-maker's ruling); P1 lead routing.
**#1109** (slip reads the live plan; finalized plans refuse planning edits; "send to expert" needs an assigned expert;
the client names each finalized-plan refusal and offers Reopen) is assumed landed. **#1110** closes the adopt-stop
write gate and turns comparison apply-to-cart off (§F1 GAPs).

### Source documents

| Document | Found? | Used as |
|---|---|---|
| `UPSELL_ENGINE_AND_SERVICE_TAXONOMY_SPEC.md` | **Not in repo.** Only cited in comments (`server/services/upsell-engine.service.ts:22`); the matrix migration cites it as "SEED_DATA §3" (`server/migrations/035_phase1_seed_template_matrix.sql:3`). **GAP** | Code wins: `template_category_matrix` (`shared/schema.ts:9495-9502`, seed `035_…sql`) |
| `TRAVELOURE_MASTER_IMPLEMENTATION_ARCHITECTURE.md` | **Not in repo** (searched the whole filesystem). **GAP** | Code wins: the template list is the `experience_types` seed |
| `docs/design/ADOPT_OPTIMIZATION_SPEC.md` | Yes | Adopt contracts R-A/R-B/R-C |
| `docs/audits/adopt-finalize-conformance.md` | Yes | What of R-A/R-B/R-C landed |
| The free-first-draft ruling | **The "Option A" label is RETIRED** (decision-maker, Sep 26, 2026; ledger `2026-09-26-option-a-label-retired`, R133). Cite ledger `2026-09-05-draft-only-on-empty` (`docs/DECISIONS.md:520`) and `2026-09-05-draft-sketch-optimize-plan` (`:524`) = LD 41 (b)/(c). The only "Option A" left in the ledger is the unrelated cart ruling (`:780`). | LD 41 (b)/(c), by those two slugs |

**Spec documents cited in code but missing from the repo** (checked on `main` @ `da3174289`; the decision-maker will
supply the authoritative copies — until then the code wins):

| Cited as | Where cited | Status |
|---|---|---|
| `MASTER_INTEGRATION_BRIEF.md` ("Master Integration Brief") | 18 files: migrations 031–044 and 049, `server/services/commission.ts`, `upsell-engine.service.ts`, `server/routes/upsell.routes.ts` | Missing. `docs/planning/master-integration-phase-0-audit.md:4` says it read it. |
| `SEED_DATA.md` (§1–§7) | migrations 033–043 (§1 fee bands, §2 categories, §3 template matrix, §4/§5 offering types, §6 neighborhoods, §7 coverage), `server/services/content-gap-taxonomy.ts:190` | Missing |
| `UPSELL_ENGINE_AND_SERVICE_TAXONOMY_SPEC.md` | `server/services/upsell-engine.service.ts:22` | Missing |
| `TRAVELOURE_MASTER_IMPLEMENTATION_ARCHITECTURE.md` | `GAP_REPORT.md` (and this map's inputs) | Missing |
| `WAYS_TO_EARN_SERVICE_CATALOG.md` | `server/routes/upsell.routes.ts:21` | Missing |
| `docs/testing/CONSOLE_TABS_EXERCISE.md` | `shared/booking-visibility.ts:4`, `client/src/pages/provider/settings.tsx:537`, two `fp5-*` tests, two client-lib tests | Missing |
| `docs/runbooks/travelpulse-city-reconciliation.md` | `server/migrations/249_restore_travel_pulse_cities_unique_index.sql` | Missing |
| `SELECTION_CONTROL_MODEL_SPEC_v2.md` | audit U1 input | Present only under `attached_assets/`, not `docs/` |
| `docs/design/wedding-flow/ModalEvents.dc.html` | `shared/plan-events.ts:47` | Stale name, not missing: renamed `Step5Events.dc.html` (LD 33) |

---

## A. Experience inventory

### A1. The vocabularies that exist in code

| # | Vocabulary | Where | Count | Role today |
|---|---|---|---|---|
| V1 | `experience_types.slug` | seed `server/seeds/experience-template-tabs.seed.ts:4790-4921` | **28** | The one runtime occasion catalog (`shared/occasions.ts:12-15`). Carries the six switches (`shared/schema.ts:2402-2407`) and `roles_needed` (`:2426`). |
| V2 | `eventTypeEnum` → `trips.event_type` | `shared/schema.ts:46, 112` | 10 | Fee/optimizer branch and the slip's lossy occasion lookup. Default `"vacation"`. |
| V3 | `template_category_matrix.template_key` | `035_…sql:11-146` | 7 (`travel`, `wedding`, `proposal`, `date_night`, `birthday`, `corporate`, `custom`) | REQ/REC/OPT per category, read by the upsell engine. |
| V4 | Occasion class | `shared/occasions.ts:90, 110-149` | 3 (`travel`/`event`/`couple`) | Presentation vocabulary only (LD 28). |
| V5 | Plus occasion templates | `server/services/occasion-templates.ts:25-80` | 5 + generic (`date_night`, `birthday`, `proposal`, `celebration`, `anniversary`; `occasion`) | Plus scheduled drafts (LD 26). |
| V6 | Landing `momentKey` | `server/services/landing-moments.ts:50-175` | 8 | Attribution + AI prompt only (`shared/schema.ts:139-146`). |
| V7 | `trips.experience_type` coarse key | `shared/schema.ts:138`; values seen `wedding`/`event`/`travel` (`landing-moments.ts:61,76,90`) | "five frozen keys" per LD 42 D1 | Pricing tiers + PlanCard skins. |
| V8 | Logistics preset keys | `server/services/logistics-presets.service.ts:1076-1131` | 32 keys (slugs plus `vacation`, `date_night`, `anniversary`, `adventure`) | Anchor/schedule presets. |

The audit's "three unmapped vocabularies" are V1, V2, V3 (brief §A6). V5–V7 are three more that the map must also
absorb. Mappings that **exist** in code: V1→V2 (`eventTypeForSlug`, `shared/occasions.ts:66-70`), V1→V4
(`OCCASION_CLASS_BY_SLUG`, `:110-149`), V2→V1 reverse only on a unique match (`findOccasionByEventType`, `:220-228`),
V6→V1 (`experienceSlug` on each moment). **Nothing maps V1 or V2 to V3:** `resolveTemplateKey` passes its input through
and only maps empty → `travel` (`server/services/upsell-query.service.ts:664-668`), and the Trip Card sends
`eventType` as the template key (`client/src/components/plancard/PlanCardUpsellSlot.tsx:61`). So `vacation`,
`honeymoon`, `anniversary`, `other` reach no matrix rows, and `date_night` is **unreachable** from any trip.

**GAPs in the inventory**
- LD 42 D1 rules `trips.experience_type_id` (FK → `experience_types`). **It is not declared** — `trips` has
  `event_type`, `experience_type`, `moment_key` and no `experience_type_id` (`shared/schema.ts:107-146`). The slip
  therefore resolves its occasion through events-first then the lossy lookup (`shared/occasions.ts:337-350`) — and the
  slip does not pass events (audit F15).
- `shared/occasions.ts:105` says `server/seed-experience-types.ts` mirrors the seeder. That file lists **22** slugs
  (`server/seed-experience-types.ts:8-355`); it lacks `romance`, `corporate`, `milestone-birthday`, `family-occasion`,
  `honeymoon`, `golf-trip`.
- The matrix has **no `venue` rows** (`035_…sql` predates migration 285), while `roles_needed` puts `venue` first for
  wedding, birthday, corporate-events, reunions, engagement-party, corporate and milestone-birthday
  (`experience-template-tabs.seed.ts:4799-4887`). The matrix and `roles_needed` also disagree on REQ: wedding's matrix
  REQ is photography, dining_venue, event_coordinator, caterer (`035_…sql:32,34,39,40`); its `roles_needed` has no
  `dining_venue`. Brief §G-2 already asks for one authority.

### A2. Reconciled table (28 occasions)

Matrix column: **today** = what the engine receives via `trips.event_type` (✓ = rows exist); **proposed** = the brief's
phase-0 mapping module, for ratification. `custom` = every category OPT (`035_…sql:140-145`), i.e. no REQ gaps — the
honest default where no template fits.

| # | Canonical slug (V1, seed line) | V2 `event_type` | V3 matrix today → proposed | V4 class | Other spellings (V5 / V6 / V8) | Group (§B) |
|---|---|---|---|---|---|---|
| 1 | `travel` (4796) | vacation | ✗ → `travel` | travel | V8 `travel`,`vacation` | Trips |
| 2 | `anniversary-trip` (4793) | other | ✗ → `travel` | couple | V6 `anniversary`; V8 same | Trips |
| 3 | `honeymoon` (4902) | honeymoon | ✗ → `travel` | couple | V6 `honeymoon`; V8 same | Trips |
| 4 | `romance` (4878) | vacation | ✗ → `travel` | couple | V8 `romance` | Trips |
| 5 | `golf-trip` (4919) | vacation | ✗ → `travel` | travel | V6 `golf`; V8 same | Trips |
| 6 | `sports-event` (4870) | other | ✗ → `travel` | travel | V8 same | Trips |
| 7 | `date-night` (4805) | other | ✗ → `date_night` | couple | V5 `date_night`; V8 `date-night`,`date_night` | Moments |
| 8 | `proposal` (4828) | proposal | ✓ `proposal` | couple | V5, V6, V8 `proposal` | Moments |
| 9 | `birthday` (4808) | birthday | ✓ `birthday` | event | V5 `birthday`; V8 same | Celebrations |
| 10 | `milestone-birthday` (4884) | birthday | ✓ `birthday` | event | V6 `milestone_birthday` | Celebrations |
| 11 | `corporate-events` (4815) | corporate | ✓ `corporate` | event | V8 same | Celebrations *(edge)* |
| 12 | `wedding-anniversaries` (4825) | anniversary | ✗ → `custom` | event | V8 same | Celebrations |
| 13 | `baby-shower` (4846) | other | ✗ → `custom` | event | V8 → party presets | Celebrations |
| 14 | `graduation-party` (4849) | other | ✗ → `custom` | event | 〃 | Celebrations |
| 15 | `engagement-party` (4852) | other | ✗ → `custom` | event | 〃 | Celebrations |
| 16 | `housewarming-party` (4855) | other | ✗ → `custom` | event | 〃 | Celebrations |
| 17 | `retirement-party` (4858) | other | ✗ → `custom` | event | 〃 | Celebrations |
| 18 | `career-achievement-party` (4861) | other | ✗ → `custom` | event | 〃 | Celebrations |
| 19 | `farewell-party` (4864) | other | ✗ → `custom` | event | 〃 | Celebrations |
| 20 | `holiday-party` (4867) | other | ✗ → `custom` | event | 〃 | Celebrations |
| 21 | `wedding` (4799) | wedding | ✓ `wedding` | event | V6 `wedding` | Hosted events |
| 22 | `corporate` "Corporate Retreats" (4881) | corporate | ✓ `corporate` | event | V8 same | Hosted events |
| 23 | `reunions` (4843) | other | ✗ → `custom` | event | V8 same | Hosted events *(edge)* |
| 24 | `bachelor-bachelorette` (4790) | other | ✗ → `travel` | event | V8 same | Group travel |
| 25 | `boys-trip` (4831) | other | ✗ → `travel` | travel | V8 same | Group travel |
| 26 | `girls-trip` (4840) | other | ✗ → `travel` | travel | V6 `girls_trip`; V8 same | Group travel |
| 27 | `retreats` (4818) | other | ✗ → `travel` | event | V8 same | Group travel |
| 28 | `family-occasion` (4887) | other | ✗ → `custom` | event | V6 `family_occasion` | Group travel *(edge)* |

**Values that are not occasions** (no `experience_types` row): V2 `vacation`, `adventure`, `cultural`, `anniversary`,
`other`; V3 `custom`; V5 `celebration`, `anniversary`, `occasion`. They resolve to a group only through an occasion row.
A plan whose occasion does not resolve (today: most `vacation` plans, since `travel`, `romance` and `golf-trip` all map
to `vacation` — `shared/occasions.ts:194-205`) gets the **plain-plan shape**, which LD 28 already rules is the NULL
fallback. §B names it.

**Count:** 28 seeded occasions, not ~27.

---

## B. Experience groups

### B1. Axes, read from the occasion row (not from topic)

| Axis | Source column | Values |
|---|---|---|
| Time shape | `default_duration` (`shared/schema.ts:2403`) | `day` / `range` |
| Who | `default_guests` (`:2405`) | guest list off / on |
| Where | `default_stops` (`:2402`) | `one` / `many` |
| Anchor type | `roles_needed` contains `venue` (`:2426`) | venue / not venue |
| Lodging | follows time shape | `range` ⇒ needed; `day` ⇒ not |

Finding: **anchor type and lodging are not independent axes.** For single-day plans they follow from `guests`
(no guests ⇒ a reservation; guests ⇒ the event's location). Anchor type splits groups only among multi-day plans with a
guest list. "Single moment" vs "single day" is not a column either; it follows from `guests` too (every `day` +
no-guests row is a one-reservation evening).

### B2. The rule (a pure function of the row, evaluated in order)

| Step | Condition | Group | Anchor | Lodging |
|---|---|---|---|---|
| 0 | occasion unresolved, or any of the three switches NULL | **Plain plan** (LD 28 fallback; said on screen) | none until set | per dates |
| 1 | `day` + no guests | **Moments** | reservation (`temporal_anchors` `dinner_reservation` / `proposal_moment`, `shared/schema.ts:53-58`) | no |
| 2 | `day` + guests | **Celebrations** | venue = event `location` (`user_experiences`, `shared/schema.ts:2578`) | no |
| 3 | `range` + no guests | **Trips** | hotel (booked stay) | yes |
| 4 | `range` + guests + `venue` ∈ roles | **Hosted events** | venue | yes (for guests) |
| 5 | `range` + guests + no `venue` | **Group travel** | shared lodging | yes, independent arrivals |

Counts: Moments 2 · Celebrations 12 · Trips 6 · Hosted events 3 · Group travel 5 = **28**. Home: a pure
`experienceGroupFor(row)` in `shared/` beside `shared/occasions.ts`, reading the existing switch readers
(`client/src/lib/occasion-switches.ts:64,88,113`) rather than restating them. **No schema change — RULED (§I Q4, R127).**

**Group names are INTERNAL (R127).** "Moments", "Celebrations", "Trips", "Hosted events", "Group travel" and "Plain plan"
are keys for choosing module defaults. **They are never rendered in the UI.** The traveler sees the occasion's own name
(`experience_types.name`) and the plan's shape, never the group. A guard for this lands with step 1: a source test
that no client string contains a group name as display text.

**A NULL occasion can still have a group (R132, brief §F phase 0 0a).** When `event_type` can name several occasions
that all sit in one group, the group is used without claiming an occasion: `vacation` → Trips (`travel`, `romance`,
`golf-trip`), `birthday` → Celebrations (`birthday`, `milestone-birthday`). `corporate` spans two groups and `other`
names nothing, so both stay Plain plan.

### B3. Edge cases, and where this differs from the owner's guess

| Occasion | Owner's guess | This map | Why |
|---|---|---|---|
| `corporate-events` | Hosted events | **Celebrations** (RULED, R127) | The seed made it `day` on purpose (ledger `2026-09-04-reaudit-fixes`, comment at `experience-template-tabs.seed.ts:4812-4814`): a run of show inside one day. It keeps vendor coordination as an *optional* module (§D), which is the only thing Hosted adds for a one-day event. |
| `corporate` (Corporate Retreats) | Hosted events | Hosted events | Agrees: `range` + guests + `venue` first in roles (`:4881-4883`). |
| `reunions` | Group travel | **Hosted events** (RULED, R127) | Its roles are venue, event_coordinator, caterer, accommodation, photography, rentals (`:4843-4845`) — someone hosts. It still gets arrivals (on by default for Hosted). |
| `retreats` | Group travel | Group travel | Agrees. Vocabulary `attendees` like corporate, but no `venue` role (`:4818-4820`). |
| `family-occasion` | (not listed) | Group travel (RULED, R127) | `range` + guests, no `venue` role (`:4887-4889`). `stops: one`, so the stops module is off. |
| `wedding-anniversaries` | (not listed) | Celebrations | `day` + guests (`:4825-4827`). Not the couple's `anniversary-trip` (Trips) — the split `shared/occasions.ts:95-104` already draws. |
| `romance` | (Moments?) | Trips | `range`, one stop, no guests (`:4878-4880`): a getaway, not an evening. |
| `sports-event`, `golf-trip` | (Trips) | Trips | `range`, no guests; `schedule: true` turns the event-schedule module on inside Trips. |
| `proposal` | Moments | Moments | Also `visibility: hidden` (`:4828-4830`), which already hides guests/share (LD 28). |
| `boys-trip` vocabulary | — | Group travel | LD 42 D10 leaves the `travelers` vocabulary open; the group does not depend on it. |

---

## C. Capability modules

A **module** = one self-contained slip section (or rail card) with its own read, its own visibility rule and its own
write rail, on the rail-card pattern the audit found reusable (audit E1: `SlipRail.tsx:1305-1338`). The group
switches modules on; the module never re-derives the occasion itself.

Free/paid key: **Free** = no charge. **Paid-run** = the optimizer run (LD 41 (a)/(e); pay gate
`server/routes/optimization.routes.ts:356`, run predicate `server/services/optimizer-run-authorization.ts:125`).
**Paid-task** = Ask-AI task, charged on apply (LD 45 (3)). **Free-first-draft** = LD 41 (b)/(c): only on an empty slip
(`client/src/lib/slip-rail.ts:60-63`; server predicate `server/services/ai-draft-eligibility.pure.ts:15-18`, 409
`slip_has_items`).

### C1. BASIC — every plan

| Id | Module | What it does | Extends | Depends on | Cost |
|---|---|---|---|---|---|
| B1 | Plan header | Title, dates / "Set your dates", party, stops, occasion | `SlipHeader` (audit A1 zone 4, SV:273-520) | — | Free |
| B2 | Days & items | Day list; add / edit / remove / up-down reorder (owner, delegate — LD 42 D16, LD 52 C) | `SlipItemRow`, `SlipItemTools` (audit B1); add rail `POST /api/trips/:id/itinerary-items` (audit E3) | B1 | Free |
| B3 | Map | Located items only, "X of Y located" (LD 22) | `MapControlCenter` (audit E6) | B2 | Free |
| B4 | Completeness | "3 of 5 essentials" + one chip per REQ category | **new** (brief §H1); derivation = `computeEmptySlots`/`derivePlanCardGapData` moved to one module (brief §B6) | brief phase 0 template-key mapping; group resolver | Free |
| B5 | First draft | "Draft with AI" on an empty slip only | `slipBuildAiAction` (`slip-rail.ts:60-63`) → `POST /api/ai/generate-itinerary` | B2 empty | Free-first-draft |
| B6 | Share & export | Link, PDF, `.ics` | Share rail card (audit A1) | B1 | Free |
| B7 | Finish | Finalize, Reopen, go to checkout | Finish card + `FinalizeBookingModal` (audit C); `finalizeTrip` (`server/services/trip-finalize.service.ts:134`) | B2; S1 (no open sets) | Free |

### C2. STANDARD — most plans

| Id | Module | What it does | Extends | Depends on | Cost |
|---|---|---|---|---|---|
| S1 | Compare options | A slot holds 2–3 candidates until one is chosen (§E) | **new** tables (§E); add rail on choose | B2; S3 optional | Free |
| S2 | Anchor & travel time | Anchor pin; travel-time labels between items | `BuildAroundDialog` / `anchor-candidates.ts` (audit E6); brief §B5/§B8 matrix | B3; brief phase 2 | Free |
| S3 | Suggestions | Engine-ranked item candidates for gaps and REC/OPT | `UpsellSlot` hook with `slip_gaps`/`slip_suggestions` (brief §H3) | B4; brief phase 1 | Free (brief H-Q2) |
| S4 | Move & jump to day | "Move to day…", sticky day chips | existing item PATCH (`dayNumber`; audit C, F10, F12) | B2 | Free |
| S5 | Bookings | Booking status, balance payment for owner / payer (LD 42 D9, `canPayBalance`) | **new section**, existing rails (audit F13) | B2 | Free (the balance itself is the booking's money) |
| S6 | Expert suggestions | Accept/decline an assigned expert's suggestions | `ExpertSuggestionsPanel` + `trip_suggestions` (`shared/schema.ts:524-538`) | expert assigned | Free |
| S7 | Optimize preview | Heuristic score, weakest dimension, fixed-item count; no specifics | `GET /api/optimization-preview` (`optimization.routes.ts:170-240`) | B2 non-empty | Free |
| S8 | Ask AI | Question → proposal → apply | `AskAiDrawer`, `plan_proposals` (`shared/schema.ts:374`) | B2 | Paid-task |
| S9 | Stops | Ordered multi-city stops | `trip_destinations` (`shared/schema.ts:321-333`, LD 34), `plan-stops-writer.ts` | `default_stops = many` | Free |

### C3. ADVANCED — complex plans

| Id | Module | What it does | Extends | Depends on | Cost |
|---|---|---|---|---|---|
| A1 | Three optimized versions | Baseline + 3 AI versions, review board, adopt whole or in part (§F) | `generateOptimizedItineraries` (`server/itinerary-optimizer.ts:860`); apply-to-trip / adopt-stop (`server/routes/plancard.routes.ts:51, 289`) | S7; S1 (sets feed the run) | Paid-run |
| A2 | Event schedule | Events inside the plan, day/time/place (LD 29/35) | `SlipEventGroupBlock` (audit B1), `user_experiences` | `default_schedule = true` | Free |
| A3 | Traveling party & arrivals | Who travels, arrival/departure, accessibility, mobility | `SlipTravelingParty`; `trip_participants` (`shared/schema.ts:5447`: `arrivalDatetime`, `departureDatetime`, `mobilityLevel`…) | — | Free |
| A4 | Guests & RSVP | Per-event invites, derived roster (LD 37) | `SlipLogisticsSection`, `event_invites` (`shared/guest-invites-schema.ts:20-45`), `GET /api/trips/:tripId/guests` | A2; `default_guests = true`, not hidden | Free |
| A5 | Vendor coordination | Role chips → provider browse (LD 42 D6); done-for-you card | role chips (audit C, SV:840-865); Coordination rail card (audit A1) | `roles_needed` | Free to browse; services priced as listings |
| A6 | Temporal anchors | Immovable times (ceremony, check-in, reservation) | `temporal_anchors` (`shared/schema.ts:5876-5896`); optimizer reads them (`itinerary-optimizer.ts:888-903`) | A2 or B2 | Free |
| A7 | Split activities | An item for a subset of the party | `itinerary_items.participant_ids` / `attendance_requirement` (`shared/schema.ts:5603-5870`, both columns present, no slip UI) | A3 | Free |
| A8 | Expert handoff | Hire, message, Finalize "my expert handles these" (LD 42 D2/D19/D22) | `HireExpertDialog`, `POST /api/trips/:id/advisors`, routing rail | #1109 (assigned expert required) | Free to hand off; expert services priced as listings |

**LD 41 (b) line, stated once (ledgers `2026-09-05-draft-only-on-empty`, `2026-09-05-draft-sketch-optimize-plan`; §I
Q3 as RULED, R126):** the only free AI write is B5 on an empty slip. "Empty" stays the ratified bare count of
`itinerary_items` (`docs/DECISIONS.md:520`, unchanged) — **an open option set does not make the slip non-empty.**
The free draft may **build around** open sets (their slots and categories are held, not filled with another item of
that category) but **never chooses between their options: choosing is the paid line.** S3 and engine-fed S1 options
are deterministic catalog ranking and write nothing until the traveler presses (brief H-Q2). Comparing options the
traveler picked is free. Any AI that picks between options, or rewrites items on a non-empty slip, is A1 (paid-run) or
S8 (paid-task). The three rows that can charge are A1, S8 and bookings reached through B7.

---

## D. Group × module matrix

● on · ○ optional (off by default, one tap to add) · — off. BASIC is on for every group and is not repeated.

| Module | Plain plan | Moments | Celebrations | Trips | Hosted events | Group travel |
|---|---|---|---|---|---|---|
| S1 Compare options | ● | ● (restaurants) | ● (venue) | ● (hotels) | ● (venue, vendors) | ● (lodging) |
| S2 Anchor & travel time | ○ | ● reservation | ● venue | ● hotel | ● venue | ● lodging |
| S3 Suggestions | ● | ● | ● | ● | ● | ● |
| S4 Move / jump to day | ● if >1 day | — (one day) | — | ● | ● | ● |
| S5 Bookings | ● | ● | ● | ● | ● | ● |
| S6 Expert suggestions | when assigned | when assigned | when assigned | when assigned | when assigned | when assigned |
| S7 Optimize preview | ● | ○ | ○ | ● | ● | ● |
| S8 Ask AI | ● | ● | ● | ● | ● | ● |
| S9 Stops | per `default_stops` | — | — | ● many (except `romance`) | ● `corporate`, `reunions` · — `wedding` | ● except `family-occasion` |
| A1 Three versions | ○ | — | ○ | ● | ● | ● |
| A2 Event schedule | — | ● (the moment) | ● | per `default_schedule` (golf, sports ●) | ● | ● |
| A3 Party & arrivals | ○ | — (two people) | ○ | ○ | ● | ● |
| A4 Guests & RSVP | — | — (proposal hidden) | ● | — | ● | ● |
| A5 Vendor coordination | — | ○ | ○ | — | ● | ○ |
| A6 Temporal anchors | ○ | ● | ● | ○ | ● | ○ |
| A7 Split activities | — | — | — | ○ | ○ | ● |
| A8 Expert handoff | ● | ● | ● | ● | ● | ● |

Where a switch already decides a module (A2 ← `default_schedule`, A4 ← `default_guests` and `default_visibility`, S9 ←
`default_stops`), **the switch wins over this table** — the table is the group default, the switch is the occasion's
own answer (LD 28), and the traveler can still flip it inside the plan.

**Default layout emphasis** (what sits first in the main column; rail order unchanged: Build · Plan · Share · Finish):

| Group | Leads with | Then |
|---|---|---|
| Plain plan | Days & items | Suggestions; "Choose an occasion" prompt in B4 |
| Moments | The one reservation (A6) + its compare set (S1) | Timeline of the evening; map with walking times |
| Celebrations | Completeness (B4) + venue compare (S1) | Event schedule; guests |
| Trips | Day list with hotel anchor (S2) | Compare hotels; suggestions per day |
| Hosted events | Completeness by vendor role (B4 + A5) | Event schedule; guests; venue compare |
| Group travel | Arrivals (A3) + lodging compare (S1) | Day list; split activities |

---

## E. Compare options

### E1. Where options live — a child table, not `itinerary_items`

**Proposed:** two additive tables. **Rejected:** a flag on `itinerary_items`, reusing `plan_proposals`, reusing
`trip_suggestions`, reusing `backup_plan_id`.

| Option | Why rejected / chosen |
|---|---|
| Flag on `itinerary_items` (e.g. `option_of`) | Every existing reader of the table treats a row as plan content: the plancard assembly, `loadTripOptimizerInputs` (`server/services/optimizer-baseline.service.ts:165-178`), `finalizeTrip`'s snapshot (`trip-finalize.service.ts:145`), `syncItemProjection` (`server/services/cart-projection.service.ts:241-257`), the routing rail, the free-draft count, apply-to-trip's delete (`plancard.routes.ts:147-151`), the workspace editor, PDF, `.ics`. A new flag is **visible by default** in all of them; each would need a new filter (the drift §18 rule 1 names). Three hotels would read as three stays. |
| `plan_proposals` | An AI change set with a charge path (`shared/schema.ts:374-420`); options are traveler/expert/engine candidates and free. |
| `trip_suggestions` | `expert_id` NOT NULL (`shared/schema.ts:527`); one suggestion, not a set. |
| `backup_plan_id` / `is_backup_plan` | Means "weather fallback" (`server/services/itinerary-intelligence.service.ts:253, 574-575`); one writer; the plancard, cart and optimizer never read it. Overloading it would give a live column two meanings. |
| **Child table** (chosen) | Invisible to every existing reader by construction. **LD 39 holds:** `itinerary_items` stays the one store of plan *contents*; an unchosen option is a *candidate*, with the same standing as a proposal or an expert suggestion, which already live outside it. Only the chosen option ever becomes an item. |

### E2. Schema (APPROVED — §I Q1, R124; build waits on map ratification)

All additive; nullable except where stated; **no DB CHECK, no DEFAULT on status** (publish-trap posture); tables and
indexes **declared in `shared/schema.ts`** (deploy-push durability rule). Both are born empty, so the partial UNIQUE
index qualifies for the §20 new-object carve-out.

**`plan_option_sets`** — one slot being decided.

| Column | Type | Notes |
|---|---|---|
| `id` | varchar pk | |
| `trip_id` | varchar NOT NULL, FK `trips` ON DELETE CASCADE | |
| `itinerary_item_id` | varchar NULL, FK `itinerary_items` ON DELETE SET NULL | The slot's item. NULL = empty slot (e.g. a REQ gap); set to the chosen row on choose. |
| `user_experience_id` | varchar NULL, FK `user_experiences` ON DELETE SET NULL | Event-bound slot (LD 29) |
| `day_number` | integer NULL | NULL = not placed. Never defaulted to 1 (audit G17). |
| `category_key` | varchar(64) NULL | `service_categories.category_key`; selects the comparison attributes (E4). NULL = uncategorised ⇒ generic attributes only. |
| `label` | varchar(120) NULL | "Where we'll stay" |
| `status` | varchar(20) NOT NULL | `open` \| `chosen` \| `closed`, app-enforced, stated once in a `shared/plan-options.ts` |
| `chosen_option_id` | varchar NULL | App-enforced reference (avoids a circular FK) |
| `chosen_at`, `chosen_by` | timestamp / varchar NULL | |
| `created_by` | varchar NULL, FK `users` SET NULL | |
| `created_at` | timestamp | |
| index | `(trip_id)`; partial UNIQUE `(itinerary_item_id) WHERE status = 'open'` | One open set per item |

**`plan_options`** — one candidate.

| Column | Type | Notes |
|---|---|---|
| `id` | varchar pk | |
| `set_id` | varchar NOT NULL, FK `plan_option_sets` CASCADE | |
| `position` | integer NOT NULL | Server-derived; UNIQUE `(set_id, position)`; cap **3** app-enforced |
| `source_kind` | varchar(20) NOT NULL | `incumbent` \| `listing` \| `affiliate` \| `saved_place` \| `custom` |
| `provider_service_id` | varchar NULL, FK SET NULL | |
| `affiliate_product_id` | varchar NULL, FK SET NULL | The partner URL never reaches the client (§16) |
| `title` | varchar(255) NOT NULL | Server-copied from the source row; typed only for `custom` |
| `location_name`, `latitude`, `longitude` | NULL | From the source row; never guessed (LD 22) |
| `price_snapshot` | decimal NULL | Display only, server-derived at add (§14). **Never charged.** NULL = not stated, never "$0". |
| `added_by_user_id`, `added_by_role` | varchar NULL | `traveler` \| `delegate` \| `expert` |
| `expert_recommendation` | text NULL | Written only by a §12 WRITE advisor (the LD 42 D4 posture); shown as "from your expert" |
| `expert_recommended_by` | varchar NULL | |
| `source_impression_id` | varchar NULL | Engine provenance, for the brief's outcome logging (brief §F phase 0) |
| `created_at` | timestamp | |

**Admission (§19):** every route parses a `.strict()` `.pick()` body. `position`, `title` (except `custom`),
`price_snapshot`, coordinates, `added_by_*`, `expert_recommend*` and `status` are never in a traveler body.
**Refusals:** one 404 for "no such set" and "not yours" (LD 40 posture).

**Rails (PROPOSED):**

| Rail | Who | Effect |
|---|---|---|
| `POST /api/trips/:tripId/option-sets` `{ itineraryItemId? , dayNumber?, userExperienceId?, categoryKey?, label? }` | owner, delegate, §12 WRITE advisor | Opens a set. With an item: refused unless the item is `in_planning` and `booking_id IS NULL`; the item becomes option 0 (`incumbent`). |
| `POST …/option-sets/:setId/options` `{ providerServiceId \| affiliateProductId \| savedPlaceId \| custom:{title, locationName} }` | owner, delegate, WRITE advisor | Adds a candidate; the server copies title/price/coords from the source. 409 at the cap. |
| `DELETE …/options/:optionId` | whoever may add | Not the incumbent. |
| `POST …/option-sets/:setId/choose` `{ optionId }` | **owner or delegate only** (RULED, §I Q6, R129) | See E3. |
| `POST …/option-sets/:setId/close` | owner, delegate | Keep the current item; set → `closed`. |
| `PUT …/options/:optionId/recommendation` `{ note }` | §12 WRITE advisor only | "Recommended by your expert" |

A `pending` advisor (LD 12, LD 51 concierge) reads sets on the plan it may read and writes nothing. **No mode lets an
expert choose (R129).** Any future expert-chooses mode needs an **explicit traveler grant** (a recorded, revocable
permission from the owner, never inferred from the advisor's §12 status), and that is a separate ruling.

### E3. Choose, adopt, finalize, money

**Choose** — one transaction, the claim first (§15):
1. `UPDATE plan_option_sets SET status='chosen', chosen_option_id=?, chosen_at=now(), chosen_by=? WHERE id=? AND status='open'` — zero rows ⇒ 409 (already decided).
2. **Empty slot:** insert one `itinerary_items` row through the same writer the add rail uses (LD 39; no second add
   rail), `origin` server-stamped (`traveler`, or `assistant` for a delegate — LD 52 C), `day_number` from the set;
   stamp `itinerary_item_id`.
3. **Slot with an incumbent:** choosing the incumbent changes nothing. Choosing another option rewrites the incumbent
   row **in place** (keeps its id, comments, event link and day), guarded in the same statement by
   `routing_status='in_planning' AND booking_id IS NULL`. Whether a traveler may replace an expert-authored incumbent
   follows the existing row-level owner-delete rule (`shared/itinerary-item-money.ts`, referenced at
   `server/services/itinerary-rebuild-guard.ts:62-70`) — not a new rule.

**Money guards — an unchosen option can never be bought, by construction:**

| Guard | How |
|---|---|
| Cart / checkout never see an option | They read `cart_items`, written only by `syncItemProjection` from an `itinerary_items` row routed `ready_for_checkout` (`cart-projection.service.ts:255-258`). Options are not items. |
| An item under an open set cannot be routed | Add `AND NOT EXISTS (open set on this item)` to the routing rail's atomic conditional (`server/routes/routing.routes.ts:214-224`); 409 "Decide between the options first". The same for the Finalize chooser's bulk route. |
| A purchased item cannot sit as an option | A set opens only on `in_planning` + `booking_id IS NULL` (E2), and the item cannot leave `in_planning` while the set is open (row above). |
| An option carries no amount into money | `price_snapshot` is display only. Checkout prices from the cart row (§14), as today. |

**Finalize:** `finalizeTrip` snapshots `itinerary_items` only (`trip-finalize.service.ts:145`), so an unchosen option can
never be in a Trip Card version. **RULED (§I Q2, R125):** Finalize is **refused** while any set is `open` (409
`open_option_sets`, listing them). The Finalize surface lists the open sets with three actions per set: **choose**,
**keep current** (close the set, keep the incumbent), **discard** (close an empty-slot set). Reopen allows new sets.
The Trip Card (LD 42 D8) shows no sets.

**Optimize / Ask AI with open sets:** see §F2. Until F2 lands, the optimizer sees only the incumbent (an open set's
incumbent is an ordinary `in_planning` item); an empty-slot set is invisible to it. apply-to-trip deletes `in_planning`
non-expert rows (`plancard.routes.ts:147-151`), so an incumbent can be deleted; the set's FK is SET NULL and it becomes
an empty-slot set — honest, not lost.

**Free draft (RULED, §I Q3, R126 — the decision-maker overrode the default):** "empty" stays the bare count of
`itinerary_items` (`docs/DECISIONS.md:520`, unchanged). A plan holding only empty-slot sets **is empty** and may get
the free draft. The draft **builds around** each open set: the set's slot (its day, event and `category_key`) is passed
to the generator as a held slot that it must not fill with another item of that category. The draft **never picks one
of the set's options**, and never closes or chooses a set. Choosing is the paid line (A1). Server side:
`ai-draft-eligibility.pure.ts` keeps its count unchanged. The draft writer skips a slot an open set holds, and a test
pins that a draft on a plan with an empty-slot set leaves the set `open` with its options untouched.

### E4. The comparison view — attributes per category

One server derivation per option (the client computes nothing); an attribute the source does not state is **omitted
with "not stated"**, never zero.

| Category (`category_key`) | Compared attributes | Sources |
|---|---|---|
| `accommodation` (hotel) | price per night × nights; travel time to the plan's located items; rating + review count; neighbourhood; cancellation terms; pin precision | `price` (`shared/schema.ts:1173`), `pricing_unit` (`:1353`), `average_rating`/`review_count` (`:1484-1485`), `neighborhood` (`:1231`), `cancellation_policy_type` (`:1471`) + text, `location_precision` (`:1413`). Travel time: straight-line median + walk estimate labelled "est." (the `anchor-scoring.ts` `medianMeters`/`walkMinutesEstimate` posture) until the brief's phase-2 matrix exists. |
| `dining_venue` | price per person; distance from the day's previous/next item; available times on the day; rating; cancellation | listing row; `vendor_availability_slots` |
| `activity_provider`, `tour_guide` | price × party; duration; start times; distance; rating; cancellation; request vs instant | listing `booking_mode` (`shared/schema.ts:1319`) |
| `venue` | capacity vs the plan's invited count; price or "quote"; distance from lodging anchor; availability on the event date; cancellation | roster `totals.invited` (LD 37); LD 49 quote listings show "priced by quote" |
| Vendor roles (photography, caterer, florist…) | price or "quote"; rating; deposit/balance terms; request vs instant | listing row |
| `custom` / external | only what the traveler typed | — |
| Affiliate option | partner price and rating as the partner states them; labelled as a partner offer | `affiliate_products`; URL server-side only (§16) |

### E5. Experts and the recommendation engine

- **Expert:** a §12 WRITE advisor (`accepted`/`assigned`) may add options and write one recommendation per set; it
  renders attributed ("Recommended by @handle", LD 40 — never a user id). The expert never chooses (LD 42 D16: the
  traveler's decision, the same line as owner-only apply in LD 45 (3)). A `pending` advisor may not write (LD 12).
  From the Workstation this is one more "Suggest" action beside `trip_suggestions` (the same assigned-expert gate,
  `server/routes/booking-actions.ts:1085-1088`).
- **Engine:** "Compare" on an item, or "See options" on a gap (brief §H2), opens the engine's ranked item candidates for
  that `category_key` (brief §B1 item grain). The traveler ticks up to three into the set. The engine never creates a
  set or an option by itself; each added option stores its `source_impression_id` so the brief's `added` outcome is
  real. Saved places (LD 55) are a source.

---

## F. Three optimized versions

### F1. What the optimizer does today

| Fact | Code |
|---|---|
| **It already produces three AI versions plus the baseline.** Baseline row "Your Plan", `source: "user"` | `server/itinerary-optimizer.ts:1021-1033`; ruling `2026-08-23-optimizer-three-variants` (`docs/design/ADOPT_OPTIMIZATION_SPEC.md` §0) |
| Model output capped at three | `itinerary-optimizer.ts:1405` |
| **Versions are distinguished by preference-driven strategy names**, not fixed objectives: two from `selectVariantStrategy` (feedback chips → event type → luxury budget → style tag → default "Budget Optimizer" + "Experience Enhancer"), a third from a pool | `:281-472` (romance set `:332`), `:476-482`, called at `:1009-1010` |
| Each version is built around an anchor: auto (hotel / neighbourhood / activity, one each) or one pinned anchor for all three | `:937-973`; `itinerary_variants.anchor_*` (`shared/schema.ts:2303-2311`) |
| Per-version metrics: `total_cost`, `total_travel_time`, `average_rating`, `free_time_minutes`, `optimization_score`, plus `itinerary_variant_metrics` rows | `shared/schema.ts:2288-2353`; written `itinerary-optimizer.ts:1575-1585` |
| Constraints: temporal anchors, day boundaries, purchased items and D3 expert work as fixed commitments | `:888-915`; `optimizer-baseline.service.ts:185-200` |
| **Free preview:** score, improvement room, weakest dimension, fixed-item count — no item specifics, no money figures | `optimization.routes.ts:170-240` (projection at `:230-239`) |
| **Pay gate:** Trip Pass → 24h free re-run → recorded payment → verified PaymentIntent | `optimizer-run-authorization.ts:125-170`; charge `optimization.routes.ts:356` |
| **Adopt whole:** apply-to-trip deletes `in_planning` non-expert rows and inserts the version, one transaction; other versions survive (R-B) | `plancard.routes.ts:51-270` (delete `:147-151`, insert `:187`) |
| **Adopt one stop:** adopt-stop appends one item, dedupes by listing then title | `plancard.routes.ts:289-385` |
| **Adopt several stops (R-A): unbuilt** | `docs/audits/adopt-finalize-conformance.md:21-22, 181-183` |

**GAPs found here**
- adopt-stop authorizes with `authorizeTripLogistics(…)` **without** `requireWriteAccess` (`plancard.routes.ts:307-311`),
  whose default admits a `pending` advisor (`server/utils/trip-logistics-auth.ts:29-34, 50-52`). Its own comment says
  "same auth spine as apply-to-trip", which passes `requireWriteAccess: true` (`:84-89`). LD 12 / LD 42 D17 say a
  pending advisor never writes. Reach is narrow (the comparison-owner check at `:299` comes first) but the gate is wrong.
  **Fix: PR #1110 (R130)** adds `requireWriteAccess: true`.
- `POST /api/itinerary-comparisons/:id/apply-to-cart` (`server/routes.ts:10396-10421`) writes a version straight into
  `cart_items` as non-projection rows, replacing the user's cart, and the board still renders it
  (`client/src/pages/itinerary-comparison.tsx:2479`). LD 39 / LD 45 (4): the cart is the projection of routed items.
  **Contained by PR #1110 (R131):** behind `COMPARISON_APPLY_TO_CART_ENABLED`, default off (410
  `apply_to_cart_disabled`), and the board button is hidden. Full retirement stays in step 7.
- `ADOPT_OPTIMIZATION_SPEC.md` §1 cites the generate handler at `server/routes.ts:8777`; it is at `:10105` now.

### F2. The delta

**(1) Three fixed objectives, labelled by measurement.** Keep three. Replace "which two strategy names" with three
objectives every run carries:

| Version | Objective | Checked against |
|---|---|---|
| **Best value** | Lowest total cost that keeps every REQ category covered | `total_cost` |
| **Least travel** | Tightest days around the anchor | `total_travel_time` |
| **Best fit** | **Until the engine's fit term is real** (today `profileMatchScore` is a constant 0.5 — brief phase 0): highest rating, then REQ coverage. After that, fit to the occasion and the traveler (brief §B4). | `average_rating`, REQ coverage |

Why: today "Romance Optimized" vs "Premium Upgrade" is a claim nothing verifies. The three proposed names each map to
a column the version row already stores, so the label can be **checked after generation**: a version keeps its badge
("Lowest cost", "Least travel", "Best rated") only if its metric actually wins among the three, else it shows no badge
(§13). **RULED (§I Q5, R128).** **Best fit must not claim personalization** while it is computed from rating and REQ
coverage. Its badge reads "Best rated" (or "Covers every essential" when coverage alone wins). No copy says "for you",
"matches your preferences" or "personalized" until the fit term is a measured profile match. Feedback chips and
occasion signals stay — as modifiers *inside* each objective's prompt, not as the choice of
objectives. The auto-anchor per version (`:962`) stays; the pinned anchor still applies to all three.

**(2) Compared options feed the run.** `loadTripOptimizerInputs` also reads open sets. The prompt says, per set,
"choose exactly one of these option ids; do not add another item of this category for this slot". The server
validates each version: a pick must name an option of that set; a version that picks none leaves that set **undecided**
in that version and says so — it never invents a fourth option. The pick is stored in
`itinerary_variant_items.metadata.optionId` (existing jsonb, `shared/schema.ts:2335`; server-written, no schema
change). The board shows, per version, which option it chose for each open set — the "3 hotels compared across 3
plans" view.

**(3) Adopt whole or in part.**

| Action | Rail | Change |
|---|---|---|
| Adopt entire version | apply-to-trip | Same transaction also **chooses** each open set the version decided (E3 claim), so the set and the items agree. Undecided sets stay open. |
| Adopt one stop | adopt-stop | If the stop carries an `optionId`, it chooses that set. The write gate is fixed in #1110. |
| Adopt several stops / a whole day | **new** `POST /api/itinerary-comparisons/:id/adopt-stops` `{ variantItemIds[] }` (R-A) | One transaction; the adopt-stop dedupe predicate; §12 WRITE gate; re-press is a no-op by the dedupe; stops with `optionId` choose their sets; `in_planning` only, purchased / with-expert / ready rows untouched (the mock's footer). "Adopt Day 2" is the client selecting that day's stops. |

**(4) Free vs paid — unchanged line.**

| Free (before the charge) | Paid (the run, LD 41 (a)) |
|---|---|
| S7 preview: score, weakest dimension, fixed count, **plus the count of open comparisons the run would decide** | The three versions, their specific items and which option each chose |
| S1 compare the traveler's own picks, side by side | — |
| B5 first draft on an empty slip | — |

Specifics stay gated: the preview never names a winning option. Trip Pass covers the run (`optimizer-run-authorization.ts:136`).
Viewing stays on the review board (LD 41 (e) compare map); the slip keeps its link back (audit F14, deferred in brief
H10).

---

## G. Rollout

Each step ships something usable and waits for ratification of the next.

| Step | Ships | Modules | Prerequisites |
|---|---|---|---|
| 0 | Nothing visible | — | **#1109** (live slip read — audit G3; no routing on finalized plans — G1; assigned expert for send — G2) and **#1110** (adopt-stop gate; apply-to-cart off). **Brief phase 0** (`recommendation-convergence-brief.md` §F): the template-key mapping module (feeds B4 and §A2's proposed column); omit-and-renormalize instead of `profileMatchScore: 0.5`; one impression row per call with `added` written (needed for S1's `source_impression_id`). **Plus the three R132 additions (brief §F phase 0, 0a–0c):** `trips.experience_type_id` declared per LD 42 D1, with an exact-evidence backfill that needs a D1 amendment and the lossy `vacation` resolved at the group level; the slip passes `events` to `useOccasionSwitches` (audit F15); `venue` rows in the matrix, with the matrix as the single source and `roles_needed` derived from it. |
| 1 | The module frame: `experienceGroupFor`, a module registry, today's zones rendered as modules in group order; list before rail on mobile (audit F11) | B1–B3, B5–B7 as-is | Step 0 |
| 2 | Completeness + day jump + move-to-day (brief H1, H6 subset) | B4, S4 | Brief phase 0 mapping |
| 3 | Compare options, traveler-picked only (listing, saved place, custom), with the routing and finalize guards | S1 | **Schema ratification (§E2)** |
| 4 | Bookings section | S5 | — |
| 5 | Engine suggestions, and engine-fed options | S3 (+ S1 source) | Brief phase 1 |
| 6 | Anchor pin and travel-time labels; option travel times upgrade from straight-line to matrix | S2 | Brief phase 2 |
| 7 | Three versions delta: fixed objectives (R128), open sets in the run, batch adopt, apply-to-cart **retired** (contained behind a default-off flag by #1110 until then) | A1 | Step 3 |
| 8 | Group-specific ADVANCED modules re-homed into the frame (event schedule, party & arrivals, guests, vendor chips, temporal anchors) and split activities (new UI on existing columns) | A2–A7 | Step 1 |

A8 (expert handoff) and S6/S8 exist today and move into the frame at step 1 unchanged.

---

## H. Platform-wide reuse

One module = one component with a `surface` prop and a read-only mode, on the `AskAiDrawer` precedent (one component,
two mounts, audit E1).

| Module | Slip (edit) | Trip Card (read-only, LD 42 D8) | Expert workspace | Discover | Cart |
|---|---|---|---|---|---|
| B2 Days & items row | ● | ● read-only (replaces `ActivitiesSection` row; no routing actions — audit G1) | ● (replaces `ItemsEditorPanel` row; audit B3 counts ≥5 item rows) | — | — |
| B3 Map | ● | ● | ● (converge the three maps later — audit H8) | — | — |
| B4 Completeness | ● | — (final) | ● replaces the "AI Gaps" heading's list (brief §H9) | — | — |
| S1 Compare options | ● choose | — (no open sets on a final plan) | ● add options, recommend | "Compare" add target when a plan is in context | — (never; E3) |
| S3 Suggestions / one recommendation card | ● | — | ● as "Suggest to traveler" | ● same card (brief §H4) | ● same card in the cart upsell slots |
| S5 Bookings | ● | ● read-only status | ● read-only | — | line status only |
| S8 Ask AI | ● | ● (already, LD 45 (3)) | — | — | — |
| A1 Three versions | link to board | — | read-only board | — | — |
| A2 / A4 Events, guests | ● | ● read-only | ● read-only | — | — |

Rule carried from LD 42 D16: the render mode never grants anything — each rail's own gate does.

---

## I. Rulings (decision-maker, Sep 26, 2026)

| Q | Question | Ruling | Ledger |
|---|---|---|---|
| 1 | Option storage | **Approved:** `plan_option_sets` + `plan_options` as §E2 specifies. | R124 `2026-09-26-plan-option-tables` |
| 2 | Finalize with open sets | **Approved:** Finalize refused while any set is open; list the open sets with choose / keep current / discard. | R125 `2026-09-26-finalize-refuses-open-sets` |
| 3 | Does an open set make the slip non-empty? | **OVERRIDE:** no. `docs/DECISIONS.md:520` stands unchanged. The free first draft may build around open sets but never chooses between their options — choosing is the paid line. | R126 `2026-09-26-open-sets-not-non-empty` |
| 4 | Groups derived or stored | **Approved:** derived by `experienceGroupFor`, no schema. Placements approved: `corporate-events` → Celebrations, `reunions` → Hosted events, `family-occasion` → Group travel. Group names are internal and never rendered. | R127 `2026-09-26-experience-groups-derived` |
| 5 | Three versions by fixed objectives | **Approved:** Best value / Least travel / Best fit; a badge only when the version's metric actually wins. Until the fit term is real (`profileMatchScore` 0.5), Best fit = rating + REQ coverage and claims no personalization. | R128 `2026-09-26-three-versions-fixed-objectives` |
| 6 | Who may choose | **Approved:** owner or delegate chooses; a WRITE advisor adds options and recommends, never chooses. A future expert-chooses mode requires an explicit traveler grant. | R129 `2026-09-26-owner-chooses-options` |

Open questions that remain are raised by §J–§L and listed at the end of §L.

*HARD STOP — design only; no code until ratified.*
