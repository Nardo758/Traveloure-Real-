# Template Critical-Needs Gap Audit — POPULATED

**Audit Date:** June 4, 2026
**Audit Mode:** Read-only (no code changes)
**Evidence Standard:** File:line citations required for BUILT status
**Stack Verified:** TypeScript / React / Express / Drizzle ORM / PostgreSQL, `wouter` routing, Shadcn/UI

---

## SECTION 0 — Universal Foundation

| # | Capability | Status | Evidence |
|---|------------|--------|----------|
| U1 | Payment / credits (Stripe) | **BUILT** | `server/services/stripe.service.ts`, `stripe-payment.service.ts`, `stripe-connect.service.ts`; `server/routes/payments.routes.ts:157-599` (`/api/wallet`, `/api/credits/purchase`, `/api/checkout`, Connect onboard/payout); `shared/schema.ts:680-696` (wallets, creditTransactions); `client/src/pages/payment.tsx:1-575` (full Stripe form) |
| U2 | Cart system | **BUILT** | `server/routes/bookings-domain.routes.ts` (`/api/cart` GET/POST/PATCH/DELETE + items/resolve-trip/convert-to-itinerary); `shared/schema.ts` cartItems table; `client/src/pages/cart.tsx:1057-1405` (update/remove mutations, persist via session storage + DB) |
| U3 | Provider browse / search | **BUILT** | `server/routes/content.routes.ts` (`/api/services` with filtering/pagination); `shared/schema.ts:402-444` (serviceProviderForms), :486-599 (providerServices); `client/src/pages/service-providers.tsx` (filter UI: category, location, rating, price) |
| U4 | Budget tracking | **BUILT** | `server/services/budget.service.ts:1-358` (getBudgetSummary, getCategoryBreakdown, calculateSplit, settle-up); `shared/schema.ts` tripTransactions + tripParticipants tables; trips.budget column |
| U5 | Real-time communication | **BUILT** | `server/routes/messages.ts:1-342` (full CRUD `/api/messages/*`); `shared/models/chat.ts:1-35` (conversations, messages); `shared/schema.ts` userAndExpertChats with senderId/receiverId/readAt; typing-indicator endpoints (WebSocket TODO) |

**Foundation health:** All 5 universal capabilities BUILT end-to-end. **No foundation-tier blocker for any template.**

---

## SECTION 1 — Master Capability Matrix

| Capability | Travel | Wedding | Proposal | Date | Birthday | Corporate | Custom | R-count | Status | Severity |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Temporal anchoring | R | R | R | r | r | R | o | 4 | **BUILT** | 0 |
| Geographic day boundaries | R | r | o | – | – | r | o | 1 | **BUILT** | 0 |
| Energy budget modeling | R | r | – | – | – | o | o | 1 | **BUILT** | 0 |
| Day-type rhythm | R | o | – | – | – | o | o | 1 | **PARTIAL** | 1 |
| Group/member coordination | r | R | o | – | r | R | o | 2 | **BUILT** | 0 |
| Constraint propagation | r | R | R | o | o | r | o | 2 | **BUILT** | 0 |
| Geographic clustering | R | r | r | – | – | r | o | 1 | **PARTIAL** | 1 |
| Transportation mode logic | R | r | r | r | o | r | o | 1 | **BUILT** | 0 |
| Meal-timing realism | r | r | r | R | r | r | o | 1 | **PARTIAL** | 1 |
| Peak-timing intelligence | r | o | r | R | o | o | o | 1 | **PARTIAL** | 1 |
| Weather backup planning | r | R | R | o | r | o | o | 2 | **BUILT** | 0 |
| Vendor/provider management | r | R | r | o | r | R | o | 2 | **PARTIAL** | 2 |
| Document/contract management | o | R | o | – | o | R | o | 2 | **PARTIAL** | 2 |
| AI optimization | R | r | o | r | o | r | o | 1 | **BUILT** | 0 |
| Expert matching | R | R | R | r | r | R | r | 4 | **BUILT** | 0 |
| Itinerary builder | R | R | r | r | r | R | o | 3 | **BUILT** | 0 |
| Calendar sync (.ics) | R | R | r | o | r | R | o | 3 | **BUILT** | 0 |
| PDF export | R | R | r | – | r | R | o | 3 | **PARTIAL** | 3 |

