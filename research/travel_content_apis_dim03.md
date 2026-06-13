# Dimension 03: Tours, Activities & Experiences APIs

**Research Date:** 2026-06-13  
**Scope:** APIs accessible to developers for tours, excursions, activities, experiences, events, and real-time availability/booking data.  
**Searches Conducted:** 15 independent web queries covering GetYourGuide, Viator, Tiqets, Klook, Amadeus, Ticketmaster, adventure/local APIs, and aggregator roundups.  

---

## Executive Summary — Top 7 Providers (Ranked by Marketplace Usefulness)

| Rank | Provider | Key Strength | Best For | Booking Model |
|------|----------|-------------|----------|---------------|
| 1 | **Viator Partner API v2** | 300K+ products, 4 access tiers, real-time availability, merchant-of-record option | Full-featured travel marketplace | Affiliate + Merchant |
| 2 | **Amadeus Tours & Activities API** | Self-service sign-up, free tier, aggregates 45+ platforms (Viator, GYG, Klook, Musement), REST/JSON | Rapid MVP -> enterprise scale | Referral/deep-link |
| 3 | **GetYourGuide Partner API** | Strong brand, 33K+ activities, 2,500 destinations, OpenAPI spec, SDK generators | Global content + booking | Affiliate + Merchant |
| 4 | **Tiqets Distributor API** | Museum/attraction specialist, real-time inventory, webhooks, Europe-focused | Attraction-led marketplaces | Distributor / API booking |
| 5 | **Musement (TUI) Partner API** | 1,000+ destinations, 70 countries, merchant + affiliate flows, white-label option | Multi-modal go-to-market | Merchant + Affiliate |
| 6 | **Ticketmaster Discovery API V2** | 230K+ events, free public API key, global coverage, strong events supplement | Events + entertainment layer | Discovery + Partner (ticket) |
| 7 | **Headout API** | Curated experiences, real-time integration, 15-30% commission range, strong in NA/Europe | Premium/exclusive experiences | Affiliate + API booking |

---

## 1. Viator Partner API v2

- **Provider name:** Viator (TripAdvisor-owned)  
- **API name:** Viator Partner API v2  
- **Content type:** Tours, activities, excursions, skip-the-line tickets, day trips, attraction passes  
- **Coverage:** Global — 2,500+ destinations, 300,000+ products  
- **Auth model:** API key (partner portal registration). Basic Access requires no pre-approval; Full/Full+Booking/Merchant require Viator authorization.  
- **Rate limits:** Not explicitly published in public docs; health monitoring available to partners.  
- **Pricing / commission:** Standard commission rate on affiliate referrals (30-day cookie). Merchant partners negotiate commercial terms.  
- **Data format:** REST JSON. Product summaries, detailed product data (descriptions, inclusions/exclusions, logistics, itineraries, photos, reviews), availability, pricing, bookings.  
- **SDK availability:** No official SDK; Postman collections and OpenAPI-style reference available. Bubble plugin exists for no-code.  
- **Integration complexity:** Basic Access = days; Full Access = 1-4 weeks; Merchant = up to 3 months.  
- **Real-time vs cached:** Full Access supports real-time availability & pricing. Ingestion model (bulk catalog) also supported.  
- **Attribution requirements:** Affiliate links must route through viator.com with tracking cookie; Viator handles customer service for affiliate bookings.  
- **URL to docs:** https://partnerresources.viator.com/travel-commerce/implementation/  

Claim: Viator offers four partner types: Affiliate (Basic), Affiliate (Full), Affiliate (Full + Booking), and Merchant. [^1]  
Source: Viator Partner Resources — Implementation Guide  
URL: https://partnerresources.viator.com/travel-commerce/implementation/  
Date: 2025-09-11  
Confidence: High  

Claim: The /products/search endpoint allows partners to filter and retrieve product summaries without maintaining a local catalog database. [^2]  
Source: Viator Partner Resources — New Product Search Capabilities  
URL: https://partnerresources.viator.com/travel-commerce/affiliate/search-api/  
Date: 2023-09-18  
Confidence: High  

---

## 2. GetYourGuide Partner API

