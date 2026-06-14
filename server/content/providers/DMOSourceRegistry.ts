/**
 * DMO Source Registry
 * Pre-configured registry of all DMO content sources across 8 launch markets.
 * Sources are classified as: api | partner_portal | scraped | manual_curation
 * 
 * See: research/traveloure_dmo_implementation_map.md for full market analysis.
 */

export interface DMOScrapeConfig {
  rateLimit?: number; // requests per second
  paths?: string[]; // e.g., ["/wedding", "/weddings", "/bodas"]
  selectors?: Record<string, string>;
  respectRobotsTxt?: boolean;
  useProxyRotation?: boolean;
  language?: string;
}

export interface DMOSourceDefinition {
  id: string; // UUID — used as foreign key in dmo_sources table
  name: string;
  domain: string;
  sourceType: "api" | "partner_portal" | "scraped" | "manual_curation" | "unverified";
  market: string; // e.g., "australia", "thailand", "japan"
  marketRegion: string; // "apac", "europe", "americas", "mea"
  apiEndpoint?: string;
  apiDocsUrl?: string;
  partnerPortalUrl?: string;
  scrapeConfig?: DMOScrapeConfig;
  confidence: "official_api" | "partner_pack" | "scraped" | "manual" | "quarantined";
  attributionRequired: boolean;
  attributionText?: string;
  isActive: boolean;
  notes?: string;
}

// ============================================================
// TIER 1: LOW GAP — Australia, UK
// ============================================================

