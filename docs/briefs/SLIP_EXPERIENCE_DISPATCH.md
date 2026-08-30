# Slip Experience Dispatch — Lane 6 + Slip Identity + Rendering Specs

**audited@9a208861** (2026-08-02) · Rulings 1–19 herein are now canonical in `docs/DECISIONS.md` (cite by number; this text remains the verbatim source). Volatile claims (file:line, "X is cart-based") are as-of that SHA — re-verify at Phase 0.
**Status:** Dispatch for Claude Code. Contains three build lanes and three UI rendering specs. Each lane has its own Phase 0 read-only audit with a HARD STOP before writes. One lane per branch, one agent per lane. No direct-to-main.
**Doc map (already on main — reference, do not re-scope):** `TRIP_ARTIFACT_RECONCILE_BRIEF.md` · `TRIP_GRAVITY_AUDIT_DISPATCH.md` (+ findings) · `RECONCILE_PHASE1_SCOPE.md` · `ROUTING_STATE_CONTRACT.md` · `L5-optimizer-repoint-brief.md` · `plancard-surface-manifest.md`.
**This document adds:** the stationary-slip model erratum, the decisions ratified 2026-08-02, the Lane 6 refinements, the slip identity + transition-log lane, and implementable specs for three slip renderings.

---

## -1. The problem (read first — what these lanes exist to fix)

**Symptom set.** After the reconcile lands, the platform will have a canonical slip with per-item routing — but three problems remain unsolved, and one conceptual error is still embedded in the written record:

1. **The optimizer still reads the wrong container.** It is cart-based (routes.ts:5298), which means: authenticated users' optimization runs read a purchase container instead of their plan; the paid product is blind to `in_planning` items unless they're in the cart; and the reconcile's cart-as-projection model only survives because a compatibility constraint props up the legacy read. Worse, without defined read scope the optimizer would treat all items as movable — including items the traveler has **already purchased** (proposing plans that collide with booked reality — a paid product contradicting a paid booking) and items currently **with an expert** (rearranging a plan mid-review, so the expert returns advice about a trip that no longer exists). And without a drop rule, a variant could silently remove an in-checkout item on apply, destroying purchase intent through a side door the routing-state contract explicitly closed at the front door.

2. **The slip has no identity and no memory.** There is no human-readable way to refer to a trip in a support thread, an expert chat, or a concierge handoff — "my Kyoto trip" is ambiguous the moment a user has two. And when something looks wrong — an item vanished, a status flipped, a plan rearranged — there is no record of who did what, when, or via which path. The audit proved what happens to state without a diary: `trips.status` became a dead field with a believing reader, and the cart's meaning drifted across nine consumers with nobody able to say when or why. Every routing transition the reconcile introduces is currently a **silent** mutation. Silent mutations on a money-adjacent artifact are un-debuggable, un-supportable, and un-auditable.

3. **The slip's states have no faces.** `routing_status` exists in the database but nowhere does the traveler *see* their trip as one artifact with four coexisting states — some items bought, some with an expert, some queued for checkout, some still open. Without the slip view, the reconcile's core promise (consideration ≠ commitment) is invisible; without the post-apply view, optimization looks like it replaced the plan rather than improved it in place; without the comparison view built on the canonical renderer, lane 6's UI is a standing invitation to fork PlanCard a fourth time — the exact violation the H4 lane is currently cleaning up from the last time this temptation went unanswered.

4. **The written record still teaches the wrong model.** Earlier dispatches describe the slip as an artifact that "travels through stations" and reaches a "final delivery point." Taken literally, that language instructs an implementer to build transfer mechanisms — copies moving between planning, expert, cart, and Trip Card. Copies-between-stations is the disease the gravity audit diagnosed platform-wide (H2, the expert-cart pollution, trip_contexts): every copy is a future class-B or class-D finding. The metaphor must be corrected in the record before more agents read it.

