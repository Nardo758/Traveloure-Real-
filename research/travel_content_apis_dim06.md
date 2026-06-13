# Dimension 06: Restaurant & Dining APIs

## Research Scope
Travel marketplace content providers offering APIs for **restaurant discovery**, **restaurant details** (hours, cuisine, price range, photos, coordinates), **reviews and ratings**, **menu data**, and **reservation availability** that are accessible to developers.

**Research Date:** 2026-06-13
**Author:** Research Sub-Agent

---

## Executive Summary: Top 7 Providers for Traveloure

| Rank | Provider | API | Best For | Free Tier | Data Richness | Integration Complexity |
|------|----------|-----|----------|-----------|---------------|----------------------|
| 1 | **Google** | Places API (New) | Universal restaurant coverage, structured menus, photos, reviews | Per-SKU caps (10K Essentials, 5K Pro/mo) | Very High (menus, UGC, hours, live popularity) | Easy (API key + billing) |
| 2 | **Yelp** | Fusion / Places API | User-generated reviews, ratings, photos, business details | 30-day trial; paid tiers start ~$229/mo[^1] | Very High (reviews, photos, transactions, hours) | Easy (API key) |
| 3 | **Foursquare** | Places API (V2 Pro / FSQ OS) | Rich venue intelligence, tips, ratings, popular hours, chain data | 500 Pro calls/mo (June 2026)[^2] | Very High (UGC, photos, tastes, popularity) | Easy–Moderate |
| 4 | **Tripadvisor** | Content API | Social proof for restaurants (reviews, awards, rankings) | Partner approval required; metered | High (reviews, photos, ratings, cuisine tags) | Moderate (approval) |
| 5 | **OpenTable** | Affiliate / Connect API | Reservation links, real-time availability, restaurant profiles | Partner approval; limited test access | Moderate (availability, reservation URLs, basic details) | Moderate (approval + QA) |
| 6 | **TheFork** | B2B API | European restaurant booking, discounts, menus, reviews | Partner contract required | High (menus, pricing, reviews, availability) | Moderate (partner onboarding) |
| 7 | **Spoonacular** | Food / Nutrition API | Menu item intelligence, recipe-to-restaurant mapping, nutrition | 3,000 requests/mo free via API Layer[^3] | High (nutrition, allergens, recipes, ingredients) | Easy (API key) |

*Honorable mentions:* **Zomato API** (India/global restaurant data, 1,000 req/day free)[^4], **Resy API** (fine-dining reservations, AmEx ecosystem, partner-only)[^5], **Geoapify Places API** (restaurant POIs, 3K credits/day free, permissive licensing)[^6], **Apify Restaurant Review Aggregator** (scrapes Yelp, Google, Tripadvisor, DoorDash, UberEats, Facebook)[^7], **DataForSEO Google Reviews API** ($0.00075 per 10 reviews, standard queue)[^8].

---

## 1. Google Places API (Google Maps Platform)

- **Provider name:** Google LLC
- **API name:** Places API (New) — includes Place Details, Text Search, Nearby Search, Photos, Autocomplete
- **Content type:** Restaurant discovery, details (name, address, phone, hours, cuisine, price level), photos, user reviews, structured menu data[^9]
- **Coverage:** Global, largest proprietary POI database
- **Auth model:** API key + GCP billing account (mandatory for production)
- **Rate limits / free tier:** Per-SKU free caps since March 2025: 10,000 events/mo for Essentials SKUs, 5,000 for Pro SKUs, 1,000 for Enterprise SKUs. No pooled $200 credit anymore[^10]
- **Pricing:** Pay-as-you-go or subscription plans. Key restaurant-relevant SKUs: Place Details (Pro) ~$17/1K; Text Search / Nearby Search $32/1K; Place Details (Preferred) $40/1K[^11]. Structured menu data retrieval requires Preferred SKU fields[^9]
- **Data format:** JSON (Protocol Buffers optional)
- **SDK availability:** Android, iOS, JS (Places Library), Go, Python, Node.js, Java
- **Integration complexity:** Easy. Very mature docs, but billing/field-masking complexity is high. Must specify field masks to avoid over-billing.
- **Real-time vs cached:** Near real-time for active listings; menu data may lag behind restaurant updates
- **Usage restrictions:** **Data cannot be stored indefinitely** (cache up to 30 days for most data). Must display results with Google Maps. Attribution required. No redistribution[^10]
- **URL:** https://developers.google.com/maps/documentation/places/web-service

**Key insight:** The only major provider offering **structured menu data** (dish names, descriptions, prices) via API for a subset of restaurants[^9]. Best data quality and coverage globally. Use as the **primary restaurant database layer**, but cache aggressively and respect storage restrictions. The new menu field is a significant differentiator for travel marketplaces wanting to show diners what they can eat before they book.

---

## 2. Yelp Fusion API / Yelp Places API

