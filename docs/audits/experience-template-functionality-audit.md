# Experience-Template Functionality Audit (Jul 23, 2026)

**Question audited:** does each experience template provide the right *profile / logistics / planning*
functionality for the event concept it represents (e.g. a wedding needs venue, music, decorations,
performances, a date & time, transport, guest lodging)?

**Verdict in one line:** the per-concept planning intelligence **exists in the data layer** (a 5,267-line
seed with concept-correct tabs and filters for all 22 templates) but is **largely inert in the UI** — every
tab collapses to one of ~6 generic content engines, the seeded filters are fetched and discarded, profile
tabs render as venue searches, and the platform-supply grid is starved by a category-matching mismatch.
The templates are *profile-shaped shells over generic search*, not per-concept planners. All findings
below are code-verified (file:line) and DB-verified against the local seeded database.

---

## 1. Architecture ground truth (how a template page actually works)

- **Tabs are DB-driven.** `server/seeds/experience-template-tabs.seed.ts` seeds 22 templates
  (verified: all 22 exist in `experience_types` with 4–9 tabs each; seed runs at startup,
  `server/index.ts:272`). `GET /api/experience-types/:id/tabs` returns tabs **with** their seeded
  filters + options (`server/storage.ts:2086-2121`).
- **The client discards the filters.** `dbTabsToConfig` (`experience-template.tsx:478-494`) maps each tab
  to `{id, label, icon, category: tab.slug, tabType, controlConfig}` — `tab.filters` is **never read**.
  The only filter UI that renders is `controlConfig.selectionControls` (jsonb backfilled for just
  travel/wedding/corporate-events) plus the static client `SELECTION_CONTROL_SEED`
  (`shared/selection-control-seed.ts` — 3 templates, 5 tabs, ~6 chips total).
- **Universal filters are inert too.** `GET /api/experience-types/:id/universal-filters` (date range,
  booking status, cancellation, expert-verified, payment options) has **zero client consumers**.
- **Content per tab is decided by `tabType`** (DB column, else `deriveTabType(slug)` at
  `experience-template.tsx:465-476`):

  | tabType | Content engine |
  |---|---|
  | `flights` | Amadeus FlightSearch |
  | `hotels` (slug contains "accommodation") | Amadeus HotelSearch |
  | `transport` | AmadeusTransfers |
  | `activities` | Viator ActivitySearch + Travelpayouts partners + Amadeus POIs |
  | `events` | Fever events |
  | `dining` | Restaurant catalog + SerpAPI restaurant search |
  | `services` | ServiceBrowser (platform `provider_services`) |
  | **everything else** (`venue-search` default) | SerpAPI Google-Places venue search (`VenueSearchPanel`) + curated content + the local `provider_services` grid |

- **SerpAPI keyword routing:** `VENUE_TYPE_CONFIG` (4 templates) and `TAB_FALLBACK_CONFIG` (~40 slugs)
  in `venue-search-panel.tsx:39-105` give planning tabs sensible search keywords (catering → "catering
  services", decor → "event decor", rehearsal → "private dining rehearsal dinner", pre-game → "sports
  bars tailgate"…). Key-gated: no `SERP_API_KEY` ⇒ honest empty results (§13-clean).

## 2. Findings

### F1 — The seeded planning brain is fetched but never rendered (biggest gap)
The concept-specific filters that ARE the "right planning functionality" — wedding **Marriage License
Lead Time**, **Vendor Sequencing Awareness**, **Contingency & Risk** (weather backup, vendor-cancellation
protocol), corporate **Approval & Budget** (PO/invoicing, stakeholders) and **AV requirements**, bachelor
**RSVP tracking / cost-split method / deposit schedule**, wedding vendor types (DJ/Band, Florist,
Officiant, Makeup) — are all seeded, returned by the API, and dropped on the floor by `dbTabsToConfig`.
The user-visible result is exactly what was reported: every template feels like the same generic page.

### F2 — Profile tabs render as venue searches
Profile/coordination tabs (Birthday Person, Expectant Mom, Graduate, Couple, Homeowners, Retiree,
Achiever, Person Leaving, Host Preferences, Group Details, Attendee Coordination, Ceremony, Plan
Secrecy, Approval & Budget, Agenda & Schedule, Contingency & Risk/Failsafe) have no slug entry in
`TAB_FALLBACK_CONFIG` and no tabType — they default to `venue-search` and render a **generic
Google-Places venue search** with no keyword. A proposal's "Plan Secrecy" tab showing venue listings is
functionally wrong; these tabs' seeded form-like filters (preferred date, accessibility, dietary,
approval status) are the profile layer the concept needs, and none of it renders.

