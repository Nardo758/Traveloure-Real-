import { db } from "../db";
import { 
  experienceTypes, 
  experienceTemplateTabs, 
  experienceTemplateFilters, 
  experienceTemplateFilterOptions,
  experienceUniversalFilters,
  experienceUniversalFilterOptions
} from "@shared/schema";
import { eq } from "drizzle-orm";

interface FilterOption {
  label: string;
  value: string;
  description?: string;
  icon?: string;
  minValue?: number;
  maxValue?: number;
}

interface FilterDef {
  name: string;
  slug: string;
  description?: string;
  filterType: string;
  icon?: string;
  options: FilterOption[];
}

interface TabDef {
  name: string;
  slug: string;
  description: string;
  icon: string;
  filters: FilterDef[];
}

interface UniversalFilterDef {
  name: string;
  slug: string;
  description?: string;
  filterType: string;
  icon?: string;
  options: FilterOption[];
}

async function getOrCreateExperienceType(slug: string, name: string): Promise<string> {
  const existing = await db.select().from(experienceTypes).where(eq(experienceTypes.slug, slug)).limit(1);
  if (existing.length > 0) return existing[0].id;
  
  const [created] = await db.insert(experienceTypes).values({
    name,
    slug,
    description: `${name} planning experience`,
    isActive: true,
    sortOrder: 0,
  }).returning();
  return created.id;
}

async function seedTabWithFilters(experienceTypeId: string, tab: TabDef, sortOrder: number) {
  const existingTab = await db.select().from(experienceTemplateTabs)
    .where(eq(experienceTemplateTabs.experienceTypeId, experienceTypeId))
    .then(tabs => tabs.find(t => t.slug === tab.slug));
  
  if (existingTab) {
    console.log(`  Tab exists: ${tab.name}`);
    return;
  }

  const [createdTab] = await db.insert(experienceTemplateTabs).values({
    experienceTypeId,
    name: tab.name,
    slug: tab.slug,
    description: tab.description,
    icon: tab.icon,
    sortOrder,
    isActive: true,
  }).returning();

  console.log(`  Created tab: ${tab.name}`);

  for (let filterIdx = 0; filterIdx < tab.filters.length; filterIdx++) {
    const filter = tab.filters[filterIdx];
    const [createdFilter] = await db.insert(experienceTemplateFilters).values({
      tabId: createdTab.id,
      name: filter.name,
      slug: filter.slug,
      description: filter.description,
      filterType: filter.filterType,
      icon: filter.icon,
      sortOrder: filterIdx,
      isActive: true,
    }).returning();

    for (let optIdx = 0; optIdx < filter.options.length; optIdx++) {
      const opt = filter.options[optIdx];
      await db.insert(experienceTemplateFilterOptions).values({
        filterId: createdFilter.id,
        label: opt.label,
        value: opt.value,
        description: opt.description,
        icon: opt.icon,
        minValue: opt.minValue?.toString(),
        maxValue: opt.maxValue?.toString(),
        sortOrder: optIdx,
        isActive: true,
      });
    }
  }
}

async function seedUniversalFilters(experienceTypeId: string, filters: UniversalFilterDef[]) {
  for (let filterIdx = 0; filterIdx < filters.length; filterIdx++) {
    const filter = filters[filterIdx];
    const existing = await db.select().from(experienceUniversalFilters)
      .where(eq(experienceUniversalFilters.experienceTypeId, experienceTypeId))
      .then(f => f.find(uf => uf.slug === filter.slug));
    
    if (existing) continue;

    const [createdFilter] = await db.insert(experienceUniversalFilters).values({
      experienceTypeId,
      name: filter.name,
      slug: filter.slug,
      description: filter.description,
      filterType: filter.filterType,
      icon: filter.icon,
      sortOrder: filterIdx,
      isActive: true,
    }).returning();

    for (let optIdx = 0; optIdx < filter.options.length; optIdx++) {
      const opt = filter.options[optIdx];
      await db.insert(experienceUniversalFilterOptions).values({
        filterId: createdFilter.id,
        label: opt.label,
        value: opt.value,
        description: opt.description,
        icon: opt.icon,
        minValue: opt.minValue?.toString(),
        maxValue: opt.maxValue?.toString(),
        sortOrder: optIdx,
        isActive: true,
      });
    }
  }
}

