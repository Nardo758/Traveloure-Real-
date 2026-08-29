# Audit brief — Concierge Revision P3 (admin dispute + no-self-serve-refund flip)

**Mock:** `docs/design/concierge-revision-p3-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-22-concierge-p3` (final Concierge phase — the flip + admin dispute queue), building on `2026-08-22-concierge-revision` (P1) and `2026-08-22-concierge-revision-p2` (P2)
**Status:** merged — despite the mock's own footer text ("Nothing here is built yet — awaiting approval before implementation"), `docs/DECISIONS.md` records `2026-08-22-concierge-p3` as EXECUTED, same session. Treat the footer's "not built yet" line as stale mock copy, not a live disclaimer — audit the code as shipped, not as pending.
**Live surfaces:**
- `client/src/pages/my-bookings.tsx` (refund button removed; revision status + "Something wrong?" concern link)
- `client/src/pages/ready-made-detail.tsx` (listing promise copy — "Includes 1 consultation + 1 revision" replacing "Refundable for 7 days")
- `client/src/pages/admin/reconciliation.tsx` (new "Concierge disputes" queue)
- `server/routes/ready-made.routes.ts` (`concern`, admin `disputes`/`refund` endpoints)
- `server/services/ready-made-purchase.service.ts` (`refundReadyMadePurchaseLedger` with `actor` param)
- `shared/schema.ts` (`dispute_status`/`dispute_reason`/`disputed_at` on `ready_made_purchases`, migration 253)
- `server/routes/admin.routes.ts` (§2 blanket `requireAdmin` guard covering the dispute routes)

## Behaviors the mock ratifies

1. **The recourse ladder is exactly three rungs**, in this order: (1) self-serve revision request → (2) buyer "concern" → admin dispute row (no money moves yet) → (3) admin refunds or dismisses. The buyer-facing refund button is removed ONLY because rungs 1–2 exist first — order matters, not just presence.
2. The ready-made listing's "What's inside" card **no longer states "Refundable for 7 days."** It states "Includes 1 consultation + 1 revision with the expert who built it" — static copy, true of every ready-made purchase alike (§13: promise only what's true for all; no new field needed since it never varies per listing).
3. On My Bookings, the destructive **"Request refund" button and its mutation are removed** — not hidden, not disabled, removed as dead code (the mock names it as "the endpoint's only caller").
4. In its place, the row shows the **live derived revision status** (available / in progress / delivered) as the primary affordance, plus a quiet "Something wrong?" link that opens a **concern dialog**, not a refund flow.
5. The concern dialog's disclosure copy is honest about the odds: "Most are resolved with a revision from your expert — this doesn't guarantee a refund." It must never promise a refund outcome.
6. Submitting a concern creates a **dispute row** (`dispute_status='open'`) via an atomic claim (`WHERE buyer_id=? AND status IN (paid,cloned) AND dispute_status IS NULL`) — idempotent, one dispute per purchase per claim.
7. On the winning claim, the **selling expert's escrowed earning is FROZEN** (existing `setBookingEarningsDispute`, reference_id = the purchase id) so an admin decision has real money to act on — this is what makes rung 3 an actual escape hatch rather than a promise with nothing behind it.
8. The admin dispute queue (`GET /api/admin/ready-made/disputes`) shows **facts, not a verdict**: revision requested-at, advisor workspace status, "Revision used" (Yes/No) — never presented as a determination of fault, since a stale `delivered` status can't be trusted as proof the buyer actually used it (§13).
9. **Refund buyer** is one implementation with two callers (buyer path retired, admin path added): `refundReadyMadePurchaseLedger(id, null, {actor:'admin'})`. The admin actor skips the buyer-ownership gate and the time-window gate, but is bound by its own rules: a 90-day outer bound, ALWAYS soft-revokes the clone (buyer keeps the trip — never the destructive hard-delete), and REFUSES when the author's earning is already `paid_out` (never pays both sides, never claws back).
10. **Dismiss** is a symmetric atomic transition (`WHERE dispute_status='open'`) that un-freezes the earning and notifies the buyer — the release clock resumes exactly where it left off.
11. Refund amount and the acting admin identity are **server-derived** (§14): amount from the purchase row, actor from `session.user.role === "admin"` — never from `req.body`.
12. Dispute fields (`dispute_status`, transitions) are **not client-writable** — buyers can only set `dispute_reason` through the concern endpoint; every status transition is server-owned (§19 allowlist posture).
13. The admin dispute queue sits on the **existing** Reconciliation & Disputes page as a new card, beside the existing "Active Disputes" queue — not a new standalone admin page.
14. Automated refunds are explicitly out of scope — "Not in this phase" per the mock's own scope box: a human decides every refund, no partial/prorated refunds, and this governs ready-made purchases only (not other refund types).

## Visual grammar

This mock (unlike `concierge-revision-mock.html`) uses a distinct bespoke palette (`--accent`/`--red`/`--green`/`--amber` tokens, Fraunces + IBM Plex Sans/Mono) — not `--earn-*` tokens. This predates the `2026-08-25-marketplace-earn-grammar` ruling; do not flag its palette as a grammar violation unless a later ledger row specifically re-tokens the reconciliation/my-bookings surfaces.

## How to audit

```bash
# Refund button removed from My Bookings (the historical rmRefund mutation should be gone)
grep -n "rmRefund\|Request refund" client/src/pages/my-bookings.tsx

# Listing promise copy swap
grep -n "Refundable for\|consultation.*revision\|Concierge included" client/src/pages/ready-made-detail.tsx

# Concern endpoint + atomic dispute claim
grep -n "dispute_status IS NULL\|disputeStatus.*null\|/concern" server/routes/ready-made.routes.ts

# Admin dispute queue + refund endpoint, actor-derived
grep -n "actor.*admin\|refundReadyMadePurchaseLedger" server/services/ready-made-purchase.service.ts server/routes/*.ts

# §2 blanket admin guard covers the new routes (no per-endpoint opt-in)
grep -n "requireAdmin\|app.use(\"/api/admin\"" server/routes.ts

# Escrow freeze on the winning concern claim
grep -n "setBookingEarningsDispute" server/services/*.ts server/routes/ready-made.routes.ts

# Schema — additive, no CHECK
grep -n "dispute_status\|dispute_reason\|disputed_at" shared/schema.ts
```

Route to open: `/my-bookings` as a ready-made buyer (revision status + "Something wrong?" link, no refund button); `/ready-made/:id` (listing promise copy); `/admin/reconciliation` as an admin (Concierge disputes card with Dismiss/Refund actions).

## Known divergences / notes

- The mock's footer text ("Nothing here is built yet") is stale relative to the ledger — do not report the mere presence of built functionality as a "mock says draft, code disagrees" defect. This is expected: the mock file was authored before build and never updated after ratification.
- `concierge-revision-mock.html`'s own Screen 4 draws a simplified version of this same admin dispute hatch; that mock's brief defers to this one for the dispute-queue behavior to avoid duplicate findings.
