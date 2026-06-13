# Dimension 04: Review & Rating APIs — Research Findings

**Date:** 2026-06-13  
**Scope:** APIs for travel reviews, ratings, sentiment analysis, review aggregation, and structured review data accessible to developers.  
**Researcher:** Sub-agent (Dim-04 Review & Rating APIs)

---

## Executive Summary

Social proof drives travel bookings. This scan covers 11+ providers that supply review and rating data via developer APIs, including official platform APIs (Tripadvisor, Google, Yelp, Trustpilot), specialized aggregators (DataForSEO, Zembra, TrustYou, TravelScrape), and scraping-as-a-service layers (Outscraper, Apify, Scrapfly). For a travel marketplace, the best strategy is a **hybrid stack**: an official partner API for consumer trust (Tripadvisor), a low-cost aggregator for bulk data (DataForSEO), and a scraping/API bridge for deep review coverage where official limits are too restrictive (Outscraper or SerpAPI-style providers).

---

## 1. Tripadvisor Content API (Official)

- **API Name:** Tripadvisor Content API (transitioning to Terra API platform)  
- **Content Type:** Listings, overall rating, ranking, subratings, awards, review count, up to 5 recent reviews per location, up to 5 high-quality photos, price level, write-a-review links.  
- **Coverage:** 8+ million locations (hotels, restaurants, attractions, POIs), 1+ billion reviews, 29 languages.  
- **Auth Model:** API key (partner approval required for B2C; pay-as-you-go for new portal).  
- **Rate Limits / Free Tier:** First 5,000 API calls free per month. Approved B2C partners: 10,000 calls/day. Development: 1,000 calls/day.  
- **Pricing:** Free for approved B2C traffic-exchange partners. New pay-as-you-go portal requires credit card and daily budget cap. Volume discounts available >500,000 calls/month.  
- **Data Format:** JSON.  
- **SDK Availability:** REST only; no official SDKs.  
- **Integration Complexity:** Medium — requires partner application and compliance with display requirements.  
- **Real-time vs Cached:** Cached; continuously updated.  
- **Attribution / Licensing:** Mandatory Tripadvisor attribution (logo + link back). Content API Master Terms apply.  
- **Docs:** https://developer-tripadvisor.com/content-api/ | https://tripadvisor-content-api.readme.io/reference/faq

Claim: Tripadvisor Content API is free for approved B2C partners and provides up to 5 reviews per location.  
Source: Tripadvisor Content API FAQ  
URL: https://tripadvisor-content-api.readme.io/reference/faq  
Date: 2022-04-14 (docs updated)  
Confidence: High

---

## 2. DataForSEO Reviews API

- **API Name:** DataForSEO Reviews API (Business Data API)  
- **Content Type:** Full review text, images, star ratings, reviewer profiles, timestamps, owner responses. Covers Google, Tripadvisor, Trustpilot, Google Play, App Store, Amazon.  
- **Coverage:** Millions of business profiles across major review platforms.  
- **Auth Model:** API key.  
- **Rate Limits / Free Tier:** 110 API calls/minute; up to 100 tasks per POST call. $1 free trial credit.  
- **Pricing:** Pay-as-you-go. Standard priority: $0.00075 per 10 reviews returned. High priority: $0.0015 per 10 reviews. ~$75 per 1M reviews at standard priority. Additional cost for language filtering.  
- **Data Format:** JSON.  
- **SDK Availability:** REST; no official SDKs but straightforward HTTP integration.  
- **Integration Complexity:** Low — well-documented, task-based POST/GET model.  
- **Real-time vs Cached:** Standard queue up to 45 min; high-priority queue up to 1 minute.  
- **Attribution / Licensing:** No third-party attribution required (DataForSEO scrapes publicly available data).  
- **Docs:** https://dataforseo.com/apis/reviews-api | https://dataforseo.com/pricing/business-data

Claim: DataForSEO charges per batch of 10 reviews returned, with standard turnaround up to 45 minutes and high priority up to 1 minute.  
Source: DataForSEO Tripadvisor Reviews Pricing  
URL: https://dataforseo.com/pricing/business-data/business-data-api-tripadvisor-pricing  
Date: 2024-08-20  
Confidence: High

---

## 3. Zembra API