// ============ BACHELOR/BACHELORETTE PARTY TEMPLATE ============
const bachelorTabs: TabDef[] = [
  {
    name: "Destinations",
    slug: "destinations",
    description: "Travel feasibility assessment & airport logistics",
    icon: "MapPin",
    filters: [
      {
        name: "Distance from Origin",
        slug: "distance",
        filterType: "single_select",
        icon: "Plane",
        options: [
          { label: "Drivable", value: "drivable" },
          { label: "Short Flight (0-3 hrs)", value: "short_flight" },
          { label: "Long Flight (3-6 hrs)", value: "long_flight" },
          { label: "International", value: "international" },
        ]
      },
      {
        name: "Vibe",
        slug: "vibe",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Beach Party", value: "beach_party" },
          { label: "City Nightlife", value: "city_nightlife" },
          { label: "Adventure/Outdoors", value: "adventure" },
          { label: "Chill/Wellness", value: "wellness" },
          { label: "Vegas-Style", value: "vegas" },
          { label: "International Culture", value: "international_culture" },
        ]
      },
      {
        name: "Group Size Friendly",
        slug: "group_size",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "4-8 people", value: "4-8" },
          { label: "8-12 people", value: "8-12" },
          { label: "12-20 people", value: "12-20" },
          { label: "20+ people", value: "20+" },
        ]
      },
      {
        name: "Budget Tier",
        slug: "budget_tier",
        filterType: "single_select",
        icon: "DollarSign",
        options: [
          { label: "Budget ($500-1000 pp)", value: "budget", minValue: 500, maxValue: 1000 },
          { label: "Mid ($1000-2000 pp)", value: "mid", minValue: 1000, maxValue: 2000 },
          { label: "Luxury ($2000-5000 pp)", value: "luxury", minValue: 2000, maxValue: 5000 },
          { label: "Ultra ($5000+ pp)", value: "ultra", minValue: 5000 },
        ]
      },
      {
        name: "Season/Weather",
        slug: "season",
        filterType: "multi_select",
        icon: "Sun",
        options: [
          { label: "Year-Round", value: "year_round" },
          { label: "Summer Peak", value: "summer" },
          { label: "Winter Escape", value: "winter" },
          { label: "Spring/Fall Sweet Spot", value: "spring_fall" },
        ]
      },
    ]
  },
  {
    name: "Accommodations",
    slug: "accommodations",
    description: "Sleeping arrangements, group gathering space, proximity to activities",
    icon: "Home",
    filters: [
      {
        name: "Property Type",
        slug: "property_type",
        filterType: "multi_select",
        icon: "Building",
        options: [
          { label: "Private House/Villa", value: "house_villa" },
          { label: "Hotel Block", value: "hotel_block" },
          { label: "Resort", value: "resort" },
          { label: "Boutique Hotel", value: "boutique" },
          { label: "Unique Stays", value: "unique" },
          { label: "Yacht/Boat", value: "yacht" },
        ]
      },
      {
        name: "Sleeps",
        slug: "sleeps",
        filterType: "single_select",
        icon: "Bed",
        options: [
          { label: "4-8 guests", value: "4-8" },
          { label: "8-12 guests", value: "8-12" },
          { label: "12-16 guests", value: "12-16" },
          { label: "16-20 guests", value: "16-20" },
          { label: "20+ guests", value: "20+" },
        ]
      },
      {
        name: "Bedrooms",
        slug: "bedrooms",
        filterType: "single_select",
        icon: "DoorClosed",
        options: [
          { label: "Single Room Bookings", value: "single" },
          { label: "3-5 BR", value: "3-5" },
          { label: "6-8 BR", value: "6-8" },
          { label: "9-12 BR", value: "9-12" },
          { label: "13+ BR", value: "13+" },
        ]
      },
      {
        name: "Amenities",
        slug: "amenities",
        filterType: "multi_select",
        icon: "Star",
        options: [
          { label: "Pool", value: "pool" },
          { label: "Hot Tub", value: "hot_tub" },
          { label: "Game Room", value: "game_room" },
          { label: "Full Kitchen", value: "kitchen" },
          { label: "BBQ/Outdoor Space", value: "bbq_outdoor" },
          { label: "Party-Friendly", value: "party_friendly" },
          { label: "Quiet Hours Policy", value: "quiet_hours" },
        ]
      },
      {
        name: "Location",
        slug: "location",
        filterType: "multi_select",
        icon: "MapPin",
        options: [
          { label: "Walkable to Nightlife", value: "walkable_nightlife" },
          { label: "Beach/Waterfront", value: "beach" },
          { label: "Mountains/Nature", value: "mountains" },
          { label: "Downtown", value: "downtown" },
          { label: "Resort Area", value: "resort_area" },
          { label: "Secluded", value: "secluded" },
        ]
      },
      {
        name: "Price per Person/Night",
        slug: "price_ppn",
        filterType: "single_select",
        icon: "DollarSign",
        options: [
          { label: "$50-100", value: "50-100", minValue: 50, maxValue: 100 },
          { label: "$100-200", value: "100-200", minValue: 100, maxValue: 200 },
          { label: "$200-400", value: "200-400", minValue: 200, maxValue: 400 },
          { label: "$400+", value: "400+", minValue: 400 },
        ]
      },
      {
        name: "Check-in Flexibility",
        slug: "checkin_flex",
        filterType: "multi_select",
        icon: "Clock",
        options: [
          { label: "Early Check-in Available", value: "early_checkin" },
          { label: "Late Check-out", value: "late_checkout" },
          { label: "24hr Access", value: "24hr_access" },
        ]
      },
    ]
  },
  {
    name: "Daytime Activities",
    slug: "daytime-activities",
    description: "Energy expenditure planning, transportation needs, timing coordination",
    icon: "Sun",
    filters: [
      {
        name: "Activity Type",
        slug: "activity_type",
        filterType: "multi_select",
        icon: "Activity",
        options: [
          { label: "Water Sports", value: "water_sports" },
          { label: "Adventure Sports", value: "adventure_sports" },
          { label: "Golf/Sports", value: "golf_sports" },
          { label: "Spa/Wellness", value: "spa_wellness" },
          { label: "Cultural Tours", value: "cultural" },
          { label: "Brewery/Winery", value: "brewery_winery" },
          { label: "Cooking Classes", value: "cooking" },
          { label: "Beach Club", value: "beach_club" },
          { label: "Boat Rental", value: "boat_rental" },
          { label: "ATV/Off-Road", value: "atv" },
        ]
      },
      {
        name: "Energy Level",
        slug: "energy_level",
        filterType: "single_select",
        icon: "Zap",
        options: [
          { label: "Chill/Recovery", value: "chill" },
          { label: "Moderate", value: "moderate" },
          { label: "High Energy", value: "high" },
          { label: "Extreme", value: "extreme" },
        ]
      },
      {
        name: "Duration",
        slug: "duration",
        filterType: "single_select",
        icon: "Clock",
        options: [
          { label: "1-2 hours", value: "1-2hrs" },
          { label: "Half Day", value: "half_day" },
          { label: "Full Day", value: "full_day" },
          { label: "Multi-Day", value: "multi_day" },
        ]
      },
      {
        name: "Group Size Capacity",
        slug: "group_capacity",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "Small Groups (4-8)", value: "4-8" },
          { label: "Medium (8-15)", value: "8-15" },
          { label: "Large (15-30)", value: "15-30" },
          { label: "XL (30+)", value: "30+" },
        ]
      },
      {
        name: "Physical Fitness Required",
        slug: "fitness",
        filterType: "single_select",
        icon: "Heart",
        options: [
          { label: "Any Level", value: "any" },
          { label: "Moderate", value: "moderate" },
          { label: "High", value: "high" },
          { label: "Very High", value: "very_high" },
        ]
      },
      {
        name: "Alcohol Friendly",
        slug: "alcohol",
        filterType: "single_select",
        icon: "Wine",
        options: [
          { label: "Yes", value: "yes" },
          { label: "No", value: "no" },
          { label: "BYOB", value: "byob" },
        ]
      },
      {
        name: "Weather Dependent",
        slug: "weather",
        filterType: "single_select",
        icon: "Cloud",
        options: [
          { label: "Indoor", value: "indoor" },
          { label: "Outdoor", value: "outdoor" },
          { label: "Flexible", value: "flexible" },
        ]
      },
      {
        name: "Transportation Included",
        slug: "transport_included",
        filterType: "single_select",
        icon: "Car",
        options: [
          { label: "Yes", value: "yes" },
          { label: "No", value: "no" },
          { label: "Optional", value: "optional" },
        ]
      },
      {
        name: "Private Group Option",
        slug: "private_group",
        filterType: "single_select",
        icon: "Lock",
        options: [
          { label: "Private Only", value: "private_only" },
          { label: "Can Book Private", value: "can_book_private" },
          { label: "Shared Tours", value: "shared" },
        ]
      },
    ]
  },
  {
    name: "Nightlife & Entertainment",
    slug: "nightlife",
    description: "Reservation management, transportation safety, entry coordination",
    icon: "Moon",
    filters: [
      {
        name: "Venue Type",
        slug: "venue_type",
        filterType: "multi_select",
        icon: "Music",
        options: [
          { label: "Nightclub", value: "nightclub" },
          { label: "Bar/Lounge", value: "bar_lounge" },
          { label: "Strip Club", value: "strip_club" },
          { label: "Comedy Club", value: "comedy" },
          { label: "Drag Show", value: "drag_show" },
          { label: "Live Music", value: "live_music" },
          { label: "Private Party Venue", value: "private_venue" },
          { label: "Rooftop", value: "rooftop" },
          { label: "Beach Club", value: "beach_club" },
        ]
      },
      {
        name: "Vibe",
        slug: "vibe",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "High Energy/Dancing", value: "high_energy" },
          { label: "Chill/Cocktails", value: "chill" },
          { label: "Upscale/VIP", value: "upscale" },
          { label: "Dive Bar/Casual", value: "dive" },
          { label: "Unique Experience", value: "unique" },
        ]
      },
      {
        name: "Dress Code",
        slug: "dress_code",
        filterType: "single_select",
        icon: "Shirt",
        options: [
          { label: "Casual", value: "casual" },
          { label: "Smart Casual", value: "smart_casual" },
          { label: "Upscale", value: "upscale" },
          { label: "Formal", value: "formal" },
        ]
      },
      {
        name: "Reservation Required",
        slug: "reservation",
        filterType: "single_select",
        icon: "CalendarCheck",
        options: [
          { label: "Walk-in Friendly", value: "walkin" },
          { label: "Reservation Recommended", value: "recommended" },
          { label: "Reservation Required", value: "required" },
          { label: "VIP Table Booking", value: "vip_table" },
        ]
      },
      {
        name: "Cost Structure",
        slug: "cost_structure",
        filterType: "multi_select",
        icon: "DollarSign",
        options: [
          { label: "No Cover", value: "no_cover" },
          { label: "Cover Charge", value: "cover" },
          { label: "Minimum Spend", value: "min_spend" },
          { label: "Bottle Service", value: "bottle" },
        ]
      },
      {
        name: "Group Accommodation",
        slug: "group_accom",
        filterType: "multi_select",
        icon: "Users",
        options: [
          { label: "Small Group Friendly", value: "small" },
          { label: "Large Group Packages", value: "large_packages" },
          { label: "Private Section Available", value: "private_section" },
        ]
      },
      {
        name: "Time",
        slug: "time",
        filterType: "multi_select",
        icon: "Clock",
        options: [
          { label: "Happy Hour", value: "happy_hour" },
          { label: "Dinner Hours", value: "dinner" },
          { label: "Late Night (10pm-2am)", value: "late_night" },
          { label: "After Hours (2am+)", value: "after_hours" },
        ]
      },
    ]
  },
  {
    name: "Dining",
    slug: "dining",
    description: "Meal timing, large group seating, dietary accommodations, budget management",
    icon: "UtensilsCrossed",
    filters: [
      {
        name: "Meal Type",
        slug: "meal_type",
        filterType: "multi_select",
        icon: "Clock",
        options: [
          { label: "Brunch", value: "brunch" },
          { label: "Lunch", value: "lunch" },
          { label: "Dinner", value: "dinner" },
          { label: "Late Night Eats", value: "late_night" },
          { label: "Food Tour", value: "food_tour" },
        ]
      },
      {
        name: "Cuisine Type",
        slug: "cuisine",
        filterType: "multi_select",
        icon: "ChefHat",
        options: [
          { label: "American", value: "american" },
          { label: "Italian", value: "italian" },
          { label: "Mexican", value: "mexican" },
          { label: "Asian", value: "asian" },
          { label: "Seafood", value: "seafood" },
          { label: "Steakhouse", value: "steakhouse" },
          { label: "BBQ", value: "bbq" },
          { label: "International Fusion", value: "fusion" },
        ]
      },
      {
        name: "Group Size Capacity",
        slug: "group_capacity",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "Small (4-8)", value: "4-8" },
          { label: "Medium (8-12)", value: "8-12" },
          { label: "Large (12-20)", value: "12-20" },
          { label: "XL (20+)", value: "20+" },
          { label: "Private Room Available", value: "private_room" },
        ]
      },
      {
        name: "Atmosphere",
        slug: "atmosphere",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Casual", value: "casual" },
          { label: "Lively/Fun", value: "lively" },
          { label: "Upscale", value: "upscale" },
          { label: "Party Atmosphere", value: "party" },
          { label: "Instagram-Worthy", value: "instagram" },
        ]
      },
      {
        name: "Price per Person",
        slug: "price_pp",
        filterType: "single_select",
        icon: "DollarSign",
        options: [
          { label: "$15-30", value: "15-30", minValue: 15, maxValue: 30 },
          { label: "$30-60", value: "30-60", minValue: 30, maxValue: 60 },
          { label: "$60-100", value: "60-100", minValue: 60, maxValue: 100 },
          { label: "$100+", value: "100+", minValue: 100 },
        ]
      },
      {
        name: "Reservation Requirements",
        slug: "reservation",
        filterType: "single_select",
        icon: "CalendarCheck",
        options: [
          { label: "Walk-in OK", value: "walkin" },
          { label: "Reservation Recommended", value: "recommended" },
          { label: "Reservation Required", value: "required" },
          { label: "Private Dining Available", value: "private" },
        ]
      },
      {
        name: "Dietary Options",
        slug: "dietary",
        filterType: "multi_select",
        icon: "Leaf",
        options: [
          { label: "Vegan/Vegetarian Options", value: "vegan_veg" },
          { label: "Gluten-Free", value: "gluten_free" },
          { label: "Allergy-Friendly", value: "allergy" },
          { label: "Full Menu Flexibility", value: "flexible" },
        ]
      },
      {
        name: "Special Features",
        slug: "special_features",
        filterType: "multi_select",
        icon: "Star",
        options: [
          { label: "Bottomless Brunch", value: "bottomless" },
          { label: "Prix Fixe Group Menu", value: "prix_fixe" },
          { label: "BYOB", value: "byob" },
          { label: "Entertainment/Music", value: "entertainment" },
          { label: "Outdoor Seating", value: "outdoor" },
        ]
      },
    ]
  },
  {
    name: "Transportation",
    slug: "transportation",
    description: "Group movement coordination, safety management, timing optimization",
    icon: "Car",
    filters: [
      {
        name: "Vehicle Type",
        slug: "vehicle_type",
        filterType: "multi_select",
        icon: "Bus",
        options: [
          { label: "Party Bus", value: "party_bus" },
          { label: "Limo", value: "limo" },
          { label: "Sprinter Van", value: "sprinter" },
          { label: "SUV Fleet", value: "suv_fleet" },
          { label: "Trolley/Themed Vehicle", value: "trolley" },
          { label: "Boat Transfer", value: "boat" },
          { label: "Bike Rentals", value: "bikes" },
        ]
      },
      {
        name: "Capacity",
        slug: "capacity",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "4-8 passengers", value: "4-8" },
          { label: "8-15 passengers", value: "8-15" },
          { label: "15-25 passengers", value: "15-25" },
          { label: "25-40 passengers", value: "25-40" },
          { label: "40+ passengers", value: "40+" },
        ]
      },
      {
        name: "Service Type",
        slug: "service_type",
        filterType: "multi_select",
        icon: "Route",
        options: [
          { label: "Point-to-Point", value: "point_to_point" },
          { label: "Hourly Charter", value: "hourly" },
          { label: "Full Day", value: "full_day" },
          { label: "Airport Transfer", value: "airport" },
          { label: "Multi-Day Package", value: "multi_day" },
        ]
      },
      {
        name: "Amenities",
        slug: "amenities",
        filterType: "multi_select",
        icon: "Star",
        options: [
          { label: "Sound System", value: "sound" },
          { label: "Bar", value: "bar" },
          { label: "Mood Lighting", value: "lighting" },
          { label: "Bathroom", value: "bathroom" },
          { label: "Wi-Fi", value: "wifi" },
          { label: "Coolers Allowed", value: "coolers" },
        ]
      },
      {
        name: "Price Structure",
        slug: "price_structure",
        filterType: "single_select",
        icon: "DollarSign",
        options: [
          { label: "Flat Rate", value: "flat" },
          { label: "Hourly", value: "hourly" },
          { label: "Per Person", value: "per_person" },
          { label: "Full Weekend Package", value: "weekend" },
        ]
      },
      {
        name: "Availability",
        slug: "availability",
        filterType: "multi_select",
        icon: "Calendar",
        options: [
          { label: "Advance Booking Required", value: "advance" },
          { label: "Last-Minute Availability", value: "last_minute" },
          { label: "24/7 Service", value: "247" },
        ]
      },
    ]
  },
  {
    name: "Party Services & Add-ons",
    slug: "party-services",
    description: "Enhancement coordination, vendor management, surprise element timing",
    icon: "PartyPopper",
    filters: [
      {
        name: "Service Type",
        slug: "service_type",
        filterType: "multi_select",
        icon: "Wand2",
        options: [
          { label: "Photography/Video", value: "photo_video" },
          { label: "DJ/Music", value: "dj_music" },
          { label: "Decorations/Setup", value: "decorations" },
          { label: "Custom Apparel", value: "apparel" },
          { label: "Party Favors", value: "favors" },
          { label: "Games/Entertainment", value: "games" },
          { label: "Private Chef", value: "private_chef" },
          { label: "Bartender Service", value: "bartender" },
          { label: "Surprise Coordination", value: "surprise" },
        ]
      },
      {
        name: "Timing",
        slug: "timing",
        filterType: "multi_select",
        icon: "Clock",
        options: [
          { label: "Pre-Party Setup", value: "pre_party" },
          { label: "During Event", value: "during" },
          { label: "Full Weekend", value: "weekend" },
          { label: "Surprise Element", value: "surprise" },
        ]
      },
      {
        name: "Customization Level",
        slug: "customization",
        filterType: "single_select",
        icon: "Palette",
        options: [
          { label: "Pre-Packaged", value: "packaged" },
          { label: "Semi-Custom", value: "semi_custom" },
          { label: "Fully Custom", value: "fully_custom" },
        ]
      },
      {
        name: "Price Range",
        slug: "price_range",
        filterType: "single_select",
        icon: "DollarSign",
        options: [
          { label: "$100-300", value: "100-300", minValue: 100, maxValue: 300 },
          { label: "$300-600", value: "300-600", minValue: 300, maxValue: 600 },
          { label: "$600-1200", value: "600-1200", minValue: 600, maxValue: 1200 },
          { label: "$1200+", value: "1200+", minValue: 1200 },
        ]
      },
    ]
  },
];

