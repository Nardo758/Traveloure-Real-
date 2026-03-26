#!/usr/bin/env tsx

/**
 * Traveloure Beta Launch Seed Data - Main Execution Script
 * 
 * This script coordinates all seed data creation:
 * 1. Expert users and applications
 * 2. Traveler users
 * 3. Expert services (40+ services)
 * 4. Reviews and ratings (70+)
 * 5. Sample bookings (45)
 * 6. Influencer content (15-20 pieces)
 * 
 * Run: npm run seed:beta
 * Or: tsx server/seeds/run-beta-seed.ts
 */

import { db } from "../db";
import { seedBetaData } from "./beta-launch-data";
import { seedExpertServices } from "./beta-data-extended";
import { seedReviewsAndBookings, seedInfluencerContent } from "./beta-reviews-bookings";

async function runBetaSeed() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║   TRAVELOURE BETA LAUNCH - SEED DATA GENERATION       ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");
  
  try {
    // STEP 1: Create base data (experts, travelers, categories)
    console.log("📊 STEP 1/5: Creating Base Data...");
    const { experts, travelers, categories } = await seedBetaData();
    console.log(`✓ Created ${experts.length} experts, ${travelers.length} travelers, ${categories.length} categories\n`);
    
    // STEP 2: Create expert services
    console.log("📊 STEP 2/5: Creating Expert Services...");
    const services = await seedExpertServices(experts);
    console.log(`✓ Created ${services.length} expert services\n`);
    
    // STEP 3: Create reviews and bookings
    console.log("📊 STEP 3/5: Creating Reviews & Bookings...");
    const { reviews, serviceReviewsData, bookings } = await seedReviewsAndBookings(
      experts,
      travelers,
      services
    );
    console.log(`✓ Created ${reviews.length} reviews, ${bookings.length} bookings\n`);
    
    // STEP 4: Create influencer content
    console.log("📊 STEP 4/5: Creating Influencer Content...");
    const content = await seedInfluencerContent(experts);
    console.log(`✓ Created ${content.length} content pieces\n`);
    
    // STEP 5: Summary
    console.log("📊 STEP 5/5: Generating Summary...\n");
    
    console.log("╔════════════════════════════════════════════════════════╗");
    console.log("║                  SEED DATA SUMMARY                     ║");
    console.log("╠════════════════════════════════════════════════════════╣");
    console.log("║                                                        ║");
    console.log(`║  👤 Expert Users:              ${experts.length.toString().padStart(3)} created       ║`);
    console.log(`║  👥 Traveler Users:            ${travelers.length.toString().padStart(3)} created       ║`);
    console.log(`║  📦 Service Categories:        ${categories.length.toString().padStart(3)} created       ║`);
    console.log(`║  💼 Expert Services:           ${services.length.toString().padStart(3)} created       ║`);
    console.log(`║  ⭐ Reviews & Ratings:         ${reviews.length.toString().padStart(3)} created       ║`);
    console.log(`║  📅 Sample Bookings:           ${bookings.length.toString().padStart(3)} created       ║`);
    console.log(`║  📱 Influencer Content:        ${content.length.toString().padStart(3)} created       ║`);
    console.log("║                                                        ║");
    console.log("╠════════════════════════════════════════════════════════╣");
    console.log("║                TEST CREDENTIALS                        ║");
    console.log("╠════════════════════════════════════════════════════════╣");
    console.log("║                                                        ║");
    console.log("║  🌏 Asia Experts:                                      ║");
    console.log("║     • yuki.tanaka@traveloure.com (Japan)              ║");
    console.log("║     • maya.chen@traveloure.com (Thailand)             ║");
    console.log("║     • made.wirawan@traveloure.com (Bali)              ║");
    console.log("║                                                        ║");
    console.log("║  🌍 Europe Experts:                                    ║");
    console.log("║     • amelie.dubois@traveloure.com (Paris)            ║");
    console.log("║     • marco.rossi@traveloure.com (Italy)              ║");
    console.log("║     • sofia.papadopoulos@traveloure.com (Greece)      ║");
    console.log("║                                                        ║");
    console.log("║  🌎 Americas Experts:                                  ║");
    console.log("║     • carlos.rivera@traveloure.com (Mexico)           ║");
    console.log("║     • lucia.mendoza@traveloure.com (Peru)             ║");
    console.log("║     • james.wilson@traveloure.com (NYC)               ║");
    console.log("║                                                        ║");
    console.log("║  ⛰️  Adventure Experts:                                ║");
    console.log("║     • erik.andersen@traveloure.com (Iceland)          ║");
    console.log("║     • gabriela.santos@traveloure.com (Costa Rica)     ║");
    console.log("║                                                        ║");
    console.log("║  💎 Luxury Experts:                                    ║");
    console.log("║     • victoria.ashford@traveloure.com (Global)        ║");
    console.log("║     • alexandre.beaumont@traveloure.com (Riviera)     ║");
    console.log("║                                                        ║");
    console.log("║  🎒 Budget Experts:                                    ║");
    console.log("║     • sarah.mitchell@traveloure.com (Digital Nomad)   ║");
    console.log("║     • ahmed.hassan@traveloure.com (Morocco)           ║");
    console.log("║                                                        ║");
    console.log("║  👤 Sample Travelers:                                  ║");
    console.log("║     • emma.johnson@example.com                        ║");
    console.log("║     • michael.brown@example.com                       ║");
    console.log("║     • sophia.davis@example.com                        ║");
    console.log("║                                                        ║");
    console.log("╠════════════════════════════════════════════════════════╣");
    console.log("║                    DATA QUALITY                        ║");
    console.log("╠════════════════════════════════════════════════════════╣");
    console.log("║                                                        ║");
    console.log("║  ✓ Realistic bios and descriptions                    ║");
    console.log("║  ✓ Diverse specializations and price points          ║");
    console.log("║  ✓ High-quality Unsplash images                       ║");
    console.log("║  ✓ Professional avatar placeholders                   ║");
    console.log("║  ✓ Realistic review distribution (70% positive)       ║");
    console.log("║  ✓ Varied booking statuses                            ║");
    console.log("║  ✓ SEO-optimized content titles                       ║");
    console.log("║  ✓ Engagement metrics (views, saves, ratings)         ║");
    console.log("║                                                        ║");
    console.log("╚════════════════════════════════════════════════════════╝\n");
    
    console.log("🎉 SUCCESS! Beta launch data has been seeded.\n");
    console.log("📌 NEXT STEPS:");
    console.log("   1. Browse the platform to verify data quality");
    console.log("   2. Test user flows (booking, reviews, browsing)");
    console.log("   3. Take screenshots for marketing materials");
    console.log("   4. Invite beta testers!\n");
    
    console.log("📚 For more details, see: server/seeds/README.md\n");
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERROR DURING SEEDING:");
    console.error(error);
    console.error("\n💡 TROUBLESHOOTING TIPS:");
    console.error("   • Check DATABASE_URL in .env");
    console.error("   • Ensure PostgreSQL is running");
    console.error("   • Run migrations first: npm run db:migrate");
    console.error("   • Check for existing data conflicts\n");
    process.exit(1);
  }
}

// Execute
runBetaSeed();
