# Audit brief — Concierge Revision (P1 + P2 sign-off mock)

**Mock:** `docs/design/concierge-revision-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-22-concierge-revision` (P1 — entitlement spine), `2026-08-22-concierge-revision-p2` (P2 — inbox/consult/status derivation), plus `2026-08-22-post-purchase-hardening` (the delete-guard this model depends on)
**Status:** merged — P1 and P2 are EXECUTED per `docs/DECISIONS.md`. Screen 4 (admin dispute hatch) in this mock was P1/P2-era forward-looking; it is now ALSO merged, but under the separate `2026-08-22-concierge-p3` ledger row — see `concierge-revision-p3-mock.audit.md` for that screen's own brief. Audit this file's Screens 1–3 (P1/P2) directly; treat Screen 4 as covered by the P3 brief, not this one.
**Live surfaces:**
- `client/src/components/marketplace/concierge-card.tsx` (the "Concierge support" card — P1/P2)
- `client/src/pages/expert/inbox.tsx` (Assigned Trips + consult chat — P2)
- `server/routes/ready-made.routes.ts` (by-clone read, request-revision write)
- `server/services/ready-made-purchase.service.ts` (refund ledger, soft-revoke guard)
- `shared/schema.ts` (`readyMadePurchases.revision_status` / `revision_request_note` / `revision_requested_at`, migration 252)
- `client/src/components/plancard/SlipView.tsx` (Slip page the Concierge card mounts on)

## Behaviors the mock ratifies

1. Every ready-made purchase carries exactly **one consultation + one revision** entitlement, tracked as `revision_status` on `readyMadePurchases` (NULL=available → requested → in_progress → delivered). One entitlement per purchase, not per item.
2. The Concierge card renders **only on a ready-made clone trip** — nothing on an ordinary trip (`GET /api/ready-made/purchases/by-clone/:tripId` returns `{purchase:null}` for non-clones, and the card self-gates to nothing rather than rendering an empty/misleading state).
3. Requesting a revision grants the **selling expert WRITE access** to the buyer's clone via a `trip_expert_advisors` row (status `accepted`, a §12 WRITE-access status) — the same grant mechanism assigned advisors already hold. No new access-grant machinery.
4. The revision request is buyer-owned and **idempotent by atomic conditional** (`UPDATE … WHERE buyer_id=? AND revision_status IS NULL`) — a double-click claims the entitlement exactly once, never twice.
5. The buyer-facing revision status (available/requested/in progress/delivered) is **derived**, not independently stored: it maps from the selling expert's advisor `workspaceStatus` on the clone (the existing draft→in_review→delivered machine), so there is one source of truth for "where is my revision" (§18 derivation discipline).
6. Changes the expert makes ride the **existing Suggest → approve flow** (`POST /api/trips/:id/suggestions`) — the expert never silently edits the buyer's trip; the buyer approves each change. This is why "1 revision" has a clear done-line (approved = Delivered).
7. The included consultation is an ordinary chat thread scoped to the purchase (`useAskExpert()` → `/chat?expertId=`) — no new messaging system.
8. Escrow's meaning shifts from "buyer refund window" to "expert's service-deadline SLA" — the mock's lifecycle strip note states this explicitly; it does not change the underlying `ready_made_sale` hold mechanism.
9. §13 honesty: the Concierge card promises only the one consult + one revision actually committed — never "unlimited edits" or a money-back guarantee.
10. Map view (Screen 1b) honesty rules: only located stops are pinned; unlocated stops are listed below the map, never guessed onto it; zero located stops ⇒ no map renders at all (never a city-center fallback). This reuses the same `MapControlCenter` the PlanCard already mounts — one implementation.
11. The mock's own annotation (Screen 1) flags the rich provider-transport rendering (green "✓ Book on Traveloure" badge + real provider + Book CTA) as shipping on the full PlanCard's `TransportSection` today, but **not yet** on the Slip's `LogisticsRow` — a documented, known gap, not something to "fix" as a regression.

## Visual grammar

This mock predates the earn-grammar ruling (`2026-08-25-marketplace-earn-grammar`) — it uses its own bespoke palette (`--accent`/`--teal`/`--amber`, Fraunces + Archivo), not `--earn-*` tokens or Geist Mono. Do not flag the absence of earn-grammar tokens here; that ruling landed later and does not retroactively apply to this already-merged surface unless a separate ledger row says the Concierge card was re-tokened.

## How to audit

```bash
# Entitlement spine + schema
grep -n "revision_status\|revisionStatus" shared/schema.ts
grep -n "revision-status\|request-revision" server/routes/ready-made.routes.ts

# Idempotent atomic claim on request-revision
grep -n "revision_status IS NULL\|revisionStatus.*null" server/routes/ready-made.routes.ts server/services/*.ts

# Advisor WRITE grant reuse (no new access table)
grep -rn "trip_expert_advisors\|tripExpertAdvisors" server/routes/ready-made.routes.ts

# Concierge card self-gates on non-clone trips
grep -n "purchase.*null\|by-clone" client/src/components/marketplace/concierge-card.tsx

# Derived status mapping (not a second stored status)
grep -n "workspaceStatus\|delivered.*in_review\|derivedStatus" server/routes/ready-made.routes.ts server/services/booking-actions.service.ts
```

Route to open: `/plans/:id` for a ready-made-clone trip as the buyer (Concierge card above the plan days); `/expert/inbox?tab=assignments` as the selling expert (Assigned Trips shows "Revision requested" + buyer note).

## Known divergences / notes

- Screen 4 (admin dispute hatch) is drawn here but its actual ratification and build landed under the separate `2026-08-22-concierge-p3` ledger row with its own richer contract (concern dialog, dispute table, `dispute_status` column, `refundReadyMadePurchaseLedger(actor:'admin')`). Audit that behavior against `concierge-revision-p3-mock.audit.md`, not this file, to avoid double-flagging the same code against two different specs.
- The Slip's `LogisticsRow` not yet rendering platform-provider transport (noted in behavior 11) is a **documented gap**, not a defect to report as new.