- **API Name:** Zembra Reviews API  
- **Content Type:** Reviews, comments, reactions from 60+ platforms in a single standardized JSON format.  
- **Coverage:** 60+ sources including Tripadvisor, Foursquare, Reddit, and major travel sites.  
- **Auth Model:** API key.  
- **Rate Limits / Free Tier:** Not publicly specified.  
- **Pricing:** Credit-based. First 10,000 credits from $1 ($0.0012/credit). $0.0004/credit at highest volume. Auto-renewed review jobs: 50 credits + 3 credits per new review returned.  
- **Data Format:** JSON.  
- **SDK Availability:** SDKs for C#, Python, and JavaScript.  
- **Integration Complexity:** Low — single-call lookup by business name/address.  
- **Real-time vs Cached:** Supports auto-renewed jobs for near-real-time updates; deduplicated so you only pay for new reviews.  
- **Attribution / Licensing:** Not required.  
- **Docs:** https://docs.zembra.io/ | https://zembratech.com/reviews-api-pricing/

Claim: Zembra scrapes reviews from over 60 companies and returns them in a standardized JSON format with SDKs in C#, Python, and JavaScript.  
Source: Altexsoft Travel API Guide  
URL: https://www.altexsoft.com/blog/travel-and-booking-apis-for-online-travel-and-tourism-service-providers/  
Date: 2025-04-09  
Confidence: High

---

## 4. Yelp Fusion API (Consumer) + Yelp Insights API (B2B)

### Yelp Fusion API
- **API Name:** Yelp Fusion API  
- **Content Type:** Business search, details, up to 3 most recent reviews per business, photos, ratings, price levels, categories, transactions.  
- **Coverage:** Millions of businesses across 32 countries.  
- **Auth Model:** API key (OAuth 2.0).  
- **Rate Limits / Free Tier:** Free tier has been eliminated as of 2024; all accounts converted to paid licensing.  
- **Pricing:** Starter: $7.99 per 1,000 calls. Plus (reviews): $9.99 per 1,000 calls. Enterprise: $14.99 per 1,000 calls. Daily quotas apply (e.g., 300–500 calls/day depending on plan).  
- **Data Format:** JSON.  
- **SDK Availability:** Python, Java, Node.js, Swift, and others.  
- **Integration Complexity:** Low.  
- **Real-time vs Cached:** Real-time.  
- **Attribution / Licensing:** Yelp logo and attribution required.  
- **Docs:** https://www.yelp.com/developers/documentation/v3

### Yelp Insights API (B2B Data Licensing)
- **Content Type:** Premium: full review text, photos, historical star ratings, consumer intent signals, business viability score, location popularity score.  
- **Pricing:** Per unique location on a rolling 12-month basis. Base: $0.04/location; Enhanced: $0.06/location; Premium: $0.08/location. Social Analytics (respond-to-reviews) and Yelp AI API ($25/1,000 calls) are enterprise tiers.  
- **Docs:** https://business.yelp.com/data/resources/pricing/

Claim: Yelp eliminated its free Fusion API tier in 2024 and converted all accounts to paid licensing; review access requires the Plus tier at $9.99 per 1,000 calls.  
Source: App Developer Magazine  
URL: https://appdevelopermagazine.com/yelp-fusion-api-outrageous-new-pricing/  
Date: 2024-08-01  
Confidence: High

---

## 5. Google Places API (Atmosphere Data)

- **API Name:** Google Places API (Place Details, Text Search, Atmosphere Data)  
- **Content Type:** `price_level`, `rating`, `user_ratings_total`, and up to 5 reviews per place via Place Details. Review text, author, rating, timestamp.  
- **Coverage:** Global.  
- **Auth Model:** API key (GCP project).  
- **Rate Limits / Free Tier:** $200/month free credit across all Google Maps Platform APIs.  
- **Pricing:** Atmosphere data calls: $0.005 per call (0–100k), $0.004 (100k–500k), contact sales above 500k. Place Text Search: $0.032 per call.  
- **Data Format:** JSON.  
- **SDK Availability:** Official SDKs for Android, iOS, JavaScript, Python, Java, Node.js, Go.  
- **Integration Complexity:** Low.  
- **Real-time vs Cached:** Real-time.  
- **Attribution / Licensing:** Google attribution required; Google Maps Platform Terms of Service apply.  
- **Docs:** https://developers.google.com/maps/documentation/places/web-service/overview