- **Provider name:** Yelp Inc.
- **API name:** Yelp Fusion API (v3) — Business Search, Business Details, Reviews, GraphQL option available
- **Content type:** Restaurant discovery, business details (hours, transactions, price level), reviews (3 per business on standard plans, up to 7 on Enterprise), photos, ratings, categories[^12]
- **Coverage:** 32 countries; strongest in North America, Western Europe, Australia[^12]
- **Auth model:** Private API key (OAuth 2.0 for user data endpoints)
- **Rate limits / free tier:** Yelp sunsetted unlimited free commercial use in 2019. As of 2024–2025, developers report a 30-day free trial, then paid tiers. Rate limits depend on plan: Starter 300 calls/day, higher tiers up to 5,000+ calls/day[^13]. Enterprise plans available for 1,000+ calls/day[^1]
- **Pricing:** Commercial Fusion plans start around $229/mo for 1,000 calls/day (reported by developers in 2024)[^1]. Yelp Places API (successor to Fusion) uses tiered pricing: Base, Enhanced, Premium tiers with per-1,000-call billing. Exact pricing requires direct sales contact for volume discounts[^14]
- **Data format:** JSON; GraphQL endpoint available
- **SDK availability:** Community SDKs for Python, Node.js, Ruby, iOS, Android; official docs favor REST/GraphQL direct integration[^12]
- **Integration complexity:** Easy. Straightforward REST endpoints. GraphQL console for interactive testing.
- **Real-time vs cached:** Cached data; reviews and business details updated on Yelp's own cadence (hours typically daily, reviews real-time)
- **Usage restrictions:** Must display Yelp logo and attribution. Reviews are truncated to ~160 characters in Fusion API. No full review text available via official API. Caching allowed up to 24 hours recommended during development[^13]
- **URL:** https://docs.developer.yelp.com

**Key insight:** Yelp's **review data is the gold standard** for North American restaurant social proof. However, the API limits review snippets (not full text) and the pricing transition has frustrated indie developers. Best used for **rating scores, review counts, and photo URLs** rather than deep review content. The "transactions" field (delivery, pickup, restaurant_reservation) is useful for filtering bookable restaurants.

---

## 3. Foursquare Places API (V2 Pro / FSQ OS Places)

- **Provider name:** Foursquare Labs Inc.
- **API name:** Places API (V2 Pro / V3 legacy deprecated May 2026) — Place Search, Place Details, Autocomplete, Photos, Tips
- **Content type:** Restaurant discovery, venue details (rating 0–10, price tier 1–4, popularity score, verified status), photos, tips/reviews, hours, categories, chain data, contact info[^2]
- **Coverage:** 100M+ places across 200+ countries; strongest in US urban areas
- **Auth model:** API key (OAuth for some user endpoints)
- **Rate limits / free tier:** **500 Pro calls/mo** starting June 1, 2026 (down from 10,000). No free tier for Premium endpoints (photos, tips, hours, ratings, price, description, popularity)[^2]
- **Pricing:** Pro endpoints: $15/1K (0–100K), $12/1K (100K–500K), $9/1K (500K–1M), $4.50/1K (1M–5M), $1.25/1K (5M+). Premium endpoints: $18.75/1K (0–100K), $15/1K (100K–500K), $11.25/1K (500K–1M), $5.75/1K (1M–5M), $1.75/1K (5M+)[^2]
- **Data format:** JSON
- **SDK availability:** Official SDKs for JS, Python, iOS, Android; Pilgrim SDK for passive location
- **Integration complexity:** Easy–Moderate. Version migration burden (V3 deprecated May 2026). Field filtering (`fields` param) helps control cost.
- **Real-time vs cached:** Cached venue database; ratings and tips updated as users contribute
- **Usage restrictions:** Standard ToS. Photos/tips are user-generated content with attribution expectations. No storage restrictions like Google[^2]
- **URL:** https://docs.foursquare.com/developer

**Key insight:** Foursquare remains the **richest venue intelligence API** for "tastes" (e.g., "pizza", "rooftop", "date night"), popular hours (foot-traffic-based), and tip content. The June 2026 free-tier reduction to 500 calls makes it expensive for startups. Best used for **high-value destination enrichment** where user-generated context (tips, taste tags, popularity scores) differentiates the experience. The 0–10 rating scale and 0–1 popularity score provide more granular sentiment than Yelp's 5-star system.

---

## 4. Tripadvisor Content API

- **Provider name:** Tripadvisor LLC
- **API name:** Tripadvisor Content API (formerly Partner API) — Location Details, Location Photos, Location Reviews, Location Search, Nearby Location Search
- **Content type:** Restaurant details, reviews (up to 5 per location), photos (up to 5 per location), ratings, ranking, awards, cuisine tags, price level, address, coordinates[^15]
- **Coverage:** 8+ million locations globally (hotels, restaurants, attractions); 29 languages; 1 billion+ reviews and opinions[^15]
- **Auth model:** API key (partner approval required)
- **Rate limits / free tier:** Content API is free for approved B2C partners. Development/QA: 50 calls/sec, 1,000 calls/day. Approved/Launched: 10,000 calls/day. Location mapper key: 25,000 calls/day[^15]
- **Pricing:** Free for approved consumer-facing websites and apps. Revenue-share model available via Hotel Pricing API. No upfront cost for content[^15]
- **Data format:** JSON
- **SDK availability:** REST API; no official SDKs. Community wrappers available.
- **Integration complexity:** Moderate. Requires partner application with business case description. Approval timeline varies (days to weeks). Must display Tripadvisor logos and link back on every page[^15]
- **Real-time vs cached:** Cached; reviews and photos updated on Tripadvisor's ingestion cycle
- **Usage restrictions:** **B2C only** — intended for consumer-facing websites/apps, not B2B data products. Must display Tripadvisor branding and attribution. Cannot use for non-commercial purposes. Traffic exchange expected (drive users back to Tripadvisor)[^15]
- **URL:** https://developer-tripadvisor.com/content-api/ (legacy) / new Terra API platform coming soon[^16]

**Key insight:** Tripadvisor is the **traveler's review standard** for restaurants in tourist destinations. The requirement to drive traffic back to Tripadvisor makes it suitable for a travel marketplace that already sends users to booking partners. The 5-review/5-photo limit per location is restrictive for deep content, but the **awards and ranking data** (e.g., "#12 of 450 restaurants in Paris") is unique and highly persuasive for travelers. Best for **tourist-area restaurants** rather than local hidden gems.

