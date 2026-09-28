# Trip Slip product map — one Slip, capability modules, experience groups

> **Status header (Sep 27, 2026):** Target architecture. Build order superseded by the vertical-slice plan
> (`golden-path-trips-kyoto.md`, pending). §G to be re-sequenced in Part 3.

**Status: RATIFIED AS TARGET; M/N amendments pending** — except the §J overrides (decision-maker, Sep 27, 2026; ledger `2026-09-27-slip-map-ratified`,
R146). §I was ruled Sep 26 (R124–R129) and §J–§L's questions Sep 27 (R136–R142). The §J override record holds the one
confirmed override (R147). Build order: superseded — see the status header above. Brief section H is now steps
1–2 in build detail. Schema named here is ratified as target; M/N amendments pending, but each migration still lands in its own lane under
the Coordination Prevention rules.
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

> **SUPERSEDED (Part 3, pending ratification):** replaced by Track A / Track B in
> `docs/planning/track-a-rollout.md`, which states the fate of each step below. The table is kept for traceability.

Each step ships something usable and waits for ratification of the next.

| Step | Ships | Modules | Prerequisites |
|---|---|---|---|
| 0 | Nothing visible | — | **#1109** (live slip read — audit G3; no routing on finalized plans — G1; assigned expert for send — G2) and **#1110** (adopt-stop gate; apply-to-cart off). **Brief phase 0** (`recommendation-convergence-brief.md` §F): the template-key mapping module (feeds B4 and §A2's proposed column); omit-and-renormalize instead of `profileMatchScore: 0.5`; one impression row per call with `added` written (needed for S1's `source_impression_id`). **Plus the three R132 additions (brief §F phase 0, 0a–0c):** `trips.experience_type_id` declared per LD 42 D1, with an exact-evidence backfill that needs a D1 amendment and the lossy `vacation` resolved at the group level; the slip passes `events` to `useOccasionSwitches` (audit F15); `venue` rows in the matrix, with the matrix as the single source and `roles_needed` derived from it. |
| 1 | The module frame: `experienceGroupFor`, `shared/experience-spec.ts`, a module registry, today's zones rendered as modules in group order; list before rail on mobile (audit F11); §K1 honesty fixes; `trip-slip-spec.mjs --check` in CI (R146). **Build detail: brief section H1.** | B1–B3, B5–B7 as-is | Step 0 |
| 2 | Completeness (with "Not needed", `plan_gap_dismissals`) + day jump + move-to-day. **Build detail: brief section H2.** | B4, S4 | Brief phase 0 mapping |
| 3 | Compare options, traveler-picked only (listing, saved place, custom), with the routing and finalize guards | S1 | **Schema ratification (§E2)** |
| 4 | Bookings section, including the payer read (R143), the service fee before checkout (R144), refunded-item status (R145) and the cart's plan / standalone grouping (R142, brief H4) | S5 | — |
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

---

## J. Per-experience specification (generated)

**Generated, not hand-written.** `docs/planning/tools/trip-slip-spec.mjs` reads the occasion seed
(`server/seeds/experience-template-tabs.seed.ts`) and the matrix migration (`035_…sql`) as text. For each occasion it
applies: its **group** (§B rule) → the **group default** (§D) → its **own switches** (`default_duration`, `default_guests`,
`default_stops`, `default_schedule`, `default_visibility`, `roles_needed` — LD 28: the switch wins) → the **override
record** below. It writes this table and a JSON copy (`docs/planning/tools/trip-slip-spec.json`), which the review page
reads. **Review page:** a standalone, filterable-by-group view of the same rows, published privately at https://claude.ai/artifact/DDPBJ7seuv9GuwscncpVs7 (built from the JSON).

**How it stays in sync with the seed (RULED, R146).** `node docs/planning/tools/trip-slip-spec.mjs --check` exits 1 when
the table or the JSON no longer matches what the seed and matrix produce. It is wired into CI **at step 1** (brief H1).
At the same step the resolution moves into `shared/experience-spec.ts`, the one resolver the slip itself uses (§18 rule
1), and the script imports it instead of restating it. Until step 1 lands it is run by hand; nothing in CI fails yet
when this table goes stale.

**REQ follows the Sep 27 rulings:**
- **R138:** every Celebrations occasion has exactly one REQ, `venue`.
- **R137:** the 11 multi-day occasions with no venue role have `accommodation` REQ.
- **R141:** `proposal` keeps `dining_venue`.

**The override record is CONFIRMED (R147):** one override, `corporate-events` A5 on. R140's test: an override may
only correct a switch or matrix result for how people plan that occasion. The five other proposals were dropped:
- The three couple Trips: "optional" is already off, so there was nothing to correct.
- `family-occasion`: R137 fixed its data.
- `housewarming-party`: the general rule in §K5 replaces it.

**Columns.**
- **Modules** B1–A8 are §C's.
- **Lead zone** is what sits first in the main column (§D layout).
- **Anchor** is the anchor type, with the `temporal_anchors` type where one applies (`shared/schema.ts:53-58`).
- **REQ** is the occasion's REQ categories under the **proposed** phase-0 slug keys (brief §F phase 0 0c). It is not
  what the engine reads today; today most occasions reach no matrix rows (§A1).
- **Compare default** is the category the slip offers "Compare options" on first.
- **A1** says whether three optimized versions are offered.

<!-- BEGIN GENERATED §J TABLE (docs/planning/tools/trip-slip-spec.mjs) -->

Key: ● on · ○ optional (off by default, one tap to add) · — off · ◐ only when an expert is assigned. A superscript **ˢ** marks a cell a switch changed from the group default (LD 28); **ᵒ** marks a proposed override (below).

