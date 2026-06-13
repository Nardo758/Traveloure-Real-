# Cross-Verification: Travel Content APIs
**Date:** 2026-06-13
**Scope:** 8 dimensions, 80+ providers, 150+ citations

---

## High Confidence Findings (Confirmed by ≥2 agents from independent sources)

### 1. Amadeus for Developers is the best free-tier starting point for travel content
- **Confirmed by:** Dim01 (Destination/POI), Dim02 (Hotels), Dim03 (Tours/Activities), Dim08 (General Travel)
- **Evidence:** Free self-service OAuth2, 10K+ calls/mo test quota, 7 official SDKs, covers 400+ airlines, 650K+ hotels, 300K+ activities
- **Caveat:** Hotel images removed from self-service due to licensing; enterprise tier unlocks full media via Leonardo

### 2. Google Places API (New) is the richest but most expensive POI/review/photo source
- **Confirmed by:** Dim01 (POI), Dim04 (Reviews), Dim05 (Photos), Dim06 (Restaurants)
- **Evidence:** 200M+ places, structured menu data, 5-review limit per place, per-SKU pricing since March 2025
- **Caveat:** $200/mo pooled credit eliminated; now 10K Essentials / 5K Pro / 1K Enterprise per SKU. Cache 30 days only. No redistribution.

### 3. Pexels + Pixabay are the recommended free imagery foundation
- **Confirmed by:** Dim05 (Imagery), landscape scan, multiple sub-agent summaries
- **Evidence:** Pexels: 200 req/hr, 20K/mo free, photos + videos, no hotlinking. Pixabay: 100 req/60s, download-first, no attribution required.
- **Caveat:** Pexels ~150K videos only; Pixabay quality is variable. Neither offers indemnification.

### 4. Hotel content APIs are overwhelmingly partner-gated; no true free tier exists
- **Confirmed by:** Dim02 (Hotel APIs), landscape scan
- **Evidence:** Hotelbeds, Expedia Rapid, WebBeds, HPro, Travco, Bonotel, Agoda, Booking.com — all require partner approval, certification, or commercial agreement. Only Amadeus self-service offers a free test tier for hotel *search* (not full content).
- **Caveat:** Amadeus self-service no longer distributes hotel images.

### 5. Viator and GetYourGuide are the dominant tours/activities APIs with affiliate models
- **Confirmed by:** Dim03 (Tours/Activities), landscape scan
- **Evidence:** Viator: 300K+ products, 4 access tiers, 8–12% commission. GetYourGuide: 33K+ activities, OpenAPI spec, ~8% commission.
- **Caveat:** Both require partner approval for full booking access. Amadeus aggregates 45+ platforms (including Viator/GYG) as a faster MVP path.

### 6. DataForSEO is the cheapest scalable review data source
- **Confirmed by:** Dim04 (Reviews), landscape scan
- **Evidence:** $0.00075 per 10 reviews ($75/1M reviews). Covers Google, Tripadvisor, Trustpilot. No attribution required.
- **Caveat:** 45-minute standard queue; high-priority 2x cost. Unofficial scraping-based — legal review advised for public display.

### 7. Open-Meteo is the best zero-cost weather API
- **Confirmed by:** Dim08 (Utility), landscape scan
- **Evidence:** 10K calls/day, no API key, open-source, self-hostable, 80 years historical data, global 1–11km resolution.
- **Caveat:** Non-commercial free tier; commercial use requires €29/mo Standard plan.

### 8. Frankfurter (ExchangeRate.fun) is the best zero-cost currency API
- **Confirmed by:** Dim08 (Utility), landscape scan
- **Evidence:** Unlimited, no API key, no signup, 170+ currencies, ECB-sourced, hourly updates.
- **Caveat:** Community-maintained; no SLA guarantee.

### 9. Ticketmaster Discovery API V2 is the best free event API
- **Confirmed by:** Dim07 (Events), Dim03 (Tours/Activities cross-reference)
- **Evidence:** 230K+ events, free API key, 5 req/sec, global coverage (US/CA/UK/AU/EU), concerts/sports/theater/festivals.
- **Caveat:** Discovery only; ticketing requires Partner API enrollment.

### 10. Foursquare drastically reduced free tier in 2026
- **Confirmed by:** Dim01 (POI), Dim06 (Restaurants)
- **Evidence:** Free tier cut from 10K Pro calls/mo to **500 Pro calls/mo** effective June 1, 2026. Premium endpoints (photos, tips, hours, ratings) have **no free tier** at all.
- **Caveat:** Still the richest venue intelligence (tastes, popular hours, chain data) but now expensive for startups.

