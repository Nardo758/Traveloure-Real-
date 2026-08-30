# Outstanding work — plan per item

**Date:** 2026-08-08 · **Branch:** `claude/sync-local-repo-2j7ghv` · **Status:** proposal, no code changed.

Every item below is stated with the governing CLAUDE.md rule it must satisfy, a concrete plan, and
how it is proven. Facts were re-verified against source on the date above — several items were weeks
old and two had already changed.

**Sequencing at a glance:**

```
NOW      A1 indexes ──────────────────────────────► independent, production risk
         A2 rate-limiter unref ──────────────────► trivial, unblocks clean shutdown

NEXT     B1 WITHDRAWN (premise false — retries already default to 2)
         B2 booking one-click ────────────────────► now UNBLOCKED, B1 was its only prereq

PARALLEL C1 segmentation decisions ──► C2 engine (dark) ──► C3 proposal UI ──► C4 multi-city
                                                                                    │
                                                              C5 vocabulary rename ◄┘  (last)

BACKLOG  D1 PS18 allowlist (ride C2)   D2 MT-3   D3 MT-4

CLOSED   Lane E — all three items resolved (see below)
```

---

## Lane A — Durability. Ship first, independent of everything.

### A1 · Declare the 12 undeclared UNIQUE indexes  (task #231)

**Rule:** CLAUDE.md deploy-push trap — *"any DB object the code depends on — index OR table — must be
declared in `shared/schema.ts`, or the deploy push is authoritative and will remove it."*

**What's wrong.** Twelve UNIQUE indexes are created by registered migrations and declared nowhere in
the drizzle schema. At publish, `drizzle-kit push` drops them; the creating migration is already
stamped, so `runMigrations()` never puts them back. Silent and permanent.

The sharpest case is a half-applied fix. Migration `096_idempotency_key_bookings.sql` creates the
*same* guard on both booking rails:

| index | table | declared? |
|---|---|---|
| `service_bookings_idempotency_key_idx` | `service_bookings` | ✅ `shared/schema.ts:919` |
| `bookings_idempotency_key_idx` | `bookings` | ❌ **missing** |

The legacy `bookings` rail is **still live** (CLAUDE.md §15c: `/booking-demo`,
`POST /api/bookings/process-cart`). This is the index whose absence was previously *measured* to turn
3 concurrent same-key checkouts into 3 real Stripe charges. Two more on the same live table are also
undeclared: `bookings_stripe_payment_intent_id_unique` (053), `bookings_expert_slot_unique_idx` (099).

**Plan.**
1. **Prod duplicate check first — non-negotiable.** For each index, run
   `SELECT <cols>, count(*) … GROUP BY 1 HAVING count(*) > 1` against prod. A violated UNIQUE fails
   the publish and surfaces the destructive *"copy dev database over production"* option, which must
   never be accepted.
2. Declare each in the owning `pgTable`'s index callback, **mirroring the partial `WHERE` clause**
   where the migration has one (096 and several others are `WHERE … IS NOT NULL` — a full index
   would behave differently and could fail on legacy NULLs).
3. Skip `service_demand_requests_user_uniq` — that table was retired by migration 158.
4. Order the work by blast radius: the three `bookings` indexes first, the rest after.

**Guard.** Promote the sweep I wrote (`scratchpad/idx.cjs`) into `scripts/check-schema-drift.cjs` in
CI. Per §18d it ships with `--self-test` fixtures and **states its negative space**: it resolves
`export *` chains and ignores names appearing only in comments, but it only covers UNIQUE indexes and
tables — non-unique indexes, columns, and CHECK constraints are outside its predicate.

**Proof.** Declaration alone isn't proof. Add a DB test that inserts two rows with the same
`idempotency_key` on `bookings` and asserts the second is rejected — the same shape as the existing
`service_bookings` proof, so both rails are covered by symmetric tests.

**Risk:** low. Additive declarations, no behavior change, no migration.

### A2 · `rate-limiter.ts` timer never unref'd

**Verified:** `server/infrastructure/rate-limiter.ts:22` —
`this.cleanupInterval = setInterval(() => this.cleanup(), 60000);` with no `.unref()`.

**Why it matters:** the timer keeps the Node event loop alive, so the process won't exit cleanly —
which shows up as hanging test runs and delayed graceful shutdown, not as a user-visible bug.

**Plan:** append `.unref()`. One line. Verify a test process exits without `--forceExit`.

---

## Lane B — Money-path resilience.

### ~~B1 · Shared Stripe client factory~~ · **WITHDRAWN — premise was false** (task #230)

**Verified against the installed library and the CI contract on Aug 8 2026; three of my own claims
were wrong. No code needed.**

