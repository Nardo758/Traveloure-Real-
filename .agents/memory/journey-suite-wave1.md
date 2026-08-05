---
name: Journey suite conventions & open findings
description: How to run/extend the journey test suite (serialization, Stripe test mode, DB-write guard) and the open optimizer-AI defect on the J1 beta-gate path.
---

# Journey suite — durable conventions

- **Journeys run `--workers=1`** (pinned in the test:journeys script). Parallel Playwright workers against the shared dev server + live AI calls flake; green serially.
- **Local journey/negatives runs need `JOURNEY_DB_WRITES_OK=1`**: the dev DB host is not localhost, and `assertDisposableDb` in `playwright/tests/journeys/_journey-helpers.ts` fail-closes all cleanup writes otherwise (CI sets it against its throwaway Postgres). Cleanup DELETEs are scoped to run-specific fixture emails only.
- **Stripe test mode is reachable even when the workspace secret is live.** The server's runtime key is the connector `sk_test_` from `scripts/dev-stripe-key.cjs`; a process reading the `STRIPE_SECRET_KEY` env sees the prod secret and wrongly concludes "live mode". Tests confirm PIs with the connector key + `pm_card_visa`.
- **Paid gates are testable, not blockers**: the optimization fee is payable for real in test mode (optimization-payments endpoint → confirm PI → create comparison with the payment id).
- Matrix lint convention: test files carry `matrix-id: <ID>` comments; every matrix cell needs an id, a `deferred:<tag>`, or `n/a:`; deferred tags live in the matrix's Deferred-tag register (merged-but-still-used fails the lint).
- Background `nohup` processes do not survive shell sessions here; run long suites in foreground batches.

## Open findings (recorded in-spec, not fixed)
1. **Optimizer AI generation broken on main** — the configured Grok model is deprecated (x.ai 400) and the Anthropic fallback fails downstream parsing; comparisons land `status='failed'` with only the baseline variant. Blocks the AI leg of the optimizer journeys and sits on the J1 beta-gate critical path. Needs its own task.
2. Duplicate `GET /api/trips/:id` registration — the requireAuthOrShareToken route shadows the trips-router IDOR-logging 403 path (contract still holds via 401).
3. Ready-made purchase clone spreads item fields without an explicit `routing_status: 'in_planning'` override (contract asks for explicit).
4. Share page renders a bespoke day/activity list from `generated_itineraries.itinerary_data` (not ItineraryCard / itinerary_items) — lane-5 renderer swap still pending; share-view edit reflection only surfaces via regenerate.