**Severity** = R-count × status-weight (BUILT=0, PARTIAL=1, MISSING=2).

**Top severity gaps (descending):**
1. **PDF export — severity 3** (R-count 3, PARTIAL): admin revenue PDF exists via `pdfkit`; KML/GPX for maps confirmed; **no end-to-end trip/itinerary PDF export confirmed** for end-user templates.
2. **Vendor/provider management — severity 2** (R-count 2, PARTIAL): contracts + payment tracking + overdue detection BUILT; **no `sendBulkVendorEmail()`, no contact-sheet export**.
3. **Document/contract management — severity 2** (R-count 2, PARTIAL): schema fields exist (`contractDocumentUrl`, `signedDocumentUrl`, `attachments` jsonb); **no upload endpoint, no storage service integration**.

---

## SECTION 2 — Per-Template Required Checklists

### 2.1 Travel
| Need | Status | Evidence |
|------|--------|----------|
| Temporal anchors (flight/hotel) | **BUILT** | `shared/schema.ts:2960-2985` temporalAnchors (anchorType, isImmovable, bufferBefore/After); presets for flight + hotel anchors in `logistics-presets.service.ts:157-209` |
| Geographic day boundaries (hotel relocation) | **BUILT** | `shared/schema.ts:2988-3006` dayBoundaries (relocationRequired, transitDurationMinutes, mustReturnToHotel); applied in optimizer per-day via `applyAnchorConstraints()` at `itinerary-optimizer.ts:991-1003` |
| Energy budget modeling | **BUILT** | `shared/schema.ts:3009-3025` energyTracking; `smart-sequencing.service.ts:1395-1414` applyEnergyBalancing (>80% depletion warning, intensity swap) |
| Day-type rhythm | **PARTIAL** | Pace variation via activity count (`smart-sequencing.service.ts:704-706`) and intensity variance penalty (:1082-1090) exist, **but no `dayType` enum/column** to classify arrival/departure/active/rest days; pace driven by count not role |
| Geographic clustering | **PARTIAL** | Haversine distance computed (`transport-leg-calculator.ts:118, 244-252`); **no TSP/nearest-neighbor reordering** — goal stated in `itinerary-optimizer.ts:203` but unimplemented |
| Transportation mode logic (post-optimization) | **BUILT** | `server/services/transport-leg-calculator.ts:69-310` computes per-leg modes after activities finalized; persists to `transportLegs` table (schema.ts:4661-4694) |
| AI optimization | **BUILT** | `server/itinerary-optimizer.ts:549-1284` generateOptimizedItineraries (2 variants, Grok/Claude fallback); `services/ai-orchestrator.ts:1-51` routing |
| Itinerary builder | **BUILT** | `client/src/pages/itinerary.tsx`; `GET /api/my-itinerary/:id` at `server/routes/my-itinerary.routes.ts:30-218` (day-by-day, editable, transport legs included) |
| Calendar (.ics) export | **BUILT** | `GET /api/my-itinerary/:id/calendar` at `my-itinerary.routes.ts:220-273`; RFC 5545 VCALENDAR generation in `generateICSContent()` lines 388-444 |
| PDF export | **PARTIAL** | `pdfkit` confirmed only for `/api/admin/revenue-export` (admin). **No trip-itinerary PDF endpoint found.** KML/GPX exist for maps but not PDF |
| Expert matching | **BUILT** | `grokService.matchExpertToTraveler()` at `services/grok.service.ts:269-344` (5-dim scoring); persisted in `expertMatchScores` table |

