# Dimension 05: Imagery & Media APIs

## Research Scope
Travel marketplace content providers offering APIs for **travel photography**, **destination imagery**, **stock photos/videos**, **creative assets**, and **user-generated content (UGC) photos** from travel platforms. Focus on APIs accessible to developers with clear licensing for commercial use in a travel app.

**Research Date:** 2026-06-13
**Author:** Research Sub-Agent

---

## Executive Summary: Top 7 Providers for Traveloure

| Rank | Provider | API | Best For | Free Tier | Self-Host | Attribution | Integration Complexity |
|------|----------|-----|----------|-----------|-----------|-------------|------------------------|
| 1 | **Pexels** | Pexels API (REST) | Best all-rounder: photos + videos, easy onboarding, unlimited potential | 200 req/hr, 20K/mo (unlimited free if approved) | Yes (download & serve) | Prominent linkback required | Low |
| 2 | **Unsplash** | Unsplash API (REST) | Highest editorial photo quality, strong destination search | 50 req/hr demo -> 5K/hr approved | No (hotlink required) | Required (photographer + Unsplash) | Low–Moderate |
| 3 | **Pixabay** | Pixabay API (REST) | Self-hosted delivery, no hotlinking constraints, generous burst | 100 req/60s | Yes (download-first) | Optional (appreciated) | Low |
| 4 | **Google** | Places API (New) – Place Photo | Real-world POI photos, user-contributed, high relevance | Per-SKU: 10K free (Essentials) then pay-as-you-go | Cache only (TOS) | None (Google-hosted) | Easy |
| 5 | **Storyblocks** | Storyblocks API (REST) | Unlimited video/audio downloads, indemnification, high volume | 5 free downloads per type (trial) | Yes | None (royalty-free) | Moderate (sales contact) |
| 6 | **Shutterstock** | Shutterstock API (REST) | Massive 450M+ library, premium quality, enterprise safety | 100 req/hr, 500 dl/mo (free test) | Yes (license-dependent) | None (within license) | Moderate–High |
| 7 | **Wikimedia Commons** | MediaWiki Action API / Wikidata | Public domain landmarks, historical sites, zero cost | No key needed for basic queries | Yes (public domain) | Varies (CC0 = none, CC-BY = yes) | Moderate–High |

*Honorable mentions: Getty Images (premium, custom pricing), Flickr (Pro API key required, CC-licensed UGC), Openverse (WordPress, 800M+ CC works, free), Vecteezy (paid, $40+/mo), Coverr (free video, attribution required).*

---

## 1. Pexels API

### Overview
Pexels is a free stock photo and video platform acquired by Canva. It offers one of the simplest and most developer-friendly REST APIs for integrating both photos and videos into applications. The licensing is broadly permissive for commercial use, making it an excellent first choice for travel marketplaces.

- **Provider name:** Pexels (a Canva company)
- **API name/endpoint:** Pexels REST API (`https://api.pexels.com/v1/`)
- **Content type:** Photos, videos
- **Coverage:** General stock, travel, destinations, nature, cityscapes, landmarks, lifestyle
- **Licensing model:** Pexels License — free for commercial and non-commercial use without attribution. Modification allowed. Cannot sell unaltered copies as standalone products (e.g., posters, prints). No indemnification provided.[^1]
- **Auth model:** API key via `Authorization` header
- **Rate limits / free tier:** 200 requests/hour, 20,000 requests/month by default. Limits can be removed completely for free if the platform meets API terms and provides acceptable attribution.[^2]
- **Pricing:** Completely free for API access and content. No paid tiers for the API itself.
- **Data format:** JSON (REST). Photos return `src` object with multiple sizes (original, large2x, large, medium, small, portrait, landscape, tiny). Videos return multiple quality files.
- **SDK availability:** Official JavaScript integration; community libraries for Python, PHP, Ruby, etc.
- **Integration complexity:** Low — single header auth, clear JSON schema, instant key generation.
- **Can images be self-hosted?** Yes. You may download and serve from your own CDN. No hotlinking requirement.
- **Attribution requirements:** Not legally required under Pexels License, but the API Guidelines request a prominent link back to Pexels (e.g., "Photos provided by Pexels") and photographer credit when possible.[^2]
- **URL to docs:** https://www.pexels.com/api/documentation/

### Travel Marketplace Fit
- **Strengths:** Instant onboarding, both photos and videos from one API, no hotlinking constraints, permissive licensing, unlimited ceiling after approval.
- **Weaknesses:** Smaller library than Unsplash (~150K videos), no indemnification, search filters are limited, image quality is good but not consistently editorial-grade.
- **Best use case:** Destination hero images, city gallery thumbnails, background video loops, blog/article imagery.

