# Dimension 07: Event & Entertainment APIs

## Research Scope
Travel marketplace content providers offering APIs for **live events** (concerts, sports, theater, festivals), **local events and community happenings** at destinations, **event details** (dates, venues, ticketing, descriptions, images), and **entertainment/nightlife** that are accessible to developers.

**Research Date:** 2026-06-13
**Author:** Research Sub-Agent

---

## Executive Summary: Top 7 Providers for Traveloure

| Rank | Provider | API | Best For | Free Tier | Data Richness | Integration Complexity |
|------|----------|-----|----------|-----------|---------------|----------------------|
| 1 | **Ticketmaster** | Discovery API V2 | Major live events (concerts, sports, theater) globally | Free API key (generous quota) | High (dates, venues, images, price ranges, presales) | Easy (API key, JSON, SDKs) |
| 2 | **PredictHQ** | Events API | Demand intelligence + all event categories globally | Trial / custom pricing | Very High (19 categories, ranked impact, forecast-grade) | Moderate (OAuth2, ML models) |
| 3 | **SeatGeek** | Events API | Sports & mid-to-large venue events with pricing | Free API key | Moderate (event + avg pricing, no ticket listings) | Easy (API key, JSON) |
| 4 | **StubHub** | Developer API | Secondary ticket marketplace inventory + pricing | Partner approval required | High (real-time inventory, seat details, pricing) | Moderate (OAuth2, HAL+JSON) |
| 5 | **Bandsintown** | Public API + Partner Search API | Music events & concerts (artist/venue/city) | Free tier (app_id auth) | Moderate (artist, venue, datetime, ticket links) | Very Easy (no OAuth, CORS) |
| 6 | **Songkick** | API V3 | Music concerts & festivals (artist/venue/metro area) | API key (commercial sites apply) | Moderate (events, locations, artist details) | Easy (API key, JSON) |
| 7 | **Eventbrite** | REST API (v3) | Community events, workshops, local happenings | Free for free events; fees for paid | Moderate (event listings, organizer, venue) | Easy (OAuth2, JSON) |

*Honorable mentions:* **Viator** / **GetYourGuide** (tours & activities — covered in Dimension 01), **TicketSwap** (peer-to-peer resale, no public API), **Ticket Tailor** (white-label ticketing API), **EventBookings** (ticketing + public event DB).

---

## 1. Ticketmaster Discovery API V2

- **Provider name:** Ticketmaster / Live Nation Entertainment
- **API names:** Discovery API V2, Commerce API, Partner API, International Discovery API, Deals API, Publish API
- **Content type:** Concerts, sports, theater, festivals, family events, comedy, arts — all major live entertainment
- **Coverage:** US, Canada, Mexico, Australia, New Zealand, UK, Ireland, and other European countries. 230,000+ events across multiple ticket sources (Ticketmaster, Universe, FrontGate Tickets, Ticketmaster Resale)[^1]
- **Auth model:** API key (simple `apikey` query parameter), self-service via developer portal
- **Rate limits / free tier:** Free API key with generous quotas; exact rate limits not prominently published but designed for public developer access. Discovery API free for event search. Partner API requires enrollment in affiliate/partner program[^2]
- **Pricing:** Discovery API free for event discovery. Commerce API and Partner API require partnership agreements for ticketing transactions. Revenue-share models for affiliate ticket sales[^3]
- **Data format:** JSON with hypermedia affordances (HAL-like links)
- **SDK availability:** No official SDKs but REST is straightforward; community wrappers exist for Python, Node.js, etc.
- **Integration complexity:** Easy. Simple API key auth, well-documented endpoints, API Explorer console available. Location-based search, date-range filtering, pagination, sorting, classifications all supported[^1]
- **Real-time vs cached:** Real-time event data sourced from multiple ticketing platforms. Discovery feed also available as bulk CSV/XML/JSON downloads for offline sync[^2]
- **Ticketing integration:** Discovery = discovery only. Commerce API returns ticket offers and prices. Partner API enables full cart creation, checkout, payment, and ticket delivery workflows for approved partners[^2]
- **Attribution requirements:** Standard Ticketmaster branding/terms; must link to Ticketmaster for ticket purchases unless using Partner API
- **URL:** https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/