---

## 5. OpenTable API (Affiliate / Connect / Single Search)

- **Provider name:** OpenTable Inc. (Booking Holdings)
- **API name:** OpenTable Affiliate API, OpenTable Connect API, Single Search API
- **Content type:** Restaurant profiles, reservation availability, real-time table inventory, reservation links, aggregated ratings, reviews, cuisine types, price range, location[^17]
- **Coverage:** 60,000+ restaurants globally; strongest in US, UK, Canada, Australia, Japan, Mexico, parts of Europe
- **Auth model:** OAuth 2.0 (partner application required)
- **Rate limits / free tier:** No public free tier for standalone developers. Initial development access may be free with limits; live usage requires partner agreement. Limits enforced per contract[^17]
- **Pricing:** Commission-based partner model for affiliate reservations. No upfront fees for affiliate API. OpenTable charges restaurants per cover ($1.50 for network bookings, $0.25–$1.00 for direct)[^18]. API costs typically borne by restaurant partners or negotiated in affiliate agreements.
- **Data format:** JSON
- **SDK availability:** REST API; no official SDKs. Community wrappers (e.g., unofficial Ruby gem, Python clients)
- **Integration complexity:** Moderate. Partner application required (3–4 week approval). Must complete QA/testing in pre-production environment before going live. Reservation flow redirects users to OpenTable to complete booking (cannot complete fully on-platform)[^17]
- **Real-time vs cached:** **Real-time availability** for reservation inventory. Restaurant profile data cached.
- **Usage restrictions:** Partner-only. Must maintain OpenTable branding on reservation links. Users must complete booking on OpenTable domain. Restrictions on storing availability data long-term[^17]
- **URL:** https://docs.opentable.com / https://www.opentable.com/support/solutions/ (partner portal)

**Key insight:** OpenTable is the **broadest reservation network** globally. For a travel marketplace, the Affiliate API is the most realistic entry point — it provides restaurant details + deep links to reservation pages. The **Single Search API** allows retrieving availability for a restaurant by ID, date, and party size. The inability to complete bookings entirely within your platform is a UX friction, but the 60,000+ restaurant network and real-time inventory make it indispensable for markets where OpenTable dominates (US, UK, major tourist cities). Note: An **unofficial public API** exists at `opentable.heroku.com/api` but is unmaintained and not recommended for production[^19].

---

## 6. TheFork B2B API

- **Provider name:** TheFork SAS (TripAdvisor subsidiary)
- **API name:** TheFork B2B API — Restaurant Search, Booking Flow, Real-time Availability, Webhooks, Reservation Lifecycle, Customer Data
- **Content type:** Restaurant profiles, full menus with prices, customer reviews, ratings, real-time availability, booking slots, discounts/promotions, cuisine tags, atmosphere tags, payment methods, dietary options, Michelin stars, Gault & Millau ratings[^20]
- **Coverage:** 60,000+ restaurants across 12 European countries: France, Italy, Spain, Belgium, Netherlands, Switzerland, Portugal, Austria, Sweden, Denmark, Czech Republic, United Kingdom[^20]
- **Auth model:** API key / OAuth (partner contract required)
- **Rate limits / free tier:** Rate limiting enforced at default level per contract; custom limits negotiable[^21]
- **Pricing:** Commission-based or subscription depending on partner type. No public self-service pricing. Contact TheFork for partnership terms[^21]
- **Data format:** JSON
- **SDK availability:** REST API; no official SDKs
- **Integration complexity:** Moderate. Requires partner onboarding and contract. API versioning is global (one version for all endpoints), with 6-month deprecation window for breaking changes[^21]
- **Real-time vs cached:** Real-time availability and reservation data. Restaurant profile and menu data cached but updated regularly.
- **Usage restrictions:** Partner-only B2B API. Requires booking funnel integration that matches brand requirements. Webhook support for reservation events (create, update, cancel)[^21]
- **URL:** https://docs.thefork.io

**Key insight:** TheFork is the **dominant restaurant booking platform in Europe** — stronger than OpenTable in France, Italy, Spain, and most of continental Europe. The API offers **full menu extraction with prices** (a rare feature), discount/promotion data (up to 50% off at partner restaurants), and the YUMS loyalty program integration. TheFork acquired Dimmi (Australia) but shut down Australian operations in March 2024[^22]. For Traveloure's European destinations, TheFork should be the **primary reservation integration** ahead of OpenTable. The Michelin star and Gault & Millau rating fields are especially valuable for a premium travel marketplace.

---

## 7. Spoonacular Food API

- **Provider name:** Spoonacular Inc.
- **API name:** Spoonacular Food API — Recipe Search, Menu Items, Food Products, Nutrition, Ingredients, Meal Planning, Image Analysis
- **Content type:** Recipe data, restaurant menu items (100,000+ menu items from chain restaurants), nutrition analysis, ingredient parsing, allergen detection, diet classification, food image recognition, wine pairing[^23]
- **Coverage:** Global recipe database; menu item coverage strongest for US chain restaurants
- **Auth model:** API key (RapidAPI or API Layer marketplace)
- **Rate limits / free tier:** 3,000 requests/month free on API Layer / RapidAPI. Paid tiers: 30,000 requests/mo (Standard), 100,000/mo, 300,000/mo, or custom[^3]
- **Pricing:** Free tier available. Paid plans via API Layer: $29–$249/mo depending on volume. Academic/hackathon plans: $10/mo for 5,000 requests/day[^23]
- **Data format:** JSON
- **SDK availability:** Python, JavaScript, PHP, Ruby, Go, Java (community SDKs). RapidAPI auto-generates code snippets.
- **Integration complexity:** Easy. Simple REST endpoints, no OAuth. Points-based quota system (each endpoint costs 1+ points).
- **Real-time vs cached:** Cached database; recipe and menu item data updated periodically
- **Usage restrictions:** Attribution to Spoonacular required. Academic plan requires university email. Free tier limited to 150 requests/day via some channels[^24]
- **URL:** https://spoonacular.com/food-api / https://apilayer.com/marketplace/spoonacular-api

