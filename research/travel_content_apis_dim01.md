# Dimension 01: Destination & POI Content APIs

## Research Scope
Travel marketplace content providers offering APIs for **destination/city guides**, **points of interest (POI)**, and **geolocation tourism data** that are accessible to developers (self-service, free tier, or partner program with reasonable barrier).

**Research Date:** 2026-06-13
**Author:** Research Sub-Agent

---

## Executive Summary: Top 7 Providers for Traveloure

| Rank | Provider | API | Best For | Free Tier | Data Richness | Integration Complexity |
|------|----------|-----|----------|-----------|---------------|----------------------|
| 1 | **Amadeus** | Destination Experiences (Tours & Activities, POI, City Search) | Travel-specific bookable content + POIs | 10,000+ calls/mo (test) / production quotas | High (descriptions, photos, pricing, booking links) | Moderate (OAuth2) |
| 2 | **Google** | Places API (New) | Universal POI coverage & user reviews | Per-SKU caps (10K Essentials, 5K Pro/mo) | Very High (UGC, photos, hours, live popularity) | Easy (API key) |
| 3 | **Geoapify** | Places API | Cost-effective, open-data POI with permissive licensing | 3,000 credits/day (~90K/mo) | High (800+ categories, OSM tags, conditions) | Easy (API key) |
| 4 | **Foursquare** | Places API (V2/V3) | Rich venue details, tips, ratings, photos | 500 calls/mo Pro (as of June 2026)[^1] | Very High (UGC, photos, tastes, popular hours) | Easy–Moderate |
| 5 | **Tripadvisor** | Content API | Social proof (reviews, awards, rankings) | Partner approval required; metered | High (reviews, photos, ratings) | Moderate (approval) |
| 6 | **OpenTripMap** | Places API | Cultural & tourist attractions, heritage POIs | 5,000 req/day (non-commercial) | Moderate (OSM + Wikidata fusion, tourism-tuned) | Easy (API key) |
| 7 | **TomTom** | Search / Places APIs | Automotive-grade global search + geocoding | Evaluation tier (no CC required) | High (global, fuzzy matching, address validation) | Easy–Moderate |

*Honorable mentions:* **Wikidata + OpenStreetMap** (free open-data foundation), **Sygic Places** (24M+ POIs, EUR45/mo for 50K), **Mapbox** (50K free map loads, geocoding $0.75/1K), **HERE** (strong EU coverage, free Base Plan).

---

## 1. Amadeus Destination Experiences APIs

- **Provider name:** Amadeus for Developers
- **API names:** Tours and Activities API, Points of Interest API, City Search API, Safe Place API, Traveler Media API
- **Content type:** Destinations (city search), POIs (attractions, restaurants, hotels), Tours/Activities (bookable experiences)
- **Coverage:** Global (8,000+ destinations, 300,000+ activities, 2M+ places)[^2]
- **Auth model:** OAuth2 client credentials (self-service portal)
- **Rate limits / free tier:** Test environment: 10 TPS, free monthly quota. Production: 40 TPS + free quota per API (e.g., Flight Order Management up to 10,000 free calls/mo); pay-as-you-go beyond[^3]
- **Pricing:** Self-service = pay per use; Enterprise = custom contracts. Destination Experiences APIs generally fall under the partner/AI tier with 20 TPS and 1 req/50ms limits[^4]
- **Data format:** JSON
- **SDK availability:** Node.js, Python, Java, PHP, Ruby (official SDKs)[^5]
- **Integration complexity:** Moderate. OAuth2 flow, straightforward REST endpoints, excellent OpenAPI docs.
- **Usage restrictions:** Free test data is limited/cached; production requires real-time billing agreement. Attribution not required beyond standard terms.
- **URL:** https://developers.amadeus.com/self-service/category/destination-content

**Key insight:** This is the *only* major provider offering **both** destination content **and** direct booking links for tours/activities. It partners with MyLittleAdventure (Viator, GetYourGuide, Klook, Musement) to deduplicate and surface the best offer per activity. Ideal for a marketplace that wants to monetize experiences.

---

## 2. Google Places API (Google Maps Platform)