// Universal filters for Bachelor/Bachelorette
const bachelorUniversalFilters: UniversalFilterDef[] = [
  {
    name: "Date Range",
    slug: "date_range",
    filterType: "single_select",
    icon: "Calendar",
    options: [
      { label: "Weekend Getaway (2-3 days)", value: "weekend" },
      { label: "Long Weekend (3-4 days)", value: "long_weekend" },
      { label: "Full Week", value: "full_week" },
    ]
  },
  {
    name: "Booking Status",
    slug: "booking_status",
    filterType: "multi_select",
    icon: "CheckCircle",
    options: [
      { label: "Available Now", value: "available" },
      { label: "Request to Book", value: "request" },
      { label: "Fully Booked (Waitlist)", value: "waitlist" },
    ]
  },
  {
    name: "Cancellation Policy",
    slug: "cancellation",
    filterType: "single_select",
    icon: "XCircle",
    options: [
      { label: "Flexible (Full Refund)", value: "flexible" },
      { label: "Moderate (50% Refund)", value: "moderate" },
      { label: "Strict (No Refund)", value: "strict" },
    ]
  },
  {
    name: "Expert Verified",
    slug: "expert_verified",
    filterType: "toggle",
    icon: "BadgeCheck",
    options: [
      { label: "Expert Verified", value: "true" },
    ]
  },
  {
    name: "Payment Options",
    slug: "payment_options",
    filterType: "multi_select",
    icon: "CreditCard",
    options: [
      { label: "Pay Now", value: "pay_now" },
      { label: "Pay Later", value: "pay_later" },
      { label: "Deposit + Balance", value: "deposit" },
      { label: "Split Payment Available", value: "split" },
    ]
  },
];