**Key insight:** Spoonacular is **not a restaurant discovery API** — it's a **food intelligence API** that can enrich restaurant listings with nutrition, allergens, and recipe-to-menu mapping. The 100,000+ chain restaurant menu items include nutritional data (calories, macros, allergens) for dishes from Burger King, Subway, etc. For a travel marketplace, use Spoonacular to: (1) classify restaurant cuisine types from menu text, (2) flag dietary options (vegan, gluten-free, keto) for dishes, (3) compute nutritional estimates for menu items. The **food image recognition endpoint** (`/food/images/analyze`) can identify dishes from user-uploaded photos, enabling a "snap a dish, find the restaurant" feature. Best as a **complementary enrichment layer**, not a primary restaurant database.

---

## 8. Zomato API

- **Provider name:** Zomato Media Pvt. Ltd. (Eternal / Info Edge)
- **API name:** Zomato API — Search, Restaurant Details, Reviews, Collections, Daily Menu, Locations
- **Content type:** Restaurant discovery, details (name, address, phone, hours, cuisines, price range, average cost for two), ratings, photos, menu URLs, daily specials, location/city search[^4]
- **Coverage:** Strong in India, UAE, Australia, New Zealand, Philippines, South Africa, Indonesia, Qatar, Sri Lanka, and other select markets. Limited US/EU coverage.
- **Auth model:** API key (`user-key` header)
- **Rate limits / free tier:** Free tier: up to 1,000 API requests/day; max 20 records per search query. Commercial access requires enterprise licensing/partnership[^4]
- **Pricing:** Free for limited use. Enterprise/partnership for commercial scale.
- **Data format:** JSON
- **SDK availability:** Community SDKs for Python, Ruby, Node.js, PHP, Java
- **Integration complexity:** Easy. Simple REST API with clear endpoints. No OAuth.
- **Real-time vs cached:** Cached; menu data via `menu_url` (link to Zomato-hosted page) rather than structured JSON for most restaurants[^4]
- **Usage restrictions:** Free tier limited. Attribution required. `daily_menu` endpoint only available for select restaurants. Developer program access may require formal approval for new signups[^4]
- **URL:** https://developers.zomato.com (status uncertain; recent reports suggest limited new access)

**Key insight:** Zomato is the **dominant restaurant platform in India and select Commonwealth markets**. If Traveloure targets India, Southeast Asia, or the Middle East, Zomato is essential. However, the API's future is uncertain — Zomato has shifted focus to food delivery (Blinkit) and dining-out (Zomato Gold), and new developer access may be restricted. The structured menu data is weak (`menu_url` links rather than JSON), making it less useful for deep menu integration. Consider **Zomato as a regional enrichment source** rather than a global backbone.

---

## 9. Resy API (Restaurant Reservations)

- **Provider name:** Resy Network LLC (American Express subsidiary)
- **API name:** Resy Platform 360 API (partner-only)
- **Content type:** Restaurant discovery, reservation availability, booking, waitlist management, guest profiles, floor plans, table management[^5]
- **Coverage:** ~25,000 venues across 1,900+ cities; concentrated in major US metros (NYC, LA, Chicago, Miami), London, Paris, Athens, Tokyo, and other global cities. Fine-dining and trendy restaurants[^5]
- **Auth model:** OAuth 2.0 with API key (partner-only; no self-service)
- **Rate limits / free tier:** No free tier. API access included in Resy OS "Full-Stack" enterprise plan ($899/mo for restaurants)[^25]
- **Pricing:** Restaurant subscription model ($249–$899/mo). Third-party API access via American Express enterprise partnership or Resy Platform 360 integration agreement. No public developer pricing[^25]
- **Data format:** JSON
- **SDK availability:** No official public SDKs. Community tools (e.g., `resy-cli`, `restaurant-mcp`) exist but use unofficial/reverse-engineered endpoints[^26]
- **Integration complexity:** High. No self-service developer portal. Requires Resy Platform 360 partnership or American Express relationship. Restaurant must be on Resy OS to enable third-party access.
- **Real-time vs cached:** Real-time availability and booking
- **Usage restrictions:** Partner-only. No public documentation for direct API access. All third-party integrations must be approved by Resy and the restaurant[^5]
- **URL:** https://resy.com (no public API docs)

**Key insight:** Resy is the **status platform for fine-dining reservations** (Carbone, Lilia, Don Angie). The American Express acquisition created exclusive benefits for Platinum/Centurion cardholders (Priority Notify, Global Dining Access). For a luxury travel marketplace, Resy integration signals **premium curation** — but the barrier to API access is extremely high. No self-service path exists; partnerships require AmEx or Resy enterprise relationships. Consider Resy for **ultra-premium tier positioning** only, with fallback to OpenTable/TheFork for broad coverage. Third-party MCP servers and Apify actors now provide unofficial programmatic access to Resy search and booking at ~$0.03/search, $3.99/booking[^27], but these carry TOS risk.

---

## 10. Geoapify Places API (Restaurant POIs)