- **Provider name:** Google
- **API name:** Places API (New) — includes Place Details, Text Search, Nearby Search, Photos, Autocomplete
- **Content type:** POIs (attractions, restaurants, hotels, parks, museums, etc.)
- **Coverage:** Global, largest proprietary POI database
- **Auth model:** API key + GCP billing account (mandatory for production)
- **Rate limits / free tier:** Per-SKU free caps since March 2025: 10,000 events/mo for Essentials SKUs, 5,000 for Pro SKUs, 1,000 for Enterprise SKUs. No pooled $200 credit anymore[^6]
- **Pricing:** Pay-as-you-go or subscription plans (Starter $100/mo, Essentials $275/mo, Pro $1,200/mo). Key SKUs: Place Details (Pro) $17/1K; Text Search / Nearby Search $32/1K; Geocoding $5/1K[^7]
- **Data format:** JSON
- **SDK availability:** Android, iOS, JS (Places Library), Go, Python, Node.js, Java
- **Integration complexity:** Easy. Very mature docs, but billing/field-masking complexity is high.
- **Usage restrictions:** **Data cannot be stored indefinitely** (cache up to 30 days for most data). Must display results with Google Maps. Attribution required. No redistribution[^8].
- **URL:** https://developers.google.com/maps/documentation/places/web-service

**Key insight:** Best data quality and UGC (reviews, photos, live popularity), but the most restrictive and expensive at scale. For a travel marketplace, use it as a **premium enrichment layer** for top destinations, not as the primary database.

---

## 3. Geoapify Places API

- **Provider name:** Geoapify GmbH
- **API name:** Places API (includes Place Details, nearby search, text search, category filters)
- **Content type:** POIs (restaurants, tourist attractions, historical objects, accommodation, 800+ categories)
- **Coverage:** Global (OpenStreetMap-based + proprietary enrichment)
- **Auth model:** API key (self-service signup)
- **Rate limits / free tier:** Free plan: 3,000 credits/day (~90,000/mo), 5 req/sec. Paid: API 10 ($59/mo, 10K/day), API 25 ($109/mo), up to custom enterprise[^9]
- **Pricing:** Credit-based. 1 request ~ 1 credit for <=20 places; each additional 20 places = +1 credit. Very affordable vs Google.
- **Data format:** JSON
- **SDK availability:** REST; no official SDK but straightforward HTTP integration. MapLibre/Leaflet examples provided.
- **Integration complexity:** Easy. Clean REST, no OAuth, generous free tier.
- **Usage restrictions:** **Permissive**: allowed to cache, store, and redistribute results. Attribution to OpenStreetMap (and Geoapify on free plan) required[^10]. Vendor-neutral — works with any map provider.
- **URL:** https://www.geoapify.com/places-api/

**Key insight:** The best **Google Places alternative** for startups. The license explicitly allows building your own POI database from their API — critical for a marketplace that needs to persist data and serve it offline or in search indexes.

---

## 4. Foursquare Places API

- **Provider name:** Foursquare Labs Inc.
- **API name:** Places API (V2 Pro / V3 / FSQ OS Places)
- **Content type:** POIs (100M+ places across 200+ countries)
- **Coverage:** Global, strongest in US/urban areas
- **Auth model:** API key + OAuth for some endpoints
- **Rate limits / free tier:** Free tier reduced to **500 Pro calls/mo** starting June 1, 2026 (down from 10,000)[^1]. V3 legacy endpoints deprecated May 15, 2026.
- **Pricing:** Pro endpoints: $15/1K (10K–100K), down to $4.50/1K at 1M+; $1.25/1K at 5M+. Premium endpoints (photos, tips, hours, ratings): **no free tier**, $18.75/1K up to 100K, down to $5.75/1K at 5M+[^11]
- **Data format:** JSON
- **SDK availability:** Official SDKs for JS, Python, iOS, Android; Pilgrim SDK for passive location
- **Integration complexity:** Easy–Moderate. Version migration burden (V3 to V2/FSQ OS). Field filtering (`fields` param) helps control cost.
- **Usage restrictions:** Standard Terms of Service; photos/tips are user-generated content with attribution expectations. No storage restrictions like Google.
- **URL:** https://foursquare.com/developers

**Key insight:** Still the **richest venue intelligence** (tips, tastes, popular hours, chain data). However, the drastic free-tier cut in 2026 makes it expensive for early-stage marketplaces. Best used for **high-value destination enrichment** where user-generated context matters.

---

## 5. Tripadvisor Content API

- **Provider name:** Tripadvisor
- **API name:** Content API (Location Details, Photos, Reviews, Search, Nearby Search)
- **Content type:** Destinations + POIs (hotels, restaurants, attractions, geos)
- **Coverage:** Global (8M+ locations, 1B+ reviews/opinions, 29 languages)[^12]
- **Auth model:** API key (partner approval required)
- **Rate limits / free tier:** Approved partners get access; up to 50 calls/sec. Pay-per-use with monthly billing; set daily limits to control spend[^13]
- **Pricing:** Not publicly standardized; requires partner agreement. Generally free for qualified tourism boards/OTAs, revenue-share for booking referrals.
- **Data format:** JSON
- **SDK availability:** REST only; community wrappers (Python `tripadvisorapi`)[^14]
- **Integration complexity:** Moderate. Approval process can take weeks; strict display requirements.
- **Usage restrictions:** **Display requirements** must be reviewed before launch. Must link back to Tripadvisor listing pages. Content is for display only; no derivative databases.
- **URL:** https://developer-tripadvisor.com/content-api/ (note: new Terra API platform coming)