**Root cause, one sentence:** the reconcile built the slip's *skeleton* (canonical rows + routing states) but not its *senses* — the optimizer doesn't yet read it correctly, nothing records its history, no surface shows it whole, and the docs still describe a different animal.

**Downstream-effect surface (what to trace in Phase 0, per lane):**
- *Lane 6:* every consumer of optimizer output and every apply-path write inherits the read-scope decision — trace which current behaviors silently depend on cart-based input (guest flows especially) and which apply writes would become status-adjacent under the new scope. Any consumer assuming "optimizer sees everything" or "apply can remove items" is a latent break; inventory each with file:line and the assumption it makes.
- *Lane S:* every transition write point that ships in reconcile Phase 1 is a required log point — a transition that can occur without logging is the `trips.status` failure recurring under a new name. Trace all of them, plus any existing audit machinery that would compete with this diary.
- *Specs A–C:* every rendered element must trace to a canonical source (trip items, bookings via tripId, expert notes, logistics rows, the log). Any element without a source is either a missing read (build it) or a fabrication (forbidden) — classify each before rendering anything.

---

## 0. Model erratum — read before anything else

Earlier dispatch language described the Trip as a "routing slip that travels through stations." That metaphor is retired. The corrected model, binding on all lanes:

> **The slip is stationary. Stations are windows. Movement is a status value changing.**

- The Trip ("the slip") is one set of canonical rows. It is never copied, packaged, transferred, shipped, or delivered anywhere.
- Every surface — My Plans, expert workspace, cart, optimizer, share, Trip Card — is a *view* of those same rows. The cart is the `ready_for_checkout` projection; the Trip Card is the live render; the expert workspace is a live read.
- The ONLY legitimate copies in the system are: (1) optimizer variant proposals (ephemeral, discarded on apply), (2) the TripPlan render model (derived fresh per read, never stored), (3) ratified snapshot-at-money artifacts (bookingDetails, ready-made clones).
- **Prohibited:** any implementation that "sends," "moves," or "delivers" trip content between surfaces via copying. If a task seems to require a transfer mechanism, the task is misread — it requires a status transition or a new read path.

**Vocabulary:** "Trip Slip" / "slip" is the traveler-facing name for the trip artifact in the planning phase. "My Plans" is its home surface during planning. The Trip Card is the same rows rendered as the live-trip command center at L5. In code, everything remains `trips` + trip items — "slip" introduces NO new tables.

## 1. Decisions ratified 2026-08-02 (binding)

