import { db } from "./db";
import { expertServiceCategories, expertServiceOfferings } from "@shared/schema";
import { eq } from "drizzle-orm";

const expertServiceData = [
  {
    name: "Itinerary Planning",
    sortOrder: 1,
    subServices: [
      { name: "Quick Destination Overview (2-4 Days)", price: "15", description: "Get a concise overview of your chosen destination, including top attractions, dining options, and essential travel tips for a short trip." },
      { name: "Short Trip Planning (3-5 Days)", price: "15", description: "Get a concise overview of your chosen destination, including top attractions, dining options, and essential travel tips for a short trip." },
      { name: "Standard Trip Planning (6-9 Days)", price: "15", description: "Get a concise overview of your chosen destination, including top attractions, dining options, and essential travel tips for a short trip." },
      { name: "Extended Trip Planning (10-14 Days)", price: "15", description: "Get a concise overview of your chosen destination, including top attractions, dining options, and essential travel tips for a short trip." },
    ],
  },
  {
    name: "Customized Travel Experiences",
    sortOrder: 2,
    subServices: [
      { name: "Adventure Travel Itinerary", price: "25", description: "Tailored itineraries for adventure seekers, including activities like hiking, rafting, and wildlife safaris." },
      { name: "Cultural Immersion Itinerary", price: "25", description: "Experience the local culture with visits to historical sites, traditional markets, and cultural performances." },
      { name: "Luxury Travel Itinerary", price: "25", description: "Indulge in luxury with high-end accommodations, fine dining, and exclusive experiences." },
      { name: "Family-Friendly Itinerary", price: "25", description: "Plan a trip that caters to all ages with family-friendly activities and accommodations." },
    ],
  },
  {
    name: "Specialized Travel Planning",
    sortOrder: 3,
    subServices: [
      { name: "Honeymoon Itinerary", price: "30", description: "Romantic getaways with special activities and accommodations for newlyweds." },
      { name: "Solo Travel Itinerary", price: "30", description: "Itineraries designed for solo travelers, focusing on safety, social opportunities, and personal growth." },
      { name: "Group Travel Itinerary", price: "30", description: "Coordinated plans for group travel, including group activities and accommodations." },
      { name: "Wellness Retreat Itinerary", price: "30", description: "Focus on relaxation and rejuvenation with spa visits, yoga sessions, and healthy dining options." },
    ],
  },
  {
    name: "Seasonal and Event-Based Planning",
    sortOrder: 4,
    subServices: [
      { name: "Holiday Season Itinerary", price: "20", description: "Plan trips around major holidays with festive activities and events." },
      { name: "Festival and Event Itinerary", price: "20", description: "Experience local festivals and events with tailored itineraries." },
      { name: "Off-Season Travel Itinerary", price: "20", description: "Discover destinations during off-peak times for a unique experience and fewer crowds." },
      { name: "Seasonal Activity Itinerary", price: "20", description: "Plan trips around seasonal activities like skiing in winter or beach vacations in summer." },
    ],
  },
  {
    name: "Budget Travel Planning",
    sortOrder: 5,
    subServices: [
      { name: "Backpacking Itinerary", price: "10", description: "Affordable travel plans for backpackers, including budget accommodations and low-cost activities." },
      { name: "Budget City Break Itinerary", price: "10", description: "Cost-effective city break itineraries focusing on free or low-cost attractions." },
      { name: "Economical Road Trip Itinerary", price: "10", description: "Plan a budget-friendly road trip with affordable lodging and dining options." },
      { name: "Affordable Family Vacation Itinerary", price: "10", description: "Family vacation plans that maximize fun while minimizing costs." },
    ],
  },
  {
    name: "Adventure & Outdoor Travel Planning",
    sortOrder: 6,
    subServices: [
      { name: "Extreme Sports Itinerary", price: "35", description: "Itineraries for thrill-seekers looking to engage in extreme sports like skydiving, bungee jumping, and paragliding." },
      { name: "Nature Exploration Itinerary", price: "35", description: "Explore natural wonders with hiking, camping, and wildlife observation activities." },
      { name: "Water Adventure Itinerary", price: "35", description: "Plan trips centered around water activities such as scuba diving, snorkeling, and kayaking." },
      { name: "Mountain Adventure Itinerary", price: "35", description: "Experience mountain adventures with trekking, climbing, and skiing options." },
    ],
  },
  {
    name: "Photography & Content Creation Travel Planning",
    sortOrder: 7,
    subServices: [
      { name: "Photography-Focused Itinerary", price: "40", description: "Itineraries designed for photographers, highlighting scenic locations and optimal times for photography." },
      { name: "Social Media Content Creation Itinerary", price: "40", description: "Plan trips that provide ample opportunities for creating engaging social media content." },
      { name: "Vlogging Travel Itinerary", price: "40", description: "Itineraries tailored for vloggers, focusing on visually appealing locations and unique experiences." },
      { name: "Cinematic Travel Itinerary", price: "40", description: "Create cinematic travel experiences with itineraries that emphasize storytelling and visual impact." },
    ],
  },
];

export async function seedExpertServices() {
  console.log("Seeding expert service categories and offerings...");

  for (const category of expertServiceData) {
    // Check if category exists
    const existingCategory = await db
      .select()
      .from(expertServiceCategories)
      .where(eq(expertServiceCategories.name, category.name))
      .limit(1);

    let categoryId: string;

    if (existingCategory.length > 0) {
      console.log(`Category exists: ${category.name}`);
      categoryId = existingCategory[0].id;
    } else {
      const [newCategory] = await db
        .insert(expertServiceCategories)
        .values({
          name: category.name,
          isDefault: true,
          sortOrder: category.sortOrder,
        })
        .returning();
      console.log(`Created category: ${category.name}`);
      categoryId = newCategory.id;
    }

    // Insert sub-services
    for (let i = 0; i < category.subServices.length; i++) {
      const service = category.subServices[i];
      
      const existingService = await db
        .select()
        .from(expertServiceOfferings)
        .where(eq(expertServiceOfferings.name, service.name))
        .limit(1);

      if (existingService.length > 0) {
        console.log(`  → Service exists: ${service.name}`);
      } else {
        await db.insert(expertServiceOfferings).values({
          categoryId,
          name: service.name,
          description: service.description,
          price: service.price,
          isDefault: true,
          sortOrder: i + 1,
        });
        console.log(`  → Created service: ${service.name}`);
      }
    }
  }

  console.log("Expert service categories and offerings seeding complete.");
}