**Key insight:** The **trust layer** of travel. If Traveloure wants to display review counts, rating bubbles, and awards to increase conversion, Tripadvisor is the gold standard. Not suitable as a primary POI database due to approval friction and display rules.

---

## 6. OpenTripMap API

- **Provider name:** OpenTripMap
- **API name:** OpenTripMap Places API (REST + vector tiles)
- **Content type:** POIs (10M+ tourist attractions and facilities worldwide)[^15]
- **Coverage:** Global; strong on cultural heritage, museums, natural sights
- **Auth model:** API key (email request for trial)
- **Rate limits / free tier:** Free: 5,000 requests/day, 10 req/sec, non-commercial use only. Premium: from $19/month[^16]
- **Pricing:** Subscription tiers; custom enterprise available.
- **Data format:** JSON, Mapbox vector tiles (PBF), GeoJSON
- **SDK availability:** REST; tile integration with Mapbox GL / Leaflet
- **Integration complexity:** Easy. Simple endpoints, tile service for map visualization.
- **Usage restrictions:** Free tier is non-commercial. Data sourced from OpenStreetMap, Wikidata, Wikipedia, and Russian Ministry of Culture. Attribution required.
- **URL:** https://dev.opentripmap.org/

**Key insight:** A **tourism-specialized** POI layer that filters out non-tourist places (e.g., gas stations, parking lots) and focuses on *interesting places*. Great for building attraction maps and cultural guides. The vector tile service makes it ideal for performant web map rendering.

---

## 7. TomTom Places / Search APIs

- **Provider name:** TomTom
- **API names:** Search API, Batch Search API, Geocoding API, Reverse Geocoding API, EV Search API
- **Content type:** POIs + geocoding (accommodation, food, entertainment, gas, parking, shopping)
- **Coverage:** Global, strong in Europe and automotive corridors
- **Auth model:** API key (self-service)
- **Rate limits / free tier:** Free evaluation tier: daily limit (unspecified), standard QPS, no credit card. Pay-as-you-grow: no daily limit, standard QPS[^17]
- **Pricing:** Per-unit: Search API EUR2.5/1K; Geocoding EUR0.75/1K; Reverse Geocoding EUR0.5/1K. Enterprise custom.
- **Data format:** JSON
- **SDK availability:** Android, iOS, Web (official SDKs); Map Display API
- **Integration complexity:** Easy–Moderate. Well-documented, but batch/enterprise features require more setup.
- **Usage restrictions:** Standard TomTom terms; attribution required. No restrictive storage clauses like Google.
- **URL:** https://www.tomtom.com/products/places-apis/

**Key insight:** Strong **enterprise-grade reliability** and automotive pedigree. If Traveloure plans to offer **driving directions, road-trip planning, or EV charging stops** alongside destination content, TomTom is a natural fit. The fuzzy search and address validation are top-tier.

---

## 8. Mapbox Search & POI APIs

- **Provider name:** Mapbox
- **API names:** Search API (suggest/retrieve), POI API, Geocoding API
- **Content type:** POIs, addresses, geocoding
- **Coverage:** Global
- **Auth model:** Access token (self-service, credit card required even for free tier)
- **Rate limits / free tier:** Search API: 2,500 sessions/mo free (introductory preview until Q4 2025). POI API: 25,000 requests/mo free. Map loads: 50,000/mo free[^18]
- **Pricing:** Search sessions: $11.50/1K (501–100K), down to $6.60/1K (500K+). POI requests: $1.70/1K (50K–500K), down to $1.25/1K (1M+)[^19]
- **Data format:** JSON, GeoJSON
- **SDK availability:** GL JS, iOS, Android, Unity, React Native
- **Integration complexity:** Easy for map-centric apps; session-based billing requires careful client implementation.
- **Usage restrictions:** Attribution required. Data residency is US-based (AWS). Some licensing clauses in Navigation SDK require legal review.
- **URL:** https://www.mapbox.com/pricing

**Key insight:** Best if Traveloure already uses Mapbox for maps. The **POI API** is a direct competitor to Google Places at a fraction of the cost. However, the free tier requires a credit card, which is a barrier for some startups.

