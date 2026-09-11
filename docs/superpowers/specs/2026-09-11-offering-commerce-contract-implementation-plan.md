# Offering commerce contract — implementation plan

> **Implements** `docs/superpowers/specs/2026-09-08-offering-commerce-trip-slip-contract-design.md`
> (as amended 2026-09-11), §17's phases, against `origin/main` at `a3409ed69`.
> **Written 2026-09-11.** Lane conventions are `docs/OPERATING_PROCEDURE.md` §3–§4; the one
> decision register is `docs/PUNCHLIST.md` §1.
>
> **What this plan is:** a serial lane sequence, each lane one PR and one `docs/DECISIONS.md`
> row, with the question that gates it and the proof that closes it.
> **Revised 2026-09-11** — the vocabulary was ratified against production counts
> (`2026-09-11-oc-a1-ratified`), which corrected §4.3's judgement and compressed the phasing.
> §0 carries the measured numbers and the three constraints that bind every lane.

---

## 0 · Both gates are CLOSED — measured and ratified 2026-09-11

**Phase 0a is LANDED** (PR #865, ledger `2026-09-11-one-decision-register`) and **both gates that
stood above every lane are now closed** (ledger `2026-09-11-oc-a1-ratified`).

**G-measure — done, against PRODUCTION.** The deployment's Neon database, not the workspace's
`heliumdb`; they are different databases and every count taken before 2026-09-11 was dev data.

| Measured on production, 2026-09-11 | |
|---|---|
| Active + approved `provider_services` | **67** |
| …of which ONE demo account (2026-01-08, role `user`, no provider form) | **61** |
| **Real seller listings** | **6** — 3 expert-owned, 3 from a second form-less account |
| `service_type` outside the declared six | 63 — 61 fixtures, plus `tour` and `transport` |
| `delivery_method` outside the declared seven | **0** |
| Rows with a stored `booking_mode` | **0** |
| Rows resolving to `instant` | **0** — every live listing's mode is a platform default |

**G-ratify — done.** The nine axes and the §9 archetype list stand as written. **§4.3's judgement is
corrected:** "enforcing the contract would deactivate or misclassify most current listings" is wrong
— enforcement touches 63 rows, 61 of them fixtures and 2 an expert's mislabels. Nothing real breaks.

**Three standing constraints fall out of the ratification and bind every lane below.**

1. **The 61 demo listings are KEPT** — the platform is not yet exercised end to end and they are the
   corpus. Their `service_type` is **NOT corrected**: `storage.getProviderServices` matches category
   with `ilike` on that column and `content-matching.service.ts` does `inArray` on it, so the column
   already carries a **second, category-shaped vocabulary with real consumers**. That is a finding
   for OC-A2, not a cleanup. They resolve as **"unclassified"**, and that is an honest answer rather
   than a defect (§13) — a fixture is not a seller's offering.
2. **Every coverage number excludes that account explicitly.** With 61 of 67 rows from one owner, an
   unqualified percentage about "the catalog" is a statement about fixtures. The audit reports the
   discount itself (OC-A0b), so nobody has to remember.
3. **`commitmentMode` has zero real signal today.** The contract distinguishes **seller-declared**
   from **platform-default** from day one, because every live listing is the latter and nothing in
   the schema records which.

**Owed, ruled but not applied:** `tour` and `transport` (two rows, one expert account) are corrected
to `experience`. That is a production data change and needs an owner or admin action.

---

## 1 · Lane sequence

Serial, one PR at a time. Waves are namespaced (`OC-A1`, never a bare "wave 1").
**Revised 2026-09-11 by `2026-09-11-oc-a1-ratified`** — the original sequence was insurance against
breaking a large legacy catalog, and production has six real listings, so the insurance is dropped
and the saving is spent on getting the shape right before sellers arrive.

| Lane | Ships | Gated on | Schema? | Rough cost |
|---|---|---|---|---|
| ~~OC-A0~~ | ✅ **LANDED** — register merge + read-only audit script (PR #865) | — | no | — |
| ~~OC-A1~~ | ✅ **RATIFIED 2026-09-11** — axes and archetypes stand; §4.3 corrected; phasing compressed | — | no | — |
| **OC-A0b** | **NEW, and first.** Fix the fabricated `false` in `buy-action-payload.ts` so *unknown* survives to the resolver; teach the audit to report the single-owner discount | — | no | ~120k |
| **OC-A2** | `resolveOfferingCommerceContract` — ONE pure module, **no caller but its own tests** | A0b | **no column** | ~250k |
| ~~OC-A3~~ | ❌ **DROPPED.** Its job was producing the coverage number; the audit produced it. The refusal reason folds into OC-A4, which is where it is actually read | — | — | ~200k saved |
| **OC-A4** | Activation validation, **scoped to TRANSITIONS INTO ACTIVE** so the demo corpus keeps working. No coverage gate — coverage is six rows | A2 | no | ~250k |
| **OC-B1** | Contract **snapshot** at commitment on the `service_bookings` rail (§14.1) | A4 | **yes — first schema lane** | ~350k |
| ⏸ **OC-B2** | **HELD until real sellers exist.** Checkout authority: buy-action, required-context, inventory, price and charge decisions read the contract | B1 **+ a real catalog** | no | ~400k |
| **OC-B3** | Required-context enforcement per archetype (§18's P1/P2/P3/P6/P8, E4/P4 list) | B2 | no | ~300k |
| **OC-C1** | Slip projection types; `slipEffect` **derived from** `impactClassFor` | B2 | no | ~300k |
| **OC-C2** | Link-or-trip-level invariant + the `trip_level_obligation` marker | C1, **D-11** | yes | ~300k |
| **OC-C3** | Work cards, support coverage, package components, external booking records | C2, **D-10** | yes | ~450k |
| **OC-D1** | Completion evidence by snapshot; `confirmed` never implies `completed` | B1 | no | ~300k |
| **OC-D2** | Earnings release aligned with fulfillment | D1, **D-6** | no | ~350k |
| **OC-D3** | Custody-aware cancellation / refund / reversal | D1, **D-7**, **D-9** | no | ~450k |
| **OC-D4** | Legacy-rail reconciliation and the "new writes stop" decision (§15A) | D3, **D-12** | no | ~350k |

**Order: A0b → A2 → A4 → B1 → *pause* → B2 → B3 → C/D.**

**Why B2 is held, since it is the counterintuitive one.** Routing checkout through the resolver
while 91% of the catalog is fixture data means the first evidence that the routing is correct
arrives from rows nobody sells. B1 still lands before the pause: it is additive, it records what
happened rather than deciding anything, and it is cheap to have in place before the first real
booking. **The release condition is a real catalog, not a date** — when non-demo active listings
exist across several accounts, B2 resumes.

**Not in this sequence, deliberately:** the **P5 custom-quote rail** (blocked on **D-8**; §9.2 says
do not send quotes through generic checkout until that rail exists) and the **E2/E3 milestone
engagement rail** (blocked on **D-5**; until it exists a large engagement is sold as an ordinary
listing or not at all). Both are their own designs, not lanes of this one.

**Which register row blocks which lane:** D-5 → the engagement rail (not planned); D-6 → OC-D2;
D-7 → OC-D3; D-8 → the quote rail (not planned); D-9 → OC-D3; D-10 → OC-C3; D-11 → OC-C2;
D-12 → OC-D4. **D-1 … D-4** (ready-made) bind the **T1** archetype wherever it appears — they do
not block A2's resolver, but OC-B2 may not change a ready-made purchase's behaviour until they
are answered.

---

## 2 · Lane briefs

### ~~OC-A1~~ — Ratified 2026-09-11

Closed by ledger `2026-09-11-oc-a1-ratified`. Its measured numbers and the three standing
constraints they produced are in §0 above; do not restate them in a lane.

### OC-A0b — Let *unknown* survive, and make the audit discount its own fixtures

Two small things the resolver depends on.

**(a) The fabricated `false`.** `server/services/buy-action-payload.ts` reads the owner's
`service_provider_forms.instant_booking` into a map, then resolves with
`resolveBookingMode(row.bookingMode, ownerInstant ?? false)` behind the guard
`row.bookingMode || row.ownerUserId`. The comment above it states the §13 intent — the flag is left
absent rather than fabricated — but `ownerUserId` is `provider_services.user_id`, which is
**NOT NULL**, so for every row sourced from that table the honest-absence branch is unreachable and
an owner with **no form row at all** is rendered as having chosen `request`. On production that is
**64 of 67 listings**. The guard must test whether the OWNER FLAG IS KNOWN
(`ownerInstant !== undefined`), not whether an owner id is present. Behaviour change is confined to
the previously-unreachable branch; nothing that already resolved changes.

**May not:** invent an account-level write path (the settings toggle was removed on purpose —
ledger 90 FP-5 S1 — because it wrote `provider_settings.instant_booking` while every reader reads
the form's twin); add a second resolution site; or change `resolveBookingMode` itself, which is
correct and is ruling 75's ONE derivation.

**(b) The discount.** `scripts/audit-offering-classification.ts` reports the largest single-owner
cluster separately from the remainder, so a coverage number is never silently a statement about
fixtures (§0 constraint 2). Read-only as before.

**Proof:** a unit test pinning that a known flag resolves as today, and that an UNKNOWN flag no
longer resolves to `request` — the negative is the point of the lane.

### OC-A2 — One read-only resolver

`server/services/offering-commerce-contract.ts` (or `shared/`, if every input is already shared):
one exported `resolveOfferingCommerceContract(listing, context) → Contract | Unresolvable`.

**It COMPOSES the four existing classifiers and re-derives none of them** (§18 rule 1, and the
document's own §14 amendment): `resolveBuyAction` (`shared/buy-action.ts`) stays the **sole author
of the buy button and the landing rule** — the contract is its input and never draws a CTA;
`slipEffect` is **derived from** `impactClassFor` (`shared/impact-class.ts`); `fulfillmentMode`
reconciles with `shared/service-fundamentals.ts` and **where the two disagree the fundamentals win
and the disagreement is a finding**; `resolveContentCTA` is untouched.
`booking_mode` is read **through `resolveBookingMode`, never off the column**.

**It may not:** add a column (Phase 1 adds none), write anything, be called from any production
surface in this lane, or be a second opinion about a question one of the four already answers.
An unresolvable listing returns a **machine-readable reason**, never a default archetype.

**Proof:** a pure unit suite over fixture rows — one per archetype in §9, plus the contradictory
and not-purchasable cases — wired into `build.yml` in a job that runs `npm ci`.

### ~~OC-A3~~ — DROPPED 2026-09-11

Its purpose was to produce the classification-coverage number before anything enforced. The Phase 0a
audit produced it against production, and the answer is six real listings. An admin list of
unresolvable listings over a catalog that size is a page nobody opens. **The refusal reason it would
have surfaced folds into OC-A4**, which is where it is actually read — by the seller being refused.
The audit script remains the ops instrument.

### OC-A4 — Activation validation

A listing **transitioning INTO active** that resolves to no contract is refused with its reason,
machine-readable and shown to the seller (OC-A3's job, folded in here).
**The scoping to transitions is load-bearing, not a softening:** the 61 demo listings are kept by
ruling and resolve as "unclassified", so a validator that ran over rows already active would refuse
the corpus the platform is being tested with. **Historical and already-active rows are unaffected** — §15's own wording: unknown delivery
behaviour stays readable for historical rows. No backfill; no silent deactivation of anything
already live.

### OC-B1 — Contract snapshot at commitment

The first schema lane. Additive, **nullable, NO DB CHECK** (app-enforced value sets — a CHECK over
a new enum is the publish-time drizzle-push failure the Coordination Prevention rules warn about),
**declared in `shared/schema.ts`** (or the deploy push drops it and the stamped migration never
recreates it), registered in `server/migrations/migration-files.ts`, **no backfill**.

Snapshots §14.1's behaviour-changing terms. **The charge snapshot composes through the existing
`composeTravelerCharge`** (ledger `2026-09-08-cart-fee-line`) — it records what was charged, it
does not become a second place the charge is computed (§18 rule 1). **§13:** a pre-snapshot row is
read the way it WAS charged (`travelerChargeForRow`'s existing discriminator), never re-derived
under the new contract. **§15 untouched:** same idempotency keys, same claim, same stamp — a
snapshot is written inside the transition that already exists, never as a second write that can
disagree with it. **§19:** the snapshot is server-composed and appears in **no** client body
allowlist.

### OC-B2 — Checkout authority

Buy-action, required-context, inventory authority, price authority and charge mode read the
contract. **The canonical rule (§8 of the design): no client-supplied field may choose a more
permissive archetype, inventory source, price authority or charge mode than the server-resolved
contract** — which is §14/§19 restated one derivative up, and it is enforced by the body being a
**pick-based allowlist**, not by a check inside the handler.

**May not:** change what a ready-made purchase does (blocked on D-1 … D-4); route a custom quote
through generic checkout (D-8); charge by milestone (D-5); or move any amount off the server.

### OC-B3 — Required-context per archetype

§18's list, and its distinction is load-bearing: **Trip dates are not service fulfillment facts**.
P1/P2 need a slot or an explicit request-acceptance path; P6 check-in/out and guests; E4/P4 a
support window; P3 a **delivery window rather than a fake appointment**; P8 route endpoints and
pickup time. §13: a fact nobody supplied is collected or the purchase is refused — never defaulted.

### OC-C1 — Projection types

Slip projection reads projections; it does **not** reverse-engineer commerce semantics from labels
(§15 invariant 10). `slipEffect` derives from `impactClassFor`. Status dimensions separate:
`bookingStatus` ≠ `fulfillmentState` ≠ earnings release.

### OC-C2 — Link or trip-level obligation

Every paid native service booking either links to a Trip item or carries an explicit
`trip_level_obligation` marker with a reason and a projection target (§15 invariant 3).
**Blocked on D-11** — whether that marker is a supported product pattern or a migration exception
decides whether it is a durable column or an audited exception list.

### OC-C3 — The four projections the assembler does not have

Work cards (E2/E6/P3), support coverage (E4/P4), component-level bundle projection (P7), external
booking records (X1). **Blocked on D-10** for X1: what minimum evidence lets an external booking
appear as confirmed. §16 G7's shape — a click or a request must never look like a booking, and
§16 G6 — provenance is labelled and confirmed projection requires real booking evidence.
**§16 is unweakened:** no surface gains a raw outbound booking CTA.

### OC-D1 — Completion evidence

`bookingStatus=confirmed` must never imply `fulfillmentState=completed` or earnings release. The
snapshot stores both the completion rule and its evidence source; completion is checked against
the **snapshotted** rule, not the listing's current one.

### OC-D2 — Earnings release

Seller earnings cannot become releasable from payment alone when fulfillment is outstanding
(§15 invariant 8). **Blocked on D-6** (which outputs need traveler acceptance, and the revision
allowance). The **payout-parity gate** on `build.yml` is the existing proof that the pre-accept
promise equals minted earnings; this lane extends it, never relaxes it.

### OC-D3 — Custody-aware reversal

Refund/reversal branches on **custody and the original charge snapshot** (§15 invariant 9), and an
external-custody record can never carry a Traveloure PaymentIntent for the underlying purchase
(invariant 5). **Blocked on D-7** (reimbursable expenses) and **D-9** (partial bundle failure).
**§17's rule binds:** this is repair, and it stays out of the drift detector — the reconciliation
job detects, it does not repair.

### OC-D4 — Legacy rail

§15A's table gains an approved "new writes stop" date before any rail becomes read-only; historical
reads and refunds survive retirement. **Blocked on D-12.** The legacy `bookings` rail is still live
(`/booking-demo`, `process-cart`) and both rails run, each no-opping on ids it does not own
(§15c) — that stays true until the date exists.

---

## 3 · Invariants every lane inherits

1. **No new service table** (CLAUDE.md FAQ); **the two offering catalogs are never merged** (§4).
2. **No fee/commission/rate literal** outside `fee_bands` (§8); rates are never client-settable (§18).
3. **Money endpoints derive amount from the catalog and actor from the session** (§14), reads
   included; every commitment stays idempotent — CLAIM → AUTHORIZE → PROMOTE, atomic conditionals,
   never check-then-write (§15/§15b/§15c).
4. **Every client-reachable body is a pick-based allowlist** (§19). A privileged column added by any
   lane here is unreachable until someone deliberately names it.
5. **Schema posture:** additive, nullable, no DB CHECK, declared in `shared/schema.ts`, registered in
   `server/migrations/migration-files.ts`, no backfill that invents an answer.
6. **§13 in both directions:** an absent fact is omitted with its reason and never zero-filled or
   defaulted; an unclassified legacy row is "never classified", which is a fact.
7. **One derivation, never a second copy** (§18 rule 1) — the reason this plan's first code lane is a
   composer rather than a fifth classifier.
8. **Every new guard states its negative space and ships committed `--self-test` fixtures** (§18d).

---

## 4 · Definition of done

The design document's §22, unchanged, plus: every lane above either LANDED with its ledger row, or
recorded in `docs/PUNCHLIST.md` §1 as blocked on a named register row. A lane that is neither is
the failure mode this plan exists to prevent.
