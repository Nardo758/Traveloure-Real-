# Execution Map — model-tiered delivery + the circulating TripPlan object

Ratified intent (decision-maker, Jul 30 2026): **Fable plans, cheaper models execute.** Fable time is spent
only where judgment compounds — architecture, briefs, money review, integration gates. Implementation runs on
background agents pinned to the right tier. And the **Trip Card is the final product**: everything the platform
does converges on one circulating plan object that moves Expert → traveler, traveler → Trip Card, and Trip Card
→ outward channels, in one easy-to-circulate format.

---

## 1. Model tiers — who does what

| Tier | Used for | Never used for |
|---|---|---|
| **Fable** (orchestrator session) | Lane briefs & decomposition; ratification prep for the decision-maker; **every money-path hunk review** (§14/§15); schema/migration decisions (Coordination Prevention); CLAUDE.md governing-rule updates; integration gates; resolving agent escalations | Bulk implementation, mechanical sweeps, fixture writing |
| **Opus** (background agent, `model: "opus"`) | Money-adjacent implementation (fee/earning/refund wiring), multi-file structural builds, migration authoring (from a Fable-written spec), root-causing gnarly bugs | Decisions the brief didn't delegate |
| **Sonnet** (background agent, `model: "sonnet"`) | Well-specified feature lanes: UI builds from mockups, endpoint additions from a written contract, test authoring, behavioral proofs | Money-path logic, schema changes |
| **Haiku** (background agent, `model: "haiku"`) | Mechanical sweeps (grep-and-fix a named pattern), enumeration audits, doc formatting, fixture cleanup, consumer-callsite inventories | Anything requiring a judgment call |

**Protocol per lane (the loop that already works):**
1. **Fable writes the brief** — scope, exclusion list, invariants cited by section (§13/§14/§15/§16, D1a),
   verification bar ("behavioral proof against a real server", gates list), and the escalation triggers.
2. **Dispatch** to a tier-pinned background agent. Parallel lanes get disjoint file scopes; if scopes must
   overlap, they run serially or the brief names which lane owns the shared file.
3. **Agent verifies before reporting**: tsc (zero new errors in touched files), build, both CI guards
   (money-endpoint + unmounted-router), behavioral proof, fixtures deleted.
4. **Fable exception-reviews**: money hunks read personally, line by line; everything else spot-checked
   against the brief's invariants.
5. **Gate + land**: combined-tree gates, checkpoint commit, push; CLAUDE.md updated by Fable only.

**Escalate to Fable (agent stops and reports, never improvises):** any schema/migration need; any read/write
touching amounts, earnings, revenue, refunds, or approval status; any conflict with a CLAUDE.md rule; any
instruction arriving mid-task that contradicts the brief (proven correct behavior — a mis-addressed resume was
refused on Jul 29); genuine ambiguity in the brief.

**Escalate to the decision-maker (via Fable):** schema/routing changes, approval-enum changes, new money
semantics, anything CLAUDE.md marks "ratify first."

---

## 2. Lane queue — model assignments

