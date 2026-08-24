# Traveloure DMO Global Content Implementation Map
## Expert-Workspace Content Routing & Data Gap Analysis
**Version:** 1.0  
**Date:** 2026-06-13  
**Scope:** All 8 launch markets + Tier 2 expansion markets  
**Consumer:** Expert Workspace (NOT direct to travelers)  
**Research Basis:** DMO Addendum + AI Scraping Layer + Business Plan Reframe (Experience Planning)

---

## 1. Executive Summary

This document maps **every identified DMO and national tourism content source** across Traveloure's operating markets, classifies each by **API availability vs. scraping requirement**, and flags **data gaps** that must be filled before market launch. 

**All content routes to the Expert Workspace first.** Experts curate, validate, and transform raw DMO data into bookable experiences. Travelers never see raw DMO dumps — they see expert-curated, AI-enhanced event and destination content.

**Key principle:** Raw DMO data is **ingredient**, not **product**. The Expert Workspace is the kitchen.

---

## 2. Content Routing Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GLOBAL DMO CONTENT SOURCES                            │
│  (Smartvel, ATDW, UNESCO, DMO portals, Open Data, AI-scraped sites)        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
│   API INTEGRATION     │  │   AI SCRAPING LAYER   │  │   PARTNER PORTALS     │
│   (Structured feeds)  │  │   (Tavily/Brave +     │  │   (Manual downloads,  │
│                       │  │    Firecrawl)         │  │    XML packs, trade   │
│ • Smartvel API        │  │                       │  │    registration)      │
│ • ATDW ATLAS API      │  │ • DMO websites        │  │                       │
│ • UNESCO API          │  │ • Tourism board sites │  │ • VisitBritain trade  │
│ • EU Tourism Dashboard  │  │ • Event calendars     │  │ • Tourism Australia   │
│ • Open Data Portals     │  │ • Heritage registers  │  │ • JNTO partner portal │
│ • GTFS Feeds            │  │ • Municipal listings  │  │ • TAT trade portal    │
└───────────────────────┘  └───────────────────────┘  └───────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │      CONTENT INGESTION PIPELINE      │
                    │  (PostgreSQL + Drizzle ORM + Redis)  │
                    │                                      │
                    │  • Schema normalization              │
                    │  • Deduplication (URL hash)          │
                    │  • Attribution tracking                │
                    │  • Freshness flags (last_scraped)    │
                    │  • Source provenance (dmo_name)      │
                    │  • Licensing flags (cc, partner,      │
                    │    restricted, unknown)               │
                    │  • Confidence score (1.0 = official   │
                    │    API, 0.5 = scraped, 0.3 = partner  │
                    │    pack)                              │
                    └─────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │         EXPERT WORKSPACE            │
                    │    (React/Vite frontend + Express)   │
                    │                                      │
                    │  ┌──────────────┐ ┌──────────────┐  │
                    │  │  DMO Library  │ │  Content     │  │
                    │  │  (Browse all  │ │  Builder     │  │
                    │  │  raw sources)  │ │  (Drag POI   │  │
                    │  │                │ │  into events)  │  │
                    │  └──────────────┘ └──────────────┘  │
                    │                                      │
                    │  ┌──────────────┐ ┌──────────────┐  │
                    │  │  Photo       │ │  Analytics   │  │
                    │  │  Library     │ │  (What's     │  │
                    │  │  (Filtered   │ │  trending,   │  │
                    │  │  by license) │ │  gaps,       │  │
                    │  │              │ │  competitors) │  │
                    │  └──────────────┘ └──────────────┘  │
                    └─────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
