/**
 * landing-moments.ts — the Moments config + resolution (Landing v2.5 Lane 2).
 *
 * ONE row per moment (ruling 2026-09-01-landing-moments): key, the decision-maker's ratified
 * copy (docs/design/MOMENTS_COPY.md, run-as-is + honesty riders), market city, and the coarse
 * `experienceType` its CTA prefills (ruling 2026-09-01-moment-key — momentKey carries the fine
 * identity, and it equals `key`). The `label` is the tab-strip pill text.
 *
 * PHOTO GATE — a TRUST surface (ruling 2026-09-01-photo-tiers): a moment's photos are ATTRIBUTED
 * REAL photos ONLY — an expert-curated gem whose image is NOT stock, with the curating expert's
 * `@handle` resolving the caption. Stock hosts (unsplash/pexels/google) are excluded, so seeded
 * gem imagery never counts. `resolveLandingMoments` returns only moments with ≥1 such photo;
 * with today's data that is [] (Phase 0: every photo-bearing gem is Unsplash stock), so the
 * client suppresses the section (empty state B). Builder byline is the curating expert's real
 * handle + review count, honest-omitted when absent (§13).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

export interface MomentConfig {
  key: string;
  label: string;
  eyebrow: string;
  headline: string;
  pieces: [string, string, string];
  experienceType: string; // coarse machine key the CTA prefills
  city: string; // market
}

/** Ratified copy (MOMENTS_COPY.md). momentKey === key. */
export const MOMENTS: MomentConfig[] = [
  {
    key: "proposal",
    label: "Proposal",
    eyebrow: "A proposal in Kyoto",
    headline: "The spot, the photographer, the dinner after — and the ring stays your secret.",
    pieces: [
      "Yuki picks the lane in Gion no guide lists — and the hour it empties.",
      "A photographer waits out of sight; you never see the camera.",
      "Kaiseki booked for after, the counter seat held.",
    ],
    experienceType: "event",
    city: "Kyoto",
  },
  {
    key: "golf",
    label: "Golf trip",
    eyebrow: "A golf trip in Scotland",
    headline: "Four rounds in the right order, on the courses worth the trip — and a car that runs the bags between links.",
    pieces: [
      "A local who knows which courses are worth your four rounds — and the order that plays each at its best hour.",
      "A driver runs the bags between links so no one carries a bag off the 18th to a train.",
      "Tee times booked in sequence, the whisky bar after each round already on the list.",
    ],
    experienceType: "travel",
    city: "Edinburgh",
  },
  {
    key: "girls_trip",
    label: "Girls' trip",
    eyebrow: "A girls' trip in Cartagena",
    headline: "The rooftop before it fills, the boat that skips the crowded cay, the table for eight that never says no.",
    pieces: [
      "A local who reads the night — which rooftop is worth it Thursday, which is dead — so you never waste a sunset.",
      "A private boat runs you to the island the day-tour flotillas don't reach, lunch aboard.",
      "Dinner for eight held at the courtyard place that “doesn't take groups,” the late table yours.",
    ],
    experienceType: "travel",
    city: "Cartagena",
  },
  {
    key: "anniversary",
    label: "Anniversary",
    eyebrow: "An anniversary in Porto",
    headline: "The cellar that isn't on the tour, the river at the hour it turns gold, dinner where they remember your year.",
    pieces: [
      "A local who opens the family cellar that runs no public tastings — a vintage from the year you married, poured for you two.",
      "A boat down the Douro timed to the light, not the schedule the day-trips run on.",
      "The corner table at the place with no sign held for 8pm, the port after already chosen.",
    ],
    experienceType: "event",
    city: "Porto",
  },
  {
    key: "honeymoon",
    label: "Honeymoon",
    eyebrow: "A honeymoon in Goa",
    headline: "The beach the resorts can't sell you, the cook who comes to you, the morning nobody schedules.",
    pieces: [
      "A local who sends you to the south-Goa cove the package tours never reach — and the shack that grills the morning's catch.",
      "A private cook sets dinner on the sand for two, the menu built around what the boats brought in.",
      "One day left deliberately empty — a boat on call if you want it, nothing booked if you don't.",
    ],
    experienceType: "travel",
    city: "Goa",
  },
  {
    key: "milestone_birthday",
    label: "Milestone birthday",
    eyebrow: "A milestone birthday in Mumbai",
    headline: "The city's best night, engineered — the table, the car, the after-party you didn't know existed.",
    pieces: [
      "A local who builds the night around the one restaurant worth the wait — and gets you in on a Saturday.",
      "A car holds between the dinner, the bar, and the rooftop so the group never stands on a curb.",
      "The private room at the place that “only does members” blocked for your name, cake in on cue.",
    ],
    experienceType: "event",
    city: "Mumbai",
  },
  {
    key: "family_occasion",
    label: "Family occasion",
    eyebrow: "A family occasion in Jaipur",
    headline: "Three generations, one palace courtyard, and a plan that moves at everyone's pace.",
    pieces: [
      "A local who opens a heritage haveli's courtyard for the family dinner — the host family cooking, not a banquet hall.",
      "Cars sized to the group carry grandparents and kids the same route, no one left standing in the heat.",
      "The fort visit booked for the cool hour, a guide who slows for the elders, the evening table held after.",
    ],
    experienceType: "event",
    city: "Jaipur",
  },
];

