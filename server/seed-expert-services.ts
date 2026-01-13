import { db } from "./db";
import { expertServiceCategories, expertServiceOfferings, expertCustomServices, users } from "@shared/schema";
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

// Mock custom services data for testing
const mockCustomServices = [
  {
    title: "Private Food Tour in Barcelona",
    description: "Experience the authentic flavors of Barcelona with a personalized culinary journey through the city's hidden gems. Includes tapas bars, local markets, and wine pairings.",
    categoryName: "Customized Travel Experiences",
    price: "150.00",
    duration: "4 hours",
    deliverables: ["4-5 food stops", "Wine pairing", "Local market visit", "Recipe booklet", "Food photography tips"],
    cancellationPolicy: "Full refund if cancelled 48 hours before. 50% refund if cancelled 24 hours before.",
    leadTime: "48 hours",
    status: "draft"
  },
  {
    title: "Sunrise Photography Workshop in Santorini",
    description: "Capture the iconic Santorini sunrise with expert guidance. Learn composition techniques and post-processing tips while visiting the most photogenic spots.",
    categoryName: "Photography & Content Creation Travel Planning",
    price: "200.00",
    duration: "3 hours",
    deliverables: ["Professional photo editing tips", "Location scouting", "Lightroom presets", "Personal portfolio review"],
    cancellationPolicy: "Full refund if cancelled 72 hours before due to weather-dependent nature.",
    leadTime: "1 week",
    status: "submitted"
  },
  {
    title: "Authentic Japanese Tea Ceremony Experience",
    description: "Immerse yourself in the traditional art of Japanese tea ceremony with a certified tea master. Learn the history, etiquette, and philosophy behind this ancient practice.",
    categoryName: "Cultural Immersion",
    price: "85.00",
    duration: "2 hours",
    deliverables: ["Traditional tea set usage", "Seasonal wagashi sweets", "Certificate of participation", "Tea ceremony guide booklet"],
    cancellationPolicy: "Non-refundable within 24 hours of scheduled time.",
    leadTime: "24 hours",
    status: "approved"
  },
  {
    title: "Mountain Biking Adventure in the Alps",
    description: "Thrilling mountain biking experience through scenic Alpine trails. Suitable for intermediate to advanced riders with breathtaking views.",
    categoryName: "Adventure & Outdoor Travel Planning",
    price: "175.00",
    duration: "6 hours",
    deliverables: ["Professional guide", "Safety equipment", "Trail lunch", "Photo memories", "Emergency support"],
    cancellationPolicy: "Weather-dependent. Full refund if cancelled due to unsafe conditions.",
    leadTime: "3 days",
    status: "approved"
  },
  {
    title: "Romantic Proposal Planning Package",
    description: "Create the perfect proposal moment with our comprehensive planning service. We handle venue, decorations, photography, and surprise elements.",
    categoryName: "Specialized Travel Planning",
    price: "500.00",
    duration: "Full day",
    deliverables: ["Venue arrangement", "Floral decorations", "Professional photographer", "Celebration dinner reservation", "Backup weather plan"],
    cancellationPolicy: "50% refund if cancelled 1 week before. Non-refundable within 72 hours.",
    leadTime: "2 weeks",
    status: "rejected",
    rejectionReason: "Price exceeds platform guidelines for this category. Please adjust pricing between $200-$400 or provide additional justification for premium pricing."
  },
  {
    title: "Local Street Art Walking Tour",
    description: "Discover hidden street art gems and learn about the stories behind the murals from a local artist guide.",
    categoryName: "Cultural Immersion",
    price: "45.00",
    duration: "2.5 hours",
    deliverables: ["Expert commentary", "Art history insights", "Photo spots", "Local cafe stop"],
    cancellationPolicy: "Free cancellation up to 24 hours before.",
    leadTime: "24 hours",
    status: "draft"
  }
];

export async function seedCustomServices() {
  console.log("Seeding mock custom services for testing...");

  // Find the first user to use as the expert (or create test data for the logged-in user)
  const existingUsers = await db.select().from(users).limit(1);
  
  if (existingUsers.length === 0) {
    console.log("No users found. Skipping custom services seed.");
    return;
  }

  const expertId = existingUsers[0].id;
  console.log(`Using user ${expertId} as expert for custom services`);

  // Check if we already have custom services for this expert
  const existingServices = await db
    .select()
    .from(expertCustomServices)
    .where(eq(expertCustomServices.expertId, expertId))
    .limit(1);

  if (existingServices.length > 0) {
    console.log("Custom services already exist for this user. Skipping seed.");
    return;
  }

  // Insert mock custom services
  for (const service of mockCustomServices) {
    await db.insert(expertCustomServices).values({
      expertId,
      title: service.title,
      description: service.description,
      categoryName: service.categoryName,
      price: service.price,
      duration: service.duration,
      deliverables: service.deliverables,
      cancellationPolicy: service.cancellationPolicy,
      leadTime: service.leadTime,
      status: service.status,
      submittedAt: service.status !== "draft" ? new Date() : null,
      reviewedAt: (service.status === "approved" || service.status === "rejected") ? new Date() : null,
      rejectionReason: (service as any).rejectionReason || null,
    });
    console.log(`  → Created custom service: ${service.title} (${service.status})`);
  }

  console.log("Mock custom services seeding complete.");
}