- **Provider name:** Geoapify GmbH
- **API name:** Places API — includes Place Details, nearby search, text search, category filters
- **Content type:** Restaurant POIs (part of 800+ categories), including name, address, coordinates, contact, opening hours, website, cuisine tags (OSM-based), wheelchair access, internet access, payment methods, and more[^6]
- **Coverage:** Global (OpenStreetMap-based + proprietary enrichment)
- **Auth model:** API key (self-service signup)
- **Rate limits / free tier:** Free plan: 3,000 credits/day (~90,000/mo), 5 req/sec. Paid: API 10 ($59/mo, 10K/day), API 25 ($109/mo), up to custom enterprise[^6]
- **Pricing:** Credit-based. 1 request ~ 1 credit for <=20 places; each additional 20 places = +1 credit. Very affordable vs Google. Example: 50 restaurants = 3 credits[^6]
- **Data format:** JSON
- **SDK availability:** REST; no official SDK but straightforward HTTP integration. MapLibre/Leaflet examples provided.
- **Integration complexity:** Easy. Clean REST, no OAuth, generous free tier.
- **Real-time vs cached:** OSM data refreshed periodically; not real-time for dynamic attributes like hours
- **Usage restrictions:** **Permissive**: allowed to cache, store, and redistribute results. Attribution to OpenStreetMap (and Geoapify on free plan) required[^6]
- **URL:** https://www.geoapify.com/places-api/

**Key insight:** Geoapify is the **best budget alternative to Google Places** for restaurant discovery. The `catering.restaurant` category covers all restaurant types, with subcategories for cuisine (e.g., `catering.restaurant.pizza`, `catering.restaurant.sushi`). The **conditions filtering** is powerful: find vegan-only restaurants, dog-friendly places, wheelchair-accessible venues, or restaurants with free WiFi. The permissive license (allowing storage and redistribution) makes it ideal for building a **persistent restaurant database** that can be indexed and searched offline. No review data, no menus — but excellent for **basic restaurant listings with coordinates and amenities**.

---

## 11. Apify Restaurant Review Aggregator (Scraping Alternative)

- **Provider name:** Apify (tri_angle / third-party actors)
- **API name:** Restaurant Reviews Aggregator Actor
- **Content type:** Aggregated restaurant reviews from **6 platforms**: Tripadvisor, Yelp, Google Maps, Facebook, DoorDash, and UberEats. Extracts review text, rating, date, reviewer name, place address, and Google Maps Place ID[^7]
- **Coverage:** Global (dependent on source platform coverage)
- **Auth model:** Apify API token (self-service)
- **Rate limits / free tier:** Apify free plan: $5 usage credits/month. The Restaurant Reviews Aggregator allows scraping **1,600+ reviews** within the free credit limit[^7]
- **Pricing:** Apify Starter plan: $49/mo for extensive scraping. Pay-per-result model for individual actors.
- **Data format:** JSON, CSV, Excel, XML, HTML
- **SDK availability:** Apify Client (Node.js, Python), REST API, webhook integrations
- **Integration complexity:** Moderate. Requires Apify account, actor configuration, and handling of asynchronous scraping jobs. Proxy and anti-bot handling included.
- **Real-time vs cached:** Real-time scraping (subject to source platform rate limits and anti-bot measures)
- **Usage restrictions:** Scraping is subject to source platforms' Terms of Service. Actor only extracts publicly available data. Personal data (reviewer names) may require GDPR compliance[^7]
- **URL:** https://apify.com/tri_angle/restaurant-review-aggregator

**Key insight:** This is the **only practical way to get full review text from multiple platforms** in one unified dataset. Official APIs (Yelp Fusion, Tripadvisor Content API) limit review text length or quantity. The Aggregator returns complete review text from Google Maps, Yelp, Tripadvisor, Facebook, DoorDash, and UberEats, normalized with a common `googleMapsPlaceId` for cross-referencing. For a travel marketplace building a "What travelers say" feature, this is a **powerful (if legally grey) alternative** to official APIs. Use with caution: ensure GDPR compliance for reviewer names, and respect robots.txt/TOS of source sites. Best for **market research and competitive analysis** rather than public display.

---

## 12. DataForSEO Google Reviews API

- **Provider name:** DataForSEO
- **API name:** Business Data API — Google Reviews endpoint
- **Content type:** Google Maps reviews for restaurants and businesses (all reviews per entity in a single request)[^8]
- **Coverage:** Global (Google Maps coverage)
- **Auth model:** API key (self-service, pay-as-you-go)
- **Rate limits / free tier:** $1 free trial credit. No ongoing free tier.
- **Pricing:** Standard queue: $0.00075 per 10 reviews ($75 per 1M reviews). Priority queue: $0.0015 per 10 reviews ($150 per 1M reviews). Extended Google Reviews endpoint: $0.00075 per 20 reviews + $0.0015 if keyword specified[^8]
- **Data format:** JSON
- **SDK availability:** REST API; client libraries for Python, Node.js, PHP, Go, C#, Java
- **Integration complexity:** Easy. POST task, poll for results, GET output. No OAuth.
- **Real-time vs cached:** Results cached for up to 6 months on DataForSEO servers; task execution time up to 45 minutes (standard) or 1 minute (priority)[^8]
- **Usage restrictions:** Pay-as-you-go. No attribution requirements. Data can be stored and used for analysis.
- **URL:** https://dataforseo.com

**Key insight:** DataForSEO is the **cheapest way to get Google Maps review text at scale**. The official Google Places API does not expose full review text via the reviews endpoint. DataForSEO scrapes Google Maps and returns structured review data at a fraction of the cost of building a scraper in-house. For a travel marketplace analyzing sentiment or displaying "recent reviews" from Google, this is a **cost-effective backend** — but note the 45-minute standard queue delay makes it unsuitable for real-time use. Use the priority queue ($2x cost) for near-real-time needs.