Claim: Google Places API returns up to 5 reviews per place and charges atmosphere data calls at $0.005 per call for the first 100,000 monthly requests.  
Source: SafeGraph Google Places API Pricing Guide  
URL: https://www.safegraph.com/guides/google-places-api-pricing/  
Date: 2026-06-02  
Confidence: High

---

## 6. Trustpilot Business API

- **API Name:** Trustpilot API (Business + Product Reviews + Data Solutions)  
- **Content Type:** Reviews, business units, invitations, product reviews, review images, reviewer profiles, owner responses, conversations.  
- **Coverage:** Trustpilot platform (nearly 1 million new reviews/month).  
- **Auth Model:** API key (query param or header) and OAuth 2.0 for write endpoints.  
- **Rate Limits / Free Tier:** Requires active Trustpilot Business Account; rate limits are not publicly specified but enforced.  
- **Pricing:** API access is generally tied to paid business plans; enterprise/data solutions are custom.  
- **Data Format:** JSON.  
- **SDK Availability:** REST only.  
- **Integration Complexity:** Medium — requires business account setup and understanding of Business Unit IDs.  
- **Real-time vs Cached:** Real-time via webhooks recommended instead of polling.  
- **Attribution / Licensing:** Trustpilot branding and linking required.  
- **Docs:** https://developers.trustpilot.com/ | https://documentation.apidocumentation.trustpilot.com/

Claim: Trustpilot API requires a Business Account and API key; webhooks are recommended over polling to avoid rate limiting.  
Source: Rollout Trustpilot API Essentials  
URL: https://rollout.com/integration-guides/trustpilot/api-essentials  
Date: Not specified  
Confidence: High

---

## 7. Booking.com Review API (Connectivity Partner)

- **API Name:** Booking.com Review API (part of Connectivity API)  
- **Content Type:** Property reviews, reviewer info, review scores per category (facilities, value, comfort, staff, location, clean), review text, owner responses.  
- **Coverage:** Booking.com properties.  
- **Auth Model:** Basic Auth (machine account credentials).  
- **Rate Limits / Free Tier:** Not publicly specified; requires authorized machine account.  
- **Pricing:** Not public; requires connectivity partnership agreement.  
- **Data Format:** JSON.  
- **SDK Availability:** None official.  
- **Integration Complexity:** High — restricted to properties/OTA partners with machine accounts.  
- **Real-time vs Cached:** Near real-time.  
- **Attribution / Licensing:** Reviews obtained are **not intended for public use on external pages**; designed for internal property use.  
- **Docs:** https://connect.booking.com/ (partner-only)

Claim: Booking.com Review API is designed for internal property use and requires a machine account with review-api permission; public display is not permitted.  
Source: Booking.com Review API documentation (PDF / WExtractor)  
URL: https://wextractor.com/booking  
Date: 2023-01-19  
Confidence: High

---

## 8. Olery API

- **API Name:** Olery API (Sentiment V2 — Fusion of Data)  
- **Content Type:** Review data, AI-based sentiment analysis, reputation management, survey interfaces, review count, average rating, sentiment ratings by vertical (facilities, service, food, etc.).  
- **Coverage:** Hotels and restaurants; sentiment analysis in 14–15 languages natively.  
- **Auth Model:** API key.  
- **Rate Limits / Free Tier:** Not publicly specified.  
- **Pricing:** Custom/enterprise pricing; no public self-serve tier.  
- **Data Format:** JSON.  
- **SDK Availability:** Not specified.  
- **Integration Complexity:** Medium — enterprise sales process required.  
- **Real-time vs Cached:** Frequently updated.  
- **Attribution / Licensing:** Not specified.  
- **Docs:** https://olery.com/ | https://olery.com/sentiment-blog/olery-sentiment-v2/

Claim: Olery provides AI-based sentiment analysis for hotel and restaurant reviews in 14+ languages natively via its Sentiment V2 engine.  
Source: Olery Sentiment V2 Blog  
URL: https://olery.com/sentiment-blog/olery-sentiment-v2/  
Date: 2023-08-28  
Confidence: Medium

---

## 9. TrustYou Meta-Review API