// Mock experts data for testing
const mockExperts = [
  {
    firstName: "Maria",
    lastName: "Santos",
    email: "maria.santos@example.com",
    bio: "Local expert specializing in authentic Portuguese experiences. 10+ years guiding travelers through hidden gems of Lisbon and the Algarve coast.",
    specialties: ["Cultural Tours", "Food & Wine", "Historical Sites", "Local Cuisine"]
  },
  {
    firstName: "Kenji",
    lastName: "Tanaka",
    email: "kenji.tanaka@example.com",
    bio: "Tokyo-based travel specialist with expertise in traditional Japanese culture, tea ceremonies, and off-the-beaten-path destinations across Japan.",
    specialties: ["Cultural Immersion", "Traditional Experiences", "Photography Tours", "Nature Exploration"]
  },
  {
    firstName: "Isabella",
    lastName: "Rossi",
    email: "isabella.rossi@example.com",
    bio: "Italian travel curator crafting bespoke experiences in Tuscany, Rome, and the Amalfi Coast. Fluent in 4 languages with connections to local artisans.",
    specialties: ["Luxury Travel", "Honeymoons", "Food & Wine", "Art & History"]
  },
  {
    firstName: "Carlos",
    lastName: "Mendez",
    email: "carlos.mendez@example.com",
    bio: "Adventure travel expert based in Costa Rica. Certified guide for rainforest expeditions, wildlife photography, and sustainable eco-tourism.",
    specialties: ["Adventure Travel", "Wildlife Tours", "Eco-Tourism", "Nature Photography"]
  },
  {
    firstName: "Sophie",
    lastName: "Laurent",
    email: "sophie.laurent@example.com",
    bio: "Paris-based luxury travel consultant specializing in romantic getaways, proposal planning, and exclusive cultural experiences across France.",
    specialties: ["Romance & Proposals", "Luxury Experiences", "Art Tours", "Fine Dining"]
  },
  {
    firstName: "Ahmed",
    lastName: "Hassan",
    email: "ahmed.hassan@example.com",
    bio: "Expert guide for Morocco and Egypt with deep knowledge of ancient history, local markets, and desert adventures. Over 15 years of experience.",
    specialties: ["Historical Tours", "Desert Adventures", "Local Markets", "Cultural Immersion"]
  },
  {
    firstName: "Emma",
    lastName: "Thompson",
    email: "emma.thompson@example.com",
    bio: "UK-based travel planner specializing in family vacations, group travel coordination, and accessible tourism across Europe.",
    specialties: ["Family Travel", "Group Coordination", "Accessible Tourism", "Budget Planning"]
  },
  {
    firstName: "Raj",
    lastName: "Patel",
    email: "raj.patel@example.com",
    bio: "India travel specialist with expertise in wellness retreats, spiritual journeys, and culinary adventures across the subcontinent.",
    specialties: ["Wellness Retreats", "Spiritual Tours", "Culinary Experiences", "Festival Planning"]
  },
  {
    firstName: "Elena",
    lastName: "Volkov",
    email: "elena.volkov@example.com",
    bio: "Adventure photographer and travel guide covering Eastern Europe and the Balkans. Expert in solo travel safety and content creation.",
    specialties: ["Solo Travel", "Photography", "Content Creation", "Off-Season Travel"]
  },
  {
    firstName: "Marcus",
    lastName: "Chen",
    email: "marcus.chen@example.com",
    bio: "Corporate travel specialist and event planner. Expert in organizing retreats, team-building trips, and executive travel across Asia-Pacific.",
    specialties: ["Corporate Events", "Team Retreats", "Executive Travel", "Event Planning"]
  }
];

export async function seedMockExperts() {
  console.log("Seeding mock experts for testing...");

  let created = 0;
  let existed = 0;

  for (const expert of mockExperts) {
    // Check if expert already exists by email
    const existingExpert = await db
      .select()
      .from(users)
      .where(eq(users.email, expert.email))
      .limit(1);

    if (existingExpert.length > 0) {
      existed++;
      continue;
    }

    // Create new expert user
    await db.insert(users).values({
      email: expert.email,
      firstName: expert.firstName,
      lastName: expert.lastName,
      role: "expert",
      bio: expert.bio,
      specialties: expert.specialties,
    });
    
    console.log(`  → Created expert: ${expert.firstName} ${expert.lastName}`);
    created++;
  }

  console.log(`Mock experts seeding complete: ${created} created, ${existed} already existed.`);
}
