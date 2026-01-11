export interface CategoryMapping {
  primarySlugs: string[];
  keywords: string[];
  serpTypes?: string[];
}

export const tabCategoryMapping: Record<string, CategoryMapping> = {
  flights: {
    primarySlugs: ["transportation-logistics"],
    keywords: ["flights", "flight", "airline", "airport", "travel", "booking", "air"],
    serpTypes: ["airport", "travel_agency"],
  },
  
  hotels: {
    primarySlugs: ["tours-experiences"],
    keywords: ["hotels", "hotel", "accommodation", "lodging", "resort", "inn", "stay", "booking", "room"],
    serpTypes: ["hotel", "lodging", "resort"],
  },
  
  accommodations: {
    primarySlugs: ["tours-experiences"],
    keywords: ["accommodations", "accommodation", "hotel", "lodging", "resort", "inn", "stay", "rental", "airbnb", "vacation"],
    serpTypes: ["hotel", "lodging", "resort", "vacation_rental"],
  },
  
  activities: {
    primarySlugs: ["tours-experiences", "health-wellness"],
    keywords: ["activities", "activity", "tour", "experience", "adventure", "excursion", "outdoor", "recreation", "fun", "things to do"],
    serpTypes: ["tourist_attraction", "amusement_park", "park", "recreation"],
  },
  
  adventures: {
    primarySlugs: ["tours-experiences", "health-wellness"],
    keywords: ["adventures", "adventure", "outdoor", "extreme", "sport", "hiking", "climbing", "rafting", "zip", "tour"],
    serpTypes: ["adventure_sports", "outdoor_recreation", "hiking_area"],
  },
  
  transportation: {
    primarySlugs: ["transportation-logistics"],
    keywords: ["transportation", "transport", "driver", "car", "limo", "shuttle", "bus", "transfer", "chauffeur", "ride", "taxi"],
    serpTypes: ["car_rental", "taxi", "limousine_service"],
  },
  
  dining: {
    primarySlugs: ["food-culinary"],
    keywords: ["dining", "restaurant", "food", "chef", "culinary", "meal", "catering", "cuisine", "dinner", "lunch", "breakfast"],
    serpTypes: ["restaurant", "fine_dining", "cafe"],
  },
  
  venue: {
    primarySlugs: ["events-celebrations", "specialty-services"],
    keywords: ["venue", "venues", "location", "space", "hall", "ballroom", "estate", "garden", "room", "site", "event space"],
    serpTypes: ["event_venue", "banquet_hall", "wedding_venue", "park", "beach", "garden", "museum", "rooftop", "estate", "winery"],
  },
  
  catering: {
    primarySlugs: ["food-culinary", "events-celebrations"],
    keywords: ["catering", "caterer", "food", "chef", "meal", "cuisine", "buffet", "banquet", "menu", "cook", "food service"],
    serpTypes: ["caterer", "food_service"],
  },
  
  photography: {
    primarySlugs: ["photography-videography"],
    keywords: ["photography", "photo", "photographer", "videography", "videograph", "camera", "portrait", "shoot", "event photo"],
    serpTypes: ["photographer", "photography_studio"],
  },
  
  florist: {
    primarySlugs: ["events-celebrations"],
    keywords: ["florist", "flower", "floral", "bouquet", "arrangement", "bloom", "rose", "flowers", "centerpiece"],
    serpTypes: ["florist", "flower_shop"],
  },
  
  entertainment: {
    primarySlugs: ["events-celebrations", "tours-experiences"],
    keywords: ["entertainment", "music", "dj", "band", "performer", "singer", "musician", "live", "show", "act", "performance"],
    serpTypes: ["entertainment", "live_music", "dj_service", "band"],
  },
  
  decorations: {
    primarySlugs: ["events-celebrations", "specialty-services"],
    keywords: ["decorations", "decor", "decoration", "design", "styling", "balloon", "lighting", "setup", "theme", "centerpiece", "decorator"],
    serpTypes: ["event_planner", "party_supply_store", "decorator"],
  },
  
  nightlife: {
    primarySlugs: ["tours-experiences", "events-celebrations"],
    keywords: ["nightlife", "club", "bar", "lounge", "party", "night", "dance", "vip", "bottle", "night out"],
    serpTypes: ["night_club", "bar", "lounge", "casino"],
  },
  
  sports: {
    primarySlugs: ["tours-experiences", "health-wellness"],
    keywords: ["sports", "sport", "game", "golf", "tennis", "fitness", "gym", "athletic", "stadium", "match", "recreation"],
    serpTypes: ["sports_complex", "golf_course", "stadium", "gym"],
  },
  
  spa: {
    primarySlugs: ["health-wellness"],
    keywords: ["spa", "wellness", "massage", "relax", "treatment", "facial", "body", "sauna", "therapy", "relaxation"],
    serpTypes: ["spa", "wellness_center", "massage"],
  },
  
  wellness: {
    primarySlugs: ["health-wellness"],
    keywords: ["wellness", "yoga", "meditation", "fitness", "health", "retreat", "mindfulness", "healing"],
    serpTypes: ["wellness_center", "yoga_studio", "meditation_center"],
  },
  
  shopping: {
    primarySlugs: ["personal-assistance", "tours-experiences"],
    keywords: ["shopping", "boutique", "store", "retail", "mall", "fashion", "designer", "personal shopper"],
    serpTypes: ["shopping_mall", "boutique", "department_store"],
  },
  
  "av-equipment": {
    primarySlugs: ["technology-connectivity", "events-celebrations"],
    keywords: ["av", "audio", "visual", "sound", "projector", "screen", "microphone", "speaker", "tech", "equipment"],
    serpTypes: ["audio_visual_equipment_rental"],
  },
  
  "team-building": {
    primarySlugs: ["tours-experiences", "events-celebrations"],
    keywords: ["team", "building", "corporate", "group", "activity", "workshop", "retreat", "bonding"],
    serpTypes: ["team_building", "corporate_event", "escape_room"],
  },
  
  rentals: {
    primarySlugs: ["events-celebrations", "taskrabbit-services"],
    keywords: ["rental", "rent", "equipment", "furniture", "tent", "table", "chair", "linen", "party supply"],
    serpTypes: ["party_equipment_rental", "furniture_rental"],
  },
  
  shows: {
    primarySlugs: ["tours-experiences", "events-celebrations"],
    keywords: ["show", "theater", "performance", "concert", "musical", "broadway", "ticket", "entertainment"],
    serpTypes: ["theater", "concert_hall", "performing_arts"],
  },
};