- **Provider name:** GetYourGuide  
- **API name:** GetYourGuide Partner API  
- **Content type:** Tours, activities, skip-the-line tickets, cruises, adventure activities, museum passes  
- **Coverage:** 33,000+ activities in 2,500+ destinations globally  
- **Auth model:** SSL + API access token. Partner registration required.  
- **Rate limits:** Reactivation endpoint limited to 1,000 requests/hour/partner (429 if exceeded). [^3]  
- **Pricing / commission:** 8% affiliate commission (typical); merchant terms negotiated.  
- **Data format:** REST JSON (OpenAPI 3.0 spec published). Product listings, availability, pricing, booking, voucher/redemption flows.  
- **SDK availability:** OpenAPI generator CLI supports `typescript-node`, `go`, `ruby`, etc. from published spec. [^4]  
- **Integration complexity:** Affiliate widget = hours; API integration = weeks.  
- **Real-time vs cached:** Real-time inventory and pricing updates supported via API.  
- **Attribution requirements:** Affiliate program uses tracked links; minimum payout EUR 50 via bank transfer.  
- **URL to docs:** https://code.getyourguide.com/partner-api-spec/  

Claim: GetYourGuide publishes its Partner API OpenAPI specification on GitHub and supports automatic client generation. [^4]  
Source: GitHub — getyourguide/partner-api-spec  
URL: https://github.com/getyourguide/partner-api-spec  
Date: 2021-07-22 (spec updated through 2025)  
Confidence: High  

Claim: GetYourGuide affiliate program offers ~8% commission with EUR 50 minimum payout. [^5]  
Source: Way2Earning — GetYourGuide Affiliate Program 2026  
URL: https://www.way2earning.com/2026/05/getyourguide-affiliate-program/  
Date: 2026-05-30  
Confidence: Medium  

---

## 3. Amadeus Tours and Activities API

- **Provider name:** Amadeus (via MyLittleAdventure partnership)  
- **API name:** Tours and Activities API (Self-Service REST)  
- **Content type:** Tours, activities, attraction tickets, sightseeing, day trips, food tours, hop-on-hop-off  
- **Coverage:** 8,000+ destinations, 300,000+ unique activities; aggregates 45+ top platforms (Viator, GetYourGuide, Klook, Musement). [^6]  
- **Auth model:** OAuth2 client credentials (self-service portal).  
- **Rate limits:** 20 transactions/second per user (Test & Production) for Tours and Activities; 1 request every 50ms. [^7]  
- **Pricing / commission:** Free tier up to 200-10,000 requests/month depending on API; pay-as-you-go beyond (EUR 0.0008-EUR 0.025 per call). Enterprise = custom contract. [^8]  
- **Data format:** REST JSON. Activity ID, name, short description, geoCode, rating, pictures, bookingLink, price (currency + amount). Search by lat/lon/radius or bounding box. [^6]  
- **SDK availability:** Official Node.js, Python, Java SDKs (amadeus4dev on GitHub).  
- **Integration complexity:** Very low for MVP (self-service keys in minutes). Enterprise requires commercial onboarding.  
- **Real-time vs cached:** Search returns live aggregated data; booking occurs via deep-link to provider (not native booking).  
- **Attribution requirements:** Deep links to provider booking pages must be preserved.  
- **URL to docs:** https://developers.amadeus.com/self-service/category/destination-experiences/api-doc/tours-and-activities  

Claim: Amadeus Self-Service APIs offer a free tier with pay-as-you-go pricing and transparent usage limits. [^8]  
Source: PHPTravels — Amadeus Self-Service vs Enterprise API  
URL: https://phptravels.com/blog/amadeus-self-service-rest-api-vs-enterprise-rest-api  
Date: 2026-04-17  
Confidence: High  

Claim: The Tours and Activities API aggregates offers from over 45 activity platforms and deduplicates them algorithmically. [^6]  
Source: Amadeus for Developers — Destination Experiences Tutorial  
URL: https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/resources/destination-experiences/  
Date: Accessed 2026-06-13  
Confidence: High  

---

## 4. Tiqets Distributor API

- **Provider name:** Tiqets  
- **API name:** Tiqets Distributor API  
- **Content type:** Museum tickets, attraction tickets, guided tours, city experiences  
- **Coverage:** 4,500 products, 2,500 venues, 250 destinations across 50 countries; Europe is primary strength. [^9]  
- **Auth model:** API keys; certificate-based authentication for some integrations (X.509). [^10]  
- **Rate limits:** Not publicly specified; fair-use policy applies.  
- **Pricing / commission:** No cost to use the API. Partners must demonstrate ~200 orders/month to unlock Booking API eligibility. [^11]  
- **Data format:** REST JSON. Product catalogue, availability & pricing, booking flow (create/confirm/cancel), webhooks for booking changes.  
- **SDK availability:** No official SDK; Postman collection provided.  
- **Integration complexity:** Content/Availability APIs = quick start; Booking API requires performance review (~200 orders/month).  
- **Real-time vs cached:** Real-time availability and pricing; webhook notifications for booking changes/cancellations.  
- **Attribution requirements:** Standard affiliate/distributor terms; Tiqets handles customer issues for distributor bookings.  
- **URL to docs:** https://portals.tiqets.com/distributorapi/docs  

