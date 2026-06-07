# Route Defragmentation Audit — Cost Tracking & Unmounted Modules

## Findings

**7 Anthropic call sites in `server/routes.ts` (LIVE routes):**

| Line | Endpoint | Module | Mounted? | Status |
|------|----------|--------|----------|--------|
| 796 | `/api/trips/generate-itinerary` | trips.routes.ts | ❌ No | Duplicate (82/85) |
| 1206 | `/api/ai/generate-blueprint` | content.routes.ts | ❌ No | Duplicate (237/243) |
| 1261 | `/api/ai/chat` | content.routes.ts | ❌ No | Duplicate |
| 1343 | `/api/ai/optimize-experience` | content.routes.ts | ❌ No | Duplicate |
| 5149 | `/api/discover/recommendations` | content.routes.ts | ❌ No | Duplicate |
| 8500 | `/api/transport-packages/generate` | transport-hub.routes.ts | ✅ Yes | Already mounted |
| 20426 | `/api/visa/requirements` | experts.routes.ts | ❌ No | Duplicate (160/163) |

**Cost tracking status:**
- ✅ **LIVE versions** (routes.ts): instrumented with `trackAnthropicResponse()`
- ❌ **UNMOUNTED versions** (module files): NOT instrumented (dead code, unreachable)

---

## Problem

Route-defrag (post-launch, 6 phases) will:
1. Mount each unmounted module (e.g., `app.use(tripRoutes)`)
2. Delete the `routes.ts` duplicates
3. Live traffic shifts from `routes.ts:796` → `trips.routes.ts` handler

**If we don't instrument the module versions now:**
- Pre-swap: cost tracking works (routes.ts handlers are live)
- Post-swap: cost tracking silently breaks (module handlers have no cost tracking)
- Result: CON-B 4-week data window gets corrupted mid-collection

---

## Recommendation

**Instrument the module versions NOW (5-min follow-up):**

Patch the same 6 unmounted modules with cost tracking (mirror the routes.ts instrumentation). Once route-defrag swaps them in, cost collection flows through uninterrupted.

**Implementation:**
```
trips.routes.ts: instrument line ~320 (generate-itinerary)
content.routes.ts: already instrumented (5 sites) ✓
experts.routes.ts: instrument line ~4644 (visa-requirements)
transport-hub: already instrumented (already mounted) ✓
```

---

## Why This Matters

Concrete case (from brief): FEE-A payment-amount validator landed in unmounted `trips.routes.ts`, making it dead code. A billing leak resulted (closed in `d886791` LB-P3.5). Route-defrag prevents this, but only if instrumentation anticipates the swap.

---

## Next Steps

**Option A (recommended):** Instrument the 2 remaining unmounted modules (trips, experts) now → ensures cost data is clean through 4-week accumulation + route-defrag transition.

**Option B:** Skip instrumentation now, re-instrument during route-defrag Phase P1/P3 → shorter now, requires post-swap re-testing.

**I recommend A:** 10 min, low risk, avoids mid-collection data loss.