│   EXPERT CURATION     │  │   AI OPTIMIZATION     │  │   DISCOVER PAGE       │
│   (Human layer)       │  │   (Platform layer)      │  │   (Traveler-facing)    │
│                       │  │                       │  │                       │
│ • Edit descriptions   │  │ • Embeddings for      │  │ • Expert-curated      │
│ • Verify hours/prices │  │   matching            │  │   event cards         │
│ • Add vendor links    │  │ • Trend detection     │  │ • "Planned by [Name]" │
│ • Write event scripts │  │ • SEO metadata        │  │ • AI-suggested        │
│ • Upload custom photos│  │ • Reranking           │  │   (from expert + AI)  │
│ • Set pricing         │  │ • Gap analysis alerts │  │                       │
└───────────────────────┘  └───────────────────────┘  └───────────────────────┘
```

---

## 3. Global DMO Source Map: API vs. Scraping

### 3.1 Legend

| Symbol | Meaning |
|--------|---------|
| 🟢 **API** | Public or partner REST API available. Low integration effort. |
| 🟡 **Partner Portal** | XML/RSS feed, bulk download, or trade portal. Manual registration required. |
| 🔴 **Scrape Required** | No API. Must use Tavily/Brave + Firecrawl or manual curation. |
| ⭐ **Priority** | Critical for launch. Fill first. |
| ⚠️ **Legal Risk** | Terms of Service prohibit scraping. Requires partnership or legal review. |

---

### 3.2 Launch Market 1: Australia (AU)

| Source | Type | Access | Content | Confidence | Effort | Notes |
|--------|------|--------|---------|------------|--------|-------|
| **ATDW ATLAS API** | 🟢 API | 30-day trial → partner agreement | 40K+ products, geospatial, all categories | 1.0 | Medium | ⭐ National backbone. Start here. |
| **Tourism Australia trade portal** | 🟡 Partner | Trade registration | Image library, itineraries, research | 0.9 | Low | ⭐ Essential for hero imagery. |
| **Tourism Queensland** | 🟡 Partner | State partner portal | Regional attractions, reef content | 0.9 | Low | Feeds into ATDW but has state-specific content. |
| **Visit Victoria** | 🟡 Partner | State partner portal | Melbourne, Great Ocean Road, events | 0.9 | Low | |
| **Destination NSW** | 🟡 Partner | State partner portal | Sydney, Blue Mountains, regional | 0.9 | Low | |
| **ABS Tourism Stats** | 🟢 Open Data | data.gov.au | Arrivals, expenditure, regional trends | 0.95 | Low | Free macro data for "best time to visit" features. |
| **GTFS (Sydney, Melbourne, Brisbane)** | 🟢 Open Data | transit agency portals | Public transport schedules, routes | 0.95 | Low | Essential for event logistics. |
| **Parks Australia** | 🔴 Scrape | parksaustralia.gov.au | National park info, permits, heritage | 0.6 | Medium | ⚠️ Check scraping policy. |

**Data Gap:** ATDW covers tourism products well but may lack **wedding-specific venues** (vineyards, private estates, luxury resorts). Supplement with:
- 🔴 Scrape: Australian wedding venue directories (e.g., `hitched.com.au`, `weddingvenues.com.au`)
- 🟡 Partner: Individual luxury resort partnerships (qualia, Longitude 131°)

---

### 3.3 Launch Market 2: United Kingdom (UK)

| Source | Type | Access | Content | Confidence | Effort | Notes |
|--------|------|--------|---------|------------|--------|-------|
| **VisitBritain** | 🟡 Partner | trade.visitbritain.com | Image library, research, itineraries | 0.9 | Low | ⭐ No product API but massive content library. |
| **VisitEngland** | 🟡 Partner | Partner portal | Attraction data, awards, surveys | 0.85 | Low | |
| **VisitScotland** | 🟡 Partner | Partner portal | Destinations, events, highland content | 0.85 | Low | |
| **Visit Wales** | 🟡 Partner | Partner portal | Castles, coastal paths, cultural | 0.85 | Low | |
| **Discover Northern Ireland** | 🟡 Partner | Partner portal | Causeway Coast, Titanic, Game of Thrones | 0.85 | Low | |
| **Historic England** | 🟡 Partner | heritagefund.org.uk + open data | Heritage sites, listed buildings, coordinates | 0.9 | Low | ⭐ Critical for castle wedding venues. |
| **National Trust** | 🟡 Partner | nationaltrust.org.uk | Properties, gardens, event venues | 0.85 | Low | Many properties host weddings. |
| **English Heritage** | 🟡 Partner | english-heritage.org.uk | Castles, abbeys, historic venues | 0.85 | Low | Wedding venue directory exists. |
| **Ordnance Survey** | 🟢 Open Data | osdatahub.co.uk | Maps, footpaths, heritage locations | 0.95 | Low | Geospatial backbone for UK. |
| **ONS Tourism Stats** | 🟢 Open Data | ons.gov.uk | Inbound tourism, regional spend | 0.95 | Low | |
| **UNESCO World Heritage (UK sites)** | 🟢 API | whc.unesco.org/en/api/ | Stonehenge, Tower of London, etc. | 1.0 | Low | Free, no key. |
| **GTFS (London, National Rail)** | 🟢 Open Data | tfl.gov.uk, nationalrail.co.uk | Transit schedules, route planning | 0.95 | Low | Essential for Edinburgh/Porto-like multi-venue events. |
| **Smartvel API** | 🟢 API | API key (contact) | Events, places, restaurants, CC photos | 1.0 | Low | ⭐ Strong EU coverage but includes UK events/places. |

**Data Gap:** UK has **excellent** DMO content for general tourism but **weak wedding-specific APIs**. The UK wedding venue market is fragmented across:
- 🔴 Scrape: `hitched.co.uk`, `bridebook.co.uk`, `weddingvenues.com` (individual venue pages, pricing, capacity)
- 🟡 Partner: `National Trust` wedding venue listings, `English Heritage` venue hire pages
- 🔴 Scrape: Individual castle/hotel venue pages (e.g., `boveycastle.co.uk`, `ashridgehouse.co.uk`)

**Action:** Build a **"Venue Scraper Agent"** for UK — use Firecrawl to map venue capacity, pricing tiers, and availability from the top 20 wedding venue directories.

---

### 3.4 Launch Market 3: Japan (JP)

| Source | Type | Access | Content | Confidence | Effort | Notes |
|--------|------|--------|---------|------------|--------|-------|
| **JNTO (Japan National Tourism Org)** | 🟡 Partner | jnto.go.jp / partner API | Destination content, travel guides, event calendars | 0.85 | Medium | ⭐ Trade partner program has API access. |
| **Japan Tourism Agency** | 🟢 Open Data | jta.go.jp / data portals | Tourism statistics, regional visitor flows | 0.95 | Low | |
| **Tokyo Metropolitan Gov** | 🟢 Open Data | portal.data.metro.tokyo.lg.jp | Events, attractions, municipal data | 0.9 | Low | |
| **Kyoto City Tourism** | 🔴 Scrape | kyoto.travel / kyoto-np.co.jp | Temple events, cultural experiences, seasonal | 0.6 | Medium | ⚠️ Japanese language content. |
| **UNESCO World Heritage (Japan)** | 🟢 API | whc.unesco.org/en/api/ | Kyoto temples, Mt. Fuji, Hiroshima, etc. | 1.0 | Low | Free. Essential for Kyoto wedding content. |
| **Smartvel API** | 🟢 API | API key | Limited Japan coverage (events/places) | 0.7 | Low | Weak in APAC but worth checking. |
| **Japan Heritage** | 🔴 Scrape | japan-heritage.bunka.go.jp | National heritage sites, cultural stories | 0.6 | High | ⚠️ Japanese language. |

**Data Gap:** Japan is **severely under-covered** for DMO APIs. JNTO has trade content but no public product API. The wedding market is booming ("photo weddings" at temples, kimono ceremonies) but data is scattered:
- 🔴 Scrape: `japan-wedding.com`, `kyoto-wedding.jp`, `takemehome.jp` (venue directories)
- 🔴 Scrape: Individual temple/shrine wedding pages (e.g., `kodaiji.com`, `shoren-in.jp` for wedding reservations)
- 🟡 Partner: JNTO trade portal may have wedding venue partnerships
- 🔴 Scrape: `gurunavi.com`, `tabelog.com` (restaurant data for reception dinners)

**Action:** Japan is a **high-priority AI scraping market**. Deploy Tavily + Firecrawl to map:
1. Temple/shrine wedding venues (capacity, ceremony types, pricing tiers)
2. Ryokan wedding packages (onsen + wedding combination)
3. Seasonal wedding calendars (sakura season, autumn foliage, snow)
4. Local wedding vendor directories (photographers, florists, kimono rental)

**Legal Warning:** ⚠️ Many Japanese temple/shrine sites have strict Terms of Service. Rate-limit at 1 req/sec, respect robots.txt, and prioritize JNTO trade partnerships over scraping for official sites.

---

### 3.5 Launch Market 4: Thailand (TH)

| Source | Type | Access | Content | Confidence | Effort | Notes |
|--------|------|--------|---------|------------|--------|-------|
| **Tourism Authority of Thailand (TAT)** | 🟡 Partner | tat.or.th / trade portal | Destination content, media library, event calendar | 0.8 | Medium | ⭐ Trade partner program. No public API. |
| **Thailand Convention & Exhibition Bureau** | 🟡 Partner | thailandconvention.org | MICE venues, conference centers, event spaces | 0.85 | Medium | ⭐ Relevant for corporate events. |
| **Bangkok Metropolitan Admin** | 🟢 Open Data | data.bangkok.go.th | City events, municipal data | 0.85 | Low | |
| **UNESCO World Heritage (Thailand)** | 🟢 API | whc.unesco.org/en/api/ | Ayutthaya, Sukhothai, etc. | 1.0 | Low | |
| **Smartvel API** | 🟢 API | API key | Limited Thailand coverage | 0.5 | Low | Check current coverage. |
| **Thai wedding directories** | 🔴 Scrape | thaiwedding.com, phuketwedding.com, etc. | Beach wedding venues, packages, pricing | 0.5 | Medium | ⚠️ Fragmented, many outdated sites. |

**Data Gap:** Thailand is a **top-tier destination wedding market** (Phuket, Koh Samui, Krabi, Bangkok) but has **zero structured DMO APIs for wedding venues**. All data is on individual resort websites, wedding planner sites, and DMO landing pages.

**Critical Scraping Targets:**
- 🔴 **Phuket/Samui resort wedding pages** — Every major resort (Amanpuri, Trisara, Four Seasons, Banyan Tree) has a dedicated wedding page with packages, pricing, capacity. Use Firecrawl `crawl` on `/wedding` paths.
- 🔴 **Wedding planner directories** — `thailand-wedding.com`, `weddingphuket.com`, `samui-wedding.com` — aggregate venue lists, vendor contacts, pricing ranges
- 🔴 **TAT beach destination pages** — `tat.or.th` destination pages have attraction lists, beach descriptions, seasonal info (but no wedding content)
- 🟡 **TAT trade portal** — May have wedding venue partner lists, media packs for "Thailand Weddings" campaign

**Action:** Thailand is a **"Scrape + Manual Curation" hybrid**. AI scraping discovers the sources, but local expert validation is mandatory because:
- Resort wedding pricing changes seasonally
- Venue availability is not published online (inquiry-only)
- Vendor quality varies wildly (same photographer, different outcomes)
- Thai language content on local sites is richer than English versions

**Expert Curation Priority:** ⭐⭐⭐ — Every Phuket wedding venue must be expert-verified before showing to travelers.

---

### 3.6 Launch Market 5: Colombia (Bogotá + Cartagena)

| Source | Type | Access | Content | Confidence | Effort | Notes |
|--------|------|--------|---------|------------|--------|-------|
| **ProColombia** | 🟡 Partner | procolombia.co / trade portal | Export/tourism promotion, investment, trade content | 0.85 | Medium | National tourism promotion agency. |
| **Cartagena Tourism Office** | 🔴 Scrape | cartagenadeindias.gov.co / cturismo | City events, attractions, heritage sites | 0.6 | Medium | ⚠️ Spanish language. Limited digital infrastructure. |
| **Bogotá Tourism Office** | 🔴 Scrape | idrd.gov.co / bogotaturismo.gov.co | City events, cultural centers, museums | 0.6 | Medium | ⚠️ Spanish language. |
| **UNESCO World Heritage (Colombia)** | 🟢 API | whc.unesco.org/en/api/ | Cartagena walled city, San Agustín, etc. | 1.0 | Low | Free. Cartagena is the #1 wedding venue. |
| **Colombia National Statistics (DANE)** | 🟢 Open Data | dane.gov.co | Tourism arrivals, regional stats | 0.95 | Low | |
| **Smartvel API** | 🟢 API | API key | Limited Latin America coverage | 0.5 | Low | Check current coverage. |

**Data Gap:** Colombia is **Cartagena-centric** for destination weddings but has **no structured DMO content**. The walled city is the primary venue, but wedding data is scattered across:
- 🔴 **Resort/hotel wedding pages** — Casa San Agustín, Hotel Quadrifolio, Casa Pestagua (all have `/wedding` or `/bodas` pages)
- 🔴 **Wedding planner directories** — `bodascartagena.com`, `matrimonios.com.co`, `weddingwire.co` (colombian WeddingWire)
- 🔴 **Church/venue directories** — Cathedral of Cartagena, Iglesia de San Pedro Claver (wedding ceremony info)
- 🔴 **Local florist/vendor Instagram** — Most Colombian wedding vendors operate via Instagram, not websites. AI scraping hits a wall here.
- 🟡 **ProColombia trade portal** — May have "Colombia Weddings" promotional packs, media assets

**Action:** Colombia is **expert-dependent**. AI scraping can map the hotel/church venues, but the real content is in local experts' heads and Instagram DMs. Budget for:
- 1–2 local expert onboarding trips to Cartagena to manually catalog venues
- Photo asset capture (most Colombian venues have poor web photos)
- Vendor relationship building (florists, caterers, musicians — not online)

**Expert Curation Priority:** ⭐⭐⭐⭐⭐ — This market cannot be scraped to quality. Must be expert-built.

---

### 3.7 Launch Market 6: India (Mumbai + Goa + Jaipur)

| Source | Type | Access | Content | Confidence | Effort | Notes |
|--------|------|--------|---------|------------|--------|-------|
| **Incredible India (Ministry of Tourism)** | 🟡 Partner | incredibleindia.org / trade portal | National campaigns, destination content, media | 0.8 | Medium | ⭐ Trade portal has content packs. |
| **Goa Tourism** | 🔴 Scrape | goa-tourism.com | Beach destinations, events, shacks | 0.6 | Medium | ⚠️ Basic site, limited structure. |
| **Maharashtra Tourism (Mumbai)** | 🔴 Scrape | maharashtratourism.gov.in | City attractions, heritage, events | 0.6 | Medium | ⚠️ Limited digital infrastructure. |
| **Rajasthan Tourism (Jaipur)** | 🔴 Scrape | tourism.rajasthan.gov.in | Forts, palaces, desert camps, heritage | 0.6 | Medium | ⚠️ Critical for palace weddings. |
| **UNESCO World Heritage (India)** | 🟢 API | whc.unesco.org/en/api/ | Taj Mahal, Jaipur forts, Hampi, etc. | 1.0 | Low | Free. Essential for heritage wedding content. |
| **Smartvel API** | 🟢 API | API key | Limited India coverage | 0.4 | Low | Very weak in India. |
| **India Open Data** | 🟢 Open Data | data.gov.in | Tourism statistics, state-level data | 0.9 | Low | |

**Data Gap:** India is the **largest destination wedding market in the world** ("Big Fat Indian Wedding" — $50B+ industry) but DMOs are **not wedding-focused**. The real content is in:
- 🔴 **Palace wedding venues** — Rambagh Palace, Umaid Bhawan, Neemrana Fort, Samode Palace (individual websites with wedding packages)
- 🔴 **Beach wedding venues (Goa)** — Taj Exotica, Park Hyatt, W Goa, Leela (all have `/wedding` pages)
- 🔴 **Wedding vendor directories** — `weddingwire.in`, `wedmegood.com`, `shaadisaga.com` — massive aggregator sites with vendor lists, reviews, pricing
- 🔴 **Banquet hall directories** — `venuemonk.com`, `bookmyshow.com` (venues by city, capacity, pricing)
- 🔴 **Marriage law sites** — Special Marriage Act, Arya Samaj, court marriage procedures (for foreign nationals)
- 🟡 **Incredible India trade portal** — May have wedding tourism promotional content, media packs

**Action:** India is **"Scrape at Scale + Expert Curation"**. The volume is too large for manual entry but too fragmented for simple API:
1. Deploy Tavily + Firecrawl to map the top 50 wedding venues per city (Mumbai: 50, Goa: 50, Jaipur: 50)
2. Scrape `wedmegood.com` and `weddingwire.in` for vendor directories (photographers, makeup, decorators)
3. Use AI to extract structured data from venue pages: capacity, pricing tiers, ceremony types, catering policies
4. **Expert curation is mandatory** — Indian weddings have complex cultural variations (Hindu, Muslim, Christian, Sikh, interfaith) that AI cannot classify correctly

**Expert Curation Priority:** ⭐⭐⭐⭐ — Cultural accuracy is non-negotiable. A Hindu wedding expert must validate all Hindu wedding content. Same for Muslim, Christian, Sikh.

---

### 3.8 Launch Market 7: Portugal (Porto + Douro Valley)

| Source | Type | Access | Content | Confidence | Effort | Notes |
|--------|------|--------|---------|------------|--------|-------|
| **Turismo de Portugal** | 🟡 Partner | visitportugal.com / trade portal | National content, itineraries, media library | 0.85 | Medium | ⭐ Trade portal has partner content. |
| **Porto Tourism** | 🔴 Scrape | visitporto.travel | City attractions, wine cellars, Douro River | 0.6 | Medium | ⚠️ Limited wedding-specific content. |
| **Douro Valley DMO** | 🔴 Scrape | visitdouro.com / douro-valley.com | Wine estates, river cruises, quintas | 0.6 | Medium | ⭐ Quintas are primary wedding venues. |
| **UNESCO World Heritage (Portugal)** | 🟢 API | whc.unesco.org/en/api/ | Douro Valley, Sintra, Porto historic center | 1.0 | Low | Free. Douro Valley is UNESCO — critical for wine wedding narrative. |
| **Smartvel API** | 🟢 API | API key | Strong Portugal/EU coverage | 0.9 | Low | ⭐ Smartvel is strong in Portugal. |
| **EU Tourism Dashboard** | 🟢 API | API (monitor) | Macro indicators, trends | 0.95 | Low | Monitor for Portugal tourism trends. |
| **Portugal Open Data** | 🟢 Open Data | dados.gov.pt | Tourism stats, regional data | 0.9 | Low | |

**Data Gap:** Portugal is a **rising star** for destination weddings (wine country, historic venues, affordable luxury) but has **limited DMO wedding content**:
- 🔴 **Quinta wedding venues** — Quinta da Pacheca, Quinta do Crasto, Six Senses Douro Valley (individual sites with wedding pages)
- 🔴 **Porto venue directories** — `casamentos.pt`, `bodas.net` (Portuguese wedding directories)
- 🔴 **Wine estate event pages** — Most quintas have `/eventos` or `/weddings` pages with capacity, catering, wine pairing info
- 🟡 **Turismo de Portugal trade portal** — May have "Weddings in Portugal" or "Wine Tourism" promotional packs
- 🟡 **Portuguese Wedding Planners Association** — May have venue directories, vendor lists

**Action:** Portugal is **"Smartvel + Scrape + Expert"**:
1. Smartvel provides event/place data for Porto and Douro Valley (restaurants, attractions, cultural events)
2. Firecrawl maps quinta wedding pages (`/eventos`, `/weddings`, `/bodas` paths)
3. Expert curation for wine-pairing menus, seasonal vineyard availability, local vendor relationships

**Expert Curation Priority:** ⭐⭐⭐ — Wine country expertise is essential. A Porto expert must know harvest season (September), off-season pricing, and which quintas have guest accommodation.

---

### 3.9 Launch Market 8: Singapore (SG)

| Source | Type | Access | Content | Confidence | Effort | Notes |
|--------|------|--------|---------|------------|--------|-------|
| **Singapore Tourism Board (STB)** | 🟡 Partner | stb.gov.sg / partner programs | Destination content, SingapoRewards, event calendar | 0.85 | Medium | ⭐ Partner programs for travel trade. No public API. |
| **National Heritage Board** | 🟢 Open Data | heritageboard.gov.sg / roots.gov.sg | Heritage sites, museums, cultural trails | 0.9 | Low | Free. Critical for Peranakan wedding content. |
| **Singapore Open Data** | 🟢 Open Data | data.gov.sg | Tourism stats, event permits, venue data | 0.95 | Low | |
| **UNESCO World Heritage (SG)** | 🟢 API | whc.unesco.org/en/api/ | Botanic Gardens (only UNESCO site) | 1.0 | Low | |
| **Smartvel API** | 🟢 API | API key | Singapore coverage (events/places) | 0.8 | Low | ⭐ Check for Singapore events. |
| **GTFS (Singapore)** | 🟢 Open Data | LTA DataMall | MRT, bus, transit routes | 0.95 | Low | Essential for multi-venue event logistics. |
| **OneFabDay / Singapore wedding directories** | 🔴 Scrape | onefabday.com, singaporebrides.com, etc. | Wedding venues, vendors, reviews | 0.5 | Medium | ⚠️ Competitive sites, may block scraping. |

**Data Gap:** Singapore is a **luxury wedding market** (high-end hotels, garden venues, Peranakan cultural ceremonies) but DMO content is **general tourism, not wedding-specific**:
- 🔴 **Hotel wedding venues** — Raffles Hotel, Marina Bay Sands, Fullerton Hotel, Capella Singapore (all have dedicated wedding pages)
- 🔴 **Garden/nature venues** — Botanic Gardens (UNESCO), Gardens by the Bay, Fort Canning Park (event permit pages)
- 🔴 **Peranakan wedding directories** — Cultural-specific vendors, shophouse venues, traditional attire (very niche, limited online)
- 🟡 **STB partner portal** — May have "Singapore Weddings" or "MICE Events" promotional content, venue lists
- 🟡 **National Heritage Board** — Peranakan culture content, heritage venue listings, cultural story assets

**Action:** Singapore is **"Smartvel + Heritage Board + Expert"**:
1. Smartvel for events/places (restaurants, cultural events, attractions)
2. National Heritage Board for cultural content (Peranakan wedding traditions, heritage venue descriptions)
3. Expert curation for luxury hotel partnerships, event permit processes, and multi-cultural wedding protocols (Chinese, Malay, Indian, Western fusion)

**Expert Curation Priority:** ⭐⭐⭐⭐ — Singapore's multi-cultural wedding protocols are complex. A Chinese wedding at Capella has different customs than an Indian wedding at the same venue. Expert knowledge is the differentiator.

---

## 4. Global Data Gap Summary

### 4.1 By Market (Heat Map)

| Market | API Coverage | DMO Partner Portal | Scrapable Content | Expert-Only Content | Overall Gap |
|--------|-------------|-------------------|------------------|---------------------|-------------|
| **Australia** | 🟢 Strong | 🟢 Strong | 🟡 Moderate | 🟢 Low | **LOW** — ATDW covers most. |
| **UK** | 🟡 Moderate | 🟢 Strong | 🟡 Moderate | 🟡 Moderate | **LOW-MEDIUM** — Heritage data gaps (wedding venues). |
| **Japan** | 🔴 Weak | 🟡 Moderate | 🟡 Moderate | 🔴 High | **HIGH** — Need AI scraping + JNTO partnership. |
| **Thailand** | 🔴 Weak | 🟡 Moderate | 🟡 Moderate | 🔴 High | **HIGH** — Scrape + manual curation required. |
| **Colombia** | 🔴 Weak | 🟡 Moderate | 🟡 Moderate | 🔴 High | **VERY HIGH** — Expert-dependent, not scrapable. |
| **India** | 🔴 Weak | 🟡 Moderate | 🟡 Moderate | 🔴 High | **VERY HIGH** — Volume too large, culture too complex. |
| **Portugal** | 🟡 Moderate | 🟡 Moderate | 🟡 Moderate | 🟡 Moderate | **MEDIUM** — Smartvel helps, but quinta data is scattered. |
| **Singapore** | 🟡 Moderate | 🟡 Moderate | 🟡 Moderate | 🔴 High | **MEDIUM-HIGH** — Heritage data is good, wedding data is fragmented. |

### 4.2 By Content Type (Global)

| Content Type | API Coverage | Gap Markets | Strategy |
|--------------|-------------|-------------|----------|
| **Destination narratives** | 🟢 Strong (Smartvel, DMO portals) | None | Route via API/Partner. AI rewrites for expert workspace. |
| **Attraction POI data** | 🟢 Strong (ATDW, Smartvel, UNESCO) | Colombia, India, Thailand | AI scraping for missing markets. |
| **Event calendars** | 🟡 Moderate (Smartvel, Ticketmaster) | Japan, Colombia, India, Thailand | AI scraping + local expert curation. |
| **Wedding venues** | 🔴 Very Weak | ALL markets | This is the **#1 gap**. Primary AI scraping target. |
| **Wedding vendor directories** | 🔴 Very Weak | ALL markets | Scrape aggregator sites (WeddingWire, WedMeGood). |
| **Cultural / heritage content** | 🟢 Strong (UNESCO, Heritage Boards) | None | Free APIs. Cache and serve. |
| **Itineraries / travel guides** | 🟡 Moderate (DMO trade packs) | Colombia, India, Thailand | Partner portal downloads + AI generation from expert data. |
| **High-res photos** | 🟡 Moderate (DMO media libraries) | Japan, Colombia, India | Partner portals + Smartvel CC photos + Pexels fallback. |
| **Tourism statistics** | 🟢 Strong (Open data, national stats) | None | Automated ingestion from data.gov.* |
| **Transport / logistics** | 🟢 Strong (GTFS, Open Data) | Colombia, India | Limited GTFS in Tier 3 markets. Plan manual logistics. |
| **Restaurant / dining** | 🟡 Moderate (Smartvel, TheFork, OpenTable) | Japan, India, Thailand, Colombia | Local expert curation essential. AI scraping secondary. |
| **Pricing / availability** | 🔴 Very Weak | ALL markets | **No DMO publishes real-time pricing.** Expert curation ONLY. |

---

## 5. AI Scraping Layer Implementation (Tavily + Brave + Firecrawl)

### 5.1 Tool Selection by Task

| Task | Primary Tool | Secondary Tool | Why |
|------|-------------|---------------|-----|
| **Discover DMO pages** | Brave Search API | Tavily Search | Brave is cheaper ($5/1K). Tavily bundles extraction. |
| **Extract full page content** | Firecrawl Scrape | Tavily Extract | Firecrawl returns clean markdown. Tavily extracts up to 20 URLs. |
| **Crawl entire venue sites** | Firecrawl Crawl | — | Map all `/wedding`, `/eventos`, `/bodas` pages recursively. |
| **Structured data extraction** | Firecrawl Extract (LLM) | Custom GPT-4o parser | Define schema: venue_name, capacity, pricing, ceremony_types. |
| **Batch processing (50+ URLs)** | Firecrawl Batch Scrape | Tavily Extract | Async batch jobs for scale. |
| **Multi-language content** | Firecrawl + GPT-4o translation | Tavily (multilingual) | Extract Japanese/Spanish/Portuguese, translate to English for expert review. |
| **Real-time search + answer** | Tavily Search (with answer) | Perplexity API | "What are the top 10 wedding venues in Cartagena?" |

### 5.2 Cost Model by Market Tier

| Tier | Markets | Monthly Pages | Stack | Estimated Cost |
|------|---------|---------------|-------|----------------|
| **Tier 1 (Low Gap)** | Australia, UK | 5,000 pages | Smartvel + ATDW + Firecrawl free | **$0–$25** |
| **Tier 2 (Medium Gap)** | Japan, Portugal, Singapore | 15,000 pages | Smartvel + Brave ($25) + Firecrawl hobby ($16) | **~$41–$50** |
| **Tier 3 (High Gap)** | Thailand, India, Colombia | 30,000+ pages | Tavily growth ($80) + Firecrawl standard ($83) + local expert trips | **~$200–$400** |
| **All Markets** | 8 markets | 50,000 pages | Full stack + manual curation | **~$300–$500/mo** |

### 5.3 Implementation Pseudocode (TypeScript / Express)

```typescript
// content/scrapers/DMOCrawler.ts
import { Firecrawl } from 'firecrawl';
import { TavilyClient } from 'tavily';
import { BraveSearchClient } from './brave-client';