**Key insight:** The **gold standard** for live event discovery. No other provider matches the breadth of major events across the US, Canada, UK, AU, and EU. A travel marketplace should use this as the **primary event feed** for top-tier destinations. The free Discovery API is genuinely accessible; only monetization (booking) requires partnership approval. The JSON includes `priceRanges`, `images`, `venues`, `classifications`, and `presales` — all critical for destination pages.

---

## 2. PredictHQ Events API

- **Provider name:** PredictHQ Ltd (New Zealand)
- **API name:** Events API (demand intelligence platform)
- **Content type:** 19 major event categories: concerts, sports, festivals, conferences, expos, performing arts, community events, public holidays, severe weather, school holidays, and more[^4]
- **Coverage:** Global — 30,000 cities, nearly 20 million events, 2+ billion data points processed from hundreds of sources. Used by Uber, Booking.com, Domino's, Qantas, Amadeus[^5]
- **Auth model:** OAuth 2.0 standard; access tokens required
- **Rate limits / free tier:** No public free tier for production; trial/evaluation available. Pricing starts at ~$500/user/year for Basic plan; Enterprise custom[^6]
- **Pricing:** Subscription-based per user per year. Basic from $500/user/year. Pro and Enterprise tiers unlock more categories, deeper historical data, and advanced integrations. Amadeus offers PredictHQ data as an integrated layer in Altéa for airlines[^5]
- **Data format:** JSON
- **SDK availability:** Python and JavaScript SDKs available; also BI tool integrations (Power BI, Tableau)[^4]
- **Integration complexity:** Moderate. OAuth 2.0, versioned API, but well-documented. Requires understanding of event categories and demand ranking (e.g., Aviation Rank for airline demand impact). Supports geolocation radius, IATA codes, place names, and multi-category queries simultaneously[^4]
- **Real-time vs cached:** Real-time aggregated and verified data; machine learning-powered data validation with 99%+ accuracy claims. 7+ years of historical data available[^7]
- **Ticketing integration:** Discovery only — PredictHQ does not sell tickets. However, it predicts event impact and attendance, enabling dynamic pricing, staffing, and marketing timing for travel providers[^4]
- **Attribution requirements:** Standard PredictHQ terms
- **URL:** https://www.predicthq.com/ | https://docs.predicthq.com/

**Key insight:** The **only** provider that aggregates *all* event types (not just ticketed events) and ranks them by predicted demand impact. For a travel marketplace, this is uniquely valuable for **demand forecasting** — knowing *when* to promote a destination because a major festival or sports event is coming. It also covers unscheduled events (severe weather) and distributed events (holidays) that pure event APIs miss. However, the cost makes it a **premium intelligence layer**, not a free content feed. Best used in combination with Ticketmaster for the actual event listings.

---

## 3. SeatGeek API

- **Provider name:** SeatGeek Inc.
- **API name:** SeatGeek API (v2)
- **Content type:** Sports, concerts, theater, festivals — mid-to-large venues
- **Coverage:** Primarily US-focused; strong in sports and major metro areas. Secondary marketplace transactions
- **Auth model:** Client ID (self-service from developer platform)[^8]
- **Rate limits / free tier:** Free API key available; limits not prominently published
- **Pricing:** Free for event discovery data. Enterprise contracts for venues. Service fees per ticket on marketplace transactions
- **Data format:** JSON
- **SDK availability:** REST only; straightforward HTTP integration
- **Integration complexity:** Easy. Modern, well-documented API. Search by query, city, date range, performer. Returns event details, venue info, and average pricing stats[^8]
- **Real-time vs cached:** Real-time event data
- **Ticketing integration:** Discovery only via API. The API does **not** provide individual ticket listings or real-time seat inventory — only average pricing (`stats.average_price`). You cannot build a competing marketplace using their API per terms of service[^8]
- **Attribution requirements:** Standard SeatGeek terms
- **URL:** https://seatgeek.com/account/develop

