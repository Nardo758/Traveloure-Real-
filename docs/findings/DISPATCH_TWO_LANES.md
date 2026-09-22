# Dispatch — two briefed lanes, for the Replit workspace

Both are **ready to build**, both are **money-ADJACENT but move no money**, and each carries
**exactly one decision** that is the decision-maker's, stated inline below. Nothing else in either
lane needs a ruling.

**Constraints — the standing ones, they bind here too:**
- **Never commit on `main`.** `git checkout -b task-<id> origin/main` before any write.
- **No bare `npm install`.** If one runs, the `postinstall` scrub must run and
  `grep -c replit.local package-lock.json` must read **0** before any commit.
- **`TSC_BASELINE` is read from `build.yml` on `main`, never restated.** The gate fails on UNDER as
  well as over — if your count drops below it, you broke parsing, you did not fix errors.
- **No migration, no schema change, no publish.** Neither lane touches either; a publish-time SQL
  prompt in either is a decline-and-stop (§20).
- Commit trailers and PR-body attribution.

---

## Lane A — `payment_intent` webhooks throw for every non-cart PaymentIntent

**Brief:** `docs/briefs/PAYMENT_FAILED_NON_CART_INTENTS.md` (board #350, #857).
**Severity: highest of the two.** A failure is never recorded AND Stripe is answered 400, so the
delivery retries forever and fails identically each time.

### What is actually broken — corrected 2026-09-22, read this part

It is **two handlers, not one**. The brief originally named only the failure path.

| Handler | Line | State |
|---|---|---|
| `handlePaymentSucceeded` | `:846` | **SAFE — and it is the model to copy.** Already guards: `if (!bookingIds) { log; return; }` |
| `handlePaymentFailed` | `:926`, `:934` | **BROKEN.** Unguarded destructure + `.split` ⇒ `TypeError` |
| `handlePaymentCanceled` | `:951`, `:959` | **BROKEN — identical pair.** Wired at `:647` |
| `handleRequiresAction` | `:978` | **SAFE.** Only logs `bookingIds`; never splits |

All in `server/services/stripe-payment.service.ts`. `metadata.bookingIds` is written **only** by
the cart checkout, so every other PaymentIntent — optimizer run, Trip Pass, ready-made purchase,
coordination fee, expert-service session, balance payment — takes the unguarded path. `.canceled`
fires on an abandoned PI, so **an abandoned Trip Pass checkout is the commonest way to hit this.**

The throw propagates: `handleWebhook` rethrows, the route answers **400**
(`server/routes/bookings.ts`), Stripe redelivers with backoff, the retry re-runs the same TypeError.

### Build order

1. **Guard both destructures.** Copy `:846`'s shape — do not invent a second one (§18 rule 1).
   This alone stops the retry storm and is the smallest safe change in the lane.
2. **Answer Stripe 2xx once the event is understood.** 400 is right for a signature failure and
   wrong for "this PI is not mine" — a retry cannot change that outcome.
3. **Route by `metadata.type`,** the way the success path routes by rail. Cart PI keeps today's
   behaviour exactly; an `optimization_fee` PI records against its own `optimization_payments` row;
   every other typed PI gets its own arm or an **explicit, logged** no-op — never a silent one.
4. **Do NOT widen the legacy-rail write.** These handlers write the legacy `bookings` table, which
   is the failure-side twin of what §15c fixed on the success side. Whether the cart arm should move
   to `service_bookings` is §15c's question, not this lane's. **State the divergence in a comment
   and leave it.**

### ⛔ THE ONE DECISION — yours, not Replit's

**What does a failed or cancelled optimizer payment do to the traveler's credits?** Release them
(what #857 implies), or leave them held until a re-run?

It is a money-adjacent state change and must be decided, not inferred from the board's one-line
framing. **My recommendation: HOLD, and record the failure.** Releasing on a `payment_failed` that
Stripe may still retry into a success is a state change made on a non-final signal; holding is
reversible by a human and a release is not. If you rule *release*, it must key on a terminal state,
not on the first failure event.

**Until this is ruled, Replit builds steps 1–2 only** — the guard and the 2xx. Those are pure
correctness, carry no credit semantics, and stop the retry storm on their own.

### Proof required
A `payment_failed` AND a `canceled` carrying no `bookingIds` each return 2xx and write exactly one
honest record. Carrying `bookingIds`, both behave as today. Assert neither handler throws for each
`metadata.type` the platform mints — the list is enumerable from `createPaymentIntent`'s call sites.

### Negative space
No amount, rate, `fee_bands` read, idempotency key or atomic claim changes. No refund is issued. No
migration. The lane makes two handlers stop throwing and start recording; **it moves no money.**

---

## Lane B — an unreadable partner report is UNKNOWN, never $0

**Brief:** `docs/briefs/AFFILIATE_COMMISSION_UNKNOWN_VS_ZERO.md` (board #1255).
**Class:** §13 honesty on a revenue-reporting surface.

### The defect
Three commission services return `0` where the honest answer is "we could not read the report":
`booking-com-commissions.service.ts` (`:76` not-OK status, `:92` fetch threw/timed out, `?? 0` at
`:82`/`:88` for a missing field), plus `viator-commissions.service.ts` and
`fever-commissions.service.ts` with two sites each. The outer call then returns
`configured: true, total: 0` — a positive claim nobody verified.

**The consumers make it worse.** `admin.routes.ts:4879` and `:4979` fold it into
`totalAffiliateRevenue` with `|| 0`; `:5002` and `:5120` print it into the CSV and PDF as `$0.00`.
So an unreachable partner API **silently reduces reported affiliate revenue** and exports a number
that reads as fact.

### Build order
1. **One shared result type across all three services.** The per-range fetch returns
   `number | null` (`null` = unread). Do **not** add an `unavailable` boolean beside a nullable
   number — one way to say "unknown", not two (the LD 31 empty-array lesson).
2. **Keep `configured: false` distinct from `unknown`.** Not set up, and set up but unreadable, are
   different facts and must not collapse. The file already models the first correctly.
3. **Per-row `?? 0` inside the reduce stays 0** — a row that genuinely reports no commission IS
   zero. Only transport failures and a wholly unparseable payload are unknown. Write that sentence
   into the code so the next reader does not re-litigate it.
4. **CSV/PDF:** an unknown cell prints as unknown, never `$0.00`. Blank or a dash — pick one, use it
   in both exports.

### ⛔ THE ONE DECISION — yours, not Replit's

**What does `totalAffiliateRevenue` show when one partner is unreadable?** Either (a) omit that
partner and label the total **partial**, naming which partner is missing, or (b) render the whole
total **unavailable**.

**My recommendation: (a), partial and named.** A dashboard that blanks entirely because one of
three partners timed out is less useful than one that shows what it knows and says what it does not
— and naming the partner is what makes it actionable. (b) is defensible if you would rather no
number be read than a partial one be misread as complete.

**This is a presentation choice, not a money-path change** — no amount, rate or ledger row moves
either way, so Replit can build steps 1–3 before it is ruled and wire the surface after.

### Proof required
Per service: `null` for a not-OK status, a thrown fetch and an unparseable payload; a real number
for a well-formed one. Surface: a partial read renders as unknown on the dashboard and in both
exports, and never as `$0.00`.

### Negative space
No Stripe call, no `fee_bands` read, no ledger write, no idempotency key. This lane changes what a
**report says**, never what anyone is charged or paid. No migration.

---

## Sequencing

Independent of each other and of everything in the board dispatch. **Lane A first** — it is a live
retry storm on the money rail and its steps 1–2 need no ruling at all.
