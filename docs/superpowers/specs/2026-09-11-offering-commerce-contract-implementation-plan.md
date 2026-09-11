# Offering commerce contract — implementation plan

> **Implements** `docs/superpowers/specs/2026-09-08-offering-commerce-trip-slip-contract-design.md`
> (as amended 2026-09-11), §17's phases, against `origin/main` at `a3409ed69`.
> **Written 2026-09-11.** Lane conventions are `docs/OPERATING_PROCEDURE.md` §3–§4; the one
> decision register is `docs/PUNCHLIST.md` §1.
>
> **What this plan is:** a serial lane sequence, each lane one PR and one `docs/DECISIONS.md`
> row, with the question that gates it and the proof that closes it.
> **What it is not:** a ratification. The design document proposes a vocabulary; nothing here
> ratifies it. Lane **A1 is that ratification**, and it is a decision-maker step, not a build.

---

## 0 · The two things that gate everything

**Phase 0a is LANDED** (PR #865, ledger `2026-09-11-one-decision-register`): the three registers
are merged into `docs/PUNCHLIST.md` §1, and `scripts/audit-offering-classification.ts` exists.

Two gates remain before any code changes behaviour:

| Gate | What it is | Who | Blocks |
|---|---|---|---|
| **G-measure** | Run the audit against **production** (`DATABASE_URL=<prod> npx tsx scripts/audit-offering-classification.ts`). §4.3's counts are development data by the document's own framing, and the judgement that enforcing the contract "would deactivate or misclassify most current listings" rests on them. | Decision-maker / Replit | A1, and every lane after |
| **G-ratify** | Approve the archetype list (§9), the nine axes (§8), and the disposition for the rows the audit reports as unresolvable. | Decision-maker | A2 onward |

Until both are done the plan's only honest state is "measured nothing, ratified nothing".
**A lane that runs ahead of its gate is building against a vocabulary that may not survive
contact with the real distribution** — which is the one step that would be expensive to redo.

---

## 1 · Lane sequence

Serial, one PR at a time. Waves are namespaced (`OC-A1`, never a bare "wave 1").

| Lane | Ships | Gated on | Schema? | Rough cost |
|---|---|---|---|---|
| ~~OC-A0~~ | ✅ **LANDED** — register merge + read-only audit script (PR #865) | — | no | — |
| **OC-A1** | **Ratification row**, not code: the measured distribution + the approved archetype/axis list + the disposition for unresolvable rows, recorded as a ledger ruling | G-measure | no | decision-maker |
| **OC-A2** | `resolveOfferingCommerceContract` — ONE pure module, **no caller but its own tests** | G-ratify | **no column** | ~250k |
| **OC-A3** | Diagnostics: admin read-only visibility of every active listing's resolved contract + unresolvable rows; the audit script re-pointed at the resolver | A2 | no | ~200k |
| **OC-A4** | Activation validation (§15 invariant 12): a NEWLY activated listing that resolves to no contract is refused with a machine-readable reason. Historical rows stay readable | A3 + coverage measured | no | ~250k |
| **OC-B1** | Contract **snapshot** at commitment on the `service_bookings` rail (§14.1) | A4 | **yes — first schema lane** | ~350k |
| **OC-B2** | Checkout authority: buy-action, required-context, inventory, price and charge decisions read the contract | B1 | no | ~400k |
| **OC-B3** | Required-context enforcement per archetype (§18's P1/P2/P3/P6/P8, E4/P4 list) | B2 | no | ~300k |
| **OC-C1** | Slip projection types; `slipEffect` **derived from** `impactClassFor` | B2 | no | ~300k |
| **OC-C2** | Link-or-trip-level invariant + the `trip_level_obligation` marker | C1, **D-11** | yes | ~300k |
| **OC-C3** | Work cards, support coverage, package components, external booking records | C2, **D-10** | yes | ~450k |
| **OC-D1** | Completion evidence by snapshot; `confirmed` never implies `completed` | B1 | no | ~300k |
| **OC-D2** | Earnings release aligned with fulfillment | D1, **D-6** | no | ~350k |
| **OC-D3** | Custody-aware cancellation / refund / reversal | D1, **D-7**, **D-9** | no | ~450k |
| **OC-D4** | Legacy-rail reconciliation and the "new writes stop" decision (§15A) | D3, **D-12** | no | ~350k |

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

### OC-A1 — Ratify the vocabulary against the real distribution

Not a build. Produces one `docs/DECISIONS.md` ruling row carrying: the production counts; the
approved archetype list and nine axes (or the amendments to them); and, for each row shape the
audit reports as unresolvable, an explicit disposition — **leave readable, refuse on
re-activation, or amend the vocabulary to admit it**. §13: "we never classified this" is a
finding, not a gap to fill with the nearest-looking archetype.

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

### OC-A3 — Diagnostics and admin visibility

An admin-only read (under §2's blanket `requireAdmin` guard) listing every active listing with its
resolved contract, and separately every listing that resolves to none with its reason. The audit
script stops measuring raw columns and measures the **resolver's** output, so coverage is a number
before anything enforces it (§17 Phase 1.3: "do not change checkout behavior until classification
coverage is measured").

**May not:** change any traveler-facing surface; publish `users.id` (LD 40); add a filter to a
guard's allowlist instead of putting the route under `/api/admin/*`.

### OC-A4 — Activation validation

A listing being **newly activated** that resolves to no contract is refused with its reason.
**Historical and already-active rows are unaffected** — §15's own wording: unknown delivery
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
