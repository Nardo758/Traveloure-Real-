/**
 * seed-california-full.ts
 *
 * Seeds the California Coastal Road Trip with full demo data:
 * - Trip status upgrade (draft → planning)
 * - Expert advisor assignment (Maria Santos, accepted)
 * - Service provider + 3 bookable services
 * - 3 confirmed service bookings linked to trip
 * - 3 expert suggestions (2 pending, 1 approved)
 * - Rich itinerary change log (AI, traveler, expert entries)
 * - Populated itinerary_items from generated_itineraries JSON
 */

import { pool, db } from "../server/db";
import { sql } from "drizzle-orm";

const TRIP_ID = "eb5f3e68-8689-4c07-89c4-b07f53bbb87c";
const OWNER_ID = "40904180";
const EXPERT_ID = "43352454-f6c0-46ff-a97a-2c027b67671f"; // Maria Santos
const EXPERT_NAME = "Maria Santos";

async function run() {
  console.log("🌴 Seeding California trip with full demo data...\n");

  // ──────────────────────────────────────────────────────────────────
  // 1. Upgrade trip status to "planning" so all features are active
  // ──────────────────────────────────────────────────────────────────
  await db.execute(sql`
    UPDATE trips SET status = 'planning' WHERE id = ${TRIP_ID}
  `);
  console.log("✅ Trip status → planning");

  // ──────────────────────────────────────────────────────────────────
  // 2. Assign expert advisor (Maria Santos, accepted)
  // ──────────────────────────────────────────────────────────────────
  await db.execute(sql`
    DELETE FROM trip_expert_advisors WHERE trip_id = ${TRIP_ID}
  `);
  await db.execute(sql`
    INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, message, assigned_at, expert_response)
    VALUES (
      gen_random_uuid(),
      ${TRIP_ID},
      ${EXPERT_ID},
      'accepted',
      'Hi Maria, I would love your help planning the California trip! Especially for wine country and Big Sur.',
      now() - interval '3 days',
      'Excited to help! I know the coast well — I will put together some recommendations for you.'
    )
  `);
  console.log("✅ Expert advisor (Maria Santos) assigned & accepted");

  // ──────────────────────────────────────────────────────────────────
  // 3. Create a California service provider + 3 services
  // ──────────────────────────────────────────────────────────────────
  // Provider form
  // Remove old provider form for this user (to allow re-seeding)
  await db.execute(sql`
    DELETE FROM service_provider_forms WHERE user_id = ${EXPERT_ID}
  `);

  const providerFormResult = await db.execute(sql`
    INSERT INTO service_provider_forms (
      id, user_id, business_name, name, email, website, mobile, country, address, business_type, status
    ) VALUES (
      gen_random_uuid(),
      ${EXPERT_ID},
      'California Coastal Experiences',
      'Maria Santos',
      'maria@californiacoastal.com',
      'https://californiacoastal.com',
      '+1-415-555-0192',
      'United States',
      'San Francisco, CA',
      'travel_expert',
      'approved'
    )
    RETURNING id
  `);

  let providerId: string;
  if (providerFormResult.rows.length > 0) {
    providerId = providerFormResult.rows[0].id as string;
  } else {
    const existing = await db.execute(sql`
      SELECT id FROM service_provider_forms WHERE business_name = 'California Coastal Experiences' LIMIT 1
    `);
    providerId = existing.rows[0]?.id as string;
  }
  console.log("✅ Provider: California Coastal Experiences (id:", providerId + ")");

  // Delete old demo services for this provider
  await db.execute(sql`DELETE FROM provider_services WHERE user_id = ${EXPERT_ID} AND service_name IN (
    'SF Bay Private Tour', 'Napa Valley Wine Experience', 'Big Sur Coast Transfer'
  )`);

  // Service 1: Private SF City Tour
  const svc1 = await db.execute(sql`
    INSERT INTO provider_services (
      id, user_id, service_name, service_type, price, price_type, description, short_description,
      location, status, is_featured, delivery_method
    ) VALUES (
      gen_random_uuid(),
      ${EXPERT_ID},
      'SF Bay Private Tour',
      'tour',
      320,
      'fixed',
      'Full-day private guided tour of San Francisco highlights including Golden Gate Bridge, Alcatraz view, Fisherman''s Wharf, and Mission District. Includes hotel pickup and a curated lunch stop.',
      'Private SF city tour with hotel pickup',
      'San Francisco, CA',
      'active',
      true,
      'in_person'
    ) RETURNING id
  `);
  const svc1Id = svc1.rows[0].id as string;

  // Service 2: Napa Wine Experience
  const svc2 = await db.execute(sql`
    INSERT INTO provider_services (
      id, user_id, service_name, service_type, price, price_type, description, short_description,
      location, status, is_featured, delivery_method
    ) VALUES (
      gen_random_uuid(),
      ${EXPERT_ID},
      'Napa Valley Wine Experience',
      'experience',
      195,
      'per_person',
      'Guided half-day wine tasting at three premier Napa Valley vineyards. Includes private transport from San Francisco, expert sommelier guide, charcuterie pairings, and winery visits to Beringer, Opus One, and Stag''s Leap.',
      'Half-day Napa wine tasting with private transport',
      'Napa Valley, CA',
      'active',
      true,
      'in_person'
    ) RETURNING id
  `);
  const svc2Id = svc2.rows[0].id as string;

  // Service 3: Big Sur Transfer
  const svc3 = await db.execute(sql`
    INSERT INTO provider_services (
      id, user_id, service_name, service_type, price, price_type, description, short_description,
      location, status, is_featured, delivery_method
    ) VALUES (
      gen_random_uuid(),
      ${EXPERT_ID},
      'Big Sur Coast Transfer',
      'transport',
      280,
      'fixed',
      'Luxury private vehicle transfer along Highway 1 from Carmel to Santa Barbara with scheduled photo stops at Bixby Bridge, McWay Falls, and Pfeiffer Beach. Driver has 8+ years on the coast route.',
      'Private scenic drive Carmel → Santa Barbara',
      'Big Sur, CA',
      'active',
      false,
      'in_person'
    ) RETURNING id
  `);
  const svc3Id = svc3.rows[0].id as string;
  console.log("✅ Created 3 California services");

  // ──────────────────────────────────────────────────────────────────
  // 4. Service bookings linked to the California trip
  // ──────────────────────────────────────────────────────────────────
  await db.execute(sql`
    DELETE FROM service_bookings WHERE trip_id = ${TRIP_ID}
  `);

  await db.execute(sql`
    INSERT INTO service_bookings (
      id, service_id, traveler_id, provider_id, trip_id, status,
      total_amount, platform_fee, provider_earnings, booking_details, created_at
    ) VALUES
    (
      gen_random_uuid(),
      ${svc1Id},
      ${OWNER_ID},
      ${EXPERT_ID},
      ${TRIP_ID},
      'confirmed',
      320.00,
      32.00,
      288.00,
      '{"date":"2026-06-15","time":"09:00","notes":"Please arrange hotel pickup at Union Square","participants":2}'::jsonb,
      now() - interval '2 days'
    ),
    (
      gen_random_uuid(),
      ${svc2Id},
      ${OWNER_ID},
      ${EXPERT_ID},
      ${TRIP_ID},
      'confirmed',
      390.00,
      39.00,
      351.00,
      '{"date":"2026-06-17","time":"10:00","notes":"2 guests, vegetarian snack option preferred","participants":2}'::jsonb,
      now() - interval '2 days'
    ),
    (
      gen_random_uuid(),
      ${svc3Id},
      ${OWNER_ID},
      ${EXPERT_ID},
      ${TRIP_ID},
      'pending',
      280.00,
      28.00,
      252.00,
      '{"date":"2026-06-19","time":"08:30","notes":"Stop at McWay Falls for at least 30 minutes","participants":2}'::jsonb,
      now() - interval '1 day'
    )
  `);
  console.log("✅ Created 3 service bookings (2 confirmed, 1 pending)");

  // ──────────────────────────────────────────────────────────────────
  // 5. Expert suggestions for the California trip
  // ──────────────────────────────────────────────────────────────────
  await db.execute(sql`
    DELETE FROM trip_suggestions WHERE trip_id = ${TRIP_ID}
  `);

  await db.execute(sql`
    INSERT INTO trip_suggestions (
      id, trip_id, expert_id, type, day_number, title, description, estimated_cost, status, created_at
    ) VALUES
    (
      gen_random_uuid(),
      ${TRIP_ID},
      ${EXPERT_ID},
      'activity',
      3,
      'Add Muir Woods Morning Walk',
      'Start Day 3 with a 2-hour guided walk through Muir Woods National Monument — old-growth redwoods, only 30 min from SF. Go early (8am) to beat the crowds. I can arrange a private naturalist guide.',
      85.00,
      'pending',
      now() - interval '18 hours'
    ),
    (
      gen_random_uuid(),
      ${TRIP_ID},
      ${EXPERT_ID},
      'accommodation',
      5,
      'Upgrade to Post Ranch Inn, Big Sur',
      'The current hotel is fine but Post Ranch Inn is a once-in-a-lifetime property perched 1,200 ft above the Pacific. Ocean-view rooms, zero light pollution, world-class spa. Worth the splurge for one night.',
      850.00,
      'pending',
      now() - interval '6 hours'
    ),
    (
      gen_random_uuid(),
      ${TRIP_ID},
      ${EXPERT_ID},
      'food',
      2,
      'Dinner at The French Laundry (Yountville)',
      'If you can get a reservation (book 60+ days ahead), Thomas Keller''s French Laundry is the best meal in the US. I have a contact who may be able to secure a table for Day 2 evening.',
      450.00,
      'approved',
      now() - interval '2 days'
    )
  `);
  console.log("✅ Created 3 expert suggestions (2 pending, 1 approved)");

  // ──────────────────────────────────────────────────────────────────
  // 6. Rich itinerary change log
  // ──────────────────────────────────────────────────────────────────
  await db.execute(sql`
    DELETE FROM itinerary_changes WHERE trip_id = ${TRIP_ID}
  `);

  await db.execute(sql`
    INSERT INTO itinerary_changes (id, trip_id, activity_id, who, action, change_type, role, metadata, created_at)
    VALUES
    (
      gen_random_uuid(), ${TRIP_ID}, null,
      'AI', 'Generated 8-day California coastal itinerary', 'generate', 'ai',
      '{"activitiesAdded":30,"daysPlanned":8}'::jsonb,
      now() - interval '4 days'
    ),
    (
      gen_random_uuid(), ${TRIP_ID}, null,
      'You', 'Added Napa Valley Wine Experience booking', 'add', 'traveler',
      '{"service":"Napa Valley Wine Experience","amount":390}'::jsonb,
      now() - interval '2 days'
    ),
    (
      gen_random_uuid(), ${TRIP_ID}, null,
      'You', 'Confirmed SF Bay Private Tour', 'edit', 'traveler',
      '{"service":"SF Bay Private Tour","date":"Jun 15"}'::jsonb,
      now() - interval '2 days'
    ),
    (
      gen_random_uuid(), ${TRIP_ID}, null,
      ${EXPERT_NAME}, 'Suggested Muir Woods morning walk for Day 3', 'suggest', 'expert',
      '{"day":3,"estimatedCost":85,"type":"activity"}'::jsonb,
      now() - interval '18 hours'
    ),
    (
      gen_random_uuid(), ${TRIP_ID}, null,
      ${EXPERT_NAME}, 'Suggested Post Ranch Inn upgrade for Day 5', 'suggest', 'expert',
      '{"day":5,"estimatedCost":850,"type":"accommodation"}'::jsonb,
      now() - interval '6 hours'
    ),
    (
      gen_random_uuid(), ${TRIP_ID}, null,
      'You', 'Approved The French Laundry dinner suggestion', 'approve', 'traveler',
      '{"suggestionTitle":"Dinner at The French Laundry","day":2}'::jsonb,
      now() - interval '1 day'
    ),
    (
      gen_random_uuid(), ${TRIP_ID}, null,
      'You', 'Added Big Sur Coast Transfer booking', 'add', 'traveler',
      '{"service":"Big Sur Coast Transfer","date":"Jun 19"}'::jsonb,
      now() - interval '1 day'
    )
  `);
  console.log("✅ Created 7 itinerary change log entries");

  // ──────────────────────────────────────────────────────────────────
  // 7. Populate itinerary_items from generated_itineraries JSON
  //    This makes the plancard "Activities" tab show real items
  // ──────────────────────────────────────────────────────────────────
  await db.execute(sql`
    DELETE FROM itinerary_items WHERE trip_id = ${TRIP_ID}
  `);

  const giResult = await db.execute(sql`
    SELECT itinerary_data FROM generated_itineraries
    WHERE trip_id = ${TRIP_ID}
    LIMIT 1
  `);

  if (giResult.rows.length === 0) {
    console.log("⚠️  No generated_itineraries found — skipping itinerary_items");
  } else {
    const data = giResult.rows[0].itinerary_data as {
      days: Array<{
        day: number;
        activities: Array<{
          id: string;
          name: string;
          time?: string;
          type: string;
          location?: string;
          description?: string;
          estimatedCost?: number;
          lat?: number;
          lng?: number;
          expertCurated?: boolean;
        }>;
      }>;
    };

    let itemsInserted = 0;
    for (const day of data.days ?? []) {
      const dayNum = day.day;
      let sortOrder = 0;
      for (const act of day.activities ?? []) {
        const status = act.expertCurated ? "confirmed" : "planned";
        await db.execute(sql`
          INSERT INTO itinerary_items (
            id, trip_id, title, description, item_type, status,
            day_number, start_time, location_name, latitude, longitude,
            estimated_cost, sort_order, suggested_by, created_at, updated_at
          ) VALUES (
            gen_random_uuid(),
            ${TRIP_ID},
            ${act.name},
            ${act.description ?? null},
            ${act.type},
            ${status},
            ${dayNum},
            ${act.time ?? null},
            ${act.location ?? null},
            ${act.lat ?? null},
            ${act.lng ?? null},
            ${act.estimatedCost ?? 0},
            ${sortOrder},
            ${act.expertCurated ? "expert" : "ai"},
            now(),
            now()
          )
        `);
        sortOrder++;
        itemsInserted++;
      }
    }
    console.log(`✅ Populated ${itemsInserted} itinerary_items from generated itinerary`);
  }

  // ──────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────
  console.log("\n🎉 California trip is fully seeded!\n");
  console.log("  Dashboard card will show:");
  console.log("    • Activities count (30)");
  console.log("    • Transport legs pill (29 legs)");
  console.log("    • 3 services pill");
  console.log("    • Expert advisor strip (Maria Santos)");
  console.log("    • 2 pending suggestion badges");
  console.log("\n  Trip details page will show:");
  console.log("    • Full activity timeline with structured items");
  console.log("    • 7-entry change log");
  console.log("    • 2 pending + 1 approved expert suggestions");
  console.log("    • Expert advisor accepted status");
  console.log("\n  Bookings page will show:");
  console.log("    • SF Bay Private Tour (confirmed, $320)");
  console.log("    • Napa Valley Wine Experience (confirmed, $390)");
  console.log("    • Big Sur Coast Transfer (pending, $280)");

  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Seed failed:", err.message ?? err);
  process.exit(1);
});