Claim: Pexels API default rate limits are 200 requests/hour and 20,000/month, with unlimited requests available free for compliant applications.[^2]
Source: Pexels API Documentation & Help Center
URL: https://www.pexels.com/api/documentation/, https://help.pexels.com/hc/en-us/articles/900005852323
Date: 2026-05-27 (help article), 2023-11-22 (docs)
Confidence: High

---

## 2. Unsplash API

### Overview
Unsplash is the world's largest free photography platform, renowned for editorial-quality imagery. Its API is powerful but opinionated — it imposes specific hotlinking and attribution requirements that developers must architect around.

- **Provider name:** Unsplash (a Getty Images company as of 2021)
- **API name/endpoint:** Unsplash JSON API (`https://api.unsplash.com/`)
- **Content type:** Photos only (no video)
- **Coverage:** 3M+ high-quality photos, strong in travel, cityscapes, architecture, nature, lifestyle
- **Licensing model:** Unsplash License — free for commercial and non-commercial use without needing permission or attribution. However, the API Guidelines override this and require attribution and hotlinking for API integrations.[^3]
- **Auth model:** OAuth2 + `Authorization: Client-ID YOUR_ACCESS_KEY`
- **Rate limits / free tier:** 50 requests/hour in Demo mode. After production approval (requires screenshot proof of attribution), increased to 5,000 requests/hour. Image CDN requests (`images.unsplash.com`) do NOT count against the rate limit.[^3][^4]
- **Pricing:** Free. Higher limits available by contacting the API team.
- **Data format:** JSON (REST). Photos include `urls` object (raw, full, regular, small, thumb) and `links` with `download_location` tracking endpoint.
- **SDK availability:** Official libraries for JavaScript, PHP, Ruby. Community libraries for Python, Go, etc.
- **Integration complexity:** Low–Moderate — simple auth, but must implement `download_location` hit tracking, hotlinking, and attribution UI.
- **Can images be self-hosted?** No. Unsplash prefers (effectively requires) hotlinking — using returned image URLs directly embedded in your app to track views for photographers.[^3]
- **Attribution requirements:** Yes — must credit photographer and Unsplash. Must hit `download_location` endpoint when user performs a download-like action.[^3]
- **URL to docs:** https://unsplash.com/documentation

### Travel Marketplace Fit
- **Strengths:** Best-in-class editorial photo quality, excellent destination search, massive library, photographer community, strong brand recognition.
- **Weaknesses:** Hotlinking constraint makes it unsuitable for apps that want to normalize files into their own storage or hide the upstream source. Stricter compliance model than Pexels. No video. Approval bottleneck for production limits.
- **Best use case:** Editorial destination galleries, magazine-style layouts, hero banners where attribution is easy to display.

Claim: Unsplash API requires hotlinking and attribution for API integrations, even though the general Unsplash License does not require attribution for direct downloads.[^3]
Source: Pluralsight Unsplash API Guide, Unsplash Help Center
URL: https://www.pluralsight.com/resources/blog/guides/using-the-unsplash-api, https://help.unsplash.com/en/articles/3887917-when-should-i-apply-for-a-higher-rate-limit
Date: 2018-12-14, 2026-06-05
Confidence: High

---

## 3. Pixabay API

### Overview
Pixabay is a German free stock media platform offering images, videos, music, and illustrations. Its API is designed for download-first workflows, making it ideal for apps that want to self-host and cache media.

- **Provider name:** Pixabay (founded 2010, Germany)
- **API name/endpoint:** Pixabay REST API (`https://pixabay.com/api/`)
- **Content type:** Photos, illustrations, vectors, videos, music
- **Coverage:** 4.7M+ images and videos, general stock with travel/destination coverage
- **Licensing model:** Pixabay Content License — free for commercial use without attribution. No permission needed. Can modify. Cannot sell unaltered copies.[^5]
- **Auth model:** API key passed as `key` query parameter
- **Rate limits / free tier:** 100 requests per 60 seconds. Requests are associated with API key, not IP. Can be increased on request.[^5]
- **Pricing:** Completely free. No paid API tier.
- **Data format:** JSON (REST). Images return `webformatURL`, `largeImageURL`, `imageURL`, `previewURL`, etc. Videos return multiple size files.
- **SDK availability:** No official SDKs; simple REST integration from any HTTP client.
- **Integration complexity:** Low — query-param auth, straightforward JSON.
- **Can images be self-hosted?** Yes. Pixabay explicitly requires downloading to your server before permanent use. Permanent hotlinking of images is not allowed. Videos may be embedded but server storage is recommended.[^5]
- **Attribution requirements:** Not required by license, but Pixabay "kindly requests" showing users where images are from when search results are displayed.[^5]
- **URL to docs:** https://pixabay.com/api/docs/