// ============ ANNIVERSARY TRIP TEMPLATE ============
const anniversaryTabs: TabDef[] = [
  {
    name: "Destinations",
    slug: "destinations",
    description: "Romance potential assessment, accessibility for couples, seasonal optimization",
    icon: "Heart",
    filters: [
      {
        name: "Romance Level",
        slug: "romance_level",
        filterType: "single_select",
        icon: "Heart",
        options: [
          { label: "Ultra Romantic", value: "ultra_romantic" },
          { label: "Very Romantic", value: "very_romantic" },
          { label: "Romantic with Adventure", value: "romantic_adventure" },
          { label: "Culturally Rich", value: "culturally_rich" },
        ]
      },
      {
        name: "Distance",
        slug: "distance",
        filterType: "single_select",
        icon: "Plane",
        options: [
          { label: "Weekend Escape (<3hrs)", value: "weekend" },
          { label: "Short Flight (3-5hrs)", value: "short_flight" },
          { label: "International Adventure (6-12hrs)", value: "international" },
          { label: "Bucket List (12+ hrs)", value: "bucket_list" },
        ]
      },
      {
        name: "Destination Type",
        slug: "destination_type",
        filterType: "multi_select",
        icon: "MapPin",
        options: [
          { label: "Beach Paradise", value: "beach" },
          { label: "Mountain Retreat", value: "mountain" },
          { label: "European City", value: "european" },
          { label: "Wine Country", value: "wine" },
          { label: "Island Escape", value: "island" },
          { label: "Desert Luxury", value: "desert" },
          { label: "Cultural Immersion", value: "cultural" },
        ]
      },
      {
        name: "Season Optimization",
        slug: "season",
        filterType: "multi_select",
        icon: "Sun",
        options: [
          { label: "Year-Round", value: "year_round" },
          { label: "Spring Blooms", value: "spring" },
          { label: "Summer Sun", value: "summer" },
          { label: "Fall Colors", value: "fall" },
          { label: "Winter Cozy", value: "winter" },
          { label: "Off-Season Deals", value: "off_season" },
        ]
      },
      {
        name: "Activity Balance",
        slug: "activity_balance",
        filterType: "single_select",
        icon: "Scale",
        options: [
          { label: "Pure Relaxation", value: "relaxation" },
          { label: "Balanced", value: "balanced" },
          { label: "Adventure-Forward", value: "adventure" },
        ]
      },
      {
        name: "Crowd Level",
        slug: "crowd_level",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "Secluded/Private", value: "secluded" },
          { label: "Intimate", value: "intimate" },
          { label: "Popular but Spacious", value: "popular" },
          { label: "Tourist-Heavy", value: "tourist" },
        ]
      },
      {
        name: "Anniversary Milestone",
        slug: "milestone",
        filterType: "single_select",
        icon: "Award",
        options: [
          { label: "1st - Paper", value: "1st_paper" },
          { label: "5th - Wood", value: "5th_wood" },
          { label: "10th - Tin", value: "10th_tin" },
          { label: "25th - Silver", value: "25th_silver" },
          { label: "50th - Gold", value: "50th_gold" },
        ]
      },
    ]
  },
  {
    name: "Romantic Accommodations",
    slug: "accommodations",
    description: "Intimacy creation, special amenities, couple-centric design",
    icon: "Bed",
    filters: [
      {
        name: "Property Type",
        slug: "property_type",
        filterType: "multi_select",
        icon: "Building",
        options: [
          { label: "Boutique Hotel", value: "boutique" },
          { label: "Luxury Resort", value: "luxury_resort" },
          { label: "Private Villa", value: "private_villa" },
          { label: "Overwater Bungalow", value: "overwater" },
          { label: "Treehouse", value: "treehouse" },
          { label: "Castle/Historic", value: "castle" },
          { label: "Adults-Only Resort", value: "adults_only" },
          { label: "Glamping", value: "glamping" },
        ]
      },
      {
        name: "Romantic Features",
        slug: "romantic_features",
        filterType: "multi_select",
        icon: "Heart",
        options: [
          { label: "Private Pool", value: "private_pool" },
          { label: "Outdoor Shower", value: "outdoor_shower" },
          { label: "Soaking Tub", value: "soaking_tub" },
          { label: "Fireplace", value: "fireplace" },
          { label: "Balcony/Terrace", value: "balcony" },
          { label: "Ocean/Mountain View", value: "view" },
          { label: "Four Poster Bed", value: "four_poster" },
          { label: "In-Room Dining", value: "in_room_dining" },
        ]
      },
      {
        name: "Privacy Level",
        slug: "privacy",
        filterType: "single_select",
        icon: "Lock",
        options: [
          { label: "Completely Secluded", value: "secluded" },
          { label: "Private but Resort", value: "private_resort" },
          { label: "Intimate Hotel (<20 rooms)", value: "intimate" },
          { label: "Boutique Property", value: "boutique" },
        ]
      },
      {
        name: "Special Services",
        slug: "special_services",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Couples Massage In-Room", value: "massage" },
          { label: "Private Butler", value: "butler" },
          { label: "Champagne Service", value: "champagne" },
          { label: "Rose Petal Turndown", value: "rose_petals" },
          { label: "Bath Drawn on Request", value: "bath" },
        ]
      },
      {
        name: "Price per Night",
        slug: "price_night",
        filterType: "single_select",
        icon: "DollarSign",
        options: [
          { label: "$200-400", value: "200-400", minValue: 200, maxValue: 400 },
          { label: "$400-700", value: "400-700", minValue: 400, maxValue: 700 },
          { label: "$700-1200", value: "700-1200", minValue: 700, maxValue: 1200 },
          { label: "$1200+", value: "1200+", minValue: 1200 },
        ]
      },
      {
        name: "Surprise Package Available",
        slug: "surprise_package",
        filterType: "multi_select",
        icon: "Gift",
        options: [
          { label: "Anniversary Packages", value: "anniversary" },
          { label: "Romance Add-ons", value: "romance" },
          { label: "Proposal Coordination", value: "proposal" },
        ]
      },
    ]
  },
  {
    name: "Couple Experiences",
    slug: "experiences",
    description: "Shared memory creation, bonding activity coordination, energy flow management",
    icon: "Users",
    filters: [
      {
        name: "Experience Type",
        slug: "experience_type",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Couples Spa", value: "couples_spa" },
          { label: "Private Cooking Class", value: "cooking" },
          { label: "Sunset Cruise", value: "sunset_cruise" },
          { label: "Hot Air Balloon", value: "balloon" },
          { label: "Wine Tasting", value: "wine" },
          { label: "Private Beach Day", value: "beach" },
          { label: "Couples Photography", value: "photography" },
          { label: "Dance Lesson", value: "dance" },
          { label: "Adventure Activity", value: "adventure" },
          { label: "Cultural Tour", value: "cultural" },
        ]
      },
      {
        name: "Intimacy Level",
        slug: "intimacy",
        filterType: "single_select",
        icon: "Heart",
        options: [
          { label: "Just the Two of Us - Private", value: "private" },
          { label: "Small Group OK (<8 people)", value: "small_group" },
          { label: "Shared Experience", value: "shared" },
        ]
      },
      {
        name: "Activity Level",
        slug: "activity_level",
        filterType: "single_select",
        icon: "Activity",
        options: [
          { label: "Relaxing", value: "relaxing" },
          { label: "Leisurely", value: "leisurely" },
          { label: "Moderate", value: "moderate" },
          { label: "Active", value: "active" },
          { label: "Adventurous", value: "adventurous" },
        ]
      },
      {
        name: "Duration",
        slug: "duration",
        filterType: "single_select",
        icon: "Clock",
        options: [
          { label: "1-2 hours", value: "1-2hrs" },
          { label: "Half Day", value: "half_day" },
          { label: "Full Day", value: "full_day" },
          { label: "Multi-Day", value: "multi_day" },
        ]
      },
      {
        name: "Time of Day",
        slug: "time_of_day",
        filterType: "multi_select",
        icon: "Sun",
        options: [
          { label: "Sunrise Special", value: "sunrise" },
          { label: "Morning", value: "morning" },
          { label: "Afternoon", value: "afternoon" },
          { label: "Sunset Prime", value: "sunset" },
          { label: "Evening", value: "evening" },
          { label: "Flexible", value: "flexible" },
        ]
      },
      {
        name: "Romance Factor",
        slug: "romance_factor",
        filterType: "single_select",
        icon: "Heart",
        options: [
          { label: "Maximum Romance", value: "maximum" },
          { label: "Very Romantic", value: "very_romantic" },
          { label: "Fun/Romantic Balance", value: "balanced" },
          { label: "Adventure with Romance", value: "adventure" },
        ]
      },
      {
        name: "Photo Opportunity",
        slug: "photo",
        filterType: "multi_select",
        icon: "Camera",
        options: [
          { label: "Professional Photos Included", value: "professional" },
          { label: "Instagram-Worthy", value: "instagram" },
          { label: "Natural/Candid Setting", value: "candid" },
        ]
      },
    ]
  },
  {
    name: "Romantic Dining",
    slug: "dining",
    description: "Culinary experience timing, ambiance optimization, special occasion coordination",
    icon: "UtensilsCrossed",
    filters: [
      {
        name: "Dining Type",
        slug: "dining_type",
        filterType: "multi_select",
        icon: "UtensilsCrossed",
        options: [
          { label: "Fine Dining", value: "fine_dining" },
          { label: "Casual Romantic", value: "casual_romantic" },
          { label: "Beachfront", value: "beachfront" },
          { label: "Rooftop", value: "rooftop" },
          { label: "Private Chef", value: "private_chef" },
          { label: "Wine Pairing Dinner", value: "wine_pairing" },
          { label: "Picnic/Unique Setting", value: "picnic" },
          { label: "Michelin-Starred", value: "michelin" },
        ]
      },
      {
        name: "Ambiance",
        slug: "ambiance",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Candlelit Elegance", value: "candlelit" },
          { label: "Scenic Views", value: "scenic" },
          { label: "Intimate/Cozy", value: "intimate" },
          { label: "Seaside Casual", value: "seaside" },
          { label: "Hidden Gem", value: "hidden_gem" },
        ]
      },
      {
        name: "Seating Preference",
        slug: "seating",
        filterType: "multi_select",
        icon: "Armchair",
        options: [
          { label: "Private Table", value: "private" },
          { label: "Secluded Corner", value: "secluded" },
          { label: "Beachfront", value: "beachfront" },
          { label: "Rooftop", value: "rooftop" },
          { label: "Garden/Outdoor", value: "garden" },
          { label: "Chef's Table", value: "chefs_table" },
        ]
      },
      {
        name: "Meal Type",
        slug: "meal_type",
        filterType: "multi_select",
        icon: "Clock",
        options: [
          { label: "Breakfast in Bed", value: "breakfast_bed" },
          { label: "Romantic Brunch", value: "brunch" },
          { label: "Lunch", value: "lunch" },
          { label: "Sunset Dinner", value: "sunset" },
          { label: "Late Night", value: "late_night" },
        ]
      },
      {
        name: "Cuisine Style",
        slug: "cuisine",
        filterType: "multi_select",
        icon: "ChefHat",
        options: [
          { label: "French", value: "french" },
          { label: "Italian", value: "italian" },
          { label: "Local Specialty", value: "local" },
          { label: "Fusion", value: "fusion" },
          { label: "Tasting Menu", value: "tasting" },
          { label: "Farm-to-Table", value: "farm_to_table" },
        ]
      },
      {
        name: "Price per Person",
        slug: "price_pp",
        filterType: "single_select",
        icon: "DollarSign",
        options: [
          { label: "$50-100", value: "50-100", minValue: 50, maxValue: 100 },
          { label: "$100-200", value: "100-200", minValue: 100, maxValue: 200 },
          { label: "$200-400", value: "200-400", minValue: 200, maxValue: 400 },
          { label: "$400+", value: "400+", minValue: 400 },
        ]
      },
      {
        name: "Special Services",
        slug: "special_services",
        filterType: "multi_select",
        icon: "Heart",
        options: [
          { label: "Anniversary Dessert", value: "anniversary_dessert" },
          { label: "Champagne Included", value: "champagne" },
          { label: "Serenade Available", value: "serenade" },
          { label: "Proposal Coordination", value: "proposal" },
          { label: "Custom Menu", value: "custom_menu" },
        ]
      },
      {
        name: "Dress Code",
        slug: "dress_code",
        filterType: "single_select",
        icon: "Shirt",
        options: [
          { label: "Resort Casual", value: "resort_casual" },
          { label: "Smart Casual", value: "smart_casual" },
          { label: "Elegant", value: "elegant" },
          { label: "Formal", value: "formal" },
        ]
      },
    ]
  },
  {
    name: "Spa & Wellness",
    slug: "spa-wellness",
    description: "Relaxation scheduling, couples treatment coordination, recovery timing",
    icon: "Flower2",
    filters: [
      {
        name: "Treatment Type",
        slug: "treatment_type",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Couples Massage", value: "couples_massage" },
          { label: "Facial", value: "facial" },
          { label: "Body Treatment", value: "body" },
          { label: "Hydrotherapy", value: "hydrotherapy" },
          { label: "Wellness Ritual", value: "ritual" },
          { label: "Multi-Treatment Package", value: "package" },
        ]
      },
      {
        name: "Duration",
        slug: "duration",
        filterType: "single_select",
        icon: "Clock",
        options: [
          { label: "60 min", value: "60min" },
          { label: "90 min", value: "90min" },
          { label: "2 hours", value: "2hrs" },
          { label: "Half Day", value: "half_day" },
          { label: "Full Day", value: "full_day" },
        ]
      },
      {
        name: "Setting",
        slug: "setting",
        filterType: "single_select",
        icon: "MapPin",
        options: [
          { label: "Spa Facility", value: "spa" },
          { label: "In-Room/Villa", value: "in_room" },
          { label: "Beach/Outdoor", value: "outdoor" },
          { label: "Private Spa Suite", value: "private_suite" },
        ]
      },
      {
        name: "Wellness Focus",
        slug: "focus",
        filterType: "multi_select",
        icon: "Heart",
        options: [
          { label: "Relaxation", value: "relaxation" },
          { label: "Rejuvenation", value: "rejuvenation" },
          { label: "Romantic", value: "romantic" },
          { label: "Therapeutic", value: "therapeutic" },
          { label: "Detox", value: "detox" },
        ]
      },
      {
        name: "Price per Couple",
        slug: "price_couple",
        filterType: "single_select",
        icon: "DollarSign",
        options: [
          { label: "$200-400", value: "200-400", minValue: 200, maxValue: 400 },
          { label: "$400-700", value: "400-700", minValue: 400, maxValue: 700 },
          { label: "$700-1000", value: "700-1000", minValue: 700, maxValue: 1000 },
          { label: "$1000+", value: "1000+", minValue: 1000 },
        ]
      },
      {
        name: "Special Features",
        slug: "special_features",
        filterType: "multi_select",
        icon: "Star",
        options: [
          { label: "Private Spa Suite", value: "private" },
          { label: "Champagne Included", value: "champagne" },
          { label: "Outdoor Setting", value: "outdoor" },
          { label: "Aromatherapy Custom Blend", value: "aromatherapy" },
        ]
      },
    ]
  },
  {
    name: "Special Touches & Add-ons",
    slug: "special-touches",
    description: "Surprise element timing, special request fulfillment, memory enhancement",
    icon: "Gift",
    filters: [
      {
        name: "Service Type",
        slug: "service_type",
        filterType: "multi_select",
        icon: "Wand2",
        options: [
          { label: "Room Decoration", value: "room_decoration" },
          { label: "Champagne/Wine Delivery", value: "champagne" },
          { label: "Floral Arrangements", value: "florals" },
          { label: "Anniversary Cake", value: "cake" },
          { label: "Gift Coordination", value: "gifts" },
          { label: "Surprise Planning", value: "surprise" },
          { label: "Photographer", value: "photographer" },
          { label: "Musicians/Serenade", value: "musicians" },
        ]
      },
      {
        name: "Timing",
        slug: "timing",
        filterType: "multi_select",
        icon: "Clock",
        options: [
          { label: "Upon Arrival", value: "arrival" },
          { label: "Specific Time", value: "specific" },
          { label: "Daily", value: "daily" },
          { label: "During Experience", value: "during" },
        ]
      },
      {
        name: "Customization",
        slug: "customization",
        filterType: "single_select",
        icon: "Palette",
        options: [
          { label: "Pre-Set Package", value: "preset" },
          { label: "Semi-Custom", value: "semi_custom" },
          { label: "Fully Personalized", value: "personalized" },
        ]
      },
      {
        name: "Price Range",
        slug: "price_range",
        filterType: "single_select",
        icon: "DollarSign",
        options: [
          { label: "$50-150", value: "50-150", minValue: 50, maxValue: 150 },
          { label: "$150-300", value: "150-300", minValue: 150, maxValue: 300 },
          { label: "$300-600", value: "300-600", minValue: 300, maxValue: 600 },
          { label: "$600+", value: "600+", minValue: 600 },
        ]
      },
    ]
  },
  {
    name: "Transportation",
    slug: "transportation",
    description: "Seamless couple movement, luxury transfer experience, stress elimination",
    icon: "Car",
    filters: [
      {
        name: "Service Type",
        slug: "service_type",
        filterType: "multi_select",
        icon: "Route",
        options: [
          { label: "Airport Transfer", value: "airport" },
          { label: "Daily Driver", value: "daily_driver" },
          { label: "Car Rental", value: "rental" },
          { label: "Private Tours", value: "private_tours" },
          { label: "Helicopter Transfer", value: "helicopter" },
          { label: "Boat Transfer", value: "boat" },
        ]
      },
      {
        name: "Vehicle Type",
        slug: "vehicle_type",
        filterType: "multi_select",
        icon: "Car",
        options: [
          { label: "Luxury Sedan", value: "luxury_sedan" },
          { label: "SUV", value: "suv" },
          { label: "Convertible", value: "convertible" },
          { label: "Classic Car", value: "classic" },
          { label: "Exotic Rental", value: "exotic" },
        ]
      },
      {
        name: "Service Level",
        slug: "service_level",
        filterType: "single_select",
        icon: "Star",
        options: [
          { label: "Standard", value: "standard" },
          { label: "Premium", value: "premium" },
          { label: "Luxury", value: "luxury" },
          { label: "Ultra-Luxury", value: "ultra_luxury" },
        ]
      },
    ]
  },
];