export const TIER1_SOURCES: DMOSourceDefinition[] = [
  // --- AUSTRALIA ---
  {
    id: "dmo-au-atdw",
    name: "Australian Tourism Data Warehouse (ATDW) — ATLAS API",
    domain: "atdw.com.au",
    sourceType: "api",
    market: "australia",
    marketRegion: "apac",
    apiEndpoint: "https://atlas.atdw-online.com.au/api",
    apiDocsUrl: "https://data.sa.gov.au/data/dataset/australian-tourism-data-warehouse-api",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "40K+ tourism products. National coverage. Geospatial search. 30-day trial available. Requires distributor/partner agreement for full access.",
  },
  {
    id: "dmo-au-tourism-australia",
    name: "Tourism Australia — Trade Portal",
    domain: "tourism.australia.com",
    sourceType: "partner_portal",
    market: "australia",
    marketRegion: "apac",
    partnerPortalUrl: "https://trade.australia.com",
    confidence: "partner_pack",
    attributionRequired: true,
    attributionText: "Images © Tourism Australia. Used under partner agreement.",
    isActive: true,
    notes: "Image library, itineraries, research. Trade registration required. Essential for hero imagery.",
  },
  {
    id: "dmo-au-queensland",
    name: "Tourism Queensland — Partner Portal",
    domain: "queensland.com",
    sourceType: "partner_portal",
    market: "australia",
    marketRegion: "apac",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "Regional attractions, reef content. Feeds into ATDW but has state-specific content.",
  },
  {
    id: "dmo-au-victoria",
    name: "Visit Victoria — Partner Portal",
    domain: "visitvictoria.com",
    sourceType: "partner_portal",
    market: "australia",
    marketRegion: "apac",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "Melbourne, Great Ocean Road, events.",
  },
  {
    id: "dmo-au-nsw",
    name: "Destination NSW — Partner Portal",
    domain: "dnsw.com.au",
    sourceType: "partner_portal",
    market: "australia",
    marketRegion: "apac",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "Sydney, Blue Mountains, regional.",
  },
  {
    id: "dmo-au-abs",
    name: "Australian Bureau of Statistics — Tourism Open Data",
    domain: "data.gov.au",
    sourceType: "api",
    market: "australia",
    marketRegion: "apac",
    apiEndpoint: "https://data.gov.au/api",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Arrivals, expenditure, regional trends. Free open data.",
  },
  {
    id: "dmo-au-gtfs",
    name: "Australian Transit GTFS Feeds",
    domain: "transitfeeds.com",
    sourceType: "api",
    market: "australia",
    marketRegion: "apac",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Sydney, Melbourne, Brisbane public transport schedules. Essential for event logistics.",
  },
  {
    id: "dmo-au-parks",
    name: "Parks Australia — National Parks",
    domain: "parksaustralia.gov.au",
    sourceType: "scraped",
    market: "australia",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, respectRobotsTxt: true },
    notes: "National park info, permits, heritage. ⚠️ Check scraping policy.",
  },

  // --- UNITED KINGDOM ---
  {
    id: "dmo-uk-visitbritain",
    name: "VisitBritain — Trade & Media Portal",
    domain: "visitbritain.org",
    sourceType: "partner_portal",
    market: "united_kingdom",
    marketRegion: "europe",
    partnerPortalUrl: "https://trade.visitbritain.com",
    confidence: "partner_pack",
    attributionRequired: true,
    attributionText: "© VisitBritain. Used under travel trade partner agreement.",
    isActive: true,
    notes: "Image library, research, itineraries. No product API but massive content library. Trade registration required.",
  },
  {
    id: "dmo-uk-visitengland",
    name: "VisitEngland — Partner Portal",
    domain: "visitengland.com",
    sourceType: "partner_portal",
    market: "united_kingdom",
    marketRegion: "europe",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "Attraction data, awards, surveys.",
  },
  {
    id: "dmo-uk-visitscotland",
    name: "VisitScotland — Partner Portal",
    domain: "visitscotland.com",
    sourceType: "partner_portal",
    market: "united_kingdom",
    marketRegion: "europe",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "Destinations, events, highland content.",
  },
  {
    id: "dmo-uk-historic-england",
    name: "Historic England — Heritage Register",
    domain: "historicengland.org.uk",
    sourceType: "partner_portal",
    market: "united_kingdom",
    marketRegion: "europe",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "Heritage sites, listed buildings, coordinates. Critical for castle wedding venues.",
  },
  {
    id: "dmo-uk-national-trust",
    name: "National Trust — Properties & Venues",
    domain: "nationaltrust.org.uk",
    sourceType: "partner_portal",
    market: "united_kingdom",
    marketRegion: "europe",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "Properties, gardens, event venues. Many properties host weddings. Wedding venue directory exists.",
  },
  {
    id: "dmo-uk-english-heritage",
    name: "English Heritage — Historic Venues",
    domain: "english-heritage.org.uk",
    sourceType: "partner_portal",
    market: "united_kingdom",
    marketRegion: "europe",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "Castles, abbeys, historic venues. Wedding venue directory.",
  },
  {
    id: "dmo-uk-ordnance-survey",
    name: "Ordnance Survey — Open Data Maps",
    domain: "osdatahub.co.uk",
    sourceType: "api",
    market: "united_kingdom",
    marketRegion: "europe",
    apiEndpoint: "https://api.os.uk",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Maps, footpaths, heritage locations. Geospatial backbone for UK.",
  },
  {
    id: "dmo-uk-ons",
    name: "Office for National Statistics — Tourism Data",
    domain: "ons.gov.uk",
    sourceType: "api",
    market: "united_kingdom",
    marketRegion: "europe",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Inbound tourism, regional spend. Open data.",
  },
  {
    id: "dmo-uk-unesco",
    name: "UNESCO World Heritage — UK Sites",
    domain: "whc.unesco.org",
    sourceType: "api",
    market: "united_kingdom",
    marketRegion: "europe",
    apiEndpoint: "https://whc.unesco.org/en/api/",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Stonehenge, Tower of London, etc. Free, no key.",
  },
  {
    id: "dmo-uk-smartvel",
    name: "Smartvel API — UK Events & Places",
    domain: "smartvel.com",
    sourceType: "api",
    market: "united_kingdom",
    marketRegion: "europe",
    apiEndpoint: "https://api.smartvel.com/v1/",
    apiDocsUrl: "https://www.smartvel.com/smartvel-apis-for-destination-and-tourism-content",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Events, places, restaurants, CC photos. Strong EU coverage including UK.",
  },
  {
    id: "dmo-uk-wedding-hitched",
    name: "Hitched.co.uk — Wedding Venue Directory",
    domain: "hitched.co.uk",
    sourceType: "scraped",
    market: "united_kingdom",
    marketRegion: "europe",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: {
      rateLimit: 1,
      paths: ["/wedding-venues/"],
      respectRobotsTxt: true,
      language: "en",
    },
    notes: "Wedding venue directory. Scrape individual venue pages for capacity, pricing, photos. ⚠️ May block scraping.",
  },
  {
    id: "dmo-uk-wedding-bridebook",
    name: "Bridebook.co.uk — Wedding Venue Directory",
    domain: "bridebook.co.uk",
    sourceType: "scraped",
    market: "united_kingdom",
    marketRegion: "europe",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: {
      rateLimit: 1,
      respectRobotsTxt: true,
    },
    notes: "Wedding venue directory with reviews and pricing tiers.",
  },
];