1. **PR #348 merged** (trip_contexts re-key, migration 161) — conditional on chain-integrity green and honest backfill (unattributable contexts stay null).
2. **Lane 3 = Option B:** admin dashboard derives trip phase from dates; `trips.status` gets a do-not-read deprecation note pointing at the Phase 4 convert-to-ready-made brief as the named future owner.
3. **Lane 6 optimizer read scope:** optimizable set = `in_planning` + `ready_for_checkout`. `purchased` items enter as **read-only constraints** (anchor semantics, same primitive as logistics anchors). `with_expert` items are **fully excluded** — not optimized, not constrained, not displayed as comparable.
4. **Drop policy (a):** `ready_for_checkout` items are schedule-movable but **never droppable by a variant** — soft anchors. A variant that would remove an in-checkout item is an invalid variant. To drop, the traveler removes the item from checkout (status → `in_planning`) and re-optimizes. Policy (b) — apply-time per-item drop confirmations — is a documented future refinement, not v1.
5. **Guest fallback:** the optimizer keeps a deliberate cart-read fallback for guest sessions until guest trips (G2 reshape) exist. Conditions: the fallback gates strictly on guest-ness (no authenticated user ever touches the cart-read path), and its retirement is an explicit exit criterion written into the G2 brief.
6. **Slip identity + transition log approved** as one small lane after reconcile Phase 1b (§3 below).
7. **Contract amendment required** (per `ROUTING_STATE_CONTRACT.md`'s own rule): the optimizer's post-lane-6 row changes to — READS `in_planning`, `ready_for_checkout` (optimizable), READS `purchased` (constraint-only), NEVER `with_expert`. Ships in the same PR as the Lane 6 code.

**Post-audit rulings (Aug 2, after the built-vs-remaining and role-config maps):**

8. **Mockup ratified as the build reference.** The published four-tab mockup (one canonical Kyoto trip; identical pills across tabs; After-optimize ≡ Variant B; with-expert items in no variant column; the in-checkout item moving-but-present in all three) is what Spec A/B/C surfaces build to.
9. **Already-built inventory is binding.** The map's landed list (optimizer read scope, guest gate, contract amendment, apply-never-writes-status, H5 guard, expert notes, confirmed transport legs, routing pills + actions in PlanCard full stage) supersedes this dispatch's descriptions of those as future work. Agents build ONLY the remaining-scope list; re-implementing a landed item is a violation. Lane 6 collapses to its residue: generation-time in-checkout-omission rejection, wrapping apply's four un-transacted writes in one transaction, discarding variant rows on apply.
10. **Tracking number: reuse `trips.trackingNumber`.** The existing sequence-backed TRV-YYYYMM-XXXXX scheme wins; §3's base32 derivation is RETIRED. Lane S scope: close the 3 mint paths that leave it NULL, thread it into the TripPlan assembler, add a mint-path tripwire test so a fourth NULL path fails CI.
11. **Diary collision: the new append-only log stands; `itinerary_changes` is not repurposed.** A traveler-rendered table with a live DELETE endpoint has display-feed semantics and cannot carry audit invariants. `variant_applied` logging MOVES to `item_transition_log` (single writer — `itinerary_changes` stops writing that event in the same PR). `itinerary_changes` keeps content-change display only. Named follow-up (not now): derive the traveler-facing feed from the new log and retire the overlap. One truth per event type — never both tables writing the same event.
12. **Transaction ruling: same-transaction log writes for ALL status transitions, including money-path** (`→purchased`, refund reversal). "Never fail into the money path" governs external side effects (notifications, email, third-party calls), not a same-commit INSERT into an append-only table — a purchase whose diary entry can silently drop is the exact silent-mutation failure Lane S exists to prevent. Cosmetic events (`note_added` display) may be best-effort after commit. Fallback if this ruling is overruled by team principle: transactional outbox — pay that complexity only on explicit instruction.
13. **Role-hygiene lane runs first** (§5) — issues 1, 3, 5 from the role map, plus the mint-path owner-access tripwire for issue 2 (test every trip mint path asserts owner access; the architectural getTripRole fix stays a named follow-up), plus CLAUDE.md corrections for the stale "fix in flight" records. Issue 4's bespoke-gate consolidation defers to a named follow-up. The confirmed class-B jsonb copies (experience-template.tsx) are inert today but gated: Get Expert Help remediation (references + the `→with_expert` item transition, which does not exist yet) lands FIRST inside the Spec-surfaces phase, before any workspace surface reads that payload.

**Post-Phase-0 rulings (Aug 2, after the Lane 6 + Lane S read-only audits; decision-maker ratified):**

14. **Variant discard — AMENDED.** Discard **unshared losing variants only**; the selected variant + its
    metrics survive apply (live readers: plancard `trip-plan.service.ts`, dashboard trip-scores,
    `shared_itineraries.variantId`). The dispatch's "discard ALL" loses to code reality. Riders: (a) the kept
    selected variant is a sanctioned copy in the spirit of §0 — its readers see the applied variant, which
    equals the slip by construction while apply stays atomic; (b) a shared itinerary pointing at a losing
    variant is preserved (a share is correspondence), with a NAMED FOLLOW-UP: losing-variant shares should
    eventually render an "outdated proposal" treatment, not as-if-current. Not this lane.
15. **Rejection check — two-key predicate, FAIL-CLOSED.** Match on `providerServiceId` ∥ case-insensitive
    title (the strip/dedupe predicate — consistency beats a new column). Binding: if any `ready_for_checkout`
    baseline item finds no match in a variant, that variant is REJECTED — the fuzzy match's failure mode must
    be false rejection (regenerate), never false acceptance. `originalItemId` column = named follow-up,
    triggered only if false rejections show up in practice.
16. **`variant_applied` is a TRIP-LEVEL event row** (itemId NULL) in `item_transition_log` — the eventType
    design working as intended; the per-item grain in §3 was the dispatch's error. Same treatment for any
    future trip-scoped event.
17. **Tracking numbers mint on ALL 5 NULL paths** (the 3 traveler-owned + the 2 NULL-owner authoring builds —
    one identity scheme, no exceptions; authoring builds become Ready Mades later). The mint-path guard's
    annotation logic: the two authoring inserts stay annotated for owner-access only — **nothing is annotated
    exempt from trackingNumber**.
18. **Helper-internal transaction — SIGNED OFF, ruling 12 formally amended to it.** Flip+log atomic pair
    inside the routing helper's own `db.transaction`; outer swallow retained; NO transaction spanning the
    booking insert. Ruling 12's target was the silent-drop diary — pair-atomicity kills that; the swallow
    means a diary problem can never cost a customer a checkout or refund. **Non-negotiable addition: the
    swallowed failure must not be silent-silent** — the catch logs an ops-visible error with tripId/bookingId,
    and Lane S ships a reconciliation query (bookings whose items aren't purchased) as a health check, so the
    failure mode is detectable and repairable, not just survivable.
19. **Minor items.** `tracking_number` varchar(20) headroom: accept now; NAMED FOLLOW-UP to widen with its own
    verified ALTER migration before volume warrants (never opportunistically inside Lane S). Migration-171
    numbering: re-verify at merge; the chain-integrity test is the arbiter. Traveler losing delete-optimize-row:
    accepted per ruling 11's follow-up. Recorded good news: the `routing_status` never-write invariant already
    holds everywhere and the guest gate is sealed three independent ways — Lane 6 residue is genuinely just its
    three items.

## 2. Lane 6 — Optimizer re-point (refines `L5-optimizer-repoint-brief.md`)

**Goal:** optimizer reads the Trip directly; the cart-read survives only behind the guest gate.

**Read semantics (from §1.3/1.4):**
- Input: trip items where `routing_status IN ('in_planning','ready_for_checkout')` → optimizable.
- `purchased` items + logistics anchors → constraint set. Variants must schedule around them; they render identically in every variant (see Spec C).
- `with_expert` items → invisible to the optimizer entirely.
- Validity check: a variant is rejected at generation if it omits any `ready_for_checkout` item (drop policy a).

**Apply semantics:**
- Apply is ONE atomic action: write the chosen variant's item content/schedule to the canonical trip items, insert transition-log entries (§3), discard ALL variant rows for this comparison. No partial apply. No retained variants.
- Apply writes item content and schedule ONLY. **Apply never writes `routing_status`.** Grep-gate: no reference to `routing_status` in any optimizer/apply write path.
- H5 discipline: `providerServiceId`/`serviceId` linkage survives apply (already fixed in reconcile Phase 1c — regression-test it here).
- Optimizer may CREATE logistics items (transport_legs) — trip furniture, non-routable per contract, attributed `(optimizer)` in the log.

**Phase 0 (read-only, HARD STOP):** map every current reader of the cart inside optimizer paths (routes.ts:5298 + apply paths) with file:line; confirm variant storage schema (`itinerary_comparisons` + variant items) and its discard path; confirm the guest gate point; list every place variant apply writes today and classify each write as content/schedule/linkage/status.

**Merge gates:** behavioral proof that (1) an authenticated optimize run reads zero cart rows, (2) a guest run still works via fallback, (3) purchased item's day/time byte-identical across all three generated variants, (4) a variant omitting an in-checkout item cannot be generated or applied, (5) apply leaves every `routing_status` value untouched (before/after query diff). Fee-literal grep. `tsc --noEmit` vs. baseline. Contract amendment file change present in the PR.

## 3. Lane S — Slip identity + transition log (new, small; after reconcile Phase 1b)

**Tracking number (per ruling 10 — the derivation idea below ruling 10 supersedes is retired).** Reuse `trips.trackingNumber` (existing sequence-backed `TRV-YYYYMM-XXXXX`, consistent with the TRV- prefix across 8+ tables). Lane S work: close the 3 mint paths that leave it NULL, thread it into the TripPlan assembler/DTO, add a mint-path tripwire test (every trip-creation path asserts non-NULL trackingNumber) so a fourth NULL path fails CI. Unchanged rules: display-only, NOT accepted as an identifier on any mutation endpoint (lookups resolve to trip id server-side). Surfaces: My Plans list + slip header + share view + support/admin + message copy.

**Transition log.** New table `item_transition_log`: id, tripId, itemId, fromStatus, toStatus, actorType (`traveler`|`expert`|`checkout`|`refund`|`optimizer`|`system`), actorId nullable, createdAt. Also log non-status slip events needed for the diary: `variant_applied`, `logistics_added`, `note_added` (eventType column; fromStatus/toStatus null for these).
- Write points = exactly the WRITES cells of `ROUTING_STATE_CONTRACT.md` §2 plus optimizer apply. Per ruling 12: written in the SAME transaction as the transition for ALL status transitions including money-path (`→purchased`, refund reversal); cosmetic display events may be best-effort after commit.
- **Diary collision resolved (ruling 11):** `itinerary_changes` is NOT this log and is not repurposed — it keeps content-change display semantics (including its DELETE endpoint). `variant_applied` moves to this table in the same PR that stops `itinerary_changes` writing it. One truth per event type. Deriving the traveler feed from this log and retiring the overlap is a named follow-up, not this lane.
- **Version number** = count of log rows for the trip (display-only, computed; do not store a version column). "v14" means fourteen logged events.
- This table is the future subscription hook for the expert PULL→PUSH notification lane — design the insert path so a listener can be attached later; do NOT build notifications now.
- NOT event sourcing: the trip rows remain truth; the log is a diary. No replay/reconstruction machinery.
- Push-canonical discipline: explicit ALTER migration in `migration-files.ts`, defaults verified via `information_schema`.

**Phase 0 (HARD STOP):** enumerate every transition write point that exists post-reconcile-Phase-1 with file:line (the contract says where they SHOULD be; verify where they ARE); confirm no existing versioning/audit machinery this would duplicate (cross-ref the outstanding audit-log lane — if that lane's design covers item transitions, reconcile the two designs BEFORE building, in conversation).

**Gates:** every transition endpoint proven to write a log row atomically (behavioral, per transition type incl. refund reversal); version count renders; no fee literals; log table has no UPDATE/DELETE path in app code (append-only).

## 4. Rendering specs — three slip views + share delta

**Global rules for all three:**
- ALL views are derivations of the canonical TripPlan producer / PlanCard family. **Extend `components/plancard/` — never fork, never create a parallel renderer.** The variant comparison column is `<PlanCard stage="proposal" />` (new stage), the slip view is the planning-phase derivation, the Trip Card is the existing live derivation. Update `plancard-surface-manifest.md` in the same PR that adds any stage.
- Data sources are canonical only: trip items (+ `routing_status`), `service_bookings` via tripId (purchases — the W4 read), per-item `expert_note` (migration 152), `transport_legs` et al. (logistics family), `item_transition_log` (Lane S). If a spec element has no canonical source yet, render nothing — no placeholder fabrication.
- Stack: React + Shadcn/UI + Tailwind, brand tokens. Status tint mapping (recommended; final tint values are a design-token decision, define them ONCE in the token layer, no literals in components):
  - `in_planning` → neutral outline pill, muted text
  - `with_expert` → Teal `#2E8B8B` tint
  - `ready_for_checkout` → Gold `#E8B339` tint
  - `purchased` → Green `#5DCAA5` tint
  - logistics rows → muted outline pill labeled `logistics`, never a routing pill
- Typography: Fraunces for slip title, Inter elsewhere. All interactive routing controls render ONLY for the owner role (contract: share/collaborators are READS-only).

### Spec A — The Slip (owner view, planning phase; detail view behind a My Plans row)

Component tree:
```
<SlipView tripId>
  <SlipHeader>            tracking ref (mono, muted): "Slip TRV-8F3K2 · v14"
                          title (Fraunces): "Kyoto · 5 days"
                          meta: dates · traveler count
                          phase chip: "Planning" (derived from dates + status mix, NOT trips.status)
  <SlipStatusStrip>       counts by routing_status, tinted per mapping:
                          "4 planning · 2 with expert · 1 in checkout · 1 purchased"
  <SlipItemList>          one row per trip item, ordered by day/time:
    <SlipItemRow>         title + day/time · secondary line (see below) · status pill right-aligned
      secondary line by status:
        purchased        → "booked · confirmation #<ref>" (from service_bookings)
        with_expert      → expert first name + activity ("Yuki S. reviewing timing")
        ready_for_checkout → price + "awaiting checkout"
        in_planning      → traveler-editable note or blank
      <ExpertNoteBlock>  rendered when item.expert_note present: bordered inset,
                          label "Note from <expert first name>" (teal), note body.
                          Never truncated to invisibility; expand if long.
      <RoutingActions>   owner-only, per W7: "send to expert" / "add to checkout" /
                          "remove from checkout" as status-appropriate; never shown
                          on logistics rows or purchased rows
    <LogisticsRow>       muted row w/ transport icon, "logistics" outline pill, no actions
  <TransitionLogFooter>  last 3 log entries, mono 12px, muted bg:
                          "v14 · Jul 31 · driver → in checkout (you)"
                          actor labels: you / expert name / checkout / optimizer / refund
                          "view full log" expands (no pagination machinery in v1)
  <SlipActions>          "Share" · "Open Trip Card" (Trip Card CTA only at/near L5;
                          during planning it can read "Preview Trip Card")
```

### Spec B — The Slip, post-optimization (same component, three additions — NOT a second view)

Spec B is Spec A rendering different data. Only these presentational additions:
1. `<OptimizedBadge>` in header when latest log contains a `variant_applied` event: "optimized · variant B" (green tint, wand icon).
2. `<AnchorGlyph>` — anchor icon prefix on `purchased` item titles; secondary line "fixed point — plan built around it".
3. Change annotations on moved items: secondary line renders "day 1 → day 5 — <one-line optimizer rationale>" when the applied variant moved the item. Rationale text comes from the variant metadata; if absent, render only the move, never fabricate a rationale.
Optimizer-created logistics rows carry secondary line "added by optimizer · <route>".
Invariant to assert in tests: routing pills byte-identical before/after apply.

### Spec C — Variant comparison (`<PlanCard stage="proposal" />` × 3)

Layout: header strip + three equal columns + footer sentence.
```
<VariantCompare comparisonId>
  <CompareHeader>   left: "Slip TRV-8F3K2 · 3 proposals for your remaining N items"
                    right: anchor glyph + "Gion tour pinned in all · kimono session
                    excluded (with Yuki)" — exclusions stated HERE ONCE, never as
                    grayed rows inside columns
  <VariantColumn ×3>  = <PlanCard stage="proposal">
    name ("Variant A/B/C") + strategy tagline ("Beat the crowds")
    compact day-ordered item list:
      anchored (purchased) items → RENDERED FROM CANONICAL TRIP ROWS, not from
        variant copies — identical across columns by construction, anchor glyph
      optimizable items → from variant rows, day/time as proposed
      transport legs → muted, with count + cost estimate line
    recommended variant: accent border + "Recommended" chip (recommendation comes
      from optimizer output; exactly one or zero recommended)
    <ApplyButton> "Apply A/B/C"
  <CompareFooter>   verbatim, load-bearing copy: "Applying a variant updates the
                    slip in place — the other two are discarded. Nothing is
                    purchased by applying."
```
Interaction: Apply → single atomic call (§2 apply semantics) → navigate to Spec B state of the slip. NO routing actions anywhere on this screen. NO per-item apply. NO "save variant for later."

### Message → slip deep-link contract (addressability requirement)

Expert activity reaches the traveler as messages/notifications ("Yuki added a note to your Kyoto trip"), and every such message must open the slip. The notification lane is still deferred — this contract only guarantees the slip is **addressable** so that lane can rely on it:

- **Stable route.** Spec A mounts at a stable, bookmarkable URL keyed by trip id (e.g. `/plans/:tripId`), with an item-level anchor (`?item=<itemId>` or fragment) that scrolls to and briefly highlights the referenced `<SlipItemRow>`. The route is the single canonical address for the slip — messages, emails, My Plans rows, and expert-workspace back-references all use it. No message-specific or notification-specific slip route.
- **Reference, not content.** Notification rows carry `relatedType`/`relatedId` (tripId + itemId + eventType) and frozen title/message text only — the ratified posture from the audit (S14). The link resolves by reference and renders the slip **fresh** on open; a message never embeds slip content that could go stale.
- **Auth is the session, not the link.** Opening from a message runs the normal owner/collaborator gate on the L10-remediated path. The URL grants nothing; a forwarded link shows a stranger a 403, not a slip. Share tokens are a separate surface (share view) and are never used in owner-directed messages.
- **Message copy carries the tracking ref** ("Yuki added a note · TRV-8F3K2") so a traveler with multiple slips knows which one moved before tapping — the identity lane (§3) earning its keep.
- **Emit points are already reserved:** the `→with_expert` transition and Lane S's log-insert hook. When the notification lane builds, it subscribes there and formats links per this contract — it should need zero slip-side changes. If it does need one, that's a finding against this section, not an inline patch.
- Phase 0 addition for Spec A: confirm what the current notifications deep-link resolver actually does with `relatedType`/`relatedId` (file:line) so the route/anchor design plugs into it rather than beside it.

### Surface disposition table — every touchpoint answers "ship or view?" the same way

Under §0 there is no "ship." Every surface is classified by two columns only: does it **view** the slip (live read via canonical renderer/producer), and does a **status transition** ride along (logged per Lane S, gated per the routing-state contract). Any new surface gets a row here before it gets built.

| Surface | Views the slip | Transition on interaction | Notes |
|---|---|---|---|
| My Plans (list + Spec A detail) | live | traveler routing actions (W7) | The slip's planning-phase home |
| **Itinerary Preview** | live, read-only | **none** | Pure window; no routing actions rendered. RM "Preview as buyer" views the AUTHOR's trip — it never "becomes" the buyer's slip; clone-on-purchase creates a new slip born `in_planning`. Converting a preview into a trip = prohibited transfer |
| **Get expert help** | hands the expert a live view | `→with_expert` on selected items (traveler, logged) | Creates `expert_request` carrying REFERENCES (tripId, itemId subset, comparisonId) + traveler's ask as jsonb. The ask is correspondence (frozen OK); slip content is NEVER copied into the jsonb — the workspace reads live |
| Expert workspace | live | expert return `with_expert→in_planning`; adds items born `in_planning`; writes notes | Never writes `ready_for_checkout` |
| Cart | projection view of `ready_for_checkout` | none (projection-sync maintains it) | Single-writer per W2 |
| Checkout | reads projection | `→purchased` atomic with booking | Sole forward writer |
| Refund path | — | `purchased→in_planning` atomic with refund | Sole reversal writer |
| Optimizer / variant compare (Spec C) | live (scope per §2) | none — apply writes content/schedule only, never status | Variants are the sanctioned ephemeral copies |
| Messages / notifications | deep-link to live view | none | Per the deep-link contract above |
| Share view | live, read-only | none | Inert pills, no diary |
| Trip Card (L5) | live | L5-appropriate actions only | Command-center render of the same rows |

**Phase 0 addition (Get Expert Help / Spec A):** inspect the current `expert_request` jsonb context contents (file:line + a real row shape) and classify every field as *traveler correspondence* (freeze OK) or *slip content* (must be a reference/live read). Any slip items found copied into the jsonb are a class-B finding — the expert-advises-against-a-snapshot failure — and get an explicit remediation note before the workspace surfaces are touched.

### Share view delta (rides on lane 5's canonical-renderer swap)

Share = Spec A minus: `<RoutingActions>`, `<SlipActions>`, transition-log footer (owner diary, not public). Keeps: tracking ref, status pills (visible, inert), expert notes, logistics rows. Always a live render via the canonical producer — never a snapshot.

## 5. Sequencing (ratified Aug 2 — supersedes the earlier block)

```
1. Role-hygiene lane (ruling 13): advisor edit/delete regression · 4 missing
   role-route pages · duplicate verifyTripOwnership cleanup targets ·
   mint-path owner-access tripwire · CLAUDE.md stale-record corrections
2. Lane 6 residue (ruling 9): variant generation-time rejection ·
   apply in ONE transaction · variant-row discard on apply
3. Lane S (rulings 10–12): trackingNumber NULL-path closure + tripwire +
   assembler threading · item_transition_log per §3 as amended
4. Spec A/B/C surfaces (to the ratified mockup): FIRST the Get Expert Help
   remediation (jsonb → references + the new →with_expert item transition),
   THEN /plans/:tripId + anchor, stage="proposal", status strip, DTO threading
   (booking confirmation-ref, variant move-rationale)

Named follow-ups (owners recorded, no work now): getTripRole architectural fix ·
bespoke-gate consolidation · traveler feed derived from the log · policy (b) drops
Spec A ships without the log footer if Lane S hasn't landed (progressive) —
but never with a fabricated version number.
```

## 6. What NOT to do

- Do NOT build any transfer/copy mechanism between surfaces (§0). No "send slip to X" implementations.
- Do NOT fork `components/plancard/` or create a standalone variant-card renderer. New stages extend the canonical component and update the surface manifest.
- Do NOT let the optimizer or apply path write `routing_status` — grep-gated AND behavior-tested.
- Do NOT allow variants to drop `ready_for_checkout` items (drop policy a).
- Do NOT accept the tracking ref as an identifier on any mutation endpoint.
- Do NOT store a version column; version = log count.
- Do NOT add UPDATE/DELETE paths to `item_transition_log`.
- Do NOT introduce fee literals or client-computed amounts anywhere touched; cost estimates in Spec C are server-computed, resolved via `fee_bands` where commission-relevant.
- Do NOT fabricate: no placeholder confirmation numbers, no invented optimizer rationales, no synthetic log history for pre-existing trips (history starts when the log starts — that is honest).
- Do NOT build notifications, event sourcing, policy (b) drop confirmations, or the full-log pagination in these lanes.
- Do NOT begin any Phase 1 without returning Phase 0 findings to conversation for explicit approval. Code is ground truth over every spec named here — record disagreements as findings.

---

*The binding sentence for every lane in this dispatch: one stationary artifact, many windows; movement is a status flip; the only copies are proposals and renders, and both are born to die.*