// Universal filters for Anniversary
const anniversaryUniversalFilters: UniversalFilterDef[] = [
  {
    name: "Trip Duration",
    slug: "duration",
    filterType: "single_select",
    icon: "Calendar",
    options: [
      { label: "Weekend Getaway (2-3 nights)", value: "weekend" },
      { label: "Short Break (4-5 nights)", value: "short" },
      { label: "Full Week (6-7 nights)", value: "week" },
      { label: "Extended (8+ nights)", value: "extended" },
    ]
  },
  {
    name: "Total Budget (Couple)",
    slug: "total_budget",
    filterType: "single_select",
    icon: "DollarSign",
    options: [
      { label: "$1000-2500", value: "1000-2500", minValue: 1000, maxValue: 2500 },
      { label: "$2500-5000", value: "2500-5000", minValue: 2500, maxValue: 5000 },
      { label: "$5000-10000", value: "5000-10000", minValue: 5000, maxValue: 10000 },
      { label: "$10000+", value: "10000+", minValue: 10000 },
    ]
  },
  {
    name: "Booking Status",
    slug: "booking_status",
    filterType: "multi_select",
    icon: "CheckCircle",
    options: [
      { label: "Available Now", value: "available" },
      { label: "Request to Book", value: "request" },
    ]
  },
  {
    name: "Cancellation Policy",
    slug: "cancellation",
    filterType: "single_select",
    icon: "XCircle",
    options: [
      { label: "Flexible", value: "flexible" },
      { label: "Moderate", value: "moderate" },
      { label: "Strict", value: "strict" },
    ]
  },
  {
    name: "Expert Verified",
    slug: "expert_verified",
    filterType: "toggle",
    icon: "BadgeCheck",
    options: [
      { label: "Expert Verified", value: "true" },
    ]
  },
];

// ============ TRAVEL TEMPLATE ============
const travelTabs: TabDef[] = [
  {
    name: "Activities",
    slug: "activities",
    description: "Tours, experiences, and things to do at your destination",
    icon: "Palmtree",
    filters: [
      {
        name: "Duration",
        slug: "duration",
        filterType: "multi_select",
        icon: "Clock",
        options: [
          { label: "Half Day", value: "half_day" },
          { label: "Full Day", value: "full_day" },
          { label: "Multi-Day", value: "multi_day" },
          { label: "1-2 Hours", value: "1-2_hours" },
        ]
      },
      {
        name: "Activity Type",
        slug: "activity_type",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Adventure", value: "adventure" },
          { label: "Culture & History", value: "culture_history" },
          { label: "Nature & Outdoors", value: "nature_outdoors" },
          { label: "Food & Dining", value: "food_dining" },
          { label: "Wellness & Spa", value: "wellness_spa" },
          { label: "Nightlife", value: "nightlife" },
          { label: "Shopping", value: "shopping" },
          { label: "Water Activities", value: "water_activities" },
          { label: "City Tours", value: "city_tours" },
          { label: "Art & Museums", value: "art_museums" },
        ]
      },
      {
        name: "Group Size",
        slug: "group_size",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "Solo-Friendly", value: "solo" },
          { label: "Couples", value: "couples" },
          { label: "Small Groups (3-6)", value: "small_3-6" },
          { label: "Large Groups (7+)", value: "large_7+" },
        ]
      },
      {
        name: "Physical Level",
        slug: "physical_level",
        filterType: "single_select",
        icon: "Dumbbell",
        options: [
          { label: "Easy", value: "easy" },
          { label: "Moderate", value: "moderate" },
          { label: "Challenging", value: "challenging" },
          { label: "Extreme", value: "extreme" },
        ]
      },
      {
        name: "Age Range",
        slug: "age_range",
        filterType: "multi_select",
        icon: "Users",
        options: [
          { label: "Kid-Friendly", value: "kid_friendly" },
          { label: "Teen-Friendly", value: "teen_friendly" },
          { label: "Adult Only", value: "adult_only" },
          { label: "Senior-Friendly", value: "senior_friendly" },
        ]
      },
      {
        name: "Time of Day",
        slug: "time_of_day",
        filterType: "multi_select",
        icon: "Sun",
        options: [
          { label: "Morning", value: "morning" },
          { label: "Afternoon", value: "afternoon" },
          { label: "Evening", value: "evening" },
          { label: "Night", value: "night" },
          { label: "Flexible", value: "flexible" },
        ]
      },
      {
        name: "Weather",
        slug: "weather",
        filterType: "single_select",
        icon: "Cloud",
        options: [
          { label: "Indoor", value: "indoor" },
          { label: "Outdoor", value: "outdoor" },
          { label: "Covered/Flexible", value: "covered" },
        ]
      },
    ]
  },
  {
    name: "Hotels",
    slug: "hotels",
    description: "Accommodations for your stay",
    icon: "Hotel",
    filters: [
      {
        name: "Hotel Type",
        slug: "hotel_type",
        filterType: "multi_select",
        icon: "Building",
        options: [
          { label: "Luxury", value: "luxury" },
          { label: "Boutique", value: "boutique" },
          { label: "Budget", value: "budget" },
          { label: "Resort", value: "resort" },
          { label: "Apartment/Rental", value: "apartment" },
          { label: "Hostel", value: "hostel" },
          { label: "Bed & Breakfast", value: "bb" },
          { label: "Unique Stays", value: "unique" },
        ]
      },
      {
        name: "Amenities",
        slug: "amenities",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Pool", value: "pool" },
          { label: "Spa", value: "spa" },
          { label: "Gym", value: "gym" },
          { label: "Restaurant", value: "restaurant" },
          { label: "Bar", value: "bar" },
          { label: "Room Service", value: "room_service" },
          { label: "Free Wi-Fi", value: "wifi" },
          { label: "Parking", value: "parking" },
          { label: "Beach Access", value: "beach_access" },
          { label: "Business Center", value: "business_center" },
        ]
      },
      {
        name: "Room Type",
        slug: "room_type",
        filterType: "single_select",
        icon: "Bed",
        options: [
          { label: "Single", value: "single" },
          { label: "Double", value: "double" },
          { label: "Suite", value: "suite" },
          { label: "Family Room", value: "family" },
          { label: "Connecting Rooms", value: "connecting" },
        ]
      },
      {
        name: "Neighborhood",
        slug: "neighborhood",
        filterType: "single_select",
        icon: "MapPin",
        options: [
          { label: "City Center", value: "city_center" },
          { label: "Beach", value: "beach" },
          { label: "Airport", value: "airport" },
          { label: "Historic District", value: "historic" },
          { label: "Shopping District", value: "shopping" },
          { label: "Quiet/Residential", value: "residential" },
        ]
      },
      {
        name: "Star Rating",
        slug: "star_rating",
        filterType: "single_select",
        icon: "Star",
        options: [
          { label: "3-Star", value: "3_star" },
          { label: "4-Star", value: "4_star" },
          { label: "5-Star", value: "5_star" },
          { label: "Unrated", value: "unrated" },
        ]
      },
      {
        name: "Meal Plans",
        slug: "meal_plans",
        filterType: "single_select",
        icon: "Utensils",
        options: [
          { label: "Room Only", value: "room_only" },
          { label: "Breakfast Included", value: "breakfast" },
          { label: "Half Board", value: "half_board" },
          { label: "Full Board", value: "full_board" },
          { label: "All-Inclusive", value: "all_inclusive" },
        ]
      },
    ]
  },
  {
    name: "Services",
    slug: "services",
    description: "Supporting service providers for your trip",
    icon: "Wrench",
    filters: [
      {
        name: "Service Type",
        slug: "service_type",
        filterType: "multi_select",
        icon: "Briefcase",
        options: [
          { label: "Photography", value: "photography" },
          { label: "Videography", value: "videography" },
          { label: "Tour Guides", value: "tour_guides" },
          { label: "Private Drivers", value: "private_drivers" },
          { label: "Translators/Interpreters", value: "translators" },
          { label: "Travel Concierge", value: "concierge" },
          { label: "Luggage Services", value: "luggage" },
          { label: "Travel Insurance", value: "insurance" },
          { label: "SIM Cards/WiFi", value: "connectivity" },
          { label: "Local Expert Consultation", value: "local_expert" },
        ]
      },
      {
        name: "Language Support",
        slug: "language_support",
        filterType: "multi_select",
        icon: "Languages",
        options: [
          { label: "English", value: "english" },
          { label: "Spanish", value: "spanish" },
          { label: "Mandarin", value: "mandarin" },
          { label: "French", value: "french" },
          { label: "Arabic", value: "arabic" },
          { label: "Japanese", value: "japanese" },
          { label: "German", value: "german" },
          { label: "Other", value: "other" },
        ]
      },
      {
        name: "Availability",
        slug: "availability",
        filterType: "single_select",
        icon: "Calendar",
        options: [
          { label: "Instant Booking", value: "instant" },
          { label: "Request to Book", value: "request" },
          { label: "24/7 Available", value: "24_7" },
        ]
      },
      {
        name: "Experience Level",
        slug: "experience_level",
        filterType: "single_select",
        icon: "Award",
        options: [
          { label: "Beginner-Friendly", value: "beginner" },
          { label: "Expert", value: "expert" },
          { label: "Professional", value: "professional" },
        ]
      },
    ]
  },
  {
    name: "Dining",
    slug: "dining",
    description: "Restaurants and food experiences",
    icon: "Utensils",
    filters: [
      {
        name: "Cuisine Type",
        slug: "cuisine_type",
        filterType: "multi_select",
        icon: "ChefHat",
        options: [
          { label: "Local/Regional", value: "local" },
          { label: "Italian", value: "italian" },
          { label: "French", value: "french" },
          { label: "Asian", value: "asian" },
          { label: "Seafood", value: "seafood" },
          { label: "Steakhouse", value: "steakhouse" },
          { label: "Mexican", value: "mexican" },
          { label: "Mediterranean", value: "mediterranean" },
          { label: "Fusion", value: "fusion" },
          { label: "Vegetarian/Vegan", value: "vegetarian_vegan" },
          { label: "Street Food", value: "street_food" },
        ]
      },
      {
        name: "Meal Type",
        slug: "meal_type",
        filterType: "multi_select",
        icon: "Clock",
        options: [
          { label: "Breakfast", value: "breakfast" },
          { label: "Brunch", value: "brunch" },
          { label: "Lunch", value: "lunch" },
          { label: "Dinner", value: "dinner" },
          { label: "Late Night", value: "late_night" },
          { label: "Food Tour", value: "food_tour" },
        ]
      },
      {
        name: "Ambiance",
        slug: "ambiance",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Casual", value: "casual" },
          { label: "Fine Dining", value: "fine_dining" },
          { label: "Romantic", value: "romantic" },
          { label: "Family-Friendly", value: "family_friendly" },
          { label: "Lively/Loud", value: "lively" },
          { label: "Quiet/Intimate", value: "quiet" },
          { label: "Outdoor Seating", value: "outdoor" },
          { label: "Views", value: "views" },
        ]
      },
      {
        name: "Dietary Options",
        slug: "dietary_options",
        filterType: "multi_select",
        icon: "Leaf",
        options: [
          { label: "Vegetarian", value: "vegetarian" },
          { label: "Vegan", value: "vegan" },
          { label: "Gluten-Free", value: "gluten_free" },
          { label: "Halal", value: "halal" },
          { label: "Kosher", value: "kosher" },
          { label: "Allergy-Friendly", value: "allergy_friendly" },
        ]
      },
      {
        name: "Reservation",
        slug: "reservation",
        filterType: "single_select",
        icon: "Calendar",
        options: [
          { label: "Walk-in Friendly", value: "walk_in" },
          { label: "Reservation Recommended", value: "recommended" },
          { label: "Reservation Required", value: "required" },
        ]
      },
      {
        name: "Group Size",
        slug: "group_size",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "Couples", value: "couples" },
          { label: "Small Groups (3-6)", value: "small_3-6" },
          { label: "Large Groups (7-15)", value: "large_7-15" },
          { label: "XL Groups (15+)", value: "xl_15+" },
        ]
      },
    ]
  },
  {
    name: "Flights",
    slug: "flights",
    description: "Flight options for your journey",
    icon: "Plane",
    filters: [
      {
        name: "Flight Type",
        slug: "flight_type",
        filterType: "single_select",
        icon: "Route",
        options: [
          { label: "Nonstop", value: "nonstop" },
          { label: "1 Stop", value: "1_stop" },
          { label: "2+ Stops", value: "2+_stops" },
        ]
      },
      {
        name: "Cabin Class",
        slug: "cabin_class",
        filterType: "single_select",
        icon: "Armchair",
        options: [
          { label: "Economy", value: "economy" },
          { label: "Premium Economy", value: "premium_economy" },
          { label: "Business", value: "business" },
          { label: "First Class", value: "first_class" },
        ]
      },
      {
        name: "Departure Time",
        slug: "departure_time",
        filterType: "multi_select",
        icon: "Clock",
        options: [
          { label: "Early Morning", value: "early_morning" },
          { label: "Morning", value: "morning" },
          { label: "Afternoon", value: "afternoon" },
          { label: "Evening", value: "evening" },
          { label: "Night", value: "night" },
          { label: "Red Eye", value: "red_eye" },
        ]
      },
      {
        name: "Baggage",
        slug: "baggage",
        filterType: "single_select",
        icon: "Luggage",
        options: [
          { label: "Carry-on Only", value: "carry_on" },
          { label: "1 Checked Bag", value: "1_checked" },
          { label: "2+ Checked Bags", value: "2+_checked" },
        ]
      },
      {
        name: "Flexibility",
        slug: "flexibility",
        filterType: "single_select",
        icon: "Calendar",
        options: [
          { label: "Flexible Dates", value: "flexible" },
          { label: "Exact Dates", value: "exact" },
        ]
      },
    ]
  },
  {
    name: "Transportation",
    slug: "transportation",
    description: "Ground transportation at your destination",
    icon: "Car",
    filters: [
      {
        name: "Transport Type",
        slug: "transport_type",
        filterType: "multi_select",
        icon: "Route",
        options: [
          { label: "Airport Transfer", value: "airport_transfer" },
          { label: "Car Rental", value: "car_rental" },
          { label: "Private Driver", value: "private_driver" },
          { label: "Public Transit Pass", value: "transit_pass" },
          { label: "Train Tickets", value: "train" },
          { label: "Ferry/Boat", value: "ferry" },
          { label: "Scooter/Bike Rental", value: "scooter_bike" },
          { label: "Rideshare", value: "rideshare" },
        ]
      },
      {
        name: "Vehicle Type",
        slug: "vehicle_type",
        filterType: "single_select",
        icon: "Car",
        options: [
          { label: "Economy", value: "economy" },
          { label: "Standard", value: "standard" },
          { label: "SUV", value: "suv" },
          { label: "Luxury", value: "luxury" },
          { label: "Van/Minibus", value: "van" },
          { label: "Bus", value: "bus" },
        ]
      },
      {
        name: "Service Level",
        slug: "service_level",
        filterType: "single_select",
        icon: "Star",
        options: [
          { label: "Shared", value: "shared" },
          { label: "Private", value: "private" },
          { label: "Premium", value: "premium" },
        ]
      },
      {
        name: "Capacity",
        slug: "capacity",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "1-2 Passengers", value: "1-2" },
          { label: "3-4 Passengers", value: "3-4" },
          { label: "5-7 Passengers", value: "5-7" },
          { label: "8-15 Passengers", value: "8-15" },
          { label: "15+ Passengers", value: "15+" },
        ]
      },
    ]
  },
];