Claim: Tiqets Distributor API is available at no cost; Booking API eligibility requires ~200 orders/month. [^11]  
Source: Tiqets API Programme FAQ  
URL: https://www.tiqets.com/partner-program/blog/api-program/  
Date: 2026-05-06  
Confidence: High  

Claim: Tiqets Supplier API uses OpenAPI/Swagger documentation and supports certificate-based authentication for distributors. [^10]  
Source: GitHub — Tiqets/supplier-api  
URL: https://github.com/Tiqets/supplier-api  
Date: 2019-04-29  
Confidence: High  

---

## 5. Musement (TUI) Partner API

- **Provider name:** Musement (TUI Musement)  
- **API name:** Musement Partner API / PORTA (supplier-side)  
- **Content type:** Tours, attractions, museum tickets, food & wine experiences, nightlife, sports, music events  
- **Coverage:** 1,000+ destinations, 70 countries, 35,000+ bookable products. [^12]  
- **Auth model:** OAuth2 client credentials for PORTA (supplier API). Partner API uses token-based auth.  
- **Rate limits:** Not publicly specified.  
- **Pricing / commission:** Merchant partners act as merchant of record and handle taxes; affiliate partners use Musement/Stripe payment gateway.  
- **Data format:** REST JSON. Activity details, availability, cart creation, orders, post-booking management.  
- **SDK availability:** No official SDK; Express Gateway case study mentions JS-ready docs.  
- **Integration complexity:** Simple catalog browser = low; full booking = moderate. White-label and widget options also available.  
- **Real-time vs cached:** Real-time availability for API integrations; Reserve with Google integration exists.  
- **Attribution requirements:** Partner attribution via affiliate links or API-tracked bookings.  
- **URL to docs:** https://partner-api.musement.com/api/getting-started  

Claim: Musement partners can choose between merchant (no-payment flow, partner = merchant of record) or affiliate (payment flow via Musement/Stripe) integration types. [^13]  
Source: Musement Partner API — Getting Started  
URL: https://partner-api.musement.com/api/getting-started  
Date: 2026-01-15  
Confidence: High  

Claim: Musement is a Google Reserve with Google launch partner for tours and activities. [^12]  
Source: Musement press release  
URL: https://www.musement.com/us/musement-is-a-partner-for-the-launch-of-tours-and-activity-booking-via-reserve-with-google-p/  
Date: 2018-11-22 (ongoing relevance)  
Confidence: High  

---

## 6. Ticketmaster Discovery API V2

- **Provider name:** Ticketmaster  
- **API name:** Discovery API v2 + Discovery Feed + Partner API  
- **Content type:** Concerts, sports, theater, arts, family events, festivals  
- **Coverage:** 230,000+ events across US, CA, MX, UK, IE, AU, NZ, and 20+ European countries. [^14]  
- **Auth model:** API key query parameter (`apikey`) obtained free from developer portal.  
- **Rate limits:** Discovery API = 5 requests/second (production tools typically throttle to 4/sec). [^15]  
- **Pricing / commission:** Free for Discovery API. Partner API (ticketing) requires affiliate/partner program enrollment.  
- **Data format:** REST JSON. Events, attractions, venues, classifications (segment/genre/sub-genre), images, price ranges, on-sale dates. [^14]  
- **SDK availability:** No official SDK; multiple community wrappers (React, Node, Python).  
- **Integration complexity:** Very low — developer account created instantly, API key available immediately.  
- **Real-time vs cached:** Near real-time; feed refreshed regularly. Discovery Feed provides bulk country-level CSV/JSON dumps.  
- **Attribution requirements:** Affiliate program attribution required for monetized ticket links.  
- **URL to docs:** https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/  

Claim: Ticketmaster Discovery API provides access to 230,000+ events across 25+ countries with a free API key. [^14]  
Source: Ticketmaster Developer Portal / LobeHub Skills  
URL: https://developer.ticketmaster.com/products-and-docs/apis/getting-started/  
Date: 2025-12-15  
Confidence: High  

