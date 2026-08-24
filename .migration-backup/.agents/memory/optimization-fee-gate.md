---
name: Optimization fee gate (G3+G4)
description: Preview endpoint + Stripe payment gate before full LLM itinerary optimizer; complexity tier drives fee; 24h free-rerun.
---

## Rule
The full `/api/itinerary-comparisons` LLM optimizer is now gated behind a one-time Stripe payment. A heuristic preview runs first (no LLM), then the user pays the complexity-tiered fee before the full optimizer fires.

**Why:** Prevent abuse of expensive Grok/Claude optimizer calls; monetize the optimizer as a standalone feature.

## How to apply

### Complexity tier → fee mapping
- `simple` ($4.99): vacation, birthday, adventure, cultural, general
- `standard` ($9.99): honeymoon, proposal, anniversary, multi-city
- `complex` ($19.99): wedding, corporate
- Lookup: `complexityTier(eventType)` in `server/services/smart-sequencing.service.ts`

### 24h free re-run
- `optimized_at` timestamp on `itinerary_comparisons` is stamped when `generateOptimizedItineraries()` succeeds
- `POST /api/optimization-payments` checks for any comparison with `optimized_at >= NOW() - 24h` for the user; returns `{ freeRerun: true }` if found
- `POST /api/optimization-preview` also returns `freeRerun` so the UI can skip the payment gate

### DB tables
- `optimization_fees` table (seeded on startup): 3 rows keyed on `complexity_tier` (unique)
- Admin can change prices via `GET/POST /api/admin/optimization-fees`

### Cart flow steps
`cart → optimize (preview+payment) → itinerary → payment`
- "Generate Itinerary" button now calls `/api/optimization-preview` first
- Preview step shows estimate card + Stripe Elements (or free-rerun badge)
- On payment success → `POST /api/optimization-payments/confirm` (records revenue) → `createComparison()`

### Revenue tracking
`POST /api/optimization-payments/confirm` calls `revenueTrackingService.recordRevenueEvent()` with `sourceType: 'other'` after verifying PaymentIntent status with Stripe.