**Key insight:** A **developer-friendly** alternative to Ticketmaster with a modern API. Best for US sports and concert data. The major limitation is that ticket inventory is *not* exposed — only average prices. Use SeatGeek as a **secondary US events source** or for its "Deal Score" algorithm data if available. For a travel marketplace, it adds value primarily for US destinations where Ticketmaster coverage may be incomplete.

---

## 4. StubHub Developer API

- **Provider name:** StubHub (eBay subsidiary)
- **API name:** StubHub API (catalog, inventory, sellers)
- **Content type:** Concerts, sports, theater — all secondary-market ticket events
- **Coverage:** Global — world's largest ticket marketplace for live events
- **Auth model:** OAuth 2.0; all API requests must be authenticated over HTTPS[^9]
- **Rate limits / free tier:** Partner approval required; no self-service free tier. Pay-per-use model for approved developers[^10]
- **Pricing:** Pay-per-use or enterprise contracts. Tailored pricing discussions required
- **Data format:** `application/hal+json` (JSON with hyperlinks)[^9]
- **SDK availability:** REST only; community code examples (Python, etc.)
- **Integration complexity:** Moderate. OAuth2 token flow, HAL+JSON format requires parsing `_links` and embedded resources. Supports CORS for client-side web apps. Endpoints cover event catalog search, inventory search (v2), listing creation/management, and order management[^9]
- **Real-time vs cached:** Real-time inventory updates for ticket listings. Inventory search API returns live ticket listings with seat details, quantities, and current prices[^11]
- **Ticketing integration:** **Full booking integration possible.** Approved partners can search inventory, create listings, and complete purchases. This is a true marketplace API, unlike Discovery-only APIs[^9]
- **Attribution requirements:** Standard StubHub partner terms
- **URL:** https://developer.stubhub.com/

**Key insight:** The **only major API** that exposes real-time secondary-market ticket inventory with seat-level detail (section, row, price, quantity). For a travel marketplace, this is powerful if you want to show users *actual available tickets* for events at their destination — not just that an event exists. The barrier is the **partner approval process** and OAuth2 complexity. Best for Phase 2+ when you have event discovery working and want to add ticket availability/conversion.

---

## 5. Bandsintown API

- **Provider name:** Bandsintown (Live Nation / Songkick competitor)
- **API names:** Public API (v3.0) + Partner Search API
- **Content type:** Music events — concerts, festivals, live shows
- **Coverage:** Global, with strong focus on touring artists and live music venues. 6M+ artists tracked
- **Auth model:** Public API uses `app_id` parameter (register for free). Partner Search API uses OAuth2 or API key[^12]
- **Rate limits / free tier:** Free tier available. Generous rate limits for most use cases. Parse.bot marketplace offers tiers: Free ($0/mo, 100 credits, 5 req/min), Hobby ($30/mo, 1,000 credits, 20 req/min), Developer ($100/mo, 5,000 credits, 250 req/min)[^13]
- **Pricing:** Free for basic usage. Partner Search API may require commercial agreement for high volume
- **Data format:** JSON
- **SDK availability:** Official Ruby gem (`api-gem`). Community SDKs for PHP, Python, etc.[^14]
- **Integration complexity:** **Very Easy.** The Public API requires only an `app_id` — no OAuth. CORS enabled for browser requests. Endpoints for artist events, venue events, city events, and search by genre/date. Returns datetime, venue with lat/lng, ticket URLs, lineup, and artist images[^12]
- **Real-time vs cached:** Real-time data sourced from artist managers, venues, and ticketing partners
- **Ticketing integration:** Discovery only — API returns `offers` array with ticket URLs and availability status (`available`, `sold_out`), but transactions happen on external sites
- **Attribution requirements:** Standard Bandsintown terms; links should use `app_id` tracking parameters
- **URL:** https://artists.bandsintown.com/support/partner-search-api/ | https://app.swaggerhub.com/apis/Bandsintown/PublicAPI/3.0.0

