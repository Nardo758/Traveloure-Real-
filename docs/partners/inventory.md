# Partner integrations — inventory

One row per partner integration in the code, read from `main` on 2026-10-18 (ledger
`2026-10-18-partner-token-redaction`). **Names only — never a credential value.** "Query" means the credential
rides the request URL; every such URL is masked in logs and stored rows by `redactSecretsInText`
(`server/infrastructure/logger.ts`, PX-1b). No outbound **link** carries a credential (PX-1 test S1).

The **Terms** column is left for Leon and Supply Scout.

| Partner | Auth method → where the credential goes | Credential env name | Public identifier in links | Content / price stored? | Service file(s) | Flags | Terms |
|---|---|---|---|---|---|---|---|
| **Travelpayouts** (data + partner APIs) | `tpFetch`: query `token`; `tpPartnerFetch` (statistics, finance): header `X-Access-Token` | `TRAVELPAYOUTS_TOKEN` | `TRAVELPAYOUTS_MARKER` as `marker` / `sub_id` (`<marker>.<requestId>` attribution) | Feeds cached in `travelpayouts_cache` (24 h) | `server/services/travelpayouts/travelpayouts-client.ts`, `aviasales.service.ts`, `statistics.service.ts`, `server/services/affiliate-attribution.service.ts` | — | |
| **Viator** — Partner API | header `exp-api-key` | `VIATOR_API_KEY` (`VIATOR_BASE_URL` defaults to sandbox) | — | Yes: `activity_cache` (price, currency, rating, image, raw data) | `server/services/viator.service.ts`, `server/services/cache.service.ts` | trailhead `enabled:false`; with `VIATOR_DIRECT_ENABLED=1` the `activity_cache` path makes no call and deletes no row | |
| **Viator** — commissions report | header `exp-api-key` | `VIATOR_API_KEY` | — | No (read and returned) | `server/services/viator-commissions.service.ts` | — | |
| **Viator** — live search (VD-1) | header `exp-api-key` | `VIATOR_API_KEY` (production, `api.viator.com/partner`); `VIATOR_SANDBOX_API_KEY` (everywhere else) | The API's own `productUrl` (pid / mcid / medium as Viator returns them) with only `campaign` appended | No — read per request, never stored; outbound opens recorded on `affiliate_clicks` by ids | `server/services/viator-live.service.ts`, `server/config/viator.config.ts` | Off unless `VIATOR_DIRECT_ENABLED=1`; Kyoto only (destination `332`) | |
| **Viator** — Travelpayouts feed | — | — | — | Old rows stay in `affiliate_products` / `travelpayouts_cache`, hidden from traveler reads; nothing deleted | **Retired** (VD-1): service deleted, not synced, `/api/catalog/viator-feed` answers 410 | — | |
| **Viator** — deep links | none | — | `VIATOR_AFFILIATE_ID` as `pid` | Links in `affiliate_links` | `server/services/affiliate.service.ts` | — | |
| **Klook** | none (token presence gate only; no API call) | — | literal `aff_code=travelpayouts` | Search-entry cards (price NULL) in `affiliate_products` | `server/services/travelpayouts/klook.service.ts` | trailhead `enabled:false` | |
| **GetYourGuide** | header `Authorization: Bearer` | `TRAVELPAYOUTS_TOKEN` | `TRAVELPAYOUTS_MARKER` as `partner_id`; `GYG_AFFILIATE_ID` as `partner_id` in `affiliate.service.ts` | Yes: `affiliate_products` (price, rating) — hidden from traveler reads while paused, not deleted | `server/services/travelpayouts/getyourguide.service.ts`, `server/services/partner-pause.service.ts` | **Paused** unless `GETYOURGUIDE_ENABLED=1` (PX-1); trailhead `enabled:false` | |
| **12Go** | none (links only) | — | `TWELVEGO_AFFILIATE_ID` as `affiliate_id` / `aff`; hub links `TRAVELPAYOUTS_MARKER` as `z`; TC-2 legs: registry `affiliate_link_template` `{marker}` | TC-2 leg options in `transport_booking_options` (no price) | `server/services/affiliate.service.ts`, `server/services/transport-booking-options.service.ts`, `server/services/transport-affiliate.service.ts`, `server/config/transport-affiliate.config.ts` | TC-2 registry gate (approved, active, licence, attribution, https template) | |
| **Kiwitaxi** | query `api_key` | `TRAVELPAYOUTS_TOKEN` | `TRAVELPAYOUTS_MARKER` as `api_key` on links; TC-2 registry template | Search live only; TC-2 leg options in `transport_booking_options` | `server/services/travelpayouts/kiwitaxi.service.ts` | TC-2 registry gate | |
| **Airalo** | query `token` (travelpayouts.com eSIM feed) | `TRAVELPAYOUTS_TOKEN` | `TRAVELPAYOUTS_MARKER` as `referral_code` | Feed with prices in `travelpayouts_cache` (`airalo`) | `server/services/travelpayouts/airalo.service.ts` | — | |
| **Omio** | query `token` (travelpayouts.com feed) | `TRAVELPAYOUTS_TOKEN` | `TRAVELPAYOUTS_MARKER` as `ref` | Feed in `travelpayouts_cache` (`omio`) | `server/services/travelpayouts/omio.service.ts`, `server/services/transport-booking-options.service.ts` | — | |
| **DiscoverCars** | query `affiliate_id` | `TRAVELPAYOUTS_TOKEN` | `TRAVELPAYOUTS_MARKER` as `affiliate` (`affiliate_id` in transport options) | No (live only) | `server/services/travelpayouts/discovercars.service.ts`, `server/services/transport-booking-options.service.ts` | — | |
| **Tiqets** | header `Authorization: Bearer` | `TRAVELPAYOUTS_TOKEN` (`TIQETS_BASE_URL`) | `TRAVELPAYOUTS_MARKER` as `partner_id` | Yes: `travelpayouts_cache` (`tiqets`), `affiliate_products` | `server/services/travelpayouts/tiqets.service.ts` | trailhead `enabled:false` (upstream 404 noted in code) | |
| **Stasher** | header `Authorization: Bearer` | `TRAVELPAYOUTS_TOKEN` | literal `partner=travelpayouts` | Yes: `affiliate_products` | `server/services/travelpayouts/stasher.service.ts` | — | |
| **Busbud** | header `X-Busbud-Token` | `TRAVELPAYOUTS_TOKEN` | `TRAVELPAYOUTS_MARKER` as `ref` | No (live only; a priceless search card on failure) | `server/services/travelpayouts/busbud.service.ts` | — | |
| **Musement** | — | `MUSEMENT_API_KEY`, `MUSEMENT_AFFILIATE_ID` named only in the health presence list | — | — | **No integration in the code** (`server/services/runtime-health.service.ts` lists the names) | — | |
| **Fever via Impact** | header `Authorization: Basic` (account SID + token) to api.impact.com | `IMPACT_ACCOUNT_SID`, `IMPACT_AUTH_TOKEN` | Tracking link `feverup.sjv.io/c/<IMPACT_ACCOUNT_SID>`; `FEVER_IMPACT_CAMPAIGN_ID` as `utm_campaign` | Yes: `fever_event_cache` (prices, rating, URLs), `travelpayouts_cache` (`fever`), `destination_events` (`pending`, min/max price in metadata) | `server/services/fever.service.ts`, `server/services/fever-commissions.service.ts`, `server/services/partner-events-cache.service.ts`, `server/services/affiliate.service.ts` | Off when not configured; demo events never in production | |
| **Ticketmaster** | query `apikey` (probe script only) | `TICKETMASTER_API_KEY` | — | No; `shared/city-events.ts` reserves the `ticketmaster` source, nothing writes it | **No server integration**; `scripts/probe-ticketmaster-coverage.cjs` | — | |
| **LiteAPI** (Nuitée) | header `X-API-Key` | `LITEAPI_API_KEY` (with `LITEAPI_ENV`; config names in `server/config/liteapi.config.ts`) | — (direct booking through Nuitée's payment SDK; no affiliate link) | Static hotel content in `hotel_cache`; rates never stored (a usage row in `api_usage_logs` with `stored:false`); bookings in `liteapi_bookings` | `server/services/liteapi-client.ts`, `liteapi-sync.service.ts`, `liteapi-rates.service.ts`, `liteapi-rates-gate.ts`, `liteapi-booking.service.ts` | Off unless key and env set; rates paused at `LITEAPI_RATES_DAILY_CAP`; booking sandbox-only (`liteapiBookingEnabled`) | |

## Notes from the read (recorded, not changed)

- The Travelpayouts token reaches eight partner APIs by their own required auth (query: `tpFetch`, Airalo, Omio,
  Kiwitaxi, DiscoverCars; header: GetYourGuide (paused), Tiqets, Stasher, Busbud). Ruled to stay (Oct 18, 2026).
- `affiliate.service.ts`'s GetYourGuide link builder (`generateLink` / `getDeepLink`, `GYG_AFFILIATE_ID`) does not
  read the GetYourGuide pause; it builds a link only (no request, no token).
- Fever's tracking link carries the Impact **account SID** (an identifier, not the auth token).
- 12Go, Viator Partner API, Klook and Tiqets are disabled in the trailhead registry
  (`server/config/trailhead.config.ts`).