1. **`maxNetworkRetries` is ALREADY 2 — by default.** stripe-node 18.5.0 defaults it
   (`stripe.core.js:72`, `validateInteger('maxNetworkRetries', props.maxNetworkRetries, 2)`),
   confirmed empirically: `new Stripe(key).getMaxNetworkRetries()` returns `2` with no option
   passed. All 23 clients already retry twice. Setting it explicitly is a literal no-op.
2. **Retries were never unsafe.** stripe-node auto-generates an idempotency key for any POST
   whenever `maxNetworkRetries > 0` (`RequestSender.js:199-215`, `_defaultIdempotencyKey`). The
   "confirm every mutating site passes a key before giving it retries" step I called *"the actual
   work"* was unnecessary — the library guarantees it.
3. **The checkout 503 is not a defect at all.** It is the deliberate §15b response at
   `payments.routes.ts:338`, whose own comment reads *"THE FAILURE THIS LANE EXISTS FOR. Nothing
   irreversible has happened."* In CI it fires because there is no real Stripe key, and
   `journey-suite.yml:197` asserts it as a **hard negative contract** — *"the specs assert the
   declared 503 payment_unavailable AND the absence of every money-path fact … not a silent pass."*
   The flakiness I attributed to missing retries was the suite correctly proving that a failed
   authorization commits nothing.

**Residual, and deliberately not done now:** the 23 sites duplicate the `apiVersion` string, and
the default timeout is 80 s (`getApiField('timeout')`), which is long for a checkout request. Both
are hygiene, not bugs. Shortening a money-path timeout is a behavior change with its own risk
(a timed-out POST is ambiguous about whether it landed) and should be its own decision, not a
side effect of a refactor. **Do not spend 23 money-path call-site edits on a no-op.**

**Consequence for sequencing: B2 is no longer blocked.** B1 was its only stated prerequisite.

### B2 · One-click for booking checkout  (closes task #228)

**Status correction:** one-click **already works** — `chargeSavedMethod` is wired into
`/api/coordination-states/:id/pay` (`routes.ts:7232`) and the optimize fee
(`optimization.routes.ts:295`). The gap is that `payments.routes.ts` (`/api/checkout`) has **no**
`chargeSavedMethod` call at all, so booking checkout still demands card entry from a user who
already has a vaulted card. So #228's original ask — fewer steps between "AI optimize" and results —
is **delivered for the optimize fee** and outstanding only for booking.

**Rules:** §14 (amount server-derived from the catalog, never `req.body`), §15/§15b (claim →
authorize → promote; the claim is not the commitment), §15c (one promotion implementation).

**Plan.** Do **not** add a second payment path. `/api/checkout` already runs the claim spine. The
change is narrow: after the claim is written and before the PaymentIntent is created, if the user
has a saved method, confirm off-session in the same step instead of returning a client secret. The
promotion leg stays exactly `promotePaidCheckout` — §15c's "one promotion, two callers" must not
become three.

**Proof:** the existing checkout-claim sweep (9/9) and promotion (11/11) suites must stay green
untouched; add a negative asserting a one-click failure leaves a reclaimable claim, never a
half-committed booking.

---

## Lane C — The product direction (segmentation).

Full design: `docs/briefs/TRIP_SEGMENTATION_DESIGN.md`. Mockup:
`https://claude.ai/code/artifact/83a0bf30-2d9c-4028-a652-2cc11cb91e3f`.

### C1 · Four decisions — blocks everything below

1. Multi-city shape — A (N linked trips, recommended), B (`trip_segments` table), or C (jsonb route).
2. Where the collection's date range lives — extend `TripContext`, or a new collection-scoped record.
3. Low-confidence default — propose the split, or propose one trip and offer the split.
4. Do `unplaced` items block materialization, or can the traveler proceed and resolve later?

**Also required before code, per CLAUDE.md Coordination Prevention:** §1 says update CLAUDE.md
*first* for schema/routing decisions. Multi-city is a schema decision, so the ruling lands in
CLAUDE.md before the migration is written, not after.

### C2 · Segmentation engine, shipped dark

Strategies `single` / `multi_city` / `split` only. The engine replaces `routes.ts:5670-5684`'s
`sort()[0]` collapse with clustering, and returns a proposal.

**The safety property that makes this cheap:** `strategy: "single"` must reproduce today's trip
**byte-for-byte**. That makes phase 1 verifiable against the existing journey suite before any UI
moves, and reversible by forcing `single`.

Contract rules that must not be weakened (brief §5): propose-never-commit; every item placed or
explicitly `unplaced`; override wins; no fabricated geography; strategy server-derived — a
client-supplied `strategy` or `segments` is never trusted (§14 posture, applied to planning).

