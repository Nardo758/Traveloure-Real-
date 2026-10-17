# Parked and held register

Maintained by the architect session. One line per item: what, why, and the condition that un-parks it. Dated entries; nothing is removed, items move to "Closed" with the PR that closed them.

## Parked programs (not building; do not merge)

| Item | Where | Why parked | Un-park when |
|---|---|---|---|
| Commerce automation — cart reminder sequence (Part 7/8) | PRs #1396, #1391 (drafts); Replit tasks "automation part7/8" | Part 8 (Oct 10): 7 structural risks — inventory race (reminder for a sold-out slot), unsubscribed traveler receives change notice, 3 payment-provenance UNKNOWNs, 2 authentic-handler gaps; retry paths double-submit / misreport. ~19 plans/month → no measurable value; consent and already-paid failure modes. Ruled Oct 10. | (1) payment provenance closed — #1347 + #1360 merged and LiteAPI rail live; (2) volume where a reminder sequence moves a number. Then: Phase 0 like any lane; its draft migration takes the **next free number at that time** (its `370` file is unregistered and collides with TC-3's 370 — rename, never register as 370). |
| Travelpayouts hotel programs (Booking.com, Agoda, Trip.com, Expedia, Hotels.com, Vrbo, Hostelworld, Vio, Rakuten) | Travelpayouts dashboard | Locked behind a 3-month traffic review; no hotel data API on the account. LiteAPI is the stay source. | Traffic review passes. Don't press "Submit for review" early — it binds program terms. |
| Travelpayouts White Label hotel search | Travelpayouts → White Label | Their layout inside our domain; hotel side earns nothing until programs unlock. | After hotel programs unlock, as a "Find more stays" door only. |
| Serp/scraped hotel prices | — | Breaks our no-scraping rule and Google terms. Permanent no. | Never. |
| Nudges (trip-timed notifications) | TC-3 product doc §4 | Out of foliage MVP; opt-in, capped design exists. | After TC-3c ships and the consent model is written. |
| June transport spec Phase 5 (remove old widgets: TwelveGo, TransportHub, DayTransportPanel…) | `docs/planning/briefs/TRANSPORT_COMMERCE_LAYER_BUILD.md` | Gated on both commerce sources surfacing per leg. | After TC-3c and TC-1/TC-2 cover every leg type the widgets covered. |
| Japan transit routing source — Google Routes API has no transit coverage in Japan, so every Kyoto leg >1.2 km is drive or walk | Leon (contract) | P0-b ships the honest label + skips the wasted call. **NAVITIME via RapidAPI: permanent no** (terms read `claude/navitime-api-terms-2026-10-11.md`: 第5条5 bans any storage incl. lat/lng, no TTL; no bus data; average train times not timetables). Un-park only on a **direct NAVITIME contract** whose application form lists stored fields (per-leg minutes, fare, line names, 30 days in-plan), display alongside Google legs, export, bus + timetable rail. Under LD 69 (approved Oct 11) a contract is an upgrade to the live tier, not a prerequisite: TC-4 ships Trip Card deep links to Google Maps transit + operator facts. |
| Generic meal placeholders ("Soba Restaurant in Fushimi") as supply slots rather than route targets | Slip spec | Product item: after P0-b; ties to Ways-to-Earn dining offers. |
| CUG (member) hotel rates | S1-d-2 brief | Nuitée CUG verification pending; bundle lane not built. | Nuitée enables CUG on the account **and** the bundle lane (hotel + our services) exists. |

## Held items (ruled, waiting on a trigger)