---

## 13. Wolt Menu API (Delivery-Focused Menu Data)

- **Provider name:** Wolt Enterprises Oy (DoorDash subsidiary)
- **API name:** Wolt Menu API (partner-only)
- **Content type:** Structured menu data: categories, items, descriptions, prices, ingredients, allergens, additives, nutrition (energy, fats, carbs, protein), images, weekly availability, deposit info, bundle offers, option bindings (modifiers)[^28]
- **Coverage:** 25+ countries (primarily Europe, Middle East, Asia). Delivery platform restaurants only.
- **Auth model:** API key (partner integration required)
- **Rate limits / free tier:** No public free tier. Partner-only access.
- **Pricing:** Partner-negotiated. No public pricing.
- **Data format:** JSON
- **SDK availability:** REST API; no public SDKs
- **Integration complexity:** Moderate. Requires Wolt partner integration. Menu API allows pushing menus to Wolt and pulling them back to partner systems[^28]
- **Real-time vs cached:** Real-time menu synchronization
- **Usage restrictions:** Partner-only. Designed for restaurant POS and menu management systems, not general discovery[^28]
- **URL:** https://developer.wolt.com

**Key insight:** Wolt's Menu API offers the **most structured menu data** of any provider — down to ingredient-level detail, allergens, nutrition per 100g, and option modifiers (e.g., "add cheese"). However, it only covers restaurants on the Wolt delivery platform. For a travel marketplace, this is useful for **delivery/takeaway integrations** in Wolt-served cities (Helsinki, Berlin, Tel Aviv, Tokyo, etc.), but not for general restaurant discovery. The multi-language name/description support (`en`, `fi`, etc.) is a nice touch for international travelers.

---

## 14. AI Restaurant Menu Scraper (Apify — OCR-Based)

- **Provider name:** Apify (wedo_software)
- **API name:** AI Restaurant Menu Scraper Actor
- **Content type:** Extracts menu items from restaurant websites, including dish names, descriptions, prices, categories, ingredients, allergens. Handles text-based menus, PDFs, and images via OCR[^29]
- **Coverage:** Any restaurant with a website or menu image
- **Auth model:** Apify API token
- **Rate limits / free tier:** Apify free credits ($5/mo)
- **Pricing:** Pay-per-result via Apify compute units. Depends on crawl depth and OCR processing.
- **Data format:** JSON, CSV, Excel
- **SDK availability:** Apify Client (Node.js, Python), REST API
- **Integration complexity:** Moderate. Provide restaurant homepage URL; actor crawls subpages (`/menu`, `/food`, `/drinks`) and auto-detects menu formats. OCR handles handwritten/chalkboard menus if photo is clear[^29]
- **Real-time vs cached:** Real-time extraction per request
- **Usage restrictions:** Must respect target website's robots.txt and TOS. No attribution requirements for extracted data.
- **URL:** https://apify.com/wedo_software/wedo-scrape-menu

**Key insight:** This is a **creative fallback for menu data** when no API provides structured menus for a specific restaurant. The OCR capability means it can extract menus from JPEG/PNG images and PDFs — common formats for independent restaurants. Use it to fill gaps in Google Places' menu coverage (which is limited to restaurants that have submitted structured menu data). Best for **backfill and data completeness**, not as a primary real-time source due to cost and latency.

---

## Provider Comparison Matrix

| Provider | Discovery | Details | Reviews | Photos | Menus | Reservations | Global | Free Tier | Pricing Model |
|----------|-----------|---------|---------|--------|-------|------------|--------|-----------|---------------|
| Google Places API | ✅ | ✅ | ✅ | ✅ | ✅ (structured) | ❌ | Global | 5K–10K/mo | Pay-per-use / subscription |
| Yelp Fusion | ✅ | ✅ | ✅ (3 snippets) | ✅ | ❌ | ❌ | 32 countries | 30-day trial | Subscription (~$229+/mo) |
| Foursquare Places | ✅ | ✅ | ✅ (tips) | ✅ | ❌ | ❌ | Global | 500/mo | Pay-per-use (Pro/Premium) |
| Tripadvisor Content | ✅ | ✅ | ✅ (5 reviews) | ✅ (5 photos) | ❌ | ❌ | Global | Approval | Free (partner) |
| OpenTable API | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (deep links) | 60K+ restaurants | Approval | Commission |
| TheFork API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Europe | Contract | Commission / subscription |
| Spoonacular | ❌ | ❌ | ❌ | ❌ | ✅ (chain items) | ❌ | US chains | 3K/mo | Subscription ($29–$249/mo) |
| Zomato API | ✅ | ✅ | ✅ | ✅ | ⚠️ (URL only) | ❌ | India, Asia, MENA | 1K/day | Free / enterprise |
| Resy API | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (full) | 25K+ cities | ❌ | Partner / enterprise |
| Geoapify Places | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | Global | 3K/day | Pay-per-use / subscription |
| Apify Review Aggregator | ❌ | ❌ | ✅ (6 sources) | ❌ | ❌ | ❌ | Global | $5 credits | Pay-per-use |
| DataForSEO Reviews | ❌ | ❌ | ✅ (Google) | ❌ | ❌ | ❌ | Global | $1 credit | Pay-per-use |
| Wolt Menu API | ❌ | ❌ | ❌ | ❌ | ✅ (structured) | ❌ | 25 countries | ❌ | Partner |
| Apify Menu Scraper | ❌ | ❌ | ❌ | ❌ | ✅ (OCR) | ❌ | Any website | $5 credits | Pay-per-use |