---

## 9. HERE Geocoding & Search

- **Provider name:** HERE Technologies
- **API names:** Geocoding & Search API, Discover API, Browse API, Lookup API
- **Content type:** POIs, addresses, geocoding, discovery
- **Coverage:** Global, historically strongest in Europe and Asia
- **Auth model:** API key (self-service)
- **Rate limits / free tier:** Base Plan: 30,000–250,000 transactions/mo depending on service (free, credit card required). Freemium: 1,000 req/day for some Search endpoints[^20]
- **Pricing:** Transaction-based; ~$0.50–$0.83/1K for geocoding/search at scale. Lower than Google.
- **Data format:** JSON
- **SDK availability:** Android, iOS, JS, REST
- **Integration complexity:** Easy. Multi-cloud (EU + US data residency).
- **Usage restrictions:** Standard HERE terms. SLA 99.9%.
- **URL:** https://developer.here.com/

**Key insight:** A solid **enterprise alternative** with strong EU data residency — relevant if Traveloure serves European users and cares about GDPR/data localization.

---

## 10. TrueWay Places API

- **Provider name:** TrueWay Labs / TruewayAPI
- **API name:** TrueWay Places API
- **Content type:** POIs (150M+ / 180M+ places)[^21]
- **Coverage:** Global, multi-language
- **Auth model:** API key (via RapidAPI or direct)
- **Rate limits / free tier:** Basic: 2,500 requests/day (evaluation/non-commercial only), 1 req/sec. Free tier on RapidAPI: 5,000 calls/mo[^22]
- **Pricing:** Professional: $49/mo (100K req), Ultra $99/mo (250K), Mega $299/mo (1M). Overages: +EUR0.9–EUR2.7 per 1K depending on plan and API[^23]
- **Data format:** JSON
- **SDK availability:** REST only; testable on RapidAPI
- **Integration complexity:** Easy. RapidAPI marketplace reduces procurement friction.
- **Usage restrictions:** Basic plan is evaluation/non-commercial only. Commercial use requires paid plan. No OSM data used (claims proprietary GIS data)[^24].
- **URL:** https://truewayapi.com/

**Key insight:** A convenient **RapidAPI-native** provider with a large database. Good for rapid prototyping or when you need a drop-in Places API without Google/Foursquare billing complexity. However, the non-commercial restriction on the free tier is a blocker for production.

---

## 11. Sygic Places / Travel API

- **Provider name:** Sygic (now Tripomatic for travel planner app)
- **API name:** Sygic Travel API / Sygic Places database
- **Content type:** POIs (24.2M+), destination guides, photos, 360 deg videos, opening hours, admission fees
- **Coverage:** Global, 15 languages
- **Auth model:** API key (online form)
- **Rate limits / free tier:** 1,000 requests/mo free[^25]
- **Pricing:** EUR45/mo for up to 50,000 requests; EUR99/mo for up to 150,000 requests. Custom above.
- **Data format:** JSON
- **SDK availability:** REST; data dumps also available (CSV/JSON)
- **Integration complexity:** Easy. Simple endpoints; also offers **data dump licensing** for bulk load.
- **Usage restrictions:** Standard Sygic terms. Attribution required.
- **URL:** https://www.sygic.com/ (API access via developer form)

**Key insight:** Unique because it offers **bulk data dumps** (continent/country/world) in addition to the API. This is valuable if Traveloure wants to seed its own database rather than call an API at runtime. The 24M POI count is smaller than Google/Foursquare but tourism-tuned.

---

## 12. OpenStreetMap (Nominatim) + Wikidata / Wikivoyage

- **Provider names:** OpenStreetMap Foundation + Wikimedia Foundation
- **API names:** Nominatim API (search/reverse), Wikidata Query Service (SPARQL), Wikipedia/Wikivoyage REST APIs
- **Content type:** Destinations (city descriptions, history, climate, See/Do sections from Wikivoyage), POIs (OSM nodes/ways with tourism tags), geocoding
- **Coverage:** Global, crowdsourced. Quality varies by region.
- **Auth model:** None / username (GeoNames-style) / SPARQL endpoint (no key)
- **Rate limits / free tier:** Nominatim: 1 req/sec policy, no hard key but "be polite". Wikidata SPARQL: fair-use, 60 sec timeout. Wikimedia REST API: standard rate limits.
- **Pricing:** Free (donation-supported infrastructure)
- **Data format:** XML, JSON, GeoJSON, SPARQL JSON, RDF
- **SDK availability:** Community libraries (e.g., `geopy` for Nominatim, `qwikidata` for Wikidata)
- **Integration complexity:** Hard. Requires fusing multiple data sources, parsing OSM tags, and handling incomplete coverage. No unified schema.
- **Usage restrictions:** **ODbL (Open Database License)** for OSM — must share-alike if you create a derivative database. **CC BY-SA** for Wikivoyage/Wikipedia. Attribution required.
- **URLs:** https://nominatim.org/ | https://query.wikidata.org/ | https://en.wikivoyage.org/

