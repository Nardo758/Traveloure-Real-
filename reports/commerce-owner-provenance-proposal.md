# Partner and legacy ownership — investigation proposal

## Part 6 bounded read-only implementation update

Four existing-source mappings were implemented under the separate Part 6
approval: invoice customer ownership, component/partial-settlement ownership
through canonical bookings, and strictly typed service-booking fee sources.
Two disposable-schema loops distinguish birth from lifecycle, exercise inclusive
time boundaries, and retain missing/contradictory ownership as UNKNOWN.

This is not implementation of the wider proposal. Free/covered optimization,
all fee source kinds, partner provenance, all lifecycle stamps and complete
payment ordering are NOT certified. No writer/schema change was made. See
`reports/automation-part6-verification.md` for the exact scope and retained
Part 3 fixture blocker. The historical proposal status below applies to the
remaining unapproved work.

Status: **proposal only; implementation not approved**.
All existing UNKNOWN blockers and production delivery blocks remain.
This report is a source/schema investigation, not a production-data audit.

## Readable birth records versus reliable lifecycle

| Surface | Existing ownership/read route | Time evidence and limit |
|---|---|---|
| Partner request | affiliate_booking_requests.user_id; optional trip/service-booking links | created_at/updated_at readable; external conversions need not update them |
| Fee ledger | Typed source_type/source_id, optional booking_id and Stripe references | Server-authored append rows have created_at; no universal payer column |
| Optimizer run | comparison_id → itinerary_comparisons.user_id; trip_id → trips.user_id | created_at is nullable; records run birth, not the whole payment lifecycle |
| Optimization payment | Comparison owner and recorded payment reference | Only paid-related records qualify; a free comparison is not a payment event |
| Content invoice | **customer_id directly references users** | created_at/updated_at and paid_at exist; writer-wide reliable stamping is not proven |
| Trip entitlement | Trip relation → trip ownership, plus recorded payment reference | Grant/revoke birth/lifecycle facts require writer audit; owner need not be payer |
| Group activity | Explicit participant/payer relation, then participant.user_id | Birth/update fields readable; standalone participant payment changes need audit |
| Component/partial settlement | booking_id → canonical service_bookings.traveler_id | Birth/update fields readable; settlement lifecycle stamping needs audit |
| Contracts/proposals/refunds | Direct traveler where present, or typed booking/trip/intent links | Each lifecycle stamp and source type needs individual verification |

An available field is not proof that every writer maintains it. None of the
unproven lifecycle cases above becomes READABLE-complete in this proposal.

## Safe existing joins proposed for further read-only coverage

1. Fee ledger **service_booking** source: typed source_id or booking_id to
   service_bookings.id, then traveler_id. Reject disagreements/dangling links.
   Never join an arbitrary source_id to whichever table happens to match.
2. Optimizer run to its comparison owner; an optional trip-owner cross-check.
   Conflicting owners stay UNKNOWN. Filter payment-related authorization,
   not all free/covered run creation as if money moved.
3. Content invoices.customer_id is direct ownership: no inferred email/name match.
4. Component states and bundle partial settlements through their canonical
   booking_id. A provider or expert ID is not the traveler payer.
5. Explicit group payer participant to participant.user_id. Trip ownership may
   be conservatively considered separately; it cannot replace a missing payer.
6. Partner service_booking_id/trip_id links can corroborate local ownership.
   They do not reconstruct off-platform conversions, missing actors or event times.

Each unrecognized fee source type, nullable owner, deleted parent, contradictory
join and missing stamp stays UNKNOWN. Current born records do not establish
subsequent lifecycle or externally paid activity.

## Bounded read-only proposal — separate approval required

Expand the shared activity reader with the proved ownership joins above,
after a per-source writer/stamp audit. Classify record birth separately from
reliably stamped lifecycle. Do not remove any existing default blocker.

Exact touch list:

- CHANGE `server/services/cart-reminder.service.ts`: add SELECT-only source
  descriptors/joins and reasons; preserve existing UNKNOWN constants.
- ADD `server/routes/__tests__/commerce-owner-provenance.db.test.ts`.
- CHANGE `.github/workflows/scheduler-jobs-gate.yml`: append its native isolated
  selector; retain every existing selector.
- CHANGE this report with fresh source-specific evidence.
- DELETE: none.

**Proposed writer changes:** none in this bounded read-only proposal.
**Proposed schema changes:** none. No migration or registry edit.

Lifecycle gaps requiring writers to stamp additional activity are a separate,
unapproved next proposal, not implicitly part of join coverage. Its exact
writer census remains OPEN; candidates include fee-ledger, optimizer-runs,
trip-entitlement and source-specific refund/invoice/partner writers. No
umbrella permission to change those files is requested or inferred.

## Proof plan

Two consecutive randomized isolated loops per added source:

- Correct owner, other owner, two independent accounts.
- Null/deleted parent, missing actor, contradictory comparison/trip owners.
- Every recognized fee source; unknown source type; same ID in unrelated tables.
- Event before, exactly at and after sequence start; null/malformed timestamps.
- Birth readable while lifecycle is unstamped: assert UNKNOWN, never permission.
- Free/covered optimization records not misrepresented as paid activity.
- Partner-only and tripless ambiguity remains blocked.
- Duplicate signals and both query/event orderings.
- Five additional hostile cases per loop; re-prove failures plus two variations.

Run the golden suite before/after and existing guard batch; typecheck stays at
117. No provider, real money, production reads/writes or emails are needed.
These proofs would certify only the enumerated read-only mappings, NOT
all-rail coverage or final-read/send ordering. Release remains blocked.
