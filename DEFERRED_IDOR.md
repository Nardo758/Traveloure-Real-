# Deferred IDOR Routes — Low-Stakes Follow-Up

> **Status:** Deferred. Not on the critical path.
> **P0 deploy blocker:** E2E-1 must run green first.

---

## What was done (committed)

- `PATCH/DELETE /api/custom-venues/:id` — ownership check added (`userId` vs `venue.userId`)
- `PATCH/DELETE /api/cart/:id` — ownership check added (Stage 0)
- `DELETE /api/notifications/:id` and `PATCH/DELETE /api/faqs/:id` — both fixed since this file was
  written (`deleteNotification(id, userId)` scopes the delete by the acting user; the FAQ routes
  carry a DB admin-role check), so their rows are removed from the table below.
- `GET /api/user-experiences/:id` and `PATCH/DELETE /api/user-experience-items/:id` — ownership
  enforced (branch `audit/user-experience-idor`; audit findings §4/§6). The read gets a
  `experience.userId !== userId` check matching its PATCH/DELETE siblings; the item writers take
  the acting user and enforce ownership in the UPDATE/DELETE `WHERE` through the parent
  `user_experiences.user_id`. Proven by `server/__tests__/user-experience-ownership.db.test.ts`.

## What was already protected (sweep script false positives)

- `PATCH/DELETE /api/provider/services/:id` — `getProviderServices(userId)` + `find-by-id` pattern
- `PATCH /api/service-bookings/:id/visa-status` — `providerId !== userId` check
- All bookings/contracts/trips/participants — `verifyTripOwnership` or `providerId` checks

## Remaining unprotected routes (low-stakes, deferred)

| Route | Method | Risk | Why deferred |
|---|---|---|---|
| `PATCH/DELETE /api/admin/*` | Various | Negligible | Admin role gate is the intended authorization |
| `DELETE /api/expert/selected-services/:id` | DELETE | Low | Expert's own service selection |
| `DELETE /api/expert/specializations/:id` | DELETE | Low | Expert's own specialization |

## Fix strategy (when picked up)

For each: add `getById` + `userId` check, or verify the storage layer already has the check. Pattern:

```typescript
const userId = getUserId(req)!;
const item = await storage.getItem(req.params.id);
if (!item) return res.status(404).json({ message: "Not found" });
if (item.userId !== userId) return res.status(404).json({ message: "Not found" });
```

When the row has **no `userId` column of its own** (it is owned through a parent), do NOT add a
route-level read-then-write pre-check — that is a TOCTOU and it leaves the storage writer reachable
unowned by the next caller. Put the ownership predicate INSIDE the write's own `WHERE`, the shape
`markAsRead` / `deleteNotification` / `updateUserExperienceItem` use, and return the row (or a
boolean) so the route can 404 on "nothing matched":

```typescript
await db.update(childRows)
  .set(updates)
  .where(and(
    eq(childRows.id, id),
    inArray(childRows.parentId, db.select({ id: parents.id }).from(parents).where(eq(parents.userId, userId))),
  ))
  .returning();
```

**403 vs 404:** these routes answer **404** for a non-owner, identically to a missing row, so an id
cannot be probed for existence. Match whatever the siblings on the same resource already do rather
than mixing the two on one resource.

## Gate: Do not start this until E2E-1 is green and Stage 2 is complete.