**Key insight:** The **zero-cost foundation**. Many commercial providers (Geoapify, OpenTripMap, Sygic) build on OSM + Wikidata. If Traveloure has engineering capacity to clean and curate, this is the ultimate free source. Not recommended as the sole source for launch without significant data engineering.

---

## 13. GeoNames Web Services

- **Provider name:** GeoNames
- **API name:** GeoNames Web Services (postal code lookup, find nearby, cities, country info, weather)
- **Content type:** Destinations (cities, admin divisions, populated places), geocoding
- **Coverage:** Global (11M+ placenames)
- **Auth model:** Username (free account)
- **Rate limits / free tier:** 30km radius max, 500 maxRows, ~1,000–2,000 credits/day implied. Premium: 99% or 99.9% availability plans (EUR40–EUR500/year)[^26]
- **Pricing:** Free for basic use; Premium: EUR40 (100K credits/yr), EUR80 (1M credits/yr), up to EUR500 (5M credits/yr). Most services = 1 credit/request.
- **Data format:** JSON, XML
- **SDK availability:** R package (`geonames`), Python wrappers, community libs
- **Integration complexity:** Easy. Very simple REST endpoints.
- **Usage restrictions:** Free service has no SLA. Attribution appreciated.
- **URL:** http://www.geonames.org/export/web-services.html

**Key insight:** Excellent for **destination metadata** (city name variants, admin hierarchies, postal codes, country info) rather than rich POI descriptions. Best used as a **gazetteer** to normalize location names.

---

## 14. Viator / Tripadvisor Experiences API (Booking-Enabled)

- **Provider name:** Viator (Tripadvisor subsidiary)
- **API name:** Viator API (partner access via Tripadvisor)
- **Content type:** Tours, activities, experiences (bookable inventory)
- **Coverage:** Global
- **Auth model:** Partner approval + API key
- **Rate limits / free tier:** No upfront API cost; commission-based
- **Pricing:** No API fees. Revenue share: **8–12% commission per booking** to the partner platform[^27]
- **Data format:** JSON
- **SDK availability:** REST; sandbox + production environments
- **Integration complexity:** Moderate. Requires handling booking confirmation, vouchers, cancellation webhooks.
- **Usage restrictions:** Partner agreement required. Must direct bookings through Viator checkout or affiliate link.
- **URL:** https://www.viator.com/affiliate/partner-api (via Tripadvisor partner portal)

**Key insight:** If Traveloure wants to monetize experiences directly, Viator is the largest tours & activities OTA. The commission model means zero upfront cost but less margin control than direct supplier integrations.

---

## 15. SafeGraph Places

- **Provider name:** SafeGraph (now part of Veraset / Overture Maps contribution)
- **API name:** SafeGraph Places (dataset delivery, not strictly API-first)
- **Content type:** POIs (30M+ global places, 20+ standard attributes)[^28]
- **Coverage:** Global, US-centric
- **Auth model:** Contract / data marketplace (Snowflake, Databricks, S3, Azure, CSV)
- **Rate limits / free tier:** Sample data available for evaluation; no self-service free tier.
- **Pricing:** $$ (mid-range), flat value-based pricing rather than per-request. Custom contracts.
- **Data format:** Parquet, CSV, Snowflake shares
- **SDK availability:** Data platform integrations (no REST API)
- **Integration complexity:** Moderate–Hard. Requires data warehouse / ETL pipeline.
- **Usage restrictions:** Data license agreement; no real-time query model.
- **URL:** https://www.safegraph.com/

**Key insight:** More of a **data vendor** than an API. Best for building a foundational POI database via bulk ETL, not for real-time user-facing queries. Good if Traveloure wants to own its data layer and avoid per-request API costs at scale.

---

## 16. Outscraper / Datappeal (Commercial POI Scraping & Data APIs)