| Item | Owner | Trigger |
|---|---|---|
| `price_cents` + `currency` on `service_transport_facts` (fares live in `notes` today) | Logistics | Next sidecar migration. |
| `notes.filters` structured hard-filter fields (passes / payment / luggageMaxCm) — migration **372** | Logistics | In #1416 (TC-3b) with 370; lands when Leon's two SQL comments are on the PR. |
| Ride accessibility field (`wheelchair_accessible` true/false/unknown on `service_transport_facts`) — today no ride states it, so a wheelchair overlay hides every ride | Logistics | Next sidecar migration (with `price_cents`). Operator statements only; `unknown` shows the ride with an "accessibility not confirmed" line, never hides it. Not for foliage MVP. |
| Occasion in ride ranking (recorded on `transport_option_events`, not a ranking input) | Logistics | After 30 days of offered/accepted/skipped events exist to rank against; soft ranking only (TC rule 4). |
| Eizan Kirara "A better way there" — no departures seeded, so TC-3c never offers it | Logistics | Same trigger as the Eizan departures row below. |
| `liteapi-sync` Kyoto cap (production shows 500 rankable hotels) | Logistics | Confirm whether 500 is a sync page cap or the real count; if a cap, raise only with a rows-processed heartbeat line. |
| Eizan Kirara departures (◆ designations; JP public holidays via nager-date) | Logistics | Chrome read of Eizan PDF; holiday adapter wired. Not for foliage MVP. |
| Sagano extra-train numbering (81/82 vs 91/92) and the 6 unconfirmed colour dates | Logistics | Chrome read of the timetable PDF. Regular trains unaffected. |
| Hozugawa Dec 14–28 winter times; weekend "boats leave when full" window | Logistics | Operator states them / slot-window support. |
| Operator approvals for last-train facts: JR West, Hankyu, Keihan (first/last only, `link_only`, per Leon Oct 10) | Supply Scout / Leon | Write to each; Keihan first (terms invite approval). |
| Temple official sites (Kiyomizu-dera, Fushimi Inari, Kinkaku-ji, Ginkaku-ji) as registry rows | Events SS-1a | Chrome confirms homepages; Leon types rows. |
| `/admin/content-sources` entries: 6 official sources + 3 operators, 30-day refresh | Leon | Events' SS-1a sheet → rows handed to Leon. |
| ~~`email_outbox` unique event-key index~~ | — | Dropped Oct 11: not in #1360; its design note shows the conditional confirm prevents the duplicate. |
| Webhook-confirmed legacy bookings mint no provider earnings (only the page writer does) | Track A (after #1360 rebuild) | Decide whether the webhook path should mint on win; pinned as existing behaviour by #1347's tests. |
| Ride-app table keyed by bare city (`kyoto`), so "Kyoto, Japan" trips get no ride deep links | Track A | After V-1b; normalise destination → market slug via resolveMarketSlug. |
| LiteAPI lost-book-answer case; children as guests | Events S1-d-3 | Sync reports strandings for a person; child ages not recorded yet. |
| LiteAPI production key in Deployments | Leon | Only after S1-d-3b merges with the `TRANSACTION_ID`-only check script; never both keys. |
| `TRAVEL_TIME_SERVICE_ENABLED` | Done Oct 10 (set after P0 deploy) | — |
| Property builder: existing NULL-category listings backfill | Cancelled (0 rows in production) | — |
| Guard-wiring gap: 429 `[guarded:]` rows never checked for CI wiring | Events | Phase 0 (list by script) after S1-d-3b. |
| Sep 7 verbatim-duplicate ledger rows (9) | Events | Docs-only PR; byte-identical copies only; frozen 113 stays with cross-notes. |
| Hotel supply beyond Kyoto (LiteAPI sync is Kyoto-only) | Logistics | After the 500-cap question above is answered; extend sync per market. |
| V-1 follow-ups: anchor popup in trips.routes.ts still offers dining (Logistics, one line after P0-b); "Dinner at…" typed as activity not counted by the dinner check; stops starting after midnight not flagged late; board pins placed from a Google fact carry no Places attribution mark (check Google's attribution rule for Places data shown off a Google map) | Track A | After V-1 (R437); attribution item before any public launch of versions. |
| Engineer PRs #1347 / #1360 (payment provenance, atomic outbox) — standard reports in #1414 | Replit engineer → architect | Sanction on #1414 body; then re-queue in sequence. |
| #1404 d-3b on-screen wording "Paid to Nuitée…" | Leon | Comment "wording approved — Leon" on #1404 after Events reverts the Copilot commit. |
| R228 Route Matrix storage rule (30-day recompute on open) | Logistics | Phase 0 after TC-3. |
| 9a-ii OSRM on Replit Reserved VM | Leon runs operator steps | Steps delivered Oct 9. |
| /privacy §14.5 transfer-mechanism sentence (Standard Contractual Clauses for EU/UK sign-ups) (added Oct 16; LW-1f-b) | Launch session | Leon confirms Replit's, Google Cloud's and Neon's data processing terms are accepted for our account (Google needs the IAM opt-in). |
| AUTH-1 A06 — tell the existing account's owner when someone signs up with their address (added Oct 16; AUTH-1 fix 3b answers a duplicate sign-up neutrally and sends nothing) | Launch session | After the mailbox: the outbound email path is live and its consent model is written. |
| Leaflet layering (FU-8D-4) and slip-map version redraw (golden-path §6.5) re-proofs return with 9b-e non-Google coordinates (added Oct 17; GC-1) | 9b-e lane | 9b-e writes a non-Google item coordinate source; then `playwright/tests/journeys/j-map-dialog-click.spec.ts` waits on the Leaflet map again and its dialog sweep re-proves the stacking context, and `j-kyoto-trips-golden-path.spec.ts` §6 step 5 re-proves the version redraw (moved pin, ghost) on the Leaflet path. |
| The Replit Scheduled Deployment's cadence runner pulls `origin/main` at run time, not the deployed build, so after a merge it posts routes production does not serve yet (seen Oct 17: `routing-recheck` 404 after #1501 merged, before deploy) (added Oct 17) | Ops | Fix later: pin the runner's checkout to `/api/health` `build.commit`. |

## Closed (moved here when done)

| Item | Closed by |
|---|---|
| Waitlist retention job (Leon, Oct 16: 12 months from the day traveler sign-up first opens, never-converted rows only) | LW-1h (ledger `2026-10-16-lw1h-waitlist-retention`) |
| `origin='superseded'` interim marker → `superseded_at` | TC-3a #1401 (migration 368) |
| S1-c Places hotel seed | Cancelled Oct 9 — LiteAPI replaced it |
| Amadeus dead path | S1-d-1 #1382 |