interface VenueSchema {
  venue_name: string;
  location: { city: string; country: string; lat?: number; lng?: number };
  venue_type: 'temple' | 'church' | 'hotel' | 'quinta' | 'palace' | 'beach' | 'garden' | 'heritage' | 'other';
  capacity: { min: number; max: number; unit: 'guests' | 'seated' | 'standing' };
  ceremony_types: string[]; // e.g., ['Hindu', 'Christian', 'Civil', 'Buddhist']
  pricing: { currency: string; range_min: number; range_max: number; basis: 'per_guest' | 'flat' | 'package' };
  description: string;
  images: string[];
  source_url: string;
  source_domain: string;
  scraped_at: Date;
  confidence: number; // 0.0–1.0
  language: string;
  attribution_required: boolean;
  expert_verified: boolean;
  expert_id?: string;
}

class DMOCrawler {
  private firecrawl: Firecrawl;
  private tavily: TavilyClient;
  private brave: BraveSearchClient;
  
  constructor() {
    this.firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
    this.tavily = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });
    this.brave = new BraveSearchClient({ apiKey: process.env.BRAVE_API_KEY });
  }

  // Step 1: Discover — Find DMO and venue pages
  async discoverVenues(query: string, market: string): Promise<string[]> {
    // Use Brave for cheap discovery
    const searchResults = await this.brave.search({
      query: `${query} site:${this.getDMODomain(market)}`,
      count: 20
    });
    
    // Fallback to Tavily if Brave has thin results
    if (searchResults.length < 5) {
      const tavilyResults = await this.tavily.search({
        query: `${query} in ${market}`,
        max_results: 10,
        search_depth: 'basic'
      });
      return tavilyResults.results.map(r => r.url);
    }
    
    return searchResults.map(r => r.url);
  }

  // Step 2: Extract — Scrape full content from discovered URLs
  async extractVenues(urls: string[]): Promise<VenueSchema[]> {
    const batchResults = await this.firecrawl.batchScrape(urls, {
      formats: ['markdown', 'json'],
      json_options: {
        prompt: `Extract wedding/event venue information as JSON with:
        venue_name, location, venue_type, capacity, ceremony_types, 
        pricing, description, images, source_url. 
        If pricing is not listed, mark as "inquiry_required".`
      }
    });
    
    return batchResults.map(r => this.normalizeToSchema(r.json, r.metadata));
  }

  // Step 3: Crawl — Map entire wedding sections of venue sites
  async crawlVenueSite(baseUrl: string): Promise<VenueSchema[]> {
    const crawlResult = await this.firecrawl.crawl(baseUrl, {
      includePaths: ['/wedding', '/weddings', '/bodas', '/eventos', '/events', '/venue-hire'],
      excludePaths: ['/blog', '/news', '/contact'],
      maxDepth: 2,
      limit: 50
    });
    
    return crawlResult.map(page => this.normalizeToSchema(page.markdown, page.metadata));
  }

  // Step 4: Store — Push to Expert Workspace (PostgreSQL)
  async storeForExpertReview(venues: VenueSchema[]): Promise<void> {
    for (const venue of venues) {
      await db.insert(dmoRawContent).values({
        ...venue,
        status: 'pending_expert_review',
        expert_workspace_visible: true,
        discover_page_visible: false, // NEVER direct to travelers
        created_at: new Date()
      });
      
      // Queue for expert notification
      await redis.lpush('expert:pending_review', JSON.stringify({
        venue_id: venue.id,
        market: venue.location.country,
        content_type: 'venue',
        confidence: venue.confidence
      }));
    }
  }

  private getDMODomain(market: string): string {
    const domains: Record<string, string> = {
      thailand: 'tourismthailand.org',
      japan: 'jnto.go.jp',
      singapore: 'visitsingapore.com',
      australia: 'tourism.australia.com',
      uk: 'visitbritain.com',
      colombia: 'procolombia.co',
      india: 'incredibleindia.org',
      portugal: 'visitportugal.com'
    };
    return domains[market] || '';
  }

  private normalizeToSchema(raw: any, metadata: any): VenueSchema {
    // Normalize scraped data to Traveloure schema
    // Apply confidence scoring based on source quality
    return {
      ...raw,
      confidence: this.calculateConfidence(raw, metadata),
      scraped_at: new Date(),
      expert_verified: false
    };
  }

  private calculateConfidence(raw: any, metadata: any): number {
    let score = 0.5; // Base for scraped content
    if (raw.pricing && raw.pricing !== 'inquiry_required') score += 0.2;
    if (raw.capacity && raw.capacity.max > 0) score += 0.1;
    if (raw.images && raw.images.length > 0) score += 0.1;
    if (metadata.source?.includes('official') || metadata.source?.includes('gov')) score += 0.1;
    return Math.min(score, 1.0);
  }
}
```

---

## 6. Expert Workspace UI Specification

### 6.1 Core Views

| View | Purpose | Data Source | User Action |
|------|---------|-------------|-------------|
| **DMO Library** | Browse all raw DMO content by market | Ingestion pipeline (API + scraped + partner) | Filter, search, preview. "Add to My Collection." |
| **My Collection** | Expert's curated content library | Expert-curated subset of DMO Library | Edit, enrich, add photos, set pricing, publish. |
| **Content Builder** | Assemble events/itineraries from POIs | My Collection + AI suggestions | Drag POIs into timelines, add narrative, set pricing. |
| **Photo Library** | Browse DMO photos with license filters | DMO media packs + Smartvel CC + Pexels | Download, request attribution, upload custom. |
| **Analytics** | Market insights, gaps, trends | AI optimization layer + DMO data | See "What's missing in Phuket?" "Trending venues in Cartagena." |
| **Vendor Links** | Connect DMO content to bookable vendors | Expert-added + AI-suggested | Link venue → florist, venue → caterer, etc. |

### 6.2 Content Flow States

```
[RAW DMO DATA] → [Ingested] → [Expert Review] → [Expert Enriched] → [AI Optimized] → [Published to Discover]
     │                │              │                  │                 │                │
     │                │              │                  │                 │                │
     │                │              │    Expert edits  │   AI embeddings │   Traveler sees │
     │                │              │    description,  │   + SEO +       │   curated card  │
     │                │              │    verifies      │   reranking     │   with expert   │
     │                │              │    hours, adds │                 │   name + price  │
     │                │              │    vendor links  │                 │                 │
     │                │              │                  │                 │                 │
   [AI Scraped]   [API Pulled]   [Partner Download]  [Expert Photo]    [AI Suggested]    [Bookable]
