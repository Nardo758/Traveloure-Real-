# QA Punch List — Workstation / expert build-content pass (started Aug 1, 2026)

Living list from the decision-maker's hands-on QA + the exploratory build-content test pass.
Items are struck through when merged to main (with the PR). Decision-maker calls are marked **[DM]**.

## Fixed (Aug 1 round — PRs #359 / #360 / #361)

- ~~Platform-services search box was a no-op within a destination~~ (#361 — query text now actually filters)
- ~~No item-level delete in the build editor~~ (#361 — Remove button via the trip-scoped, author-aware endpoint)
- ~~First-item CTA landed new experts on Custom instead of DMO Library~~ (#361)
- ~~Custom items were never geocoded~~ (#361 — best-effort geocode of "venue, destination" at add; honest null on miss)
- ~~Social caption showed stale duration/price after saving listing details~~ (#361 — query invalidation)
- ~~"Days" meant two different things on the home list vs the build header~~ (#361 — relabeled "N-day trip")
- ~~No way to delete a Workstation draft build~~ (#359 — v1: never-shipped drafts only; author-gated;
  refuses shipped listings / client assignments / purchased items)
- ~~Seeded provider_services rows had NULL coordinates → no map pins~~ (#360 — migration 162 re-backfill
  + seeders born-coordinated; needs a Replit publish to apply on prod)

## Open — build items

1. **Partner drawer: close the book-off-site loop.** The pill promises "book off-site, log it here",
   but after booking on the partner site there is no "Log completed booking → add to Day N" action —
   the expert must re-enter it by hand through Custom. Add a log-booking step to the drawer
   (pre-filled provider, drops a real itinerary item on the focused day). Contained UI fix.
2. **Wire the "Platform content" pill (§17 Add-panel registry read).** The Central Content system
   (`content_registry`: experiences, templates/Ready Made Trips, media, custom venues, vendors, …)
   is live on traveler surfaces via placement rules, but the Workstation has no registry read — the
   pill is an honest "Soon" placeholder. This is the ratified-but-unbuilt half of §17's
   "Add panel = the Central Content network".
3. **Wire the "My services" pill** (blocked on the same pattern; reads the earner's own approved
   `provider_services` — the Catalog module's data, scoped to the session user).
4. **Withdraw-from-store** (listing withdraw/delete on `ready_made_trips`) — prerequisite for
   deleting shipped builds (the #359 v1 409 points here).
5. **Expert "return to planning" routing edge has no UI control** (server grants
   `with_expert→in_planning`; RoutingActions is owner-gated client-side).
6. **DMO "Refine" is a dead-end write** — `expert_dmo_edits` rows are never read back into the
   library/picker or built trips (already filed in CLAUDE.md §12 D4 follow-ups; behaviorally
   confirmed in QA).
7. **"+ Day" is ephemeral client state** — vanishes on reload unless an item lands on the day (P3).
8. **Dashboard selected-trip chip resets to soonest trip on reload** (component state, P3).
9. §13 residue in optimizer surfaces: `rating || 4.5` fallback; metrics mapper missing
   accommodation/free-time buckets.

## Open — decision-maker calls [DM]

- **Partner-drawer commission attribution.** "Open →" opens the partner's plain `websiteUrl`
  (admin-configured) — almost certainly not an affiliate-tracked link, so agent bookings made this
  way may earn no commission. Needs the business fact per network (tracked links vs account-level
  attribution) before any code.
- **Should the two "Soon" pills show at all** before their reads exist (vs. hiding until wired)?
- **`activity_bookings` dead schema declaration** — causes the drizzle publish prompt every deploy;
  recommended delete (the one Segway booking is unrecoverable from DB).
- **Should trip-routed non-catalog items be checkout-routable** (today: display-only in cart,
  honestly labeled)?

## Answered questions (for the record)

- **"How does an expert delete Workspace drafts?"** → they couldn't; #359 built it (v1 scope).
- **"Why does partner content take experts away from the Workspace?"** → it doesn't navigate away:
  Open → shows the in-workspace Booking Brief (client details), then opens the partner site in a
  NEW TAB. By design: no booking-API integration exists for those networks, and §16's agent-booking
  model deliberately keeps off-site on the expert side so the traveler never leaves. The real gaps
  it exposed are items 1 (loop-back) and the commission [DM] above.
- **"Where is the other Central Content?"** → live on traveler surfaces (Discover feed,
  experience-template pages) through `content_registry` + placement rules; the Workstation read is
  item 2 above.
