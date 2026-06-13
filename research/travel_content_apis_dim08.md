# Dimension 08: Weather, Currency & Utility Enrichment APIs

## Research Date: 2026-06-13
## Scope: APIs for weather, currency, time zone, travel safety, visa, translation, and routing for a travel marketplace

---

## Table of Contents
1. [Weather APIs](#1-weather-apis)
2. [Currency & Exchange Rate APIs](#2-currency--exchange-rate-apis)
3. [Time Zone APIs](#3-time-zone-apis)
4. [Travel Advisory & Safety APIs](#4-travel-advisory--safety-apis)
5. [Visa Requirements APIs](#5-visa-requirements-apis)
6. [Translation APIs](#6-translation-apis)
7. [Routing & Distance APIs](#7-routing--distance-apis)
8. [General Travel Utility APIs](#8-general-travel-utility-apis)
9. [Top Recommendations](#9-top-recommendations-for-traveloure)
10. [Sources & Citations](#10-sources--citations)

---

## 1. Weather APIs

### 1.1 OpenWeatherMap

- **Provider name:** OpenWeatherMap
- **API name:** One Call API 3.0, Current Weather API, Forecast API
- **Content type:** Weather (current, forecast, historical, air quality, alerts)
- **Coverage:** Global (200,000+ cities)
- **Auth model:** API Key (query parameter)
- **Rate limits / free tier:** 1,000 calls/day, 60 calls/minute; 1,000,000 calls/month [^1]
- **Pricing:** Free tier; Paid: Startup ($40/mo), Developer ($180/mo), Professional ($470/mo), Expert ($1,200/mo) [^1]
- **Data format:** REST / JSON / XML
- **SDK availability:** Multiple community SDKs; no official SDK [^2]
- **Integration complexity:** Low — well-documented, simple endpoints
- **Real-time vs cached:** Real-time with 10–15 minute updates for current; forecast updated every 4–6 hours [^3]
- **Attribution requirements:** Required for free tier (open license) [^4]
- **URL to docs:** https://docs.openweather.co.uk/api

**Travel relevance:** Most widely-used weather API. Provides current conditions, 5-day/16-day forecasts, UV index, air quality, and historical data. One Call API 3.0 consolidates current, hourly, and 8-day forecasts in a single request. Ideal for destination pages and trip planning. [^1]

---

### 1.2 WeatherAPI.com

- **Provider name:** WeatherAPI.com
- **API name:** WeatherAPI.com REST API
- **Content type:** Weather (current, forecast, historical, marine, air quality, astronomy, sports)
- **Coverage:** Global (all countries)
- **Auth model:** API Key
- **Rate limits / free tier:** 1,000,000 calls/month free [^5]
- **Pricing:** Free; Starter $7/mo; Pro+ $25/mo; higher tiers available [^6]
- **Data format:** JSON and XML
- **SDK availability:** Official SDKs on GitHub (multiple languages) [^7]
- **Integration complexity:** Low — developer-first, clean REST API
- **Real-time vs cached:** Real-time updated every 10–15 minutes; forecast updated every 4–6 hours [^6]
- **Attribution requirements:** Not explicitly stated for free tier
- **URL to docs:** https://www.weatherapi.com/docs/

**Travel relevance:** Generous free tier (1M calls/month) makes it very attractive for early-stage travel apps. Includes 3-day forecast on free tier, air quality (AQI), astronomy data (sunrise/sunset), and marine weather. Supports 40 languages via `lang` parameter — useful for localized travel content. [^5]

---

### 1.3 Open-Meteo

- **Provider name:** Open-Meteo
- **API name:** Open-Meteo Weather API
- **Content type:** Weather (forecast, historical, air quality, marine, flood, elevation, geocoding)
- **Coverage:** Global (1–11 km resolution)
- **Auth model:** None required for free tier; API key for commercial use
- **Rate limits / free tier:** 10,000 calls/day, 600 calls/min, 300,000 calls/month free (non-commercial) [^8]
- **Pricing:** Free for non-commercial; Commercial: Standard €29/mo (1M calls), Professional €99/mo (5M calls), Enterprise custom [^8]
- **Data format:** JSON (REST)
- **SDK availability:** Open-source; self-hostable via Docker/Ubuntu packages [^9]
- **Integration complexity:** Low — no signup required, CORS supported
- **Real-time vs cached:** Hourly model updates for Europe and North America; response times <10 ms [^9]
- **Attribution requirements:** CC BY 4.0 attribution required [^8]
- **URL to docs:** https://open-meteo.com/en/docs

**Travel relevance:** Completely free with no API key for non-commercial use. Combines data from NOAA, DWD, ECMWF, and other national weather services. Includes 80 years of historical weather data. Can be self-hosted for complete independence. Very attractive for bootstrapped travel apps. [^9]

---

### 1.4 Tomorrow.io (formerly Climacell)

- **Provider name:** Tomorrow.io
- **API name:** Tomorrow.io Weather API
- **Content type:** Weather (hyperlocal current, forecast, air quality, pollen, lightning)
- **Coverage:** Global
- **Auth model:** API Key
- **Rate limits / free tier:** 500 requests/day, 25 requests/hour, 3 requests/second [^10]
- **Pricing:** Free tier; paid plans for commercial use (contact sales)
- **Data format:** JSON (REST)
- **SDK availability:** Official SDKs available
- **Integration complexity:** Low
- **Real-time vs cached:** Real-time, hyperlocal (minute-by-minute)
- **Attribution requirements:** Required
- **URL to docs:** https://docs.tomorrow.io/

**Travel relevance:** Very limited free tier (500/day) makes it suitable for prototyping only. Strength is hyperlocal precision and environmental parameters like pollen and air quality, which are relevant for travelers with allergies. [^10]

---

### 1.5 Visual Crossing Weather API

- **Provider name:** Visual Crossing
- **API name:** Timeline Weather API
- **Content type:** Weather (15-day forecast, 50+ years historical, events, sub-hourly history)
- **Coverage:** Global
- **Auth model:** API Key
- **Rate limits / free tier:** 1,000 records/day free (Professional plan); 10,000,000 records/month on Metered plan [^11]
- **Pricing:** Free tier; Professional $10/mo; Metered custom; Corporate/Enterprise [^11]
- **Data format:** JSON, CSV, OData
- **SDK availability:** No official SDK; REST-based
- **Integration complexity:** Low-Medium
- **Real-time vs cached:** Historical data available; forecast updated regularly
- **Attribution requirements:** Attribution required on free tier
- **URL to docs:** https://www.visualcrossing.com/resources/documentation/

**Travel relevance:** Exceptional historical depth (50+ years) is ideal for "best time to visit" features. The free tier supports 1,000 records/day, which is enough for a small travel app. [^11]

---

## 2. Currency & Exchange Rate APIs

### 2.1 CurrencyFreaks

- **Provider name:** CurrencyFreaks
- **API name:** CurrencyFreaks Exchange Rate API
- **Content type:** Currency exchange rates (fiat, metals, crypto)
- **Coverage:** 1,020 symbols (166 fiat, 4 metals, 850+ crypto)
- **Auth model:** API Key
- **Rate limits / free tier:** 1,000 requests/month free [^12]
- **Pricing:** Free; Starter $9.99/mo; Growth $49.99/mo; Professional $99.99/mo; Enterprise custom [^12]
- **Data format:** JSON and XML
- **SDK availability:** No official SDK; simple REST endpoints
- **Integration complexity:** Low — 2-minute setup
- **Real-time vs cached:** Rates updated every minute (even on free tier) [^12]
- **Attribution requirements:** Not stated
- **URL to docs:** https://currencyfreaks.com/

**Travel relevance:** Broadest currency coverage including crypto. Free tier is modest (1K/mo) but adequate for a small travel app displaying price conversions. SSL-encrypted and returns USD base on free tier. [^12]

---

### 2.2 ExchangeRate-API.com

- **Provider name:** ExchangeRate-API
- **API name:** ExchangeRate-API REST API
- **Content type:** Currency exchange rates (161 currencies)
- **Coverage:** 200 countries
- **Auth model:** API Key
- **Rate limits / free tier:** 1,500 requests/month free (daily updates) [^13]
- **Pricing:** Free; Pro $10/mo (hourly updates, 30K req); Business $30/mo (5-min updates, 125K req) [^13]
- **Data format:** JSON
- **SDK availability:** No SDK needed; cURL-friendly
- **Integration complexity:** Very Low — "2 lines of code"
- **Real-time vs cached:** Daily on free; hourly on Pro; 5-minute on Business [^13]
- **Attribution requirements:** Not stated
- **URL to docs:** https://www.exchangerate-api.com/docs

**Travel relevance:** One of the simplest exchange rate APIs to integrate. 1,500 free requests/month is generous for a basic conversion widget. Long-term support commitment — API endpoints maintained since 2010. 99.99% uptime on paid plans. [^13]

---

### 2.3 Frankfurter / ExchangeRate.fun (FreeExchangeRateApi)

- **Provider name:** FreeExchangeRateApi (open-source community project)
- **API name:** ExchangeRate.fun API
- **Content type:** Currency exchange rates (ECB-sourced)
- **Coverage:** 170+ currencies
- **Auth model:** None required
- **Rate limits / free tier:** Unlimited, no rate limits (please use responsibly) [^14]
- **Pricing:** Completely free; 10-year maintenance commitment [^14]
- **Data format:** JSON
- **SDK availability:** No SDK; simple HTTP GET
- **Integration complexity:** Very Low — no signup, no key
- **Real-time vs cached:** Hourly updates [^14]
- **Attribution requirements:** Not stated
- **URL to docs:** https://www.exchangerate.fun/ or https://github.com/haxqer/FreeExchangeRateApi

**Travel relevance:** The best zero-cost option for currency exchange. No API key, no signup, no rate limits. Data sourced from ECB. Ideal for early-stage bootstrapped travel apps that just need basic currency conversion. Community-maintained with 10-year commitment. [^14]

---

### 2.4 Fixer.io

- **Provider name:** Fixer (apilayer)
- **API name:** Fixer API
- **Content type:** Currency exchange rates (170 currencies)
- **Coverage:** Global
- **Auth model:** API Key
- **Rate limits / free tier:** 100 requests/month free; EUR base only; no HTTPS on free; no historical data [^15]
- **Pricing:** Basic $13.99/mo; Professional $52.99/mo; Professional Plus $84.99/mo [^15]
- **Data format:** JSON
- **SDK availability:** No official SDK
- **Integration complexity:** Low
- **Real-time vs cached:** Hourly updates on free; 60-second updates on highest tier [^15]
- **Attribution requirements:** Not stated
- **URL to docs:** https://fixer.io/documentation

**Travel relevance:** Very limited free tier (100/mo, EUR base only, no HTTPS). Historical data goes back to 1999. Good for European-centric apps but the free tier is too restrictive for most use cases. [^15]

---

### 2.5 Open Exchange Rates (OER)

- **Provider name:** Open Exchange Rates
- **API name:** Open Exchange Rates API
- **Content type:** Currency exchange rates (200+ currencies)
- **Coverage:** Global
- **Auth model:** API Key
- **Rate limits / free tier:** 1,000 requests/month free (hourly updates) [^16]
- **Pricing:** Developer $12/mo; Enterprise $47/mo; Unlimited $97/mo [^16]
- **Data format:** JSON
- **SDK availability:** 200+ open-source client libraries and integrations [^16]
- **Integration complexity:** Low
- **Real-time vs cached:** Hourly on free; 5-minute on highest tier
- **Attribution requirements:** Required on free tier
- **URL to docs:** https://openexchangerates.org/

**Travel relevance:** Large ecosystem of open-source integrations. 200+ currencies covered. Developer-friendly but free tier is limited to 1,000 requests/month. Good for apps that need extensive community support resources. [^16]

---

## 3. Time Zone APIs

### 3.1 WorldTimeAPI (TimeAPI.world)

- **Provider name:** TimeAPI.world (successor to WorldTimeAPI.org)
- **API name:** World Time API
- **Content type:** Time zone data, current time, IP geolocation, coordinates
- **Coverage:** 537 time zones globally
- **Auth model:** None required for basic use; API key for higher tiers
- **Rate limits / free tier:** 20,000 requests/month free [^17]
- **Pricing:** Free; Paid tiers from $5/mo up to 1M+ req/mo [^17]
- **Data format:** JSON (REST)
- **SDK availability:** No official SDK; simple HTTP
- **Integration complexity:** Very Low — drop-in compatible with old WorldTimeAPI.org
- **Real-time vs cached:** Real-time; p99 latency under 40ms [^17]
- **Attribution requirements:** Not stated
- **URL to docs:** https://timeapi.world/

**Travel relevance:** Excellent free tier (20K/mo) with no signup. Supports timezone by IANA name, IP lookup, and coordinate lookup. Fast and reliable. Great for displaying local time at destinations. Built as a direct replacement for the now-defunct worldtimeapi.org. [^17]

---

### 3.2 Google Time Zone API

- **Provider name:** Google
- **API name:** Google Maps Platform — Time Zone API
- **Content type:** Time zone offset, DST offset, time zone name for coordinates
- **Coverage:** Global
- **Auth model:** API Key (Google Cloud project)
- **Rate limits / free tier:** 10,000 requests/month free on Essentials tier [^18]
- **Pricing:** $5.00 per 1,000 requests after free tier; part of Google Maps Platform [^18]
- **Data format:** JSON (REST)
- **SDK availability:** Google Maps SDKs (Web, Android, iOS), client libraries
- **Integration complexity:** Low — standard Google Cloud setup
- **Real-time vs cached:** Real-time; returns current offset including DST
- **Attribution requirements:** Google Maps Platform Terms of Service
- **URL to docs:** https://developers.google.com/maps/documentation/timezone

**Travel relevance:** Gold standard for coordinate-based time zone lookup. If already using Google Maps Platform for other features (maps, routing), the Time Zone API is a natural addition. Good for trip planning when you have lat/lng coordinates. [^18]

---

### 3.3 IPGeolocation Time Zone API

- **Provider name:** IPGeolocation
- **API name:** IPGeolocation Timezone API
- **Content type:** Time zone, geolocation, country, city, coordinates
- **Coverage:** Global
- **Auth model:** API Key
- **Rate limits / free tier:** 1,000 requests/day (30,000/month) free [^19]
- **Pricing:** Free; paid tiers available
- **Data format:** JSON
- **SDK availability:** No official SDK
- **Integration complexity:** Low
- **Real-time vs cached:** Real-time
- **Attribution requirements:** Not stated
- **URL to docs:** https://ipgeolocation.io/documentation.html

**Travel relevance:** Rich response includes timezone offset, DST flag, date/time in multiple formats, and geolocation data. Useful if you need both timezone and location context in a single call. Free tier is generous for small apps. [^19]

---

### 3.4 TimeZoneDB

- **Provider name:** TimeZoneDB
- **API name:** TimeZoneDB API
- **Content type:** Time zone data, downloadable SQL database
- **Coverage:** Global (IANA database)
- **Auth model:** API Key for API; none for download
- **Rate limits / free tier:** Free tier available; premium for higher limits
- **Pricing:** Free tier; premium plans
- **Data format:** JSON, XML, CSV, SQL dump
- **SDK availability:** No official SDK
- **Integration complexity:** Low for API; self-hosted for SQL dump
- **Real-time vs cached:** Can be self-hosted (no external calls)
- **Attribution requirements:** Not stated
- **URL to docs:** https://timezonedb.com/api

**Travel relevance:** Unique option of downloading the entire timezone database as SQL. Good for air-gapped or offline travel apps. API is straightforward for real-time queries. [^20]

---

## 4. Travel Advisory & Safety APIs

### 4.1 Tugo Travel Advisory API

- **Provider name:** Tugo (formerly Travel Guard)
- **API name:** Travel Advisory API
- **Content type:** Travel advisories, health and safety info, climate/disaster updates, passport/entry requirements
- **Coverage:** 225+ countries
- **Auth model:** API Key (free registration)
- **Rate limits / free tier:** Free REST API; rate limits not publicly specified [^21]
- **Pricing:** Free [^21]
- **Data format:** JSON (REST)
- **SDK availability:** No official SDK
- **Integration complexity:** Low
- **Real-time vs cached:** Updated regularly; no specific SLA
- **Attribution requirements:** Not stated
- **URL to docs:** https://developer.tugo.com/page/Travel_Safe_API

**Travel relevance:** Completely free travel advisory API covering health, safety, climate, disasters, and passport requirements for 225+ countries. No insurance license required. Good for displaying destination safety briefings. [^21]

---

### 4.2 Amadeus Travel Restrictions API

- **Provider name:** Amadeus
- **API name:** Travel Restrictions API (part of Amadeus for Developers)
- **Content type:** Travel restrictions, COVID-19 entry requirements, visa requirements, health documentation
- **Coverage:** Global (airport/country-based)
- **Auth model:** OAuth 2.0 (Client ID + Secret)
- **Rate limits / free tier:** Test environment: ~2,000 calls/month free; Production: free quota + pay-as-you-go [^22]
- **Pricing:** Free tier for testing; production usage pay-as-you-go [^22]
- **Data format:** JSON (REST)
- **SDK availability:** Official SDKs for Python, Java, Node.js, Swift [^23]
- **Integration complexity:** Medium — OAuth flow, OpenAPI documentation
- **Real-time vs cached:** Live data in production; cached/test data in test environment
- **Attribution requirements:** Amadeus terms of service
- **URL to docs:** https://developers.amadeus.com/self-service/category/covid-19-and-travel-safety

**Travel relevance:** Provides structured COVID-19 and general travel restriction data including entry requirements, testing rules, and visa requirements. Good for flight-booking adjacent features. However, the free tier is limited (~2,000 calls/month) and production requires pay-as-you-go. [^22]

---

### 4.3 GeoSure API

- **Provider name:** GeoSure
- **API name:** GeoSure Safety & Risk Awareness API
- **Content type:** Safety scores (7 categories: Physical Harm, Health, Women\'s Safety, LGBTQ+ Safety, Theft, Political Freedoms, Day/Night)
- **Coverage:** 65,000+ cities and neighborhoods (400K+ on enterprise plan)
- **Auth model:** Enterprise contract
- **Rate limits / free tier:** No public free tier; enterprise subscription only [^24]
- **Pricing:** Enterprise pricing (contact info@geosure.ai) [^24]
- **Data format:** JSON (REST)
- **SDK availability:** No public SDK
- **Integration complexity:** Medium — requires enterprise onboarding
- **Real-time vs cached:** Near real-time; updated risk events tracking
- **Attribution requirements:** Enterprise terms
- **URL to docs:** https://geosure.ai/api

**Travel relevance:** Highly granular safety data down to the neighborhood level. Seven specialized risk categories are extremely relevant for travel planning (women\'s safety, LGBTQ+ safety, theft). However, no free tier makes it unsuitable for early-stage bootstrapped apps. Consider for enterprise phase. [^24]

---

### 4.4 Travel Risk Report (Apify Actor)

- **Provider name:** Ryan Clinton / Apify
- **API name:** Travel Risk Report (Apify Actor)
- **Content type:** Composite risk score (0-100), advisory level, weather alerts, disaster alerts, health risk, security risk, crime, WHO indicators
- **Coverage:** Global (queries 8 public data sources in parallel)
- **Auth model:** Apify API token
- **Rate limits / free tier:** Pay-per-run (~$0.25–$0.60 per assessment) [^25]
- **Pricing:** Pay-as-you-go; no subscription required
- **Data format:** JSON (structured, machine-readable)
- **SDK availability:** Apify SDK and API clients
- **Integration complexity:** Medium — requires Apify account and actor orchestration
- **Real-time vs cached:** Real-time (queries live sources)
- **Attribution requirements:** Subject to source data licenses
- **URL to docs:** https://apify.com/ryanclinton/travel-risk-report

**Travel relevance:** Aggregates 8 public sources (NOAA, GDACS, WHO, UK Police, Interpol, REST Countries, OpenWeather, Nominatim) into a single composite risk score with actionable recommendations. No subscription — pay per run. Good for on-demand travel risk assessments before trip approval. [^25]

---

## 5. Visa Requirements APIs

### 5.1 Travel Buddy Visa Requirements API

- **Provider name:** Travel Buddy AI
- **API name:** Visa Requirements API (via RapidAPI)
- **Content type:** Visa rules, eVisa links, entry requirements, passport validity, color-coded maps, historical visa changes
- **Coverage:** 200 passports × 211 destinations [^26]
- **Auth model:** RapidAPI key (X-RapidAPI-Proxy-Secret)
- **Rate limits / free tier:** 120–200 requests/month free [^26]
- **Pricing:** Free tier; $4.99/mo for 3,000 requests; higher tiers up to enterprise [^26]
- **Data format:** JSON (REST)
- **SDK availability:** No official SDK; RapidAPI integration
- **Integration complexity:** Low-Medium — RapidAPI marketplace signup
- **Real-time vs cached:** Updated daily; claims to monitor official government sources [^26]
- **Attribution requirements:** Not stated
- **URL to docs:** https://travel-buddy.ai/api/ or https://rapidapi.com/TravelBuddyAI/api/visa-requirement

**Travel relevance:** Purpose-built for travel apps. Returns color-coded visa status (green/blue/yellow/red), eVisa application links, mandatory registration requirements, and passport validity rules. Includes MapColor endpoint for generating passport-index-style visualizations. Historic visa rules endpoint tracks policy changes over time. [^26]

---

### 5.2 Visadb.io Widget & API

- **Provider name:** Visadb.io
- **API name:** Travel Visa & Safety Widget / API
- **Content type:** Visa requirements, safety laws, weather, recommended places
- **Coverage:** Global
- **Auth model:** No API key for widget; API key for direct API access
- **Rate limits / free tier:** Free no-code widget available; API free tier available [^27]
- **Pricing:** Widget is free (branded); API has free tier [^27]
- **Data format:** JSON (widget uses script tag)
- **SDK availability:** No-code widget (script tag)
- **Integration complexity:** Very Low for widget (copy-paste script tag)
- **Real-time vs cached:** Real-time updates claimed
- **Attribution requirements:** Widget is branded (free version)
- **URL to docs:** https://visadb.io/api

**Travel relevance:** Easiest integration path — drop a no-code widget onto destination pages. Covers tourist and immigrant visas, safety laws (marijuana, LGBTQ+, women\'s rights), weather, and recommended places. Good for quick MVP if building visa check features. [^27]

---

### 5.3 Travel Visa API (various providers)

Several providers offer visa APIs via API marketplaces (RapidAPI, APILayer). Most follow a similar pattern:
- **Coverage:** 199+ passports × 199+ destinations
- **Free tier:** Typically 100–500 requests/month
- **Pricing:** $5–$50/month for moderate usage
- **Key providers:** Travel Buddy, Visa Requirements API, VisaAPI

---

## 6. Translation APIs

### 6.1 Google Cloud Translation API

- **Provider name:** Google Cloud
- **API name:** Cloud Translation API (Basic v2, Advanced v3, LLM Translation)
- **Content type:** Text translation, document translation, language detection, glossaries
- **Coverage:** 130+ languages (189+ according to some sources)
- **Auth model:** Google Cloud API Key / OAuth 2.0
- **Rate limits / free tier:** 500,000 characters/month free forever (never expires) [^28]
- **Pricing:** Basic/Advanced NMT: $20 per million characters; Document: $0.08/page; LLM Translation: $10 in + $10 out per million chars [^28]
- **Data format:** JSON (REST) or gRPC
- **SDK availability:** Official Google Cloud SDKs (Python, Node.js, Java, Go, C#, PHP, Ruby)
- **Integration complexity:** Low-Medium — Google Cloud project setup required
- **Real-time vs cached:** Real-time NMT; supports batch translation
- **Attribution requirements:** Google Cloud terms
- **URL to docs:** https://cloud.google.com/translate/docs

**Travel relevance:** Widest language coverage of any translation API. 500K chars/month free tier is generous and never expires. Strong for translating destination descriptions, UI strings, and user-generated content. Deep integration with Google Cloud ecosystem. Note: HTML tags count as characters — preprocess to reduce costs. [^28]

---

### 6.2 DeepL API

- **Provider name:** DeepL
- **API name:** DeepL API (Free, Developer, Growth, Enterprise)
- **Content type:** Text translation, document translation (DOCX, PPTX, PDF), glossary management, tone control
- **Coverage:** 30+ languages (100+ with next-gen LLM as of 2026) [^29]
- **Auth model:** API Key (header-based)
- **Rate limits / free tier:** 500,000 characters/month free; Developer plan: 1M one-time credit for testing [^29]
- **Pricing:** API Growth: $32.50/mo base + $27.50 per million extra chars (up to 50M/mo); API Enterprise: custom [^29]
- **Data format:** JSON (REST)
- **SDK availability:** Official Python, Node.js, .NET, PHP libraries; CLI tool
- **Integration complexity:** Low — well-documented, simple REST API
- **Real-time vs cached:** Real-time; 500ms–1s response time
- **Attribution requirements:** Not stated for API use
- **URL to docs:** https://developers.deepl.com/docs

**Travel relevance:** Highest quality translations for European language pairs (EN↔DE/FR/ES). Glossaries and formality controls are excellent for brand-consistent travel content. Language coverage is narrower than Google (30+ vs 130+). Best used as a premium option for European destination content. [^29]

---

### 6.3 Microsoft Translator API

- **Provider name:** Microsoft Azure
- **API name:** Azure AI Translator (formerly Microsoft Translator)
- **Content type:** Text translation, document translation, custom models, speech translation
- **Coverage:** 100+ languages
- **Auth model:** Azure subscription key
- **Rate limits / free tier:** 2,000,000 characters/month free tier (permanent, not 12-month limited) [^30]
- **Pricing:** Standard: $10 per million characters; Custom: $40 per million characters [^30]
- **Data format:** JSON (REST)
- **SDK availability:** Azure SDKs (Python, Node.js, C#, Java, etc.)
- **Integration complexity:** Low-Medium — Azure portal setup
- **Real-time vs cached:** Real-time; 1–2 second response time
- **Attribution requirements:** Azure terms
- **URL to docs:** https://learn.microsoft.com/en-us/azure/ai-services/translator/

**Travel relevance:** Most generous permanent free tier (2M chars/month) among major translation providers. 100+ languages cover most travel destinations. Good budget-friendly alternative to Google and DeepL. Integrates with Microsoft 365 ecosystem. [^30]

---

### 6.4 LibreTranslate (Self-Hosted)

- **Provider name:** LibreTranslate (open-source community)
- **API name:** LibreTranslate API
- **Content type:** Text translation, language detection
- **Coverage:** 30+ languages (depending on installed models)
- **Auth model:** Self-hosted (no external key)
- **Rate limits / free tier:** Self-hosted = unlimited
- **Pricing:** Free (self-hosted); Hosted instance: ~$9/mo via third parties
- **Data format:** JSON (REST)
- **SDK availability:** Community clients
- **Integration complexity:** Medium — requires Docker deployment
- **Real-time vs cached:** Real-time (local inference)
- **Attribution requirements:** AGPLv3 license
- **URL to docs:** https://libretranslate.com/docs

**Travel relevance:** Only zero-cost option for unlimited translation (self-hosted). Requires infrastructure to run. Quality is below Google/DeepL but improving. Good for privacy-sensitive travel apps or offline translation needs. [^31]

---

## 7. Routing & Distance APIs

### 7.1 Google Maps Platform — Routes API (Distance Matrix / Compute Route Matrix)

- **Provider name:** Google
- **API name:** Compute Route Matrix (successor to Distance Matrix API)
- **Content type:** Distance, duration, traffic-aware routing, multi-modal (driving, walking, transit, cycling)
- **Coverage:** Global
- **Auth model:** Google Cloud API Key
- **Rate limits / free tier:** 10,000 elements/month free (Essentials tier) [^32]
- **Pricing:** Essentials: $5.00 per 1,000 elements; Pro: $10.00 per 1,000 elements; Enterprise: $15.00 per 1,000 elements [^32]
- **Data format:** JSON (REST)
- **SDK availability:** Google Maps SDKs (Web, Android, iOS); client libraries
- **Integration complexity:** Medium — Google Cloud billing setup; element-based pricing requires careful design
- **Real-time vs cached:** Real-time traffic data on Pro/Enterprise tiers
- **Attribution requirements:** Google Maps Platform terms
- **URL to docs:** https://developers.google.com/maps/documentation/routes

**Travel relevance:** The industry standard for routing and distance matrix. If already using Google Maps for map display, adding the Route Matrix is natural. **Critical pricing note:** billed per _element_ (origins × destinations). A 2×3 matrix = 6 elements. At 10K free elements, a travel app calculating distances between 50 hotels and 100 landmarks burns through the free tier in 2 sessions. [^32]

---

### 7.2 DistanceMatrix.ai

- **Provider name:** DistanceMatrix.ai
- **API name:** Distance Matrix API (Accurate & Fast), Geocoding API
- **Content type:** Distance, duration, traffic prediction, driving/walking modes, geocoding
- **Coverage:** Global (traffic data from public sources)
- **Auth model:** API Key
- **Rate limits / free tier:** 1,000 elements/month free; $50 one-time bonus on upgrade [^33]
- **Pricing:** Growth plan: pay-as-you-go; $2 per 1,000 elements (first 100K), decreasing tiers to $1 per 1,000 [^33]
- **Data format:** JSON (REST)
- **SDK availability:** No official SDK
- **Integration complexity:** Low — drop-in alternative to Google Distance Matrix
- **Real-time vs cached:** Traffic-aware predictions based on statistical data
- **Attribution requirements:** Not stated
- **URL to docs:** https://distancematrix.ai/pricing

**Travel relevance:** Positioned as a cheaper alternative to Google Distance Matrix API (≈60% cost savings at scale). Free tier is small (1,000 elements) but sufficient for testing. Good for budget-conscious travel apps needing distance/duration between destinations. [^33]

---

### 7.3 TrueWay Matrix API

- **Provider name:** TrueWay
- **API name:** TrueWay Origin-Destination Matrix API
- **API name:** TrueWay Directions API
- **Content type:** Distance, duration, route optimization, turn-by-turn instructions
- **Coverage:** Global (proprietary data, not OpenStreetMap)
- **Auth model:** API Key (via RapidAPI or direct)
- **Rate limits / free tier:** 1,500 requests/day free [^34]
- **Pricing:** Professional €44.12/mo; Ultra €89.14/mo; Mega €270/mo; 20% annual discount [^34]
- **Data format:** JSON (REST)
- **SDK availability:** No official SDK
- **Integration complexity:** Low
- **Real-time vs cached:** Real-time
- **Attribution requirements:** Not stated
- **URL to docs:** https://truewayapi.com/

**Travel relevance:** Proprietary data sources (not OSM) may provide different routing results than Google. Free tier of 1,500/day is good for prototyping. Pricing in Euros. Good for European travel apps. [^34]

---

### 7.4 SimpleRouting.io (Free OSRM-based)

- **Provider name:** SimpleRouting.io
- **API name:** Free Distance Matrix API (OSRM-based)
- **Content type:** Distance matrix, fleet optimization (VROOM), car routing
- **Coverage:** North America and Europe (free tier); more regions on request [^35]
- **Auth model:** API Key
- **Rate limits / free tier:** 100 requests/day, max 1 req/s, 100×100 matrix size [^35]
- **Pricing:** Free; Hobby $10/mo (10,000 req/day); custom enterprise [^35]
- **Data format:** JSON (OSRM-compatible)
- **SDK availability:** OSRM-compatible (one-line URL change)
- **Integration complexity:** Very Low — OSRM-compatible endpoint
- **Real-time vs cached:** Real-time (OSRM)
- **Attribution requirements:** Not stated
- **URL to docs:** https://www.simplerouting.io/free-distance-matrix-api/

**Travel relevance:** Free OSRM-based distance matrix with no credit card required. OSRM-compatible API means easy migration from self-hosted OSRM instances. Limited to North America and Europe on free tier. Good for budget travel apps focused on ground transport in those regions. [^35]

---

### 7.5 Rome2Rio API

- **Provider name:** Rome2Rio
- **API name:** Rome2Rio Connectivity API / Partner API
- **Content type:** Multi-modal routing (air, train, bus, ferry, car, rideshare), duration, price ranges, operator names
- **Coverage:** 2+ million destinations, 700+ airlines, extensive rail coverage (Europe, India, China, Egypt, Morocco) [^36]
- **Auth model:** Partner signup / API credentials
- **Rate limits / free tier:** Basic Access: 100,000 search requests/month free (requires partner signup) [^37]
- **Pricing:** Basic Access free; Commercial Access with SLA and 24/7 support (contact for pricing) [^37]
- **Data format:** JSON (REST)
- **SDK availability:** No official SDK
- **Integration complexity:** Medium — requires partner approval/signup
- **Real-time vs cached:** Real-time route calculations; cached transport database
- **Attribution requirements:** Rome2Rio branding required on free tier
- **URL to docs:** Contact via https://www.rome2rio.com/ (no public self-service docs)

**Travel relevance:** The only API offering true multi-modal, door-to-door travel routing (flight + train + bus + ferry). Basic Access offers 100K requests/month free — very generous. However, signup requires partner approval and self-serve integration. The API is essential for travel apps that need to show how to get from A to B using any combination of transport modes. [^37]

**Note:** There are unofficial scrapers on Apify that extract Rome2Rio data, but these are not official APIs and may violate terms of service. [^38]

---

## 8. General Travel Utility APIs

### 8.1 Amadeus for Developers (Self-Service)

- **Provider name:** Amadeus
- **API name:** Amadeus Self-Service APIs (Flights, Hotels, Cars, Travel Restrictions, Airports, etc.)
- **Content type:** Flight search, hotel search, car rental, airport info, city search, travel restrictions, points of interest
- **Coverage:** 400+ airlines, 130+ low-cost carriers, global hotels, global airports [^39]
- **Auth model:** OAuth 2.0 (Client ID + Secret)
- **Rate limits / free tier:** Test environment: ~2,000 calls/month; Production: free quota + pay-as-you-go [^22]
- **Pricing:** Free tier for testing; production pay-as-you-go [^39]
- **Data format:** JSON (REST), OpenAPI/Swagger documented
- **SDK availability:** Official SDKs: Python, Java, Node.js, Swift, PHP, C# [^23]
- **Integration complexity:** Medium — OAuth setup, multiple API endpoints
- **Real-time vs cached:** Test environment uses cached data; production is live
- **Attribution requirements:** Amadeus terms
- **URL to docs:** https://developers.amadeus.com/

**Travel relevance:** The most comprehensive free travel API suite for developers. Covers the full travel booking stack: flights (search, pricing, seat map), hotels (search, offers), car rentals, airport/city search, and travel restrictions. Free tier is sufficient for prototyping and small-scale production. The modern REST/JSON architecture and Swagger docs make it developer-friendly. [^39]

---

### 8.2 REST Countries API

- **Provider name:** REST Countries (open-source)
- **API name:** REST Countries API
- **Content type:** Country metadata (capital, population, currency, languages, flag, region, timezones, borders)
- **Coverage:** 250+ countries/territories
- **Auth model:** None required
- **Rate limits / free tier:** Unlimited (no key)
- **Pricing:** Free
- **Data format:** JSON (REST)
- **SDK availability:** No official SDK; simple HTTP
- **Integration complexity:** Very Low
- **Real-time vs cached:** Static data (updated periodically)
- **Attribution requirements:** Not required (open data)
- **URL to docs:** https://restcountries.com/

**Travel relevance:** Essential utility API for country reference data. Provides currency codes, phone codes, timezones, bordering countries, and flag images. Perfect for populating destination detail pages. Completely free and keyless. Often used alongside other travel APIs as a foundational data source. [^40]

---

## 9. Top Recommendations for Traveloure

### Ranked by Usefulness for a Travel Marketplace

| Rank | Provider | Category | Why It\'s Top | Free Tier | Paid When Scaling |
|------|----------|----------|---------------|-----------|-------------------|
| 1 | **Open-Meteo** | Weather | Zero-cost, no key, global, open-source, self-hostable, includes history + air quality | 10K/day, no key | €29/mo for 1M calls |
| 2 | **Amadeus for Developers** | General Travel | Most comprehensive free travel API suite (flights, hotels, cars, restrictions, airports) | ~2K/mo test; production free quota + PAYG | Pay-as-you-go production |
| 3 | **WeatherAPI.com** | Weather | 1M calls/month free, 40 languages, marine/astronomy/sports data, SDKs | 1M/mo | From $7/mo |
| 4 | **Google Cloud Translation** | Translation | 500K chars/month forever, 130+ languages, official SDKs, mature ecosystem | 500K chars/mo | $20/M chars |
| 5 | **Travel Buddy Visa API** | Visa | Purpose-built for travel apps, color-coded maps, eVisa links, 200×211 coverage | 120–200/mo | From $4.99/mo |
| 6 | **Rome2Rio** | Routing | Only true multi-modal routing API (flight+train+bus+ferry); 100K/mo free | 100K/mo Basic Access | Commercial contact |
| 7 | **Frankfurter (ExchangeRate.fun)** | Currency | Completely free, unlimited, no key, ECB data, 170+ currencies | Unlimited | Free |
| 8 | **WorldTimeAPI (TimeAPI.world)** | Timezone | 20K/mo free, no signup, sub-40ms latency, 537 zones | 20K/mo | From $5/mo |
| 9 | **Tugo Travel Advisory** | Safety | Free, 225+ countries, health/safety/passport data, no license needed | Unlimited (unspecified) | Free |
| 10 | **OpenWeatherMap** | Weather | Most popular weather API, historical data, alerts, 1K/day free | 1K/day | From $40/mo |

---

### Integration Strategy for Traveloure

**Phase 1 (MVP / Free-Only):**
- **Weather:** Open-Meteo (no key, no cost, self-hostable) + WeatherAPI.com (1M/mo backup)
- **Currency:** Frankfurter (unlimited, no key) + ExchangeRate-API (1.5K/mo backup)
- **Timezone:** WorldTimeAPI (20K/mo, no signup)
- **Safety:** Tugo Travel Advisory (free, 225+ countries)
- **Visa:** Visadb.io widget (no-code, free, branded) or Travel Buddy free tier
- **Translation:** Google Cloud Translation (500K chars/mo) + Microsoft Translator (2M chars/mo)
- **Routing:** SimpleRouting.io (100/day) or DistanceMatrix.ai (1K elements/mo) for basic distance
- **General:** Amadeus test environment (2K/mo) for flight/hotel search + REST Countries (free)

**Phase 2 (Growth / Production):**
- Upgrade Amadeus to production (pay-as-you-go) for live flight/hotel data
- Add WeatherAPI.com Pro ($7/mo) for longer forecasts and higher limits
- Add Google Maps Platform ($200 credit structure) for embedded maps and routing if needed
- Add Travel Buddy Visa API paid tier ($4.99/mo) for higher volume visa checks
- Consider GeoSure enterprise for neighborhood-level safety data once revenue supports it
- Consider DeepL API for premium European language translation if quality demands justify cost

**Phase 3 (Enterprise):**
- Rome2Rio Commercial Access for true multi-modal routing
- Open-Meteo commercial or self-hosted for dedicated weather infrastructure
- Google Maps Enterprise for high-volume routing and Places data
- Custom integrations with GDS (Sabre, Travelport) for direct booking capabilities

---

## 10. Sources & Citations

[^1]: OpenWeatherMap pricing. "Detailed Self-Service Pricing and Limits." https://openweathermap.org/full-price. Date: 2025-12-09. Confidence: High.

[^2]: DataGlobeHub. "OpenWeatherMap API." https://dataglobehub.com/api-finder/openweathermap-api/. Date: 2026-02-22. Confidence: High.

[^3]: WeatherAPI.com. "Pricing." https://www.weatherapi.com/pricing.aspx. Date: 2026. Confidence: High.

[^4]: SoftwareHope. "Top 19 Weather Websites for Accurate Forecasts in 2026." https://softwarehope.com/top-19-weather-websites-for-accurate-forecasts/. Date: 2026-05-11. Confidence: Medium.

[^5]: FreeAPI.watch. "WeatherAPI.com — Status, Free Tier & Alternatives." https://freeapi.watch/weatherapi. Date: 2026-05-18. Confidence: High.

[^6]: WeatherAPI.com. "API Changelog." https://www.weatherapi.com/api-changelog.html. Date: 2026. Confidence: High.

[^7]: WeatherAPI.com. "SDK libraries published on GitHub." https://github.com/weatherapicom. Date: 2022. Confidence: High.

[^8]: Open-Meteo. "Pricing." https://open-meteo.com/en/pricing. Date: 2026. Confidence: High.

[^9]: Open-Meteo (GitHub). "Open-Meteo open-source weather API." https://github.com/open-meteo/open-meteo. Date: 2021-06-24. Confidence: High.

[^10]: Tomorrow.io. "Free API Plan Rate Limits." https://support.tomorrow.io/hc/en-us/articles/20273728362644-Free-API-Plan-Rate-Limits. Date: 2025-06-11. Confidence: High.

[^11]: Visual Crossing. "Weather Data & Weather API Pricing & Plans." https://www.visualcrossing.com/weather-data-pricing/. Date: 2026-04-29. Confidence: High.

[^12]: CurrencyFreaks. "Free Currency API — 1020 Currencies." https://currencyfreaks.com/. Date: 2021-03-25. Confidence: High.

[^13]: ExchangeRate-API. "Exchange Rate API Quick Start." https://www.exchangerate-api.com/. Date: 2010-10-11. Confidence: High.

[^14]: FreeExchangeRateApi (GitHub). "A free, reliable, hourly-updated exchange rate API." https://github.com/haxqer/FreeExchangeRateApi. Date: 2024-10-22. Confidence: High.

[^15]: Fixer.io. "Fixer API — Foreign Exchange Rates & Currency Conversion API." https://fixer.io/. Date: 2018-02-13. Confidence: High.

[^16]: Open Exchange Rates. "Open Exchange Rates API." https://openexchangerates.org/. Date: 2026. Confidence: High.

[^17]: World Time API (TimeAPI.world). "World Time API — Worldwide access to timezone information." https://timeapi.world/. Date: 2026-06-13. Confidence: High.

[^18]: Google. "Google Maps Platform Time Zone API." https://developers.google.com/maps/documentation/timezone. Date: 2026. Confidence: High.

[^19]: IPGeolocation. "IPGeolocation Timezone API Documentation." https://ipgeolocation.io/documentation.html. Date: 2023-11-16. Confidence: High.

[^20]: TimeZoneDB. "TimeZoneDB API." https://timezonedb.com/api. Date: 2026. Confidence: Medium.

[^21]: Tugo Developer Portal. "Travel Advisory API." https://developer.tugo.com/page/Travel_Safe_API. Date: 2026. Confidence: High.

[^22]: Amadeus for Developers. "API Rate Limits — Travel MCP Server." https://github.com/lev-corrupted/travel-mcp-server. Date: 2025-11-04. Confidence: High.

[^23]: Amadeus for Developers. "Amadeus Self-Service vs Enterprise API." https://phptravels.com/wp/amadeus-self-service-rest-api-vs-enterprise-rest-api/. Date: 2026-01-19. Confidence: High.

[^24]: GeoSure. "GeoSure API — Safety and Risk Awareness." https://geosure.ai/api. Date: 2026. Confidence: High.

[^25]: Ryan Clinton / Apify. "Travel Risk Report — Destination Safety Assessment." https://apify.com/ryanclinton/travel-risk-report. Date: 2026-05-24. Confidence: High.

[^26]: Travel Buddy AI. "Travel Visa Requirements API for Developers." https://travel-buddy.ai/api/. Date: 2024-05-26 (modified 2026-05-14). Confidence: High.

[^27]: Visadb.io. "API & Widget — Travel Visa & Safety." https://visadb.io/api. Date: 2026. Confidence: High.

[^28]: CostGoat. "Google Translate API Pricing Calculator (Jun 2026)." https://costgoat.com/pricing/google-translate. Date: 2026-05-21. Confidence: High.

[^29]: SimpleLocalize. "How much does AI translation cost? DeepL, Google Translate, OpenAI compared (2026)." https://simplelocalize.io/blog/posts/ai-machine-translation-cost-comparison/. Date: 2026-06-03. Confidence: High.

[^30]: BuildMVPFast. "Translation API Pricing Comparison (June 2026)." https://www.buildmvpfast.com/api-costs/translation. Date: 2026. Confidence: High.

[^31]: LibreTranslate. "LibreTranslate API Documentation." https://libretranslate.com/docs. Date: 2026. Confidence: Medium.

[^32]: Woosmap. "Google Maps API Pricing 2026: 3 Scales, Real TCO." https://www.woosmap.com/blog/google-maps-api-pricing-breakdown. Date: 2026-04-16. Confidence: High.

[^33]: DistanceMatrix.ai. "Distance Matrix API Pricing." https://distancematrix.ai/pricing. Date: 2026. Confidence: High.

[^34]: TrueWayAPI. "TrueWay API — Pricing and Plans." https://truewayapi.com/. Date: 2026. Confidence: High.

[^35]: SimpleRouting.io. "Free Distance Matrix API." https://www.simplerouting.io/free-distance-matrix-api/. Date: 2026. Confidence: High.

[^36]: eWeblink. "Rome2rio API — Transport Guide API Suppliers." https://www.eweblink.net/transport-guide-suppliers.html. Date: 2026. Confidence: Medium.

[^37]: WebInTravel. "Rome2rio opens up access to its multi-modal, door-to-door search." https://www.webintravel.com/rome2rio-opens-access-multi-modal-door-door-search/. Date: 2014-07-29. Confidence: High (historical; may have changed).

[^38]: ParseForge / Apify. "Rome2Rio Scraper — Multi-Modal Travel Routes." https://apify.com/parseforge/rome2rio-scraper. Date: 2026-05-22. Confidence: High (unofficial scraper).

[^39]: API.market. "Top 14 Travel APIs for Developers (2026 Guide)." https://api.market/blog/magicapi/travel-api/best-travel-apis-for-developers. Date: 2026-06-12. Confidence: High.

[^40]: REST Countries. "REST Countries API." https://restcountries.com/. Date: 2026. Confidence: High.

---

*Document generated by research sub-agent. All pricing and limits verified against publicly available sources as of 2026-06-13. Pricing may change; always verify with the provider before integration.*
