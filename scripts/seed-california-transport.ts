import { pool } from "../server/db";

const TRIP_ID = "eb5f3e68-8689-4c07-89c4-b07f53bbb87c";
const OWNER_EMAIL = "m.dixon5030@gmail.com";

// California Road Trip transport legs — between each activity per day
// Coords match the seeded generated_itineraries activities
const DAYS: {
  dayNumber: number;
  legs: {
    fromName: string; fromLat: number; fromLng: number;
    toName: string;   toLat: number;   toLng: number;
    distanceMeters: number; distanceDisplay: string;
    recommendedMode: string; durationMinutes: number; costUsd: number | null;
    alternatives: { mode: string; durationMinutes: number; costUsd: number | null; energyCost: number; reason: string }[];
  }[];
}[] = [
  // ─── Day 1 · San Francisco Arrival ────────────────────────────────────────
  { dayNumber: 1, legs: [
    {
      fromName: "SFO Airport", fromLat: 37.6213, fromLng: -122.3790,
      toName: "Golden Gate Bridge", toLat: 37.8199, toLng: -122.4783,
      distanceMeters: 37_000, distanceDisplay: "37 km",
      recommendedMode: "rideshare", durationMinutes: 42, costUsd: 35,
      alternatives: [
        { mode: "rental_car", durationMinutes: 40, costUsd: 55, energyCost: 60, reason: "Useful for the road trip ahead" },
        { mode: "transit", durationMinutes: 65, costUsd: 4, energyCost: 8, reason: "BART + bus, most affordable" },
        { mode: "taxi", durationMinutes: 45, costUsd: 45, energyCost: 40, reason: "No wait, metered fare" },
      ],
    },
    {
      fromName: "Golden Gate Bridge", fromLat: 37.8199, fromLng: -122.4783,
      toName: "Fisherman's Wharf", toLat: 37.8081, toLng: -122.4156,
      distanceMeters: 5_100, distanceDisplay: "5.1 km",
      recommendedMode: "walk", durationMinutes: 22, costUsd: null,
      alternatives: [
        { mode: "rideshare", durationMinutes: 8, costUsd: 12, energyCost: 25, reason: "Quick if feet are tired" },
        { mode: "bike", durationMinutes: 16, costUsd: 5, energyCost: 5, reason: "Scenic bay views on rental bike" },
        { mode: "transit", durationMinutes: 18, costUsd: 3, energyCost: 6, reason: "Muni bus runs frequently" },
      ],
    },
    {
      fromName: "Fisherman's Wharf", fromLat: 37.8081, fromLng: -122.4156,
      toName: "Ferry Building", toLat: 37.7956, toLng: -122.3935,
      distanceMeters: 2_600, distanceDisplay: "2.6 km",
      recommendedMode: "walk", durationMinutes: 12, costUsd: null,
      alternatives: [
        { mode: "rideshare", durationMinutes: 5, costUsd: 8, energyCost: 20, reason: "Short but saves time" },
        { mode: "transit", durationMinutes: 10, costUsd: 3, energyCost: 5, reason: "Embarcadero tram" },
      ],
    },
    {
      fromName: "Ferry Building", fromLat: 37.7956, fromLng: -122.3935,
      toName: "Union Square Hotel", toLat: 37.7879, toLng: -122.4074,
      distanceMeters: 1_700, distanceDisplay: "1.7 km",
      recommendedMode: "walk", durationMinutes: 8, costUsd: null,
      alternatives: [
        { mode: "rideshare", durationMinutes: 4, costUsd: 7, energyCost: 18, reason: "Skip the hill" },
        { mode: "transit", durationMinutes: 6, costUsd: 3, energyCost: 4, reason: "BART one stop" },
      ],
    },
  ]},

  // ─── Day 2 · Alcatraz & City Exploration ──────────────────────────────────
  { dayNumber: 2, legs: [
    {
      fromName: "Union Square Hotel", fromLat: 37.7879, fromLng: -122.4074,
      toName: "Pier 33 (Alcatraz Ferry)", toLat: 37.8079, toLng: -122.4111,
      distanceMeters: 2_200, distanceDisplay: "2.2 km",
      recommendedMode: "walk", durationMinutes: 10, costUsd: null,
      alternatives: [
        { mode: "rideshare", durationMinutes: 4, costUsd: 9, energyCost: 18, reason: "Quick morning start" },
        { mode: "transit", durationMinutes: 8, costUsd: 3, energyCost: 5, reason: "Embarcadero tram" },
      ],
    },
    {
      fromName: "Alcatraz Island", fromLat: 37.8267, fromLng: -122.4230,
      toName: "Lombard Street", toLat: 37.8022, toLng: -122.4194,
      distanceMeters: 3_000, distanceDisplay: "3 km (ferry + walk)",
      recommendedMode: "ferry", durationMinutes: 30, costUsd: 43,
      alternatives: [
        { mode: "transit", durationMinutes: 20, costUsd: 5, energyCost: 8, reason: "Bus from Pier 41" },
        { mode: "rideshare", durationMinutes: 15, costUsd: 12, energyCost: 22, reason: "Fastest after ferry" },
      ],
    },
    {
      fromName: "Lombard Street", fromLat: 37.8022, fromLng: -122.4194,
      toName: "Haight-Ashbury", toLat: 37.7693, toLng: -122.4473,
      distanceMeters: 4_300, distanceDisplay: "4.3 km",
      recommendedMode: "transit", durationMinutes: 18, costUsd: 3,
      alternatives: [
        { mode: "rideshare", durationMinutes: 10, costUsd: 12, energyCost: 22, reason: "No transfers" },
        { mode: "bike", durationMinutes: 22, costUsd: 5, energyCost: 6, reason: "Downhill most of the way" },
      ],
    },
    {
      fromName: "Haight-Ashbury", fromLat: 37.7693, fromLng: -122.4473,
      toName: "Golden Gate Park", toLat: 37.7694, toLng: -122.4862,
      distanceMeters: 2_600, distanceDisplay: "2.6 km",
      recommendedMode: "walk", durationMinutes: 11, costUsd: null,
      alternatives: [
        { mode: "bike", durationMinutes: 8, costUsd: 4, energyCost: 3, reason: "Panhandle path is flat" },
        { mode: "rideshare", durationMinutes: 5, costUsd: 8, energyCost: 18, reason: "Skip the walk" },
      ],
    },
  ]},

  // ─── Day 3 · Drive to Monterey ────────────────────────────────────────────
  { dayNumber: 3, legs: [
    {
      fromName: "Union Square Hotel", fromLat: 37.7879, fromLng: -122.4074,
      toName: "17-Mile Drive Entrance", toLat: 36.5721, toLng: -121.9552,
      distanceMeters: 178_000, distanceDisplay: "178 km",
      recommendedMode: "rental_car", durationMinutes: 130, costUsd: 60,
      alternatives: [
        { mode: "private_driver", durationMinutes: 130, costUsd: 180, energyCost: 55, reason: "Sit back and enjoy the views" },
        { mode: "bus", durationMinutes: 190, costUsd: 18, energyCost: 12, reason: "Greyhound/Amtrak, no stops en route" },
      ],
    },
    {
      fromName: "17-Mile Drive", fromLat: 36.5721, fromLng: -121.9552,
      toName: "Point Lobos State Reserve", toLat: 36.5191, toLng: -121.9416,
      distanceMeters: 6_300, distanceDisplay: "6.3 km",
      recommendedMode: "rental_car", durationMinutes: 12, costUsd: null,
      alternatives: [
        { mode: "bike", durationMinutes: 30, costUsd: 12, energyCost: 8, reason: "Gorgeous coastal cycling" },
        { mode: "rideshare", durationMinutes: 12, costUsd: 14, energyCost: 22, reason: "No car parking hassle" },
      ],
    },
    {
      fromName: "Point Lobos", fromLat: 36.5191, fromLng: -121.9416,
      toName: "Carmel Beach", toLat: 36.5552, toLng: -121.9233,
      distanceMeters: 4_400, distanceDisplay: "4.4 km",
      recommendedMode: "rental_car", durationMinutes: 8, costUsd: null,
      alternatives: [
        { mode: "walk", durationMinutes: 45, costUsd: null, energyCost: 3, reason: "Carmel trail along coast" },
        { mode: "bike", durationMinutes: 20, costUsd: 10, energyCost: 5, reason: "Flat coastal route" },
      ],
    },
    {
      fromName: "Carmel Beach", fromLat: 36.5552, fromLng: -121.9233,
      toName: "Monterey Hotel", toLat: 36.6003, toLng: -121.8947,
      distanceMeters: 5_800, distanceDisplay: "5.8 km",
      recommendedMode: "rental_car", durationMinutes: 10, costUsd: null,
      alternatives: [
        { mode: "rideshare", durationMinutes: 10, costUsd: 11, energyCost: 20, reason: "Skip parking" },
        { mode: "transit", durationMinutes: 22, costUsd: 2, energyCost: 6, reason: "MST local bus" },
      ],
    },
  ]},

  // ─── Day 4 · Big Sur Coastline ────────────────────────────────────────────
  { dayNumber: 4, legs: [
    {
      fromName: "Monterey Hotel", fromLat: 36.6003, fromLng: -121.8947,
      toName: "Bixby Creek Bridge", toLat: 36.3719, toLng: -121.9016,
      distanceMeters: 27_000, distanceDisplay: "27 km",
      recommendedMode: "rental_car", durationMinutes: 38, costUsd: null,
      alternatives: [
        { mode: "private_driver", durationMinutes: 38, costUsd: 90, energyCost: 50, reason: "Hire a local guide for the drive" },
        { mode: "bike", durationMinutes: 180, costUsd: null, energyCost: 15, reason: "Epic but very challenging hills" },
      ],
    },
    {
      fromName: "Bixby Creek Bridge", fromLat: 36.3719, fromLng: -121.9016,
      toName: "Pfeiffer Beach", toLat: 36.2408, toLng: -121.8174,
      distanceMeters: 15_800, distanceDisplay: "15.8 km",
      recommendedMode: "rental_car", durationMinutes: 22, costUsd: null,
      alternatives: [
        { mode: "private_driver", durationMinutes: 22, costUsd: 55, energyCost: 48, reason: "Let someone else handle the turns" },
      ],
    },
    {
      fromName: "Pfeiffer Beach", fromLat: 36.2408, fromLng: -121.8174,
      toName: "McWay Falls", toLat: 36.1572, toLng: -121.6713,
      distanceMeters: 11_600, distanceDisplay: "11.6 km",
      recommendedMode: "rental_car", durationMinutes: 18, costUsd: null,
      alternatives: [
        { mode: "private_driver", durationMinutes: 18, costUsd: 45, energyCost: 45, reason: "Stop at viewpoints freely" },
      ],
    },
    {
      fromName: "McWay Falls", fromLat: 36.1572, fromLng: -121.6713,
      toName: "Hearst Castle", toLat: 35.6852, toLng: -121.1685,
      distanceMeters: 64_000, distanceDisplay: "64 km",
      recommendedMode: "rental_car", durationMinutes: 70, costUsd: null,
      alternatives: [
        { mode: "private_driver", durationMinutes: 70, costUsd: 120, energyCost: 52, reason: "Relaxed scenic drive" },
        { mode: "bus", durationMinutes: 110, costUsd: 12, energyCost: 10, reason: "Limited service" },
      ],
    },
  ]},

  // ─── Day 5 · Santa Barbara ────────────────────────────────────────────────
  { dayNumber: 5, legs: [
    {
      fromName: "Hearst Castle", fromLat: 35.6852, fromLng: -121.1685,
      toName: "Santa Barbara Mission", toLat: 34.4277, toLng: -119.7141,
      distanceMeters: 198_000, distanceDisplay: "198 km",
      recommendedMode: "rental_car", durationMinutes: 140, costUsd: 60,
      alternatives: [
        { mode: "private_driver", durationMinutes: 140, costUsd: 220, energyCost: 55, reason: "Relax through the wine country" },
        { mode: "bus", durationMinutes: 200, costUsd: 20, energyCost: 12, reason: "Greyhound via SLO" },
      ],
    },
    {
      fromName: "Santa Barbara Mission", fromLat: 34.4277, fromLng: -119.7141,
      toName: "State Street & Old Town", toLat: 34.4215, toLng: -119.7003,
      distanceMeters: 900, distanceDisplay: "0.9 km",
      recommendedMode: "walk", durationMinutes: 4, costUsd: null,
      alternatives: [
        { mode: "rideshare", durationMinutes: 2, costUsd: 6, energyCost: 15, reason: "Skip the short walk" },
        { mode: "bike", durationMinutes: 3, costUsd: 3, energyCost: 2, reason: "SB has great bike lanes" },
      ],
    },
    {
      fromName: "State Street", fromLat: 34.4215, fromLng: -119.7003,
      toName: "Stearns Wharf", toLat: 34.4133, toLng: -119.6869,
      distanceMeters: 1_500, distanceDisplay: "1.5 km",
      recommendedMode: "walk", durationMinutes: 7, costUsd: null,
      alternatives: [
        { mode: "bike", durationMinutes: 5, costUsd: 3, energyCost: 2, reason: "Easy beach cruiser ride" },
        { mode: "rideshare", durationMinutes: 3, costUsd: 7, energyCost: 16, reason: "Short but saves time" },
      ],
    },
    {
      fromName: "Stearns Wharf", fromLat: 34.4133, fromLng: -119.6869,
      toName: "Santa Barbara Hotel", toLat: 34.4208, toLng: -119.6982,
      distanceMeters: 1_200, distanceDisplay: "1.2 km",
      recommendedMode: "walk", durationMinutes: 5, costUsd: null,
      alternatives: [
        { mode: "rideshare", durationMinutes: 2, costUsd: 6, energyCost: 14, reason: "Direct to hotel" },
        { mode: "bike", durationMinutes: 4, costUsd: 3, energyCost: 2, reason: "Flat beachfront path" },
      ],
    },
  ]},

  // ─── Day 6 · Malibu & Los Angeles ─────────────────────────────────────────
  { dayNumber: 6, legs: [
    {
      fromName: "Santa Barbara Hotel", fromLat: 34.4208, fromLng: -119.6982,
      toName: "Malibu Surfrider Beach", toLat: 34.0359, toLng: -118.6918,
      distanceMeters: 145_000, distanceDisplay: "145 km",
      recommendedMode: "rental_car", durationMinutes: 95, costUsd: 50,
      alternatives: [
        { mode: "private_driver", durationMinutes: 95, costUsd: 160, energyCost: 52, reason: "Pacific Coast Highway in style" },
        { mode: "bus", durationMinutes: 155, costUsd: 15, energyCost: 10, reason: "Flixbus via Ventura" },
      ],
    },
    {
      fromName: "Malibu Surfrider Beach", fromLat: 34.0359, fromLng: -118.6918,
      toName: "Getty Center", toLat: 34.0780, toLng: -118.4741,
      distanceMeters: 21_000, distanceDisplay: "21 km",
      recommendedMode: "rental_car", durationMinutes: 28, costUsd: null,
      alternatives: [
        { mode: "rideshare", durationMinutes: 28, costUsd: 22, energyCost: 28, reason: "Let someone navigate PCH traffic" },
        { mode: "transit", durationMinutes: 65, costUsd: 3, energyCost: 7, reason: "Bus 534 + Getty shuttle" },
      ],
    },
    {
      fromName: "Getty Center", fromLat: 34.0780, fromLng: -118.4741,
      toName: "Beverly Hills", toLat: 34.0736, toLng: -118.4004,
      distanceMeters: 7_200, distanceDisplay: "7.2 km",
      recommendedMode: "rideshare", durationMinutes: 16, costUsd: 16,
      alternatives: [
        { mode: "rental_car", durationMinutes: 16, costUsd: null, energyCost: 28, reason: "Keep the car for flexibility" },
        { mode: "transit", durationMinutes: 35, costUsd: 3, energyCost: 6, reason: "Bus with transfers" },
      ],
    },
    {
      fromName: "Beverly Hills", fromLat: 34.0736, fromLng: -118.4004,
      toName: "Sunset Strip Hotel", toLat: 34.0901, toLng: -118.3860,
      distanceMeters: 3_700, distanceDisplay: "3.7 km",
      recommendedMode: "rideshare", durationMinutes: 10, costUsd: 12,
      alternatives: [
        { mode: "walk", durationMinutes: 28, costUsd: null, energyCost: 2, reason: "Flat walk along Sunset" },
        { mode: "rental_car", durationMinutes: 10, costUsd: null, energyCost: 25, reason: "Drive if you have the car" },
      ],
    },
  ]},

  // ─── Day 7 · Venice Beach & Classic LA ────────────────────────────────────
  { dayNumber: 7, legs: [
    {
      fromName: "Sunset Strip Hotel", fromLat: 34.0901, fromLng: -118.3860,
      toName: "Venice Beach Boardwalk", toLat: 33.9850, toLng: -118.4695,
      distanceMeters: 17_000, distanceDisplay: "17 km",
      recommendedMode: "rideshare", durationMinutes: 25, costUsd: 20,
      alternatives: [
        { mode: "rental_car", durationMinutes: 25, costUsd: null, energyCost: 30, reason: "Pay for beach parking" },
        { mode: "transit", durationMinutes: 50, costUsd: 3, energyCost: 6, reason: "Big Blue Bus line 2" },
        { mode: "bike", durationMinutes: 55, costUsd: 12, energyCost: 8, reason: "Coastal bike path to Venice" },
      ],
    },
    {
      fromName: "Venice Beach Boardwalk", fromLat: 33.9850, fromLng: -118.4695,
      toName: "Santa Monica Pier", toLat: 34.0100, toLng: -118.4969,
      distanceMeters: 3_600, distanceDisplay: "3.6 km",
      recommendedMode: "walk", durationMinutes: 15, costUsd: null,
      alternatives: [
        { mode: "bike", durationMinutes: 10, costUsd: 5, energyCost: 2, reason: "The Strand beachfront path" },
        { mode: "rideshare", durationMinutes: 6, costUsd: 9, energyCost: 18, reason: "Quick hop" },
      ],
    },
    {
      fromName: "Santa Monica Pier", fromLat: 34.0100, fromLng: -118.4969,
      toName: "LACMA", toLat: 34.0639, toLng: -118.3592,
      distanceMeters: 13_000, distanceDisplay: "13 km",
      recommendedMode: "rideshare", durationMinutes: 22, costUsd: 17,
      alternatives: [
        { mode: "transit", durationMinutes: 45, costUsd: 3, energyCost: 6, reason: "Metro Expo Line" },
        { mode: "rental_car", durationMinutes: 22, costUsd: null, energyCost: 28, reason: "Parking near Miracle Mile" },
      ],
    },
    {
      fromName: "LACMA", fromLat: 34.0639, fromLng: -118.3592,
      toName: "Griffith Observatory", toLat: 34.1184, toLng: -118.3004,
      distanceMeters: 7_600, distanceDisplay: "7.6 km",
      recommendedMode: "rideshare", durationMinutes: 18, costUsd: 14,
      alternatives: [
        { mode: "transit", durationMinutes: 50, costUsd: 3, energyCost: 6, reason: "Bus then Griffith shuttle" },
        { mode: "rental_car", durationMinutes: 18, costUsd: null, energyCost: 28, reason: "Parking at Observatory" },
      ],
    },
  ]},

  // ─── Day 8 · Departure from LAX ───────────────────────────────────────────
  { dayNumber: 8, legs: [
    {
      fromName: "Hotel Downtown LA", fromLat: 34.0522, fromLng: -118.2437,
      toName: "LAX Airport", toLat: 33.9416, toLng: -118.4085,
      distanceMeters: 28_000, distanceDisplay: "28 km",
      recommendedMode: "rideshare", durationMinutes: 35, costUsd: 28,
      alternatives: [
        { mode: "taxi", durationMinutes: 38, costUsd: 45, energyCost: 35, reason: "Fixed flat rate to LAX" },
        { mode: "transit", durationMinutes: 55, costUsd: 3, energyCost: 6, reason: "Metro C Line to LAX shuttle" },
        { mode: "rental_car", durationMinutes: 30, costUsd: null, energyCost: 32, reason: "Return the rental at LAX" },
        { mode: "private_driver", durationMinutes: 32, costUsd: 65, energyCost: 35, reason: "Stress-free departure" },
      ],
    },
  ]},
];