**Key insight:** The **easiest music event API** to integrate. No OAuth, CORS-friendly, generous free tier, and rich artist/venue data. Perfect for travel marketplaces targeting music tourism (e.g., "Concerts in Nashville this weekend" or "Festival season in Barcelona"). The `venue` object includes latitude/longitude, making map-based discovery trivial. Use this as the **primary music event feed** for any destination.

---

## 6. Songkick API

- **Provider name:** Songkick (Warner Music Group)
- **API name:** Songkick API (v3.0)
- **Content type:** Music concerts, festivals, and live events
- **Coverage:** Global. Millions of artists and venues worldwide. Strong metro-area coverage for city-based discovery[^15]
- **Auth model:** API key via query parameter (`apikey=...`). Commercial websites must apply for their own key[^16]
- **Rate limits / free tier:** API key required. Rate limits vary by tier; commercial sites must apply. Non-commercial websites could use a shared WordPress plugin key historically, but this is discouraged for production[^16]
- **Pricing:** Free for non-commercial/low-volume use. Commercial use requires API key approval; pricing not publicly standardized
- **Data format:** JSON
- **SDK availability:** REST only; community wrappers (WordPress plugin, PHP, etc.)
- **Integration complexity:** Easy. Simple API key in URL. Endpoints for events by artist, venue, metro area, or user. Supports `artist_name` search, `min_date`/`max_date` filters, and pagination. Response includes `displayName`, `location` (city, country), `start` (datetime), and `venue`[^15]
- **Real-time vs cached:** Real-time data from artist/venue/promoter feeds
- **Ticketing integration:** Discovery only — links to external ticketing via Songkick's platform
- **Attribution requirements:** Attribution to Songkick; must link to Songkick event pages
- **URL:** https://www.songkick.com/developer/

**Key insight:** Songkick is the **original music event API** and still has excellent global coverage for concerts and festivals. The metro area endpoint is particularly useful for travel — just pass a city ID and get all upcoming music events. The API is simpler than Bandsintown but less feature-rich (no artist images, social links, or ticket status in the basic response). Good as a **fallback or cross-reference** for music events, especially in Europe where Songkick has deep roots.

---

## 7. Eventbrite API (v3)

- **Provider name:** Eventbrite Inc.
- **API name:** Eventbrite REST API (v3)
- **Content type:** Community events, workshops, classes, local happenings, professional conferences, some concerts and festivals (user-generated)
- **Coverage:** Global, but strongest in US, UK, and major metros. Events are organizer-created, so coverage varies by city
- **Auth model:** OAuth 2.0 or personal API key (organizer token)[^17]
- **Rate limits / free tier:** Rate limits are not prominently published but exist. The platform itself is free to publish events; paid events incur fees (3.7% + $1.79/ticket + 2.9% processing as of 2026)[^17]
- **Pricing:** Free API access for reading public events. No API fees — the platform monetizes through ticket processing on paid events. Pro plans ($15–$100/mo) add marketing email capacity but do not reduce ticket fees[^17]
- **Data format:** JSON
- **SDK availability:** Official Python SDK (`eventbrite-sdk-python`), community wrappers
- **Integration complexity:** Easy–Moderate. OAuth2 for private organizer data; public events can be queried with simpler auth. Endpoints for event search, event details, venue info, organizer info, ticket classes, and orders. Supports location-based search (within N km of lat/lng), category filtering, and date ranges[^18]
- **Real-time vs cached:** Real-time event data created by organizers
- **Ticketing integration:** Full ticketing platform — can read ticket classes, pricing, and availability. For third-party sales, Eventbrite offers affiliate deep links and embeddable widgets[^18]
- **Attribution requirements:** Standard Eventbrite terms; must link to Eventbrite for ticket purchases
- **URL:** https://www.eventbrite.com/platform/api/