Claim: Rate limit for Discovery API is approximately 5 requests/second; safe integration targets 4/sec. [^15]  
Source: Apify — Ticketmaster API Event Scraper documentation  
URL: https://apify.com/primeparse/ticketmaster-api-event-scraper  
Date: 2025-12-20  
Confidence: High  

---

## 7. Headout API

- **Provider name:** Headout  
- **API name:** Headout Public API (v1/v2)  
- **Content type:** Curated attractions, live experiences, last-minute tickets, skip-the-line, sports hospitality  
- **Coverage:** Strong in Europe and North America; fastest growth in Middle East and APAC.  
- **Auth model:** API key in `Headout-Auth` header. Production keys prefixed `pk_`; test keys prefixed `tk_`. [^16]  
- **Rate limits:** Not publicly specified.  
- **Pricing / commission:** 15-30% commission on bookings; Headout Originals (proprietary) command premium margins. [^17]  
- **Data format:** REST JSON. Products, availability, bookings, categories.  
- **SDK availability:** No official SDK; GitHub docs repo available.  
- **Integration complexity:** Low-moderate. v2 requires auth for all calls; v1 has mixed open/auth endpoints.  
- **Real-time vs cached:** Real-time inventory and pricing; dynamic pricing supported.  
- **Attribution requirements:** Affiliate/partner program required; tracked via API keys.  
- **URL to docs:** https://github.com/headout/api-docs  

Claim: Headout API v2 mandates authentication for every call via `Headout-Auth` header. [^16]  
Source: Headout API Docs — Conventions/Basics  
URL: https://github.com/headout/api-docs/blob/master/conventions/basics.md  
Date: 2017-03-18 (still current)  
Confidence: High  

Claim: Headout commission range is 15-30% depending on partner exclusivity and volume. [^17]  
Source: Business Model Canvas Template — Headout  
URL: https://businessmodelcanvastemplate.com/blogs/how-it-works/headout-how-it-works  
Date: 2024-12-19  
Confidence: Medium  

---

## 8. Rezdy Agent API

- **Provider name:** Rezdy  
- **API name:** Rezdy Agent API + Supplier API + RezdyConnect API  
- **Content type:** Tours, activities, attractions, charters, shuttles, tickets  
- **Coverage:** 85+ countries, 45,000+ bookable options, 2,500+ operators. [^18]  
- **Auth model:** API key (query parameter or header) for Agent/Supplier; OAuth2 for RezdyConnect.  
- **Rate limits:** 100 calls/minute for Agent API. [^19]  
- **Pricing / commission:** SaaS subscription for suppliers ($0/month + 3% fee, or $99/month + 1.9% fee). Agents/resellers access commission-based rates. [^20]  
- **Data format:** REST JSON. Products, availability, bookings, categories, customers, companies.  
- **SDK availability:** No official SDK; dltHub Python pipeline scaffold available.  
- **Integration complexity:** Agent API = low (1-2 weeks). RezdyConnect = moderate (supplier-side).  
- **Real-time vs cached:** Real-time availability and booking confirmation. Webhooks supported.  
- **Attribution requirements:** Agent bookings tracked via API key; supplier branding preserved.  
- **URL to docs:** https://developers.rezdy.com/rezdyapi/index-agent.html  

Claim: Rezdy Agent API base URL is `https://api.rezdy.com/v1` and requires an API key per request. [^18]  
Source: dltHub — Rezdy Python API Docs  
URL: https://dlthub.com/context/source/rezdy  
Date: 2026-03-10  
Confidence: High  

Claim: Rezdy charges suppliers either $0/month + 3% booking fee or $99/month + 1.9% fee. [^20]  
Source: Rezdy — Booking Software Pricing  
URL: https://rezdy.com/booking-software/  
Date: 2024-12-23  
Confidence: Medium  

---

## 9. Bokun API

- **Provider name:** Bokun (TripAdvisor-owned)  
- **API name:** Bokun Channel Manager API + Booking API REST v1  
- **Content type:** Tours, activities, accommodations, rentals, experiences  
- **Coverage:** 10,000+ businesses worldwide; 2,600+ OTA connections.  
- **Auth model:** API Key + Secret for Channel Manager; OAuth for some flows.  
- **Rate limits:** Not publicly specified; enterprise-grade reliability claimed.  
- **Pricing / commission:** $199/month + 0.5-1.5% booking charge for enterprise API access. [^19]  
- **Data format:** REST JSON (Booking API) and gRPC (Channel Manager). Supports product search, availability, booking creation, edit, cancellation, pickup/dropoff, custom questions.  
- **SDK availability:** No official SDK.  
- **Integration complexity:** Channel Manager = moderate (2-4 weeks); Booking API = moderate.  
- **Real-time vs cached:** Real-time sync for channel manager connections; webhooks for booking events.  
- **Attribution requirements:** OTA branding and attribution rules apply per connection.  
- **URL to docs:** https://api-docs.bokun.dev/rest-v1  

