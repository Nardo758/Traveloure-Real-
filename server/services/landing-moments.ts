/**
 * landing-moments.ts — the Moments config + resolution (Landing v2.5 Lane 2).
 *
 * ONE row per moment (ruling 2026-09-01-landing-moments): key, the decision-maker's ratified
 * copy (docs/design/MOMENTS_COPY.md, run-as-is + honesty riders), market city, and the coarse
 * `experienceType` its CTA prefills (ruling 2026-09-01-moment-key — momentKey carries the fine
 * identity, and it equals `key`). The `label` is the tab-strip pill text.
 *
 * PHOTO GATE — a TRUST surface (ruling 2026-09-01-photo-tiers): attributed expert photos remain
 * subject to the strict non-stock gate. Until one qualifies, the moment uses a bundled Creative
 * Commons representative photo with visible license credit and no expert attribution. A real
 * photo replaces that fallback only when it is associated with the specific Moment; the current
 * city-level query is intentionally bypassed for the approved pinned Moments below.
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
  /**
   * The `experience_types` SLUG this moment is an instance of — the ONE runtime occasion
   * vocabulary (ledger `2026-09-03-occasion-vocabulary`). `experienceType` above stays the coarse
   * two-value machine key the AI chooser already accepts and is deliberately untouched; this rides
   * beside it so the CTA can seed the plan's occasion with a real catalog row instead of a word
   * that matches nothing.
   *
   * **Only a slug the seeder actually writes may appear here, or `null`.** A moment with no
   * seeded row carries `null` and the client simply seeds no occasion — never an invented slug
   * that would render an empty template page (§13).
   */
  experienceSlug: string | null;
  city: string; // market
  /**
   * The approved image for this curated Moment is more specific than the city-level expert
   * photo query. Keep it pinned until expert media can be associated with a moment key.
   */
  representativeOnly?: boolean;
}

/** Ratified copy (MOMENTS_COPY.md). momentKey === key. */
export const MOMENTS: MomentConfig[] = [
  {
    // Ratified by ledger `2026-09-04-wedding-landing-moment` (artboard
    // docs/design/wedding-flow/Main.dc.html). FIRST in the roster because roster order IS the
    // order the live set is built in, and the section's rotation starts at index 0 — so the
    // artboard's "Wedding active by default" is exactly this position, not a second concept.
    //
    // No expert photo is seeded for this row. Until a qualifying attributed photo exists, the
    // resolver uses the visibly labeled representative image; the real-photo gate is never
    // loosened to make a stock image appear expert-supplied.
    key: "wedding",
    label: "Wedding",
    eyebrow: "A wedding weekend in Kyoto",
    headline:
      "Three days, one plan — the rehearsal dinner Friday, the ceremony at three, the brunch nobody has to organize.",
    pieces: [
      "A local who knows which temple garden will hold a ceremony, and the hour the light is right for it.",
      "Welcome drinks Friday, hair and makeup at seven, the reception at six — each its own event on one plan, one guest list.",
      "Guests arriving from four countries land on the same slip, each with their own room and their own RSVP.",
    ],
    // One of the five frozen coarse keys the AI chooser accepts (ruling 2026-09-01-moment-key).
    experienceType: "wedding",
    // The seeded `experience_types` row (server/seed-experience-types.ts) — a real catalog slug.
    experienceSlug: "wedding",
    city: "Kyoto",
    representativeOnly: true,
  },
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
    experienceSlug: "proposal",
    city: "Kyoto",
    representativeOnly: true,
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
    // Golf has its own seeded row since ledger `2026-09-04-golf-occasion-and-housekeeping`. It
    // pointed at the generic `travel` occasion until then, whose `schedule: false` switch meant
    // this Moment's own promise — "tee times booked in sequence" — could never be asked for: the
    // step that collects them is only visible when the bound occasion says it has a schedule.
    experienceSlug: "golf-trip",
    city: "Edinburgh",
    representativeOnly: true,
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
    experienceSlug: "girls-trip",
    city: "Cartagena",
    representativeOnly: true,
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
    // The COUPLES anniversary (`anniversary-trip`), not the wedding-anniversary party
    // (`wedding-anniversaries`) — two seeded rows, and this moment is the getaway.
    experienceSlug: "anniversary-trip",
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
    // Ledger `2026-09-03-occasion-hygiene`: `honeymoon` is now a real `experience_types` row, so
    // this Moment seeds its OWN occasion instead of the generic `travel` row it borrowed while
    // none existed — the same repair `milestone-birthday` got one ledger row earlier.
    experienceSlug: "honeymoon",
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
    // Seeded by ledger `2026-09-03-occasion-switches`: `milestone-birthday` is now a real
    // `experience_types` row, so this Moment points at its OWN occasion instead of the generic
    // `birthday` row it borrowed while none existed.
    experienceSlug: "milestone-birthday",
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
    // Ratified and seeded by ledger `2026-09-03-occasion-switches` — the row this Moment's CTA
    // had no honest target for now exists, so it stops seeding no occasion at all.
    experienceSlug: "family-occasion",
    city: "Jaipur",
  },
];