**Key insight:** The **best source for community and local events** that Ticketmaster misses — cooking classes, walking tours, startup meetups, wine tastings, yoga retreats. These are the *experiential* happenings that make a destination feel alive. For a travel marketplace, Eventbrite fills the **mid-tier event gap** between major concerts (Ticketmaster) and formal tours (Viator). The free read access to public events is a genuine advantage. However, data quality is uneven because events are user-generated.

---

## 8. Ticket Tailor API (Honorable Mention — Ticketing Platform)

- **Provider name:** Ticket Tailor Ltd
- **API name:** Ticket Tailor API
- **Content type:** Event ticketing and management (any organizer-created event)
- **Coverage:** Global (white-label platform used by independent organizers)
- **Auth model:** API key (self-service, multiple keys allowed)
- **Rate limits / free tier:** 99.99% uptime claimed. Generous rate limits; 10M+ API requests/year serviced[^19]
- **Pricing:** Free for event creation/management; ticketing fees per ticket sold (not API fees)
- **Data format:** JSON
- **SDK availability:** REST only; webhook-enabled
- **Integration complexity:** Easy. Webhook-enabled, well-structured REST API. Endpoints for events, ticket types, orders, issued tickets, discount codes, and attendee details. Designed for third-party app integrations[^19]
- **Real-time vs cached:** Real-time
- **Ticketing integration:** Full ticketing platform API — create tickets, manage orders, issue digital tickets, validate at entry
- **Attribution requirements:** White-label; no Ticket Tailor branding required (key advantage)
- **URL:** https://www.tickettailor.com/ticketing-api/

**Key insight:** Not a content source for *discovering* events, but a **white-label ticketing infrastructure** if Traveloure wants to sell its own event tickets (e.g., exclusive marketplace experiences, partner-hosted tours). The white-label nature is unique — no forced branding. Consider this for a **future "Traveloure Originals" events program** rather than general event discovery.

---

## 9. TicketSwap (Honorable Mention — No Public API)

- **Provider name:** TicketSwap BV (Netherlands)
- **Content type:** Peer-to-peer ticket resale for concerts, festivals, sports
- **Coverage:** 36 countries, 6,000+ events, 6M+ customers. Strong in Europe (Netherlands, Belgium, Germany, UK, Spain, Ireland)[^20]
- **Auth model:** No public API. Scraper-based access only (Apify actors exist, but not official)[^21]
- **Rate limits / free tier:** N/A (no API)
- **Pricing:** N/A
- **Data format:** N/A
- **SDK availability:** N/A
- **Integration complexity:** Hard (would require scraping or unofficial methods)
- **Real-time vs cached:** N/A
- **Ticketing integration:** Peer-to-peer resale with SecureSwap technology (unique ticket reissued on purchase)
- **Attribution requirements:** N/A
- **URL:** https://www.ticketswap.com/

**Key insight:** TicketSwap is a **fast-growing European resale platform** with fair pricing and anti-scam tech. Worth monitoring for future partnership/API opportunities, but not currently integrable as a data source. If Traveloure scales in Europe, a direct integration partnership could be valuable for sold-out event coverage.

---

## 10. Viator / GetYourGuide (Cross-Reference — Tours & Activities)

These providers are covered in **Dimension 01 (Destination & POI Content APIs)** but are directly relevant to "things to do" at destinations:

- **Viator API:** 300,000+ tours and activities in 2,500+ destinations. Affiliate API with Basic, Full, and Full+Booking access tiers. 8–12% commission. Tripadvisor subsidiary[^22]
- **GetYourGuide API:** 33,000+ activities in 2,500+ destinations. Real-time availability, pricing, booking/cancellation data. RESTful, SSL-secured, API token auth. Partner program with ~20–30% commission[^23]