// ============================================================
// TIER 2: MEDIUM GAP — Japan, Portugal, Singapore
// ============================================================

export const TIER2_SOURCES: DMOSourceDefinition[] = [
  // --- JAPAN ---
  {
    id: "dmo-jp-jnto",
    name: "JNTO — Japan National Tourism Organization (Partner API)",
    domain: "jnto.go.jp",
    sourceType: "partner_portal",
    market: "japan",
    marketRegion: "apac",
    partnerPortalUrl: "https://jnto.go.jp",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "Destination content, travel guides, event calendars. Trade partner program has API access. Apply for partner API.",
  },
  {
    id: "dmo-jp-tourism-agency",
    name: "Japan Tourism Agency — Open Data",
    domain: "jta.go.jp",
    sourceType: "api",
    market: "japan",
    marketRegion: "apac",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Tourism statistics, regional visitor flows. Open data.",
  },
  {
    id: "dmo-jp-tokyo-open",
    name: "Tokyo Metropolitan Government — Open Data Portal",
    domain: "portal.data.metro.tokyo.lg.jp",
    sourceType: "api",
    market: "japan",
    marketRegion: "apac",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Events, attractions, municipal data.",
  },
  {
    id: "dmo-jp-kyoto-travel",
    name: "Kyoto City Tourism — Temple & Cultural Events",
    domain: "kyoto.travel",
    sourceType: "scraped",
    market: "japan",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: {
      rateLimit: 1,
      paths: ["/en/", "/temples/", "/events/"],
      respectRobotsTxt: true,
      language: "ja",
    },
    notes: "Temple events, cultural experiences, seasonal content. ⚠️ Japanese language content. Rate-limit 1 req/sec.",
  },
  {
    id: "dmo-jp-unesco",
    name: "UNESCO World Heritage — Japan Sites",
    domain: "whc.unesco.org",
    sourceType: "api",
    market: "japan",
    marketRegion: "apac",
    apiEndpoint: "https://whc.unesco.org/en/api/",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Kyoto temples, Mt. Fuji, Hiroshima. Free. Essential for Kyoto wedding content.",
  },
  {
    id: "dmo-jp-wedding-venues",
    name: "Japan Wedding Venue Directories",
    domain: "japan-wedding.com",
    sourceType: "scraped",
    market: "japan",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: {
      rateLimit: 1,
      respectRobotsTxt: true,
    },
    notes: "Temple/shrine wedding venues, ryokan wedding packages. ⚠️ ToS may prohibit scraping. Priority: partner registration over scraping.",
  },
  {
    id: "dmo-jp-gurunavi",
    name: "Gurunavi — Restaurant Data",
    domain: "gurunavi.com",
    sourceType: "scraped",
    market: "japan",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: {
      rateLimit: 1,
      respectRobotsTxt: true,
      language: "ja",
    },
    notes: "Restaurant data for reception dinners. Japanese language.",
  },

  // --- PORTUGAL ---
  {
    id: "dmo-pt-turismo-portugal",
    name: "Turismo de Portugal — Trade Portal",
    domain: "visitportugal.com",
    sourceType: "partner_portal",
    market: "portugal",
    marketRegion: "europe",
    partnerPortalUrl: "https://visitportugal.com",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "National content, itineraries, media library. Trade portal has partner content.",
  },
  {
    id: "dmo-pt-douro-valley",
    name: "Douro Valley DMO — Quintas & Wine Estates",
    domain: "visitdouro.com",
    sourceType: "scraped",
    market: "portugal",
    marketRegion: "europe",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: {
      rateLimit: 1,
      paths: ["/wedding", "/weddings", "/eventos", "/bodas"],
      respectRobotsTxt: true,
    },
    notes: "Wine estates, river cruises, quintas. Primary wedding venues. ⚠️ Limited digital infrastructure.",
  },
  {
    id: "dmo-pt-unesco",
    name: "UNESCO World Heritage — Portugal (Douro Valley)",
    domain: "whc.unesco.org",
    sourceType: "api",
    market: "portugal",
    marketRegion: "europe",
    apiEndpoint: "https://whc.unesco.org/en/api/",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Douro Valley, Sintra, Porto historic center. Free. Critical for wine wedding narrative.",
  },
  {
    id: "dmo-pt-smartvel",
    name: "Smartvel API — Portugal Events & Places",
    domain: "smartvel.com",
    sourceType: "api",
    market: "portugal",
    marketRegion: "europe",
    apiEndpoint: "https://api.smartvel.com/v1/",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Strong Portugal/EU coverage. Events, places, restaurants, CC photos.",
  },
  {
    id: "dmo-pt-wedding-casamentos",
    name: "Casamentos.pt — Portuguese Wedding Directory",
    domain: "casamentos.pt",
    sourceType: "scraped",
    market: "portugal",
    marketRegion: "europe",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: {
      rateLimit: 1,
      respectRobotsTxt: true,
    },
    notes: "Portuguese wedding directories. Venue lists, vendor contacts, pricing ranges.",
  },
  {
    id: "dmo-pt-open-data",
    name: "Portugal Open Data — Tourism Statistics",
    domain: "dados.gov.pt",
    sourceType: "api",
    market: "portugal",
    marketRegion: "europe",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Tourism stats, regional data. Open data.",
  },

  // --- SINGAPORE ---
  {
    id: "dmo-sg-stb",
    name: "Singapore Tourism Board (STB) — Partner Programs",
    domain: "stb.gov.sg",
    sourceType: "partner_portal",
    market: "singapore",
    marketRegion: "apac",
    partnerPortalUrl: "https://stb.gov.sg",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "Destination content, SingapoRewards, event calendar. Partner programs for travel trade. No public API.",
  },
  {
    id: "dmo-sg-heritage-board",
    name: "National Heritage Board — Heritage & Culture",
    domain: "heritageboard.gov.sg",
    sourceType: "api",
    market: "singapore",
    marketRegion: "apac",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Heritage sites, museums, cultural trails. Free. Critical for Peranakan wedding content.",
  },
  {
    id: "dmo-sg-open-data",
    name: "Singapore Open Data — Tourism & Events",
    domain: "data.gov.sg",
    sourceType: "api",
    market: "singapore",
    marketRegion: "apac",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Tourism stats, event permits, venue data. Open data.",
  },
  {
    id: "dmo-sg-unesco",
    name: "UNESCO World Heritage — Singapore Botanic Gardens",
    domain: "whc.unesco.org",
    sourceType: "api",
    market: "singapore",
    marketRegion: "apac",
    apiEndpoint: "https://whc.unesco.org/en/api/",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Botanic Gardens (only UNESCO site). Free.",
  },
  {
    id: "dmo-sg-smartvel",
    name: "Smartvel API — Singapore Events & Places",
    domain: "smartvel.com",
    sourceType: "api",
    market: "singapore",
    marketRegion: "apac",
    apiEndpoint: "https://api.smartvel.com/v1/",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Check for Singapore events and places coverage.",
  },
  {
    id: "dmo-sg-gtfs",
    name: "Singapore LTA DataMall — GTFS Transit",
    domain: "datamall.lta.gov.sg",
    sourceType: "api",
    market: "singapore",
    marketRegion: "apac",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "MRT, bus, transit routes. Essential for multi-venue event logistics.",
  },
  {
    id: "dmo-sg-wedding-onefabday",
    name: "OneFabDay / SingaporeBrides — Wedding Directory",
    domain: "onefabday.com",
    sourceType: "scraped",
    market: "singapore",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: {
      rateLimit: 1,
      respectRobotsTxt: true,
    },
    notes: "Wedding venues, vendors, reviews. ⚠️ Competitive sites, may block scraping.",
  },
];