| Occasion | Group | B1 | B2 | B3 | B4 | B5 | B6 | B7 | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | A1 | A2 | A3 | A4 | A5 | A6 | A7 | A8 | Lead zone | Anchor | REQ (phase-0 slug key) | Compare default | A1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `bachelor-bachelorette` | Group travel | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | ● | ● | ● | ● | ● | ○ | ○ | ● | ● | Arrivals (A3) and the lodging compare (S1) | shared lodging (hotel_checkin) | `accommodation` | `accommodation` | on |
| `anniversary-trip` | Trips | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | ● | ● | — | ○ | — | — | ○ | ○ | ● | Day list with the hotel anchor (S2) | hotel (hotel_checkin) | `accommodation` | `accommodation` | on |
| `travel` | Trips | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | ● | ● | — | ○ | — | — | ○ | ○ | ● | Day list with the hotel anchor (S2) | hotel (hotel_checkin) | `accommodation` | `accommodation` | on |
| `wedding` | Hosted events | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | —ˢ | ● | ● | ● | ● | ● | ● | ○ | ● | Completeness by vendor role (B4 + A5) | venue (ceremony_time) | `venue`, `event_coordinator`, `photography`, `caterer` | `venue` | on |
| `date-night` | Moments | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | — | ● | — | — | ○ | ● | — | ● | The one reservation (A6) and its compare set (S1) | dinner_reservation (temporal anchor) | `dining_venue` | `dining_venue` | not available |
| `birthday` | Celebrations | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | ○ | ● | ○ | ● | ○ | ● | — | ● | Completeness (B4) and the venue compare (S1) | venue (event location) | `venue` | `venue` | available (optional) |
| `corporate-events` | Celebrations | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | ○ | ● | ○ | ● | ●ᵒ | ● | — | ● | Completeness (B4) and the venue compare (S1) | venue (event location) | `venue` | `venue` | available (optional) |
| `retreats` | Group travel | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | ● | ● | ● | ● | ● | ○ | ○ | ● | ● | Arrivals (A3) and the lodging compare (S1) | shared lodging (hotel_checkin) | `accommodation` | `accommodation` | on |
| `wedding-anniversaries` | Celebrations | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | ○ | ● | ○ | ● | ○ | ● | — | ● | Completeness (B4) and the venue compare (S1) | venue (event location) | `venue` | `venue` | available (optional) |
| `proposal` | Moments | ● | ● | ● | ● | ● | ○ˢ | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | — | ● | — | — | ○ | ● | — | ● | The one reservation (A6) and its compare set (S1) | proposal_moment (temporal anchor) | `photography`, `dining_venue` | `dining_venue` | not available |
| `boys-trip` | Group travel | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | ● | ● | ● | ● | ● | ○ | ○ | ● | ● | Arrivals (A3) and the lodging compare (S1) | shared lodging (hotel_checkin) | `accommodation` | `accommodation` | on |
| `girls-trip` | Group travel | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | ● | ● | ● | ● | ● | ○ | ○ | ● | ● | Arrivals (A3) and the lodging compare (S1) | shared lodging (hotel_checkin) | `accommodation` | `accommodation` | on |
| `reunions` | Hosted events | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | ● | ● | ● | ● | ● | ● | ● | ○ | ● | Completeness by vendor role (B4 + A5) | venue | `venue` | `venue` | on |
| `baby-shower` | Celebrations | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | ○ | ● | ○ | ● | ○ | ● | — | ● | Completeness (B4) and the venue compare (S1) | venue (event location) | `venue` | `venue` | available (optional) |
| `graduation-party` | Celebrations | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | ○ | ● | ○ | ● | ○ | ● | — | ● | Completeness (B4) and the venue compare (S1) | venue (event location) | `venue` | `venue` | available (optional) |
| `engagement-party` | Celebrations | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | ○ | ● | ○ | ● | ○ | ● | — | ● | Completeness (B4) and the venue compare (S1) | venue (event location) | `venue` | `venue` | available (optional) |
| `housewarming-party` | Celebrations | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | ○ | —ˢ | ○ | ● | ○ | ● | — | ● | Completeness (B4) and the venue compare (S1) | venue (event location) | `venue` | `venue` | available (optional) |
| `retirement-party` | Celebrations | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | ○ | ● | ○ | ● | ○ | ● | — | ● | Completeness (B4) and the venue compare (S1) | venue (event location) | `venue` | `venue` | available (optional) |
| `career-achievement-party` | Celebrations | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | ○ | ● | ○ | ● | ○ | ● | — | ● | Completeness (B4) and the venue compare (S1) | venue (event location) | `venue` | `venue` | available (optional) |
| `farewell-party` | Celebrations | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | ○ | ● | ○ | ● | ○ | ● | — | ● | Completeness (B4) and the venue compare (S1) | venue (event location) | `venue` | `venue` | available (optional) |
| `holiday-party` | Celebrations | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | ○ | ● | ○ | ● | ○ | ● | — | ● | Completeness (B4) and the venue compare (S1) | venue (event location) | `venue` | `venue` | available (optional) |
| `sports-event` | Trips | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | ● | ● | ●ˢ | ○ | — | — | ○ | ○ | ● | Day list with the hotel anchor (S2) | hotel (hotel_checkin) | `accommodation` | `accommodation` | on |
| `romance` | Trips | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | —ˢ | ● | — | ○ | — | — | ○ | ○ | ● | Day list with the hotel anchor (S2) | hotel (hotel_checkin) | `accommodation` | `accommodation` | on |
| `corporate` | Hosted events | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | ● | ● | ● | ● | ● | ● | ● | ○ | ● | Completeness by vendor role (B4 + A5) | venue | `venue`, `event_coordinator`, `av_tech`, `caterer` | `venue` | on |
| `milestone-birthday` | Celebrations | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | — | ● | ◐ | ○ | ● | — | ○ | ● | ○ | ● | ○ | ● | — | ● | Completeness (B4) and the venue compare (S1) | venue (event location) | `venue` | `venue` | available (optional) |
| `family-occasion` | Group travel | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | —ˢ | ● | ● | ● | ● | ○ | ○ | ● | ● | Arrivals (A3) and the lodging compare (S1) | shared lodging (hotel_checkin) | `accommodation` | `accommodation` | on |
| `honeymoon` | Trips | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | ● | ● | — | ○ | — | — | ○ | ○ | ● | Day list with the hotel anchor (S2) | hotel (hotel_checkin) | `accommodation` | `accommodation` | on |
| `golf-trip` | Trips | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ◐ | ● | ● | ● | ● | ●ˢ | ○ | — | — | ○ | ○ | ● | Day list with the hotel anchor (S2) | hotel (hotel_checkin) | `accommodation` | `accommodation` | on |
| `(plain plan)` | Plain plan | ● | ● | ● | ● | ● | ● | ● | ● | ○ | ● | ● | ● | ◐ | ● | ● | — | ○ | — | ○ | — | — | ○ | — | ● | Days & items, with a “Choose an occasion” prompt | none until set | — none | `none (no occasion)` | available (optional) |

**Overrides (data: one record keyed by slug, applied after the switches; never a separate surface). Confirmed Sep 27, 2026 (R147).**

| Occasion | Module | Value | Reason |
|---|---|---|---|
| `corporate-events` | A5 | ● | A run of show with AV, catering and a coordinator; coordination is the product that the one-day switch hides. |

<!-- END GENERATED §J TABLE -->

**What the rulings changed in this table.** Every occasion except the plain plan now has at least one REQ, so B4
completeness always has something to count (R137, R138). The compare default derives from REQ (venue, else
accommodation, else dining venue), so `family-occasion` compares lodging first without an override. `proposal`'s
`visibility: hidden` switch still drops B6 share to optional; `housewarming-party`'s `schedule: false` switch still turns
A2 off.

## K. Information levels

Three depths. Each module in §C renders at one or more of them, and **the same component renders every depth on every
surface** (the §H `surface` prop plus a `depth`). Field sources below are on `main` @ `da3174289`. Short paths: `svc` =
`server/services/trip-plan.service.ts`, `SV` = `client/src/components/plancard/SlipView.tsx`, `AS` =
`client/src/components/plancard/ActivitiesSection.tsx`, `schema` = `shared/schema.ts`.

**Status marks:** **shown** = source exists and a surface renders it. **not emitted** = the column exists but the plancard
DTO does not carry it. **not rendered** = in the DTO, drawn nowhere. **new** = derivation to build (a §C module).
**NO DATA** = no column holds it; the field is omitted until one does.

### K1. Rules (binding on every depth and surface)

1. **Never show a field the source doesn't state.** Omit it. Never a zero, a placeholder or a stand-in label. NULL
   dates, party, price, duration or rating ⇒ the row or chip is absent, not "0", "TBD" or "needed". Where the traveler
   can supply the fact, an *action* ("Set your dates", "Who's coming?") may appear in its place, worded as a question,
   never as a value. **Violations on `main` today (fixing them is step 1 scope):**
   - The Trip Card prints **"Duration needed"** on every trip item, because the trip producer never emits
     `durationMinutes` (svc:775-881; `AS` 740-751). The column exists (`itinerary_items.duration_minutes`,
     schema:5617).
   - `stats.confirmedActivities` counts the column default `planned` as confirmed (svc:1200-1202), and the card shows
     it as "confirmed/total" (`SectionTabs.tsx:49`).
   - `affiliateBooking.partnerName` carries the **product** name (`server/services/affiliate-grounding.service.ts:192`),
     so any "via <partner>" label built on it would name the wrong thing.
   - (from §L) A refunded item probably still reads **"Booked"** (L3 defect 1).
   - (from §L) `expertNote` falls back to `notes`, so a non-expert note can read "Note from <expert>" (L3 defect 3).