### Travel Marketplace Fit
- **Strengths:** Download-first design aligns with self-hosting/CDN strategies, no hotlinking dependency, generous burst limit, includes illustrations and vectors (useful for icons/graphics), no attribution requirement.
- **Weaknesses:** Photo quality is variable (mix of amateur and pro), smaller editorial curation than Unsplash, search is less sophisticated, 24-hour caching requirement for API responses.[^5]
- **Best use case:** City/destination thumbnail grids, icon/illustration assets, self-hosted gallery backdrops, apps that want CDN independence.

Claim: Pixabay API explicitly prohibits permanent hotlinking and requires downloading images to your server for permanent use.[^5]
Source: Pixabay API Documentation
URL: https://pixabay.com/api/docs/
Date: 2013-10-15 (docs, updated periodically)
Confidence: High

---

## 4. Google Places API (New) — Place Photo

### Overview
Google Places API provides access to real-world, user-contributed photos of businesses, landmarks, and points of interest. This is the only API on this list that offers actual photos of specific venues (not just generic stock), but it comes at a significant cost.

- **Provider name:** Google (Google Maps Platform)
- **API name/endpoint:** Places API (New) — `places.getPhoto` / `places.getMedia` (REST & gRPC)
- **Content type:** User-contributed photos (JPEG, up to 4800px), up to 10 photos per Place Details request
- **Coverage:** 200M+ places globally, with user-uploaded photos of restaurants, hotels, attractions, landmarks
- **Licensing model:** Google Maps Platform Terms of Service — photos can be displayed in conjunction with Google Maps attribution. No independent commercial license transfer. Content must be used with Google Maps branding.[^6]
- **Auth model:** API key + OAuth 2.0 (for some endpoints); tied to GCP billing project
- **Rate limits / free tier:** Per-SKU free usage caps as of March 2025: 10,000/month for Essentials SKUs, 5,000/month for Pro SKUs, 1,000/month for Enterprise SKUs. No longer a single $200 credit pool.[^6]
- **Pricing:** Place Photo SKU falls under Essentials or Pro depending on fields requested. After free cap: approximately $7 per 1,000 requests (varies by volume). Subscription plans: Starter $100/mo (50K events), Essentials $275/mo (100K), Pro $1,200/mo (250K).[^7]
- **Data format:** Binary image data (JPEG) or JSON metadata. Place Details returns photo references; separate `photo` endpoint resolves to image bytes.
- **SDK availability:** Google Maps SDKs for Android, iOS, JavaScript. Places SDK for mobile.
- **Integration complexity:** Easy for basic usage, but complex billing optimization requires careful field masking to avoid triggering expensive SKUs.
- **Can images be self-hosted?** Caching is permitted per Google Maps Platform TOS for up to 30 days, but photos must be refreshed and attribution maintained.[^6]
- **Attribution requirements:** Yes — Google logo and attribution must be displayed. Photos must be used in context of Google Maps data.
- **URL to docs:** https://developers.google.com/maps/documentation/places/web-service/photos

### Travel Marketplace Fit
- **Strengths:** Real photos of actual hotels, restaurants, and attractions (not generic stock), constantly updated by users, massive global coverage, integrates natively with POI data from Places API.
- **Weaknesses:** Extremely expensive at scale ($7/1,000 after free cap), no editorial curation, quality is user-variable, limited to 10 photos per Place Details call, strict TOS constraints on how photos are displayed.
- **Best use case:** Venue detail pages showing real photos of specific restaurants/hotels/attractions, not generic destination imagery.

Claim: Google Maps Platform replaced the $200/month universal credit with per-SKU free caps in March 2025; Place Photos now billed per Essentials/Pro/Enterprise tier with 10K/5K/1K free monthly events respectively.[^6]
Source: Nicola Lazzari AI Guide, SafeGraph Google Places API Pricing Guide
URL: https://nicolalazzari.ai/articles/understanding-google-maps-apis, https://www.safegraph.com/guides/google-places-api-pricing/
Date: 2026-03-13, 2026-06-02
Confidence: High

---

## 5. Storyblocks API