// Universal filters for Travel
const travelUniversalFilters: UniversalFilterDef[] = [
  {
    name: "Price Range",
    slug: "price_range",
    filterType: "range",
    icon: "DollarSign",
    options: [
      { label: "Budget", value: "budget", minValue: 0, maxValue: 100 },
      { label: "Mid-Range", value: "midrange", minValue: 100, maxValue: 300 },
      { label: "Premium", value: "premium", minValue: 300, maxValue: 500 },
      { label: "Luxury", value: "luxury", minValue: 500 },
    ]
  },
  {
    name: "Minimum Rating",
    slug: "min_rating",
    filterType: "single_select",
    icon: "Star",
    options: [
      { label: "All", value: "all" },
      { label: "3+", value: "3" },
      { label: "3.5+", value: "3.5" },
      { label: "4+", value: "4" },
      { label: "4.5+", value: "4.5" },
    ]
  },
  {
    name: "Sort By",
    slug: "sort_by",
    filterType: "single_select",
    icon: "ArrowUpDown",
    options: [
      { label: "Most Popular", value: "popular" },
      { label: "Price: Low to High", value: "price_low" },
      { label: "Price: High to Low", value: "price_high" },
      { label: "Rating", value: "rating" },
      { label: "Duration", value: "duration" },
    ]
  },
  {
    name: "Booking Status",
    slug: "booking_status",
    filterType: "multi_select",
    icon: "CheckCircle",
    options: [
      { label: "Available Now", value: "available" },
      { label: "Request to Book", value: "request" },
    ]
  },
];

// ============ WEDDING TEMPLATE ============
const weddingTabs: TabDef[] = [
  {
    name: "Venues",
    slug: "venues",
    description: "Wedding ceremony and reception venue selection",
    icon: "Building2",
    filters: [
      {
        name: "Venue Type",
        slug: "venue_type",
        filterType: "multi_select",
        icon: "Building",
        options: [
          { label: "Hotel/Resort", value: "hotel_resort" },
          { label: "Vineyard/Winery", value: "vineyard" },
          { label: "Beach/Waterfront", value: "beach" },
          { label: "Garden/Estate", value: "garden_estate" },
          { label: "Historic/Mansion", value: "historic" },
          { label: "Barn/Rustic", value: "barn_rustic" },
          { label: "Modern/Loft", value: "modern_loft" },
          { label: "Religious Venue", value: "religious" },
        ]
      },
      {
        name: "Capacity",
        slug: "capacity",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "Intimate (10-50)", value: "10-50" },
          { label: "Small (50-100)", value: "50-100" },
          { label: "Medium (100-200)", value: "100-200" },
          { label: "Large (200-350)", value: "200-350" },
          { label: "Grand (350+)", value: "350+" },
        ]
      },
      {
        name: "Setting",
        slug: "setting",
        filterType: "multi_select",
        icon: "Sun",
        options: [
          { label: "Indoor Only", value: "indoor" },
          { label: "Outdoor Only", value: "outdoor" },
          { label: "Indoor + Outdoor", value: "both" },
          { label: "Weather Backup Plan", value: "weather_backup" },
        ]
      },
      {
        name: "Price Tier",
        slug: "price_tier",
        filterType: "single_select",
        icon: "DollarSign",
        options: [
          { label: "Budget ($5K-15K)", value: "budget", minValue: 5000, maxValue: 15000 },
          { label: "Mid-Range ($15K-35K)", value: "midrange", minValue: 15000, maxValue: 35000 },
          { label: "Premium ($35K-75K)", value: "premium", minValue: 35000, maxValue: 75000 },
          { label: "Luxury ($75K+)", value: "luxury", minValue: 75000 },
        ]
      },
    ]
  },
  {
    name: "Vendors",
    slug: "vendors",
    description: "Photography, catering, florals, and essential services",
    icon: "Camera",
    filters: [
      {
        name: "Vendor Type",
        slug: "vendor_type",
        filterType: "multi_select",
        icon: "Users",
        options: [
          { label: "Photographer", value: "photographer" },
          { label: "Videographer", value: "videographer" },
          { label: "Caterer", value: "caterer" },
          { label: "Florist", value: "florist" },
          { label: "DJ/Band", value: "dj_band" },
          { label: "Officiant", value: "officiant" },
          { label: "Makeup/Hair", value: "beauty" },
          { label: "Planner/Coordinator", value: "planner" },
        ]
      },
      {
        name: "Experience Level",
        slug: "experience_level",
        filterType: "single_select",
        icon: "Award",
        options: [
          { label: "Rising Talent", value: "rising" },
          { label: "Established", value: "established" },
          { label: "Highly Experienced", value: "highly_experienced" },
          { label: "Industry Leader", value: "leader" },
        ]
      },
    ]
  },
  {
    name: "Services",
    slug: "services",
    description: "Decor, rentals, and additional wedding services",
    icon: "Sparkles",
    filters: [
      {
        name: "Service Category",
        slug: "service_category",
        filterType: "multi_select",
        icon: "Layers",
        options: [
          { label: "Decor/Design", value: "decor" },
          { label: "Rentals", value: "rentals" },
          { label: "Cake/Desserts", value: "cake" },
          { label: "Transportation", value: "transportation" },
          { label: "Invitations/Stationery", value: "stationery" },
          { label: "Favors/Gifts", value: "favors" },
        ]
      },
    ]
  },
  {
    name: "Guest Accommodations",
    slug: "guest-accommodations",
    description: "Hotel blocks and lodging for wedding guests",
    icon: "Bed",
    filters: [
      {
        name: "Accommodation Type",
        slug: "accommodation_type",
        filterType: "multi_select",
        icon: "Building",
        options: [
          { label: "Hotel Block", value: "hotel_block" },
          { label: "Vacation Rentals", value: "vacation_rentals" },
          { label: "Resort", value: "resort" },
          { label: "B&B/Inn", value: "bb_inn" },
        ]
      },
      {
        name: "Distance from Venue",
        slug: "distance",
        filterType: "single_select",
        icon: "MapPin",
        options: [
          { label: "On-site", value: "onsite" },
          { label: "Walking Distance", value: "walking" },
          { label: "Short Drive (<15 min)", value: "short_drive" },
          { label: "Moderate Drive (15-30 min)", value: "moderate_drive" },
        ]
      },
    ]
  },
  {
    name: "Transportation",
    slug: "transportation",
    description: "Guest shuttles and wedding party transportation",
    icon: "Car",
    filters: [
      {
        name: "Vehicle Type",
        slug: "vehicle_type",
        filterType: "multi_select",
        icon: "Bus",
        options: [
          { label: "Classic Car", value: "classic_car" },
          { label: "Limo", value: "limo" },
          { label: "Party Bus", value: "party_bus" },
          { label: "Guest Shuttle", value: "shuttle" },
          { label: "Horse & Carriage", value: "horse_carriage" },
        ]
      },
    ]
  },
  {
    name: "Rehearsal",
    slug: "rehearsal",
    description: "Rehearsal dinner venues and coordination",
    icon: "Calendar",
    filters: [
      {
        name: "Venue Type",
        slug: "venue_type",
        filterType: "multi_select",
        icon: "UtensilsCrossed",
        options: [
          { label: "Restaurant Private Room", value: "restaurant" },
          { label: "Same as Wedding Venue", value: "same_venue" },
          { label: "Unique Venue", value: "unique" },
          { label: "Home/Backyard", value: "home" },
        ]
      },
      {
        name: "Guest Count",
        slug: "guest_count",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "Immediate Family (10-20)", value: "10-20" },
          { label: "Wedding Party (20-40)", value: "20-40" },
          { label: "Extended (40-60)", value: "40-60" },
          { label: "All Guests (60+)", value: "60+" },
        ]
      },
    ]
  },
];