Claim: Bokun Booking API supports complex booking modifications including pickup/dropoff changes, participant edits, date changes, and customized itineraries. [^21]  
Source: Bokun Developer Documentation — Edit Booking  
URL: https://bokun.dev/booking-api-rest/vU6sCfxwYdJWd1QAcLt12i/edit-booking/buUq9hthirHPRE32154qLu  
Date: 2022-04-07  
Confidence: High  

---

## 10. Klook Partner/Affiliate API

- **Provider name:** Klook  
- **API name:** Klook Affiliate Program (API access via partner/integration platforms)  
- **Content type:** Tours, attractions, local transport, food experiences, theme parks, unique experiences  
- **Coverage:** Global with especially strong coverage in Asia-Pacific (China, Japan, Singapore, Korea, Southeast Asia).  
- **Auth model:** Partner/affiliate registration; API access typically via integrator platforms (e.g., Technoheaven).  
- **Rate limits:** Not publicly specified.  
- **Pricing / commission:** 3-8% commission depending on product and campaign; $50 minimum payout. [^22]  
- **Data format:** REST JSON (via integrator/aggregator APIs).  
- **SDK availability:** No direct public SDK; accessible via B2B integration partners.  
- **Integration complexity:** Affiliate link = low; full API = moderate (requires commercial partnership).  
- **Real-time vs cached:** Real-time availability via API integrations; QR code e-vouchers supported.  
- **Attribution requirements:** Affiliate links tracked via Klook affiliate platform.  
- **URL to docs:** https://affiliate.klook.com/  

Claim: Klook affiliate commission ranges from 3% to 8% with a $50 minimum payout threshold. [^22]  
Source: Way2Earning — Klook Affiliate Program 2026  
URL: https://www.way2earning.com/2026/05/klook-affiliate-program/  
Date: 2026-05-05  
Confidence: Medium  

---

## 11. TourRadar API

- **Provider name:** TourRadar  
- **API name:** TourRadar Distribution API / Agent Marketplace  
- **Content type:** Multi-day organized adventures (3+ days), small group tours, river cruises, safaris, trekking, cultural immersion  
- **Coverage:** 50,000+ adventures, 2,500+ operators, all seven continents. [^23]  
- **Auth model:** Partner API keys (wholesale partners). Agent Marketplace requires no implementation.  
- **Rate limits:** Not publicly specified.  
- **Pricing / commission:** Affiliate = commission on booking via TourRadar.com; Wholesale/Direct = use own commercial agreements or TourRadar's rates. [^23]  
- **Data format:** REST JSON. Search, content, and booking APIs available.  
- **SDK availability:** No official SDK.  
- **Integration complexity:** Search & Content API = low; Booking API = moderate; White Label = very low (days).  
- **Real-time vs cached:** Prices/dates validated daily; not fully real-time for all operators.  
- **Attribution requirements:** Affiliate links required for referral model; wholesale partners keep bookings on-platform.  
- **URL to docs:** https://www.tourradar.com/distribution-api  

Claim: TourRadar's API is B2B, B2C, and B2B2C compatible and co-exists with other APIs. [^23]  
Source: TourRadar — Distribution API  
URL: https://www.tourradar.com/distribution-api  
Date: 2019-03-27  
Confidence: High  

---

## 12. G Adventures API

- **Provider name:** G Adventures  
- **API name:** G Adventures API  
- **Content type:** Adventure tours, small group travel, multi-day trips, expedition cruises  
- **Coverage:** 1,500+ tours across G Adventures, TruTravels, Just You, Travelsphere brands. [^24]  
- **Auth model:** API keys for sandbox and production. Secret keys (server-side) + publishable client keys (JS/mobile). Sherpa Agency Code unlocks booking resources. [^24]  
- **Rate limits:** Per-application limits tied to API keys; not publicly specified.  
- **Pricing / commission:** Travel agent/agency commissions negotiated; requires Sherpa Agency Code for booking access.  
- **Data format:** REST JSON. Tour dossiers, departures, accommodations, itineraries, images, booking resources, geographical data.  
- **SDK availability:** Python client library officially provided; other languages via REST.  
- **Integration complexity:** Public content = low; booking = moderate (requires agency approval).  
- **Real-time vs cached:** Sandbox refreshed weekly from live database; production is real-time.  
- **Attribution requirements:** Agency attribution required for bookings.  
- **URL to docs:** https://developers.gadventures.com/docs/  