// ============================================================
// TIER 3: HIGH / VERY HIGH GAP — Thailand, Colombia, India
// ============================================================

export const TIER3_SOURCES: DMOSourceDefinition[] = [
  // --- THAILAND ---
  {
    id: "dmo-th-tat",
    name: "Tourism Authority of Thailand (TAT) — Trade Portal",
    domain: "tat.or.th",
    sourceType: "partner_portal",
    market: "thailand",
    marketRegion: "apac",
    partnerPortalUrl: "https://tat.or.th",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "Destination content, media library, event calendar. Trade partner program. No public API. ⚠️ ToS may prohibit scraping.",
  },
  {
    id: "dmo-th-tceb",
    name: "Thailand Convention & Exhibition Bureau — MICE Venues",
    domain: "thailandconvention.org",
    sourceType: "partner_portal",
    market: "thailand",
    marketRegion: "apac",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "MICE venues, conference centers, event spaces. Relevant for corporate events.",
  },
  {
    id: "dmo-th-bangkok-open",
    name: "Bangkok Metropolitan Administration — Open Data",
    domain: "data.bangkok.go.th",
    sourceType: "api",
    market: "thailand",
    marketRegion: "apac",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "City events, municipal data. Open data.",
  },
  {
    id: "dmo-th-unesco",
    name: "UNESCO World Heritage — Thailand",
    domain: "whc.unesco.org",
    sourceType: "api",
    market: "thailand",
    marketRegion: "apac",
    apiEndpoint: "https://whc.unesco.org/en/api/",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Ayutthaya, Sukhothai. Free.",
  },
  {
    id: "dmo-th-wedding-phuket",
    name: "Phuket / Samui Resort Wedding Pages",
    domain: "amanpuri.com",
    sourceType: "scraped",
    market: "thailand",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: {
      rateLimit: 1,
      paths: ["/wedding", "/weddings", "/events"],
      respectRobotsTxt: true,
    },
    notes: "Every major resort (Amanpuri, Trisara, Four Seasons, Banyan Tree) has dedicated wedding pages. Use Firecrawl crawl on /wedding paths. Primary scraping target.",
  },
  {
    id: "dmo-th-wedding-directories",
    name: "Thailand Wedding Planner Directories",
    domain: "thailand-wedding.com",
    sourceType: "scraped",
    market: "thailand",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, respectRobotsTxt: true },
    notes: "Wedding planner directories. Aggregate venue lists, vendor contacts, pricing ranges. Fragmented, many outdated sites.",
  },

  // --- COLOMBIA ---
  {
    id: "dmo-co-procolombia",
    name: "ProColombia — Trade Portal",
    domain: "procolombia.co",
    sourceType: "partner_portal",
    market: "colombia",
    marketRegion: "americas",
    partnerPortalUrl: "https://procolombia.co",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "Export/tourism promotion, investment, trade content. National tourism promotion agency.",
  },
  {
    id: "dmo-co-cartagena-tourism",
    name: "Cartagena Tourism Office",
    domain: "cartagenadeindias.gov.co",
    sourceType: "scraped",
    market: "colombia",
    marketRegion: "americas",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, respectRobotsTxt: true, language: "es" },
    notes: "City events, attractions, heritage sites. ⚠️ Spanish language. Limited digital infrastructure. Must be expert-dependent.",
  },
  {
    id: "dmo-co-bogota-tourism",
    name: "Bogotá Tourism Office",
    domain: "idrd.gov.co",
    sourceType: "scraped",
    market: "colombia",
    marketRegion: "americas",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, respectRobotsTxt: true, language: "es" },
    notes: "City events, cultural centers, museums. ⚠️ Spanish language.",
  },
  {
    id: "dmo-co-unesco",
    name: "UNESCO World Heritage — Colombia (Cartagena Walled City)",
    domain: "whc.unesco.org",
    sourceType: "api",
    market: "colombia",
    marketRegion: "americas",
    apiEndpoint: "https://whc.unesco.org/en/api/",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Cartagena walled city, San Agustín. Free. Cartagena is the #1 wedding venue.",
  },
  {
    id: "dmo-co-dane",
    name: "Colombia National Statistics (DANE)",
    domain: "dane.gov.co",
    sourceType: "api",
    market: "colombia",
    marketRegion: "americas",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Tourism arrivals, regional stats. Open data.",
  },
  {
    id: "dmo-co-wedding-bodas",
    name: "BodasCartagena / Matrimonios — Colombian Wedding Directories",
    domain: "bodascartagena.com",
    sourceType: "scraped",
    market: "colombia",
    marketRegion: "americas",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, respectRobotsTxt: true, language: "es" },
    notes: "Wedding venues, vendors, reviews. Spanish language. AI scraping discovers sources; expert validation is mandatory.",
  },

  // --- INDIA ---
  {
    id: "dmo-in-incredible-india",
    name: "Incredible India — Ministry of Tourism Trade Portal",
    domain: "incredibleindia.org",
    sourceType: "partner_portal",
    market: "india",
    marketRegion: "apac",
    partnerPortalUrl: "https://incredibleindia.org",
    confidence: "partner_pack",
    attributionRequired: true,
    isActive: true,
    notes: "National campaigns, destination content, media. Trade portal has content packs. ⚠️ Not wedding-focused.",
  },
  {
    id: "dmo-in-unesco",
    name: "UNESCO World Heritage — India",
    domain: "whc.unesco.org",
    sourceType: "api",
    market: "india",
    marketRegion: "apac",
    apiEndpoint: "https://whc.unesco.org/en/api/",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Taj Mahal, Jaipur forts, Hampi. Free. Essential for heritage wedding content.",
  },
  {
    id: "dmo-in-open-data",
    name: "India Open Data — Tourism Statistics",
    domain: "data.gov.in",
    sourceType: "api",
    market: "india",
    marketRegion: "apac",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Tourism statistics, state-level data. Open data.",
  },
  {
    id: "dmo-in-wedding-wedmegood",
    name: "WedMeGood — Indian Wedding Directory",
    domain: "wedmegood.com",
    sourceType: "scraped",
    market: "india",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, respectRobotsTxt: true },
    notes: "Massive aggregator with vendor lists, reviews, pricing. 50B wedding market. Top scraping target.",
  },
  {
    id: "dmo-in-wedding-weddingwire",
    name: "WeddingWire.in — Indian Wedding Directory",
    domain: "weddingwire.in",
    sourceType: "scraped",
    market: "india",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, respectRobotsTxt: true },
    notes: "Vendor directories, venue lists, pricing. Scrape top 50 venues per city (Mumbai, Goa, Jaipur).",
  },
  {
    id: "dmo-in-venue-monk",
    name: "VenueMonk — Banquet Hall Directory",
    domain: "venuemonk.com",
    sourceType: "scraped",
    market: "india",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, respectRobotsTxt: true },
    notes: "Venues by city, capacity, pricing. Banquet halls and event spaces.",
  },
  {
    id: "dmo-in-palace-venues",
    name: "India Palace Wedding Venues — Individual Sites",
    domain: "rambaghpalace.com",
    sourceType: "scraped",
    market: "india",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: {
      rateLimit: 1,
      paths: ["/wedding", "/weddings", "/events", "/celebrations"],
      respectRobotsTxt: true,
    },
    notes: "Rambagh Palace, Umaid Bhawan, Neemrana Fort, Samode Palace. Individual websites with wedding packages. Scrape wedding pages for capacity, pricing, ceremony types.",
  },
];