### C3 · Proposal UI · C4 · Multi-city materialization

Per the mockup and the §6a decision. C4 declares its new object in `shared/schema.ts` (A1's lesson).

### C5 · Vocabulary rename — deliberately last

Inventory: `docs/findings/CART_VOCABULARY_INVENTORY.md`. Recommended vocabulary **"Trip Slip" /
"Slip"**, which the product already uses (`SlipView.tsx`, `/plans/:tripId`, `trackingNumber` shown
as "Slip ‹num›"), and which `cart.tsx` already routes to on conversion.

Sequenced last on purpose: **naming should follow settled behavior.** Renaming before segmentation
lands means renaming twice.

Scope discipline: rename **copy and testids only**. Do **not** rename `/api/cart/*` routes or any DB
object — the routes are consumed directly by `cart-checkout-redirect-gate.yml`, and the DB objects
fall under the deploy-push trap.

> ⚠️ Highest-risk item in the whole rename, and it fails silently: `scripts/check-linkage-preservation.cjs`
> carries an identifier allowlist including `cartItem` / `getCartItemById`. Renaming those identifiers
> without updating the script makes the guard **under-detect linkage bugs while still reporting PASS**.
> That is exactly the §18d failure mode. It must be an explicit checklist line, not left to CI.

---

## Lane D — Structural debt.

### D1 · PS18 allowlist conversion — ride C2 rather than retrofit

**Rule:** §19 — a privileged column is client-settable **by default** under a denylist (`.omit()`),
and nobody edits an omit list for a column that didn't exist when it was written. The fix shape is a
pick-based allowlist.

**Verified posture, unchanged:** 187 `createInsertSchema` calls, **186 `.omit()`-based, 0 `.pick()`-based.**

**Plan — do not open with a 186-schema retrofit.** That is a large, risky diff with no behavior
change to show for it. Instead:
1. **Every new schema C2/C4 introduces is `.pick()`-based from birth.** Segmentation adds insert
   schemas; §19 says they must be allowlists, so the cheap entry point is new code, not old.
2. Retrofit opportunistically: when a schema is touched for another reason, convert it.
3. Keep `scripts/check-omit-schema-ratchet.cjs` as the down-only ratchet so the count can never rise.

This converts the layer without a flag-day diff, and satisfies §19 where it actually matters —
before the next privileged column is added.

### D2 · MT-3 — orphaned `/api/messages` surface

**Verified, and narrower than originally filed.** `unread/count` and `conversation/:id/read-all`
**do** have real callers (`use-message-read.ts`, `dashboard-sidebar.tsx`, `inbox.tsx`). Only
**send / list / detail / search** are orphaned beside `/api/chats`.

**Plan:** retire the four orphaned handlers, keep the two live ones. Two parallel message-write
surfaces is drift waiting to happen — and §9 warns a dead endpoint returns 200-HTML, not 404, so
absence of errors proves nothing. Verify with the unmounted-router guard, not by probing.

### D3 · MT-4 — message lost during WebSocket reconnect

**Verified:** `client/src/hooks/use-websocket.ts:78-82` reconnects with exponential backoff, but a
message submitted during the flap is silently dropped — stays in the input, no request, no error.

**Plan:** queue outbound messages while `readyState !== OPEN` and flush on reopen; show a sending
state rather than failing silently. Bound the queue and surface a real error if reconnect exhausts
its attempts — silent loss is the actual defect, and a silent queue that drops on exhaustion just
moves it.

---

## ~~Lane E — Housekeeping~~ · CLOSED (decision-maker, Aug 8 2026)

Lane E is resolved and carries no remaining work. Retained here only so the lane letters in the
sequencing diagram above still resolve.

- **E1 · Guest-invite A2/A3** — was **task #154, a stale duplicate of task #208**, which is already
  completed. Closed, no work. (This is why the item looked long-pending: it was finished under a
  different task id.)
- **E2 · Expert write scope** — settled by the decision-maker; no ruling outstanding.
- **E3 · Replit backup branch** — handled on the Replit workspace; nothing to review here.

---

## Recommended order

1. ~~**A1 + A2**~~ — **LANDED** (`26c5939d`). A1 carries a publish gate: run
   `node scripts/preflight-prod-unique-indexes.cjs "<PROD_DATABASE_URL>"` before deploying.
2. ~~**B1**~~ — **WITHDRAWN**, premise false (see above). No work.
3. **C1** — your four decisions; unblocks the whole product lane.
4. **B2** and **C2** in parallel — different subsystems, no overlap. B2 is now unblocked.
5. **C3 → C4**, then **D1** riding along.
6. **C5** last. **D2/D3** as capacity allows. (Lane E is closed.)