export const MOMENT_KEYS: readonly string[] = MOMENTS.map((m) => m.key);
export const MOMENT_EVENT_KINDS = ["impression", "tab", "dot", "cta"] as const;
export type MomentEventKind = (typeof MOMENT_EVENT_KINDS)[number];

function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.ENVIRONMENT === "PROD";
}

/**
 * A momentKey is ACCEPTABLE when it is absent (undefined/null/"") OR a known key. A
 * present-but-unknown key is a forged/invalid input and callers reject it (400). Used by the AI
 * generate route so a bad key never silently proceeds (Landing v2.5 L2/L3, ruling 2026-09-01-moment-key).
 */
export function isMomentKeyAcceptable(momentKey: unknown): boolean {
  if (momentKey === undefined || momentKey === null || momentKey === "") return true;
  return typeof momentKey === "string" && (MOMENT_KEYS as readonly string[]).includes(momentKey);
}

/**
 * The PROMPT-ONLY occasion line for a valid momentKey, else "". This is NEVER written to any
 * user-authored column (L2): it exists only to fold the fine occasion into the generation prompt
 * ("Occasion: this trip is a proposal.") — the persisted specialRequests stays the user's text.
 */
export function occasionPromptLine(momentKey: unknown): string {
  return typeof momentKey === "string" && (MOMENT_KEYS as readonly string[]).includes(momentKey)
    ? `Occasion: this trip is a ${momentKey.replace(/_/g, " ")}.`
    : "";
}

export interface MomentPhoto {
  url: string;
  place: string;
  source: "expert" | "representative";
  handle: string | null;
  credit?: string;
  license?: string;
  sourceUrl?: string;
}
export interface LiveMoment {
  key: string;
  label: string;
  eyebrow: string;
  headline: string;
  pieces: string[];
  experienceType: string;
  /** The seeded `experience_types` slug, or null when this moment has no row yet. */
  experienceSlug: string | null;
  photos: MomentPhoto[];
  builder: { handle: string; reviews: number } | null;
}

const REPRESENTATIVE_PHOTOS: Record<
  string,
  Pick<MomentPhoto, "url" | "place" | "source" | "handle" | "credit" | "license" | "sourceUrl">
> = {
  wedding: {
    url: "/images/moments/goa-honeymoon.jpg",
    place: "Goa at sunset",
    source: "representative",
    handle: null,
    credit: "Lucksborn Sangma",
    license: "Pexels license",
    sourceUrl: "https://www.pexels.com/photo/silhouettes-of-bride-and-groom-hugging-at-sunset-5026140/",
  },
  proposal: {
    url: "/images/moments/proposal-after-dark.jpg",
    place: "A proposal after dark",
    source: "representative",
    handle: null,
    credit: "Elist Nguyen",
    license: "Unsplash License",
    sourceUrl: "https://unsplash.com/photos/man-proposes-to-woman-at-night-by-city-lights-IvXYgLLo08A?utm_source=traveloure&utm_medium=referral",
  },
  golf: {
    url: "/images/moments/edinburgh-golf.jpg",
    place: "The final tee time",
    source: "representative",
    handle: null,
    credit: "cottonbro studio",
    license: "Pexels license",
    sourceUrl: "https://www.pexels.com/photo/a-man-holding-a-golf-club-6256838/",
  },
  girls_trip: {
    url: "/images/moments/cartagena-girls-trip.jpg",
    place: "A night out together",
    source: "representative",
    handle: null,
    credit: "Yaroslav Shuraev",
    license: "Pexels license",
    sourceUrl: "https://www.pexels.com/photo/young-women-in-street-style-fashion-standing-for-a-group-photo-7645790/",
  },
  anniversary: {
    url: "/images/moments/porto-anniversary.jpg",
    place: "The Douro riverfront, Porto",
    source: "representative",
    handle: null,
    credit: "Yuri Félix",
    license: "Pexels license",
    sourceUrl: "https://www.pexels.com/photo/woman-sitting-and-man-lying-down-on-wall-by-river-19196622/",
  },
  honeymoon: {
    url: "/images/moments/kyoto-wedding.jpg",
    place: "Kyoto after dark",
    source: "representative",
    handle: null,
    credit: "Julien",
    license: "Pexels license",
    sourceUrl: "https://www.pexels.com/photo/couple-strolling-in-kyoto-s-nighttime-alley-34576557/",
  },
  milestone_birthday: {
    url: "/images/moments/mumbai-birthday.jpg",
    place: "A rooftop celebration after dark",
    source: "representative",
    handle: null,
    credit: "Nguyen Hung",
    license: "Pexels license",
    sourceUrl: "https://www.pexels.com/photo/night-party-celebration-with-friends-on-rooftop-30592863/",
  },
  family_occasion: {
    url: "/images/moments/jaipur-family.jpg",
    place: "A family celebration at dusk",
    source: "representative",
    handle: null,
    credit: "Yan Krukau",
    license: "Pexels license",
    sourceUrl: "https://www.pexels.com/photo/people-standing-on-the-balcony-while-holding-lighted-sparkler-8818591/",
  },
};