```

### 6.3 Confidence Scoring for Expert Review

| Confidence | Source | Action | Discover Visibility |
|------------|--------|--------|---------------------|
| **1.0** | Official API (ATDW, Smartvel, UNESCO) | Auto-ingest, flag for expert review | Hidden until expert reviews |
| **0.8–0.9** | Partner portal (DMO trade packs) | Auto-ingest, flag for expert review | Hidden until expert reviews |
| **0.5–0.7** | AI scraped (Firecrawl) | Auto-ingest, **REQUIRE expert review** | Hidden until expert verifies |
| **0.3–0.4** | Manual curation (local expert trip) | Direct upload by expert | Hidden until expert publishes |
| **0.0–0.2** | Unverified / low-quality | Quarantine, do not show to experts | Never visible |

**Rule:** Nothing above 0.0 appears on the Discover page without expert review. The AI can suggest, but the expert must approve.

---

## 7. Risk & Compliance Matrix

| Risk | Markets | Mitigation | Responsible |
|------|---------|------------|-------------|
| **ToS Violation (scraping)** | Japan, Thailand, Colombia, India | Rate-limit 1 req/sec, respect robots.txt, use partner portals first | Engineering + Legal |
| **Attribution / Licensing** | All | Store license metadata, flag CC vs. restricted, auto-add attribution | Engineering |
| **Data Freshness** | All | DMO content batch-updated weekly. Real-time pricing is expert-only. | Operations |
| **Cultural Accuracy** | India, Japan, Singapore, Thailand | Require culture-specific expert validation before publish | Expert Manager |
| **Translation Quality** | Japan, Colombia, Portugal, Thailand | GPT-4o translation + native expert review | AI + Expert |
| **Competitor Block** | Wedding directories (WeddingWire, WedMeGood) | Rotate proxies, use Firecrawl anti-bot. Legal review if blocked. | Engineering + Legal |
| **DMO Partnership Delay** | All trade portals | Start registration in Week 1. Have scraping fallback ready. | BD + Engineering |

---

## 8. Phase-by-Phase Implementation Roadmap

### Phase 1: Foundation (Weeks 1–4)
**Goal:** Expert workspace has searchable DMO content for 3 priority markets.

| Week | Task | Owner | Deliverable |
|------|------|-------|-------------|
| 1 | Set up Firecrawl + Tavily + Brave API keys | Engineering | API credentials, rate-limit configs |
| 1 | Build `DMOCrawler` class (discover + extract + store) | Engineering | Working scraper with PostgreSQL pipeline |
| 1 | Design Expert Workspace UI mockups (DMO Library, Content Builder) | Product | Figma / wireframes |
| 2 | Integrate **Smartvel API** for EU content | Engineering | Events + places + CC photos for Portugal, UK |
| 2 | Apply for **ATDW trial** (Australia) | BD | Trial API key, sample data |
| 2 | Register **Tourism Australia** trade portal | BD | Trade account, media library access |
| 3 | Scrape **UNESCO API** for all 8 markets (heritage sites) | Engineering | Cached heritage data in PostgreSQL |
| 3 | Scrape **UK wedding venue directories** (Hitched, Bridebook) | Engineering + AI | 200 venue records in expert workspace |
| 3 | Register **VisitBritain** trade portal | BD | Image library access, research downloads |
| 4 | Build **Expert Review UI** (DMO Library + My Collection) | Engineering + Product | Working frontend with filter/search |
| 4 | Onboard 3 UK experts, 2 Australia experts | Operations | Expert accounts, training on DMO Library |
| 4 | **Milestone:** Expert can browse DMO content, add to collection, and publish curated events | — | Demo ready |

### Phase 2: Growth (Weeks 5–8)
**Goal:** Expand to 6 markets. AI scraping covers Japan, Thailand, Portugal.

| Week | Task | Owner | Deliverable |
|------|------|-------|-------------|
| 5 | Apply for **JNTO partner API** | BD | Partner API access or content packs |
| 5 | Scrape **Japan temple wedding venues** (Tavily + Firecrawl) | Engineering | 50 venue records in expert workspace |
| 5 | Scrape **Thailand resort wedding pages** (Phuket, Samui) | Engineering | 50 venue records |
| 6 | Register **TAT trade portal** (Thailand) | BD | Media packs, partner content |
| 6 | Scrape **Portuguese quinta wedding pages** (Firecrawl crawl) | Engineering | 30 quinta records |
| 6 | Integrate **Turismo de Portugal** trade portal | BD | Partner content packs |
| 7 | Build **Content Builder** (drag-and-drop itinerary builder) | Engineering + Product | Working UI for experts to assemble events |
| 7 | Onboard 2 Japan experts, 2 Thailand experts, 1 Portugal expert | Operations | Expert accounts, cultural training |
| 8 | **AI Optimization layer** — embeddings, trend detection, gap analysis | Engineering | AI suggests content gaps to experts |
| 8 | **Milestone:** Expert can build a complete wedding itinerary from DMO content in under 30 minutes | — | Demo ready |

### Phase 3: Scale (Weeks 9–12)
**Goal:** All 8 markets covered. Colombia and India added.

| Week | Task | Owner | Deliverable |
|------|------|-------|-------------|
| 9 | **Colombia expert trip** — Cartagena venue scouting | Operations | 30 venue records, photo assets, vendor contacts |
| 9 | Scrape **Colombia wedding directories** (Matrimonios, Bodas Cartagena) | Engineering | 50 venue records (supplement expert trip) |
| 9 | Register **ProColombia** trade portal | BD | Content packs, media assets |
| 10 | Scrape **India wedding directories** (WedMeGood, WeddingWire.in) | Engineering | 150 venue records (Mumbai, Goa, Jaipur) |
| 10 | Register **Incredible India** trade portal | BD | Media packs, wedding tourism content |
| 10 | Onboard 3 India experts (Hindu, Christian, Muslim specialists) | Operations | Expert accounts, cultural training |
| 11 | **Singapore** — integrate Smartvel + National Heritage Board + STB partner | Engineering + BD | 50 venue records, Peranakan content |
| 11 | Onboard 2 Singapore experts (multi-cultural wedding specialists) | Operations | Expert accounts |
| 12 | **Analytics dashboard** — "What content is missing?" alerts | Engineering | AI-powered gap analysis for all markets |
| 12 | **Milestone:** All 8 markets have expert-curated content visible on Discover page | — | Launch ready |

### Phase 4: Optimization (Months 4–6)
**Goal:** Automated refresh, quality scoring, DMO partnership expansion.

- Weekly DMO content refresh (automated API polling + AI scraping)
- Expert quality scoring (traveler ratings → expert content ratings)
- EU Tourism Data Space monitoring (register interest, prepare for CETDS API)
- APAC DMO direct partnerships (TAT, STB, JNTO — move from scraping to partner feeds)
- AI-generated content suggestions ("Goa is missing beach bonfire wedding content — generate draft?")

---

## 9. Key Metrics & Success Criteria

| Metric | Phase 1 Target | Phase 2 Target | Phase 3 Target | Measurement |
|--------|---------------|---------------|---------------|-------------|
| **DMO content records** | 2,000 | 8,000 | 20,000 | PostgreSQL count |
| **Expert-reviewed records** | 500 | 3,000 | 10,000 | `expert_verified = true` |
| **Markets with expert coverage** | 3 | 6 | 8 | Expert onboarding count |
| **Avg. expert curation time** | 30 min / event | 15 min / event | 10 min / event | Time tracking |
| **AI scraping accuracy** | 60% | 75% | 85% | Expert validation rate (approved vs. rejected) |
| **Content gaps identified** | 20 | 50 | 100 | AI gap analysis alerts |
| **Discover page events** | 100 | 500 | 2,000 | Published events |
| **Expert satisfaction** | 3.5/5 | 4.0/5 | 4.5/5 | Expert NPS survey |

---

## 10. Summary: The Expert-First Principle

> **"Travelers do not book raw DMO data. They book expert-curated experiences. The Expert Workspace is the only path to the Discover page."**

| Layer | What It Is | Who Uses It | Example |
|-------|-----------|-------------|---------|
| **DMO Sources** | Raw government/tourism board data | AI + Engineering | TAT beach descriptions, ATDW attraction listings |
| **AI Scraping** | Automated discovery and extraction | Engineering | Firecrawl extracting Phuket resort wedding pages |
| **Partner Portals** | Manual downloads from trade portals | BD + Operations | VisitBritain image library, Tourism Australia itineraries |
| **Ingestion Pipeline** | Normalized, cached, attributed | Platform | PostgreSQL `dmo_raw_content` table |
| **Expert Workspace** | Curation, validation, enrichment | Experts | Expert reviews Phuket resort data, adds pricing, writes event description |
| **AI Optimization** | Embeddings, matching, trends | Platform | AI suggests "beach wedding in Phuket" to traveler who liked Goa |
| **Discover Page** | Curated, bookable experiences | Travelers | "Phuket Beach Wedding by Expert Somchai — $3,500" |

**The Expert is the bottleneck. The AI is the accelerator. The DMO is the fuel. The Discover page is the product.**

---

*Implementation Map compiled from: DMO Addendum research, AI Scraping Layer research (Tavily/Brave/Firecrawl), Business Plan Reframe (Experience Planning), and user-directed architecture decisions. All content routes to Expert Workspace before Discover Page.*