- **API Name:** TrustYou Meta-Review API / Widgets  
- **Content Type:** Meta-Reviews (aggregated summaries), TrustScore (0–100), TrustScore distribution, Badges, category-level sentiment (location, food, Wi-Fi, service, room quality, vibe, pool, value), guest quotes, traveler-type filtering.  
- **Coverage:** 500,000+ hotels, 250+ review sources, 30+ languages.  
- **Auth Model:** API key (partner integration).  
- **Rate Limits / Free Tier:** Not publicly specified.  
- **Pricing:** Custom enterprise pricing; used by Trivago, Kayak, Lola, Sabre, Google Search/Maps.  
- **Data Format:** JSON / widget embed.  
- **SDK Availability:** Widget SDK + REST API.  
- **Integration Complexity:** Medium — partnership and technical onboarding required.  
- **Real-time vs Cached:** Updated frequently; latest 6 months weighted more heavily in TrustScore.  
- **Attribution / Licensing:** TrustYou branding required.  
- **Docs:** https://www.trustyou.com/

Claim: TrustYou Meta-Reviews are available in 30+ languages and aggregate 250+ review sources for 500,000+ hotels, influencing millions of booking decisions.  
Source: TrustYou / Trivago Partnership Press Release (TravelPulse)  
URL: https://www.travelpulse.com/news/hotels-and-resorts/trivago-partners-with-trustyou-to-enhance-hotel-guest-review-summaries  
Date: 2015-08-07 (confirmed in 2025 blog posts)  
Confidence: High

---

## 10. Scraping-as-a-Service / Unofficial Review APIs

These providers use automated scraping or browser emulation to bypass official API limits. They are legally and technically viable for many use cases, but TOS compliance should be reviewed by legal counsel.

### 10a. Outscraper — Google Maps Reviews API
- **Content:** All reviews from any Google Maps place (unlimited vs. official 5-review limit), author info, images, owner responses, likes, timestamps.  
- **Coverage:** Google Maps.  
- **Pricing:** 0–500 reviews free; $3/1,000 reviews (501–100k); $1/1,000 reviews (>100k).  
- **Latency:** <3 seconds for 1–10 reviews.  
- **Docs:** https://outscraper.com/google-maps-reviews-api/

### 10b. SerpAPI / Scrappa / SearchCans — SERP & Maps Reviews
- **Content:** Google Maps reviews, ratings, photos, reviewer metadata, business details.  
- **Pricing:** SerpAPI: free 250 searches/month; $75/month for 5,000 searches. Scrappa: 500 free credits/month; ~$0.30/1,000.  
- **Docs:** https://serpapi.com/ | https://scrappa.co/

### 10c. Apify — Hotel Review Aggregator
- **Content:** Aggregates reviews from Airbnb, Tripadvisor, Yelp, Google Maps, Expedia, Hotels.com, and Booking.com in one dataset.  
- **Pricing:** Pay-per-result or Apify platform pricing.  
- **Docs:** https://apify.com/tri_angle/hotel-review-aggregator

### 10d. Scrapfly — Travel Web Scraping
- **Content:** Reviews, ratings, pricing, availability from Booking.com, Tripadvisor, Airbnb, Skyscanner.  
- **Pricing:** 1,000 free credits; credit-based pay-as-you-go.  
- **SDKs:** Python, TypeScript.  
- **Docs:** https://scrapfly.io/use-case/travel-web-scraping

### 10e. TravelScrape
- **Content:** Review text, score, sentiment tags, topic classification from 50+ platforms. Normalised schema (0–10 scale).  
- **Pricing:** Free sample of 1,000 reviews; custom enterprise pricing.  
- **Docs:** https://www.travelscrape.com/

Claim: Outscraper provides a free tier for up to 500 Google Maps reviews and response times under 3 seconds.  
Source: Outscraper Google Maps Reviews API  
URL: https://outscraper.com/google-maps-reviews-api/  
Date: 2026-05-04  
Confidence: High

---

## Ranking: Top 5–7 Providers for a Travel Marketplace

