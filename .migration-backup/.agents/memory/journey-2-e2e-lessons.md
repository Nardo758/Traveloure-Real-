---
name: Journey-2 E2E lessons
description: Fixes needed to get journey-2 Playwright tests green; Playwright OOM pattern on Replit
---

## itinerary_comparisons.budget is decimal(10,2)
String tier values ("moderate", "luxury", "budget") must be coerced to NULL before insert, not .toString(). Pattern to use everywhere:
```ts
budget: budget != null && !isNaN(Number(budget)) ? String(budget) : null,
```
Affected files (3 sites fixed): server/routes.ts ~7103, server/routes/content.routes.ts ~4287 and ~4408.

**Why:** Postgres rejects `invalid input syntax for type numeric: 'moderate'` at insert time, surfacing as a 500 from the AI itinerary generation endpoint.

## interests field must have a default
`POST /api/generate-itinerary` and related endpoints guard `interests` with a Zod `.min(1)` check. If the client sends `[]` or omits it, the request was rejected. Fix: always fall back to a sensible default:
```ts
const effectiveInterests = (interests && interests.length > 0)
  ? interests : ["sightseeing", "local culture", "food"];
```
Fixed in 4 places: routes.ts (2 sites), content.routes.ts (2 sites).

## DashboardLayout must have data-testid="link-logo"
`waitForNav()` in E2E global-setup and helpers waits for `[data-testid="link-logo"]`. The `ConsoleAwareLayout` → `DashboardLayout` path (used on /discover when logged in) was missing this testid. Added `<Link href="/" data-testid="link-logo">` to the header brand logo in `client/src/components/dashboard-layout.tsx`.

**Why:** 2C test visits /discover as a logged-in traveler, which uses DashboardLayout, not the public Header.

## filterJsErrors must exclude Vite HMR WebSocket noise
Playwright's console error collector picks up Vite HMR WebSocket messages that appear in every dev-server run:
- `"WebSocket connection to 'ws://localhost:5000/vite-hmr?token=...' failed"`
- `"Failed to send error to Vite server: TypeError..."`

These don't contain `[vite]` (the existing filter), so they slip through. Add:
```ts
!e.includes('vite-hmr') &&
!e.includes('Vite server') &&
!e.includes('WebSocket') &&
```

## 2A test needs test.setTimeout(120_000)
The AI generation call (`/api/ai/generate-itinerary`) takes 35-40s. With a 45s global test timeout and ~10s of page navigation overhead, `waitForURL` times out before the redirect fires. Add `test.setTimeout(120_000)` as the first line of the 2A test body.

## Playwright process OOM pattern on Replit
After all tests complete, Playwright tries to write the HTML report + video files. On Replit's constrained memory, this cleanup can OOM-kill the process, producing exit code -1 with no summary printed. The test results are already written to `test-results/.last-run.json` before cleanup; check that file to confirm pass/fail status regardless of exit code.

**How to apply:** If you see exit code -1 with partial output but no failure messages, read `test-results/.last-run.json` — `"status": "passed"` means the tests are green.

## Auth file freshness fast-path
e2e/global-setup.ts: skip re-auth and warm-up when all role JSON files in `e2e/auth/` are < 30 min old. Saves ~3 min per re-run. Touch the files (`touch e2e/auth/*.json`) before re-running to extend the window another 30 min.

## Run tests in split bash calls when suite exceeds 119s
The bash tool has a 119s max timeout. Journey-2 with 2A (120s per-test budget) + 2C + 2D exceeds this. Split into:
1. `--grep "EnhancedPlanningModal"` — 2A alone (~55s)
2. `--grep "ExpertMatchCard|Expert tab"` — 2C+2D together (~30s)