Claim: G Adventures provides both secret API keys (server-side) and publishable client keys (for JS/mobile public resources), with a Python client library. [^24]  
Source: G Adventures API Documentation  
URL: https://developers.gadventures.com/docs/  
Date: Accessed 2026-06-13  
Confidence: High  

---

## 13. Expedia Rapid Activities API (Early Access)

- **Provider name:** Expedia Group  
- **API name:** Rapid Activities API  
- **Content type:** Activities, experiences, attractions, tours  
- **Coverage:** Global (Expedia inventory).  
- **Auth model:** Rapid API key (existing Expedia partner credentials).  
- **Rate limits:** Not publicly specified (early access).  
- **Pricing / commission:** Expedia partner commission structure.  
- **Data format:** REST JSON. End-to-end shopping flow: region mapping, activity discovery, availability/pricing, pre-booking price check, booking creation, itinerary retrieval.  
- **SDK availability:** Part of Rapid API suite; no dedicated Activities SDK yet.  
- **Integration complexity:** Moderate-high (follows Rapid API patterns).  
- **Real-time vs cached:** Real-time availability and pricing; booking token flow for confirmation.  
- **Attribution requirements:** Standard Expedia partner attribution.  
- **URL to docs:** https://developers.expediagroup.com/rapid/activities  

Claim: Expedia Rapid Activities API is in early access preview with pilot programs launching Q2 2026 and general availability in 2027. [^25]  
Source: Expedia Group Developer Hub — Rapid Activities API  
URL: https://developers.expediagroup.com/rapid/activities  
Date: Accessed 2026-06-13  
Confidence: High  

---

## 14. Trip.com Tours & Tickets Partner API

- **Provider name:** Trip.com (Ctrip)  
- **API name:** Tours & Tickets Partner API (2.0)  
- **Content type:** Attraction tickets, tours, activities, city passes  
- **Coverage:** Strong in Asia; expanding globally via Prioticket partnership.  
- **Auth model:** Partner API credentials (requires Trip.com developer group registration).  
- **Rate limits:** Not publicly specified.  
- **Pricing / commission:** Negotiated partner terms.  
- **Data format:** REST JSON. Product details, POI mapping, departure/destination cities, ticket types, service languages, refund policies, options, sessions/timeslots.  
- **SDK availability:** No official SDK.  
- **Integration complexity:** Moderate (requires pre-integration consultation and developer group access).  
- **Real-time vs cached:** Real-time inventory via supplier connection IDs.  
- **Attribution requirements:** Trip.com partner branding requirements.  
- **URL to docs:** http://ttdopen.ctrip.com/apiplatform/product_en.jsp  

---

## 15. Holibob GraphQL API

- **Provider name:** Holibob  
- **API name:** Holibob Partner API (GraphQL)  
- **Content type:** Tours, activities, experiences, food & wine, attractions  
- **Coverage:** Global supply via digitized offline operators and established in-destination products.  
- **Auth model:** Authorized partner credentials.  
- **Rate limits:** Not publicly specified.  
- **Pricing / commission:** Partner distribution model; Holibob acts as commercial/financial intermediary.  
- **Data format:** GraphQL. Product query, availability check, booking on behalf of consumers.  
- **SDK availability:** GraphQL native (any GraphQL client).  
- **Integration complexity:** Moderate (GraphQL expertise required).  
- **Real-time vs cached:** Real-time availability; testing against production system with Stripe test credentials in sandbox.  
- **Attribution requirements:** Partner program required.  
- **URL to docs:** https://www.holibob.tech/  

---

## 16. Bridgify API

- **Provider name:** Bridgify  
- **API name:** Bridgify Plug-and-Play API  
- **Content type:** 1M+ tours, activities, events, vouchers  
- **Coverage:** Global curated inventory.  
- **Auth model:** Partner API credentials.  
- **Rate limits:** Not publicly specified.  
- **Pricing / commission:** Partner revenue-share model.  
- **Data format:** REST JSON. Real-time pricing, availability, booking, cashback/voucher add-ons.  
- **SDK availability:** No official SDK.  
- **Integration complexity:** Low (plug-and-play positioning).  
- **Real-time vs cached:** Real-time.  
- **Attribution requirements:** Partner attribution.  
- **URL to docs:** https://www.bridgify.com/ (inferred from third-party coverage)  