// ============================================================
// GLOBAL SOURCES (Cross-market)
// ============================================================

export const GLOBAL_SOURCES: DMOSourceDefinition[] = [
  {
    id: "dmo-global-unesco",
    name: "UNESCO World Heritage Centre API",
    domain: "whc.unesco.org",
    sourceType: "api",
    market: "global",
    marketRegion: "global",
    apiEndpoint: "https://whc.unesco.org/en/api/",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "World Heritage Sites worldwide. Free, no key. REST/XML API. Essential for heritage wedding content in every market.",
  },
  {
    id: "dmo-global-smartvel",
    name: "Smartvel API — DMO Content Aggregator",
    domain: "smartvel.com",
    sourceType: "api",
    market: "global",
    marketRegion: "europe",
    apiEndpoint: "https://api.smartvel.com/v1/",
    apiDocsUrl: "https://www.smartvel.com/smartvel-apis-for-destination-and-tourism-content",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Events, places, restaurants, CC photos. Strongest in Europe (Spain, France, Italy, UK, Germany, Portugal). Global coverage but EU-centric. Contact for API key.",
  },
  {
    id: "dmo-global-eu-dashboard",
    name: "EU Tourism Dashboard",
    domain: "single-market-economy.ec.europa.eu",
    sourceType: "api",
    market: "global",
    marketRegion: "europe",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "30+ indicators (tourism intensity, seasonality, GHG, digital adoption). API available. Monitor CETDS (2025–2028) for future unified DMO API.",
  },
];