export const MOMENT_KEYS: readonly string[] = MOMENTS.map((m) => m.key);
export const MOMENT_EVENT_KINDS = ["impression", "tab", "dot", "cta"] as const;
export type MomentEventKind = (typeof MOMENT_EVENT_KINDS)[number];

export interface MomentPhoto {
  url: string;
  place: string;
  handle: string;
}
export interface LiveMoment {
  key: string;
  label: string;
  eyebrow: string;
  headline: string;
  pieces: string[];
  experienceType: string;
  photos: MomentPhoto[];
  builder: { handle: string; reviews: number } | null;
}

/**
 * Attributed real photos for a market: an expert-curated gem whose image is NOT stock, with the
 * curating expert's handle. The gate excludes stock hosts (unsplash/pexels/google), so seeded
 * imagery never qualifies. Returns photos + the curating expert's handle/review-count (the
 * builder byline source). Best-effort: a query failure yields [] (the moment stays out — §13).
 */
async function attributedPhotosForCity(
  city: string,
): Promise<{ photos: MomentPhoto[]; builder: { handle: string; reviews: number } | null }> {
  try {
    // NOTE: `users` has no review_count column, so the builder review count honest-omits (0 → the
    // byline shows "built by @handle" with no count). A real per-expert review count is a filed
    // follow-up; §13 — never a fabricated number.
    const rows = await db.execute(sql`
      SELECT g.image_url AS url, g.place_name AS place, u.handle AS handle
      FROM travel_pulse_hidden_gems g
      JOIN users u ON u.id = g.curated_by_expert_id
      WHERE g.city ILIKE ${city}
        AND g.image_url IS NOT NULL AND g.image_url <> ''
        AND COALESCE(g.ai_generated, false) = false
        AND u.handle IS NOT NULL AND u.handle <> ''
        AND g.image_url NOT ILIKE '%unsplash%'
        AND g.image_url NOT ILIKE '%pexels%'
        AND g.image_url NOT ILIKE '%googleusercontent%'
        AND g.image_url NOT ILIKE '%googleapis%'
      ORDER BY g.gem_score DESC NULLS LAST
      LIMIT 4
    `);
    const list = (rows.rows ?? []) as Array<{ url: string; place: string; handle: string }>;
    const photos: MomentPhoto[] = list.map((r) => ({ url: r.url, place: r.place, handle: r.handle }));
    const builder = list.length > 0 ? { handle: list[0].handle, reviews: 0 } : null;
    return { photos, builder };
  } catch (e: any) {
    console.error("[landing-moments] photo query failed (moment stays out):", e?.message);
    return { photos: [], builder: null };
  }
}

/** Only moments with ≥1 attributed real photo. Today: [] (the section suppresses — empty state B). */
export async function resolveLandingMoments(): Promise<LiveMoment[]> {
  const live: LiveMoment[] = [];
  for (const m of MOMENTS) {
    const { photos, builder } = await attributedPhotosForCity(m.city);
    if (photos.length === 0) continue;
    live.push({
      key: m.key,
      label: m.label,
      eyebrow: m.eyebrow,
      headline: m.headline,
      pieces: [...m.pieces],
      experienceType: m.experienceType,
      photos,
      builder,
    });
  }
  return live;
}