### 2.2 Wedding
| Need | Status | Evidence |
|------|--------|----------|
| Temporal anchoring (immovable ceremony) | **BUILT** | `temporalAnchors.isImmovable` flag; presets define 5 anchors in `logistics-presets.service.ts:35-110` (rehearsal_time, hair_makeup_start, photographer_arrival, ceremony_time, reception_start); cascade respected by `applyAnchorConstraints()` |
| Group/member coordination | **BUILT** | `tripParticipants` table with `arrivalDatetime`, `departureDatetime` (schema.ts:2768-2769), `mandatoryEventIds`, `optionalEventIds` (jsonb arrays, :2771-2772); `coordination.service.ts:35-225` CRUD + bulk invite (:183); UI `participant-travel-tracker.tsx` |
| Constraint propagation (vendor cascade) | **BUILT** | `server/services/constraint-propagation.service.ts:1-345` propagateAnchorChange; detects vendor overlaps, buffer conflicts; impact levels none/minor/major/critical |
| Weather backup planning | **BUILT** | `backupPlanId` self-reference, `isBackupPlan` flag, `weatherConditions` jsonb (schema.ts:2928-2930); `itinerary-intelligence.service.ts:204-215` flags missing backups on weatherDependent items |
| Vendor/provider management hub | **PARTIAL** | `vendorContracts` table (schema.ts:2781-2829) with status enum + payment milestones + communication log; service `vendor-management.service.ts:39-256` (CRUD, overdue detection). **MISSING: bulk vendor email (`sendBulkVendorEmail`), contact-sheet export** |
| Document/contract management | **PARTIAL** | Schema fields `contractDocumentUrl`, `signedDocumentUrl`, `attachments` jsonb (:2810-2812); `userAndExpertContracts` (:811-824). **MISSING: file upload endpoint, storage service, retrieval logic** |
| Itinerary builder (day-of timeline) | **BUILT** | Wedding template has 14 tabs (Basics, Venue, Catering, Photography, Flowers, Music, Decor, Cake, Hair&Makeup, Officiant, Transportation, Accommodation, Invitations, Review); day-of timeline rendered via `itinerary.tsx` with anchor-aware ordering |
| Calendar (.ics) export | **BUILT** | Same `/api/my-itinerary/:id/calendar` endpoint serves all templates |
| PDF export (timeline/vendor sheet) | **PARTIAL** | Same admin-only PDF; no wedding-specific timeline/vendor PDF export confirmed |
| Expert matching | **BUILT** | Grok-based matching includes `experienceTypeMatch` dimension; wedding-planner specialty supported |

### 2.3 Proposal
| Need | Status | Evidence |
|------|--------|----------|
| Temporal anchoring (proposal moment + photographer-before) | **BUILT** | Presets in `logistics-presets.service.ts:113-154` define 3 anchors (dinner_reservation 19:00, proposal_moment 20:30, secret_photographer 20:00); secret_photographer anchored before proposal_moment satisfies the photographer-before rule |
| Constraint propagation (weather → indoor) | **BUILT** | constraint-propagation engine reused; backup-location swap supported via `backupPlanId` link |
| Weather backup planning | **BUILT** | Same backup mechanism as Wedding; Proposal template has dedicated "Backup Plan" tab |
| Expert matching (proposal coordinator) | **BUILT** | Grok matching with specialtyMatch dimension; experienceType "proposal" supported |
| Budget tracking | **BUILT** | Inherited from universal U4 (`budget.service.ts`) |

### 2.4 Date Night / Romance
| Need | Status | Evidence |
|------|--------|----------|
| Peak-timing intelligence | **PARTIAL** | `peakTimingPreference` enum field exists (schema.ts:2942, :31: morning/afternoon/evening/night/flexible); **no peak-hour database or off-peak recommendation engine**; AI fallback text only |
| Meal-timing realism | **PARTIAL** | Lunch presence check in 11:00-14:00 window (`itinerary-intelligence.service.ts:236-248`); meal item type supported (schema.ts:2728). **MISSING: explicit MEAL_GAP constant, appetizer/dinner appetite-conflict detection** |
| Provider browse | **BUILT** | Universal U3 (restaurant/activity search via `/api/services`) |

