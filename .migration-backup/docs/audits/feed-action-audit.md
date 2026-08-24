# Discover Feed — Action-Button Audit (Jul 15, 2026)

Ground-truth audit of every action on every feed card kind (traced to real handlers, registered
routes, and existing server endpoints). Fixes for the confirmed defects landed in the
`claude/feed-action-integrity` branch; the rest are filed below.

## Verdict table

| Card kind | Action | Behavior | Verdict |
|---|---|---|---|
| loose-gem | Book / Reserve | was `href="#"` — matched-service API (`GET /api/gems/:id/matched-service`) has no server impl, and no fallback to the gem's own booking URL | **BROKEN → FIXED** (falls back to the gem's own booking signal; hidden when none; dead query disabled) |
| loose-gem | Add / Ask / More info | itinerary-item write via AddToExperienceDialog / `/local-experts` / bottom sheet | WIRED |
| loose-gem | MatchedServiceStrip "Request" | POSTs nonexistent `/api/services/request`; 200-HTML passed `resp.ok` → **false success toast** | **HARDENED** (JSON content-type required); endpoint still unbuilt (filed) |
| expert | "Chat with X" | navigates to `/local-experts/:id` (profile, not chat) | **MISLABELED → FIXED** ("View X's profile") |
| event | Tickets / Add / Ask / More info | external URL + affiliate track / standard patterns | WIRED |
| supply-hotel/activity | Book | opens external partner link, but badge claimed **"Book on Traveloure"**; button rendered (and logged a click) even with no URL | **FIXED** (honest deeplink/not-bookable badge; Book hidden without URL) |
| vendor-service | Inquire / website / Ask | `/services/:id` + external link | WIRED |
| recommendation | Book / Add / labels | upsell click log + category-filtered browse; Recommended/Paid-partner labels from config | WIRED |
| recommendation | mount impression | POSTed nonexistent `/api/feed/impression` — all rec impressions silently discarded | **FIXED** (repointed to real `/api/upsell/impression` with its `{surface, offeringIds}` shape) |
| wanted-slot | Apply | `/become-expert?...` (registered) | WIRED (demand-count enrichment dead — see filed) |
| lead-expert | View profile | `/experts/:id` | WIRED |
| neighborhood | Explore | linked `/discover/location/:city/:slug` — only `/:city` is registered → **404** | **FIXED** (lands on the city page; neighborhood-focused view filed) |
| neighborhood | + Add a day | itinerary-item write | WIRED |
| (guest gate) | Add → Sign In | sent guests to unregistered `/auth` → 404 | **FIXED** (uses the app's sign-in modal) |
| (date mode) | DateHighlightStrip "Add to {date}" | no onClick — dead button | **FIXED** (wired to the page's add flow) |

Nested-interactive check: clean — no whole-card link wrapping inner buttons.

## Filed (need a backend or a schema decision — NOT client wiring)

1. **Content-impression tracking has no server counterpart.** `use-impression-tracker` POSTs
   `/api/tracking/impression` (doesn't exist) and expects an `impressionId` back — so every
   `sourceImpressionId` on Book/Add/affiliate-track payloads is null; the feed's
   impression→click attribution chain is severed. Needs an endpoint + table (schema decision).
2. **`GET /api/gems/:id/matched-service` unbuilt** — the gem→platform-service matching API the
   MatchedServiceStrip + suggestion-first Book were designed for. Client is wired and waiting
   (query disabled until it ships).
3. **`POST /api/services/request` unbuilt** — the "notify me when this service exists" demand
   capture. Client now fails honestly instead of faking success.
4. **`GET /api/services/demand` unbuilt** — wanted-slot "N travellers want this" enrichment can
   never show (counts always 0). The request currently mismatches `GET /api/services/:id`.
5. **Add-flow attribution dropped** — cards pass `sourceImpressionId`/`sourceContentId` into
   `onAdd`, but AddToExperienceDialog's POST body discards them (and the server has no columns).
   Thread only together with #1.
6. **Neighborhood-focused view** — "Explore {neighborhood}" deserves a real neighborhood-scoped
   page (route + filter); today it lands on the city feed.
7. **DateHighlightStrip companion links** — "Tickets"→`/experiences/events`, "Book"→
   `/experiences/photo|gear` resolve to the `/experiences/:slug` route but those aren't real
   experience-template slugs; dubious destinations, needs a product decision.