---

## Medium Confidence Findings (1 authoritative source)

### 11. Geoapify is the best Google Places alternative for permissive licensing
- **Source:** Dim01 (POI)
- **Evidence:** 3K credits/day free (~90K/mo), 800+ categories, explicitly allows caching/redistribution, OSM-based.
- **Caveat:** Smaller proprietary UGC vs Google; attribution required.

### 12. RateHawk Content API offers incremental updates with review endpoint
- **Source:** Dim02 (Hotels)
- **Evidence:** 1.5M+ properties, `updated_at` filters, dedicated guest reviews endpoint, clean REST/JSON.
- **Caveat:** B2B commercial account required; no public free tier.

### 13. TheFork dominates European restaurant API landscape
- **Source:** Dim06 (Restaurants)
- **Evidence:** 60K+ restaurants across 12 European countries, full menu extraction, Michelin/Gault & Millau ratings, discount data.
- **Caveat:** Partner contract required; no self-service.

### 14. PredictHQ is the only demand-intelligence event API
- **Source:** Dim07 (Events)
- **Evidence:** 19 event categories, ranked impact scores, used by Uber/Booking.com/Qantas, 7+ years historical data.
- **Caveat:** No free tier; ~$500/user/year minimum. Trial only.

### 15. Rome2Rio is the only true multi-modal routing API
- **Source:** Dim08 (Utility)
- **Evidence:** Flight + train + bus + ferry + car in one API, 2M+ destinations, 100K searches/mo free (Basic Access).
- **Caveat:** Partner signup required; no public self-service docs.

---

## Conflict Zones

### C1. Google Places pricing structure changed March 2025 — conflicting reports on exact SKU costs
- **Dim01** reports Place Details Pro $17/1K, Text Search $32/1K, Geocoding $5/1K
- **Dim05** reports Place Photo ~$7/1K after free cap, Starter $100/mo, Essentials $275/mo, Pro $1,200/mo
- **Dim06** reports Place Details (Preferred) $40/1K for structured menu data
- **Resolution:** Pricing is SKU-dependent and volume-tiered. All reports are directionally consistent but exact costs depend on specific API calls and field masks. Budget $500–$2,500+/mo at 100K users.

### C2. Yelp Fusion API pricing — conflicting reports on free tier status
- **Dim04** reports: "Yelp eliminated its free Fusion API tier in 2024 and converted all accounts to paid licensing"
- **Dim06** reports: "30-day trial; paid tiers start ~$229/mo"
- **Landscape scan** did not independently verify
- **Resolution:** No free tier remains. Minimum paid entry is ~$229/mo for 1,000 calls/day. Trial may be available. Treat as paid-only.

### C3. Amadeus free tier call quotas vary across APIs and time periods
- **Dim01** reports: 10K+ calls/mo (test), 40 TPS production
- **Dim03** reports: 200–10,000 requests/mo depending on API, pay-as-you-go beyond
- **Dim08** reports: ~2,000 calls/mo free in test environment
- **Resolution:** Quotas vary by specific API (Flights vs Hotels vs Tours vs Travel Restrictions). The ~2,000/mo figure is specific to Travel Restrictions API; Tours/Activities and Hotel Search have higher quotas. All are "free for testing + pay-as-you-go for production."

### C4. Hotelbeds property count: 250K vs 300K+
- **Dim02** reports 250K+ hotels in 170 countries (AltexSoft 2025-11-20)
- **Landscape scan** references 300K+ from some sources
- **Resolution:** Minor variance; 250K–300K range is credible. Use 250K+ as conservative figure.

---

## Low Confidence / Unverified

### L1. Expedia Rapid Activities API — early access timing
- **Dim03** claims pilot Q2 2026, GA 2027
- **Source:** Expedia Developer Hub accessed 2026-06-13
- **Status:** Single source; unverified by independent reporting. Treat as "monitor for updates."

### L2. Booking.com Connectivity APIs closed to new registrations since 2019/2020
- **Dim02** reports closure, re-opening timeline unclear
- **Source:** AltexSoft 2019-11-26 (older article)
- **Status:** May be outdated. Requires direct verification with Booking.com if pursued.

### L3. Agoda API access — "no public developer portal"
- **Dim02** claims no public docs, access via integration partners only
- **Source:** Technoheaven, StayAPI 2026-03-29
- **Status:** Likely accurate but Agoda may have changed partner policies since research date. Verify directly if APAC is a core market.

---

*Cross-verification compiled from 8 dimension research files with 150+ cited sources. Confidence tiers assigned based on source multiplicity and recency.*