### Overview
Storyblocks is a subscription-based stock media platform with a strong focus on video, audio, and templates. Its API is designed for platforms that need to offer users unlimited downloads of media within a subscription framework.

- **Provider name:** Storyblocks
- **API name/endpoint:** Storyblocks Stock Media API (REST)
- **Content type:** Video, images, audio, templates/After Effects
- **Coverage:** 1M+ video clips, millions of images/audio; travel, destination, nature, city footage
- **Licensing model:** 100% royalty-free, commercial use. All content backed by $20,000 indemnification (individual) or $1,000,000 (Enterprise).[^8]
- **Auth model:** API key (test keys for trial, production keys via sales)
- **Rate limits / free tier:** Free trial provides unlimited search queries + 5 free downloads per content type (video, image, audio).[^8]
- **Pricing:** API is custom-priced based on libraries included (video/image/audio) and monthly active users. Minimum commitment reported at $24,000/year for API integrations.[^9] Enterprise subscription required for API access and perpetual rights.[^8]
- **Data format:** JSON (REST). Search returns metadata + download URLs. Supports filtering by category, resolution, duration, etc.
- **SDK availability:** No official SDKs; REST integration. Postman collection available.[^9]
- **Integration complexity:** Moderate — requires sales contact for production keys, but REST API is straightforward.
- **Can images be self-hosted?** Yes. Downloads are licensed for use in end-user projects. Must comply with subscription terms.
- **Attribution requirements:** None for royalty-free content.
- **URL to docs:** https://documentation.storyblocks.com/

### Travel Marketplace Fit
- **Strengths:** Unlimited downloads (unlike credit-based competitors), strong indemnification, video-focused, good for platforms offering media creation tools to users. No per-download anxiety.
- **Weaknesses:** Expensive API minimums ($24K+/yr), no perpetual rights on non-Enterprise tiers (must remove content after cancellation), lower library depth than Shutterstock/Getty, documentation is developer-unfriendly.[^9]
- **Best use case:** Travel video creation platforms, itinerary slideshow generators, platforms where users build content with stock media.

Claim: Storyblocks API requires Enterprise tier for perpetual rights; non-Enterprise subscribers must remove previously downloaded content from circulation after cancellation.[^8]
Source: Storyblocks Business Solutions, CheckThat.ai Storyblocks Pricing
URL: https://www.storyblocks.com/resources/business-solutions/api, https://checkthat.ai/brands/storyblocks/pricing
Date: 2025-11-05, 2026-03-30
Confidence: High

---

## 6. Shutterstock API

### Overview
Shutterstock is the largest traditional stock media platform with 450M+ assets. In 2025–2026 it expanded self-serve API options, making it more accessible than previously, though production use still requires enterprise engagement.

- **Provider name:** Shutterstock
- **API name/endpoint:** Shutterstock REST API (v2) — Search, Image, Video, Audio, Contributor, Editor endpoints
- **Content type:** Photos, illustrations, vectors, videos, music, 3D models
- **Coverage:** 450M+ images, 25M+ video clips; extensive travel, destination, landmark, culture coverage
- **Licensing model:** Standard Royalty-Free License (included in all plans) — covers website, social, email, print up to 500K copies. Enhanced License available for $29–$199/asset for unlimited reproduction, merchandise, and trademark use. $10,000 indemnification (Standard), $250,000 (Enhanced).[^10]
- **Auth model:** OAuth 2.0 or API key
- **Rate limits / free tier:** Free tier: 100 requests/hour, 500 downloads/month for testing and prototyping. Production requires custom pricing.[^10]
- **Pricing:** Free tier for testing. Subscription plans: Basic $29/mo (10 downloads), Professional $199/mo (350 downloads), High-Volume $249/mo (750 downloads). Enterprise/API custom pricing. Team plans from $489/mo. On-demand: $29–$199 per asset.[^10]
- **Data format:** JSON (REST). Search returns preview URLs, metadata, licensing info. Separate endpoint for full-resolution downloads.
- **SDK availability:** Official SDKs for JavaScript, Python, Ruby, PHP, Java.[^10]
- **Integration complexity:** Moderate–High — rich SDKs help, but licensing tiers and API key tiers add complexity. Enterprise sales process for production.
- **Can images be self-hosted?** Yes, after licensing. Preview/thumbnail URLs can be cached; full downloads are licensed for permanent use (perpetual on all tiers).[^10]
- **Attribution requirements:** None for licensed royalty-free content.
- **URL to docs:** https://developers.shutterstock.com/

