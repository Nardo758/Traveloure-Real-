---
name: Route module mount gap
description: paymentsRoutes imported but never mounted in routes.ts — endpoint returned Vite HTML fallback
---

## Rule
After adding or importing a new Express router module in `server/routes.ts`, always verify it appears in an `app.use(...)` call in the `registerRoutes` function body — not just as a top-level import.

**Why:** `server/routes.ts` had `import paymentsRoutes from "./routes/payments.routes"` at line 98 but no corresponding `app.use(paymentsRoutes)`. Every request to `/api/booking-fee-config` fell through to Vite's SPA fallback and returned `<!DOCTYPE html>` with HTTP 200, causing the fee-parity CI check to fail with a JSON parse error.

**How to apply:** When a route endpoint returns HTML instead of JSON (and Express is set up with Vite dev middleware), grep `server/routes.ts` for the import and confirm the variable also appears in `app.use(...)`. If not, add the mount near the other `app.use(routeModule)` calls around lines 388–420.

## Debugging gotcha: slow restart
After editing `server/routes.ts`, the server takes 15-20+ seconds to fully restart because of database seeding and Fever/cache refresh on startup. A `sleep 4` before `curl` is not enough — the server is still running old code. Always use `restart_workflow` with a 60s timeout, then test immediately without extra sleep. Symptom: new routes still return HTML 200 after a short sleep, but work after a proper restart wait.