export const servicesCategoryMapping: Record<string, CategoryMapping> = {
  "services-travel": {
    primarySlugs: ["photography-videography", "transportation-logistics", "language-translation", "personal-assistance", "tours-experiences"],
    keywords: ["travel", "guide", "concierge", "insurance", "visa", "translation", "photography", "tour"],
  },
  "services-wedding": {
    primarySlugs: ["photography-videography", "beauty-styling", "transportation-logistics", "food-culinary", "events-celebrations", "specialty-services"],
    keywords: ["wedding", "planner", "coordinator", "officiant", "florist", "baker", "makeup", "hair", "bridal"],
  },
  "services-proposal": {
    primarySlugs: ["photography-videography", "events-celebrations", "specialty-services", "transportation-logistics"],
    keywords: ["proposal", "planner", "musician", "lighting", "signage", "photographer", "romantic"],
  },
  "services-birthday": {
    primarySlugs: ["events-celebrations", "food-culinary", "specialty-services"],
    keywords: ["birthday", "party", "performer", "balloon", "entertainer", "decorator", "baker", "cake"],
  },
  "services-trip": {
    primarySlugs: ["tours-experiences", "photography-videography", "transportation-logistics", "personal-assistance"],
    keywords: ["trip", "guide", "adventure", "activity", "concierge", "photographer", "tour"],
  },
  "services-romance": {
    primarySlugs: ["photography-videography", "food-culinary", "transportation-logistics", "events-celebrations"],
    keywords: ["romance", "romantic", "private-chef", "dining", "flowers", "musician", "photographer"],
  },
  "services-corporate": {
    primarySlugs: ["events-celebrations", "food-culinary", "transportation-logistics", "technology-connectivity", "specialty-services"],
    keywords: ["corporate", "speaker", "registration", "swag", "catering", "av", "conference", "meeting"],
  },
  "services-retreat": {
    primarySlugs: ["health-wellness", "food-culinary", "transportation-logistics", "tours-experiences"],
    keywords: ["retreat", "wellness", "yoga", "meditation", "spa", "facilitator", "instructor", "mindfulness"],
  },
  "services-event": {
    primarySlugs: ["photography-videography", "transportation-logistics", "events-celebrations", "food-culinary"],
    keywords: ["event", "coordinator", "rental", "catering", "entertainment", "planner", "photographer"],
  },
  "services-party": {
    primarySlugs: ["photography-videography", "events-celebrations", "food-culinary"],
    keywords: ["party", "dj", "performer", "entertainment", "catering", "decorator", "rental", "photographer"],
  },
};