---

## Recommendations for Traveloure

### Tier 1: Primary Restaurant Data (Must-Have)

1. **Google Places API** — Use as the **primary restaurant database** for all destinations. It provides the most comprehensive coverage, structured menu data (where available), photos, hours, and live popularity. The new Places API (New) field masking helps control costs. Cache aggressively and respect the 30-day storage limit.

2. **Yelp Fusion API** — **Primary enrichment for North America** (US, Canada, Australia, parts of Western Europe). Use for review scores, review counts, photo URLs, and "transactions" filtering (identifies delivery/reservation-enabled restaurants). Budget for paid tier after launch.

### Tier 2: Regional & Social Proof (Should-Have)

3. **TheFork API** — **Essential for European destinations**. Replace or supplement OpenTable in France, Italy, Spain, Benelux, Scandinavia. The full menu extraction and discount/promotion data are unique differentiators. The Michelin/Gault & Millau ratings add luxury positioning.

4. **Tripadvisor Content API** — **Essential for tourist destinations**. Use for traveler reviews, rankings, and awards. The traffic-back requirement is acceptable for a marketplace that already sends users to partner booking sites. Limit to 5 reviews/5 photos per restaurant.

5. **OpenTable API** — **Primary reservation integration for North America, UK, Australia, Japan**. Use Affiliate API for deep links and Single Search API for availability checks. Note UX friction (users must complete booking on OpenTable).

### Tier 3: Enrichment & Specialization (Nice-to-Have)

6. **Foursquare Places API** — Use for **taste tags, popular hours, and tip content** in high-value urban destinations. The 500-call free tier is too small for broad use; budget for Premium endpoint costs at scale. Best for featured restaurants or curated lists.

7. **Spoonacular API** — Use for **nutrition analysis, allergen detection, and cuisine classification** from menu text. Enable "dietary preference" filters (vegan, keto, gluten-free) on restaurant listings. The 3,000-request free tier is generous for startup testing.

8. **Geoapify Places API** — Use as a **budget fallback** for restaurant discovery in markets where Google Places is too expensive. The permissive license allows building a persistent database. Good for secondary cities and off-the-beaten-path destinations.

### Tier 4: Scraping & Backfill (Use with Caution)

9. **DataForSEO Google Reviews API** — Use for **bulk review analysis** (sentiment, keyword extraction) at $75 per million reviews. Do not display raw reviews publicly without legal review.

10. **Apify Restaurant Review Aggregator** — Use for **competitive intelligence and market research** only. Extracting full review text from multiple platforms carries legal and GDPR risks for public display.

11. **Apify AI Menu Scraper** — Use for **backfilling menu data** for restaurants not covered by Google Places menus. Run as a batch job, not real-time.

---

## Footnotes & Citations

[^1]: Claim: Yelp commercial API pricing starts at ~$229/mo for 1,000 calls/day. Source: TechCrunch / Slashdot. URL: https://tech.slashdot.org/story/24/08/05/2054224/yelps-lack-of-transparency-around-api-charges-angers-developers. Date: 2024-08-05. Confidence: Medium.

[^2]: Claim: Foursquare free tier reduced to 500 Pro calls/mo starting June 1, 2026. Premium endpoints (photos, tips, hours, ratings) have no free tier. Source: Foursquare Developer Docs / Camino AI. URL: https://docs.foursquare.com/developer/reference/upcoming-changes. Date: 2026-02-12. Confidence: High.

[^3]: Claim: Spoonacular free tier offers 3,000 requests/month via API Layer marketplace. Source: API Layer / Spoonacular. URL: https://apilayer.com/marketplace/spoonacular-api. Date: 2026-06-13. Confidence: High.

[^4]: Claim: Zomato free tier offers 1,000 API requests/day, max 20 records per search. Source: Indie Hackers / 3i Data Scraping. URL: https://www.indiehackers.com/post/how-to-extract-restaurant-menu-data-using-the-zomato-api-602dc70d75. Date: 2025-05-28. Confidence: Medium.

[^5]: Claim: Resy covers ~25,000 venues across 1,900+ cities, API access included in Full-Stack plan ($899/mo). Source: Assay / AltexSoft. URL: https://assay.tools/packages/resy-api. Date: 2026-03-07. Confidence: Medium.

[^6]: Claim: Geoapify free plan includes 3,000 credits/day (~90,000/mo), allows storage and redistribution. Source: Geoapify. URL: https://www.geoapify.com/places-api/. Date: 2026-05-05. Confidence: High.

[^7]: Claim: Apify Restaurant Review Aggregator scrapes 6 platforms (Tripadvisor, Yelp, Google Maps, Facebook, DoorDash, UberEats) and supports 1,600+ reviews on free tier. Source: Apify. URL: https://apify.com/tri_angle/restaurant-review-aggregator. Date: 2026-05-27. Confidence: High.

[^8]: Claim: DataForSEO Google Reviews API costs $0.00075 per 10 reviews (standard queue). Source: DataForSEO. URL: https://dataforseo.com/pricing/business-data/google-reviews-api. Date: 2024-11-05. Confidence: High.

[^9]: Claim: Google Places API (New) supports structured menu data retrieval via Place Details with Business Menus field mask. Source: Foodspark / Master Concept. URL: https://www.foodspark.io/fetch-restaurant-menus-using-google-api/. Date: 2026-01-29. Confidence: High.