// ============================================================
// ALL SOURCES COMBINED
// ============================================================

export const ALL_DMO_SOURCES: DMOSourceDefinition[] = [
  ...TIER1_SOURCES,
  ...TIER2_SOURCES,
  ...TIER3_SOURCES,
  ...GLOBAL_SOURCES,
];

// ============================================================
// HELPERS
// ============================================================

export function getSourcesByMarket(market: string): DMOSourceDefinition[] {
  return ALL_DMO_SOURCES.filter((s) => s.market === market || s.market === "global");
}

export function getSourcesByRegion(region: string): DMOSourceDefinition[] {
  return ALL_DMO_SOURCES.filter((s) => s.marketRegion === region || s.marketRegion === "global");
}

export function getSourcesByType(type: DMOSourceDefinition["sourceType"]): DMOSourceDefinition[] {
  return ALL_DMO_SOURCES.filter((s) => s.sourceType === type);
}

export function getScrapableSources(): DMOSourceDefinition[] {
  return ALL_DMO_SOURCES.filter((s) => s.sourceType === "scraped" && s.isActive);
}

export function getApiSources(): DMOSourceDefinition[] {
  return ALL_DMO_SOURCES.filter((s) => s.sourceType === "api" && s.isActive);
}

export function getPartnerPortalSources(): DMOSourceDefinition[] {
  return ALL_DMO_SOURCES.filter((s) => s.sourceType === "partner_portal" && s.isActive);
}