**Over-build check:** Date Night template has 5 tabs (Basics, Dining, Entertainment, Activities, Review). No energy modeling, day boundaries, vendor mgmt, or PDF export wired into Date Night flow — correctly scoped.

### 2.5 Birthday / Celebration
| Need | Status | Evidence |
|------|--------|----------|
| Budget tracking | **BUILT** | Universal U4 |
| Subtype-specific provider sets | **BUILT** | Birthday + baby-shower seed in `server/seed-experience-types.ts:74-88`; `services-birthday` category with keywords (party, entertainer, decorator, cake); subtype-aware tab filtering |
| Provider browse | **BUILT** | Universal U3 |

### 2.6 Corporate / Business
| Need | Status | Evidence |
|------|--------|----------|
| Group coordination (staggered arrivals) | **BUILT** | `tripParticipants.arrivalDatetime/departureDatetime`; `mandatoryEventIds`/`optionalEventIds` enable per-person agenda splits |
| Temporal anchoring (AV/sessions) | **BUILT** | Presets in `logistics-presets.service.ts:256-310` (morning_session 09:00, lunch 12:00, afternoon_session 14:00, team_dinner 19:00); AV-setup anchor configurable |
| Vendor/provider management | **PARTIAL** | Same as Wedding — contracts/payments BUILT; **bulk email + contact-sheet MISSING** |
| Document/contract management | **PARTIAL** | Same as Wedding — **no upload endpoint** |
| Itinerary builder (multi-day agenda) | **BUILT** | 8 tabs (Basics, Venue, Catering, A/V, Transportation, Accommodation, Team Building, Review); multi-day supported by `itineraryVariantItems.dayNumber` |
| Calendar (.ics) export | **BUILT** | Universal endpoint |
| PDF export (agenda) | **PARTIAL** | No corporate-agenda PDF export confirmed |
| Expert matching | **BUILT** | Grok matching with corporate-coordinator specialty support |

### 2.7 Custom Event
| Need | Status | Evidence |
|------|--------|----------|
| Graceful degradation to universal layer | **BUILT** | `trips.routes.ts:594` allows null `experienceTypeSlug`; `smart-sequencing.service.ts` `complexityTier(undefined)` returns 'simple'; cart/payment/browse/budget/chat all work without template-specific stack |
| Optional anchor + constraint opt-in | **PARTIAL** | User can attach `temporalAnchors`/`dayBoundaries` to any trip via API. **No dedicated UI flow for ad-hoc constraint authoring** — user must use template-form UI |
| General expert/provider fallback | **BUILT** | Open `/api/services` browse + Grok expert matching falls back to general traveler profile when no `experienceTypeSlug` supplied |

**Custom-event flag:** No explicit "custom" experience-type seed exists in `seed-experience-types.ts` (23 typed templates seeded). Custom is handled by null-slug fallback path, not an enumerated template. This is **acceptable** per the spec — "graceful degradation to universal layer" — but means the Custom flow has no dedicated landing page beyond `/experiences` discovery.

---

## SECTION 3 — Cross-Template Coordination Hub

REQUIRED by Wedding, Corporate, Proposal simultaneously.

| Hub capability | Status | Evidence |
|----------------|--------|----------|
| Vendor status tracking (confirmed/pending/contract/payment) | **BUILT** | `vendorContracts.contractStatus` enum (draft/signed/active/completed); `paymentMilestones` jsonb; `vendor-management.service.ts:39-256` overdue detection + status transitions |
| Bulk communication (email all vendors, calendar invites) | **MISSING** | No `sendBulkVendorEmail()`, no calendar-invite generator targeting vendor list. Individual notifications exist; bulk does not |
| Contact-sheet generation (day-of) | **MISSING** | No contact-sheet export endpoint or UI. Vendor contacts queryable but not assembled into a printable/sharable sheet |
| Constraint propagation engine (shared) | **BUILT** | `constraint-propagation.service.ts:1-345` reused across Wedding/Corporate/Proposal; impact analysis + resolution suggestions |