export function selectMomentPhotos(
  momentKey: string,
  attributedPhotos: MomentPhoto[],
  attributedBuilder: { handle: string; reviews: number } | null = null,
): { photos: MomentPhoto[]; builder: { handle: string; reviews: number } | null } {
  const moment = MOMENTS.find((candidate) => candidate.key === momentKey);
  const representative = REPRESENTATIVE_PHOTOS[momentKey];

  if (moment?.representativeOnly && representative) {
    return { photos: [representative], builder: null };
  }

  if (attributedPhotos.length > 0) {
    return { photos: attributedPhotos, builder: attributedBuilder };
  }

  return {
    photos: representative ? [representative] : [],
    builder: null,
  };
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
      JOIN local_expert_forms f
        ON f.user_id = u.id
       AND LOWER(TRIM(f.city)) = LOWER(TRIM(${city}))
      WHERE g.city ILIKE ${city}
        AND g.image_url IS NOT NULL AND g.image_url <> ''
        AND COALESCE(g.ai_generated, false) = false
        AND u.handle IS NOT NULL AND u.handle <> ''
        AND g.image_url NOT ILIKE '%unsplash%'
        AND g.image_url NOT ILIKE '%pexels%'
        AND g.image_url NOT ILIKE '%googleusercontent%'
        AND g.image_url NOT ILIKE '%googleapis%'
        ${isProductionRuntime() ? sql`AND u.email NOT ILIKE '%@traveloure.test'` : sql``}
      ORDER BY g.gem_score DESC NULLS LAST
      LIMIT 4
    `);
    const list = (rows.rows ?? []) as Array<{ url: string; place: string; handle: string }>;
    const photos: MomentPhoto[] = list.map((r) => ({
      url: r.url,
      place: r.place,
      source: "expert",
      handle: r.handle,
    }));
    const builder = list.length > 0 ? { handle: list[0].handle, reviews: 0 } : null;
    return { photos, builder };
  } catch (e: any) {
    console.error("[landing-moments] photo query failed (moment stays out):", e?.message);
    return { photos: [], builder: null };
  }
}

/** Real attributed photos win; otherwise each configured moment uses its honest representative fallback. */
export async function resolveLandingMoments(): Promise<LiveMoment[]> {
  const live: LiveMoment[] = [];
  for (const m of MOMENTS) {
    const attributed = m.representativeOnly
      ? { photos: [], builder: null }
      : await attributedPhotosForCity(m.city);
    const selected = selectMomentPhotos(m.key, attributed.photos, attributed.builder);
    const resolvedPhotos = selected.photos;
    if (resolvedPhotos.length === 0) continue;
    live.push({
      key: m.key,
      label: m.label,
      eyebrow: m.eyebrow,
      headline: m.headline,
      pieces: [...m.pieces],
      experienceType: m.experienceType,
      experienceSlug: m.experienceSlug,
      photos: resolvedPhotos,
      builder: selected.builder,
    });
  }
  return live;
}
