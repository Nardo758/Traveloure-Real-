# Traveler Console Audit — Jul 29, 2026

Scope: every traveler-facing surface (discover, experts/services/templates, cart→optimize→itinerary→
payment, my-bookings, my-events, trip pages, chat, wishlist, concierge, experience templates, pricing,
guest-invite, profile/settings, trip strip + header, /p/:handle as visitor). Method: code-trace of every
query key / state source behind each visible number or badge, cross-checked against sibling surfaces
showing the same underlying fact, then live-verified against a running server (`test-traveler-kyoto@
traveloure.test`) with curl + a headless Chromium drive for the highest-value findings. Read CLAUDE.md
§13/§14 and `docs/audits/ux-walkthrough-5-roles-jul29.md` first; findings already logged there (L1–L11,
A1–A8) or closed by Lanes 1–3 / PR #336 are not repeated here except where a *new, still-open* instance of
the same class was found in a location those passes didn't touch.

**Priority class investigated first (per the decision-maker's report): state divergence — two traveler
surfaces rendering the same fact from different sources.** Four confirmed, unreported instances below,
three of them P1. Second priority: §13 lies / dead controls / silent-healthy failures — two more found.

---

## Findings

### P1-1 — `/experiences/:slug` still filters the cart by experience slug; every other surface doesn't (live-reproduced, NOT fixed by PR #336)

**Surface:** `client/src/pages/experience-template.tsx:759` (`serverCart` query) feeding the page's own
cart badges at lines 686, 1908, 2006, 2048, 2720–2955 (multiple "N items · $total" renders, the sticky
bottom bar, the header cart pill).

**What the user sees vs. the truth:** On `/experiences/wedding` while signed in with 1 real cart item
(`$300` incl. fee), the TripStrip chip at the top of the very same page (`client/src/components/trip/
trip-strip.tsx`) correctly reads **"1 · $300"**, while the page's own in-body cart summary renders as
**empty — no floating cart bar, "0 items" everywhere a count appears**. Live-verified:

```
GET /api/cart                    → itemCount 1, total 300.00  (experienceSlug on the row = "general")
GET /api/cart?experience=wedding → itemCount 0, total 0.00
GET /api/cart?experience=general → itemCount 1, total 300.00
```

Screenshot: TripStrip shows "🛒 1 · $300" in the header while the page body below shows "No Venues Found"
and no cart summary at all (scratchpad `exp-wedding.png`).

**Mechanism:** `cart.tsx` was fixed (per the PR #336 note in its own comment at line 443) to read the SAME
unfiltered `["/api/cart"]` key TripStrip reads, specifically because the server's `getCartItems(userId,
experienceSlug)` treats a non-null `experienceSlug` as an exclusive filter (`eq(slug) OR isNull(slug)`) —
so any item stamped with a slug that isn't the current page's slug silently vanishes from a filtered read.
`experience-template.tsx` was **not touched by that fix**: it still queries
`["/api/cart", { experience: slug }]` (line 759), which `buildUrlFromQueryKey` (`client/src/lib/
queryClient.ts:42`) turns into `GET /api/cart?experience=<slug>`, still server-filtered
(`server/routes.ts:5046-5051`). The specific reproduction above is helped by a live grandfathered row: the
pre-fix defect that stamped un-slugged adds with the literal string `"general"` (instead of `NULL`) left a
real cart item with `experienceSlug: "general"` in the DB — the server-side write bug is fixed for new
adds, but old `"general"`-stamped rows (and any item added on one experience page, then viewed from
another) still reproduce the exact chip-says-N/page-says-empty divergence the decision-maker flagged,
just one level down from where it was patched.
**Blast radius:** every `/experiences/:slug` visit is affected whenever the cart holds an item not stamped
with that page's own slug — which includes every legacy `"general"`-stamped row and every item a user adds
while browsing a different experience type.

**Suggested fix:** apply the same fix cart.tsx got — drop the `{ experience: slug }` param from
`experience-template.tsx`'s cart query (or make the server experience filter additive/never-exclude,
matching the "unslugged items belong everywhere" comment already in `storage.getCartItems`); consider a
data migration to null out the grandfathered `"general"` rows so they stop needing the fallback branch.

---

### P1-2 — `my-bookings.tsx` "Ready Made Trips" purchases are invisible unless the *legacy* package table also has rows (a live re-opening of the exact gap §10 B3 was built to close)

**Surface:** `client/src/pages/my-bookings.tsx:442` (empty-state gate) and `:471` (Trips tab visibility
gate).

**What the user sees vs. the truth:** the page fetches **three** independent sources of "things this
traveler bought": `bookings` (`/api/my-bookings`), `purchasedPackages` (`/api/my-purchased-templates` —
the legacy `expert_templates` marketplace, §10), and `rmPurchases` (`/api/ready-made/purchases/mine` —
the *current*, §17-ratified `ready_made_trips` store lane). The empty-state check
(`(!bookings || bookings.length === 0) && (purchasedPackages?.length ?? 0) === 0`, line 442) and the
"Trips" `TabsTrigger` visibility check (`(purchasedPackages?.length ?? 0) > 0`, line 471) both test **only**
`bookings` and `purchasedPackages` — `rmPurchases.length` is never consulted by either gate, even though
the block that renders `rmPurchases` (lines 518–546, "Ready Made Trips you bought") lives inside the very
`TabsContent value="packages"` that the broken gate controls. So a traveler who has bought a Ready Made
Trip (§17's live product) and has zero legacy-marketplace purchases and zero regular bookings sees **"No
bookings yet — Browse our services and make your first booking"** — the tab that would show their purchase
never even renders, because its trigger's own condition never looks at the data source it needs.

**Mechanism:** classic filtered-vs-unfiltered gate divergence — the gate was written against the older of
two parallel purchase sources and never updated when the second (now-primary, per §10's "SELLER-SIDE
SUNSET" note: `ready_made_trips` is the surviving lane) was added later in the same file. Confirmed by
reading the file directly: `rmPurchases` is declared at line 368–373 and rendered at 518–546, but neither
`442` nor `471` references it. Secondary, lower-severity instance of the same bug: even when the tab IS
visible (because `purchasedPackages.length > 0` for an unrelated reason), its **count badge**
("Trips (N)", line 473) reads `purchasedPackages!.length` only — it undercounts by however many
`rmPurchases` are also displayed inside that same tab.

**This is precisely the failure CLAUDE.md §10 Phase B3 was built to prevent** ("a buyer would pay and have
nowhere to see what they bought") — it has re-opened because the newer `ready-made.routes.ts` purchase
endpoint was wired into the render path without being wired into the two gates that control whether that
render path is ever reached.

**Suggested fix:** OR `rmPurchases.length > 0` into both the line-442 empty-state condition and the
line-471 tab-visibility condition; make the tab badge count `purchasedPackages.length + rmPurchases.length`.

---

### P1-3 — Traveler console notification bell shows a permanent unread dot with zero backing data (hardcoded, not even wired to `/api/notifications/unread-count`)

**Surface:** `client/src/components/dashboard-layout.tsx:47` — used by every page on `DashboardLayout`
(`dashboard.tsx`, `experiences.tsx`, `my-bookings.tsx`, `my-events.tsx`, `my-itinerary.tsx`,
`my-trips.tsx`, plus `expert-status.tsx`/`provider-status.tsx`), i.e. the entire "console" half of the
traveler nav (Home, My plans, Bookings, My events, …).

**What the user sees vs. the truth:** `<Bell/><span className="absolute … bg-[#E85D55] rounded-full" />` —
the red dot is unconditional markup with **no state, no query, no prop** behind it at all. Live-verified:
signed in as a fresh account with `GET /api/notifications/unread-count` returning `{"count":0}`, the
dashboard header still renders the red dot (screenshot `dashboard.png`). It can never turn off, because
nothing turns it on.

**Mechanism / cross-surface divergence:** the *other* traveler layout, `client/src/components/layout.tsx`
(used by `/discover`, `/experiences/:slug`, `/cart`, marketing pages), mounts the real
`<NotificationBell/>` component (`client/src/components/notification-bell.tsx`), which correctly queries
`/api/notifications/unread-count` and only renders the badge when `count > 0`. So navigating
`/discover` (bell honest, no dot, 0 unread) → `/dashboard` (bell permanently red) is a hard, visible
contradiction about the same fact on the same account in the same tab. This is a harder version of the
already-logged admin finding L9 ("permanent red dot over 0 unread") — that one at least read real (mis-)
data; this one reads no data whatsoever.

**Suggested fix:** replace the hardcoded `<span>` with the same `unread-count` query `NotificationBell`
already uses (or just mount `<NotificationBell/>` in `DashboardLayout` instead of the bespoke markup, so
there's one implementation instead of two).

---

### P1-4 — Dashboard "actions needed" / Action Items panel never reflects true read state (`n.read` vs. server's `isRead` field-name mismatch)

**Surface:** `client/src/pages/dashboard.tsx:26` (`Notification` interface declares `read?: boolean`) and
`:97-99` (`actionsNeeded` filter); `client/src/components/dashboard/ActionItemsPanel.tsx:6,12`
(same `read?: boolean` prop shape, `unread = notifications.filter(n => !n.read)`).

**What the user sees vs. the truth:** the server's notification rows carry `isRead` (`shared/schema.ts:932`,
`is_read` column; confirmed the live `GET /api/notifications` response shape). `dashboard.tsx` and
`ActionItemsPanel.tsx` both read a field called `read` that **does not exist** on the object, so `n.read`
is `undefined` for every row and `!n.read` is `true` for every row, always — regardless of whether the
notification was actually marked read (via the bell's "Mark all read", or `PATCH /api/notifications/:id/
read`). Result: the dashboard greeting subtitle's "· N actions needed today" count and the "Action items"
panel's list both include every `urgent`/`action`-typed notification the user has ever received, forever —
marking notifications read via the (correct) `NotificationBell` popover or the (correct) `/notifications`
page has **zero effect** on what the dashboard shows.

**Mechanism (proves it's a real, fixable field-name bug, not a design choice):** the sibling page
`client/src/pages/notifications.tsx:109` does this correctly — `read: n.isRead ?? false` — normalizing the
server field at the boundary before using it. `dashboard.tsx`/`ActionItemsPanel.tsx` skip that
normalization step entirely. This is the same class as P1-3 (two consumers of "unread notifications," one
correct, one silently broken) but in the data layer rather than a hardcoded UI element — the more dangerous
variant because it *looks* like real data.

**Suggested fix:** normalize `isRead → read` where `dashboard.tsx` maps the `/api/notifications` response
(same one-liner `notifications.tsx` already uses), or simplify by having both components read `isRead`
directly instead of maintaining a renamed local type.

---

### P2-1 — `/payment` page hard-crashes to a blank white screen for any signed-in user with cart items (cartData shape mismatch; page appears orphaned)

**Surface:** `client/src/pages/payment.tsx:48-50,63` — `useQuery<any[]>({ queryKey: ["/api/cart"] })`
followed by `(cartData || []).map(...)`.

**What the user sees vs. the truth:** `GET /api/cart` returns an **object** (`{items, subtotal, total,
itemCount}`), not an array — confirmed both from the live response and from every other consumer of the
same endpoint (`cart.tsx`'s `CartData` interface, `trip-strip.tsx`'s `{itemCount, total}` type). Once the
query resolves, `payment.tsx` calls `.map()` directly on that object and throws `TypeError: (cartData ||
[]).map is not a function`, with no error boundary catching it — the page renders completely blank.
Live-reproduced via headless Chromium (`console pageerror: (cartData || []).map is not a function`,
screenshot `payment.png` is solid white).

**Mechanism:** stale client code that predates the current object-shaped `/api/cart` contract (every other
consumer — `cart.tsx`, `discover.tsx`, `trip-strip.tsx`, `itinerary.tsx`'s `/api/cart/fee-preview` — treats
it correctly). Route is registered (`App.tsx:454`) and reachable by direct navigation, but no in-app
`Link`/`setLocation` to `/payment` was found anywhere in `client/src`; the real checkout flow lives inside
`cart.tsx`'s own `payment` flow-step (`StripeCheckout` + `POST /api/checkout`), and `/checkout` itself
redirects to `/cart` (`App.tsx:986-988`). So this looks like dead/orphaned legacy code rather than a live
funnel step — still worth fixing or removing since it's a real crash on a real URL, just not currently
reachable from any button.

**Suggested fix:** either delete the orphaned route (safest, since `/cart`'s embedded payment step is the
live path) or fix the shape to `useQuery<CartData>` + `cartData.items.map(...)` to match the rest of the
app.

---

### P3-1 — Dead `badge: true` sidebar flags (no bug, but worth a note)

`client/src/components/dashboard-sidebar.tsx:55-56` mark "Messages" and "Notifications" nav entries with
`badge: true`, but no rendering code anywhere in the component reads `item.badge` — it's inert metadata,
not a false badge (nothing is drawn), so it isn't a §13 lie, just dead code that could mislead a future
edit into thinking a badge exists. Low priority; noted for cleanup alongside P1-3/P1-4 if that area is
touched.

---

## Verified clean (cross-checks that passed — coverage, not just failures)

- **Cart chip parity (post-fix baseline):** `trip-strip.tsx`, `cart.tsx`, and `discover.tsx` all read the
  identical unfiltered `["/api/cart"]` react-query key — confirmed by direct query-key grep and by the
  PR #336 comment trail in `cart.tsx:443-461`. This triad is the one the decision-maker's original report
  was about, and it is genuinely fixed; the divergence now lives one level down (P1-1).
- **Fee-preview parity:** `itinerary.tsx` and the orphaned `payment.tsx` both call `GET /api/cart/fee-
  preview`, which server-side calls `storage.getCartItems(userId)` with **no** experience filter
  (`payments.routes.ts:779`) — consistent methodology with the fixed cart total, unaffected by P1-1's bug.
- **`my-bookings.tsx` status badges:** the L3 finding from the prior audit (unknown status masquerading as
  "Pending", tab counts disagreeing with "All") is fixed — confirmed the `getStatusConfig` fallback
  (`my-bookings.tsx:106-110`) now renders an honest "unknown" state instead of defaulting to Pending, and
  `completedBookings` is defined as "everything not Pending/Active" so `All` can't outcount the sum of the
  other three tabs.
- **`/notifications` full-list page:** correctly normalizes `isRead → read` at the query boundary
  (`notifications.tsx:109`) — unlike the dashboard (P1-4), this page's unread count and per-item styling
  are trustworthy.
- **Coordination fee (`/my-events`):** the fee amount, credit, and paid/refunded state are all read from a
  single server-quoted source (`GET /api/coordination-states/:id/fee` and the settled engagement's own
  `feeAmountCents`/`feeCreditCents` fields) — no client-side re-derivation, no second source to diverge
  from. Clean.
- **Wishlist:** `client/src/components/dashboard/WishlistSection.tsx` is the sole consumer of
  `/api/saved-items` in the entire client tree — no duplicate/second count exists anywhere to diverge from.
- **`/bookings` vs `/my-bookings`:** confirmed a route alias (`App.tsx:363-370`), not two different data
  paths — no divergence risk.
- **Booking/trip route wiring:** `useTrips()` (list) and `useTrip(id)` both resolve through
  `shared/routes.ts`'s `api.trips.*` definitions against the same `trips` table; `trip-details.tsx`'s
  `/api/trips/:id/plancard` reads the same `trip` row via `storage.getTrip(tripId)` — no separate trip
  record to drift from the list.

## Not independently re-verified (already logged elsewhere, out of scope to re-litigate)

L1–L11 and A1–A8 in `docs/audits/ux-walkthrough-5-roles-jul29.md` (cart room-stay quantity-stepper display,
admin 500-as-empty, EA fabrications, etc.) were treated as the prior pass's territory per the task brief
and were not re-driven here except where noted above (P1-3 is a stricter, traveler-console-specific
sibling of L9, not a duplicate of it).

---

## Summary

- **P1: 4** (experience-template cart filter divergence; my-bookings Ready-Made-Trip purchases hidden by
  a stale gate; dashboard-layout's hardcoded notification dot; dashboard/ActionItemsPanel's `isRead`
  field-name bug)
- **P2: 1** (`/payment` page crash — orphaned but reachable)
- **P3: 1** (dead sidebar badge flag, no visible bug)

Server started with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure_b2 …
npx tsx server/index.ts`, driven via curl (session cookie) + headless Chromium at
`/opt/pw-browsers/chromium`; no data was seeded (the reproduction cart item pre-existed on the seeded
`test-traveler-kyoto@traveloure.test` account); server was stopped at the end of the session.