Both should be considered alongside event APIs for a complete "experiences" layer on destination pages.

---

## Comparison Matrix: All Event & Entertainment APIs

| Provider | Concerts | Sports | Theater | Festivals | Community | Nightlife | Global | US | EU | Auth | Free Tier | Ticket Inventory | SDKs | Tourism Fit |
|----------|----------|--------|---------|-----------|-----------|-----------|--------|-----|-----|------|-----------|------------------|------|-------------|
| Ticketmaster | Yes | Yes | Yes | Yes | Some | Some | Yes | Strong | Strong | API key | Yes | Via Partner API | Community | **Very High** |
| PredictHQ | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | OAuth2 | Trial | No | Python, JS | **Very High** |
| SeatGeek | Yes | Yes | Yes | Yes | No | No | Partial | Strong | Weak | API key | Yes | No (avg only) | None | High |
| StubHub | Yes | Yes | Yes | Yes | No | No | Yes | Strong | Moderate | OAuth2 | Partner | Yes (full) | None | High |
| Bandsintown | Yes | No | No | Yes | No | No | Yes | Yes | Yes | app_id | Yes | Links only | Ruby, PHP | **Very High** |
| Songkick | Yes | No | No | Yes | No | No | Yes | Yes | Yes | API key | Yes | Links only | None | **Very High** |
| Eventbrite | Some | Some | Some | Some | Yes | Some | Yes | Strong | Moderate | OAuth2 | Yes | Via platform | Python | High |
| Ticket Tailor | Any | Any | Any | Any | Yes | Yes | Yes | Yes | Yes | API key | Yes | Full platform | None | Moderate |
| TicketSwap | Yes | Yes | Yes | Yes | No | No | Partial | Weak | Strong | N/A | N/A | Resale | None | Low (no API) |
| Viator | No | No | No | No | No | No | Yes | Yes | Yes | Partner | Commission | Yes | REST | **Very High** |
| GetYourGuide | No | No | No | No | No | No | Yes | Yes | Yes | Partner | Commission | Yes | REST | **Very High** |

---

## Strategic Recommendations for Traveloure

1. **Primary live event feed (major):** Integrate **Ticketmaster Discovery API V2** as the foundational event data source. It covers the most important event types (concerts, sports, theater, festivals) across Traveloure's initial markets (US, CA, UK, AU, EU). The free API key model means zero cost to start. Use it to populate destination pages with "What's On" sections.

2. **Music event specialization:** Add **Bandsintown Public API** for music-specific discovery. Its zero-friction `app_id` auth, CORS support, and rich artist/venue data make it the easiest way to show "Concerts in [City] this weekend." Cross-reference with **Songkick** for European music festivals where Songkick may have better coverage.

3. **Community & local event layer:** Use **Eventbrite API** for the "local flavor" — workshops, food events, meetups, and smaller happenings that Ticketmaster ignores. This makes a destination page feel authentic and up-to-date. Filter by location radius and category to surface only tourism-relevant events.

4. **Demand intelligence & forecasting:** Evaluate **PredictHQ** for a **premium tier** when Traveloure wants to move beyond "show events" to "predict demand surges." PredictHQ's ranked event impact data enables dynamic pricing suggestions, "book now before it sells out" urgency messaging, and proactive marketing. Start with a trial; invest only after proving conversion lift.

5. **Ticket inventory & conversion (Phase 2+):** Apply for **StubHub Developer API** or **Ticketmaster Partner API** when ready to show *actual available tickets* and prices, not just event listings. This turns event discovery into a revenue stream. StubHub's secondary inventory is especially valuable for sold-out events. Both require partnership approval, so start the application process early.