### Travel Marketplace Fit
- **Strengths:** Massive library depth, editorial curation, high-quality destination and landmark photos, strong legal protection (indemnification), perpetual rights on all tiers, mature SDKs.
- **Weaknesses:** Expensive for startups (API production requires enterprise negotiation), consumer-tier billing complaints are well-documented, complex licensing tiers (Standard vs Enhanced), not free.
- **Best use case:** Premium destination content, editorial-quality hero images, high-stakes commercial use where legal certainty is paramount.

Claim: Shutterstock free API tier allows 100 requests/hour and 500 downloads/month for testing; production API requires custom enterprise pricing.[^10]
Source: CheckThat.ai Shutterstock Pricing, APIs.io Shutterstock Plans
URL: https://checkthat.ai/brands/shutterstock/pricing, https://plans.apis.io/plans/shutterstock/shutterstock-plans-pricing/
Date: 2026-03-30, 2026-04-09
Confidence: High

---

## 7. Wikimedia Commons API

### Overview
Wikimedia Commons is the media repository behind Wikipedia, containing tens of millions of freely licensed images, many of which are public domain photos of landmarks, historical sites, and cultural destinations. It is the only zero-cost, zero-attribution (for PD content) source for iconic travel imagery.

- **Provider name:** Wikimedia Foundation
- **API name/endpoint:** MediaWiki Action API (`https://commons.wikimedia.org/w/api.php`), Wikidata SPARQL endpoint, Wikimedia REST API (`https://commons.wikimedia.org/api/rest_v1/`)
- **Content type:** Photos, illustrations, maps, diagrams, historical images, 3D models, audio
- **Coverage:** 90M+ media files; exceptionally strong in landmarks, monuments, UNESCO sites, historical architecture, museum collections, cultural heritage
- **Licensing model:** Mixed — per-file licensing. Many files are CC0 (public domain) or CC-BY-SA (attribution + share-alike). Each file has explicit license metadata.[^11]
- **Auth model:** No API key required for basic read-only queries. OAuth 1.0a available for write operations.
- **Rate limits / free tier:** No strict published numeric limits for read-only API. Rate limiting is enforced via User-Agent policy and fair-use practices. Recommended: max 200 requests/second per project.[^11]
- **Pricing:** Completely free.
- **Data format:** JSON (MediaWiki API), XML (optional), RDF (Wikidata). Thumbnails served via `Special:FilePath` or REST API.
- **SDK availability:** No official SDKs. Community libraries: `pywikibot`, `wikimedia-api-client` (JS), `flickcurl` (C).[^11]
- **Integration complexity:** Moderate–High — MediaWiki API is verbose and idiosyncratic. Must parse `imageinfo` to extract license, dimensions, and URLs. SPARQL for structured queries.
- **Can images be self-hosted?** Yes. For CC0/public domain: fully. For CC-BY-SA: must comply with attribution and share-alike terms. For "all rights reserved": cannot use.[^11]
- **Attribution requirements:** Depends on per-file license. CC0 = none. CC-BY = yes, with link to source. Must verify license for every file programmatically.
- **URL to docs:** https://www.mediawiki.org/wiki/API:Main_page, https://commons.wikimedia.org/wiki/Commons:API

### Travel Marketplace Fit
- **Strengths:** Zero cost, iconic landmark photos (Eiffel Tower, Colosseum, etc.), public domain historical content, rich structured metadata via Wikidata (depicts, coordinates, artist, date), no API key friction.
- **Weaknesses:** Per-file license verification is mandatory and complex. No editorial curation. Quality is highly variable. Modern travel/lifestyle imagery is sparse. API is developer-unfriendly. No video. No model/property releases for many images.
- **Best use case:** Landmark detail pages, historical destination context, educational content, city/attraction pages where iconic imagery is needed.

Claim: Wikimedia Commons contains 90M+ media files with mixed licensing; per-file license verification is mandatory — CC0 requires no attribution, CC-BY requires attribution and share-alike.[^11]
Source: GLAM-E Lab Image and Metadata Handbook for Wikimedia Commons
URL: https://www.glamelab.org/files/Image_and_Metadata_Handbook_for_Wikimedia_Commons_v1_2024-10.pdf
Date: 2024-10
Confidence: High

---

## Additional Providers (Honorable Mentions)