// ============ DATE NIGHT TEMPLATE ============
const dateNightTabs: TabDef[] = [
  {
    name: "Dining",
    slug: "dining",
    description: "Romantic restaurant selection",
    icon: "UtensilsCrossed",
    filters: [
      {
        name: "Cuisine",
        slug: "cuisine",
        filterType: "multi_select",
        icon: "ChefHat",
        options: [
          { label: "Italian", value: "italian" },
          { label: "French", value: "french" },
          { label: "Japanese", value: "japanese" },
          { label: "Steakhouse", value: "steakhouse" },
          { label: "Seafood", value: "seafood" },
          { label: "Mediterranean", value: "mediterranean" },
        ]
      },
      {
        name: "Ambiance",
        slug: "ambiance",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Romantic/Intimate", value: "romantic" },
          { label: "Upscale", value: "upscale" },
          { label: "Trendy/Modern", value: "trendy" },
          { label: "Cozy/Casual", value: "cozy" },
          { label: "Rooftop/Views", value: "rooftop" },
        ]
      },
      {
        name: "Price Range",
        slug: "price",
        filterType: "single_select",
        icon: "DollarSign",
        options: [
          { label: "$30-60/person", value: "30-60", minValue: 30, maxValue: 60 },
          { label: "$60-100/person", value: "60-100", minValue: 60, maxValue: 100 },
          { label: "$100-150/person", value: "100-150", minValue: 100, maxValue: 150 },
          { label: "$150+/person", value: "150+", minValue: 150 },
        ]
      },
    ]
  },
  {
    name: "Activities",
    slug: "activities",
    description: "Date night experiences and entertainment",
    icon: "Star",
    filters: [
      {
        name: "Activity Type",
        slug: "activity_type",
        filterType: "multi_select",
        icon: "Palette",
        options: [
          { label: "Cooking Class", value: "cooking" },
          { label: "Wine/Cocktail Tasting", value: "tasting" },
          { label: "Escape Room", value: "escape_room" },
          { label: "Art Class", value: "art" },
          { label: "Pottery/Crafts", value: "pottery" },
          { label: "Dancing Lesson", value: "dancing" },
          { label: "Axe Throwing", value: "axe_throwing" },
          { label: "Mini Golf", value: "mini_golf" },
        ]
      },
    ]
  },
  {
    name: "Entertainment",
    slug: "entertainment",
    description: "Shows, concerts, and performances",
    icon: "Music",
    filters: [
      {
        name: "Entertainment Type",
        slug: "entertainment_type",
        filterType: "multi_select",
        icon: "Ticket",
        options: [
          { label: "Live Music", value: "live_music" },
          { label: "Comedy Show", value: "comedy" },
          { label: "Theater/Musical", value: "theater" },
          { label: "Concert", value: "concert" },
          { label: "Movie Screening", value: "movie" },
          { label: "Jazz/Blues Club", value: "jazz" },
        ]
      },
    ]
  },
  {
    name: "Services",
    slug: "services",
    description: "Spa, wellness, and special services",
    icon: "Heart",
    filters: [
      {
        name: "Service Type",
        slug: "service_type",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Couples Massage", value: "couples_massage" },
          { label: "Spa Package", value: "spa" },
          { label: "Personal Chef", value: "personal_chef" },
          { label: "Private Photography", value: "photography" },
        ]
      },
    ]
  },
  {
    name: "Transportation",
    slug: "transportation",
    description: "Getting around in style",
    icon: "Car",
    filters: [
      {
        name: "Transport Type",
        slug: "transport_type",
        filterType: "multi_select",
        icon: "Route",
        options: [
          { label: "Rideshare", value: "rideshare" },
          { label: "Car Service", value: "car_service" },
          { label: "Bike Rental", value: "bike" },
          { label: "Walking Tour", value: "walking" },
        ]
      },
    ]
  },
];

// ============ BIRTHDAY TEMPLATE ============
const birthdayTabs: TabDef[] = [
  {
    name: "Venues",
    slug: "venues",
    description: "Birthday party venue selection",
    icon: "PartyPopper",
    filters: [
      {
        name: "Venue Type",
        slug: "venue_type",
        filterType: "multi_select",
        icon: "Building",
        options: [
          { label: "Restaurant/Private Room", value: "restaurant" },
          { label: "Bar/Lounge", value: "bar" },
          { label: "Event Space", value: "event_space" },
          { label: "Outdoor Venue", value: "outdoor" },
          { label: "Home/Backyard", value: "home" },
          { label: "Rooftop", value: "rooftop" },
          { label: "Club/Nightlife", value: "club" },
        ]
      },
      {
        name: "Guest Count",
        slug: "guest_count",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "Small (5-15)", value: "5-15" },
          { label: "Medium (15-30)", value: "15-30" },
          { label: "Large (30-60)", value: "30-60" },
          { label: "Big Bash (60+)", value: "60+" },
        ]
      },
    ]
  },
  {
    name: "Activities",
    slug: "activities",
    description: "Birthday party entertainment and activities",
    icon: "Gamepad2",
    filters: [
      {
        name: "Activity Type",
        slug: "activity_type",
        filterType: "multi_select",
        icon: "Star",
        options: [
          { label: "Karaoke", value: "karaoke" },
          { label: "Bowling", value: "bowling" },
          { label: "Escape Room", value: "escape_room" },
          { label: "Game Night", value: "game_night" },
          { label: "Paint Party", value: "paint_party" },
          { label: "Spa Day", value: "spa" },
          { label: "Adventure Activity", value: "adventure" },
        ]
      },
    ]
  },
  {
    name: "Dining",
    slug: "dining",
    description: "Birthday dinner and catering options",
    icon: "Cake",
    filters: [
      {
        name: "Dining Style",
        slug: "dining_style",
        filterType: "multi_select",
        icon: "UtensilsCrossed",
        options: [
          { label: "Sit-Down Dinner", value: "sit_down" },
          { label: "Buffet/Family Style", value: "buffet" },
          { label: "Cocktail Reception", value: "cocktail" },
          { label: "Food Trucks", value: "food_trucks" },
          { label: "Catered at Venue", value: "catered" },
        ]
      },
    ]
  },
  {
    name: "Entertainment",
    slug: "entertainment",
    description: "Music, performers, and entertainment",
    icon: "Music",
    filters: [
      {
        name: "Entertainment Type",
        slug: "entertainment_type",
        filterType: "multi_select",
        icon: "Mic",
        options: [
          { label: "DJ", value: "dj" },
          { label: "Live Band", value: "band" },
          { label: "Photo Booth", value: "photo_booth" },
          { label: "Magician/Performer", value: "performer" },
          { label: "Trivia Host", value: "trivia" },
        ]
      },
    ]
  },
  {
    name: "Services",
    slug: "services",
    description: "Decorations, cake, and party services",
    icon: "Gift",
    filters: [
      {
        name: "Service Type",
        slug: "service_type",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Decorations", value: "decorations" },
          { label: "Custom Cake", value: "cake" },
          { label: "Party Favors", value: "favors" },
          { label: "Event Planner", value: "planner" },
          { label: "Bartender", value: "bartender" },
        ]
      },
    ]
  },
  {
    name: "Accommodations",
    slug: "accommodations",
    description: "Overnight stays for birthday trips",
    icon: "Bed",
    filters: [
      {
        name: "Stay Type",
        slug: "stay_type",
        filterType: "multi_select",
        icon: "Home",
        options: [
          { label: "Hotel", value: "hotel" },
          { label: "Vacation Rental", value: "rental" },
          { label: "Resort", value: "resort" },
          { label: "Unique Stay", value: "unique" },
        ]
      },
    ]
  },
];

// ============ CORPORATE EVENTS TEMPLATE ============
const corporateTabs: TabDef[] = [
  {
    name: "Venues",
    slug: "venues",
    description: "Corporate event and meeting venues",
    icon: "Building2",
    filters: [
      {
        name: "Venue Type",
        slug: "venue_type",
        filterType: "multi_select",
        icon: "Building",
        options: [
          { label: "Conference Center", value: "conference" },
          { label: "Hotel Meeting Rooms", value: "hotel" },
          { label: "Unique/Creative Space", value: "unique" },
          { label: "Restaurant Private Dining", value: "restaurant" },
          { label: "Outdoor/Retreat Center", value: "outdoor" },
          { label: "Coworking Event Space", value: "coworking" },
        ]
      },
      {
        name: "Capacity",
        slug: "capacity",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "Small Team (5-20)", value: "5-20" },
          { label: "Department (20-50)", value: "20-50" },
          { label: "Division (50-150)", value: "50-150" },
          { label: "Company-wide (150-500)", value: "150-500" },
          { label: "Large Conference (500+)", value: "500+" },
        ]
      },
      {
        name: "AV/Tech",
        slug: "av_tech",
        filterType: "multi_select",
        icon: "Monitor",
        options: [
          { label: "Projector/Screen", value: "projector" },
          { label: "Video Conferencing", value: "video_conf" },
          { label: "Stage/PA System", value: "stage" },
          { label: "Breakout Rooms", value: "breakout" },
          { label: "Livestream Capable", value: "livestream" },
        ]
      },
    ]
  },
  {
    name: "Team Activities",
    slug: "team-activities",
    description: "Team building and group activities",
    icon: "Users",
    filters: [
      {
        name: "Activity Type",
        slug: "activity_type",
        filterType: "multi_select",
        icon: "Puzzle",
        options: [
          { label: "Team Building Games", value: "team_games" },
          { label: "Escape Room", value: "escape_room" },
          { label: "Cooking Challenge", value: "cooking" },
          { label: "Outdoor Adventure", value: "outdoor" },
          { label: "Volunteering/CSR", value: "csr" },
          { label: "Workshop/Training", value: "workshop" },
          { label: "Scavenger Hunt", value: "scavenger" },
          { label: "Sports/Recreation", value: "sports" },
        ]
      },
      {
        name: "Team Size",
        slug: "team_size",
        filterType: "single_select",
        icon: "Users",
        options: [
          { label: "Small (5-15)", value: "5-15" },
          { label: "Medium (15-40)", value: "15-40" },
          { label: "Large (40-100)", value: "40-100" },
          { label: "Extra Large (100+)", value: "100+" },
        ]
      },
    ]
  },
  {
    name: "Services",
    slug: "services",
    description: "Catering, A/V, and event services",
    icon: "Briefcase",
    filters: [
      {
        name: "Service Type",
        slug: "service_type",
        filterType: "multi_select",
        icon: "Settings",
        options: [
          { label: "Full Catering", value: "catering" },
          { label: "A/V Support", value: "av" },
          { label: "Event Planner", value: "planner" },
          { label: "Photographer", value: "photographer" },
          { label: "MC/Speaker", value: "mc" },
          { label: "Swag/Gifts", value: "swag" },
        ]
      },
    ]
  },
  {
    name: "Dining",
    slug: "dining",
    description: "Corporate meals and catering",
    icon: "UtensilsCrossed",
    filters: [
      {
        name: "Meal Type",
        slug: "meal_type",
        filterType: "multi_select",
        icon: "Clock",
        options: [
          { label: "Working Lunch", value: "working_lunch" },
          { label: "Cocktail Reception", value: "cocktail" },
          { label: "Sit-Down Dinner", value: "dinner" },
          { label: "Awards Gala", value: "gala" },
          { label: "Coffee/Snack Breaks", value: "breaks" },
        ]
      },
    ]
  },
  {
    name: "Transportation",
    slug: "transportation",
    description: "Group transportation and logistics",
    icon: "Bus",
    filters: [
      {
        name: "Transport Type",
        slug: "transport_type",
        filterType: "multi_select",
        icon: "Route",
        options: [
          { label: "Charter Bus", value: "charter_bus" },
          { label: "Shuttle Service", value: "shuttle" },
          { label: "Car Service", value: "car_service" },
          { label: "Airport Transfers", value: "airport" },
        ]
      },
    ]
  },
  {
    name: "Accommodations",
    slug: "accommodations",
    description: "Hotel blocks for multi-day events",
    icon: "Hotel",
    filters: [
      {
        name: "Hotel Tier",
        slug: "hotel_tier",
        filterType: "single_select",
        icon: "Star",
        options: [
          { label: "Budget-Friendly", value: "budget" },
          { label: "Mid-Range", value: "midrange" },
          { label: "Upscale", value: "upscale" },
          { label: "Luxury", value: "luxury" },
        ]
      },
    ]
  },
];