export const venueSubTypes: Record<string, { label: string; serpType: string; keywords: string[] }> = {
  "venue-traditional": {
    label: "Traditional Venues",
    serpType: "event_venue",
    keywords: ["venue", "hall", "ballroom", "banquet", "reception"],
  },
  "venue-outdoor": {
    label: "Outdoor Venues",
    serpType: "park",
    keywords: ["park", "garden", "outdoor", "nature", "lawn"],
  },
  "venue-beach": {
    label: "Beach Venues",
    serpType: "beach",
    keywords: ["beach", "oceanfront", "seaside", "coastal", "waterfront"],
  },
  "venue-estate": {
    label: "Estates & Mansions",
    serpType: "estate",
    keywords: ["estate", "mansion", "villa", "castle", "historic"],
  },
  "venue-winery": {
    label: "Wineries & Vineyards",
    serpType: "winery",
    keywords: ["winery", "vineyard", "wine", "cellar", "barrel"],
  },
  "venue-museum": {
    label: "Museums & Galleries",
    serpType: "museum",
    keywords: ["museum", "gallery", "art", "exhibition", "cultural"],
  },
  "venue-rooftop": {
    label: "Rooftop Venues",
    serpType: "rooftop",
    keywords: ["rooftop", "skyline", "terrace", "penthouse", "sky"],
  },
  "venue-restaurant": {
    label: "Restaurant Venues",
    serpType: "restaurant",
    keywords: ["restaurant", "private dining", "chef's table", "banquet room"],
  },
  "venue-barn": {
    label: "Barns & Farms",
    serpType: "farm",
    keywords: ["barn", "farm", "rustic", "country", "ranch"],
  },
  "venue-hotel": {
    label: "Hotel Venues",
    serpType: "hotel",
    keywords: ["hotel", "resort", "ballroom", "conference", "meeting room"],
  },
};

export function getCategoryMapping(tabCategory: string): CategoryMapping | null {
  if (tabCategory.startsWith("services-")) {
    return servicesCategoryMapping[tabCategory] || null;
  }
  return tabCategoryMapping[tabCategory] || null;
}

export function matchesCategory(
  serviceType: string,
  serviceName: string,
  description: string,
  tabCategory: string
): boolean {
  const lowerType = serviceType.toLowerCase();
  const lowerName = serviceName.toLowerCase();
  const lowerDesc = description.toLowerCase();
  const lowerTab = tabCategory.toLowerCase();
  
  // Always check for literal tab category match first (direct match)
  if (lowerType.includes(lowerTab) || lowerName.includes(lowerTab)) {
    return true;
  }
  
  const mapping = getCategoryMapping(tabCategory);
  
  // If no mapping exists, fallback to literal matching only (already checked above)
  if (!mapping) {
    return false;
  }
  
  // Check primary slugs (canonical category slugs)
  const matchesPrimarySlug = mapping.primarySlugs.some(slug => 
    lowerType.includes(slug) || lowerType === slug
  );
  
  if (matchesPrimarySlug) return true;
  
  // Check keywords in type, name, and description
  const matchesKeyword = mapping.keywords.some(keyword =>
    lowerType.includes(keyword) || 
    lowerName.includes(keyword) || 
    lowerDesc.includes(keyword)
  );
  
  return matchesKeyword;
}

export const allCanonicalSlugs = [
  "photography-videography",
  "transportation-logistics",
  "food-culinary",
  "childcare-family",
  "tours-experiences",
  "personal-assistance",
  "taskrabbit-services",
  "health-wellness",
  "beauty-styling",
  "pets-animals",
  "events-celebrations",
  "technology-connectivity",
  "language-translation",
  "specialty-services",
  "custom-other",
] as const;

export type CanonicalSlug = typeof allCanonicalSlugs[number];

export interface ProviderSource {
  type: "internal" | "serp" | "partner";
  apiEndpoint?: string;
}

export const defaultProviderSource: ProviderSource = { type: "internal" };