### Getty Images API
- **Content:** Photos, video, editorial, archival, illustrations — highest quality available
- **Licensing:** Rights-managed, royalty-free, rights-ready — per-asset pricing
- **API:** REST API (`api.gettyimages.com`) with throttling per API key
- **Pricing:** Custom pricing only. No free tier. Minimums start at $200+/image for on-demand. Enterprise agreements required for API.[^12]
- **Best for:** Premium publications, luxury travel brands, high-stakes commercial use requiring absolute legal certainty
- **Claim:** Getty Images API requires custom enterprise pricing; no free tier or self-serve production access.[^12]
- **Source:** Getty Images Developer Documentation
- **URL:** https://developers.gettyimages.com/docs/
- **Date:** 2026 (ongoing)
- **Confidence:** High

### Flickr API
- **Content:** User-generated photos, 10B+ images shared, 500M+ with Creative Commons licenses
- **Licensing:** Per-photo licensing set by uploader (All Rights Reserved, CC-BY, CC-BY-SA, CC0, etc.)
- **API:** Flickr API (REST + XML-RPC). API key application requires Flickr Pro subscription as of 2025.[^13]
- **Rate limits:** Not strictly published; historically 3,600 queries/hour per key
- **Pricing:** API key requires Pro subscription (~$72/year). Free tier no longer available for API keys.[^13]
- **Best for:** UGC travel photos, community-sourced destination imagery, Flickr Foundation archival projects
- **Claim:** Flickr API key requests are now exclusively available to Pro subscribers; free accounts cannot obtain API keys.[^13]
- **Source:** Flickr Help Center
- **URL:** https://www.flickrhelp.com/hc/en-us/articles/4404070036884-Flickr-API
- **Date:** 2025-08-06
- **Confidence:** High

### Openverse API
- **Content:** 800M+ images and audio files from 45+ sources (Wikimedia Commons, Flickr, NASA, SpaceX, StockSnap, WordPress Photo Directory, Europeana, Freesound)
- **Licensing:** CC-licensed and public domain only. Filterable by license type, source, extension, orientation.
- **API:** Django REST API (`api.openverse.org`) — requires Client ID/Secret registration
- **Pricing:** Completely free. Part of the WordPress open-source project.[^14]
- **Best for:** Aggregated open-content search, educational projects, WordPress integrations, license-filtered media discovery
- **Claim:** Openverse catalogs over 800 million works from 45+ sources, all CC-licensed or public domain, with a free REST API.[^14]
- **Source:** WordPress Openverse GitHub, Openverse Developer Docs
- **URL:** https://github.com/wordpress/openverse, https://wordpress.github.io/openverse-api/guides/quickstart.html
- **Date:** 2021–2026 (ongoing)
- **Confidence:** High

### Vecteezy API
- **Content:** 50M+ photos, videos, vectors, SVGs, PNGs
- **Licensing:** Commercial license included
- **API:** REST API with Swagger UI, search and download functionality
- **Pricing:** From $40/month (paid API service, tiers with download limits). Free trial available.[^15]
- **Best for:** Apps needing vector graphics and illustrations alongside photos
- **Claim:** Vecteezy API is a paid service starting at $40/month with a REST API and Swagger UI for testing.[^15]
- **Source:** Shotstack Blog — Best Stock Image and Video APIs
- **URL:** https://shotstack.io/learn/best-stock-image-video-apis/
- **Date:** 2024-02-02
- **Confidence:** Medium

### Coverr
- **Content:** Curated free stock videos, travel destination footage, cinematic clips
- **Licensing:** Royalty-free, commercial use, no attribution required (but appreciated)
- **API:** Free REST API for staging (1,000 calls/month). Production app requires approval (500 calls/minute).[^16]
- **Pricing:** Free. No paid tiers.
- **Best for:** Free video backgrounds, travel destination b-roll, social media clips
- **Claim:** Coverr API is free with 1,000 calls/month on staging; production apps require approval for 500 calls/minute. No attribution required.[^16]
- **Source:** Plainly Videos — Top 10 Stock Video APIs, Coverr Website
- **URL:** https://www.plainlyvideos.com/blog/stock-video-api, https://coverr.co/stock-video-footage/travel-destination
- **Date:** 2025-08-13, 2024-07-06
- **Confidence:** High

---

## Comparative Matrix: All Providers