---

## 17. Ventrata OCTO API

- **Provider name:** Ventrata  
- **API name:** Ventrata OCTO API (Open Connectivity for Tourism)  
- **Content type:** High-volume attraction, tour, and activity tickets  
- **Coverage:** Used by Big Bus Tours, City Sightseeing, Gray Line, Museum of Illusions, Fat Tire Tours, etc.  
- **Auth model:** OCTO standard API key.  
- **Rate limits:** Not publicly specified.  
- **Pricing / commission:** No fee for resellers working with Ventrata clients. [^26]  
- **Data format:** REST JSON (OCTO open standard). Supplier availability, pricing, scan-ready vouchers.  
- **SDK availability:** OCTO is an open standard; multiple implementations.  
- **Integration complexity:** Low-moderate (standardized schema reduces vendor-specific work).  
- **Real-time vs cached:** Real-time availability and digital vouchers.  
- **Attribution requirements:** Standard OCTO partner flow.  
- **URL to docs:** https://docs.octo.travel/  

Claim: Ventrata is a founding member of OCTO and offers free API access to resellers connecting to Ventrata client inventory. [^26]  
Source: Ventrata OCTO API Documentation  
URL: https://docs.ventrata.com/  
Date: 2026-02-16  
Confidence: High  

---

## Comparison Matrix

| Provider | Content | Coverage | Auth | Free Tier | Booking on Your Site | Real-Time Avail | SDK |
|----------|---------|----------|------|-----------|---------------------|-----------------|-----|
| Viator | Tours, activities, tickets | 300K+, 2.5K destinations | API key + approval | Basic Access free | Full+Booking / Merchant | Yes | No (Postman) |
| Amadeus | Aggregated tours/activities | 300K+, 8K destinations | OAuth2 | Yes (200-10K/mo) | Deep-link only | Yes | Yes (Node, Py, Java) |
| GetYourGuide | Tours, activities, tickets | 33K+, 2.5K destinations | API token | Affiliate free | Merchant option | Yes | OpenAPI generator |
| Tiqets | Museums, attractions | 4.5K products, 250 destinations | API key + cert | Content API free | Distributor API (~200/mo) | Yes | Postman |
| Musement | Tours, attractions, events | 35K+, 1K destinations, 70 countries | OAuth2 / token | Partner-dependent | Merchant + Affiliate | Yes | No |
| Ticketmaster | Events, concerts, sports | 230K+ events, 25+ countries | API key | Discovery API free | Partner API (enrollment) | Near-real | Community |
| Headout | Curated experiences | Europe, NA, ME, APAC | `Headout-Auth` header | Partner-dependent | Yes | Yes | No |
| Rezdy | Tours, activities | 45K+, 85 countries | API key | Agent access free | Yes | Yes | No |
| Bokun | Tours, activities, rentals | 10K+ businesses | API key + secret | Trial available | Yes | Yes | No |
| Klook | Tours, attractions, transport | Asia-Pacific strong | Partner/affiliate | Affiliate free | Via integrators | Yes | No |
| TourRadar | Multi-day adventures | 50K+ adventures, 2.5K operators | API key | Search & Content free | Wholesale API | Daily-validated | No |
| G Adventures | Adventure tours | 1,500+ tours | API key | Sandbox free | Requires agency code | Weekly sandbox | Python |
| Expedia Rapid | Activities | Global | Rapid API key | Early access | Yes (pilot) | Yes | No |
| Trip.com | Tickets, tours | Asia-strong | Partner credentials | No | Yes | Yes | No |
| Holibob | Tours, experiences | Global | Partner credentials | No | Yes | Yes | GraphQL |
| Bridgify | Tours, activities, events | 1M+ | Partner credentials | No | Yes | Yes | No |
| Ventrata OCTO | Attractions, tours | Operator network | OCTO API key | Reseller free | Yes | Yes | OCTO standard |

---

## Integration Recommendations for Traveloure