- **Provider names:** Outscraper, Datappeal
- **API names:** Outscraper POI Data API; Datappeal POI API / Territorial API
- **Content type:** POIs (scraped or enriched from Google Maps, OSM, etc.) + sentiment data
- **Coverage:** Global
- **Auth model:** API key
- **Rate limits / free tier:** Outscraper: $1/1,000 POIs (UI/API). Datappeal: custom quote[^29]
- **Pricing:** Outscraper: pay-as-you-go $1/1K POIs. Datappeal: enterprise licensing.
- **Data format:** JSON, CSV, Excel, Parquet
- **SDK availability:** Python, Ruby, PHP, Node, Go, Java SDKs (Outscraper)
- **Integration complexity:** Easy (Outscraper) to Hard (Datappeal enterprise negotiation).
- **Usage restrictions:** Outscraper grants perpetual usage rights for licensed data. Scraping legal terms vary by jurisdiction.
- **URLs:** https://outscraper.com/ | https://datappeal.io/

**Key insight:** Useful for **one-time backfills** or building a seed database, especially for places missing from OSM. Not recommended as a live user-facing API due to latency and compliance risk.

---

## 17. BizData API (Free, No-Key)

- **Provider name:** BizData
- **API name:** BizData API (businesses by location & category)
- **Content type:** POIs (37 business categories, built on OSM)
- **Coverage:** Europe strong; US/UK 20–40% field fill[^30]
- **Auth model:** No API key required
- **Rate limits / free tier:** Unlimited free, no signup
- **Pricing:** Free
- **Data format:** JSON
- **SDK availability:** REST; MCP server built-in for AI tools
- **Integration complexity:** Very Easy. No auth, no billing.
- **Usage restrictions:** Attribution to OSM. No reviews/photos. No autocomplete.
- **URL:** https://bizdata-web.vercel.app/api/businesses

**Key insight:** A niche **zero-friction** option for prototyping or AI agent integrations. Not suitable for production travel marketplace due to thin data and lack of tourism-specific categories.

---

## 18. RoadGoat Cities API

- **Provider name:** RoadGoat
- **API name:** RoadGoat Cities API
- **Content type:** Destination data (city-level travel info, scores, best time to visit)
- **Coverage:** 232 countries, 4M+ cities[^31]
- **Auth model:** API key
- **Rate limits / free tier:** Free + paid tiers (self-service)
- **Pricing:** Free tier available; paid tiers for higher volume
- **Data format:** JSON
- **SDK availability:** REST
- **Integration complexity:** Easy.
- **Usage restrictions:** Standard terms.
- **URL:** https://www.roadgoat.com/ (API access via developer portal)

**Key insight:** Specialized for **destination-level** content (not individual POIs). Good for city scorecards and travel personality matching, but lacks the granular attraction data Traveloure likely needs.

---

## Comparison Matrix: All APIs

| Provider | Destinations | POIs | Tours/Activities | Auth | Free Tier | Storage Rights | Tourism Focus | Data Source |
|----------|-------------|------|------------------|------|-----------|----------------|---------------|-------------|
| Amadeus | Yes City Search | Yes POI API | Yes Tours & Activities | OAuth2 | 10K+ /mo | Permissive | **Very High** | MyLittleAdventure + proprietary |
| Google Places | No | Yes | No | API key + billing | 10K/5K/1K per SKU | No (cache 30d) | Medium | Proprietary UGC |
| Geoapify | No | Yes | No | API key | 3K/day | **Yes** | Medium | OSM + proprietary |
| Foursquare | No | Yes | No | API key | 500/mo (2026) | Yes | Medium | Proprietary + UGC |
| Tripadvisor | Yes Geo | Yes Attractions | Yes (via Viator) | Approved partner | Metered | No Display only | **Very High** | Proprietary UGC |
| OpenTripMap | No | Yes | No | API key | 5K/day (non-comm) | Attribution | **Very High** | OSM + Wikidata + govt |
| TomTom | No | Yes | No | API key | Eval tier | Yes | Medium | Proprietary + partners |
| Mapbox | No | Yes | No | Token | 25K POI/mo | Attribution | Medium | Proprietary + OSM |
| HERE | No | Yes | No | API key | 30K–250K/mo | Yes | Medium | Proprietary |
| TrueWay | No | Yes | No | API key | 2.5K/day (eval) | Standard | Low | Proprietary GIS |
| Sygic | Yes Guides | Yes | No | API key | 1K/mo | Standard | **High** | OSM + Wikipedia + app |
| OSM+Nominatim | Yes (Wikivoyage) | Yes | No | None | Unlimited | ODbL / CC BY-SA | **High** | Crowdsourced |
| Wikidata | Yes | Yes | No | None | Unlimited | CC0 (data) | **High** | Crowdsourced |
| GeoNames | Yes Cities | No | No | Username | ~1K/day | Standard | Low | Crowdsourced + official |
| Viator | No | Yes | Yes | Partner | Commission | Partner terms | **Very High** | Viator inventory |
| SafeGraph | No | Yes | No | Contract | Samples | License | Low | Proprietary |
| Outscraper | No | Yes | No | API key | Pay-per-use | Perpetual | Low | Scraped |
| BizData | No | Yes | No | None | Unlimited | OSM terms | Low | OSM |
| RoadGoat | Yes | No | No | API key | Yes | Standard | **High** | Proprietary |

