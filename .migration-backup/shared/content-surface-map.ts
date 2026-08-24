/**
 * Central Content Surface Map
 * Single source of truth for content types, platform surfaces, and routing rules.
 * Imported by both server (routes.ts) and client (CuratedContentSection, admin pages).
 */

// ─── Content Types ────────────────────────────────────────────────────────────

export const CONTENT_TYPES = {
  experience: {
    label: "Experience",
    description: "Tours, activities, and curated experiences",
    color: "blue",
  },
  template: {
    label: "Template",
    description: "Planning templates for trips and events",
    color: "purple",
  },
  service: {
    label: "Service",
    description: "Expert or provider services",
    color: "green",
  },
  media: {
    label: "Media",
    description: "Photos, videos, and multimedia content",
    color: "orange",
  },
  trip: {
    label: "Trip",
    description: "User trip plans",
    color: "pink",
  },
  itinerary: {
    label: "Itinerary",
    description: "Generated itineraries",
    color: "indigo",
  },
  review: {
    label: "Review",
    description: "User reviews and ratings",
    color: "yellow",
  },
  expert_profile: {
    label: "Expert Profile",
    description: "Local expert profiles",
    color: "teal",
  },
  vendor: {
    label: "Vendor",
    description: "Vendors and suppliers",
    color: "gray",
  },
  other: {
    label: "Other",
    description: "Miscellaneous content",
    color: "gray",
  },
} as const;

export type ContentTypeKey = keyof typeof CONTENT_TYPES;

// ─── Platform Surfaces ────────────────────────────────────────────────────────

export const PLATFORM_SURFACES = {
  "travelpulse-discover": {
    label: "TravelPulse Discover",
    path: "/discover",
    description: "Main discover page — trending cities and curated city content",
    icon: "TrendingUp",
  },
  // Remediation P3: 'experience-discovery' RETIRED (its page was orphaned, /discover-experiences
  // redirects to /discover which already covers it; unique catalog browse lives in
  // TravelpayoutsSection/fever-events-section). The redirect stays for bookmark continuity.
  "spontaneous": {
    label: "Spontaneous Discovery",
    path: "/spontaneous",
    description: "Live intel and spontaneous same-day activity discovery",
    icon: "Zap",
  },
  "experience-template": {
    label: "Experience Template",
    path: "/experiences/:slug/new",
    description: "Experience planning pages (wedding, travel, corporate, etc.)",
    icon: "LayoutTemplate",
  },
  // Remediation P3: 'itinerary' content-surface RETIRED (no consumer ever sent surface=itinerary and
  // TripDetails renders no curated section). The /itinerary/:id → /trip route redirect is KEPT
  // (load-bearing for many live PlanCard/HeroSection links) — only the content-surface entry is gone.
} as const;

export type SurfaceSlug = keyof typeof PLATFORM_SURFACES;
export const SURFACE_SLUGS = Object.keys(PLATFORM_SURFACES) as SurfaceSlug[];

// ─── Surface → Default Content Types ─────────────────────────────────────────
// Used as fallback when no explicit placement rule exists.

export const SURFACE_DEFAULT_CONTENT_TYPES: Record<SurfaceSlug, ContentTypeKey[]> = {
  "travelpulse-discover": ["experience", "template", "service", "media"],
  "spontaneous": ["experience", "template"],
  "experience-template": ["experience", "template", "service", "media"],
};

// ─── Surface → Default Affiliate Product Categories ───────────────────────────

export const SURFACE_DEFAULT_AFFILIATE_CATEGORIES: Record<SurfaceSlug, string[]> = {
  "travelpulse-discover": ["activity", "tour", "experience", "attraction"],
  "spontaneous": ["activity", "tour", "experience"],
  "experience-template": ["activity", "tour", "accommodation", "transport", "experience"],
};

// ─── Tab → Content Type Map ───────────────────────────────────────────────────
// Maps experience-template tab slugs to allowed content_registry contentType values.

export const TAB_CONTENT_TYPE_MAP: Record<string, ContentTypeKey[]> = {
  // ── Shared across multiple templates ──────────────────────────────────────
  venues: ["experience", "template", "service"],
  venue: ["experience", "template", "service"],
  dining: ["service", "experience"],
  accommodations: ["service"],
  "guest-accommodations": ["service"],
  activities: ["experience", "template"],
  photography: ["service"],
  "photography-video": ["service", "media"],
  transportation: ["service"],
  transfers: ["service"],
  entertainment: ["experience"],
  wellness: ["service", "experience"],
  "spa-wellness": ["service", "experience"],
  shopping: ["experience"],
  nightlife: ["experience"],
  sports: ["experience"],
  vendors: ["service"],
  "team-activities": ["experience"],
  services: ["service"],
  events: ["experience", "template"],
  catering: ["service", "experience"],
  decor: ["service"],
  "decor-setup": ["service"],
  tickets: ["experience", "template"],
  "vip-experiences": ["experience"],
  "pre-game": ["experience", "service"],
  "gifts-keepsakes": ["service", "experience"],
  keepsakes: ["service", "experience"],

  // ── Travel template ───────────────────────────────────────────────────────
  hotels: ["service"],                          // hotel search tab
  flights: ["service"],                         // flights tab (no curated content, passthrough)

  // ── Wedding template ──────────────────────────────────────────────────────
  rehearsal: ["service", "experience"],         // rehearsal dinner venues + catering
  "welcome-events": ["experience", "template"], // welcome events for wedding guests
  "local-experiences": ["experience", "template"], // local activities for wedding guests

  // ── Proposal template ────────────────────────────────────────────────────
  locations: ["experience", "template", "service"], // proposal spot discovery
  "celebration-dining": ["service", "experience"],  // post-proposal dinner
  "post-proposal": ["experience", "service"],       // post-proposal activities

  // ── Date-night / romance template ────────────────────────────────────────
  spa: ["service", "experience"],               // single-word spa tab (date-night)

  // ── Party templates (baby-shower, graduation, engagement, housewarming, etc.)
  decorations: ["service"],                     // decor & styling vendors
  rentals: ["service"],                         // furniture / equipment rentals
  av: ["service"],                              // A/V equipment (career-achievement)

  // ── Bachelor / bachelorette template ─────────────────────────────────────
  destinations: ["experience", "template"],     // destination inspiration cards
  "daytime-activities": ["experience", "template"], // daytime bach activities
  "party-services": ["service"],                // party planning services

  // ── Anniversary trip template ─────────────────────────────────────────────
  experiences: ["experience", "template"],      // couple experiences
  "special-touches": ["service", "experience"], // gifts, surprises, upgrades
};

