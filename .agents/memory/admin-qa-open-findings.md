---
name: Admin QA open findings (unfixed)
description: Two live-verified admin bugs found during QA (Aug 2026) that could not be filed as follow-up tasks due to proposal throttling — fix or file when possible.
---

# Open QA findings, not yet fixed or filed as tasks

1. **Service delete destroys booking history (critical).** DELETE /api/admin/services/:id on a service with bookings returns `{"ok":true}` and CASCADE-deletes the `service_bookings` rows (plus reviews, cart items, availability). Verified live: created service + completed booking, admin delete → booking gone. Fix: block delete when bookings exist (409) or soft-delete/archive; consider FK migration CASCADE→RESTRICT/SET NULL. Handler: `server/routes/admin.routes.ts` DELETE services (~:2917), only guards bundle FK today.
2. **Fee-band editor silently drops non-numeric rates.** PATCH /api/admin/fee-bands/:bandKey with string `defaultRate` falls back to the current value (typeof check ~:5309) and returns `200 ok` — false "saved". Negative/above-max are correctly 400'd. Fix: 400 on present-but-invalid rate fields.

**Why:** both were live-verified during QA sessions; follow-up-task proposals were throttled twice, so nothing tracks them except this note and the chat reports.
**How to apply:** when planning admin work or asked about known issues, surface these; delete this file once both are fixed or filed as tasks.
