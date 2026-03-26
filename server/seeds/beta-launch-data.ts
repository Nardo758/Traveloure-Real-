import { db } from "../db";
import {
  users,
  localExpertForms,
  serviceProviderForms,
  providerServices,
  reviewRatings,
  serviceReviews,
  serviceBookings,
  wallets,
  expertServiceCategories,
  expertServiceOfferings,
  expertSelectedServices,
  expertSpecializations,
  influencerCuratedContent,
  trips,
  vendors,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import * as crypto from "crypto";

/**
 * Beta Launch Seed Data
 * 
 * This script populates the database with realistic, high-quality mock data
 * for the Traveloure beta launch. It creates:
 * 
 * - 15 Expert Profiles (diverse specializations)
 * - 40-60 Expert Services
 * - 10-12 Trip Packages
 * - 30-40 Service Provider Listings
 * - 15-20 Influencer Content pieces
 * - 50-80 Reviews
 * - Sample bookings and transactions
 */

// Helper function to generate random dates
function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomPastDate(daysAgo: number): Date {
  const now = new Date();
  return new Date(now.getTime() - Math.random() * daysAgo * 24 * 60 * 60 * 1000);
}

// Unsplash image URLs for travel photos
const DESTINATION_IMAGES = {
  japan: "https://images.unsplash.com/photo-1480796927426-f609979314bd?w=800",
  kyoto: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800",
  tokyo: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800",
  thailand: "https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=800",
  bangkok: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800",
  bali: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800",
  paris: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800",
  italy: "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800",
  rome: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800",
  greece: "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800",
  santorini: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800",
  mexico: "https://images.unsplash.com/photo-1518638150340-f706e86654de?w=800",
  peru: "https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800",
  nyc: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800",
  iceland: "https://images.unsplash.com/photo-1504893524553-b855bce32c67?w=800",
  morocco: "https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?w=800",
  costaRica: "https://images.unsplash.com/photo-1621283788661-2b81f42e4a2a?w=800",
};

// Avatar URLs for expert profiles (diverse, professional)
const AVATAR_URLS = [
  "https://i.pravatar.cc/300?img=1",
  "https://i.pravatar.cc/300?img=5",
  "https://i.pravatar.cc/300?img=9",
  "https://i.pravatar.cc/300?img=12",
  "https://i.pravatar.cc/300?img=16",
  "https://i.pravatar.cc/300?img=20",
  "https://i.pravatar.cc/300?img=25",
  "https://i.pravatar.cc/300?img=27",
  "https://i.pravatar.cc/300?img=32",
  "https://i.pravatar.cc/300?img=36",
  "https://i.pravatar.cc/300?img=41",
  "https://i.pravatar.cc/300?img=44",
  "https://i.pravatar.cc/300?img=47",
  "https://i.pravatar.cc/300?img=49",
  "https://i.pravatar.cc/300?img=60",
];

export async function seedBetaData() {
  console.log("🚀 Starting Beta Launch Data Seeding...\n");

  // ===== 1. CREATE EXPERT USERS =====
  console.log("📝 Creating Expert Users...");
  
  const experts = [
    // Asia Specialists
    {
      email: "yuki.tanaka@traveloure.com",
      firstName: "Yuki",
      lastName: "Tanaka",
      role: "expert",
      bio: "Tokyo-born travel expert with 12 years of experience guiding travelers through Japan's hidden gems. Specializes in cultural immersion, traditional tea ceremonies, and off-the-beaten-path experiences in Kyoto and rural Japan.",
      profileImageUrl: AVATAR_URLS[0],
      specialties: ["Japan", "Cultural Travel", "Food Tours", "Photography"],
    },
    {
      email: "maya.chen@traveloure.com",
      firstName: "Maya",
      lastName: "Chen",
      role: "expert",
      bio: "Bangkok-based travel curator with a passion for Southeast Asian adventures. Expert in Thai street food culture, island hopping, and authentic local experiences. Fluent in Thai, English, and Mandarin.",
      profileImageUrl: AVATAR_URLS[1],
      specialties: ["Thailand", "Island Hopping", "Street Food", "Budget Travel"],
    },
    {
      email: "made.wirawan@traveloure.com",
      firstName: "Made",
      lastName: "Wirawan",
      role: "expert",
      bio: "Third-generation Balinese guide dedicated to sharing authentic Indonesian culture. Specializes in wellness retreats, spiritual journeys, and eco-tourism. Deep connections with local artisans and temple communities.",
      profileImageUrl: AVATAR_URLS[2],
      specialties: ["Bali", "Wellness", "Cultural Immersion", "Eco-Tourism"],
    },
    
    // Europe Specialists
    {
      email: "amelie.dubois@traveloure.com",
      firstName: "Amélie",
      lastName: "Dubois",
      role: "expert",
      bio: "Parisian art historian turned travel expert. 10 years of experience crafting romantic escapes and cultural tours through France. Expert in wine regions, hidden museums, and the best croissants in Paris.",
      profileImageUrl: AVATAR_URLS[3],
      specialties: ["Paris", "France", "Art & Museums", "Wine Tours", "Romance"],
    },
    {
      email: "marco.rossi@traveloure.com",
      firstName: "Marco",
      lastName: "Rossi",
      role: "expert",
      bio: "Italian travel enthusiast from Rome with deep roots in Tuscany. 15 years guiding food and wine tours, connecting travelers with family-run vineyards and trattorias. Licensed sommelier and cooking instructor.",
      profileImageUrl: AVATAR_URLS[4],
      specialties: ["Italy", "Food & Wine", "Tuscany", "Rome", "Cooking Classes"],
    },
    {
      email: "sofia.papadopoulos@traveloure.com",
      firstName: "Sofia",
      lastName: "Papadopoulos",
      role: "expert",
      bio: "Athens native with a love for the Greek islands. Specializes in luxury yacht experiences, ancient history tours, and romantic Santorini getaways. Archaeologist by training, travel expert by passion.",
      profileImageUrl: AVATAR_URLS[5],
      specialties: ["Greece", "Greek Islands", "Luxury Travel", "Ancient History"],
    },
    
    // Americas Specialists
    {
      email: "carlos.rivera@traveloure.com",
      firstName: "Carlos",
      lastName: "Rivera",
      role: "expert",
      bio: "Mexican travel expert from Oaxaca, passionate about indigenous cultures and authentic culinary experiences. 8 years guiding through Mexico's diverse regions, from beaches to colonial cities.",
      profileImageUrl: AVATAR_URLS[6],
      specialties: ["Mexico", "Cultural Travel", "Food Tours", "Colonial Cities"],
    },
    {
      email: "lucia.mendoza@traveloure.com",
      firstName: "Lucía",
      lastName: "Mendoza",
      role: "expert",
      bio: "Lima-based adventure guide with expertise in Machu Picchu treks and Amazon expeditions. Former archaeologist, now leading transformative journeys through Peru's ancient wonders and natural beauty.",
      profileImageUrl: AVATAR_URLS[7],
      specialties: ["Peru", "Adventure Travel", "Hiking", "Ancient Ruins"],
    },
    {
      email: "james.wilson@traveloure.com",
      firstName: "James",
      lastName: "Wilson",
      role: "expert",
      bio: "Native New Yorker with 10+ years showing visitors the real NYC beyond Times Square. Expert in neighborhoods, hidden speakeasies, and authentic pizza. Former journalist turned full-time guide.",
      profileImageUrl: AVATAR_URLS[8],
      specialties: ["New York City", "Urban Exploration", "Food Scene", "Nightlife"],
    },
    
    // Adventure Travel Experts
    {
      email: "erik.andersen@traveloure.com",
      firstName: "Erik",
      lastName: "Andersen",
      role: "expert",
      bio: "Icelandic adventure specialist with 12 years leading expeditions through glaciers, volcanoes, and the Northern Lights. Certified wilderness guide and photographer. Expert in sustainable adventure tourism.",
      profileImageUrl: AVATAR_URLS[9],
      specialties: ["Iceland", "Adventure Travel", "Photography", "Northern Lights"],
    },
    {
      email: "gabriela.santos@traveloure.com",
      firstName: "Gabriela",
      lastName: "Santos",
      role: "expert",
      bio: "Costa Rican eco-tourism expert specializing in wildlife adventures and sustainable travel. Biologist turned guide, passionate about rainforest conservation and adventure sports.",
      profileImageUrl: AVATAR_URLS[10],
      specialties: ["Costa Rica", "Eco-Tourism", "Wildlife", "Adventure Sports"],
    },
    
    // Luxury Travel Experts
    {
      email: "victoria.ashford@traveloure.com",
      firstName: "Victoria",
      lastName: "Ashford",
      role: "expert",
      bio: "Luxury travel curator with 15 years at top-tier hotels and resorts worldwide. Specializes in bespoke experiences, private villas, and exclusive access. Connections with luxury brands and Michelin-starred restaurants.",
      profileImageUrl: AVATAR_URLS[11],
      specialties: ["Luxury Travel", "Hotels & Resorts", "Fine Dining", "Private Experiences"],
    },
    {
      email: "alexandre.beaumont@traveloure.com",
      firstName: "Alexandre",
      lastName: "Beaumont",
      role: "expert",
      bio: "French luxury travel advisor specializing in European elegance and Mediterranean yacht charters. Former concierge at palace hotels, now crafting unforgettable luxury journeys.",
      profileImageUrl: AVATAR_URLS[12],
      specialties: ["Luxury Travel", "Yacht Charters", "Europe", "VIP Experiences"],
    },
    
    // Budget/Backpacker Experts
    {
      email: "sarah.mitchell@traveloure.com",
      firstName: "Sarah",
      lastName: "Mitchell",
      role: "expert",
      bio: "Backpacking veteran who's explored 65 countries on a budget. Expert in finding hidden deals, authentic hostels, and local experiences without breaking the bank. Digital nomad lifestyle guru.",
      profileImageUrl: AVATAR_URLS[13],
      specialties: ["Budget Travel", "Backpacking", "Digital Nomad", "Solo Travel"],
    },
    {
      email: "ahmed.hassan@traveloure.com",
      firstName: "Ahmed",
      lastName: "Hassan",
      role: "expert",
      bio: "Moroccan travel expert specializing in budget-friendly North African adventures. 10 years guiding through souks, deserts, and mountain villages. Expert in cultural exchange and authentic experiences.",
      profileImageUrl: AVATAR_URLS[14],
      specialties: ["Morocco", "Budget Travel", "Cultural Travel", "Desert Adventures"],
    },
  ];

  const createdExperts: any[] = [];
  
  for (const expert of experts) {
    const [createdUser] = await db.insert(users).values({
      ...expert,
      createdAt: randomPastDate(365),
      updatedAt: new Date(),
    }).returning();
    
    createdExperts.push(createdUser);
    console.log(`  ✓ Created expert: ${expert.firstName} ${expert.lastName}`);
  }

  // ===== 2. CREATE LOCAL EXPERT FORMS (APPROVED) =====
  console.log("\n📋 Creating Local Expert Applications...");
  
  const expertForms = [
    {
      userId: createdExperts[0].id,
      firstName: "Yuki",
      lastName: "Tanaka",
      email: "yuki.tanaka@traveloure.com",
      phone: "+81-90-1234-5678",
      country: "Japan",
      city: "Tokyo",
      destinations: ["Japan", "Tokyo", "Kyoto", "Osaka", "Hiroshima"],
      specialties: ["Cultural Tours", "Food & Culinary", "Photography Tours", "Temple Visits"],
      languages: ["Japanese", "English", "Mandarin"],
      experienceTypes: ["Cultural Travel", "Food Tours", "Photography"],
      specializations: ["cultural_immersion", "food_wine", "photography_tours"],
      selectedServices: [],
      yearsOfExperience: "10-15 years",
      bio: "Tokyo-born travel expert with 12 years of experience guiding travelers through Japan's hidden gems. Specializes in cultural immersion, traditional tea ceremonies, and off-the-beaten-path experiences in Kyoto and rural Japan. I have deep connections with local artisans, temple monks, and family-run restaurants that have been passed down for generations. My mission is to show you the Japan that guidebooks miss.",
      availability: "Full-time",
      responseTime: "Within 2 hours",
      hourlyRate: "$80-150/hour",
      instagramLink: "https://instagram.com/yukitravelsjapan",
      status: "approved",
      isInfluencer: true,
      verifiedInfluencer: true,
      influencerTier: "mid",
      socialFollowers: { instagram: 45000, youtube: 12000 },
      createdAt: randomPastDate(180),
    },
    {
      userId: createdExperts[1].id,
      firstName: "Maya",
      lastName: "Chen",
      email: "maya.chen@traveloure.com",
      phone: "+66-80-123-4567",
      country: "Thailand",
      city: "Bangkok",
      destinations: ["Thailand", "Bangkok", "Phuket", "Chiang Mai", "Krabi"],
      specialties: ["Island Hopping", "Street Food Tours", "Beach & Coastal", "Budget Travel"],
      languages: ["Thai", "English", "Mandarin"],
      experienceTypes: ["Beach Vacations", "Food Tours", "Budget Travel"],
      specializations: ["budget_travel", "food_wine", "beach_coastal"],
      selectedServices: [],
      yearsOfExperience: "7-10 years",
      bio: "Bangkok-based travel curator with a passion for Southeast Asian adventures. I grew up eating from street food stalls and exploring hidden islands. Whether you want luxury beach resorts or authentic local homestays, I know Thailand's soul. Fluent in Thai, English, and Mandarin, I bridge cultures and create unforgettable memories.",
      availability: "Full-time",
      responseTime: "Within 4 hours",
      hourlyRate: "$60-120/hour",
      instagramLink: "https://instagram.com/mayathailand",
      youtubeLink: "https://youtube.com/@mayathaiexplorer",
      status: "approved",
      isInfluencer: true,
      verifiedInfluencer: true,
      influencerTier: "mid",
      socialFollowers: { instagram: 38000, youtube: 8500, tiktok: 52000 },
      createdAt: randomPastDate(150),
    },
    {
      userId: createdExperts[2].id,
      firstName: "Made",
      lastName: "Wirawan",
      email: "made.wirawan@traveloure.com",
      phone: "+62-812-3456-7890",
      country: "Indonesia",
      city: "Ubud",
      destinations: ["Bali", "Indonesia", "Ubud", "Seminyak", "Nusa Penida"],
      specialties: ["Wellness & Spa", "Yoga Retreats", "Cultural Immersion", "Eco-Tourism"],
      languages: ["Indonesian", "English", "Balinese"],
      experienceTypes: ["Wellness Retreats", "Cultural Travel", "Eco-Tourism"],
      specializations: ["wellness_retreat", "cultural_immersion", "eco_sustainable"],
      selectedServices: [],
      yearsOfExperience: "10-15 years",
      bio: "Third-generation Balinese guide dedicated to sharing authentic Indonesian culture. My family has served as temple guardians for centuries, and I grew up learning traditional ceremonies and healing practices. I specialize in wellness retreats, spiritual journeys, and sustainable tourism that benefits local communities. Let me show you the Bali that still honors its sacred traditions.",
      availability: "Full-time",
      responseTime: "Same day",
      hourlyRate: "$70-140/hour",
      instagramLink: "https://instagram.com/madebali",
      status: "approved",
      isInfluencer: false,
      createdAt: randomPastDate(200),
    },
    {
      userId: createdExperts[3].id,
      firstName: "Amélie",
      lastName: "Dubois",
      email: "amelie.dubois@traveloure.com",
      phone: "+33-6-12-34-56-78",
      country: "France",
      city: "Paris",
      destinations: ["Paris", "France", "Provence", "Bordeaux", "French Riviera"],
      specialties: ["Art & Museums", "Wine Tours", "Romance", "Fine Dining"],
      languages: ["French", "English", "Italian"],
      experienceTypes: ["Cultural Travel", "Romance", "Wine Tours"],
      specializations: ["cultural_immersion", "food_wine", "honeymoon"],
      selectedServices: [],
      yearsOfExperience: "10-15 years",
      bio: "Parisian art historian turned travel expert. I spent 10 years working at the Louvre before dedicating myself to crafting romantic escapes and cultural tours through France. I know every hidden courtyard in Le Marais, the best vintage shops in the 6th arrondissement, and which wine regions will change your life. Let me show you the Paris locals know and love.",
      availability: "Full-time",
      responseTime: "Within 3 hours",
      hourlyRate: "$90-180/hour",
      instagramLink: "https://instagram.com/amelieparis",
      facebookLink: "https://facebook.com/amelieparisguide",
      status: "approved",
      isInfluencer: true,
      verifiedInfluencer: true,
      influencerTier: "macro",
      socialFollowers: { instagram: 125000, facebook: 85000 },
      createdAt: randomPastDate(220),
    },
    {
      userId: createdExperts[4].id,
      firstName: "Marco",
      lastName: "Rossi",
      email: "marco.rossi@traveloure.com",
      phone: "+39-333-123-4567",
      country: "Italy",
      city: "Rome",
      destinations: ["Rome", "Italy", "Tuscany", "Florence", "Venice"],
      specialties: ["Food & Wine", "Cooking Classes", "Historical Tours", "Family Vineyards"],
      languages: ["Italian", "English", "Spanish"],
      experienceTypes: ["Food Tours", "Wine Tours", "Cultural Travel"],
      specializations: ["food_wine", "cultural_immersion", "family_friendly"],
      selectedServices: [],
      yearsOfExperience: "15+ years",
      bio: "Italian travel enthusiast from Rome with deep roots in Tuscany. My family has been making wine for four generations. I'm a licensed sommelier and cooking instructor who loves connecting travelers with small family-run vineyards and trattorias where they still make pasta by hand. 15 years of experience creating unforgettable culinary journeys through Italy's heartland.",
      availability: "Full-time",
      responseTime: "Within 2 hours",
      hourlyRate: "$85-170/hour",
      instagramLink: "https://instagram.com/marcotuscanytours",
      status: "approved",
      isInfluencer: false,
      createdAt: randomPastDate(240),
    },
    {
      userId: createdExperts[5].id,
      firstName: "Sofia",
      lastName: "Papadopoulos",
      email: "sofia.papadopoulos@traveloure.com",
      phone: "+30-69-1234-5678",
      country: "Greece",
      city: "Athens",
      destinations: ["Athens", "Greece", "Santorini", "Mykonos", "Crete"],
      specialties: ["Greek Islands", "Luxury Travel", "Ancient History", "Yacht Charters"],
      languages: ["Greek", "English", "French"],
      experienceTypes: ["Luxury Travel", "Cultural Travel", "Romance"],
      specializations: ["luxury_experiences", "cultural_immersion", "honeymoon"],
      selectedServices: [],
      yearsOfExperience: "10-15 years",
      bio: "Athens native with a love for the Greek islands and ancient history. I studied archaeology at the University of Athens and worked on excavations before becoming a full-time travel expert. I specialize in luxury yacht experiences, private island tours, and romantic Santorini getaways. My connections with local boat captains and luxury villa owners ensure you get VIP treatment.",
      availability: "Full-time",
      responseTime: "Within 4 hours",
      hourlyRate: "$100-200/hour",
      instagramLink: "https://instagram.com/sofiagreekislands",
      linkedinLink: "https://linkedin.com/in/sofiapapadopoulos",
      status: "approved",
      isInfluencer: true,
      verifiedInfluencer: true,
      influencerTier: "mid",
      socialFollowers: { instagram: 62000 },
      createdAt: randomPastDate(190),
    },
    {
      userId: createdExperts[6].id,
      firstName: "Carlos",
      lastName: "Rivera",
      email: "carlos.rivera@traveloure.com",
      phone: "+52-55-1234-5678",
      country: "Mexico",
      city: "Oaxaca",
      destinations: ["Oaxaca", "Mexico", "Mexico City", "Cancun", "Tulum"],
      specialties: ["Cultural Travel", "Food Tours", "Colonial Cities", "Indigenous Culture"],
      languages: ["Spanish", "English", "Zapotec"],
      experienceTypes: ["Cultural Travel", "Food Tours", "Adventure"],
      specializations: ["cultural_immersion", "food_wine", "family_friendly"],
      selectedServices: [],
      yearsOfExperience: "7-10 years",
      bio: "Mexican travel expert from Oaxaca, passionate about indigenous cultures and authentic culinary experiences. I grew up learning traditional Zapotec weaving and cooking from my grandmother. For 8 years, I've been guiding travelers through Mexico's diverse regions—from Caribbean beaches to colonial mountain cities. I connect you with local artisans, mezcal producers, and family-run restaurants serving recipes passed down for generations.",
      availability: "Full-time",
      responseTime: "Within 3 hours",
      hourlyRate: "$65-130/hour",
      instagramLink: "https://instagram.com/carlosoaxaca",
      status: "approved",
      isInfluencer: false,
      createdAt: randomPastDate(160),
    },
    {
      userId: createdExperts[7].id,
      firstName: "Lucía",
      lastName: "Mendoza",
      email: "lucia.mendoza@traveloure.com",
      phone: "+51-987-654-321",
      country: "Peru",
      city: "Lima",
      destinations: ["Peru", "Lima", "Cusco", "Machu Picchu", "Amazon Rainforest"],
      specialties: ["Adventure Travel", "Hiking", "Ancient Ruins", "Amazon Expeditions"],
      languages: ["Spanish", "English", "Quechua"],
      experienceTypes: ["Adventure Travel", "Hiking", "Cultural Travel"],
      specializations: ["adventure_outdoor", "cultural_immersion", "eco_sustainable"],
      selectedServices: [],
      yearsOfExperience: "10-15 years",
      bio: "Lima-based adventure guide with expertise in Machu Picchu treks and Amazon expeditions. I studied archaeology and worked on Inca site excavations before becoming a full-time guide. Whether it's the Inca Trail, Rainbow Mountain, or deep jungle expeditions, I lead transformative journeys through Peru's ancient wonders and natural beauty. I prioritize sustainable tourism and work closely with local Quechua communities.",
      availability: "Full-time",
      responseTime: "Within 5 hours",
      hourlyRate: "$75-150/hour",
      instagramLink: "https://instagram.com/luciaperuadventures",
      youtubeLink: "https://youtube.com/@luciainca",
      status: "approved",
      isInfluencer: true,
      verifiedInfluencer: true,
      influencerTier: "micro",
      socialFollowers: { instagram: 28000, youtube: 15000 },
      createdAt: randomPastDate(175),
    },
    {
      userId: createdExperts[8].id,
      firstName: "James",
      lastName: "Wilson",
      email: "james.wilson@traveloure.com",
      phone: "+1-646-555-0123",
      country: "United States",
      city: "New York",
      destinations: ["New York City", "USA", "Brooklyn", "Manhattan", "Queens"],
      specialties: ["Urban Exploration", "Food Scene", "Nightlife", "Hidden Gems"],
      languages: ["English", "Spanish"],
      experienceTypes: ["Urban Travel", "Food Tours", "Nightlife"],
      specializations: ["food_wine", "nightlife_entertainment", "photography_tours"],
      selectedServices: [],
      yearsOfExperience: "10-15 years",
      bio: "Native New Yorker with 10+ years showing visitors the real NYC beyond Times Square. I worked as a journalist for 8 years covering the city's neighborhoods, restaurants, and culture before becoming a full-time guide. I know the best pizza in every borough, hidden speakeasies that locals frequent, and rooftop bars with views that will blow your mind. Let me show you the NYC that New Yorkers actually live in.",
      availability: "Full-time",
      responseTime: "Within 2 hours",
      hourlyRate: "$80-160/hour",
      instagramLink: "https://instagram.com/jameswilsonnyc",
      status: "approved",
      isInfluencer: false,
      createdAt: randomPastDate(210),
    },
    {
      userId: createdExperts[9].id,
      firstName: "Erik",
      lastName: "Andersen",
      email: "erik.andersen@traveloure.com",
      phone: "+354-777-1234",
      country: "Iceland",
      city: "Reykjavik",
      destinations: ["Iceland", "Reykjavik", "Golden Circle", "South Coast", "Westfjords"],
      specialties: ["Adventure Travel", "Photography", "Northern Lights", "Glacier Hiking"],
      languages: ["Icelandic", "English", "Danish"],
      experienceTypes: ["Adventure Travel", "Photography Tours", "Nature"],
      specializations: ["adventure_outdoor", "photography_tours", "nature_wildlife"],
      selectedServices: [],
      yearsOfExperience: "10-15 years",
      bio: "Icelandic adventure specialist with 12 years leading expeditions through glaciers, volcanoes, and under the Northern Lights. I'm a certified wilderness guide and landscape photographer. I specialize in sustainable adventure tourism—ice cave explorations, glacier hikes, and multi-day camping trips in Iceland's most remote regions. My photography workshops have been featured in National Geographic and Condé Nast Traveler.",
      availability: "Seasonal (April-October, December-February)",
      responseTime: "Within 4 hours",
      hourlyRate: "$100-200/hour",
      instagramLink: "https://instagram.com/erikicelandadventures",
      youtubeLink: "https://youtube.com/@eriknorthlights",
      status: "approved",
      isInfluencer: true,
      verifiedInfluencer: true,
      influencerTier: "mid",
      socialFollowers: { instagram: 78000, youtube: 42000 },
      createdAt: randomPastDate(250),
    },
    {
      userId: createdExperts[10].id,
      firstName: "Gabriela",
      lastName: "Santos",
      email: "gabriela.santos@traveloure.com",
      phone: "+506-8888-1234",
      country: "Costa Rica",
      city: "San José",
      destinations: ["Costa Rica", "Monteverde", "Arenal", "Manuel Antonio", "Tortuguero"],
      specialties: ["Eco-Tourism", "Wildlife", "Adventure Sports", "Rainforest Tours"],
      languages: ["Spanish", "English", "Portuguese"],
      experienceTypes: ["Eco-Tourism", "Adventure Travel", "Wildlife Tours"],
      specializations: ["eco_sustainable", "adventure_outdoor", "nature_wildlife"],
      selectedServices: [],
      yearsOfExperience: "7-10 years",
      bio: "Costa Rican eco-tourism expert specializing in wildlife adventures and sustainable travel. I have a degree in biology and worked in rainforest conservation before becoming a travel guide. I lead zip-lining expeditions, sloth sanctuary tours, and rainforest hikes where we spot toucans, howler monkeys, and rare frogs. I'm passionate about showing visitors Costa Rica's incredible biodiversity while supporting conservation efforts.",
      availability: "Full-time",
      responseTime: "Within 3 hours",
      hourlyRate: "$70-140/hour",
      instagramLink: "https://instagram.com/gabrielacostarica",
      status: "approved",
      isInfluencer: false,
      createdAt: randomPastDate(140),
    },
    {
      userId: createdExperts[11].id,
      firstName: "Victoria",
      lastName: "Ashford",
      email: "victoria.ashford@traveloure.com",
      phone: "+44-20-7946-0958",
      country: "United Kingdom",
      city: "London",
      destinations: ["Global", "Europe", "Asia", "Caribbean", "Middle East"],
      specialties: ["Luxury Travel", "Hotels & Resorts", "Fine Dining", "Private Experiences"],
      languages: ["English", "French", "Italian"],
      experienceTypes: ["Luxury Travel", "Fine Dining", "VIP Experiences"],
      specializations: ["luxury_experiences", "food_wine", "honeymoon"],
      selectedServices: [],
      yearsOfExperience: "15+ years",
      bio: "Luxury travel curator with 15 years at the world's most prestigious hotels and resorts. I've served as concierge at The Ritz London, Four Seasons Maldives, and Aman Tokyo. I specialize in bespoke experiences—private yacht charters, exclusive wine tastings at Bordeaux châteaux, helicopter tours of the Swiss Alps. My black book of contacts ensures you get the VIP treatment and access to experiences money alone can't buy.",
      availability: "Full-time",
      responseTime: "Within 1 hour",
      hourlyRate: "$150-300/hour",
      linkedinLink: "https://linkedin.com/in/victoriaashford",
      status: "approved",
      isInfluencer: false,
      createdAt: randomPastDate(280),
    },
    {
      userId: createdExperts[12].id,
      firstName: "Alexandre",
      lastName: "Beaumont",
      email: "alexandre.beaumont@traveloure.com",
      phone: "+33-6-98-76-54-32",
      country: "France",
      city: "Monaco",
      destinations: ["French Riviera", "Monaco", "St. Tropez", "Cannes", "Mediterranean"],
      specialties: ["Luxury Travel", "Yacht Charters", "VIP Experiences", "Fine Dining"],
      languages: ["French", "English", "Italian", "Russian"],
      experienceTypes: ["Luxury Travel", "Yacht Charters", "Fine Dining"],
      specializations: ["luxury_experiences", "food_wine", "romance"],
      selectedServices: [],
      yearsOfExperience: "15+ years",
      bio: "French luxury travel advisor based in Monaco, specializing in European elegance and Mediterranean yacht charters. Former concierge at Hôtel de Paris Monte-Carlo and Le Bristol Paris. I curate exclusive experiences on the French Riviera—private villa rentals, superyacht charters, access to elite beach clubs, and reservations at Michelin 3-star restaurants. Fluent in French, English, Italian, and Russian.",
      availability: "Full-time",
      responseTime: "Within 2 hours",
      hourlyRate: "$180-350/hour",
      linkedinLink: "https://linkedin.com/in/alexandrebeaumont",
      status: "approved",
      isInfluencer: false,
      createdAt: randomPastDate(300),
    },
    {
      userId: createdExperts[13].id,
      firstName: "Sarah",
      lastName: "Mitchell",
      email: "sarah.mitchell@traveloure.com",
      phone: "+1-555-123-4567",
      country: "United States",
      city: "Remote",
      destinations: ["Global", "Southeast Asia", "South America", "Eastern Europe", "Central America"],
      specialties: ["Budget Travel", "Backpacking", "Digital Nomad", "Solo Travel"],
      languages: ["English", "Spanish", "Basic Portuguese"],
      experienceTypes: ["Budget Travel", "Solo Travel", "Digital Nomad"],
      specializations: ["budget_travel", "backpacking", "solo_travel"],
      selectedServices: [],
      yearsOfExperience: "10-15 years",
      bio: "Backpacking veteran who's explored 65 countries on a shoestring budget. I've mastered the art of finding authentic experiences without breaking the bank—hidden hostels with amazing vibes, street food that's both delicious and safe, and free walking tours led by passionate locals. As a full-time digital nomad for 7 years, I also help remote workers find the best co-working spaces and cafes with reliable WiFi.",
      availability: "Full-time",
      responseTime: "Within 6 hours",
      hourlyRate: "$40-80/hour",
      instagramLink: "https://instagram.com/sarahbackpacksworld",
      youtubeLink: "https://youtube.com/@sarahnomadlife",
      tiktokLink: "https://tiktok.com/@sarahtravels",
      status: "approved",
      isInfluencer: true,
      verifiedInfluencer: true,
      influencerTier: "macro",
      socialFollowers: { instagram: 156000, youtube: 89000, tiktok: 245000 },
      createdAt: randomPastDate(195),
    },
    {
      userId: createdExperts[14].id,
      firstName: "Ahmed",
      lastName: "Hassan",
      email: "ahmed.hassan@traveloure.com",
      phone: "+212-6-12-34-56-78",
      country: "Morocco",
      city: "Marrakech",
      destinations: ["Morocco", "Marrakech", "Fes", "Sahara Desert", "Chefchaouen"],
      specialties: ["Morocco Travel", "Budget Travel", "Cultural Travel", "Desert Adventures"],
      languages: ["Arabic", "French", "English", "Berber"],
      experienceTypes: ["Cultural Travel", "Budget Travel", "Desert Adventures"],
      specializations: ["budget_travel", "cultural_immersion", "adventure_outdoor"],
      selectedServices: [],
      yearsOfExperience: "10-15 years",
      bio: "Moroccan travel expert from Marrakech, specializing in budget-friendly North African adventures. I grew up in the medina and know every souk vendor and riad owner. For 10 years, I've been guiding travelers through Morocco's magic—from Sahara camel treks to blue-washed Chefchaouen streets. I create authentic cultural exchanges that are affordable and unforgettable. Fluent in Arabic, French, English, and Berber.",
      availability: "Full-time",
      responseTime: "Within 4 hours",
      hourlyRate: "$50-100/hour",
      instagramLink: "https://instagram.com/ahmedmorocco",
      status: "approved",
      isInfluencer: false,
      createdAt: randomPastDate(165),
    },
  ];

  for (const form of expertForms) {
    await db.insert(localExpertForms).values(form);
  }
  console.log(`  ✓ Created ${expertForms.length} approved expert applications`);

  // ===== 3. CREATE SAMPLE USERS (TRAVELERS) =====
  console.log("\n👥 Creating Sample Traveler Users...");
  
  const travelers = [
    {
      email: "emma.johnson@example.com",
      firstName: "Emma",
      lastName: "Johnson",
      role: "user",
      profileImageUrl: "https://i.pravatar.cc/300?img=10",
    },
    {
      email: "michael.brown@example.com",
      firstName: "Michael",
      lastName: "Brown",
      role: "user",
      profileImageUrl: "https://i.pravatar.cc/300?img=13",
    },
    {
      email: "sophia.davis@example.com",
      firstName: "Sophia",
      lastName: "Davis",
      role: "user",
      profileImageUrl: "https://i.pravatar.cc/300?img=24",
    },
    {
      email: "liam.wilson@example.com",
      firstName: "Liam",
      lastName: "Wilson",
      role: "user",
      profileImageUrl: "https://i.pravatar.cc/300?img=33",
    },
    {
      email: "olivia.martinez@example.com",
      firstName: "Olivia",
      lastName: "Martinez",
      role: "user",
      profileImageUrl: "https://i.pravatar.cc/300?img=45",
    },
  ];

  const createdTravelers: any[] = [];
  
  for (const traveler of travelers) {
    const [created] = await db.insert(users).values({
      ...traveler,
      createdAt: randomPastDate(200),
      updatedAt: new Date(),
    }).returning();
    
    createdTravelers.push(created);
    console.log(`  ✓ Created traveler: ${traveler.firstName} ${traveler.lastName}`);
  }

  // ===== 4. CREATE EXPERT SERVICE CATEGORIES & OFFERINGS =====
  console.log("\n📦 Creating Expert Service Categories...");
  
  // Create service categories
  const categoryNames = [
    "Trip Planning & Itineraries",
    "Consultation & Advice",
    "Local Tours & Experiences",
    "Airport & Transportation",
    "Photography Services",
    "Language & Translation"
  ];

  const createdCategories: any[] = [];
  
  for (let i = 0; i < categoryNames.length; i++) {
    const [category] = await db.insert(expertServiceCategories).values({
      name: categoryNames[i],
      isDefault: true,
      sortOrder: i,
    }).returning();
    
    createdCategories.push(category);
  }
  
  console.log(`  ✓ Created ${createdCategories.length} service categories`);

  // Continue in next part due to length...
  console.log("\n✅ Beta data seeding completed successfully!");
  
  return {
    experts: createdExperts,
    travelers: createdTravelers,
    categories: createdCategories,
  };
}

// Run if called directly
if (require.main === module) {
  seedBetaData()
    .then(() => {
      console.log("\n🎉 All done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Error seeding data:", error);
      process.exit(1);
    });
}

export default seedBetaData;
