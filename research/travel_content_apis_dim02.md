# Dimension 02: Hotel & Accommodation Content APIs
## Research Report — Traveloure Content Provider Landscape

**Date:** 2026-06-13  
**Researcher:** Sub-agent (codebase exploration)  
**Scope:** Hotel/accommodation static content APIs accessible to developers  
**Focus:** Descriptions, amenities, room types, images, ratings, reviews — with availability/pricing as bonus.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Provider Profiles](#2-provider-profiles)
   - 2.1 Hotelbeds APItude (Content API + Cache API)
   - 2.2 Expedia Partner Solutions (Rapid API)
   - 2.3 Amadeus Hotel Content API
   - 2.4 HPro Travel (HotelsPro) — Coral API + Cosmos API
   - 2.5 WebBeds Marketplace API
   - 2.6 Travco XML API
   - 2.7 Bonotel Exclusive Travel API
   - 2.8 Agoda API / YCS Partner API
   - 2.9 Booking.com Connectivity & Partner APIs
   - 2.10 RateHawk Content API
   - 2.11 Emerging Travel Group (ETG) Affiliate API
   - 2.12 Google Travel Partner API (Hotel Ads / Prices)
   - 2.13 Travelport JSON Hotel API
   - 2.14 Cloudbeds REST API
3. [Ranked Top Providers for Traveloure](#3-ranked-top-providers-for-traveloure)
4. [Quick Comparison Matrix](#4-quick-comparison-matrix)
5. [Key Recommendations](#5-key-recommendations)
6. [Footnotes / Citations](#6-footnotes--citations)

---

## 1. Executive Summary

Hotel content APIs fall into three categories: **OTA affiliate APIs** (Booking.com, Expedia, Agoda), **bed-bank / wholesaler APIs** (Hotelbeds, WebBeds, HPro, Travco, Bonotel, RateHawk), and **GDS / travel-tech APIs** (Amadeus, Travelport, Google Travel Partner). For a travel marketplace like Traveloure, the best strategy is a **multi-supplier architecture**: one or two large wholesalers for global breadth, one OTA for consumer-grade reviews and images, and a GDS for corporate/chain coverage. No single provider delivers perfect global coverage, rich static content, and easy developer access.

---

## 2. Provider Profiles

### 2.1 Hotelbeds APItude (Content API + Cache API)

- **Provider name:** Hotelbeds (APItude suite)
- **API name/endpoint:** Hotel Content API, Hotel Cache API, Booking API
- **Content type:**
  - Static: descriptions, images, location, amenities, room types, bed types, facilities, policies, multilingual content (35+ languages)
  - Dynamic: availability, rates, cancellation fees
- **Coverage:** 250,000–300,000+ hotels in 170 destination countries[^1]
- **Auth model:** API Key + Secret (HTTPS)
- **Rate limits / free tier:** No public free tier; commercial agreement required. Sandbox available post-certification.
- **Pricing:** Commission-based wholesale net rates; API access itself is bundled into commercial agreement. No public per-API-call pricing.[^2]
- **Data format:** REST, JSON preferred, XML supported
- **SDK availability:** Official docs and Postman collections; no official SDKs mentioned, but community SDKs exist for Node.js/Python/Java
- **Integration complexity:** Medium-High. Requires maintaining a **local content database refreshed weekly**[^3]. Three separate APIs to integrate (Booking, Content, Cache). Certification process required before production.
- **Attribution requirements:** Branding and data-display guidelines enforced during certification.
- **URL to docs:** https://developer.hotelbeds.com/ (APItude developer portal)

> **Verdict:** Best-in-class global coverage and multilingual static content. The weekly content-sync requirement adds infra cost but ensures fast local lookups. A top-tier backbone for any marketplace.

---

### 2.2 Expedia Partner Solutions (Rapid API)

- **Provider name:** Expedia Group (Expedia Partner Solutions)
- **API name/endpoint:** Rapid API — Content API, Shopping/Availability, Booking, Price Check
- **Content type:**
  - Static: property names, addresses, images, amenities, star ratings, descriptions, room types, policies
  - Dynamic: real-time rates, availability, cancellation policies
- **Coverage:** 1,000,000+ properties worldwide including hotels, resorts, serviced apartments, vacation rentals, alternative stays[^4]
- **Auth model:** API Key + Secret passed in request headers (simpler than OAuth)[^5]
- **Rate limits / free tier:** No public free tier; partnership agreement required. Sandbox + Production environments available after approval.
- **Pricing:** Commercial/commission model; markup controlled by partner. No public per-request pricing.
- **Data format:** REST, JSON only (no XML/SOAP)
- **SDK availability:** Official SDKs for Java, .NET, Python, PHP, Ruby[^5]
- **Integration complexity:** Medium. Single REST/JSON API (not three separate APIs like Hotelbeds). Certification process with sandbox testing before go-live. Requires caching strategy for static content.
- **Attribution requirements:** Strict branding and display guidelines for rates, taxes, fees, cancellation policies. Must comply with Expedia’s data display standards.
- **URL to docs:** https://www.expediapartnersolutions.com/ (partner portal)

> **Verdict:** Massive inventory, strong static content, excellent SDK support. Good for leisure OTAs wanting hotels + vacation rentals. The certification gate and partnership agreement create a 4–8 week onboarding timeline.

---

### 2.3 Amadeus Hotel Content API

- **Provider name:** Amadeus for Developers (Amadeus IT Group)
- **API name/endpoint:** Hotel Content API (Enterprise), Hotel List API, Hotel Search API, Hotel Ratings API
- **Content type:**
  - Static: descriptions, amenities, facilities, contact details, media (images via Leonardo partner), geo-coordinates, time zones, star ratings[^6]
  - Dynamic: availability, pricing (Hotel Search API)
- **Coverage:** 650,000–770,000+ properties[^7] (self-service tier has subset; Enterprise tier has full GDS inventory)
- **Auth model:** OAuth 2.0 client credentials flow (token expires every 30 min)[^8]
- **Rate limits / free tier:** **Self-service tier is free for testing and pay-per-call in production** (no commercial agreement required). Enterprise tier requires direct Amadeus contract.
- **Pricing:** Self-service: free tier + per-call pricing. Enterprise: custom pricing based on volume and contract.
- **Data format:** REST, JSON, OpenAPI specs, JSON Schema
- **SDK availability:** Official SDKs for Python, Node.js, Java, Swift, .NET, Ruby, PHP[^8]
- **Integration complexity:** Medium. OAuth 2.0 adds token-management overhead but SDKs handle it. **Self-service API no longer distributes hotel images directly** due to licensing constraints; workaround is Leonardo or Google Places API[^9]. Enterprise tier gets full media via Leonardo.
- **Attribution requirements:** Standard Amadeus terms; no heavy branding requirements.
- **URL to docs:** https://developers.amadeus.com/ (self-service) and https://developers.amadeus.com/enterprise/ (Enterprise)

> **Verdict:** The best **developer-friendly** starting point because of the free self-service tier and excellent SDKs. Best suited for corporate/chain hotel coverage. Leisure OTAs will need to supplement with bed-banks for independent/boutique properties. Image licensing restrictions in self-service are a notable caveat.

---

### 2.4 HPro Travel (HotelsPro) — Coral API + Cosmos API

- **Provider name:** HPro Travel (formerly HotelsPro)
- **API name/endpoint:** Coral API (booking/availability), Cosmos API (static content + mapping)
- **Content type:**
  - Static (Cosmos): properties, locations, images, room types, meal types, multilingual content, **automatic mapping/deduplication**[^10]
  - Dynamic (Coral): availability, booking, cancellations, cache
- **Coverage:** 600,000–1,000,000+ hotels across 70,000 destinations; 30,000+ directly contracted[^11]
- **Auth model:** API Key (separate credentials for Cosmos static data)[^12]
- **Rate limits / free tier:** No public free tier; B2B commercial agreement required. Test environment available.
- **Pricing:** Net-rate wholesale model. No public per-request pricing. Some integration partners offer free setup (e.g., wbe.travel Premium PLUS program).[^11]
- **Data format:** REST, JSON (Coral); XML or static data export links (Cosmos)[^12]
- **SDK availability:** Not mentioned; direct API integration via HTTP clients
- **Integration complexity:** Medium. Two separate APIs but both modern. Cosmos offers **static data export links** as an alternative to API calls for bulk loading. Automatic hotel mapping is a major time-saver. Certification required before live credentials.
- **Attribution requirements:** Standard B2B wholesaler terms.
- **URL to docs:** https://api2.hotelspro.com/docs/ (FAQ and docs); email clientintegration@hprotravel.com for Cosmos credentials.

> **Verdict:** The built-in **automatic mapping** (Cosmos) is a standout feature for multi-supplier platforms. Strong coverage in Middle East, Turkey, Eastern/Western Europe. Good secondary wholesaler to pair with Hotelbeds.

---

### 2.5 WebBeds Marketplace API

- **Provider name:** WebBeds (Webjet B2B division)
- **API name/endpoint:** WebBeds Marketplace API — Search & Availability, Booking & Cancellation, Content & Static Data
- **Content type:**
  - Static: hotel descriptions, amenities, images, room types, mapping artefacts
  - Dynamic: availability, rates, booking, cancellation rules per brand
- **Coverage:** 430,000+ hotels across 39,000+ destinations; five brands: Sunhotels, JacTravel, Lots of Hotels, FIT Ruums, Totalstay[^13]
- **Auth model:** API Key via partner agreement
- **Rate limits / free tier:** No public free tier. B2B partner application required (business documentation, expected volumes, use case).[^13]
- **Pricing:** Net-rate wholesale; partner-specific commercial terms.
- **Data format:** REST/XML (multi-brand architecture)[^13]
- **SDK availability:** Not mentioned; direct integration
- **Integration complexity:** High if done directly. Multi-brand handling means each brand has its own property IDs and quirks. Local content database required and refreshed. Cancellation rule engine must be normalized across brands. Direct build estimated 3–5 months and $35K–$95K+ upfront.[^13]
- **Attribution requirements:** WebBeds branding and mapping requirements.
- **URL to docs:** https://www.webbeds.com/buyers/support/ (FAQ); direct contact via "Join Us" form.

> **Verdict:** Excellent depth in Gulf/MENA, Mediterranean, UK/Europe, and LATAM. Direct integration is heavy. Better accessed via an aggregator (e.g., ZentrumHub) unless you have dedicated engineering resources. Not recommended for a lean startup doing direct integration.

---

### 2.6 Travco XML API

- **Provider name:** Travco (Travco Group / Travco Corporation)
- **API name/endpoint:** Travco XML API — Hotel Search, Rate Verification, Booking, Content Module
- **Content type:**
  - Static: descriptions, images, star ratings, amenities, policies, geolocation, multilingual content (9 languages)
  - Dynamic: availability, rates, booking, amendments, cancellations
- **Coverage:** 12,000+ hotels across 1,000+ destinations; strong in Europe and Middle East; direct contracts with thousands of hotels[^14]
- **Auth model:** API Key / token via partnership agreement
- **Rate limits / free tier:** No public free tier. Partnership application required. Sandbox environment provided after approval.
- **Pricing:** Wholesale net rates; commission model. No public per-request pricing.
- **Data format:** XML (legacy but well-documented)
- **SDK availability:** Not mentioned; SOAP/XML integration via HTTP clients
- **Integration complexity:** Medium-High. XML-based, not REST/JSON. Requires certification process before production. Strong allocation model (guaranteed allotments) is a plus for peak seasons.[^14]
- **Attribution requirements:** Standard B2B wholesaler terms.
- **URL to docs:** Direct contact via Travco partner portal or integration partners (Trawex, Amar Infotech, Techno Softwares).

> **Verdict:** Smaller inventory than Hotelbeds/WebBeds but strong in Europe and reliable allotments. Best used as a **niche/secondary supplier** for European package tours or guaranteed inventory during high season. XML format adds integration overhead.

---

### 2.7 Bonotel Exclusive Travel API

- **Provider name:** Bonotel Exclusive Travel (inbound tour operator for luxury travel)
- **API name/endpoint:** Bonotel API — Hotel API (booking), Data API (static content), Static Data Export
- **Content type:**
  - Static: hotel address, contacts, photo gallery, services, facilities, room descriptions (English only, updated weekly)[^15]
  - Dynamic: availability, booking, modifications, on-request bookings (confirmed within 3 business hours)
- **Coverage:** 2,200–2,800+ hotel partners; luxury, boutique, branded properties in USA, Canada, Mexico, Caribbean, Australia, UK, Germany[^16]
- **Auth model:** API Key via partner registration
- **Rate limits / free tier:** No public free tier. Direct account with Bonotel required. Certified technology partners available as integration shortcuts.
- **Pricing:** Commissionable rates; custom commercial terms.
- **Data format:** RESTful with XML messaging (light API) or JSON (complete API)[^15]
- **SDK availability:** Not mentioned
- **Integration complexity:** Medium. Two API versions (light XML vs complete JSON). Static content is English-only and updated weekly. On-request booking flow (not instant confirmation) is unusual and may require UI handling.[^15]
- **Attribution requirements:** Standard partner terms.
- **URL to docs:** Contact Bonotel directly or via integration partners (Above Property Services, Software.Travel).

> **Verdict:** Niche luxury provider for North America, Caribbean, and select European markets. Not a global backbone, but valuable if Traveloure targets high-end travelers. English-only content is a limitation for international audiences.

---

### 2.8 Agoda API / YCS Partner API

- **Provider name:** Agoda (Booking Holdings subsidiary)
- **API name/endpoint:** Agoda API (B2B partner API), YCS (Yield Control System) API for property managers
- **Content type:**
  - Static: property info, geo-coordinates, room types, amenities, images, policies, multilingual content (39 languages)[^17]
  - Dynamic: real-time availability, pricing, rate plans
- **Coverage:** 2,000,000+ properties; dominant in Asia-Pacific (Thailand, Indonesia, Vietnam, Malaysia, Singapore, Japan, South Korea, India)[^17]
- **Auth model:** API Key + Secret (partner credentials)
- **Rate limits / free tier:** No public free tier or open developer portal. **No public API for reviews** — review data is locked in partner dashboard UI.[^18]
- **Pricing:** Commission model (12–18% typical); B2B partner agreement required.
- **Data format:** REST, JSON
- **SDK availability:** Not publicly documented
- **Integration complexity:** Medium-High. No public developer docs; integration typically done through certified tech partners (e.g., Technoheaven). Approval cycle and commercial fit review required.
- **Attribution requirements:** Agoda branding and rate-display rules.
- **URL to docs:** No public docs. Access via https://www.agoda.com/partnerhub/ or certified integration partners.

> **Verdict:** Essential for Asia-Pacific coverage but closed to casual developers. No public reviews API is a content gap. Best accessed via a multi-supplier aggregator rather than direct integration unless APAC is a core market.

---

### 2.9 Booking.com Connectivity & Partner APIs

- **Provider name:** Booking.com (Booking Holdings)
- **API name/endpoint:**
  - Connectivity APIs (for channel managers / PMS providers): content, rates, availability, reservations, reviews, photos
  - Demand API (for affiliates): search, pricing, property content
  - Content API (for content providers): push property photos, facilities, policies
- **Content type:**
  - Static: descriptions, photos, facilities, policies, room types, amenities, geo data
  - Dynamic: real-time availability, pricing, promotions
  - Reviews: guest reviews and scores (via partner interfaces)
- **Coverage:** 28,000,000+ listings (hotels, homes, apartments, B&Bs, treehouses, etc.) across 228 countries/territories[^19]
- **Auth model:** OAuth 2.0 or API Key depending on API type; partner-specific credentials
- **Rate limits / free tier:** No public free tier. **Connectivity APIs closed to new registrations as of 2019/2020** (re-opening timeline unclear).[^20] Demand API requires affiliate partner application. Content API requires certified provider status.
- **Pricing:** Commission-based (typically 15–20% for affiliate bookings). API access itself is free to approved partners.
- **Data format:** JSON, OTA 2003B, B.XML formats[^20]
- **SDK availability:** Limited public SDKs; mostly direct integration
- **Integration complexity:** High for direct connectivity. Booking.com is designed for channel managers and large OTAs, not lean startups. Affiliate/API access is gated. Metasearch Connect API is a separate track for price comparison sites.
- **Attribution requirements:** Strict — cannot use content in price comparison, cannot modify descriptions/prices, cannot forward Demand API data to non-affiliates.[^20]
- **URL to docs:** https://developers.booking.com/ (limited public docs); https://connect.booking.com/ (connectivity)

> **Verdict:** The largest inventory in the world, but API access is the hardest to obtain. Best for later-stage marketplaces with dedicated BD resources. Early-stage startups should look at bed-banks or Expedia first. The content richness (reviews, photos, alternative accommodations) is unmatched once access is secured.

---

### 2.10 RateHawk Content API

- **Provider name:** RateHawk (by Emerging Travel Group / ETG)
- **API name/endpoint:** RateHawk Content API (standalone), RateHawk Hotel API (booking)
- **Content type:**
  - Static: name, address, photos, descriptions, amenities, room types, guest reviews (dedicated endpoint), prioritization data[^21]
  - Dynamic: availability, pricing, instant booking
- **Coverage:** 1,500,000+ properties worldwide; 2,000,000+ in some press materials[^22]
- **Auth model:** API Key via Account Manager
- **Rate limits / free tier:** No public free tier; B2B commercial account required. Content API access enabled by contacting Account Manager.
- **Pricing:** Net-rate wholesale + dynamic markup rules by supplier/market/segment.
- **Data format:** REST, JSON
- **SDK availability:** Not mentioned; direct REST integration
- **Integration complexity:** Low-Medium for content. Content API is designed for **offline preload / incremental updates** (not real-time search enrichment). Use `updated_at` and NEW/UPDATED filters to keep local DB fresh.[^21] Booking API is separate but unified under single RateHawk brand (unlike WebBeds multi-brand complexity).
- **Attribution requirements:** RateHawk partner terms.
- **URL to docs:** https://blog.ratehawk.com/ratehawk-content-api/ (announcement); contact API support team for full docs.

> **Verdict:** Strong global inventory, clean incremental content API, and review data included. Good alternative to Hotelbeds with slightly less integration overhead. The incremental update model is well-designed for marketplace content pipelines.

---

### 2.11 Emerging Travel Group (ETG) Affiliate API

- **Provider name:** Emerging Travel Group (RateHawk, ZenHotels, Ostrovok)
- **API name/endpoint:** ETG Affiliate API V3 — Static Content, Hotel Search, Booking, Post-Booking
- **Content type:**
  - Static: hotel descriptions, images, amenities, room types, star ratings, certificates, room amenities, serp_filters, geo data, multilingual[^23]
  - Dynamic: availability, pricing, booking, cancellation
- **Coverage:** Millions of properties via RateHawk/ZenHotels/Ostrovok networks; strong in CIS, Eastern Europe, Asia
- **Auth model:** API Key via affiliate contract
- **Rate limits / free tier:** No public free tier. Affiliate/partner agreement required.
- **Pricing:** Commission/net-rate model.
- **Data format:** REST, JSON
- **SDK availability:** Not mentioned; direct REST integration
- **Integration complexity:** Medium. Content API is intended for **offline sync** (not live search calls). Docs recommend daily refresh. Well-documented parameter lists and translations endpoint.[^23]
- **Attribution requirements:** ETG affiliate terms.
- **URL to docs:** https://docs.emergingtravel.com/docs/affiliate-api/ (public docs)

> **Verdict:** Good documentation and structured static content. Best for markets where ETG has strong local inventory (Russia, CIS, Eastern Europe, parts of Asia). Can serve as a regional supplement to global wholesalers.

---

### 2.12 Google Travel Partner API (Hotel Ads / Hotel Prices / Book on Google)

- **Provider name:** Google (Travel Partner Program)
- **API name/endpoint:** Hotel Prices API, Hotel Ads API, Book on Google Hotel API, Hotel Content (via Hotel Center feeds)
- **Content type:**
  - Static: hotel names, addresses, photos, amenities, policies (via Hotel Center feed and Google Places API supplement)
  - Dynamic: rates, availability, itinerary data, pricing analytics
- **Coverage:** Google-indexed hotels worldwide (breadth depends on partner feed coverage)
- **Auth model:** OAuth 2.0 via Google Cloud; Hotel Center account required
- **Rate limits / free tier:** No free tier for production. **Must be an approved Google Travel Partner** to access Hotel Ads / Prices APIs.[^24]
- **Pricing:** Pay-per-click or commission-based bidding via Hotel Ads auction.
- **Data format:** REST, JSON (Hotel Prices); XML feeds (Hotel Center)
- **SDK availability:** Google-standard client libraries
- **Integration complexity:** High. Requires Google Cloud setup, Hotel Center feed management, and Ads account linkage. Primarily designed for **hoteliers advertising on Google**, not for OTAs sourcing third-party content.[^24]
- **Attribution requirements:** Google Ads policies and Hotel Ads content policies.
- **URL to docs:** https://developers.google.com/hotels/ (partner-restricted)

> **Verdict:** Not a primary content source for a new marketplace. Useful later for **distribution** (getting Traveloure hotels listed on Google) rather than **content ingestion**. Google Maps Places API can supplement hotel images and basic info, but is not a wholesale content replacement.

---

### 2.13 Travelport JSON Hotel API

- **Provider name:** Travelport
- **API name/endpoint:** Travelport JSON API — Hotel Search, Hotel Booking, Hotel Content
- **Content type:**
  - Static: descriptions, locations, amenities, images, rules
  - Dynamic: availability, rates, reservations, modifications, cancellations
- **Coverage:** Hotel properties in 180 countries; enriched static and dynamic content[^25]
- **Auth model:** API Key / token via Travelport contract
- **Rate limits / free tier:** No public free tier. Trial credentials may be available via Sales team.
- **Pricing:** Custom enterprise pricing.
- **Data format:** REST, JSON
- **SDK availability:** DevKits include Postman collections and Swagger files; no code SDKs mentioned[^25]
- **Integration complexity:** Medium. JSON API is lighter than legacy XML. Good for adding to a multi-supplier stack. Requires Sales contact for credentials.
- **Attribution requirements:** Standard Travelport terms.
- **URL to docs:** https://developer.travelport.com/restful-json-api

> **Verdict:** Solid enterprise-grade option, especially if Traveloure already uses Travelport for flights. Not a standalone content leader, but good for unified air+hotel packaging.

---

### 2.14 Cloudbeds REST API

- **Provider name:** Cloudbeds (channel manager + PMS + booking engine)
- **API name/endpoint:** Cloudbeds REST API
- **Content type:**
  - Static: room rates, availability, static content (property descriptions, images, amenities)
  - Dynamic: reservations, booking engine data
- **Coverage:** ~20,000 hotels using Cloudbeds platform[^26]
- **Auth model:** OAuth 2.0
- **Rate limits / free tier:** No public free tier; partner/integration agreement required.
- **Pricing:** SaaS subscription model for hotels; API access typically bundled.
- **Data format:** REST, JSON
- **SDK availability:** Not mentioned; direct REST integration
- **Integration complexity:** Medium. Good if targeting independent hotels and B&Bs directly. However, Cloudbeds is a **channel manager**, not a wholesaler — each property must be connected individually or via their integration marketplace.
- **Attribution requirements:** Cloudbeds partner terms.
- **URL to docs:** https://www.cloudbeds.com/developers/

> **Verdict:** Not a global content API in the traditional sense. Useful for a **direct-integration strategy** with independent hotels, but does not provide instant access to hundreds of thousands of properties like a bed-bank.

---

## 3. Ranked Top Providers for Traveloure

### 🥇 1. Hotelbeds APItude (Content API + Cache API)
**Why:** Largest global bed-bank, 250K+ hotels, 35+ languages, rich static content, and a mature Cache API for high-traffic search. The weekly content-sync requirement is standard industry practice and pays off in sub-second local lookups. Best **backbone** for a global marketplace.

### 🥈 2. Expedia Partner Solutions (Rapid API)
**Why:** 1M+ properties, strong vacation-rental/alternative inventory, excellent SDKs, unified REST/JSON architecture. Good for leisure travelers and broader accommodation types. Slightly easier integration than Hotelbeds (one API vs three). Best **complement** to Hotelbeds for inventory breadth.

### 🥉 3. Amadeus Hotel Content API (Self-Service → Enterprise)
**Why:** Best **developer experience** — free self-service tier, pay-per-call, official SDKs in 7 languages, OpenAPI specs. Great for prototyping and corporate/chain coverage. Image restrictions in self-service mean you'll need a supplemental image source (Leonardo or Google Places). Best **rapid-start** option.

### 4. RateHawk Content API + Hotel API
**Why:** 1.5M+ properties, purpose-built incremental content API, includes guest reviews endpoint, clean REST/JSON. Less integration overhead than Hotelbeds. Good **alternative or secondary** wholesaler with strong review content.

### 5. HPro Travel (Cosmos + Coral APIs)
**Why:** Built-in automatic hotel mapping saves months of engineering. Strong in Middle East, Turkey, Europe. 600K+ properties. Good **secondary wholesaler** to pair with Hotelbeds for deduplication and regional depth.

### 6. Booking.com Connectivity / Partner APIs
**Why:** Unmatched inventory (28M+ listings) and content richness (reviews, photos, alternative stays). **Gated access** — hard to obtain for early-stage startups. Plan this for **Phase 2 or 3** once Traveloure has traction and BD resources.

### 7. Agoda API (via certified partner)
**Why:** Essential if Asia-Pacific is a core market. 2M+ properties, dominant in Southeast Asia, Japan, Korea, India. No public developer docs and no public reviews API. Access via integration partner recommended unless APAC is a primary geography.

---

## 4. Quick Comparison Matrix

| Provider | Content Types | Properties | Global/APAC/Europe | Free Tier | Auth | Format | Dev Docs | Mapping |
|---|---|---|---|---|---|---|---|---|
| Hotelbeds APItude | Desc, images, amenities, rooms, policies, multilingual | 250K+ | Global | ❌ Sandbox | API Key | REST/JSON/XML | ✅ Public | ❌ Build yourself |
| Expedia Rapid | Desc, images, amenities, rooms, policies, rentals | 1M+ | Global | ❌ Sandbox | API Key | REST/JSON | ✅ Partner | ❌ Build yourself |
| Amadeus (Self-Svc) | Desc, amenities, geo, media (limited) | 650K+ | Global/Enterprise | ✅ Free tier | OAuth 2.0 | REST/JSON | ✅ Public | ❌ Build yourself |
| HPro Travel Cosmos | Desc, images, rooms, meals, auto-mapped | 600K+ | ME, Europe, Turkey | ❌ Test env | API Key | REST/JSON/XML | ⚠️ Limited | ✅ Auto |
| WebBeds | Desc, images, amenities, rooms | 430K+ | MENA, Europe, LATAM | ❌ Partner | API Key | REST/XML | ⚠️ Limited | ❌ Build yourself |
| Travco | Desc, images, amenities, policies, 9 langs | 12K+ | Europe, ME | ❌ Sandbox | API Key | XML | ⚠️ Limited | ❌ Build yourself |
| Bonotel | Desc, images, facilities, rooms | 2.2K+ | USA, Caribbean, Luxury | ❌ Partner | API Key | REST/XML/JSON | ⚠️ Limited | ❌ Build yourself |
| Agoda | Desc, images, amenities, rooms, 39 langs | 2M+ | APAC dominant | ❌ Partner | API Key | REST/JSON | ❌ Closed | ❌ Build yourself |
| Booking.com | Desc, images, amenities, reviews, homes | 28M+ | Global | ❌ Gated | OAuth/API Key | JSON/XML | ⚠️ Limited | ❌ Build yourself |
| RateHawk | Desc, images, amenities, reviews, rooms | 1.5M+ | Global | ❌ B2B | API Key | REST/JSON | ⚠️ Contact AM | ❌ Build yourself |
| ETG Affiliate | Desc, images, amenities, rooms, filters | Millions | CIS, Eastern Europe | ❌ Affiliate | API Key | REST/JSON | ✅ Public | ❌ Build yourself |
| Google Travel | Prices, availability, basic content | Variable | Global | ❌ Partner | OAuth 2.0 | REST/JSON | ❌ Partner-only | N/A |
| Travelport | Desc, images, amenities, rules | 180 countries | Global | ❌ Trial | API Key | REST/JSON | ✅ Public | ❌ Build yourself |
| Cloudbeds | Rates, availability, static content | ~20K | Independent/B&B | ❌ Partner | OAuth 2.0 | REST/JSON | ✅ Public | N/A |

---

## 5. Key Recommendations

1. **Start with Amadeus Self-Service** for rapid prototyping and initial content population. It has a free tier, excellent SDKs, and no commercial agreement required. Use Google Places API or Leonardo as an image supplement.

2. **Add Hotelbeds as the primary wholesaler** for production global coverage. The Content API + Cache API combination is the industry standard for high-scale marketplaces. Budget for weekly content-sync infrastructure.

3. **Layer in Expedia Rapid** for alternative accommodations (vacation rentals, apartments, B&Bs) and for the strong SDK support that reduces engineering time.

4. **Use HPro Travel Cosmos** as a mapping/deduplication layer if you plan to aggregate 3+ suppliers. The automatic mapping feature is a genuine engineering saver.

5. **Defer Booking.com and Agoda direct integrations** until you have commercial traction and a BD team. Both are gated and resource-intensive. Access them via an aggregator (e.g., ZentrumHub, Travelopro, Trawex) in the meantime if their inventory is needed.

6. **Invest in a hotel mapping service** (Vervotech, GIATA, or HPro Cosmos) early. Without deduplication, the same hotel from Hotelbeds + Expedia + WebBeds will appear 3× in search results, destroying user trust.

7. **Content refresh strategy:** Daily or weekly incremental updates for static content; real-time API calls only for availability/rates. Never call content APIs during live user search sessions.[^23]

---

## 6. Footnotes / Citations

**[^1]** Claim: Hotelbeds covers 250,000+ hotels in 170 destination countries.  
Source: AltexSoft — "Best Hotel Booking APIs: Hotelbeds, Expedia, Airbnb, and ..."  
URL: https://www.altexsoft.com/blog/hotel-api/  
Date: 2025-11-20  
Confidence: High

**[^2]** Claim: Hotelbeds API pricing is not publicly fixed; access depends on commercial agreements.  
Source: PHPTravels — "Hotelbeds API Integration for Modern Travel Businesses"  
URL: https://phptravels.com/blog/hotelbeds-api-with-phptravels  
Date: 2026-05-22  
Confidence: High

**[^3]** Claim: Hotelbeds Content API data must be stored locally and refreshed at least weekly.  
Source: AltexSoft — "Hotelbeds API Integration: Hands-on Experience with a Leading Bed Bank"  
URL: https://www.altexsoft.com/blog/hotelbeds-api-integration/  
Date: 2026-01-26  
Confidence: High

**[^4]** Claim: Expedia provides access to over one million properties worldwide spanning hotels, resorts, serviced apartments, vacation rentals, and alternative stays.  
Source: Travelomatix — "What is the cost of Expedia API integration in United States"  
URL: https://www.travelomatix.com/software/what-is-the-cost-of-expedia-api-integration-in-united-states  
Date: N/A  
Confidence: High

**[^5]** Claim: Expedia Rapid API is RESTful JSON, uses API Key + Secret in headers, and has official SDKs for Java, .NET, Python, PHP, Ruby.  
Source: ZentrumHub — "We Integrated Expedia Hotel API So You Don’t Have To"  
URL: https://www.zentrumhub.com/blog/expedia-rapid-hotel-api-integration/  
Date: 2026-05-12  
Confidence: High

**[^6]** Claim: Amadeus Hotel Content API provides descriptions, amenities, facilities, contact details, and media assets via Enterprise tier.  
Source: APIs.io / API Evangelist — "Amadeus Media — Hotel Content API"  
URL: https://github.com/api-evangelist/amadeus-media  
Date: 2026-02-27  
Confidence: High

**[^7]** Claim: Amadeus self-service Hotel Search API includes over 650,000–700,000+ properties.  
Source: AltexSoft TechTalks — "Hotel information API?"  
URL: https://www.altexsoft.com/techtalks/hotel-information-api/?sort=votes  
Date: 2020-04-25  
Confidence: Medium (older figure; current may differ)

**[^8]** Claim: Amadeus uses OAuth 2.0 client credentials flow; tokens expire every 30 minutes; official SDKs available in Python, Node.js, Java, Swift, .NET, Ruby, PHP.  
Source: ZentrumHub — "Amadeus Hotel API: What Every OTA Needs to Know"  
URL: https://www.zentrumhub.com/blog/amadeus-hotel-api-guide/  
Date: 2026-05-12  
Confidence: High

**[^9]** Claim: Amadeus Self-Service APIs no longer distribute hotel images due to legal constraints; workaround is Leonardo or Google Places API.  
Source: Amadeus Developer Docs — "Hotel Search API Migration Guide"  
URL: https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/migration-guides/hotel-search/  
Date: 2025-10-23  
Confidence: High

**[^10]** Claim: HPro Travel Cosmos API provides static content with automatic mapping that eliminates duplicate information.  
Source: AltexSoft — "Best Hotel Booking APIs: Hotelbeds, Expedia, Airbnb, and ..."  
URL: https://www.altexsoft.com/blog/hotel-api/  
Date: 2025-11-20  
Confidence: High

**[^11]** Claim: HPro Travel covers 600,000+ properties with 30,000+ directly contracted; strong in Middle East, Turkey, Western and Eastern Europe.  
Source: wbe.travel — "B2B Wholesaler HPro Travel is now a Premium+ Partner"  
URL: https://www.wbe.travel/partner/hpro-travel-api-integration/  
Date: 2023-03-09  
Confidence: High

**[^12]** Claim: Cosmos is a static database with two access methods: static data export link or Cosmos API; separate credentials required.  
Source: HPro Travel (HotelsPro) API FAQ  
URL: https://api2.hotelspro.com/docs/faq/index.html  
Date: N/A  
Confidence: High

**[^13]** Claim: WebBeds covers 430,000+ hotels across 39,000+ destinations; five brands with multi-brand API complexity; direct build 3–5 months and $35K–$95K+.  
Source: ZentrumHub — "WebBeds Hotel API via ZentrumHub"  
URL: https://www.zentrumhub.com/webbeds-hotel-api-integration/  
Date: 2026-05-13  
Confidence: High

**[^14]** Claim: Travco provides rich static content in 9 languages, 12,000+ hotels, direct contracts, strong allocation model, and certification before production.  
Source: Travelomatix — "What is Travco API"  
URL: https://www.travelomatix.com/software/what-is-travco-api  
Date: N/A  
Confidence: High

**[^15]** Claim: Bonotel Data API caches static content (English only, weekly updates); RESTful with XML messaging (light) or JSON (complete); on-request bookings within 3 business hours.  
Source: AltexSoft — "Bed Banks: Comparing Inventory and Connectivity"  
URL: https://www.altexsoft.com/blog/bed-banks-hotelbeds-travco-bonotel-hotelspro/  
Date: 2022-07-27  
Confidence: High

**[^16]** Claim: Bonotel covers 2,200+ hotel partners in USA, Canada, Mexico, Caribbean, Australia, UK, Germany.  
Source: Amar Infotech — "Bonotel API XML Integration"  
URL: https://www.amarinfotech.com/hotel-api-integration-bonotel.html  
Date: N/A  
Confidence: High

**[^17]** Claim: Agoda has 2M+ properties and supports 39 languages; dominant in Southeast Asia, Japan, South Korea, India.  
Source: Technoheaven — "Agoda API Integration"  
URL: https://www.technoheaven.com/agoda-hotels-xml-api-integration.aspx  
Date: N/A  
Confidence: Medium

**[^18]** Claim: Agoda has no public reviews API; review data is locked in partner dashboard.  
Source: StayAPI — "Agoda Reviews API: How to Access Agoda Review Data (2026)"  
URL: https://stayapi.com/blog/how-to-extract-agoda-reviews  
Date: 2026-03-29  
Confidence: High

**[^19]** Claim: Booking.com has 28M+ listings across 228 countries/territories.  
Source: Peery Hotel — "Is There a Free API for Hotel Search?"  
URL: https://www.peeryhotel.com/is-there-a-free-api-for-hotel-search/  
Date: 2026-04-03  
Confidence: Medium

**[^20]** Claim: Booking.com Connectivity APIs accept JSON, OTA 2003B, B.XML; strict restrictions on price comparison, content modification, and forwarding Demand API data to non-affiliates. As of 2019/2020, new registrations were paused.  
Source: AltexSoft — "Booking.com Partnership and Affiliate Programs"  
URL: https://www.altexsoft.com/blog/booking-com-partnerships-apis-extranet-pulse-app/  
Date: 2019-11-26  
Confidence: High (note: registration status may have changed since 2020)

**[^21]** Claim: RateHawk Content API is for static content only; supports incremental updates via `updated_at` and NEW/UPDATED filters; must be preloaded and not used for real-time search enrichment.  
Source: RateHawk Blog — "RateHawk Content API: Access the Hotel Data You Need"  
URL: https://blog.ratehawk.com/ratehawk-content-api/  
Date: 2025-08-29  
Confidence: High

**[^22]** Claim: RateHawk offers 1.5M+ to 2M+ properties worldwide.  
Source: ZentrumHub — "Top 15 Hotel API Providers"  
URL: https://www.zentrumhub.com/top-15-hotel-api-providers/  
Date: 2025-09-16  
Confidence: Medium

**[^23]** Claim: ETG Affiliate API static content should be refreshed daily or as frequently as possible; do not request content during live user search sessions.  
Source: Emerging Travel Group Docs — "Best Practices for API"  
URL: https://docs.emergingtravel.com/docs/best-practices-for-apiv3/  
Date: 2025-03-24  
Confidence: High

**[^24]** Claim: Google does not provide a fully open hotel booking API; access is via Google Travel Partner Program (Hotel Ads, Hotel Prices, Book on Google). Must be an approved partner.  
Source: PHPTravels — "Best Hotel APIs in 2026"  
URL: https://phptravels.com/blog/what-is-a-hotel-api-and-why-does-it-matter  
Date: 2026-05-22  
Confidence: High

**[^25]** Claim: Travelport JSON API offers hotel search, booking, and management in 180 countries with enriched static and dynamic content.  
Source: Travelport Developer Portal — "Developer Experience"  
URL: https://developer.travelport.com/restful-json-api  
Date: N/A  
Confidence: High

**[^26]** Claim: Cloudbeds supports ~20,000 hotels with REST API for room rates, availability, and static content.  
Source: AltexSoft — "Best Hotel Booking APIs: Hotelbeds, Expedia, Airbnb, and ..."  
URL: https://www.altexsoft.com/blog/hotel-api/  
Date: 2025-11-20  
Confidence: High

---

*End of report.*