### F3 — Platform-supply grid starved by category mismatch
The `provider_services` grid filters by `category: tab.slug` through `matchesCategory`
(`shared/constants/providerCategories.ts:281`):
- **Exclusive-type trap:** a service typed `venue` is allowed only on tab `venue` (singular); every
  template's tab slug is `venues` (plural) → excluded. Same class: `spa` services are allowed on tabs
  `["spa","wellness"]` but the seeded tab slug is `spa-wellness` → excluded.
- **Unmapped slugs:** `ceremony`, `vendors`, `venues`, `rehearsal`, `guest-accommodations`,
  `party-services`, `special-touches`, `daytime-activities`, `experiences`, `destinations` have no
  `tabCategoryMapping` entry → literal-substring matches only.
- **Supply reality (local DB):** the 28 approved services are typed `experience` (17), `specialty` (7),
  `consultation` (2), `planning` (2) — none match any tab category except by name-keyword luck.
- **Honesty defect:** the grid caption says "Showing N providers **in {destination}**" but
  `GET /api/provider-services` (`server/routes.ts:1598`) is global — nothing in the chain filters by
  destination/city.

### F4 — Wedding template vs the decision-maker's checklist
| Need | Status | Mechanism |
|---|---|---|
| Location/venue | ✅ | Venues tab → SerpAPI "wedding venues" + custom-venue add |
| Music | ⚠️ | DJ reachable via the client-hardcoded vendor-type select (`/api/venues/wedding-vendors`); the seeded DJ/Band filter is inert; no dedicated Entertainment tab |
| Decorations | ❌ | Seeded under Services filter (inert); wedding has no Decor tab (wedding-**anniversaries** does) |
| Performances | ❌ | No entertainment tab; nothing beyond DJ vendor search |
| Date **and time** | ⚠️ | Trip start/end date exists (hero + floating cart header); no ceremony date+time anchor — the seeded "Ceremony Date (Immovable Anchor)" is a Set/TBD chip, and inert anyway |
| Transport | ⚠️ | Transportation tab → AmadeusTransfers (airport-transfer product); seeded wedding vehicle types (limo, party bus, horse & carriage) inert |
| Guest lodging | ✅ | Guest Accommodations → HotelSearch |
| Catering | ⚠️ | Only via vendors select; no Catering tab (most party templates have one) |
| Rehearsal | ✅ | Tab → SerpAPI "private dining rehearsal dinner" |
| Contingency | ❌ | Seeded Contingency & Risk filters inert; tab renders venue search |

Note the vocabulary fork: seeded vendor values (`dj_band`) vs client `WEDDING_VENDOR_TYPES` (`dj`) —
two vocabularies for the same concept because the DB layer was never wired.

### F5 — Per-template matrix (tab skeletons are concept-correct; execution is uniform-generic)
All 22 templates have thoughtful, concept-appropriate tab sets. The failure mode is the same everywhere:
profile tabs = F2, planning filters = F1, supply grid = F3.

