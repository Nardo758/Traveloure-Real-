# Deferred IDOR Routes — Low-Stakes Follow-Up

> **Status:** Deferred. Not on the critical path.
> **P0 deploy blocker:** E2E-1 must run green first.

---

## What was done (committed)

- `PATCH/DELETE /api/custom-venues/:id` — ownership check added (`userId` vs `venue.userId`)
- `PATCH/DELETE /api/cart/:id` — ownership check added (Stage 0)

## What was already protected (sweep script false positives)

- `PATCH/DELETE /api/provider/services/:id` — `getProviderServices(userId)` + `find-by-id` pattern
- `PATCH /api/service-bookings/:id/visa-status` — `providerId !== userId` check
- All bookings/contracts/trips/participants — `verifyTripOwnership` or `providerId` checks

## Remaining unprotected routes (low-stakes, deferred)

| Route | Method | Risk | Why deferred |
|---|---|---|---|
| `PATCH/DELETE /api/user-experience-items/:id` | PATCH/DELETE | Low | No userId column; owns via parent `userExperienceId` |
| `DELETE /api/notifications/:id` | DELETE | Low | Only deletes user's own notification by ID; no cross-user data |
| `PATCH/DELETE /api/faqs/:id` | PATCH/DELETE | Low | Admin-only surface; `isAuthenticated` is the gate |
| `PATCH/DELETE /api/admin/*` | Various | Negligible | Admin role gate is the intended authorization |
| `DELETE /api/expert/selected-services/:id` | DELETE | Low | Expert's own service selection |
| `DELETE /api/expert/specializations/:id` | DELETE | Low | Expert's own specialization |

## Fix strategy (when picked up)

For each: add `getById` + `userId` check, or verify the storage layer already has the check. Pattern:

```typescript
const userId = (req.user as any).claims.sub;
const item = await storage.getItem(req.params.id);
if (!item) return res.status(404).json({ message: "Not found" });
if (item.userId !== userId) return res.status(403).json({ message: "Forbidden" });
```

## Gate: Do not start this until E2E-1 is green and Stage 2 is complete.