6. **Tours & activities integration:** Continue leveraging **Viator** and **GetYourGuide** (Dimension 01) for structured, bookable experiences. These complement event APIs perfectly — a user sees "Hamilton is playing on Broadway" (Ticketmaster) and "Broadway backstage tour" (Viator) on the same page.

7. **Avoid scraping:** Do not build scrapers for Ticketmaster, SeatGeek, or StubHub. All three employ advanced anti-bot protection (Akamai, CAPTCHA, queue systems) and scraping violates terms of service. Use the official APIs only[^24].

---

## Citations

[^1]: LobeHub Skills Marketplace. "Ticketmaster Discovery API Skill." 15 May 2026. https://lobehub.com/skills/aeonbridge-ab-anthropic-claude-skills-ticketmaster (230K+ events across US, CA, MX, AU, NZ, UK, IE, Europe; data sources include Ticketmaster, Universe, FrontGate, TMR).

[^2]: Ticketmaster Developer Portal. "Partner API — API Launch Guide." https://developer.ticketmaster.com/products-and-docs/apis/partner/ (channel partner workflow: Discovery → Inventory → Cart → Payment → Delivery; Discovery Feed available in CSV/XML/JSON).

[^3]: SportsFirst. "Ticketmaster API Integration for Sports Event Ticketing." https://www.sportsfirst.net/sportsapi/ticketmaster-api (pay-per-use model, event data, inventory management, purchase/checkout, seat maps).

[^4]: PredictHQ. "Events API for Travel." https://www.predicthq.com/events/travel (multiple data streams in one API; concerts, festivals, sports, holidays; location radius, IATA codes, place names; Python and JS SDKs; OAuth 2.0).

[^5]: Travel Daily Media. "PredictHQ and Amadeus partnership: 'Improving event visibility has been a goal of airlines for decades.'" 29 Nov 2022. https://www.traveldailymedia.com/predicthq-and-amadeus-partnership-improving-event-visibility-has-been-a-goal-for-airlines-for-decades/ (Uber, Qantas, Domino's, Booking.com, Amadeus Altéa as customers; 2B data points, 20M events, 30K cities).

[^6]: PricingNow. "PredictHQ Pricing 2026." 22 Dec 2025. https://pricingnow.com/question/predicthq-pricing/ (Basic $500/user/year, Pro varies, Enterprise custom; 19 event categories).

[^7]: PredictHQ. "Eventful API terminated — Use PredictHQ instead." https://www.predicthq.com/events/eventful-api (7+ years historical data; 99%+ data accuracy; all ticketed events + 12 more event types).

[^8]: RoundProxies. "How to Scrape SeatGeek in 2026." 3 Nov 2025. https://roundproxies.com/blog/scrape-seatgeek/ (official API uses client_id; search by q, venue.city, datetime_utc.gte; returns average_price but no ticket listings; cannot display ticket listings on behalf of other sellers per terms).

[^9]: StubHub Developer Portal. "Introduction | StubHub API." https://developer.stubhub.com/docs/overview/introduction/ (all access over HTTPS from api.stubhub.net; application/hal+json; CORS supported; OAuth2 required for all requests; event search, inventory, listing, purchase).

[^10]: SportsFirst. "StubHub API Integration for Sports Ticket Resale Apps." https://www.sportsfirst.net/sportsapi/stubhub-api (pay-per-use model; event data, inventory management, purchase/checkout, seat maps).

[^11]: Ozzie Liu. "Scraping 3rd-Party Ticket Prices Using StubHub's API." 21 Jun 2016 (updated 2017). https://ozzieliu.com/2016/06/21/scraping-ticket-data-with-stubhub-api/ (InventorySearch API v2 returns listing details: currentPrice, section, row, seatNumbers, quantity, listingId; EventSearchAPI returns eventDateLocal, eventDateUTC, venue, categories, description).

[^12]: Free APIs For You. "Bandsintown API Documentation." https://www.freeapisforyou.in/api/bandsintown (no authentication for Public API, HTTPS, CORS enabled, free pricing, REST API usable with any language).

