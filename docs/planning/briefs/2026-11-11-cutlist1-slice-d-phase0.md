# Cut-list #1 · Slice D Phase 0 — sign-in claims in place, cart lines, the guest notice

Base: `main` `f258c1366`, after slice B #1981 (`bc75bb5b`), slice C #1982 (`2238c1c2`) and header fix v2 #1984
(`2afc0860`). Brief v3 (Drive `1v4KpuwcKyeij_K_1a2nJk7HJy4uz9K3Lo504ABw99Jg`), slice D. This audit is read-only, and
every pin is on `f258c1366`. **Phase 0 is a hard stop:** the build waits for Leon's review, and ready-for-review is
Leon's to set.

**Most of the brief's slice D already landed** — slice C took the claim's cart lines (the request folded D's claim
into C), and #1984 binds the claimed plan. What is left is listed in §6.

## 1. The claim — unchanged, and it never mints

- Server: `claimGuestPlans` `server/services/guest-plan.service.ts:543` is ONE atomic conditional UPDATE
  (`guest_session_hash = hash AND user_id IS NULL AND guest_claimed_at IS NULL`) plus the owner collaborator row and the
  pen-occasion write, in one transaction. It re-owns rows; nothing mints a plan. Route
  `server/routes/guest-plans.routes.ts:235` (`isAuthenticated`), A-10 kept: the cookie first, the body/header id only
  when the client's cookies are off (`:237–245`).
- Client: `claimGuestPlansOnce` `client/src/lib/waitlist-guest-plan.ts:279` (one request per sign-in, A-37), the App
  watcher `client/src/App.tsx:1612`.
- **Claim rule (ruled Nov 12, 2026):** the rule the brief describes — the claim re-owns rows and never mints — is
  GATE-1B's (`2026-11-04-gate1b-guest-plan`, R831) and PLAN-1 ruling 2's (`2026-11-06-plan1-one-planner`, R857), and
  holds on main by construction (above).

## 2. Cart lines — already shipped by slice C, after the commit

- `projectClaimedBookableItems` `guest-plan.service.ts:586`, called by the route `:251` after `claimGuestPlans`
  resolves. Bookable = names a `provider_service_id` the checkout would hold (`checkoutProjectionRefusals` `:604`, the
  ONE predicate the projection applies); the flip is the routing machine's own `in_planning → ready_for_checkout` edge
  (atomic conditional + diary row), then `syncItemProjection` (`cart-projection.service.ts:242`) writes the line, keyed
  on `itinerary_item_id`.
- **Deviation from the brief, kept:** the brief asked for the projection INSIDE the claim transaction (savepoint, and
  `syncItemProjection` widened to take a tx and the new owner). Slice C runs it AFTER the commit instead: the
  projection then reads the new owner from the row it already reads, `syncItemProjection` keeps its one signature, and
  a projection failure cannot roll back the claim because it is not in the claim's transaction. The brief's guarantees
  (the claim always commits; nothing duplicates; a later sync repairs) hold. Stated in the slice C ledger row.
- **Gap:** a failure is caught per PLAN (`:633`), so one item's projection error stops the rest of that plan's items.
  Fix: catch per item.
- **Partner items (`affiliate_products.booking_type = in_platform_bookable`, `shared/content-cta.ts:22`): not carted.**
  A cart line that names no platform listing is display-only; checkout skips it (`if (!item.service) continue;`,
  `server/routes/payments.routes.ts:474`, and seven more sites in that file), and no server path charges an
  `in_platform_bookable` product (grep: no match under `server/routes`). Carting one would put a line in the cart that
  cannot be paid. **Ruled (Nov 12, 2026):** they stay on the plan and off the cart, as `affiliate_bookable` items do;
  LD 44 Phase 2 (the API-partner booking lane) is the lane that changes it.

## 3. The active plan after a claim — shipped by #1984

`App.tsx:1612–1628`: the claim's `.then` re-reads `/api/trips` and binds the claimed plan into the pen
(`syncActiveTripToContext`, `:1623`), then lands on `claimLandingPath` (`client/src/lib/plan-landing.ts:45`,
`/plans/{id}`, no `?view=`). The one active-plan rule is `client/src/lib/active-plan.ts:27` (`?tripId=`, then the pen)
over `activeHeaderTrip` `client/src/lib/header-plan.ts:101` (else the most recently updated un-finalized plan;
`getTrips` orders by `updated_at DESC`, `server/storage.ts:1725`). There is no `/api/plans/active-summary` (#1984 chose
the trip list and the pen), so the brief's "invalidate the summary key" maps to the trip list, which the claim already
re-reads. **Gap:** the claim does not invalidate `/api/cart`, so a cart badge shows the pre-claim count until its next
read.

## 4. Merge — no item merge, the previous plan stays

The claim UPDATE touches only the guest's own rows (`:543`); nothing deletes a plan. A member who already had a plan
keeps it on `/my-trips` (the trip list), and the claimed plan becomes the bound one (§3). No change needed; a DB test
pins it.

## 5. The guest notice

`client/src/pages/guest-plan-map.tsx:361` renders `guestPlanKeptLine(view.retentionDays)`
(`shared/guest-plan-copy.ts:20`: "This plan is kept for {n} days from your last change. Sign in to keep it." /
"This plan is kept until you sign in or clear it."). Retention comes from `GUEST_PLAN_RETENTION_DAYS`
(`server/config/guest-plan.config.ts:33`, null when unset). **Replace** it with **"Saved on this device for 30 days"**
when `retentionDays === 30` (Wording approved — Leon, Nov 10, 11:27 AM ET, notice strings); any other value keeps the
existing line. Never both lines, never another number.

## 6. What this slice builds

1. The notice (§5): one `guestPlanNotice(retentionDays)` in `shared/guest-plan-copy.ts`, read by the guest page.
2. Cart lines (§2): a per-item catch, so one failure never stops the rest; a test seam to force a projection failure.
3. The claim's `.then` also invalidates `/api/cart` (§3).
4. Tests: `server/__tests__/guest-claim-cart-lines.db.test.ts` — instant listing + gem + `affiliate_bookable` product ⇒
   exactly one cart line, keyed on the listing item, owned by the new user; a second claim changes nothing; a
   stranger's hash claims nothing; a forced projection failure ⇒ the claim still commits, a warn line, no cart line, and
   a later `syncItemProjection` creates it; a cookies-off claim through the header id still claims; an existing plan +
   the guest plan ⇒ both the member's. Unit test for the notice. Playwright: a guest saves a priced instant listing,
   signs up, lands on `/plans/{id}`, the strip reads the count and the cart holds the line; the guest page shows the
   notice the server's retention calls for.
5. No migration. No new string except the stamped notice.

---
_Generated by [Claude Code](https://claude.ai/code/session_01RBttmHVhtuRvecoi1i4KUE)_