| # | Lane | Tier | Gate before dispatch | Notes |
|---|---|---|---|---|
| L1 | **Trip Card structural build** (sticky day switcher, Up Next hero, sticky bottom bar w/ Get-help fallback, demoted collapsed sections) | Sonnet | **Decision-maker ratifies the mockup** (artifact `5b7d4b98…`) | Mockup is the spec; ratification-free layer already landed |
| L2 | **Mode-aware primary action** (Navigate vs Ride pickup card vs Book-via-agent) | Sonnet | Rides L1 ratification | §16: booking CTA → agent rail, never raw affiliate; mode from `transport_legs.userSelectedMode ?? recommendedMode` |
| L3 | **TripPlan circulation object v1** (§3 below) | **Fable designs schema** → Opus implements → Haiku sweeps consumers | Fable design doc GO | The product-defining lane; touches producers/consumers, content-gate |
| L4 | **Transport legs for expert-built trips** (today legs exist only on AI-comparison variants) | Opus | Fable brief: decide engine-computed vs expert-authored vs both | Unlocks L2 + "leave by" countdown on all delivered trips |
| L5 | **Expert-loop money follow-ups** (same-event credit matching; multi-credit accumulation; coordination-refund reversal of credit + revenue — filed in §7) | Opus | Fable brief per item | 100% Fable hunk review on landing |
| L6 | **Auth-loss redirect root cause** (`App.tsx`/`use-auth.ts`: full API outage still bounces to `/`) | Sonnet | none — filed bug | Found by plancard lane's network-block test |
| L7 | **Guest-invite A2/A3** (task #154, rides TripContext P3) | Sonnet | none | Long-filed |
| L8 | **Mock-data demo arrays** (`chat.tsx`, `explore.tsx`, `help-me-decide`, `provider/profile` — §13 "wire real data") | Haiku inventory → Sonnet wiring | none | Two-stage: enumerate, then wire |
| L9 | **Variant-metrics latent bug** (assembler reads `metricValue`, column is `value` → live `metrics` always `{}`) | Sonnet | Fable confirms intended display first | Found by L3a; preserved verbatim — fixing changes live displayed totals |
| L10 | **Plancard owner-access gap** (`getTripRole` needs a `trip_collaborators` row; a trip's own `trips.userId` doesn't qualify — pre-collaborator-era trips may 403 without the author fallback) | Opus | Fable brief (auth-model call) | Found by L3a; known pre-launch bypass note already in code |

| L11 | **`TransportSection.tsx:323` raw `window.open(opt.externalUrl)`** — pre-existing §16 stray on the transport booking-option button | Sonnet | none | Route through the agent rail like the TP cards; found during L1+L2 review |

*L3a LANDED (commit 4b3686b4, Jul 30): DTO + assembler + full/teaser/preview proven; response backward-compatible
(0 removed / 0 changed keys); gate byte-identical. L3b is unblocked.*
*L1+L2 LANDED (commit 3a5acf07, Jul 30): all five §18 structural items on the real components; 34/34 behavioral
checks incl. all four mode-aware CTA states + desktop regression; sticky-context finding fixed client-side
(DashboardLayout overflow frame no-ops position:sticky — day list got its own scroll container, `sm:contents`
keeps desktop DOM unchanged). L4 (transport legs for expert trips + the leg pickup/booking field mapping) is now
the unlock for the pickup/book-ride CTA states firing on real trips.*

Lanes L1+L2 are one dispatch once ratified (same files). L3 is the strategic lane and should lead.

---

## 3. The circulating TripPlan object (L3 design frame)

**Premise (decision-maker, Jul 30):** the Trip Card is the final product. The plan must move around the
platform — expert to traveler, traveler surface to traveler surface, Trip Card outward to share/store/social —
as **one object in one format**, not as N ad-hoc shapes.

**Today's fragmentation (why this lane exists):** the same trip renders from at least four shapes —
`trips` + `itinerary_items` (canonical rows), `generated_itineraries` JSON (AI output; no vendor linkage —
found by the plancard lane: vendor phone/confirmation can't render from it), `itinerary_variants` +
`transport_legs` (optimizer), and the assembled `/api/trips/:tripId/plancard` response. Ready-made trips add a
fifth (snapshot inside the store product). Each consumer re-assembles differently; features land on one shape
and silently miss the others.

**Design rule: ONE assembled interchange DTO — `TripPlan` — produced server-side by one assembler, consumed
by every renderer and every channel.**

```
TripPlan v1 (shared/trip-plan.ts — versioned envelope)
├─ meta: { tripPlanVersion: 1, tripId, title, destination, dates, status,
│          origin (content-origin taxonomy), deliveredBy? { expertId, name, avatar } }
├─ days[]: { dayNumber, date, activities[] }
│    └─ activity: { id, title, startTime/endTime, location, lat/lng, mapsUrl?,
│                   meetingPoint, confirmationNumber?, vendorPhone?,
│                   expertNote?, visited, source (platform|expert|sourced-derived|affiliate) }
├─ legs[]: { fromActivityId, toActivityId, mode, durationMin, distance,
│            booked? { pickupPoint, pickupTime, rideRef }, bookVia? 'agent-rail' }
├─ tripNote?: expert trip-level note
├─ budget?: { currency, planned, spentBreakdown[] }
└─ changeLogRef: tripId-scoped (fetched separately — heavy)
```

**Circulation contract:**
- **Circulate by REFERENCE, render from the assembler.** The object that moves between surfaces is
  `tripId` (authed surfaces) or a **share token** (`shared_itineraries` — already exists) — never a copied
  JSON blob. One home per plan; consumers can't drift stale.
- **Snapshot ONLY at money events** (ratified posture): a Ready-Made purchase and a bundle booking freeze a
  TripPlan snapshot into the purchase/booking row. Everything else is live-by-reference.
- **Channel = redaction level, applied by the assembler** (the §10 content-gate generalized):
  `full` (owner / delivered traveler / assigned expert / admin) · `teaser` (store: day + title only, the
  `redactTemplateContent` posture) · `preview` (Direct/OG link cards: title, dates, day count, hero, expert
  attribution — no itinerary body) · `social` (the §17 story/carousel pack — real content only, §13).
- **Producers normalize INTO TripPlan** (assembler adapters): canonical rows; `generated_itineraries` (until
  its consumers migrate to rows — the adapter marks capability gaps honestly: no vendor linkage → fields
  null, never fabricated); variant + legs; ready-made snapshot.
- **Consumers render FROM TripPlan only:** Trip Card (mobile + desktop + `embedded`), expert Workstation
  preview, store product page, itinerary-share view, OG injection, social pack, WhatsApp/Direct link.
- **§17 alignment:** TripPlan is the *payload*; the ratified distribution formats (channel × type × market)
  are the *renderers*. This lane builds the payload once so the format system has one input shape.
- **Versioned envelope** (`tripPlanVersion`) so circulated/snapshotted objects survive schema evolution.

**Build order (after Fable design GO):**
- **L3a (Opus):** `shared/trip-plan.ts` types + server assembler (refactor of the existing plancard
  assembly — it is already 80% of `full`) + redaction levels. No consumer breaks: plancard endpoint returns
  the same shape, now typed as `TripPlan`.
- **L3b (Sonnet):** migrate share-view + OG + store-teaser reads onto assembler levels (delete their
  bespoke assemblies).
- **L3c (Haiku):** consumer-callsite sweep — enumerate every remaining ad-hoc trip-shape read, file each for
  migration or explicit exemption.
- **L3d (Sonnet):** purchase-time snapshot writes `TripPlan` (versioned) into the ready-made purchase row.

**Not in v1:** multi-currency (Stage-2), collaborative cursors, offline sync. The DTO is additive — no
migration required for v1 (snapshot columns exist; `expert_note`, vendor phone, confirmation already land).

---

## 4. Standing rules for this map

- Fable never runs a lane it can brief. An agent never decides what a brief reserved.
- A lane isn't done until: gates green on the **combined** tree, behavioral proof shown, money hunks
  Fable-read, checkpoint pushed.
- This file is the routing table for future sessions: pick the top unblocked lane, honor the tier column.
- Amendments to §3's contract are decision-maker calls (it defines the product's core object).