[^13]: Parse.bot. "Bandsintown.com API — Artists, Events & Concerts." 20 Feb 2026 (updated May 2026). https://parse.bot/marketplace/11ac4662-194e-4b32-85e7-d4d9e54e75be/bandsintown-com-api (Free tier: $0/mo, 100 credits, 5 req/min; Hobby $30/mo 1,000 credits; Developer $100/mo 5,000 credits; X-API-Key header auth; official API at app.swaggerhub.com/apis/Bandsintown/PublicAPI/3.0.0).

[^14]: GitHub — TappNetwork/php-sdk-bands-in-town-api. https://github.com/TappNetwork/php-sdk-bands-in-town-api (PHP wrapper for Bands In Town public and search APIs; artist upcoming events, search by genre, physical events by date, last modified date filtering).

[^15]: PublicAPI.dev. "Songkick API Documentation." https://publicapi.dev/songkick-api (GET https://api.songkick.com/api/3.0/events.json?apikey=YOUR_API_KEY&artist_name=ARTIST_NAME; returns JSON with displayName, location, start datetime, venue).

[^16]: WordPress.org — Songkick Concerts and Festivals plugin. https://github.com/WPPlugins/songkick-concerts-and-festivals (requires own API key for commercial websites; apply at http://www.songkick.com/developer; supports metro area, venue, artist, user events).

[^17]: StackScored. "Event Management Pricing 2026: Cvent vs Bizzabo vs Eventbrite vs Splash vs Whova." 21 Apr 2026. https://www.stackscored.com/pricing/event-management/ (Eventbrite free events free + paid events 3.7% + $1.79/ticket + 2.9% processing + Pro Plan $15/month starting tier; Pro 2K $15, Pro 6K $50, Pro 10K $100).

[^18]: TicketsData. "Eventbrite API — Real-Time Ticket Data." 2 Apr 2026. https://ticketsdata.com/eventbrite-api (returns event_name, event_status, sales_status, is_free, currency, min/max ticket price, venue, organizer, sections with pricing and availability; not official Eventbrite API but structured access to public data).

[^19]: Ticket Tailor. "API-led event ticketing." 9 Feb 2024. https://www.tickettailor.com/ticketing-api/ (99.99% uptime, 10M+ API requests/year, webhook enabled, API key auth, endpoints for events, ticket types, orders, issued tickets, discount codes).

[^20]: Stripe Newsroom. "Supporting concert ticket sales with TicketSwap." 10 Nov 2021. https://stripe.com/newsroom/stories/ticketswap (nearly 6M customers; 6,000+ events in 36 countries; SecureSwap system; peer-to-peer ticketing).

[^21]: Apify. "StubHub Scraper — Events, Sports & Concert Tickets API." https://apify.com/benthepythondev/stubhub-scraper/api (access via Apify API programmatically; no official StubHub public API for open access).

[^22]: PHPTRAVELS. "Viator API Integration Guide Access Pricing Documentation and Setup." 30 Apr 2026. https://phptravels.com/blog/what-is-viator-api-how-it-works (300,000+ tours, 2,500+ destinations; 8–12% commission; not public — requires partner approval via Tripadvisor; Basic/Full/Full+Booking tiers).

[^23]: Vocal Media. "Travel Experiences Distribution Platforms: Top Travel APIs & White-Label Solutions." 28 Oct 2025. https://vocal.media/01/travel-experiences-distribution-platforms-top-travel-ap-is-and-white-label-solutions (GetYourGuide Partner API: real-time availability, pricing, booking/cancellation; ~20–30% commission; 33,000+ activities, 2,500+ destinations).

[^24]: Scraperly. "How to Scrape Ticketmaster in 2026." 1 Mar 2026. https://scraperly.com/scrape/ticketmaster (rated Hard 4/5; Akamai, Queue System, CAPTCHA; residential proxies recommended; "Use the public Discovery API for event and venue data.")