| Provider | Photos | Videos | UGC | Editorial Quality | Free Tier | Self-Host | Attribution | Indemnification | Perpetual Rights | API Key Friction |
|----------|--------|--------|-----|-------------------|-----------|-----------|-------------|-----------------|------------------|------------------|
| **Pexels** | Yes | Yes | No | Medium | Generous | Yes | Prominent link | No | Yes | Low |
| **Unsplash** | Yes | No | No | Very High | 50/hr -> 5K/hr | No (hotlink) | Required | No | Yes | Moderate (approval) |
| **Pixabay** | Yes | Yes | No | Medium | 100/60s | Yes | Optional | No | Yes | Low |
| **Google Places** | Yes | No | Yes | Variable (UGC) | 10K/mo | Cache only | Google branding | No | No | Low (but expensive) |
| **Storyblocks** | Yes | Yes | No | High | 5 dl trial | Yes | None | $20K–$1M | No* | High (sales) |
| **Shutterstock** | Yes | Yes | No | Very High | 500 dl/mo test | Yes | None | $10K–$250K | Yes | Moderate (enterprise) |
| **Wikimedia Commons** | Yes | No | No | Variable | Unlimited | Yes | Per-file | No | Yes (PD) | Low (no key) |
| **Getty Images** | Yes | Yes | No | Highest | No | Yes | None | Yes | Yes | Very High (sales) |
| **Flickr** | Yes | No | Yes | Variable | No (Pro required) | Yes | Per-photo | No | Yes (CC) | Moderate |
| **Openverse** | Yes | No | No | Variable | Unlimited | Yes | Per-file | No | Yes (CC) | Low |
| **Vecteezy** | Yes | Yes | No | Medium | No | Yes | None | No | Yes | Low (paid) |
| **Coverr** | No | Yes | No | Medium | 1K/mo | Yes | Appreciated | No | Yes | Low |

*Storyblocks perpetual rights only on Enterprise tier.

---

## Recommendations for Traveloure

### Phase 1: MVP / Free Integration (Immediate)
1. **Primary: Pexels API** — Start here. Instant key, no hotlinking, photos + videos, permissive license, easy to implement. Request unlimited limits once attribution is in place.
2. **Secondary: Pixabay API** — Use for illustrations, vectors, and as a backup photo source. Download-first design aligns with caching strategy.
3. **Fallback: Wikimedia Commons API** — Use for iconic landmarks and historical destinations where public domain imagery is available. Implement license-checking logic.

### Phase 2: Production Scale (Post-Launch)
4. **Unsplash API** — Add for editorial-quality hero images once you can implement hotlinking + attribution UI. Apply for production approval early.
5. **Google Places API (New)** — Integrate selectively for specific venue photos (hotels, restaurants, attractions) where real UGC photos matter more than stock. Budget carefully — this can become expensive quickly.

### Phase 3: Premium / Enterprise (Growth Stage)
6. **Shutterstock API** — Negotiate enterprise API access for premium destination content and legal indemnification. Only viable once revenue justifies $200+/month minimums.
7. **Storyblocks API** — Consider if the app evolves into a video/itinerary creation tool where users need unlimited stock media.

### Licensing & Compliance Checklist
- [ ] Implement per-provider attribution UI components (Pexels prominent link, Unsplash photographer credit, Google logo)
- [ ] Build license verification pipeline for Wikimedia Commons (parse `imageinfo` -> check `license` field)
- [ ] Cache API responses per provider requirements (Pixabay: 24h, Google: 30 days, Pexels: no strict rule)
- [ ] Track rate limit headers in all integrations (`X-Ratelimit-Remaining`, `X-Ratelimit-Reset`)
- [ ] Document which content is hotlinked vs. self-hosted for CDN cost planning
- [ ] Review Enhanced License needs for any Shutterstock images used in merchandise or >500K reproduction contexts

---

## Citations

[^1]: Claim: Pexels content is free for commercial use under the Pexels License, with no attribution required but prominent linkback requested for API integrations. Source: Pexels API Documentation, CheckThat.ai. URL: https://www.pexels.com/api/documentation/, https://checkthat.ai/brands/pexels. Date: 2023-11-22, 2025-08-30. Confidence: High.

[^2]: Claim: Pexels API default limits are 200 requests/hour and 20,000/month; unlimited requests available free for compliant applications with proper attribution. Source: Pexels Help Center, Pexels API Docs. URL: https://help.pexels.com/hc/en-us/articles/900005852323, https://www.pexels.com/api/documentation/. Date: 2026-05-27, 2023-11-22. Confidence: High.

[^3]: Claim: Unsplash API requires hotlinking and attribution for API integrations, even though the general Unsplash License does not require attribution for direct downloads. Source: Pluralsight Unsplash API Guide, Unsplash Help Center. URL: https://www.pluralsight.com/resources/blog/guides/using-the-unsplash-api, https://help.unsplash.com/en/articles/3887917-when-should-i-apply-for-a-higher-rate-limit. Date: 2018-12-14, 2026-06-05. Confidence: High.

