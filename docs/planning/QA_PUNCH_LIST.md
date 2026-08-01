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

## Fixed (Wave 1, Aug 1 — PRs #363 / #364 / #365)

- ~~Items 1+2+3 (partner log-booking loop; Platform-content pill; My-services pill)~~ (#364 — all six
  Add-panel pills live; the "Soon pills" [DM] is RESOLVED, both got real reads)
- ~~Item 15 minimal (traveler /chat conversation-threads list)~~ (#363; the unified-Inbox [DM] stays open)
- ~~Item 5 (expert Return-to-planning button)~~, ~~item 7 (+Day persistence)~~, ~~item 8 (dashboard
  trip chip persists)~~, ~~item 9 (rating||4.5 + metrics buckets)~~ (#365)

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

10. **Partner catalog in-workspace (DMO-style) — decision-maker requested Aug 1, three requirements.**
    Upgrade the Partner-inventory pill from a network *list* to a browsable partner *catalog* drawer
    (the Transport pill is the exact precedent: a §16-clean drawer over the existing `/api/catalog/*`
    Travelpayouts feeds — ~15 endpoints incl. tours/activities — informational add, affiliate URL never
    client-side). Requirement mapping:
    - **(3) Expert preview + add-to-plan before leaving the site** → the drawer itself: browse cards
      (name, image, price, description from the feed), "Add to Day N" creates a real itinerary item;
      booking still rides the Booking Brief flow afterwards.
    - **(2) Traveler agrees before the expert books** → reuse the EXISTING suggestion rail
      (`POST /api/trips/:id/suggestions`, Distribute→Client card): on assignment trips a partner item
      enters as a suggestion; the Booking Brief "Continue to <partner>" unlocks only once the traveler
      has approved that item. No new approval machinery.
    - **(1) Live availability / not-out-of-stock** → honest tiering, §13: tier (a) show feed data with
      a fetched-at timestamp and an explicit "availability confirmed at booking" label — a cached feed
      must never claim in-stock; tier (b) real-time per-partner availability APIs (Klook/Musement
      partner APIs; 12Go via Travelpayouts) — a per-network integration lane gated on API
      access/agreements [DM: which networks to pursue]; tier (c) the expert's booking-time check on
      the partner site remains the final guarantee (the current flow already forces it). Ship (a)+(c)
      first; (b) per network as access lands.
    Folding this feed into the central registry stays the separately-filed §16 architectural item —
    this lane READS the existing feeds, it does not build a third content home.

11. **Plan-level review step at delivery.** The expert's `draft → in_review → delivered` status is
    workflow state, not a content gate — the customer's Trip Card shows items live as the expert
    adds them, and delivery today triggers no customer action. Add the delivery handshake: on
    `delivered`, the customer's Trip Card offers "Approve plan / Request changes" (the §18
    delivered handshake's natural home). Ties to item 13's mode flip.
12. **Per-item comments for the customer** — today the only channels are the suggestion
    rejection-note and chat; there is no comment thread on the plan or its items.
13. **[DM] Approval flips the editing mode (the "planning object vs final product" lifecycle).**
    Decision-maker clarification (Aug 1): the planning object and the Trip Card are ONE object
    (§18 circulate-by-reference — do NOT split into two artifacts; two copies = drift + the
    paid-product-contradicts-plan class). The phase distinction the decision-maker wants is a
    LIFECYCLE STATE on that one object: during planning the expert edits directly and the card
    renders in "in planning" dress (draft banner, suggestion/approval controls prominent); once
    the customer APPROVES (item 11), the card renders as the polished final Trip Card AND the
    expert's direct-edit mode flips to suggest-mode — post-approval changes enter as suggestions
    requiring customer approval, instead of silently mutating an approved plan. This gives the
    "send the planning object around, then the Trip Card once final" behavior without a second
    object or snapshots (snapshots stay money-events-only per §18). **RATIFIED (decision-maker,
    Aug 1 "ok sounds good"): the mode-flip rule stands — approval flips expert direct-edit to
    suggest-mode. Pre-approval stays direct-edit (live collaboration is the planning phase's
    point; protection begins at sign-off).**
14. **Delivery / notification / communication findings (decision-maker questions, Aug 1).**
    Ground truth of what exists:
    - **Where the plan is delivered:** in-platform, by reference — the customer's dashboard Trip
      Card and their own `/trip/:id` view render the one TripPlan object (full channel);
      notifications deep-link to `/trip/:id?tab=itinerary`. External/offline: the read-only share
      link (`/itinerary-view/:token`) plus its KML/GPX exports and per-leg navigate links.
    - **Change notifications (in-app, already wired):** suggestion created → "New suggestion from
      your expert"; `in_review` → "ready for your review"; `delivered` → "delivered" — all
      best-effort inserts into the notifications bell, deep-linked to the customer's trip view.
      Direct expert edits pre-approval are deliberately un-notified (live planning); post-approval
      every change is a suggestion → notified by the existing suggestion notice.
    - **Communication:** the Trip Card's sticky action bar has "Message <expert>" → `/chat`
      (real thread); suggestion reject carries a rejection note; change-history renders on the
      card.
    **Gaps (build items):** (a) no EMAIL or push channel for the three trip events — a customer
    not logged in never learns their plan was delivered or changed (tie into the existing email
    cluster; [DM] which events warrant email vs bell-only); (b) the item-11 handshake needs the
    REVERSE notification — expert is notified when the customer approves or requests changes;
    (c) per-item comments = item 12 (the communication half of this).

15. **Traveler messaging center — the missing half of in-platform messaging.** The chat RAILS are
    real and shared (`/chat`, `/api/chats`, per-booking message buttons, the Trip Card's
    "Message <expert>" action), and the EARNER side has a proper center (expert Inbox "Messages"
    tab + earner-mode `/chat` lists real conversation threads). But the TRAVELER side of `/chat`
    explicitly returns no threads (`if (!isEarner) return []`) — a traveler's sidebar is a
    browse-experts DIRECTORY, not their conversations; a traveler with 2+ ongoing expert
    conversations has no list of them anywhere. Minimal fix: give traveler-mode `/chat` the same
    real-threads list the earner fix added (same `/api/chats` grouping, counterpart = the expert).
    [DM, bigger design call: whether the traveler gets a unified INBOX (chat threads + the item-14
    trip-event notifications in one place, mirroring the earner console's Inbox module) — or chat
    stays chat and the bell stays the bell.]

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

## Build map (Fable-minimized, per docs/EXECUTION_MAP.md §1/§4b — mapped Aug 1, 2026)

Execution rules for every lane below: Sonnet agent in a worktree on a `claude/*` branch, pushed
(never a PR from the agent); the lane spec IS this section — the dispatch is a one-liner naming
the lane. Fable reads diffstat only, EXCEPT the hunks each lane marks `FABLE-REVIEW` (ownership /
money / contract / migration surfaces), which get line-by-line review before the PR. Behavioral
proof against a local DB is part of every lane's definition of done; the expert-loop journey
(`scripts/journeys/expert-loop.mjs`) is extended where a lane adds a step to the canonical loop,
and reruns are Haiku one-liners.

**Wave 1 (parallel, no schema, no [DM] blockers):**
- **W1-A "Add-panel completion"** = items 1+2+3. New read-only endpoints: registry search for the
  Platform-content pill (approved/platform-origin only, destination-scoped; `sourced` stays
  excluded per the §12 invariant — reuse `content-query.service.ts` exclusion), session-scoped
  own-approved-services read for My-services pill; both drawers copy the DMO/Transport drawer
  pattern; partner drawer gains "Log completed booking" → existing item-create rail.
  FABLE-REVIEW: none (read-only endpoints + UI) — diffstat + proof table.
- **W1-B "Comms minimal"** = item 15 minimal: traveler-mode `/chat` real-threads list (mirror the
  earner grouping; counterpart = expert). Pure client. FABLE-REVIEW: none.
- **W1-C "Polish batch"** = items 5+7+8+9: expert Return-to-planning button (UI over the EXISTING
  server edge — RoutingActions gains the expert branch; FABLE-REVIEW: this one hunk, it touches
  the routing-contract surface); "+ Day" persistence hint or sessionStorage; dashboard selected
  trip persisted (localStorage keyed by user); kill `rating || 4.5` fallback (§13) + add the two
  missing metrics buckets.

**Wave 2 (after W1 merges; schema + gates → real Fable review):**
- **W2-A "Plan lifecycle"** = items 11+13(ratified)+14(b). Migration (next number): additive
  nullable `trip_expert_advisors.plan_approved_at` + `plan_approval_status`
  (`approved|changes_requested`, NO DB CHECK — pre-109 posture; declared in schema.ts per the
  deploy-push rule). Customer Trip Card: "Approve plan / Request changes(+note)" on
  `delivered`. Mode flip server-side: once approved, the expert's direct item-writes on THAT
  assignment 409 with "plan approved — send as suggestion" (suggestion rail unchanged); customer
  notified by existing suggestion notice; NEW reverse notification to the expert on
  approve/request-changes. FABLE-REVIEW: the migration, the 409 gate hunk, the approval
  endpoint's owner gate.
- **W2-B "Store withdraw"** = item 4: `POST /api/expert/ready-made/:id/withdraw` (author-gated,
  status → `withdrawn`; existing purchases unaffected — ready-made buys are snapshots); shipped
  builds with a WITHDRAWN listing become deletable (relax #359's refusal (c) to
  listing-exists-AND-not-withdrawn... simpler ratified shape: withdraw deletes nothing, delete
  still refuses while a non-withdrawn listing exists). FABLE-REVIEW: the status-machine +
  author-gate hunks.

**Wave 3 (after W2-A lands its semantics):**
- **W3-A "Partner catalog v1"** = item 10 tiers (a)+(c): catalog drawer over `/api/catalog/*`
  (tours/activities first), feed-timestamp + "availability confirmed at booking" labels (§13),
  Booking Brief "Continue to partner" gated on the item's suggestion being customer-approved
  (W2-A semantics). FABLE-REVIEW: the §16 surface (no affiliate URL client-side) + the gate hunk.
- **W3-B "Email events"** = item 14(a): wire delivered + changes-requested (+post-approval
  suggestion) into the existing email cluster. [DM default proposed: those three email;
  in-planning suggestions bell-only.] FABLE-REVIEW: none (template + send-site wiring).
- **W3-C "Per-item comments"** = item 12: new additive table `trip_item_comments` (id, trip_id FK
  CASCADE, item_id FK CASCADE, author_id, body, created_at; no CHECK; declared in schema.ts),
  owner-or-assigned-expert gated read/write (canonical predicates, never getTripRole);
  thread renders on the item in both Trip Card + Workstation. FABLE-REVIEW: migration + the
  access-gate hunks.

**Blocked on [DM] (no code until answered):** partner commission attribution + which partner
APIs to pursue (item 10 tier b); `activity_bookings` schema delete; non-catalog checkout
routing; unified traveler Inbox (decide at Wave 3); email-event list confirmation (W3-B ships
the proposed default unless overridden). The "Soon pills" [DM] is RESOLVED BY W1-A (both pills
get real reads — nothing left to hide).

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