async function main() {
  const client = await pool.connect();
  console.log("🌴 Seeding California transport legs...\n");
  try {
    // 1. Get the trip owner user ID
    const userRes = await client.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [OWNER_EMAIL]);
    const userId: string = userRes.rows[0]?.id;
    if (!userId) throw new Error(`User not found: ${OWNER_EMAIL}`);
    console.log(`✅ Owner user_id: ${userId}`);

    // 2. Remove any existing comparison for this trip so we start fresh
    await client.query("DELETE FROM itinerary_comparisons WHERE trip_id = $1", [TRIP_ID]);
    console.log("🗑️  Cleared old comparison records");

    // 3. Create a new itinerary_comparison for the trip
    const compId = crypto.randomUUID();
    await client.query(
      `INSERT INTO itinerary_comparisons
        (id, user_id, trip_id, title, destination, start_date, end_date, budget, travelers, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
      [compId, userId, TRIP_ID,
       "California Coastal Road Trip — Transport Plan",
       "California, USA", "2026-06-14", "2026-06-21", 12000, 6, "active"],
    );
    console.log(`✅ Created comparison: ${compId}`);

    // 4. Create a variant
    const varId = crypto.randomUUID();
    await client.query(
      `INSERT INTO itinerary_variants
        (id, comparison_id, name, description, source, status, total_cost, total_travel_time, sort_order, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [varId, compId,
       "Road Trip Optimal",
       "Best mix of rental car freedom and rideshare convenience for the California coastal itinerary",
       "user", "active", 870, 1350, 0],
    );
    console.log(`✅ Created variant: ${varId}`);

    // 5. Set selected_variant_id on the comparison
    await client.query(
      "UPDATE itinerary_comparisons SET selected_variant_id = $1 WHERE id = $2",
      [varId, compId],
    );
    console.log("✅ Set selected_variant_id");

    // 6. Seed all transport legs
    let totalLegs = 0;
    for (const day of DAYS) {
      for (let i = 0; i < day.legs.length; i++) {
        const leg = day.legs[i];
        const legId = crypto.randomUUID();
        await client.query(
          `INSERT INTO transport_legs
            (id, variant_id, day_number, leg_order,
             from_name, from_lat, from_lng,
             to_name,   to_lat,   to_lng,
             distance_meters, distance_display,
             recommended_mode, user_selected_mode,
             estimated_duration_minutes, estimated_cost_usd,
             alternative_modes, energy_cost,
             calculated_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,$14,$15,$16::jsonb,30,NOW(),NOW(),NOW())`,
          [legId, varId, day.dayNumber, i + 1,
           leg.fromName, leg.fromLat, leg.fromLng,
           leg.toName,   leg.toLat,   leg.toLng,
           leg.distanceMeters, leg.distanceDisplay,
           leg.recommendedMode,
           leg.durationMinutes, leg.costUsd,
           JSON.stringify(leg.alternatives)],
        );
        totalLegs++;
      }
      console.log(`  Day ${day.dayNumber}: ${day.legs.length} legs`);
    }
    console.log(`\n✅ Seeded ${totalLegs} transport legs across 8 days`);
    console.log("\n🎉 Done! Trip transport plan is ready.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