[^10]: Claim: Google Places API free tier changed to per-SKU caps in March 2025: 10K Essentials, 5K Pro, 1K Enterprise. No pooled $200 credit. Source: SafeGraph / Google Maps Platform docs. URL: https://www.safegraph.com/guides/google-places-api-pricing/. Date: 2026-06-02. Confidence: High.

[^11]: Claim: Google Places API pricing tiers: Basic $32/CPM, Advanced $35/CPM, Preferred $40/CPM. Source: Master Concept. URL: https://masterconcept.ai/learning-articles/google-maps-platform-2/building-a-restaurant-search-app-with-the-google-maps-places-api/. Date: 2026-01-02. Confidence: High.

[^12]: Claim: Yelp Fusion API covers 32 countries, provides business search, details, and 3 review snippets per business. Source: API Spine / Yelp Developer Docs. URL: https://apispine.com/yelp/sdks. Date: 2026-05-29. Confidence: High.

[^13]: Claim: Yelp Fusion rate limits: Starter Plan 300 calls/day, daily reset at midnight UTC. Source: Yelp Developer Docs. URL: https://docs.developer.yelp.com/docs/places-rate-limiting. Date: 2024-03-28. Confidence: High.

[^14]: Claim: Yelp Places API (successor to Fusion) offers Base, Enhanced, Premium tiers with per-1,000-call billing. Source: Yelp Data Licensing. URL: https://business.yelp.com/data/products/fusion/. Date: 2026-03-30. Confidence: High.

[^15]: Claim: Tripadvisor Content API free for approved B2C partners, 1,000 calls/day (dev), 10,000 calls/day (live). Source: Elfsight / Tripadvisor Developer. URL: https://elfsight.com/blog/how-to-get-tripadvisor-api-key/. Date: 2026-05-20. Confidence: High.

[^16]: Claim: Tripadvisor is developing new Terra API platform. Source: Tripadvisor Content API ReadMe. URL: https://tripadvisor-content-api.readme.io/reference/overview. Date: 2022-04-14. Confidence: Medium.

[^17]: Claim: OpenTable API requires partner approval (3–4 weeks), reservation links redirect to OpenTable. Source: Elfsight / OpenTable Support. URL: https://elfsight.com/blog/how-to-get-and-use-opentable-api/. Date: 2026-05-20. Confidence: High.

[^18]: Claim: OpenTable charges restaurants $1.50 per network cover, $0.25–$1.00 per direct booking. Source: Restaurants for Kings. URL: https://restaurantsforkings.com/blog/opentable-vs-resy-restaurant-booking-2026.html. Date: 2025-07-19. Confidence: Medium.

[^19]: Claim: Unofficial OpenTable API at opentable.heroku.com/api exists but is unmaintained. Source: GitHub Gist. URL: https://gist.github.com/3531613. Date: 2012-08-30. Confidence: High.

[^20]: Claim: TheFork B2B API provides full menus, reviews, availability, Michelin stars, and Gault & Millau ratings across 12 European countries. Source: Apify / TheFork Scraper. URL: https://apify.com/jdtpnjtp/thefork-restaurant-scraper-advanced. Date: 2026-05-03. Confidence: High.

[^21]: Claim: TheFork API rate limits enforced per contract; global API versioning with 6-month deprecation window. Source: TheFork Developers Portal. URL: https://docs.thefork.io/B2B-API/introduction. Date: 2026-06-13. Confidence: High.

[^22]: Claim: TheFork shut down Australian operations in March 2024. Source: Delicious.com.au. URL: https://www.delicious.com.au/food-files/article/fork-restaurant-booking-platform-close-australia/m1yjf5z1. Date: 2024-10-21. Confidence: High.

[^23]: Claim: Spoonacular API covers 100,000+ menu items, 800,000 food products, with nutrition, allergen, and diet classification. Source: Spoonacular / API Layer. URL: https://spoonacular.com/food-api/docs. Date: 2026-06-13. Confidence: High.

[^24]: Claim: Spoonacular free tier limited to 150 requests/day on some channels; 3,000/mo via API Layer. Source: XScanHub. URL: https://www.xscanhub.com/zh-CN/apis/spoonacular-com. Date: 2026-05-12. Confidence: Medium.

[^25]: Claim: Resy OS pricing ranges from $249 to $899/mo depending on features. API access in Full-Stack plan. Source: AltexSoft / Resy vs OpenTable comparison. URL: https://www.altexsoft.com/blog/online-restaurant-reservation-landscape-location-discovery-table-booking-delivery-and-reviews/. Date: 2022-05-28. Confidence: Medium.

[^26]: Claim: Resy CLI and MCP servers use unofficial/reverse-engineered API endpoints from browser dev tools. Source: GitHub (lgrees/resy-cli, jrklein343-svg/restaurant-mcp). URL: https://github.com/lgrees/resy-cli. Date: 2022-11-08. Confidence: High.

[^27]: Claim: Apify Resy Booker actor charges ~$0.03/search, $3.99/booking via unofficial MCP server. Source: Apify (clearpath/resy-booker). URL: https://apify.com/clearpath/resy-booker. Date: 2026-04-04. Confidence: High.

[^28]: Claim: Wolt Menu API provides structured menu data with categories, items, ingredients, allergens, nutrition, and weekly availability. Source: Wolt Developer Docs. URL: https://developer.wolt.com/docs/api/menu. Date: 2026-01-01. Confidence: High.

[^29]: Claim: Apify AI Restaurant Menu Scraper extracts menus from websites, PDFs, and images via OCR. Source: Apify (wedo_software/wedo-scrape-menu). URL: https://apify.com/wedo_software/wedo-scrape-menu. Date: 2026-05-24. Confidence: High.