// ============ RETREATS TEMPLATE ============
const retreatsTabs: TabDef[] = [
  {
    name: "Venues",
    slug: "venues",
    description: "Retreat centers and lodging",
    icon: "Trees",
    filters: [
      {
        name: "Venue Type",
        slug: "venue_type",
        filterType: "multi_select",
        icon: "Home",
        options: [
          { label: "Wellness Retreat Center", value: "wellness_center" },
          { label: "Mountain Lodge", value: "mountain_lodge" },
          { label: "Beach Resort", value: "beach_resort" },
          { label: "Private Estate", value: "estate" },
          { label: "Eco-Lodge", value: "eco_lodge" },
          { label: "Monastery/Spiritual Center", value: "spiritual" },
          { label: "Hot Springs Resort", value: "hot_springs" },
        ]
      },
      {
        name: "Setting",
        slug: "setting",
        filterType: "multi_select",
        icon: "Mountain",
        options: [
          { label: "Mountains", value: "mountains" },
          { label: "Beach/Ocean", value: "beach" },
          { label: "Forest", value: "forest" },
          { label: "Desert", value: "desert" },
          { label: "Countryside", value: "countryside" },
        ]
      },
    ]
  },
  {
    name: "Activities",
    slug: "activities",
    description: "Retreat programs and activities",
    icon: "Leaf",
    filters: [
      {
        name: "Activity Type",
        slug: "activity_type",
        filterType: "multi_select",
        icon: "Activity",
        options: [
          { label: "Yoga", value: "yoga" },
          { label: "Meditation", value: "meditation" },
          { label: "Hiking/Nature Walks", value: "hiking" },
          { label: "Wellness Workshops", value: "workshops" },
          { label: "Creative/Art", value: "creative" },
          { label: "Journaling/Writing", value: "writing" },
          { label: "Breathwork", value: "breathwork" },
          { label: "Sound Healing", value: "sound_healing" },
        ]
      },
      {
        name: "Intensity",
        slug: "intensity",
        filterType: "single_select",
        icon: "Zap",
        options: [
          { label: "Gentle/Restorative", value: "gentle" },
          { label: "Moderate", value: "moderate" },
          { label: "Active", value: "active" },
          { label: "Intensive", value: "intensive" },
        ]
      },
    ]
  },
  {
    name: "Services",
    slug: "services",
    description: "Spa, healing, and wellness services",
    icon: "Sparkles",
    filters: [
      {
        name: "Service Type",
        slug: "service_type",
        filterType: "multi_select",
        icon: "Heart",
        options: [
          { label: "Massage", value: "massage" },
          { label: "Facials/Skincare", value: "skincare" },
          { label: "Energy Healing", value: "energy_healing" },
          { label: "Acupuncture", value: "acupuncture" },
          { label: "Nutrition Counseling", value: "nutrition" },
          { label: "Life Coaching", value: "coaching" },
        ]
      },
    ]
  },
  {
    name: "Dining",
    slug: "dining",
    description: "Retreat meals and nutrition",
    icon: "Apple",
    filters: [
      {
        name: "Dietary Focus",
        slug: "dietary_focus",
        filterType: "multi_select",
        icon: "Leaf",
        options: [
          { label: "Plant-Based", value: "plant_based" },
          { label: "Organic", value: "organic" },
          { label: "Detox/Cleanse", value: "detox" },
          { label: "Ayurvedic", value: "ayurvedic" },
          { label: "Raw Food", value: "raw" },
          { label: "Farm-to-Table", value: "farm_to_table" },
        ]
      },
    ]
  },
  {
    name: "Accommodations",
    slug: "accommodations",
    description: "Room types and lodging options",
    icon: "Bed",
    filters: [
      {
        name: "Room Type",
        slug: "room_type",
        filterType: "multi_select",
        icon: "Home",
        options: [
          { label: "Private Room", value: "private" },
          { label: "Shared Room", value: "shared" },
          { label: "Suite/Upgrade", value: "suite" },
          { label: "Cabin/Cottage", value: "cabin" },
          { label: "Glamping/Tent", value: "glamping" },
        ]
      },
    ]
  },
  {
    name: "Wellness",
    slug: "wellness",
    description: "Wellness amenities and facilities",
    icon: "Heart",
    filters: [
      {
        name: "Wellness Amenities",
        slug: "wellness_amenities",
        filterType: "multi_select",
        icon: "Sparkles",
        options: [
          { label: "Spa/Treatment Center", value: "spa" },
          { label: "Yoga Studio", value: "yoga_studio" },
          { label: "Meditation Garden", value: "meditation_garden" },
          { label: "Sauna/Steam Room", value: "sauna" },
          { label: "Pool", value: "pool" },
          { label: "Fitness Center", value: "fitness" },
          { label: "Nature Trails", value: "trails" },
        ]
      },
    ]
  },
];

// Standard universal filters for all templates
const standardUniversalFilters: UniversalFilterDef[] = [
  {
    name: "Price Range",
    slug: "price_range",
    filterType: "range",
    icon: "DollarSign",
    options: [
      { label: "Budget", value: "budget", minValue: 0, maxValue: 100 },
      { label: "Mid-Range", value: "midrange", minValue: 100, maxValue: 300 },
      { label: "Premium", value: "premium", minValue: 300, maxValue: 500 },
      { label: "Luxury", value: "luxury", minValue: 500 },
    ]
  },
  {
    name: "Minimum Rating",
    slug: "min_rating",
    filterType: "single_select",
    icon: "Star",
    options: [
      { label: "All", value: "all" },
      { label: "3+", value: "3" },
      { label: "3.5+", value: "3.5" },
      { label: "4+", value: "4" },
      { label: "4.5+", value: "4.5" },
    ]
  },
  {
    name: "Sort By",
    slug: "sort_by",
    filterType: "single_select",
    icon: "ArrowUpDown",
    options: [
      { label: "Most Popular", value: "popular" },
      { label: "Price: Low to High", value: "price_low" },
      { label: "Price: High to Low", value: "price_high" },
      { label: "Highest Rated", value: "rating" },
    ]
  },
];

export async function seedExperienceTemplateTabs() {
  console.log("Seeding experience template tabs and filters...");

  // Seed Bachelor/Bachelorette Party template
  const bachelorId = await getOrCreateExperienceType("bachelor-bachelorette", "Bachelor/Bachelorette Party");
  console.log(`Bachelor/Bachelorette Party experience type ID: ${bachelorId}`);
  
  for (let i = 0; i < bachelorTabs.length; i++) {
    await seedTabWithFilters(bachelorId, bachelorTabs[i], i);
  }
  await seedUniversalFilters(bachelorId, bachelorUniversalFilters);
  console.log("Bachelor/Bachelorette Party template seeded.");

  // Seed Anniversary Trip template
  const anniversaryId = await getOrCreateExperienceType("anniversary-trip", "Anniversary Trip");
  console.log(`Anniversary Trip experience type ID: ${anniversaryId}`);
  
  for (let i = 0; i < anniversaryTabs.length; i++) {
    await seedTabWithFilters(anniversaryId, anniversaryTabs[i], i);
  }
  await seedUniversalFilters(anniversaryId, anniversaryUniversalFilters);
  console.log("Anniversary Trip template seeded.");

  // Seed Travel template
  const travelId = await getOrCreateExperienceType("travel", "Travel");
  console.log(`Travel experience type ID: ${travelId}`);
  
  for (let i = 0; i < travelTabs.length; i++) {
    await seedTabWithFilters(travelId, travelTabs[i], i);
  }
  await seedUniversalFilters(travelId, travelUniversalFilters);
  console.log("Travel template seeded.");

  // Seed Wedding template
  const weddingId = await getOrCreateExperienceType("wedding", "Wedding");
  console.log(`Wedding experience type ID: ${weddingId}`);
  
  for (let i = 0; i < weddingTabs.length; i++) {
    await seedTabWithFilters(weddingId, weddingTabs[i], i);
  }
  await seedUniversalFilters(weddingId, standardUniversalFilters);
  console.log("Wedding template seeded.");

  // Seed Date Night template
  const dateNightId = await getOrCreateExperienceType("date-night", "Date Night");
  console.log(`Date Night experience type ID: ${dateNightId}`);
  
  for (let i = 0; i < dateNightTabs.length; i++) {
    await seedTabWithFilters(dateNightId, dateNightTabs[i], i);
  }
  await seedUniversalFilters(dateNightId, standardUniversalFilters);
  console.log("Date Night template seeded.");

  // Seed Birthday template
  const birthdayId = await getOrCreateExperienceType("birthday", "Birthday");
  console.log(`Birthday experience type ID: ${birthdayId}`);
  
  for (let i = 0; i < birthdayTabs.length; i++) {
    await seedTabWithFilters(birthdayId, birthdayTabs[i], i);
  }
  await seedUniversalFilters(birthdayId, standardUniversalFilters);
  console.log("Birthday template seeded.");

  // Seed Corporate Events template
  const corporateId = await getOrCreateExperienceType("corporate-events", "Corporate Events");
  console.log(`Corporate Events experience type ID: ${corporateId}`);
  
  for (let i = 0; i < corporateTabs.length; i++) {
    await seedTabWithFilters(corporateId, corporateTabs[i], i);
  }
  await seedUniversalFilters(corporateId, standardUniversalFilters);
  console.log("Corporate Events template seeded.");

  // Seed Retreats template
  const retreatsId = await getOrCreateExperienceType("retreats", "Retreats");
  console.log(`Retreats experience type ID: ${retreatsId}`);
  
  for (let i = 0; i < retreatsTabs.length; i++) {
    await seedTabWithFilters(retreatsId, retreatsTabs[i], i);
  }
  await seedUniversalFilters(retreatsId, standardUniversalFilters);
  console.log("Retreats template seeded.");

  console.log("Experience template tabs and filters seeding complete.");
}