| Rank | Provider | Best For | Key Strength | Key Limitation |
|------|----------|----------|--------------|----------------|
| 1 | **DataForSEO Reviews API** | Bulk review ingestion across platforms | Lowest cost per review ($75/1M), multi-platform, no attribution | 45-min standard turnaround; high-priority costs 2x |
| 2 | **Tripadvisor Content API** | Consumer-facing trust & branding | World’s most trusted travel review brand; free for B2C partners | Only 5 reviews/location; partner approval required |
| 3 | **TrustYou Meta-Review API** | Hotel-specific conversion optimization | Pre-built sentiment summaries across 250+ sources; 30+ languages | Enterprise pricing; hotel-only coverage |
| 4 | **Zembra API** | Multi-source aggregation with SDKs | 60+ sources, standardized JSON, credit-based pricing, auto-renew | Less brand recognition than Tripadvisor/TrustYou |
| 5 | **Google Places API** | Quick ratings & basic review snippets | $200/mo free credit, global coverage, excellent SDKs | Hard 5-review limit per place; expensive at scale |
| 6 | **Outscraper / SerpAPI** | Deep Google review data beyond the 5-review cap | All reviews available, fast, pay-per-review | Unofficial scraping; potential TOS risk with Google |
| 7 | **Apify Hotel Review Aggregator** | Rapid multi-platform prototyping | One-call coverage of 7 major platforms (Airbnb, Booking, Tripadvisor, etc.) | Relies on scraping; maintenance dependent on actor updates |

**Honorable Mentions:**
- **Yelp Fusion API** — only if your marketplace is US-centric and budget allows $9.99+/1,000 calls.
- **Olery API** — strong for European hotel/restaurant sentiment, but requires enterprise sales.
- **Trustpilot API** — better for general service reputation than travel-specific reviews.

---

## Sentiment Analysis & NLP Options

If a provider does not include native sentiment analysis, the following developer-accessible APIs can be layered on top of extracted review text:
- **OpenAI API (GPT-4o / GPT-3.5 Turbo):** Fine-tuned for travel sentiment classification, aspect extraction, and summarization. Pay-per-token.
- **Google Cloud Natural Language API:** Entity sentiment analysis and syntax parsing. $1–$2 per 1,000 requests (free tier for first 5k requests/month).
- **AWS Comprehend:** Custom sentiment and targeted sentiment models. ~$0.0001 per character.
- **Mistral / Anthropic Claude:** Competitive per-token pricing for multilingual review summarization.

---

## Footnotes & Citations

[^1]: Tripadvisor Content API FAQ and pricing. https://tripadvisor-content-api.readme.io/reference/faq  
[^2]: DataForSEO Tripadvisor Reviews pricing page. https://dataforseo.com/pricing/business-data/business-data-api-tripadvisor-pricing  
[^3]: Altexsoft Travel APIs guide covering Tripadvisor, Olery, and Zembra. https://www.altexsoft.com/blog/travel-and-booking-apis-for-online-travel-and-tourism-service-providers/  
[^4]: Zembra API documentation and pricing. https://docs.zembra.io/ | https://zembratech.com/reviews-api-pricing/  
[^5]: Yelp Fusion API pricing changes (App Developer Magazine). https://appdevelopermagazine.com/yelp-fusion-api-outrageous-new-pricing/  
[^6]: Yelp Insights API pricing (per-location model). https://business.yelp.com/data/resources/pricing/  
[^7]: SafeGraph Google Places API pricing guide. https://www.safegraph.com/guides/google-places-api-pricing/  
[^8]: Outscraper Google Maps Reviews API pricing and features. https://outscraper.com/google-maps-reviews-api/  
[^9]: Trustpilot API documentation and developer portal. https://developers.trustpilot.com/  
[^10]: Booking.com Review API (WExtractor documentation). https://wextractor.com/booking  
[^11]: Olery Sentiment V2 blog post. https://olery.com/sentiment-blog/olery-sentiment-v2/  
[^12]: TrustYou partnership with Trivago (TravelPulse). https://www.travelpulse.com/news/hotels-and-resorts/trivago-partners-with-trustyou-to-enhance-hotel-guest-review-summaries  
[^13]: Apify Hotel Review Aggregator. https://apify.com/tri_angle/hotel-review-aggregator  
[^14]: Scrapfly travel web scraping use case. https://scrapfly.io/use-case/travel-web-scraping  
[^15]: SerpAPI pricing and alternatives (Scrappa). https://scrappa.co/post/serpapi-alternative-2026  
[^16]: DataForSEO Reviews API overview. https://dataforseo.com/apis/reviews-api  
[^17]: TravelScrape review data intelligence. https://www.travelscrape.com/travel-review-data-intelligence.php  
