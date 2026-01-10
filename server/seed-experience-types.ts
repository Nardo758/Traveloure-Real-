import { db } from "./db";
import { experienceTypes, experienceTemplateSteps } from "@shared/schema";
import { eq } from "drizzle-orm";

const coreExperienceTypes = [
  { 
    name: "Travel", 
    slug: "travel", 
    description: "Plan your perfect trip with activities, accommodations, and services",
    icon: "Plane",
    color: "#3B82F6",
    sortOrder: 1 
  },
  { 
    name: "Wedding", 
    slug: "wedding", 
    description: "Create your dream wedding with venue, catering, photography, and more",
    icon: "Heart",
    color: "#EC4899",
    sortOrder: 2 
  },
  { 
    name: "Proposal", 
    slug: "proposal", 
    description: "Plan the perfect proposal with the right setting and ambiance",
    icon: "Diamond",
    color: "#8B5CF6",
    sortOrder: 3 
  },
  { 
    name: "Romance", 
    slug: "romance", 
    description: "Plan a romantic getaway or special date experience",
    icon: "HeartHandshake",
    color: "#F43F5E",
    sortOrder: 4 
  },
  { 
    name: "Birthday", 
    slug: "birthday", 
    description: "Celebrate in style with venue, entertainment, and catering",
    icon: "Cake",
    color: "#F59E0B",
    sortOrder: 5 
  },
  { 
    name: "Corporate", 
    slug: "corporate", 
    description: "Professional events, conferences, and team building",
    icon: "Briefcase",
    color: "#6366F1",
    sortOrder: 6 
  },
  { 
    name: "Boys Trip", 
    slug: "boys-trip", 
    description: "Epic adventures, sports, and nightlife for the guys",
    icon: "Users",
    color: "#10B981",
    sortOrder: 7 
  },
  { 
    name: "Girls Trip", 
    slug: "girls-trip", 
    description: "Spa, shopping, dining, and unforgettable experiences",
    icon: "Sparkles",
    color: "#EC4899",
    sortOrder: 8 
  },
  { 
    name: "Date Night", 
    slug: "date-night", 
    description: "Plan a romantic evening with dining and entertainment",
    icon: "Heart",
    color: "#F43F5E",
    sortOrder: 9 
  },
  { 
    name: "Corporate Events", 
    slug: "corporate-events", 
    description: "Professional events, conferences, and team building",
    icon: "Briefcase",
    color: "#475569",
    sortOrder: 10 
  },
  { 
    name: "Reunions", 
    slug: "reunions", 
    description: "Bring family, friends, or classmates together",
    icon: "Users",
    color: "#6366F1",
    sortOrder: 11 
  },
  { 
    name: "Wedding Anniversaries", 
    slug: "wedding-anniversaries", 
    description: "Celebrate your love with a memorable anniversary",
    icon: "Heart",
    color: "#F43F5E",
    sortOrder: 12 
  },
  { 
    name: "Retreats", 
    slug: "retreats", 
    description: "Wellness, yoga, meditation, and rejuvenation",
    icon: "Mountain",
    color: "#10B981",
    sortOrder: 13 
  },
  { 
    name: "Baby Shower", 
    slug: "baby-shower", 
    description: "Celebrate the upcoming arrival with style",
    icon: "Baby",
    color: "#38BDF8",
    sortOrder: 14 
  },
  { 
    name: "Graduation Party", 
    slug: "graduation-party", 
    description: "Honor academic achievements with a celebration",
    icon: "GraduationCap",
    color: "#F59E0B",
    sortOrder: 15 
  },
  { 
    name: "Engagement Party", 
    slug: "engagement-party", 
    description: "Celebrate the happy couple's engagement",
    icon: "Diamond",
    color: "#D946EF",
    sortOrder: 16 
  },
  { 
    name: "Housewarming Party", 
    slug: "housewarming-party", 
    description: "Welcome friends and family to your new home",
    icon: "Home",
    color: "#14B8A6",
    sortOrder: 17 
  },
  { 
    name: "Retirement Party", 
    slug: "retirement-party", 
    description: "Honor a career well-lived with a celebration",
    icon: "PartyPopper",
    color: "#8B5CF6",
    sortOrder: 18 
  },
  { 
    name: "Career Achievement Party", 
    slug: "career-achievement-party", 
    description: "Celebrate promotions, milestones, and achievements",
    icon: "Trophy",
    color: "#EAB308",
    sortOrder: 19 
  },
  { 
    name: "Farewell Party", 
    slug: "farewell-party", 
    description: "Say goodbye in style with a memorable sendoff",
    icon: "HandHeart",
    color: "#06B6D4",
    sortOrder: 20 
  },
  { 
    name: "Holiday Party", 
    slug: "holiday-party", 
    description: "Celebrate the season with festive gatherings",
    icon: "TreePine",
    color: "#16A34A",
    sortOrder: 21 
  },
];