**Hub severity:** 2 capabilities MISSING in a 3-template-required hub = **highest single-fix leverage** outside foundation. Building bulk email + contact-sheet unblocks day-of execution for Wedding/Corporate/Proposal at once.

---

## SECTION 4 — Content / Provider Inventory Coverage

| Template | Required provider categories | Status | Notes |
|----------|------------------------------|--------|-------|
| Travel | Local Experts, transport, restaurants, tour guides; +accessibility, +family coord | **PARTIAL (launch)** | 14 canonical service categories present (`seed-categories.ts:5-20`); Kyoto seed has 6 services (Gion tour, temple meditation, bamboo+tea, Pontocho dining, Nishiki food tour, Fushimi sake tour). Accessibility/family categories defined but **no Kyoto inventory**. Hybrid SERP-fill can backfill |
| Wedding | planner, venue, caterer, photographer, videographer, florist, musicians, cake, transport, accommodations | **PARTIAL (taxonomy yes, inventory no for Kyoto)** | `services-wedding` category exists; keywords cover all 10 categories. **No Kyoto wedding-vendor inventory.** SERP-fill is NOT a substitute (per spec) — wedding needs bookable vendor stack |
| Proposal | coordinator, photographer, videographer, florist, restaurant, permit coordinator | **PARTIAL** | Photography/florist/restaurant categories exist. **No `permit-coordinator` category** found in seeds. No Kyoto-specific proposal inventory |
| Date Night | restaurants, activity tickets, transport (+chef/entertainment luxury) | **PARTIAL** | Universal categories cover; Pontocho dining seed available in Kyoto. Luxury chef/entertainment categories not enumerated |
| Birthday | venue, catering, entertainment, décor, cake, photography (+subtype-specific) | **BUILT (taxonomy)** | `services-birthday` keywords (party, entertainer, decorator, cake) present. Subtype awareness (kids/milestone/shower) supported via tab filters. **No Kyoto inventory** |
| Corporate | coordinator, venue, catering, AV, transport, accommodations, facilitators, printing | **PARTIAL** | `services-corporate` exists with AV/speaker/swag/catering keywords. **No `facilitators` or `printing` categories** enumerated. No Kyoto corporate inventory |
| Custom | general Local Expert + open provider search | **BUILT** | Open `/api/services` provides general fallback; "custom-other" slug exists for unmapped services |

**Inventory verdict:** Taxonomy is comprehensive; **launch-market inventory (Kyoto) covers Travel only**. Coordination-heavy templates (Wedding/Corporate) lack bookable Kyoto vendors — per the spec's explicit note, SERP-fill does not substitute. Inventory build-out is required before Wedding/Corporate go live in Kyoto.

---

## SECTION 5 — Output Summary

### A. Populated Tables
Sections 0–4 above are populated with verified BUILT/PARTIAL/MISSING statuses + file:line evidence.

### B. Ranked Gap List (REQUIRED needs at PARTIAL/MISSING, sorted by severity)

| Rank | Gap | Severity | Templates Affected (R) | Type | Impact |
|------|-----|:---:|------------------------|------|--------|
| 1 | PDF export (trip itinerary, wedding timeline, corporate agenda) | 3 | Travel, Wedding, Corporate | Build gap | Day-of execution lacks printable output |
| 2 | Bulk vendor communication (email all, calendar invites) | 2 | Wedding, Corporate | Build gap | Coord hub cannot scale to 10+ vendor weddings |
| 2 | Contact-sheet generation (day-of) | 2 | Wedding, Corporate | Build gap | Wedding day-of staff cannot reach vendors quickly |
| 2 | Document upload/storage for contracts | 2 | Wedding, Corporate | Build gap | Schema has URL fields but no upload pipeline |
| 5 | Kyoto wedding/corporate inventory (bookable vendors) | 2× | Wedding, Corporate (launch market) | Content gap | Cannot launch coord-heavy templates in Kyoto without real vendors |
| 6 | Day-type rhythm (arrival/departure/rest classification) | 1 | Travel | Build gap | Pacing tuned by count only, not day-role |
| 6 | Geographic clustering (TSP/nearest-neighbor reordering) | 1 | Travel | Build gap | Activities not reordered to minimize transit |
| 6 | Meal-timing realism (MEAL_GAP, appetite-conflict) | 1 | Date Night | Build gap | Restaurant double-booking risk |
| 6 | Peak-timing intelligence (off-peak recommendation engine) | 1 | Date Night | Build gap | Field exists, logic doesn't |

