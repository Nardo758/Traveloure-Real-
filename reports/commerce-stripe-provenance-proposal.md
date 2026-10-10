# Stripe activity and eligibility timing — investigation proposal

Status: **proposal only; implementation not approved**.
Normal commerce sending stays blocked. No UNKNOWN blocker was removed.
No runtime, payment/booking metadata, schema or production change was made.

## Findings: birth versus lifecycle

| Record/path | What is readable | What is NOT established |
|---|---|---|
| Local payment_intents | user_id and created_at/updated_at in the existing Part 4 reader | All external activity is locally recorded before eligibility |
| Stripe intent creation | stripe-payment.service.ts:692–705 calls Stripe before inserting the local row | External success can precede local persistence or survive a persistence failure |
| Intent success | stripe-payment.service.ts:921–924 updates status | This UPDATE does not advance updated_at |
| Intent cancellation | stripe-payment.service.ts:1169–1172 updates status | This UPDATE does not advance updated_at |
| Intent requires_action | stripe-payment.service.ts:1217–1221 updates status | This UPDATE does not advance updated_at |
| Expert request | user_id, created_at; schema also contains lifecycle-specific fields | Birth does not prove a reliably stamped complete handoff/support lifecycle |
| Trip Pass | Membership ownership and birth/update fields are readable | Externally initiated renewal activity is not certified by those fields |

These are source findings, not production database findings and not a complete
writer census. The three named SQL updates are a confirmed gap; adding timestamps
to them alone does NOT close external-before-persistence or final-read/send races.

## Existing joins

- Local intent user_id gives direct ownership when non-null.
- Stamped canonical booking payment references can connect to a local intent;
  the booking's traveler_id is the ownership source, not provider/earner IDs.
- Expert request user_id gives ownership; trip/comparison references can be
  consistency checks. Conflicting or absent ownership remains UNKNOWN.
- Trip Pass ownership can be obtained from membership user_id or an entitlement's
  trip relation where applicable. The trip owner is not automatically proof of
  an external subscription payer or a guest/participant payer.
- Stripe references do not establish an event timestamp or fill an absent local
  record. No fuzzy email/name match or fabricated intent ID is proposed.

## Proposed writer change — separate approval required

**Bounded first change:** advance the existing payment_intents.updated_at using
database time in the SAME SQL statement as the three confirmed status updates.
Preserve status transitions, affected-row behavior, idempotency, amounts,
fees, refunds, payouts and all caller return values.

Exact touch list for this bounded change:

- CHANGE `server/services/stripe-payment.service.ts`: the success, cancellation
  and requires_action SQL statements identified above only.
- ADD `server/routes/__tests__/stripe-commerce-activity-stamps.db.test.ts`.
- CHANGE `.github/workflows/scheduler-jobs-gate.yml`: append that isolated test
  to the existing selector; do not replace any existing test/CI configuration.
- CHANGE this report to attach fresh evidence.
- DELETE: none.

**Schema proposal:** none for this bounded change; updated_at already exists.
No migration file or registry edit is proposed.

This would improve lifecycle readability for those three updates only. All
UNKNOWN blockers must stay. No checkout change, new pre-Stripe write, new
payment metadata or common payment lock is included in this approval request.

Proof: fresh golden suite before/after; two consecutive randomized isolated loops
over old intents transitioning before/at/after sequence start; repeated signals;
forced SQL failure with no partial status/stamp write; no timestamp supplied by
the client; unchanged statuses, amounts and booking outcomes. Inject persistence
failure after synthetic Stripe success and demonstrate the remaining UNKNOWN
instead of declaring coverage closed. Preserve the 117 typecheck baseline.

## Trusted eligibility instant for Part 6

**No globally trusted eligibility instant is established today.**

Proposed contract for separate policy approval:

`T_elig` is the database snapshot instant of the final eligibility statement,
using database time—not queue creation, a prior sweep, transaction start time,
or an application/client clock. The final decision must cover current account,
ownership, cart, catalog and payment facts, followed by durable outbox
reservation before provider submission. Each retry needs a fresh decision.

Part 6 could rely on that contract ONLY when all these are proven:

1. Every relevant payment attempt is observable before its external action can
   succeed; a failed provenance write cannot silently proceed.
2. Every relevant lifecycle change advances a trusted stamp atomically with
   the authoritative change.
3. All ownership joins and all rails are resolved; UNKNOWN always refuses.
4. The decision uses a consistent final snapshot and stable delivery key.
5. Recovery/provider ambiguity cannot bypass re-verification or once-only rules.

The existing recipient lock is NOT proof that every payment writer participates.
Payment committing after the final read but before mail handoff remains possible.
A snapshot cutoff cannot promise “no mail after any later payment.”

If that stronger promise is required, common writer/send serialization or another
explicit ordering protocol needs its own architecture decision and complete
writer census. It is NOT covered by the bounded timestamp touch list above.
No broad writer/schema implementation is proposed until that census produces
an exact, separately approved touch list. Part 6 must not rely on hypothetical
timing guarantees. External-before-persistence and this race remain OPEN.