const templateSteps: Record<string, Array<{ stepNumber: number; name: string; description: string; icon: string; isRequired: boolean }>> = {
  "travel": [
    { stepNumber: 1, name: "Basics", description: "Destination, dates, travelers, budget", icon: "MapPin", isRequired: true },
    { stepNumber: 2, name: "Activities", description: "Tours, attractions, experiences", icon: "Compass", isRequired: false },
    { stepNumber: 3, name: "Hotels", description: "Accommodation options", icon: "Building", isRequired: false },
    { stepNumber: 4, name: "Services", description: "Transportation, guides, extras", icon: "Car", isRequired: false },
    { stepNumber: 5, name: "Review", description: "Full itinerary with map and timeline", icon: "CheckCircle", isRequired: true },
  ],
  "wedding": [
    { stepNumber: 1, name: "Basics", description: "Date, guest count, budget, style/theme", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Ceremony and reception location", icon: "Building", isRequired: true },
    { stepNumber: 3, name: "Catering", description: "Menu style, dietary needs, bar options", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 4, name: "Photography", description: "Photo and video packages", icon: "Camera", isRequired: false },
    { stepNumber: 5, name: "Flowers", description: "Bouquets, centerpieces, arrangements", icon: "Flower", isRequired: false },
    { stepNumber: 6, name: "Music", description: "DJ, band, ceremony music", icon: "Music", isRequired: false },
    { stepNumber: 7, name: "Decor", description: "Lighting, table settings, signage", icon: "Lightbulb", isRequired: false },
    { stepNumber: 8, name: "Cake", description: "Wedding cake selection", icon: "Cake", isRequired: false },
    { stepNumber: 9, name: "Hair & Makeup", description: "Bridal beauty services", icon: "Sparkles", isRequired: false },
    { stepNumber: 10, name: "Officiant", description: "Ceremony officiant", icon: "User", isRequired: false },
    { stepNumber: 11, name: "Transportation", description: "Guest and couple transportation", icon: "Car", isRequired: false },
    { stepNumber: 12, name: "Accommodation", description: "Guest lodging options", icon: "Hotel", isRequired: false },
    { stepNumber: 13, name: "Invitations", description: "Stationery and invitations", icon: "Mail", isRequired: false },
    { stepNumber: 14, name: "Review", description: "Full wedding plan with vendor map", icon: "CheckCircle", isRequired: true },
  ],
  "proposal": [
    { stepNumber: 1, name: "Basics", description: "Date, location preference, budget, style", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Beach, restaurant, rooftop, private location", icon: "MapPin", isRequired: true },
    { stepNumber: 3, name: "Ambiance", description: "Flowers, candles, rose petals, balloons", icon: "Flower", isRequired: false },
    { stepNumber: 4, name: "Photography", description: "Capture the moment", icon: "Camera", isRequired: false },
    { stepNumber: 5, name: "Music", description: "Live musician or speaker setup", icon: "Music", isRequired: false },
    { stepNumber: 6, name: "Lighting", description: "Romantic lighting and ambiance", icon: "Lightbulb", isRequired: false },
    { stepNumber: 7, name: "Special Touches", description: "Ring presentation, personalized details", icon: "Diamond", isRequired: false },
    { stepNumber: 8, name: "Celebration", description: "Champagne, dinner reservation", icon: "Wine", isRequired: false },
    { stepNumber: 9, name: "Transportation", description: "Arrival and departure logistics", icon: "Car", isRequired: false },
    { stepNumber: 10, name: "Backup Plan", description: "Weather contingency", icon: "Cloud", isRequired: false },
    { stepNumber: 11, name: "Review", description: "Full proposal setup with location map", icon: "CheckCircle", isRequired: true },
  ],
  "romance": [
    { stepNumber: 1, name: "Basics", description: "Dates, occasion, budget, preferences", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Dining", description: "Romantic restaurants, private chef, picnic", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 3, name: "Stay", description: "Boutique hotels, suites, villas", icon: "Hotel", isRequired: false },
    { stepNumber: 4, name: "Activities", description: "Couples massage, sunset cruise, wine tasting", icon: "Heart", isRequired: false },
    { stepNumber: 5, name: "Spa", description: "Wellness and relaxation", icon: "Sparkles", isRequired: false },
    { stepNumber: 6, name: "Extras", description: "Flowers delivery, room decoration", icon: "Gift", isRequired: false },
    { stepNumber: 7, name: "Review", description: "Full romantic getaway with map and timeline", icon: "CheckCircle", isRequired: true },
  ],
  "birthday": [
    { stepNumber: 1, name: "Basics", description: "Date, age/milestone, guest count, budget, theme", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Party location selection", icon: "Building", isRequired: true },
    { stepNumber: 3, name: "Entertainment", description: "DJ, band, performers, games", icon: "Music", isRequired: false },
    { stepNumber: 4, name: "Catering", description: "Food, cake, drinks", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 5, name: "Cake", description: "Birthday cake selection", icon: "Cake", isRequired: false },
    { stepNumber: 6, name: "Decor", description: "Balloons, banners, table setup", icon: "PartyPopper", isRequired: false },
    { stepNumber: 7, name: "Photography", description: "Event photographer", icon: "Camera", isRequired: false },
    { stepNumber: 8, name: "Party Favors", description: "Gifts and takeaways", icon: "Gift", isRequired: false },
    { stepNumber: 9, name: "Review", description: "Full party plan with venue map", icon: "CheckCircle", isRequired: true },
  ],
  "corporate": [
    { stepNumber: 1, name: "Basics", description: "Event type, date, attendees, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Conference rooms, hotels, unique spaces", icon: "Building", isRequired: true },
    { stepNumber: 3, name: "Catering", description: "Meals, coffee breaks, dietary accommodations", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 4, name: "A/V Equipment", description: "Projectors, mics, staging, tech support", icon: "Monitor", isRequired: false },
    { stepNumber: 5, name: "Transportation", description: "Airport transfers, shuttles", icon: "Car", isRequired: false },
    { stepNumber: 6, name: "Accommodation", description: "Group hotel blocks", icon: "Hotel", isRequired: false },
    { stepNumber: 7, name: "Team Building", description: "Activities and experiences", icon: "Users", isRequired: false },
    { stepNumber: 8, name: "Review", description: "Full event plan with logistics map", icon: "CheckCircle", isRequired: true },
  ],
  "boys-trip": [
    { stepNumber: 1, name: "Basics", description: "Destination, dates, group size, budget, vibe", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Stay", description: "Hotels, Airbnb, villa", icon: "Hotel", isRequired: false },
    { stepNumber: 3, name: "Activities", description: "Sports, golf, fishing, outdoor adventures", icon: "Dumbbell", isRequired: false },
    { stepNumber: 4, name: "Nightlife", description: "Clubs, bars, VIP experiences", icon: "Wine", isRequired: false },
    { stepNumber: 5, name: "Dining", description: "Restaurants, BBQ, group meals", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 6, name: "Transportation", description: "Car rental, party bus", icon: "Car", isRequired: false },
    { stepNumber: 7, name: "Review", description: "Full trip with map and activity schedule", icon: "CheckCircle", isRequired: true },
  ],
  "girls-trip": [
    { stepNumber: 1, name: "Basics", description: "Destination, dates, group size, budget, vibe", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Stay", description: "Boutique hotels, resorts, villas", icon: "Hotel", isRequired: false },
    { stepNumber: 3, name: "Wellness", description: "Spa day, yoga, fitness classes", icon: "Sparkles", isRequired: false },
    { stepNumber: 4, name: "Dining", description: "Brunch spots, wine bars, fine dining", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 5, name: "Shopping", description: "Retail therapy, markets, boutiques", icon: "ShoppingBag", isRequired: false },
    { stepNumber: 6, name: "Activities", description: "Tours, beach, wine tasting", icon: "Compass", isRequired: false },
    { stepNumber: 7, name: "Review", description: "Full trip with map and activity schedule", icon: "CheckCircle", isRequired: true },
  ],
  "date-night": [
    { stepNumber: 1, name: "Basics", description: "Date, location, budget, preferences", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Dining", description: "Romantic restaurants, rooftop bars", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 3, name: "Entertainment", description: "Shows, concerts, experiences", icon: "Music", isRequired: false },
    { stepNumber: 4, name: "Activities", description: "Dancing, games, unique experiences", icon: "Heart", isRequired: false },
    { stepNumber: 5, name: "Review", description: "Full date plan with schedule", icon: "CheckCircle", isRequired: true },
  ],
  "corporate-events": [
    { stepNumber: 1, name: "Basics", description: "Event type, date, attendees, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Conference rooms, hotels, unique spaces", icon: "Building", isRequired: true },
    { stepNumber: 3, name: "Catering", description: "Meals, coffee breaks, dietary accommodations", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 4, name: "A/V Equipment", description: "Projectors, mics, staging, tech support", icon: "Monitor", isRequired: false },
    { stepNumber: 5, name: "Team Building", description: "Activities and experiences", icon: "Users", isRequired: false },
    { stepNumber: 6, name: "Review", description: "Full event plan with logistics", icon: "CheckCircle", isRequired: true },
  ],
  "reunions": [
    { stepNumber: 1, name: "Basics", description: "Date, group size, occasion, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Parks, halls, restaurants", icon: "Building", isRequired: true },
    { stepNumber: 3, name: "Catering", description: "Food and beverages", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 4, name: "Activities", description: "Games, entertainment", icon: "Compass", isRequired: false },
    { stepNumber: 5, name: "Review", description: "Full reunion plan", icon: "CheckCircle", isRequired: true },
  ],
  "wedding-anniversaries": [
    { stepNumber: 1, name: "Basics", description: "Anniversary date, milestone, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Dining", description: "Romantic restaurants, private chef", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 3, name: "Venue", description: "Celebration location", icon: "Building", isRequired: false },
    { stepNumber: 4, name: "Photography", description: "Capture the moment", icon: "Camera", isRequired: false },
    { stepNumber: 5, name: "Review", description: "Full anniversary plan", icon: "CheckCircle", isRequired: true },
  ],
  "retreats": [
    { stepNumber: 1, name: "Basics", description: "Dates, group size, focus, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Accommodation", description: "Retreat centers, resorts", icon: "Hotel", isRequired: true },
    { stepNumber: 3, name: "Wellness", description: "Yoga, meditation, spa", icon: "Sparkles", isRequired: false },
    { stepNumber: 4, name: "Activities", description: "Workshops, nature activities", icon: "Compass", isRequired: false },
    { stepNumber: 5, name: "Catering", description: "Healthy meals, dietary needs", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 6, name: "Review", description: "Full retreat schedule", icon: "CheckCircle", isRequired: true },
  ],
  "baby-shower": [
    { stepNumber: 1, name: "Basics", description: "Date, guest count, theme, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Party location", icon: "Building", isRequired: true },
    { stepNumber: 3, name: "Catering", description: "Food and cake", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 4, name: "Decorations", description: "Theme decorations", icon: "PartyPopper", isRequired: false },
    { stepNumber: 5, name: "Games", description: "Shower games and activities", icon: "Compass", isRequired: false },
    { stepNumber: 6, name: "Review", description: "Full party plan", icon: "CheckCircle", isRequired: true },
  ],
  "graduation-party": [
    { stepNumber: 1, name: "Basics", description: "Date, graduate info, guest count, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Party location", icon: "Building", isRequired: true },
    { stepNumber: 3, name: "Catering", description: "Food and beverages", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 4, name: "Decorations", description: "Theme and school colors", icon: "PartyPopper", isRequired: false },
    { stepNumber: 5, name: "Entertainment", description: "DJ, photo booth", icon: "Music", isRequired: false },
    { stepNumber: 6, name: "Review", description: "Full party plan", icon: "CheckCircle", isRequired: true },
  ],
  "engagement-party": [
    { stepNumber: 1, name: "Basics", description: "Date, guest count, style, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Party location", icon: "Building", isRequired: true },
    { stepNumber: 3, name: "Catering", description: "Food and drinks", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 4, name: "Photography", description: "Engagement photos", icon: "Camera", isRequired: false },
    { stepNumber: 5, name: "Entertainment", description: "Music, toasts", icon: "Music", isRequired: false },
    { stepNumber: 6, name: "Review", description: "Full party plan", icon: "CheckCircle", isRequired: true },
  ],
  "housewarming-party": [
    { stepNumber: 1, name: "Basics", description: "Date, guest count, style, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Catering", description: "Food and drinks", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 3, name: "Decorations", description: "Party decorations", icon: "PartyPopper", isRequired: false },
    { stepNumber: 4, name: "Entertainment", description: "Music, activities", icon: "Music", isRequired: false },
    { stepNumber: 5, name: "Review", description: "Full party plan", icon: "CheckCircle", isRequired: true },
  ],
  "retirement-party": [
    { stepNumber: 1, name: "Basics", description: "Date, honoree, guest count, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Party location", icon: "Building", isRequired: true },
    { stepNumber: 3, name: "Catering", description: "Food and cake", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 4, name: "Entertainment", description: "Speeches, music", icon: "Music", isRequired: false },
    { stepNumber: 5, name: "Decorations", description: "Career-themed decor", icon: "PartyPopper", isRequired: false },
    { stepNumber: 6, name: "Review", description: "Full party plan", icon: "CheckCircle", isRequired: true },
  ],
  "career-achievement-party": [
    { stepNumber: 1, name: "Basics", description: "Date, achievement type, guest count, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Celebration location", icon: "Building", isRequired: true },
    { stepNumber: 3, name: "Catering", description: "Food and drinks", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 4, name: "A/V", description: "Presentation equipment", icon: "Monitor", isRequired: false },
    { stepNumber: 5, name: "Entertainment", description: "Speeches, music", icon: "Music", isRequired: false },
    { stepNumber: 6, name: "Review", description: "Full event plan", icon: "CheckCircle", isRequired: true },
  ],
  "farewell-party": [
    { stepNumber: 1, name: "Basics", description: "Date, honoree, guest count, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Party location", icon: "Building", isRequired: true },
    { stepNumber: 3, name: "Catering", description: "Food and drinks", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 4, name: "Entertainment", description: "Speeches, memories", icon: "Music", isRequired: false },
    { stepNumber: 5, name: "Review", description: "Full party plan", icon: "CheckCircle", isRequired: true },
  ],
  "holiday-party": [
    { stepNumber: 1, name: "Basics", description: "Holiday, date, guest count, budget", icon: "Calendar", isRequired: true },
    { stepNumber: 2, name: "Venue", description: "Party location", icon: "Building", isRequired: true },
    { stepNumber: 3, name: "Catering", description: "Holiday food and drinks", icon: "UtensilsCrossed", isRequired: false },
    { stepNumber: 4, name: "Decorations", description: "Seasonal decorations", icon: "TreePine", isRequired: false },
    { stepNumber: 5, name: "Entertainment", description: "Music, games, activities", icon: "Music", isRequired: false },
    { stepNumber: 6, name: "Review", description: "Full party plan", icon: "CheckCircle", isRequired: true },
  ],
};

export async function seedExperienceTypes(): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;

  for (const expType of coreExperienceTypes) {
    const exists = await db.select().from(experienceTypes)
      .where(eq(experienceTypes.slug, expType.slug))
      .then(r => r[0]);
    
    if (!exists) {
      const [inserted] = await db.insert(experienceTypes).values({
        name: expType.name,
        slug: expType.slug,
        description: expType.description,
        icon: expType.icon,
        color: expType.color,
        sortOrder: expType.sortOrder,
      }).returning();
      
      const steps = templateSteps[expType.slug];
      if (steps && inserted) {
        for (const step of steps) {
          await db.insert(experienceTemplateSteps).values({
            experienceTypeId: inserted.id,
            stepNumber: step.stepNumber,
            name: step.name,
            description: step.description,
            icon: step.icon,
            isRequired: step.isRequired,
          });
        }
      }
      
      created++;
      console.log(`Created experience type: ${expType.name} with ${steps?.length || 0} steps`);
    } else {
      existing++;
    }
  }

  console.log(`Experience types seed complete: ${created} created, ${existing} already existed`);
  return { created, existing };
}