---

## Strategic Recommendations for Traveloure

1. **Primary content layer:** Use **Amadeus Destination Experiences** for bookable tours/activities and structured POI search. It is the only provider combining travel content with monetizable booking links.
2. **Fallback / cost-efficient POI layer:** Use **Geoapify Places API** as the default POI database. It allows caching, offers 800+ categories, and costs a fraction of Google. This avoids vendor lock-in and builds a durable asset.
3. **Premium enrichment (select cities):** Use **Google Places API** or **Foursquare Places API** for top-tier destinations where user reviews, photos, and live hours are critical to conversion. Treat as an expensive enrichment layer, not a foundation.
4. **Social proof layer:** Apply for **Tripadvisor Content API** to display review counts, awards, and ranking bubbles. This builds traveler trust without owning the review system.
5. **Free foundation:** Maintain a mirror of **OpenStreetMap + Wikidata** extracts for tourism-tagged POIs. This is insurance against API pricing changes and provides offline data sovereignty.
6. **Gazetteer / normalization:** Use **GeoNames** to normalize city/region names and hierarchies across multilingual markets.
7. **Monetization path:** If Traveloure wants to earn commission on experiences without managing supplier contracts, integrate **Viator API** alongside Amadeus for maximum tours coverage.

---

## Citations

[^1]: Foursquare. "Upcoming Places API Changes." Docs — Foursquare, 12 Feb 2026. https://docs.foursquare.com/developer/reference/upcoming-changes (free tier reduced to 500 Pro calls/mo effective June 1, 2026; V3 deprecated May 15, 2026).

[^2]: Amadeus for Developers. "Destination Experiences APIs Tutorial." https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/resources/destination-experiences/ (partnership with MyLittleAdventure, 8,000+ destinations, 300,000+ activities).

[^3]: Amadeus for Developers. "Free test data collection of Self-Service APIs." 20 Apr 2026. https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/test-data/ (test vs production environments, free quotas, billing).

[^4]: Amadeus for Developers. "API Rate Limits." 20 Apr 2026. https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/api-rate-limits/ (Tours and Activities: 20 TPS, 1 req/50ms; other APIs: 10 TPS test, 40 TPS production).

[^5]: Amadeus for Developers. GitHub SDKs: https://github.com/amadeus4dev (Node, Python, Java, PHP, Ruby).

[^6]: Woosmap. "Google Maps API Pricing 2026: 3 Scales, Real TCO." 16 Apr 2026. https://www.woosmap.com/blog/google-maps-api-pricing-breakdown (per-SKU free caps: 10K Essentials, 5K Pro, 1K Enterprise; subscription plans Starter/Essentials/Pro).

[^7]: SafeGraph. "Google Places API Pricing, Costs & Alternative Options." 2 Jun 2026. https://www.safegraph.com/guides/google-places-api-pricing/ (Place Details Pro $17/1K, Text Search $32/1K, Geocoding $5/1K; Basic data no extra charge).

[^8]: Google. "Google Maps Platform Terms of Service." https://cloud.google.com/maps-platform/terms (data caching 30-day restriction, attribution requirements, no redistribution).

[^9]: Geoapify. "Pricing | Geoapify Location Platform." 16 Apr 2026. https://www.geoapify.com/pricing/ (Free 3,000 credits/day; API 10 $59/mo 10K/day; API 25 $109/mo 25K/day; etc.).

[^10]: Geoapify. "Places API FAQ." https://www.geoapify.com/places-api/ ("allowed to cache, store, and redistribute the results"; attribution to OSM and Geoapify required on free plan).

[^11]: Camino AI. "Foursquare Places API Pricing: Pro vs Premium Fields Explained (2025)." 18 Jan 2025. https://app.getcamino.ai/learn/foursquare-places-api-pricing (Pro free tier 10K/mo pre-2026; Premium endpoints no free tier; CPM pricing tiers).

[^12]: Tripadvisor Content Solutions. "Tripadvisor Content Solutions." https://tripadvisor.shorthandstories.com/tripadvisorcontent-solutions/ (8M+ locations, 1B+ reviews, 29 languages, 500M unique monthly visits).