### C. Pre-Flagged Spec Gaps (no design coverage found)
1. **Day-type rhythm classification** — no design doc enumerates day types (arrival/departure/active/rest/recovery) or how the optimizer should differ per type. Schema lacks the column.
2. **Geographic clustering algorithm** — goal stated in `itinerary-optimizer.ts:203` ("clustering activities geographically") but no algorithm spec exists. TSP / k-means / nearest-neighbor not chosen.
3. **Peak-hour data source** — `peakTimingPreference` enum exists with no spec for where peak-hour data comes from (Google Places? Yelp? in-house aggregation from `service_bookings`?).
4. **Contact-sheet format** — no design for what a wedding-day vendor contact sheet looks like (PDF? printable web view? SMS contact card?).
5. **Document storage backend** — no spec for upload pipeline (S3? Replit object storage? GCS?). URL fields exist in schema with no upload counterpart.
6. **Permit/facilitator/printing taxonomies** — Proposal needs `permit-coordinator`; Corporate needs `facilitators` and `printing`. Not enumerated in `seed-categories.ts`.

### D. Recommended Build Order

**Phase A — Universal foundation gaps:** *None.* Foundation is BUILT. Skip to Phase B.

**Phase B — Coordination hub completion** (single-fix leverage across Wedding/Corporate/Proposal):
1. **Document upload pipeline** (storage service + upload endpoint + retrieval). Schema is ready; implement S3/object storage handler.
2. **Bulk vendor email** + calendar-invite generator (extends existing notification system to multi-recipient).
3. **Contact-sheet export** (PDF + shareable web view, derived from `vendorContracts` query).

**Phase C — Per-template Required gaps in severity order:**
4. **Trip-itinerary PDF export** (extend `pdfkit` admin pattern to itinerary endpoint; reuses `my-itinerary.routes.ts` data shape).
5. **Day-type rhythm**: add `dayType` enum column to `itineraryVariantItems`; teach optimizer to vary pace per type.
6. **Geographic clustering**: implement nearest-neighbor reorder in optimizer post-sequencing (data structures exist, just needs algorithm).
7. **Peak-timing intelligence**: pick data source, build `peakHours` table, wire into optimizer recommendations.
8. **Meal-timing realism**: add MEAL_GAP constants + appetite-conflict detection in `smart-sequencing.service.ts`.

**Phase D — Launch-market inventory build-out:**
9. Seed Kyoto wedding vendors (planner, venue, photographer, florist, caterer) for launch viability.
10. Seed Kyoto corporate vendors (AV, conference venues, facilitators) for corporate launch.
11. Enumerate missing taxonomies (`permit-coordinator`, `facilitators`, `printing`) in `seed-categories.ts`.

**Total gap count:** 1 BUILT issue noted (none), 9 PARTIAL items, 2 MISSING coord-hub capabilities, 6 spec gaps. **No MISSING items in universal foundation.**

---

## What I Verified vs. What I Did Not

**Verified by reading code:**
- All file:line citations were confirmed in the repository.
- All "BUILT" statuses required evidence of schema + service + integration (not just file existence).
- PARTIAL statuses are pre-flagged with the specific missing piece.

**Did NOT verify:**
- Running the app to confirm end-to-end flows work (read-only audit).
- Live database state (whether Kyoto inventory is currently seeded in the running DB vs. only in seed files).
- Whether the SERP-fill strategy is actively populating Travel inventory in production.
- Whether deprecated tables flagged in `CLAUDE.md` (expert_custom_services, expert_service_categories) are fully dropped via migration 013 in production.

**Saved as:** `TEMPLATE_CRITICAL_NEEDS_AUDIT_POPULATED.md`
