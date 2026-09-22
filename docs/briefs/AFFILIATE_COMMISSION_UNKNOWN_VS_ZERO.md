# Lane brief — an unreadable partner report is UNKNOWN, never $0 (board #1255)

**Status:** ready to build. **Class:** §13 honesty on a revenue-reporting surface.
**Why a brief and not a ticket:** the board filed one service; it is three, plus two admin handlers,
a CSV export and a PDF export. The fix shape is shared, so a per-file edit would produce three
different answers to one question (§18 rule 1).

## The defect

`server/services/booking-com-commissions.service.ts` returns `0` on three distinct failures:

| Site | Condition | Today |
|---|---|---|
| `:76` | HTTP not-OK from the partner | `return 0` |
| `:92` | fetch threw / timed out (10s `AbortSignal`) | `return 0` |
| `:82`, `:88` | payload carries no commission/revenue field | `?? 0` |

None of these is "the partner paid zero" — they are "we could not read the report". The outer
`getBookingComCommissions` then returns `configured: true, total: 0`, which is a positive claim.

**It is a class, not an instance:** `viator-commissions.service.ts` and
`fever-commissions.service.ts` each carry two `return 0` sites of the same shape.

**The consumers make it worse, not better.** `admin.routes.ts:4879` and `:4979` fold the value into
`totalAffiliateRevenue` with `|| 0`, and `:5002` / `:5120` print it into the CSV and PDF as
`$0.00`. So an unreachable partner API silently *reduces reported affiliate revenue* and exports a
number that reads as fact.

## The rule this lands under

§13, as CLAUDE.md states it for the copilot: *"a null price is 'the page did not state one', not
'$0'"*. The same file already models the honest case correctly — `configured: false` says the
integration is not set up rather than claiming zero — so the shape exists, it just does not cover
the read failures.

## Build

1. **One shared result type** for all three commission services: the per-range fetch returns
   `number | null` (`null` = unread), and the summary carries the unknown-ness rather than
   flattening it. Do NOT add a second `unavailable` boolean beside a nullable number — one way to
   say "unknown", not two (the LD 31 empty-array lesson).
2. **Keep `configured: false` distinct from `unknown`.** Not set up, and set up but unreadable, are
   different facts and must not collapse.
3. **Per-row `?? 0` inside the reduce is a SEPARATE decision** — a row that genuinely reports no
   commission is 0. Only the transport failures and a wholly unparseable payload are unknown.
   Decide it explicitly in the lane and write the answer down.
4. **Consumers:** `totalAffiliateRevenue` must not silently absorb an unknown. Either omit the
   partner from the total and say the total is partial, or surface the total as unavailable. This
   is the one real design choice in the lane; it is a §13 presentation question, not a money-path
   change — **no amount, rate or ledger row moves.**
5. **CSV/PDF:** an unknown cell prints as unknown, never `$0.00`. Blank or a dash — pick one and
   use it in both exports.

## Negative space

No Stripe call, no `fee_bands` read, no ledger write and no idempotency key is touched. This lane
changes what a REPORT says, never what anyone is charged or paid. It needs no migration.

## Proof

Unit-level: each service returns `null` for a not-OK status, a thrown fetch and an unparseable
payload, and a real number for a well-formed one. Surface-level: a partial read renders as
unknown on the dashboard and in both exports, and never as `$0.00`.
