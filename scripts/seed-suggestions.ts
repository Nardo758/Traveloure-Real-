import { db } from '../server/db';
import { tripSuggestions, trips, experts } from '../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Seed trip suggestions for testing the expert curation system.
 * Creates pending, approved, and rejected suggestions for existing trips.
 */
async function seedSuggestions() {
  console.log('🌱 Seeding trip suggestions...');

  // Fetch first few trips
  const allTrips = await db.select().from(trips).limit(5);
  if (allTrips.length === 0) {
    console.log('No trips found — run seed-california-itinerary.ts first');
    return;
  }

  // Fetch first expert
  const allExperts = await db.select().from(experts).limit(1);
  if (allExperts.length === 0) {
    console.log('No experts found — ensure experts are seeded');
    return;
  }

  const expert = allExperts[0];

  const suggestions = [
    {
      tripId: allTrips[0].id,
      expertId: expert.id,
      status: 'pending' as const,
      suggestionType: 'hotel',
      title: 'Upgrade hotel to The Ritz-Carlton',
      description: 'The current hotel is fine, but The Ritz-Carlton offers better views and breakfast included.',
      estimatedCost: 450,
      reason: 'Better amenities and location closer to Day 2 activities.',
      createdAt: new Date(),
    },
    {
      tripId: allTrips[0].id,
      expertId: expert.id,
      status: 'approved' as const,
      suggestionType: 'restaurant',
      title: 'Replace lunch spot with Farmhouse Kitchen',
      description: 'Farmhouse Kitchen has better Thai food and takes reservations.',
      estimatedCost: 75,
      reason: 'Higher rated on Yelp and more authentic.',
      createdAt: new Date(Date.now() - 86400000), // yesterday
    },
    {
      tripId: allTrips[1]?.id || allTrips[0].id,
      expertId: expert.id,
      status: 'pending' as const,
      suggestionType: 'activity',
      title: 'Add wine tasting in Napa',
      description: 'Half-day tour of two vineyards with transportation.',
      estimatedCost: 200,
      reason: 'Fits perfectly between Day 3 morning and evening plans.',
      createdAt: new Date(),
    },
    {
      tripId: allTrips[1]?.id || allTrips[0].id,
      expertId: expert.id,
      status: 'rejected' as const,
      suggestionType: 'transport',
      title: 'Switch from Uber to private car',
      description: 'Private car is more reliable for airport transfer.',
      estimatedCost: 150,
      reason: 'Cost exceeds budget; Uber XL is sufficient.',
      createdAt: new Date(Date.now() - 172800000), // 2 days ago
    },
  ];

  // Insert suggestions
  for (const suggestion of suggestions) {
    await db.insert(tripSuggestions).values(suggestion);
  }

  console.log(`✅ Inserted ${suggestions.length} trip suggestions`);
  console.log('   - 2 pending suggestions (should show badge on trip card)');
  console.log('   - 1 approved, 1 rejected (for testing filters)');
}

seedSuggestions().catch((err) => {
  console.error('❌ Failed to seed suggestions:', err);
  process.exit(1);
});