1. **Quick Win (MVP):** Start with **Amadeus Tours and Activities API** — self-service OAuth2, free tier, no commercial negotiation needed, covers 45+ suppliers in one integration. Use for search, discovery, and deep-link booking.  
2. **Revenue Layer:** Add **Viator Partner API** (Basic -> Full Access) for the deepest global catalog and proven conversion. Upgrade to Full+Booking or Merchant once volume justifies it.  
3. **Attraction Depth:** Integrate **Tiqets Distributor API** for museum/attraction ticket depth, especially in Europe.  
4. **Events Supplement:** Add **Ticketmaster Discovery API V2** for free, high-quality event content that complements tours and activities.  
5. **Asia-Pacific:** Evaluate **Klook** or **Trip.com** partnerships for regional coverage in Asia.  
6. **Adventure Niche:** If targeting multi-day/adventure travelers, add **TourRadar** or **G Adventures** APIs.  
7. **Future-Proofing:** Monitor **Expedia Rapid Activities API** for Q2 2026 pilot availability and **OCTO** standard adoption for reduced multi-supplier integration overhead.  

---

## Sources & Citations

[^1]: Viator Partner Resources — Implementation Guide. https://partnerresources.viator.com/travel-commerce/implementation/ (2025-09-11)  
[^2]: Viator Partner Resources — New Product Search Capabilities. https://partnerresources.viator.com/travel-commerce/affiliate/search-api/ (2023-09-18)  
[^3]: GetYourGuide Supply Support — API Features and Functionalities. https://supply.getyourguide.support/hc/en-us/articles/14150246193181 (2025-10-16)  
[^4]: GitHub — getyourguide/partner-api-spec. https://github.com/getyourguide/partner-api-spec (2021-07-22)  
[^5]: Way2Earning — GetYourGuide Affiliate Program 2026. https://www.way2earning.com/2026/05/getyourguide-affiliate-program/ (2026-05-30)  
[^6]: Amadeus for Developers — Destination Experiences Tutorial. https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/resources/destination-experiences/  
[^7]: Amadeus for Developers — API Rate Limits. https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/api-rate-limits/ (2026-04-20)  
[^8]: PHPTravels — Amadeus Self-Service vs Enterprise API. https://phptravels.com/blog/amadeus-self-service-rest-api-vs-enterprise-rest-api (2026-04-17)  
[^9]: AltexSoft — Travel APIs: Types, Providers and Integration. https://www.altexsoft.com/blog/travel-and-booking-apis-for-online-travel-and-tourism-service-providers/ (2025-04-09)  
[^10]: GitHub — Tiqets/supplier-api. https://github.com/Tiqets/supplier-api (2019-04-29)  
[^11]: Tiqets — API Programme FAQ. https://www.tiqets.com/partner-program/blog/api-program/ (2026-05-06)  
[^12]: Musement — Reserve with Google Partner Announcement. https://www.musement.com/us/musement-is-a-partner-for-the-launch-of-tours-and-activity-booking-via-reserve-with-google-p/ (2018-11-22)  
[^13]: Musement Partner API — Getting Started. https://partner-api.musement.com/api/getting-started (2026-01-15)  
[^14]: Ticketmaster Developer Portal — Discovery API. https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/  
[^15]: Apify — Ticketmaster API Event Scraper. https://apify.com/primeparse/ticketmaster-api-event-scraper (2025-12-20)  
[^16]: Headout API Docs — Conventions/Basics. https://github.com/headout/api-docs/blob/master/conventions/basics.md (2017-03-18)  
[^17]: Business Model Canvas Template — Headout. https://businessmodelcanvastemplate.com/blogs/how-it-works/headout-how-it-works (2024-12-19)  
[^18]: dltHub — Rezdy Python API Docs. https://dlthub.com/context/source/rezdy (2026-03-10)  
[^19]: GitHub — sandeepkumar0801/ToursAndActivities (Bokun/Rezdy reference). https://github.com/sandeepkumar0801/ToursAndActivities (2024-01-15)  
[^20]: Rezdy — Booking Software. https://rezdy.com/booking-software/ (2024-12-23)  
[^21]: Bokun Developer Documentation — Edit Booking. https://bokun.dev/booking-api-rest/vU6sCfxwYdJWd1QAcLt12i/edit-booking/buUq9hthirHPRE32154qLu (2022-04-07)  
[^22]: Way2Earning — Klook Affiliate Program 2026. https://www.way2earning.com/2026/05/klook-affiliate-program/ (2026-05-05)  
[^23]: TourRadar — Distribution API. https://www.tourradar.com/distribution-api (2019-03-27)  
[^24]: G Adventures API Documentation. https://developers.gadventures.com/docs/  
[^25]: Expedia Group Developer Hub — Rapid Activities API. https://developers.expediagroup.com/rapid/activities  
[^26]: Ventrata OCTO API Documentation. https://docs.ventrata.com/ (2026-02-16)  

---

*End of Dimension 03 Research Report*