| Template (slug) | Tabs (seeded) | Concept-specific bits that DON'T function |
|---|---|---|
| bachelor-bachelorette | Group Details, Destinations, Accommodations, Daytime Activities, Nightlife, Dining, Transportation, Party Services | RSVP tracking, cost-split, deposit schedule (all inert); Group Details = venue search |
| anniversary-trip | Destinations, Accommodations, Experiences, Dining, Spa & Wellness, Special Touches, Transportation | romance-level/milestone filters inert; spa services excluded from spa-wellness tab (F3) |
| travel | Activities, Hotels, Services, Dining, Flights, Transportation | (best-functioning template — all tabs map to real engines) |
| wedding | Ceremony, Venues, Vendors, Services, Guest Accommodations, Transportation, Rehearsal, Contingency & Risk | see F4 |
| date-night | Dining, Activities, Entertainment, Services, Transportation | fine skeleton; entertainment = SerpAPI keyword only |
| birthday | Birthday Person, Venues, Activities, Dining, Entertainment, Services, Accommodations | Birthday Person (accessibility, preferences, preferred date) = venue search |
| corporate-events | Approval & Budget, Agenda & Schedule, Venues, Team Activities, Services, Dining, Transportation, Accommodations, Contingency & Failsafe | the three planning tabs that make it "corporate" are venue searches; AV/PO/stakeholder filters inert |
| retreats | Venues, Activities, Services, Dining, Accommodations, Wellness | wellness services excluded by F3 spa/wellness mismatch risk |
| wedding-anniversaries | Anniversary Date, Venues, Catering, Entertainment, Decor, Photography | party-planning tabs work as SerpAPI searches; Anniversary Date tab = venue search |
| proposal | Plan Secrecy, Locations, Services, Celebration Dining, Accommodations | Plan Secrecy = venue search (worst-case concept mismatch) |
| boys-trip / girls-trip | Group Details, Activities, Nightlife, (Spa & Wellness), Accommodations, Dining, (Transportation) | Group Details = venue search |
| reunions | Attendee Coordination, Venues, Activities, Catering, Accommodations, Transportation | Attendee Coordination = venue search |
| baby-shower | Expectant Mom, Venues, Catering, Decor & Supplies, Entertainment | Expectant Mom = venue search |
| graduation-party | Graduate, Venues, Catering, Entertainment, Decor | Graduate = venue search |
| engagement-party | Couple, Venues, Catering, Entertainment, Photography | Couple = venue search |
| housewarming-party | Homeowners, Catering, Decor & Setup, Entertainment, Services | Homeowners = venue search |
| retirement-party | Retiree, Venues, Catering, Entertainment, Gifts & Keepsakes | Retiree = venue search |
| career-achievement-party | Achiever, Venues, Catering, Entertainment | Achiever = venue search |
| farewell-party | Person Leaving, Venues, Catering, Entertainment, Keepsakes | Person Leaving = venue search |
| holiday-party | Host Preferences, Venues, Catering, Decor, Entertainment, Services | Host Preferences = venue search |
| sports-event | Tickets, Accommodations, Pre-Game, Dining, Transportation, VIP Experiences | Tickets = SerpAPI "box office" search, not a ticketing integration |

The **profile layer partially works** via hero configs (headcount label, kids toggle, origin city,
contextFields: partner name, years together, trip theme, mom-to-be, couple names, retreat focus) —
seeded by `updateExperienceTypeHeroConfigs` and rendered in the hero card.

### F6 — Housekeeping defects
- `client/src/lib/feed-stream.ts:77-93` links `/experiences/photo|transport|dining` — no such
  experience types (same class the D2 pass cleaned on discover-location; these remain).
- Dead hero-config keys: `"birthday-party"` (real slug is `birthday`, which has its own correct entry)
  and `"corporate-retreats"` (no such template) — harmless no-ops, but signal drift.
- `nav-config` `romance`/`corporate` links work via the client `slugAliases` map (not defects).

## 3. Recommendations (in dependency order — not built here; audit only)

1. **Render the DB filters** (activates F1): a generic filter panel fed by `tab.filters`, mapping
   selections → the search backends (SerpAPI `keyword`/`type`, ServiceBrowser category, local
   price/rating/tags). This is the single change that makes templates concept-specific.
2. **New `profile` tabType** (fixes F2): profile tabs render their filters as a *form* persisted to the
   trip/experienceContext (the profile layer), never a venue search. Assign it in the seed
   (`tab_type` column already exists).
3. **Fix `matchesCategory`** (fixes F3): normalize plural/compound tab slugs (`venues`→`venue`,
   `spa-wellness`→`spa`), add mappings for `vendors`/`ceremony`/`rehearsal`/`party-services`, and/or
   have seed tabs carry an explicit category key. Also either destination-filter
   `/api/provider-services` or fix the "in {destination}" caption (honesty).
4. **Wedding parity**: Entertainment + Decor/Catering coverage (tabs like wedding-anniversaries has, or
   wire the Services tab's seeded categories into ServiceBrowser's `categoryFilter`).
5. **Event date+time anchor**: promote "Ceremony Date"-class fields to a real date+time input feeding
   the trip header and (cart Phase 2) per-item `scheduled_date`.
6. Unify the vendor-type vocabulary (seed values vs client constants); clean F6 dead links/config keys.