// ─── Tab → Affiliate Product Category Map ────────────────────────────────────

export const TAB_AFFILIATE_CATEGORIES: Record<string, string[]> = {
  // ── Shared across multiple templates ──────────────────────────────────────
  venues: ["venue", "events", "conference"],
  venue: ["venue", "events", "conference"],
  dining: ["food", "restaurant", "dining", "culinary"],
  accommodations: ["accommodation", "hotel", "lodging"],
  "guest-accommodations": ["accommodation", "hotel", "lodging"],
  activities: ["activity", "tour", "outdoor", "entertainment", "sport"],
  photography: ["photography", "media"],
  "photography-video": ["photography", "media", "video"],
  transportation: ["transport", "transfer", "car", "train"],
  transfers: ["transport", "transfer", "shuttle"],
  entertainment: ["entertainment", "show", "concert", "theater"],
  wellness: ["wellness", "spa", "fitness"],
  "spa-wellness": ["wellness", "spa", "fitness"],
  shopping: ["shopping", "retail", "market"],
  nightlife: ["nightlife", "bar", "club"],
  sports: ["sport", "outdoor", "adventure"],
  vendors: ["service", "vendor"],
  "team-activities": ["activity", "team", "group"],
  services: ["service", "concierge", "planning"],
  events: ["event", "conference", "festival", "show"],
  catering: ["food", "catering", "dining", "culinary"],
  decor: ["decor", "floral", "design"],
  "decor-setup": ["decor", "setup", "floral", "design"],
  tickets: ["ticket", "event", "attraction", "activity"],
  "vip-experiences": ["vip", "luxury", "exclusive", "experience"],
  "pre-game": ["dining", "activity", "sport", "entertainment"],
  "gifts-keepsakes": ["gift", "souvenir", "keepsake", "shopping"],
  keepsakes: ["gift", "souvenir", "keepsake"],

  // ── Travel template ───────────────────────────────────────────────────────
  hotels: ["accommodation", "hotel", "lodging", "resort"],
  flights: [],                                          // no affiliate products for flights

  // ── Wedding template ──────────────────────────────────────────────────────
  rehearsal: ["food", "restaurant", "dining", "venue", "catering"],
  "welcome-events": ["activity", "tour", "entertainment", "experience"],
  "local-experiences": ["activity", "tour", "attraction", "experience"],

  // ── Proposal template ────────────────────────────────────────────────────
  locations: ["attraction", "venue", "experience", "tour"],
  "celebration-dining": ["food", "restaurant", "dining", "culinary", "wine"],
  "post-proposal": ["activity", "tour", "experience", "entertainment"],

  // ── Date-night / romance template ────────────────────────────────────────
  spa: ["wellness", "spa", "fitness", "beauty"],

  // ── Party templates ───────────────────────────────────────────────────────
  decorations: ["decor", "floral", "design", "rental"],
  rentals: ["rental", "equipment", "furniture"],
  av: ["equipment", "rental", "technology"],

  // ── Bachelor / bachelorette template ─────────────────────────────────────
  destinations: ["activity", "tour", "attraction", "experience"],
  "daytime-activities": ["activity", "tour", "outdoor", "sport", "adventure"],
  "party-services": ["service", "planning", "concierge", "entertainment"],

  // ── Anniversary trip template ─────────────────────────────────────────────
  experiences: ["activity", "tour", "experience", "romantic", "couple"],
  "special-touches": ["gift", "experience", "luxury", "upgrade", "surprise"],
};

// ─── Pulse Score Tier Labels ──────────────────────────────────────────────────

export const PULSE_SCORE_TIERS = [
  { min: 0, max: 0, label: "Any city (no threshold)", color: "gray" },
  { min: 1, max: 39, label: "Low activity (1–39)", color: "blue" },
  { min: 40, max: 59, label: "Moderate (40–59)", color: "green" },
  { min: 60, max: 74, label: "Busy (60–74)", color: "yellow" },
  { min: 75, max: 89, label: "Trending (75–89)", color: "orange" },
  { min: 90, max: 100, label: "Hot! (90–100)", color: "red" },
] as const;

export function getPulseTierLabel(score: number): string {
  if (score === 0) return "Any city";
  if (score < 40) return "Low activity";
  if (score < 60) return "Moderate";
  if (score < 75) return "Busy";
  if (score < 90) return "Trending";
  return "Hot!";
}

// ─── Content Source Types ─────────────────────────────────────────────────────

export const CONTENT_SOURCES = {
  affiliate_product: { label: "Affiliate Product", description: "From affiliate_products table" },
  content_registry: { label: "Content Registry", description: "From content_registry table" },
} as const;

export type ContentSourceKey = keyof typeof CONTENT_SOURCES;