[^4]: Claim: Unsplash API rate limits are 50 requests/hour in Demo mode and 5,000/hour after production approval. Source: Unsplash Help Center. URL: https://help.unsplash.com/en/articles/3887917-when-should-i-apply-for-a-higher-rate-limit. Date: 2026-06-05. Confidence: High.

[^5]: Claim: Pixabay API prohibits permanent hotlinking and requires downloading images to your server; rate limit is 100 requests per 60 seconds. Source: Pixabay API Documentation. URL: https://pixabay.com/api/docs/. Date: 2013-10-15 (ongoing). Confidence: High.

[^6]: Claim: Google Maps Platform replaced the $200/month universal credit with per-SKU free caps in March 2025; Place Photos billed at Essentials/Pro/Enterprise tiers with 10K/5K/1K free monthly events. Source: Nicola Lazzari AI Guide, SafeGraph. URL: https://nicolalazzari.ai/articles/understanding-google-maps-apis, https://www.safegraph.com/guides/google-places-api-pricing/. Date: 2026-03-13, 2026-06-02. Confidence: High.

[^7]: Claim: Google Maps Platform subscription plans are Starter $100/mo (50K), Essentials $275/mo (100K), Pro $1,200/mo (250K). Source: Scrap.io. URL: https://scrap.io/google-maps-api-pricing-calculator-alternatives-2025. Date: 2025-12-18. Confidence: High.

[^8]: Claim: Storyblocks API offers unlimited search + 5 free downloads per content type in trial; Enterprise tier required for perpetual rights and API access. Source: Storyblocks Business Solutions, CheckThat.ai. URL: https://www.storyblocks.com/resources/business-solutions/api, https://checkthat.ai/brands/storyblocks/pricing. Date: 2025-11-05, 2026-03-30. Confidence: High.

[^9]: Claim: Storyblocks API minimum commitment is approximately $24,000/year; documentation is limited to a Postman collection. Source: Plainly Videos, Shotstack. URL: https://www.plainlyvideos.com/blog/stock-video-api, https://shotstack.io/learn/best-stock-image-video-apis/. Date: 2025-08-13, 2024-02-02. Confidence: Medium.

[^10]: Claim: Shutterstock free API tier allows 100 requests/hour and 500 downloads/month for testing; Standard License includes $10,000 indemnification; Enhanced License adds $250,000 indemnification. Source: CheckThat.ai, APIs.io. URL: https://checkthat.ai/brands/shutterstock/pricing, https://plans.apis.io/plans/shutterstock/shutterstock-plans-pricing/. Date: 2026-03-30, 2026-04-09. Confidence: High.

[^11]: Claim: Wikimedia Commons contains 90M+ media files with mixed licensing; CC0 requires no attribution, CC-BY requires attribution and share-alike; per-file verification is mandatory. Source: GLAM-E Lab Handbook. URL: https://www.glamelab.org/files/Image_and_Metadata_Handbook_for_Wikimedia_Commons_v1_2024-10.pdf. Date: 2024-10. Confidence: High.

[^12]: Claim: Getty Images API requires custom enterprise pricing and throttles per API key; no free tier available. Source: Getty Images Developer Documentation. URL: https://developers.gettyimages.com/docs/. Date: 2026 (ongoing). Confidence: High.

[^13]: Claim: Flickr API key requests are now exclusively available to Pro subscribers; free accounts cannot obtain API keys. Source: Flickr Help Center. URL: https://www.flickrhelp.com/hc/en-us/articles/4404070036884-Flickr-API. Date: 2025-08-06. Confidence: High.

[^14]: Claim: Openverse catalogs over 800 million works from 45+ sources, all CC-licensed or public domain, with a free REST API. Source: WordPress Openverse GitHub, Make WordPress Blog. URL: https://github.com/wordpress/openverse, https://make.wordpress.org/openverse/2022/01/25/everything-you-need-to-know-about-openverse-and-the-wordpress-photo-directory/. Date: 2021–2026. Confidence: High.

[^15]: Claim: Vecteezy API is a paid service starting at $40/month with a REST API and Swagger UI. Source: Shotstack Blog. URL: https://shotstack.io/learn/best-stock-image-video-apis/. Date: 2024-02-02. Confidence: Medium.

[^16]: Claim: Coverr API is free with 1,000 calls/month on staging; production apps require approval for 500 calls/minute; no attribution required. Source: Plainly Videos, Coverr Website. URL: https://www.plainlyvideos.com/blog/stock-video-api, https://coverr.co/stock-video-footage/travel-destination. Date: 2025-08-13, 2024-07-06. Confidence: High.