export function getGapSeverity(market: string): "low" | "medium" | "high" | "very_high" {
  const sources = getSourcesByMarket(market);
  const apiCount = sources.filter((s) => s.sourceType === "api").length;
  const partnerCount = sources.filter((s) => s.sourceType === "partner_portal").length;
  const scrapeCount = sources.filter((s) => s.sourceType === "scraped").length;
  const total = apiCount + partnerCount + scrapeCount;

  if (apiCount >= 3 && partnerCount >= 3) return "low";
  if (apiCount >= 1 && partnerCount >= 2 && scrapeCount >= 3) return "medium";
  if (scrapeCount >= 5 && apiCount < 2) return "high";
  return "very_high";
}

export function getMarketGapSummary(): Record<string, { gap: string; apiCount: number; partnerCount: number; scrapeCount: number; expertPriority: number; notes: string }> {
  const markets = [...new Set(ALL_DMO_SOURCES.map((s) => s.market).filter((m) => m !== "global"))];
  const summary: Record<string, any> = {};

  for (const market of markets) {
    const sources = getSourcesByMarket(market);
    const apiCount = sources.filter((s) => s.sourceType === "api").length;
    const partnerCount = sources.filter((s) => s.sourceType === "partner_portal").length;
    const scrapeCount = sources.filter((s) => s.sourceType === "scraped").length;
    const gap = getGapSeverity(market);

    let expertPriority = 1;
    let notes = "";
    switch (gap) {
      case "low":
        expertPriority = 1;
        notes = "Strong API coverage. Focus on expert curation of existing data.";
        break;
      case "medium":
        expertPriority = 2;
        notes = "API + partner coverage available. AI scraping fills gaps. Expert curation for wedding-specific content.";
        break;
      case "high":
        expertPriority = 3;
        notes = "Limited API coverage. Heavy reliance on AI scraping + expert validation. Budget for local expert trips.";
        break;
      case "very_high":
        expertPriority = 5;
        notes = "Minimal structured data. Expert-dependent. Must budget for manual venue scouting and vendor relationship building.";
        break;
    }

    summary[market] = { gap, apiCount, partnerCount, scrapeCount, expertPriority, notes };
  }

  return summary;
}
