/**
 * verify-california.ts
 *
 * Verify that the California Coastal Road Trip seed data is present and correct.
 */

import { pool, db } from "../server/db";
import { sql } from "drizzle-orm";

const TRIP_ID = "eb5f3e68-8689-4c07-89c4-b07f53bbb87c";
const OWNER_ID = "40904180";
const EXPERT_ID = "43352454-f6c0-46ff-a97a-2c027b67671f";

async function run() {
  console.log("🔍 Verifying California trip seed data...\n");

  // ──────────────────────────────────────────────────────────────────
  // 1. Trip owner email
  // ──────────────────────────────────────────────────────────────────
  const owner = await db.execute(sql`
    SELECT email, first_name, last_name
    FROM users
    WHERE id = ${OWNER_ID}
  `);
  if (owner.rows.length === 0) {
    console.error("❌ Trip owner not found (ID 40904180)");
    console.log("   You may need to log in with a different account.");
  } else {
    console.log(`✅ Trip owner: ${owner.rows[0].first_name} ${owner.rows[0].last_name} (${owner.rows[0].email})`);
  }

  // ──────────────────────────────────────────────────────────────────
  // 2. Trip status
  // ──────────────────────────────────────────────────────────────────
  const trip = await db.execute(sql`
    SELECT id, destination, status, title
    FROM trips
    WHERE id = ${TRIP_ID}
  `);
  if (trip.rows.length === 0) {
    console.error("❌ Trip not found");
    return;
  }
  console.log(`✅ Trip: ${trip.rows[0].title} (${trip.rows[0].destination})`);
  console.log(`   Status: ${trip.rows[0].status}`);

  // ──────────────────────────────────────────────────────────────────
  // 2. Expert advisor
  // ──────────────────────────────────────────────────────────────────
  const expert = await db.execute(sql`
    SELECT tea.status, tea.expert_response, u.first_name, u.last_name
    FROM trip_expert_advisors tea
    JOIN users u ON tea.local_expert_id = u.id
    WHERE tea.trip_id = ${TRIP_ID}
  `);
  if (expert.rows.length === 0) {
    console.error("❌ No expert advisor assigned");
  } else {
    console.log(`✅ Expert advisor: ${expert.rows[0].first_name} ${expert.rows[0].last_name}`);
    console.log(`   Status: ${expert.rows[0].status}`);
    console.log(`   Response: ${expert.rows[0].expert_response}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. Service bookings (linked to this trip)
  // ──────────────────────────────────────────────────────────────────
  const serviceBookings = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM service_bookings
    WHERE trip_id = ${TRIP_ID}
  `);
  const serviceCount = Number(serviceBookings.rows[0].count);
  console.log(`✅ Service bookings: ${serviceCount}`);

  // ──────────────────────────────────────────────────────────────────
  // 4. Transport legs (from itinerary_items with transport mode)
  // ──────────────────────────────────────────────────────────────────
  const transportLegs = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM itinerary_items
    WHERE trip_id = ${TRIP_ID}
      AND mode IS NOT NULL
      AND mode != ''
  `);
  const transportCount = Number(transportLegs.rows[0].count);
  console.log(`✅ Transport legs: ${transportCount}`);

  // ──────────────────────────────────────────────────────────────────
  // 5. Expert suggestions
  // ──────────────────────────────────────────────────────────────────
  const suggestions = await db.execute(sql`
    SELECT COUNT(*) as count, status
    FROM expert_suggestions
    WHERE trip_id = ${TRIP_ID}
    GROUP BY status
  `);
  console.log(`✅ Expert suggestions:`);
  if (suggestions.rows.length === 0) {
    console.log("   None");
  } else {
    suggestions.rows.forEach((row: any) => {
      console.log(`   ${row.status}: ${row.count}`);
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // 6. PlanCard pill expectations
  // ──────────────────────────────────────────────────────────────────
  console.log("\n📊 Expected PlanCard pills:");
  console.log(`   • Services pill: ${serviceCount > 0 ? `✅ ${serviceCount} service(s)` : '❌ (hidden)'}`);
  console.log(`   • Transport pill: ${transportCount > 0 ? `✅ ${transportCount} leg(s)` : '❌ (hidden)'}`);
  console.log(`   • Expert pill: ${expert.rows.length > 0 ? '✅ Expert assigned' : '❌ (hidden)'}`);

  // ──────────────────────────────────────────────────────────────────
  // 7. Check conversation for expert (for click target)
  // ──────────────────────────────────────────────────────────────────
  const conversation = await db.execute(sql`
    SELECT id FROM conversations
    WHERE trip_id = ${TRIP_ID}
    LIMIT 1
  `);
  console.log(`✅ Conversation for trip: ${conversation.rows.length > 0 ? `✅ ID ${conversation.rows[0].id}` : '❌ None'}`);

  await pool.end();
  console.log("\n🎉 Verification complete.");
  console.log("\n🔗 Next steps:");
  console.log("   1. Ensure dev server is running (npm run dev)");
  console.log("   2. Log in as the trip owner (user ID 40904180)");
  console.log("   3. Navigate to dashboard");
  console.log("   4. Find California Coastal Road Trip card");
  console.log("   5. Verify pill row appears below stats");
  console.log("   6. Hover over pills to see tooltips");
  console.log("   7. Click each pill to verify navigation");
  console.log("   8. Test delete button (top‑right X)");
}

run().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});