2. **Mobile shows GLANCE + PLAN by default; DETAIL opens on tap.**
   - Today the slip rail stacks **above** the day list below `lg` (SV:1684-1685, audit F11), so it moves after the
     list.
   - `SlipItemRow` has no expanded state (SV:605-642): a DETAIL toggle per row is **new**. The expert note, which
     renders in full today (SV:569-583), becomes one line at PLAN and full at DETAIL.
3. **The Trip Card uses the same levels, read-only.** Today it runs a second row component (`ActivitiesSection`) whose
   fields differ from the slip's (see K3). After step 1 both mount the one B2 row with `readOnly`. No routing actions
   (#1109 G1). No option sets (R125).
4. **The expert workspace opens at DETAIL.** Today its editor panel starts collapsed ("Edit items (N)", `open=false`,
   `client/src/pages/expert/workspace.tsx:818`), and its embedded card shows PLAN rows. The expert's default becomes the
   expanded row. Edit rights are unchanged (LD 42 D16; the render never grants).
5. **The group name is never a field** (R127). The occasion's own `experience_types.name` is.
6. **Audience per depth follows the route, never the render** (LD 42 D16). The owner and delegate see all three depths.
   An advisor sees what the plancard gate admits. The share viewer sees GLANCE + PLAN of the stripped share read. A
   `payer` (LD 42 D9) should see S5 at GLANCE and DETAIL, but **today the plancard refuses a payer** (§L L3 defect 7), so
   that audience needs a read path first.

### K2. Plan-level fields by depth

| Field | GLANCE | PLAN | DETAIL | Source → component | Status |
|---|---|---|---|---|---|
| Title | ● | | | `trips.title` (svc:1118) → `SlipHeader` SV:408-410 | shown |
| Occasion name | ● | | | `experience_types.name` via `useOccasionSwitches` (SV:1453-1464). Never the group. | shown when resolved; omitted when NULL (Plain plan) |
| Stops / destination | ● | | ● full list, located flag per stop | `destinations[]` (`trip_destinations`, schema:321-330) → SV:480-484; `SlipRail.tsx:899-906` | shown |
| Dates | ● (or "Set your dates" action) | day headers | | `start_date`/`end_date`; `dates_confirmed_at` (LD 30) → SV:412, 422-428 | shown |
| Time zone | ● when set | | | `trips.timezone` (svc:1166) → SV:486-490 | shown; omitted when NULL |
| Party / invited | ● "N traveling · M invited" (LD 42 D21) | | ● participants (A3) | `trips.travelers`, `GET /api/trips/:id/guests` `totals.invited` → SV:430-452 | shown. `adults`/`kids` are **not emitted** (svc:1136). |
| Countdown | ● only with zone + confirmed dates (LD 45 (8)) | | | `shared/plan-timing.ts` | shown on Home/Card; **new** on the slip |
| Completeness "N of M essentials" | ● | per-day gap cards (brief H2) | ● list per REQ category | **new** B4 over the phase-0 slug keys (§J REQ); "Not needed" counts as covered (R137, `plan_gap_dismissals`) | new; **omitted** only for the plain plan, which has no REQ (never "0 of 0") |
| Next action | ● one line | | | `nextActionFromCounts` (`client/src/lib/plan-row-model.ts:87-98`) | exists, shown on My plans only; **new** on the slip |
| Routing counts | ● | | | `SlipStatusStrip` SV:524-565 | shown |
| Plan total | ● when any item is priced | per-day subtotal | ● breakdown by category | sum of `itinerary_items.estimated_cost` (the workspace sums it, `workspace.tsx:4023-4043`) | **new** on the slip; omitted when nothing is priced. See §L budget row. |
| Budget (per event, derived) | ● when any event states one | | ● per event | `user_experiences.budget` → `planBudgetLine` SV:1519, `SlipRail.tsx:936-940` | shown in the rail |
| Final version / revising | ● | | | `finalizedAt`, `finalVersion` (svc:1145-1152) → SV:1267-1287 | shown |
| Advisor(s) | ● avatar + standing | | ● card: handle, reply time (LD 54), message | `GET /api/trips/:id/expert-advisor` → `SlipRail.tsx:695-772` | shown |
| Expert's trip note | | ● banner | | `trips.expert_traveler_note` → SV:1776-1781 | shown. `trips.expert_notes` is PRIVATE (LD 21) and never on any depth. |
| Optimized badge / what changed | ● | | ● the board | SV:383-406 | shown |
| Open option sets (S1) | ● count "2 choices to make" | ● the slot shows its set | ● compare view (§E4) | **new** (§E) | new |

**Per group, what GLANCE adds** (after the rows above; derived from §J's lead zone):

| Group | GLANCE adds | Source |
|---|---|---|
| Plain plan | "Choose an occasion" action | occasion PATCH (the one rail) |
| Moments | The anchor: reservation or moment time, venue name | `temporal_anchors` (`dinner_reservation` / `proposal_moment`) |
| Celebrations | Event date and time; invited count | `user_experiences.event_date`/`start_time` (LD 35); roster totals |
| Trips | Nights; the hotel anchor's name | booked stay item / `hotel_checkin` anchor |
| Hosted events | Vendor roles covered "4 of 6" | `roles_needed` vs items' `service_categories` (**new**, with B4) |
| Group travel | Arrivals stated "5 of 8" | `trip_participants.arrival_datetime` count (**new**) |

### K3. Item fields by depth and category

PLAN row fields common to every category: **time** (`start_time`, SV:676), **title** (SV:673), **location name**
(SV:678), **routing badge** (SV:761), **kind chip** (SV:762, `shared/item-kind.ts`), **origin chip** (SV:763, LD 42
D23), **booked ref** (SV:588-593), **expert note, first line** (full at DETAIL), **comment toggle** (`ItemComments`). At DETAIL on every category: **the
traveler's own note** (`itinerary_items.description` — written by the slip today, **not emitted**; §L), end time
(`end_time`, emitted, not shown), and **availability** (`available: false` + reason when the listing or partner product
is no longer offered — **new**, §L).
**Price at PLAN** only for a `ready_for_checkout` or booked item (SV:599). Estimated price moves to PLAN only where the
source states it. Card-only fields today (`AS`): type chip, status chip, vendor phone, confirmation number,
`changes[0]` — these become DETAIL on both surfaces.

| Category | PLAN adds | DETAIL adds | Sources | Missing / NO DATA |
|---|---|---|---|---|
| **Accommodation** | Check-in / check-out day; nights | Price per night × nights; rating + reviews; neighborhood; check-in/out times; house rules; amenities; min stay; cancellation terms | `itinerary_items.check_in`/`check_out` (schema:5714-5715, **not emitted**); `provider_services.price` 1173, `pricing_unit` 1353, `average_rating` 1484, `review_count` 1485, `neighborhood` 1231, `check_in_time`/`check_out_time` 1375-1376, `house_rules` 1377, `amenities` 1378, `min_stay_nights` 1382, `cancellation_policy_type` 1471 | Star class: NO DATA. Room capacity: only `category_attributes.units`. API hotels (`hotel_cache` 4095-4123) have no FK from items. |
| **Dining** | Time; party size when stated | Price per person; rating; cuisine; hours; cancellation | `provider_services.price_type='per_person'` 1174, `party_size_min/max` 1264-1265, `seating` 1270; `restaurant_cache` 4327-4342 (cuisine, price_level, rating — **no FK from items**) | Cuisine on listings/items: NO DATA. Opening hours: DMO jsonb only (`dmo_extracted_places.enrichment.openingHours`, via `itinerary_items.dmo_extracted_place_id` 5643, **not emitted**). Dietary options: NO DATA. |
| **Activity / tour** | Duration | Start windows; meeting point; what to bring; access notes; what's included; request vs instant; lead time; change cutoff | `duration_minutes` (item 5617, **not emitted**; listing 1258), `earliest/latest_start_time` 1260-1261, `meeting_point` 1199, `what_to_bring` 1223, `access_notes` 1224 (LD 24: NULL = omitted), `what_included` 1416, `booking_mode` 1319, `lead_time_hours` 1194, `change_cutoff_hours` 1271; slots `vendor_availability_slots` 3904-3935 (`slot_id` on the item **not emitted**) | — |
| **Venue** | The event it hosts | Price or "priced by quote" (LD 49); capacity vs invited; availability on the event date; cancellation | `userExperienceId` (SV:1895); `service_quotes` 11306-11335; roster `totals.invited` | **Capacity: NO DATA** (no guest-capacity column; `party_size_max` is the nearest and means something else). Layout and hours: NO DATA. |
| **Vendor roles** (photography, caterer, florist, …) | Quote state when a quote exists | Price or quote; deposit terms; deliverables; delivery time; rating; request vs instant | `deposit_*` 1304-1307; `price_type='custom_quote'` 1174; `service_quotes.itinerary_item_id` 11333 (**not emitted**); `deliverables` 1473; `delivery_timeframe` 1181; photography attrs (migration 055:35-38) | Caterer/florist attributes (per-head minimum, cuisine, stems): NO DATA. |
| **Transport** | Leg line between items: mode + minutes | Alternatives; pickup point and time; price range; booking status; confirmation ref | `transport_legs` 7913-7961 → `LogisticsRow` SV:1142-1167; `transport_booking_options` 8006-8060 | Driver phone and ride details: typed on the client (`plancard-types.tsx:387-398`), **no server source** — omitted. |
| **Affiliate** | "Partner offer" chip; partner-stated price | Partner rating; description; highlights; includes; availability window | `affiliate_products` 6650-6692; plancard carries only a booking token (§16) | Partner **name**: the DTO's `partnerName` is the product name (K1 violation). Per-night unit, cancellation, neighborhood: NO DATA. The URL never reaches any depth (§16). |

### K4. DETAIL beyond the item

| View | Fields | Source |
|---|---|---|
| Compare view (S1) | §E4 attributes per category, "not stated" omitted | §E4 |
| Vendor detail | Name, handle, verification badge, rating, cancellation terms, deposit, request vs instant | `GET /api/services/:id`, `GET /api/services/:id/provider-verification` (LD 40). No plan row links there today — **new** link. |
| Expert detail | Handle, standing on this plan (§12), measured reply time (LD 54, omitted under 5 threads), available now | `ExpertCard` (`SlipRail.tsx:695-772`), `server/services/live-status.service.ts` |

### K5. A single custom venue is the anchor automatically (R147)

When a plan holds **exactly one venue and it is a `custom` venue** (the host's home, a friend's garden), that venue
**is** the plan's anchor, set automatically:
- **S2 stays on and never asks the traveler to choose an anchor.** They already know it.
- **Travel-time labels from it work once its address is set,** and a guest navigates to that address.

This is a rule for any plan that fits, not an override for one occasion. It resolves `housewarming-party`, and any
at-home party, with no override.

- **The home enters the plan as a venue, never as a dismissal.** It is a `custom` venue item carrying an address,
  from the existing custom-venue rail (`custom_venues`, owner-scoped per §14 reads). "Not needed" on a REQ `venue`
  slot means "this plan doesn't need a venue", which is false here. So the custom venue **covers** the venue REQ
  (B4), and "Not needed" is not the mechanism.
- **Located or not:** the anchor is the venue's located pin once its address geocodes (LD 22: never guessed). Until
  then S2 shows the venue as the anchor, "address not set yet", with no travel times (§K1). It never falls back to a
  city centre.
- **Otherwise the normal choice applies:** with two or more venues, or one non-custom venue, S2 asks as it does today
  (§E4, brief phase 2).

**Sections that §L adds to this one** are marked in §L's cross-check (rows tagged "→ K").

## L. Slip ingredient inventory

Derived from code on `main` @ `da3174289`, not from memory; it extends audit §D. **L1** is every ingredient the slip reads
or writes today, plus the ones the map's modules add. **L2** cross-checks the decision-maker's candidate list. **L3**
names orphans and unmet dependencies. Writers: T traveler (owner) · D delegate (EA, LD 52) · E expert (§12 advisor) · P
provider · S system · AI. Readers use the same letters, plus **G** for a share-link viewer and **$** for a `payer`
participant. Levels: **GL** GLANCE · **PL** PLAN · **DT** DETAIL. Status: **shown** / **not shown** (exists, the slip
renders nothing) / **missing**.

### L1. What the slip reads and writes today, and what the modules add

**One read feeds almost everything:** `GET /api/trips/:tripId/plancard` (PR = `server/routes/plancard.routes.ts:390-551`) →
`assembleTripPlan` (TPS = `server/services/trip-plan.service.ts:562-1209`), which also carries `events`, `destinations`
and `aiSketch` from the route. **Gate:** a collaborator row, an advisor in any §12 access status, the author, or the EA as
`delegate` (PR:395-419). **A `payer` participant is refused (403)** unless they also hold a collaborator row, so LD 42 D9's
payer audience cannot read the slip today. The share viewer (G) never reaches the plancard; `GET /api/trips/shared/:token`
(`server/services/booking-actions.service.ts:385-413`) is a separate, stripped read. **As of `main` @ `da3174289` the slip
renders the latest `trip_finals` snapshot once one exists (TPS:87-101, 646-650). #1109 makes the slip read live and
leaves the snapshot to the Trip Card**, which removes the paper-vs-screen and prefill-vs-row mismatches noted in L3.

Readers: O owner · D delegate · Ep pending advisor · Ew write-status advisor · G share viewer · $ payer.

**B1 Plan header**

| Ingredient | Source | Writer | Readers | Level | Status |
|---|---|---|---|---|---|
| Title, destination, dates | `trips.title`/`destination`/`start_date`/`end_date` (TPS:1118-1123) | T (dates via `PATCH /api/trips/:id`) | O D Ep Ew G | GL | shown (SV:409-412) |
| Dates confirmed | `trips.dates_confirmed_at` → `datesConfirmed` (TPS:1181) | S on a T date write | all | GL | shown (`SetPlanDates` SV:422-428) |
| Phase chip | derived from dates (SV:212-218) | S | all | GL | shown |
| Party | `trips.adults`/`kids`/`number_of_travelers` → `plancardPartyCount` (TPS:1136) | T (plan modal step 4) | O D Ep Ew (G: count) | GL | shown |
| Party noun, hidden badge | `experience_types.vocabulary`, `default_visibility` via `useOccasionSwitches` — **called without events** (SV:1464, SR:961) | seed | O D Ep Ew | GL | shown (resolution lossy — step 0b) |
| Invited count | `GET /api/trips/:tripId/guests` `totals.invited` | T | **O only** | GL | shown |
| Events count | `user_experiences` by `trip_id` (PR:453-475) | T | O D Ep Ew | GL | shown |
| Stops | `trip_destinations` name/position (PR:488) | T | O D Ep Ew | GL | shown; stop lat/lng **not shown** (no stop pins) |
| Time zone | `trips.timezone` (TPS:1166) | S at mint | O D Ep Ew | GL | shown |
| Optimized badge | `item_transition_log` `variant_applied` + `lastComparisonId` | AI (optimizer) | O D Ep Ew | GL | shown |
| AI-sketch line | `isUntouchedAiDraft` over live rows (PR:501) | AI | O D Ep Ew | GL | shown |
| Final banner / version | `trips.finalized_at`, `trip_finals.version` | T | O D Ep Ew | GL | shown |
| Routing counts | `routing_status` + booking per item | S | O D Ep Ew | GL | shown |
| Delegate note | `tripRole='delegate'` | S | D | GL | shown |
| `trips.budget`, `status`, `tracking_number` | TPS:1120, 1137, 1140 | T / S | O D Ep Ew | — | not shown (deliberate for tracking) |
| Pen write on load | `activateOpenedPlan` → `PUT /api/trip-context` (SV:1309-1328) | S | — | — | written every load; #1109 stops it carrying occasion keys |

**B2 Days & items**

| Ingredient | Source | Writer | Readers | Level | Status |
|---|---|---|---|---|---|
| Day number, date, heading | `itinerary_items.day_number` + `trips.start_date` (TPS:883-907) | T D E AI | O D Ep Ew G | PL | shown |
| Title, start time, location | `title`, `start_time`, `location_name‖location_address` | T D E AI | O D Ep Ew G | PL | shown |
| End time | `end_time` (TPS:783) | T D E AI | O D Ep Ew | PL | **not shown** |
| Order | `sort_order`; `POST /api/trips/:tripId/itinerary/reorder` (write gate) | T D | O D Ep Ew | PL | shown |
| Add / edit / delete | `POST …/itinerary-items` (RT:12781, `origin` stamped), `PATCH` (TR:3037), `DELETE` (TR:3208) | T D | — | PL/DT | shown |
| **Traveler's own note** | `itinerary_items.description`, written by slip add/edit (`slip-item-tools.ts:199, 226`) | T D | O D Ep Ew **G** | DT | **not shown on the slip** (the share view shows it) |
| Routing badge / actions | `routing_status`; `POST …/items/:itemId/route` → `syncItemProjection` | T; Ew one edge | O D Ep Ew G | PL | shown |
| Origin chip, kind chip | `origin`; `booking_id`/`provider_service_id`/`affiliate_product_id` | S | O D Ep Ew | PL | shown |
| Booked ref | `confirmation_number‖booking_reference`, `booking.id` | P / S | O D Ep Ew | PL | shown |
| Cost | `estimated_cost` (TPS:809) | T E AI | O D Ep Ew G | PL | shown only when `ready_for_checkout` |
| Expert note | `expert_note ‖ notes` (TPS:802) | E | O D Ep Ew | PL/DT | shown — **the `notes` fallback can label a non-expert note "Note from <expert>"** |
| Meeting point, vendor phone, maps URL, visited, change entry, `source`/`suggestedBy` | TPS:529-538, 701-708, 790-815 | P / T / S | O D Ep Ew | DT | on the payload, **not shown** |
| `duration_minutes`, `check_in/out`, `quantity`, `slot_id`, `participant_ids`, `attendance_requirement`, `private_notes`, `travel_from_previous`, `energy_cost`, `currency`, `gem_id`, `dmo_extracted_place_id` | `itinerary_items` (schema:5609-5850) | various | — | DT | **not emitted** |

**B3 Map · B5 First draft · B6 Share · B7 Finish**

| Ingredient | Source | Writer | Readers | Level | Status |
|---|---|---|---|---|---|
| Item pins; geocode write-back | `latitude/longitude`; missing ones geocoded and **written back**, up to 12 per request (TPS:335-371) | S (external geocoder) | O D Ep Ew | PL | shown |
| "X of Y located" | derived | S | O D Ep Ew | GL | shown |
| Legs polylines, notes layer, day `.ics`/Maps | `transport_legs`; expert notes; client-built | E / S | O D Ep Ew | PL/DT | shown |
| Draft vs Optimize switch | `slipBuildAiAction` (`slip-rail.ts:60-63`); server 409 `slip_has_items` | S | O | GL | shown |
| Draft run | `POST /api/ai/generate-itinerary` (CR:4782) → items `origin='ai'` | AI | O | GL | shown |
| Share link | `POST /api/trips/:id/share` → `shared_trips` (90 days) | T | O | GL | shown |
| PDF / `.ics` | `GET /api/trips/:tripId/pdf` (TR:1322), `/calendar` (TR:1402), live items + zone | S | O, advisors, author | DT | shown |
| Finalize / Reopen | `POST …/finalize` (`trip_finals`, `finalized_at`, notifications), `POST …/reopen` | T | O | GL | shown |
| Finalize chooser | route to checkout (bulk); `POST /api/affiliate-booking-requests`; `POST /api/expert-requests` | T | O | DT | shown |
| Save-card prompt | `GET /api/me/payment-methods` | S | O | GL | shown (no module) |

**S-modules**

| Module | Ingredient | Source | Status |
|---|---|---|---|
| S1 | Option tables, six rails, attribute derivation, routing and finalize guards, impression provenance | §E (R124/R125) | **missing (approved design)** |
| S1 | Listing inputs for the compare view | `provider_services.price`, `pricing_unit`, `average_rating`, `review_count`, `neighborhood`, `cancellation_policy_type`, `location_precision`, `booking_mode` | exist, not shown |
| S2 | Day legs (mode, minutes, cost) | `transport_legs` (selected variant + expert-confirmed) | shown (`LogisticsRow` SV:1142-1167) |
| S2 | Leg pickup, distance, alternatives; confirm/dismiss; change mode | TPS:276-316; `PATCH /api/transport-legs/:legId/status` (PR:609), `/mode` (TR:2239) | exist, no slip control |
| S2 | Anchor candidates | `GET /api/trips/:id/anchor-candidates` → `BuildAroundDialog` | shown (feeds Optimize only) |
| S2 | Anchor pin, travel-time labels, matrix | brief phase 2 | missing |
| S3 | Engine slate on the slip (`slip_gaps`/`slip_suggestions`), `added` outcome | `upsell-engine.service.ts` (not mounted on the slip) | missing |
| S3 | Saved places in the plan's cities | `GET /api/saved-items` → add rail (LD 55) | shown |
| S4 | Move to day (edit form has no day field, `slip-item-tools.ts:62`); sticky day chips | — | missing |
| S5 | Bookings list, per-item booking status/amount, deposit/balance/due | `plan.bookings[]`; `service_bookings.deposit_amount`/`balance_amount`/`balance_due_at` (not emitted) | **not shown** |
| S5 | Payer read path | plancard gate refuses a payer | missing |
| S5 | Real spend | `budget.spentBreakdown` (paid `trip_transactions`) | not shown |
| S6 | Suggestions, approve/decline | `GET/POST/PATCH /api/trips/:id/suggestions` → `trip_suggestions`; approve inserts `origin='expert'` item | shown |
| S7 | Preview, fee, Trip Pass | `GET /api/optimization-preview`, `/api/optimization-fee`, `/api/trips/:tripId/trip-pass` | shown; `improvementRoom`/`dimensions` not shown; open-set count missing |
| S8 | Proposals, ask/discard/pay/apply | `GET/POST /api/trips/:tripId/proposals…` → `plan_proposals` | shown (O, Ew); hidden from D by the client |
| S9 | Stops edit | plan modal → `plan-stops-writer` (LD 34) | shown |

**A-modules**

| Module | Ingredient | Source | Status |
|---|---|---|---|
| A1 | Comparison create + pay gate; link back | `POST /api/itinerary-comparisons`, `/api/optimization-payments` | shown (navigation) |
| A1 | Metrics, optimization delta, `lastOptimizedAt`, stats | TPS:909-927, 1028-1051, 1192-1206 | on the payload, **not shown** |
| A1 | Fixed objectives + earned badges (R128), `metadata.optionId`, `adopt-stops` | §F2 | missing |
| A2 | Events, roles, time/budget edit | `events[]`; `PATCH /api/user-experiences/:id` | shown |
| A2 | Organize into events | presets + `POST /api/user-experiences` | shown — **does not refresh the plancard** (`SlipOrganizeEvents.tsx:136-138`) |
| A3 | Party members | `/api/trips/:tripId/participants`, `/api/participants/:id` → `trip_participants` | shown (O, DT) |
| A3 | Email, phone, dietary, payment status, emergency contact, event attendance; `trips.accessibility_note` | `trip_participants`; `trips` | exist, not shown |
| A4 | Roster totals; invite management | `GET /api/trips/:tripId/guests`; `GuestInviteManager` → `event_invites` | shown (O) |
| A5 | Role chips; contracts board; coordination card | `roles_needed` → browse; `/api/trips/:tripId/contracts`; `/api/coordination-states` | shown (O) |
| A5 | "Is anyone listed for this role here?" | — | missing (supply read, L2) |
| A6 | Anchors, schedule check, presets | `/api/trips/:tripId/anchors`, `validate-schedule`, `anchor-suggestions` | shown (DT) |
| A6 | Energy read | client calls `GET /api/trips/:tripId/energy`, **no server handler** | missing (a broken read) |
| A7 | `participant_ids`, `attendance_requirement`, `min/max_participants` | `itinerary_items` (not emitted) | exist, no UI |
| A8 | Advisors, hire, message, plan approval, item thread | `GET /api/trips/:id/expert-advisor`; `POST /api/trips/:tripId/advisors`; `POST /api/conversations/start`; `meta.planApproval` + `POST …/plan-review`; `…/comments` | shown |
| A8 | Advisor bio, specialties, rating, review count | same read | not shown |

**What the modules add (all missing today):** `plan_option_sets`/`plan_options` + six rails (S1, R124); the Finalize
open-set refusal (B7, R125); `experienceGroupFor` and a module registry (step 1, R127); the completeness derivation over
phase-0 slug keys, and an item → `category_key` derivation — `itinerary_items` has **no category column**, so it can
only be read through `provider_services.category_id` (B4); `trips.experience_type_id` (0a); a supply read per market ×
category (S1/S3/A5); fixed-objective metadata and `adopt-stops` (A1, R128); a day field on the edit form (S4); the S5
section with deposit/balance fields and a payer read path; per-item `available` from the catalog liveness predicate
(L2).

### L2. Candidate list cross-check

Each row: **found** (exists and the slip or its module can use it), **partial** (exists but incomplete, off-slip, or
never written), **absent**. "→ K" marks an ingredient §K now carries because of this check.

| Candidate | Mark | Evidence | Notes for the map |
|---|---|---|---|
| **Budget target** | partial | `trips.budget` (schema:131) is still body-settable through `insertTripSchema` but has **no live client writer**. Per-event `user_experiences.budget` (LD 29) is the ruled home, and its derived total renders in the rail (`client/src/lib/plan-budget.ts:79-128`, `SlipRail.tsx:936`). | Per-event budget is the target (LD 29). `trips.budget` is not surfaced: a second stored number (§18 rule 1). |
| **Running plan total** | partial | The payload's `budget.spentBreakdown` sums paid `trip_transactions` (`trip-plan.service.ts:461-488`), and each item's `estimated_cost` is on the DTO. **The slip reads neither**, and no total of item costs exists on the slip. | → K (K2 "Plan total", new). Omitted when nothing is priced. |
| **Per-person split** | partial (off-slip) | `budget.service.ts:187 calculateSplit`; `POST /api/trips/:tripId/budget/calculate-split`, `…/settle-up` (`routes.ts:12580-12666`); UI in `components/logistics/budget-intelligence.tsx` (Trip Card / logistics dashboard). `trip_participants.amount_owed/paid` deliberately not rendered (`SlipTravelingParty.tsx:31-36`). | §15d phase two (the real split) is unstarted. No module owns it on the slip; recorded in L3. |
| **Service fee + per-booking cap (`fee_bands`)** | found (off-slip) | `resolveTravelerServiceFee(Snapshot)` (`server/services/fee-resolution.service.ts:271, 339`); public `GET /api/pricing` `serviceFeePct`/`serviceFeeCapCents` (`pricing.routes.ts:94-95`). Shown on `/pricing`, and the charged amount only **after** checkout (cart.tsx:3084-3097). | **Gap:** no pre-checkout disclosure on the slip or in the cart. The #1109-era quote rule (disclose before accept, ledger `2026-09-20-quote-fee-preaccept`) has no slip twin. Owner: B7 Finish / S5 Bookings (DT). |
| **AI task fee + waiver** | found | `GET /api/trips/:tripId/proposals` `aiTask {coveredByTripPass, priceCents}` (`trips.routes.ts:3491-3534`) → `askAiPriceLine` → AskAiDrawer on the rail. | S8, DT. Shown. |
| **Optimizer fee** | found | `GET /api/optimization-fee` (`optimization.routes.ts:254`) → `SlipRail.tsx:338-343, 629-661`. | S7/A1, DT. Shown (owner). |
| **Trip Pass entitlement** | found | `trip_entitlements` (schema:9368), `coversAction` (`trip-entitlement.service.ts:56-89`), `GET /api/trips/:tripId/trip-pass` owner-only → `TripPassCard` (`SlipRail.tsx:614-616`). | Build card, GL for the owner. An advisor gets 403, correctly. |
| **Supply per market × category** | absent (as a read) | No endpoint counts supply by market × category. Nearest: admin `GET /api/admin/markets` (per-market readiness, no category), `GET /api/service-categories/provider-counts` (no market), `GET /api/experts/counts?location=`, admin `optimizer/gap-fills` (demand side). | **New ingredient** for S1/S3/A5/B4: `supplyFor(market, category_key)` over native listings, expert offerings, Gems, affiliate, DMO places. Owner: brief phase 1 (gatherers). |
| **Empty-supply state per module** | partial | Existing honest empties: BuildAroundDialog "No hotels … scored near your stops yet" (`BuildAroundDialog.tsx:59-61`); HireExpertDialog "No experts are listed for {destination} yet" (`:204-207`); role chips render nothing on NULL `roles_needed`; SlipSavedPlaces renders nothing. | Rule for every module: **one sentence naming the market and category, never a zero**. S1 "compare" and S3 "suggestions" need it; the new supply read (above) feeds it. |
| **Preferences: pace, mobility, dietary, style** | partial | `users.preferences.travelerProfile.explicit` via `GET/PATCH /api/me/traveler-profile` (`traveler-profile.routes.ts:55,68`) — **no client caller**. Style + budget band on profile.tsx (`/api/me/travel-preferences`). Per-generation answers go to the AI prompt only. `trip_participants.mobility_level`/`accessibility_needs` editable on the slip (A3); `dietary_restrictions` column exists, **not in the form**. `trips.accessibility_note` edited in the modal, **not on the plancard DTO**. | No module owns the traveler profile on the slip. Recorded in L3; → K (A3 participant fields at DT). |
| **Transport legs + mode** | found | `transport_legs` (schema:7913); confirmed legs reach the payload; `LogisticsRow` (SV:1142-1167). Expert confirms (Workstation). | PL. Shown. |
| **Flight / arrival inputs** | partial | `trip_participants.arrival_datetime` (written, **no server reader**); `temporal_anchors` `flight_arrival`/`flight_departure` (owner, `TemporalAnchorManager` in SlipLogisticsSection); `trip_selected_flights` (schema:700) has **zero references** (dead). | A3/A6. Group travel GLANCE "arrivals stated" (K2) reads `arrival_datetime`. `trip_selected_flights` → §18c candidate. |
| **Opening hours** | partial | Only `dmo_extracted_places.enrichment.openingHours` (schema:10308), linked by `itinerary_items.dmo_extracted_place_id` (not emitted). | → K (dining/activity DT, NO DATA except DMO places). |
| **Availability** | found (off-slip) | `vendor_availability_slots`, patterns, blackouts; checked at cart add and checkout. A re-date does **not** re-validate (`routes.ts:1571-1580`, stated). | S1 compare "available times on the day" (E4) needs a slip-side read. |
| **Weather fallback** | partial | `itinerary_items.weather_dependent`, `backup_plan_id`, `is_backup_plan`, `weather_conditions` (schema:5670-5675); `POST /api/itinerary-items/:id/backup` has **no client caller**; no trip weather service. | Orphan (L3). Not a module in the map; deliberately not reused for options (§E1). |
| **Item status: routing / handshake / finalize** | found | `routing_status` + `RoutingBadge`/`ItemKindBadge`/`OriginBadge` (SV:760-764); `meta.planApproval` → `PlanApprovalBanner`; `trip_suggestions` → `ExpertSuggestionsPanel`; `finalized_at` / `trip_finals.version` → Finish card and the primary banner. | Shown. One status grammar per row (PL): routing badge + booked ref; finalize state at GL only. |
| **Comments** | found | `trip_item_comments`; `GET/POST /trips/:tripId/items/:itemId/comments` (owner ↔ advisor, author). | PL toggle. **A delegate cannot comment** (route 403), a gap LD 52 did not decide. |
| **Expert notes** | found | Per-item `expert_note` (all slip viewers), trip `expert_traveler_note` (all viewers), private `expert_notes` (Workstation only, LD 21). | PL first line / DT full (K1 rule 2). |
| **Messages** | found | D22 advisor thread `POST /api/conversations/start {tripId}`; entry row in the Build card (owner). | Entry only; the thread is `/chat`. |
| **Notifications** | found (off-slip) | `notifications` (schema:1966); the slip is the bell's landing page. | No slip module. |
| **Owner vs delegate vs expert visibility** | found | `client/src/lib/slip-viewer-role.ts` (owner/expert/delegate/other). | Every L1 row's reader column. |
| **Currency** | absent (trip) / partial | No currency on `trips`; `plan-budget.ts:95-116` hardcodes USD; `itinerary_items.currency` (not emitted); `provider_services` has no currency; `users.preferred_currency` used by the cart only. | Every price at every depth is USD today. A currency ingredient is **missing**, so no depth may convert (§13). |
| **Time zones across stops** | absent | `trip_destinations` has no timezone; one `trips.timezone` per plan (LD 30). | A multi-zone plan reads in one zone. Missing ingredient for S9 + countdown. |
| **en/ja** | partial | `client/src/locales/{en,ja}/…`, `language-menu.tsx`; **no plancard/slip file uses `useTranslation`**. | All slip copy is English. Missing for every module. |
| **Signed-out / guest slip** | absent | `/plans/:tripId` is `ProtectedRoute` (`App.tsx:680-686`) and the plancard is `isAuthenticated`. The guest pen and guest cart are client-side only (sessionStorage `experienceContext`, localStorage `traveloure_guest_cart_pending`). `trips.share_token` has **no live writer**. | There is no guest slip; G2 is HELD. The read-only public view is the share link (below). |
| **Recommendation inputs: fit** | partial | `profileMatchScore: 0.5` constant (`upsell-query.service.ts:232`). | R128 forbids a personalization claim until this is real. |
| **… proximity** | partial | Coarse `PROXIMITY_FIT` by coverage match (`upsell-query.service.ts:135`); affiliates fixed 0.4. | Brief phase 2 replaces it. |
| **… trend** | absent in the engine | TravelPulse `trendScore` lives in `recommendation.service.ts:602-636` only. | Brief phase 4. |
| **… quality** | absent in the engine | Rating used by `location-view.service.ts` and `recommendation.service.ts`, not the upsell engine. | Needed by R128's interim Best fit (rating) — the optimizer's own `average_rating` metric is the source there. |
| **… boost** | partial | `featured-sort.ts` (`FEATURED_BOOST`) on city pages; the engine's "boosts" are expert endorsement (0.15) and revenue (≤0.15). | Brief §C; revenue weight 0 on the slip (brief G-4 default). |
| **Cancellation + refund by tier (R156, formerly R114)** | found (off-slip) | Tiers in `cancellation-policy.service.ts:11-14, 160-185`; snapshotted at purchase; `GET /api/bookings/:id/cancel-preview`, `POST …/cancel` (`routes.ts:8081-8200`); R156 fee refundability. Read by `my-bookings.tsx` only. | S5 Bookings (DT). The slip has no cancel control; paid rows get no tools (`slip-item-tools.ts:87-96`). |
| **Refund → item state** | partial — **suspected defect** | `revertPurchasedItemsForBooking` flips `purchased → in_planning` but **keeps `booking_id`** (`item-routing.service.ts:117-156`), and the assembler attaches a booking of any status (`trip-plan.service.ts:505-526, 821-823`). A refunded item would still read **"Booked"**. Inferred from code, not reproduced. | Filed for a fix lane; S5 depends on it. |
| **Booking changes / reschedule** | absent | No route; `offering-contract-snapshot.ts:71` says `reschedulePolicyId` is not recorded. | Missing ingredient for S5. |
| **Reopen on a partly-purchased plan** | found | `POST /api/trips/:tripId/reopen` clears `finalized_at` only; purchased items untouched. Since #1109, add-to-checkout on a finalized plan is limited to the current final version, and the client offers Reopen on `not_in_final` (R123). | B7. |
| **Mid-trip edits** | partial | No server time lock on item writes; live mode (`UpNextHero`, `isLiveDay`) only on the Trip Card. | Time-state rule needed (next row). |
| **Time state** | partial | Draft/dated (`dates_confirmed_at` → `datesConfirmed`), handover (`tripCardIsPrimary`, 48h), phase chip (`derivePhase` SV:212-220); `balance_due_at`, quote `expires_at`, slot windows, 24h free re-run (`optimizer-run-authorization.ts:47-60`) — **none of the deadlines render on the slip**; the slip calls `tripCardIsPrimary` **without a zone** (SV:1384). | **What each state disables (proposed):** draft — countdown withheld (LD 30); dated — nothing; T−48h / live — Finalize and Reopen hidden, edits stay (today); past — slip read-only (**new**, no server lock exists). Deadlines → GL "next action" when due within 7 days. |
| **Undo / edit history** | partial | No undo (LD 42 D18); `item_transition_log` records status and actor only, no content diff; `itinerary_changes` → `ChangeLogPanel` on the Trip Card only. | A "working-plan edit history" with content is **missing**; D18 forbids offering a restore without a ruled snapshot. |
| **Delisted listing / vanished affiliate product** | partial | The assembler never checks listing `status`/`approval_status`; FKs are SET NULL; checkout refuses only `archived`. A deleted affiliate product drops the agent CTA silently. **In an option set** (§E): no rule yet. | **Proposed:** a per-item and per-option `available: false` + reason, read from the same liveness predicate the optimizer uses (`optimizerCatalogLivenessWhere`); the row says "no longer offered", never silently. An unavailable option cannot be chosen. |
| **Verification badge** | found (off-slip) | `loadPublicVerification`, `GET /api/services/:id/provider-verification`; rendered on service-detail only. | → K (K4 vendor detail). Not on any slip row. |
| **Background-check gate** | found (publish-time) | `service_categories.requires_background_check` gates publishing and the upsell filter; not exposed at add time. | Publish gate is the guarantee; nothing to show per item. |
| **Cancellation terms before add** | partial | service-detail shows them before Book (`service-detail.tsx:2389-2408`); the slip's own add is free text; §E option add has none. | S1 option add and S3 suggestion add must carry the terms at DT **before** the item enters the plan. |
| **Public share view** | found | `POST /api/trips/:id/share` → `GET /api/trips/shared/:token` (90-day token); strips everything but title, destination, dates, party count, status and items (price only on purchased items). | B6, owner-only, hidden under `visibility: hidden`. The public view is read-only GLANCE + PLAN. |
| **Co-planner invites** | absent | `trip_collaborators` role `friend` has no writer; no invite route. | Missing ingredient; no module in the map. |
| **Gem bylines** | absent | `itinerary_items.gem_id` has **no writer** and is not emitted; bylines exist on gem surfaces only. | Missing for S3/S1 (a Gem as a source). |
| **Expert credit** | found | `origin` chip "from your expert"; note byline "Note from {first name}" via `meta.deliveredBy` (whose `expertId` is a raw `users.id` on an authenticated payload — LD 40's rule is about public payloads; recorded). | PL. |
| **Landing-moment attribution** | partial | `trips.moment_key` written at mint, read by the AI prompt; no funnel reader; not on the plancard. | No slip module; attribution is analytics, not a slip field. |

### L3. Orphans, unmet dependencies, and defects found

**Ingredients no module owns (orphans).**
- **Rendered, no module:** the transition-log footer (`item_transition_log`, SV:1198-1243), the save-card prompt, the
  ConciergeCard (ready-made purchases), the per-event budget total. **Proposed homes:** footer → B2 (history, DT);
  save-card prompt → B7; ConciergeCard → A8; budget total → the K2 plan-total row (GL).
- **On the payload, never rendered:** `changeLog`, `metrics`, `optimizationDelta`, `lastOptimizedAt`, `stats`, `budget`,
  `bookings`, `legs`, `tripNote` (a duplicate of `trip.expertTravelerNote`), `meta.dayCount/status/origin`,
  `trackingNumber`, and item `mapsUrl`/`meetingPoint`/`vendorPhone`/`visited`/`changes`/`endTime`. Each either becomes a
  K-level field on a named module (`bookings` → S5; `metrics`/`optimizationDelta` → A1; `meetingPoint`/`vendorPhone`/
  `endTime` → B2 DT) or is dropped from the DTO (§18c: no consumer ⇒ delete). The duplicate `tripNote` is dropped.
- **Server capability with no client:** `GET/PATCH /api/me/traveler-profile` (pace, dietary, mobility — no caller),
  `POST /api/itinerary-items/:id/backup` (weather fallback — no caller), the leg status/mode PATCHes, `GET/POST/DELETE
  /api/trips/:tripId/changes`, `trip_selected_flights` (zero references), `trip_participants.arrival_datetime` (written,
  no server reader), `computeEmptySlots` (test callers only), `itinerary_items.gem_id` (no writer).
  **Traveler preferences have no module in this map**; they need one (profile or A3) before the "fit" term can be real
  (R128).
- **Off-slip money readers:** per-person split (`budget-intelligence.tsx`), cancel preview (`my-bookings.tsx`), service-fee
  disclosure (after checkout only). S5 owns the first two; B7/S5 owns pre-checkout fee disclosure.

**Modules that depend on an ingredient that doesn't exist yet.**

| Module | Missing ingredient(s) |
|---|---|
| B4 Completeness | Phase-0 slug keys + mapping (0c); item → `category_key`; `experience_type_id` or events-first (0a/0b); one completeness module |
| B7 Finish | S1's open-set list (R125) |
| S1 Compare | Both tables and six rails; routing + finalize guards; impression provenance; supply read; per-option liveness |
| S2 Anchor | Anchor pin; travel-time matrix (brief phase 2) |
| S3 Suggestions | A slip mount of the engine; `slip_gaps`; impression `added`; supply read |
| S4 Move / jump | A day field on the edit form; sticky day chips |
| S5 Bookings | The section; deposit/balance fields in the DTO; a payer read path (payer gets 403); reschedule (no route); refunded-item state fix (below) |
| S7 Preview | Open-set count |
| A1 Three versions | Fixed objectives + earned badges; `optionId` in variant metadata; `adopt-stops`; a real fit term (R128) |
| A5 Vendor coordination | Supply read per role and market |
| A6 Temporal anchors | The energy GET route (the client calls a route that does not exist) |
| A7 Split activities | A UI, and the columns on the DTO |
| Every module | Currency (USD hardcoded), per-stop time zones, and en/ja strings on slip surfaces |

**Defects found along the way (not fixed; each is its own fix lane).**
1. **Refunded items probably still read "Booked."** **RULED (R145): fix lane `2026-09-27-refunded-item-status`, with
   the P1 money-guard work.** A refund reverts `purchased → in_planning` but keeps `booking_id`,
   and the assembler attaches a booking of any status (`item-routing.service.ts:117-156`, TPS:505-526, 821-823).
   Inferred from code; not reproduced.
2. **Traveler notes are write-only on the slip.** Add/edit writes `itinerary_items.description`; the DTO omits it; the
   public share view shows it.
3. **Possible false attribution:** `expertNote` falls back to `notes` (TPS:802), rendered as "Note from <expert>" (LD 42
   D4's false-attribution class).
4. **"Organize into events" and guest-list set-up don't refresh the slip** (they invalidate `/api/user-experiences`
   only).
5. **`GET /api/trips/:tripId/energy` has no server handler** (`energy-budget-display.tsx:50`).
6. **A pending advisor can post item comments** (`resolveItemCommentRole` counts `pending`, BA:1607-1611). **RULED
   (R139): LD 12 holds; a pending advisor may not comment.** The code still allows it, so it needs a fix lane.
7. **A `payer` participant cannot open the plancard** (403), although LD 42 D9 makes the payer part of the bookings
   audience. **RULED (R143): payers read the plancard;** lane `2026-09-27-payer-reads-plancard`, part of step 4.
8. **The Trip Card prints "Duration needed"**, and `confirmedActivities` counts `planned` (K1).
9. **`deliveredBy.expertId` is a raw `users.id`** on the (authenticated) plancard payload. LD 40's guard covers public
   payloads only, so this is recorded, not flagged as a violation.
10. **PDF/`.ics` vs slip**, and **edit prefill vs row**, disagreed while the slip rendered the snapshot. #1109's live read
    closes both for the slip. The comment at `SlipRail.tsx:1023-1025` claiming they cannot disagree was wrong before
    #1109.

**Where §L changed §J and §K.** §K gained:
- the traveler's own note (B2, DT);
- the plan total (GL);
- per-item availability (DT);
- the K1 violation list (items 1, 3 and 8 above);
- the payer audience gap.

§J needed no change: no ingredient found here alters a group, switch or module default. The supply read and per-option
liveness are prerequisites of S1/S3 in every group, so they are recorded here rather than per occasion.

**§J–§L questions, RULED Sep 27, 2026.**

| # | Question | Ruling |
|---|---|---|
| 1 | LD 42 D1 backfill | Tier A only (all the plan's events name the same occasion); Tier B rejected; every backfilled row logged with its evidence so it can be reversed (R136). |
| 2 | `accommodation` REQ for the 11 multi-day no-venue occasions | Yes; "Not needed" closes the gap (R137). |
| 3 | REQ for the no-REQ Celebrations | Exactly one, `venue`; nothing else is REQ in the group (R138). |
| 4 | Pending advisor comments | Not allowed; LD 12 holds (R139). |
| 5 | §J overrides | Adopt only overrides that correct a switch or matrix result for how people plan that occasion. A wrong group default is fixed in §D. Each override carries a one-line rationale (R140). **Confirmed:** one override, `corporate-events` A5. The at-home case becomes the §K5 rule: a single custom venue is the anchor automatically (R147). |
| 6 | `proposal`'s `dining_venue` | Stays REQ (R141). |
| 7 | Cart | Plan-scoped or standalone, decided at creation; checkout groups by plan plus "Standalone"; nothing blocked; whole-cart checkout stands (R142; brief H4). |
| 8 | New lanes | Payer reads the plancard (R143, step 4), the service fee shown before checkout (R144), refunded-item status (R145). |

*HARD STOP — design only; no code until ratified.*
