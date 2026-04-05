import { db } from '../server/db';
import { tripSuggestions, trips, users } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';

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

  // Fetch first user with role='expert'
  const allExperts = await db
    .select()
    .from(users)
    .where(eq(users.role, 'expert'))
    .limit(1);

  if (allExperts.length === 0) {
    console.log('No expert users found — ensure an expert account exists');
    return;
  }

  const expert = allExperts[0];
  console.log(`✅ Using expert: ${expert.firstName} ${expert.lastName} (${expert.id})`);

  // Clear existing suggestions for these trips to avoid duplicates
  for (const trip of allTrips.slice(0, 2)) {
    await db.delete(tripSuggestions).where(eq(tripSuggestions.tripId, trip.id));
  }

  const suggestions = [
    {
      tripId: allTrips[0].id,
      expertId: expert.id,
      status: 'pending' as const,
      type: 'accommodation',
      title: 'Upgrade hotel to The Ritz-Carlton',
      description: 'The current hotel is fine, but The Ritz-Carlton offers better views and breakfast included. Highly recommended for a smoother stay on Day 2.',
      estimatedCost: '450.00',
      dayNumber: 2,
    },
    {
      tripId: allTrips[0].id,
      expertId: expert.id,
      status: 'approved' as const,
      type: 'food',
      title: 'Replace lunch spot with Farmhouse Kitchen',
      description: 'Farmhouse Kitchen has better Thai food and takes reservations. Higher rated and more authentic than the current option.',
      estimatedCost: '75.00',
      dayNumber: 3,
      reviewedAt: new Date(Date.now() - 3600000),
    },
    {
      tripId: allTrips[1]?.id || allTrips[0].id,
      expertId: expert.id,
      status: 'pending' as const,
      type: 'activity',
      title: 'Add wine tasting in Napa Valley',
      description: 'Half-day tour of two top vineyards with private transportation included. Fits perfectly between Day 3 morning and evening plans.',
      estimatedCost: '200.00',
      dayNumber: 4,
    },
    {
      tripId: allTrips[1]?.id || allTrips[0].id,
      expertId: expert.id,
      status: 'rejected' as const,
      type: 'transport',
      title: 'Switch from Uber to private car service',
      description: 'Private car is more reliable for airport transfers and can handle luggage better.',
      estimatedCost: '150.00',
      dayNumber: 1,
      rejectionNote: 'Cost exceeds budget. Uber XL is sufficient for this group size.',
      reviewedAt: new Date(Date.now() - 86400000),
    },
  ];

  // Insert suggestions
  let inserted = 0;
  for (const suggestion of suggestions) {
    await db.insert(tripSuggestions).values(suggestion);
    inserted++;
  }

  console.log(`✅ Inserted ${inserted} trip suggestions`);
  console.log('   - 2 pending (should show badge on trip cards)');
  console.log('   - 1 approved, 1 rejected (for status filter testing)');
}

seedSuggestions()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Failed to seed suggestions:', err);
    process.exit(1);
  });