[^13]: Tripadvisor Content API — ReadMe. "API Reference - Overview." 14 Apr 2022. https://tripadvisor-content-api.readme.io/reference/overview (up to 50 calls/sec, pay only for what you use, daily limit controls).

[^14]: GitHub — SK4P3/tripadvisorapi. "A python wrapper for the TripAdvisor Content API." 9 Apr 2023. https://github.com/SK4P3/tripadvisorapi

[^15]: FindAPIs. "OpenTripMap Places API." https://findapis.com/api/opentripmap-places ("over 10 million tourist attractions and facilities around the world"; based on OSM, Wikidata, Wikipedia, Russian Ministry of Culture).

[^16]: Worldindata. "Opentripmap - point of interest API." 14 Dec 2022. https://www.worldindata.com/api/opentripmap-point-of-interest-api/ (free trial available; monthly subscription from $19/mo).

[^17]: TomTom. "Pricing." Docs. https://docs.tomtom.com/pricing/ (Search API EUR2.5/1K, Geocoding EUR0.75/1K, Reverse Geocoding EUR0.5/1K; free evaluation tier with no credit card).

[^18]: Mapbox. "Pricing." https://www.mapbox.com/pricing (Search sessions free up to 2,500/mo; POI API free up to 25,000/mo; map loads 50,000/mo free).

[^19]: Mapbox. "Search API Pricing." https://www.mapbox.com/pricing (introductory preview pricing: Search $11.50/1K for 501–100K sessions; POI $1.70/1K for 50K–500K requests).

[^20]: BizData. "Google Places API Alternatives in 2026 — 7 Options Compared." 11 May 2026. https://bizdata-web.vercel.app/compare (HERE free tier: 1,000 req/day; Base Plan 30K–250K/mo).

[^21]: AllThingsDev. "Unlocking the Power of TrueWay APIs with AllThingsDev." 29 May 2025. https://blogger.allthingsdev.co/blog/trueway-geolocation-api (TrueWay Places API: 150M+ places; text search and nearby search endpoints).

[^22]: RapidAPI. "TrueWay Places API." https://rapidapi.com/trueway/api/trueway-places (free tier: 5,000 API calls/month; Basic plan $0 on Trueway direct site for 2,500/day eval).

[^23]: TruewayAPI. "Pricing and Plans." https://truewayapi.com/ (Places API Basic 2,500/day eval; Professional $49/mo 100K req; Ultra $99/mo 250K req; Mega $299/mo 1M req; overages +EUR0.9–EUR2.7/1K).

[^24]: TruewayAPI. "Pricing and Plans." https://truewayapi.com/ ("We don't use open street map and other free/open source maps... created by experienced GIS analysts, cartographers, and scientists").

[^25]: Sygic. "Sygic Places as an Alternative to the Google Places API." https://www.sygic.com/blog/2018/sygic-places-as-an-alternative-to-the-google-places-api (free up to 1,000 requests/month; EUR45/mo up to 50,000; EUR99/mo up to 150,000; data dump option available).

[^26]: GeoNames. "Premium Web Services." https://www.geonames.org/commercial-webservices.html (Best Availability 1M credits EUR250; Best Price 100K credits EUR40, 1M credits EUR80, 5M credits EUR120; 1 credit ~ 1 request).

[^27]: PHPTravels. "Viator API Integration Guide Access Pricing Documentation and Setup." 30 Apr 2026. https://phptravels.com/blog/what-is-viator-api-how-it-works (no upfront API cost; 8–12% commission per booking; REST + JSON, sandbox + production).

[^28]: SafeGraph. "Google Places API Alternatives for POI Data." 2 Jun 2026. https://www.safegraph.com/guides/google-places-api-alternatives/ (30M+ global POIs, 20+ standard attributes, monthly updates, data delivery via S3/Snowflake/Azure).

[^29]: Outscraper. "Point of Interest (POI) Database, Dataset." 30 Jun 2024. https://outscraper.com/poi-data/ ($1/1,000 POIs; API scraper $1/1,000; data licensing $3/1,000; perpetual rights available).

[^30]: BizData. "Google Places API Alternatives in 2026 — 7 Options Compared." 11 May 2026. https://bizdata-web.vercel.app/compare (BizData API: no key, unlimited free, 37 categories, OSM-based, MCP server built-in, Europe strong, US/UK 20–40% fill).

[^31]: Travel Professional News. "AI-Powered Mobile App Marketing for Travel Advisors – Part 2." 22 Sep 2025. https://travelprofessionalnews.com/ai-powered-mobile-app-marketing-for-travel-advisors-part-2/ (RoadGoat Cities API: 232 countries, 4M+ cities).
