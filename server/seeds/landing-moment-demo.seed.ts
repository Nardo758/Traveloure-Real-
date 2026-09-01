import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { localExpertForms, travelPulseHiddenGems, users } from "@shared/schema";

const DEMO_CURATORS = {
  kyoto: {
    email: "moment-demo-kyoto@traveloure.test",
    handle: "dev-fixture-kyoto",
    firstName: "DEV FIXTURE",
    lastName: "Kyoto",
    city: "Kyoto",
    country: "Japan",
  },
  edinburgh: {
    email: "moment-demo-edinburgh@traveloure.test",
    handle: "dev-fixture-edinburgh",
    firstName: "DEV FIXTURE",
    lastName: "Edinburgh",
    city: "Edinburgh",
    country: "United Kingdom",
  },
  cartagena: {
    email: "moment-demo-cartagena@traveloure.test",
    handle: "dev-fixture-cartagena",
    firstName: "DEV FIXTURE",
    lastName: "Cartagena",
    city: "Cartagena",
    country: "Colombia",
  },
} as const;

const DEMO_MOMENT_GEMS = [
  {
    id: "landing-moment-demo-kyoto-proposal",
    curatorKey: "kyoto",
    city: "Kyoto",
    country: "Japan",
    placeName: "Kusho Myōjin Shrine at Ninna-ji",
    placeType: "shrine",
    gemScore: 98,
    description: "A quiet shrine setting in Kyoto for a carefully timed proposal.",
    whyLocalsLoveIt: "The temple grounds offer an intimate pause before dinner in the old city.",
    bestFor: ["proposal", "romantic", "photography"],
    priceRange: "$",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/1/15/Kusho_My%C5%8Djin_shrine%2C_Ninna-ji_temple%2C_Kyoto_-_Oct_25%2C_2009.jpg",
  },
  {
    id: "landing-moment-demo-edinburgh-golf",
    curatorKey: "edinburgh",
    city: "Edinburgh",
    country: "United Kingdom",
    placeName: "Balcomie Links Golf Course",
    placeType: "golf course",
    gemScore: 97,
    description: "A true Scottish links setting for a golf trip built around the right rounds.",
    whyLocalsLoveIt: "Wind, turf, and open coastline make the links themselves worth the journey.",
    bestFor: ["golf trip", "friends", "photography"],
    priceRange: "$",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/1/17/Balcomie_Links_Golf_Course_at_Fife_Ness_-_geograph.org.uk_-_7375989.jpg",
  },
  {
    id: "landing-moment-demo-cartagena-girls-trip",
    curatorKey: "cartagena",
    city: "Cartagena",
    country: "Colombia",
    placeName: "Cartagena at Night",
    placeType: "nightlife",
    gemScore: 96,
    description: "Cartagena after dark, when the rooftop and dinner plans begin.",
    whyLocalsLoveIt: "The city's night scenes set the pace for a long dinner and a late table.",
    bestFor: ["girls trip", "celebration", "photography"],
    priceRange: "$",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/d/de/Night_Scenes%2C_Cartagena%2C_Colombia_%2824431322999%29.jpg",
  },
] as const;

export function shouldSeedLandingMomentDemo(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.ENVIRONMENT !== "PROD";
}

async function upsertDemoCurator(curator: (typeof DEMO_CURATORS)[keyof typeof DEMO_CURATORS]): Promise<string> {
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, curator.email))
    .limit(1);

  let userId = existingUser?.id;
  if (userId) {
    await db
      .update(users)
      .set({
        firstName: curator.firstName,
        lastName: curator.lastName,
        role: "expert",
        handle: curator.handle,
        bio: "Development-only Landing Moments fixture curator.",
      })
      .where(eq(users.id, userId));
  } else {
    const [createdUser] = await db
      .insert(users)
      .values({
        email: curator.email,
        firstName: curator.firstName,
        lastName: curator.lastName,
        role: "expert",
        handle: curator.handle,
        bio: "Development-only Landing Moments fixture curator.",
      })
      .returning({ id: users.id });
    userId = createdUser.id;
  }

  const [existingForm] = await db
    .select({ id: localExpertForms.id })
    .from(localExpertForms)
    .where(eq(localExpertForms.userId, userId))
    .limit(1);

  const form = {
    firstName: curator.firstName,
    lastName: curator.lastName,
    email: curator.email,
    city: curator.city,
    country: curator.country,
    destinations: [curator.city],
    languages: ["English"],
    neighborhoods: [],
    status: "approved",
  } as const;

  if (existingForm) {
    await db.update(localExpertForms).set(form).where(eq(localExpertForms.id, existingForm.id));
  } else {
    await db.insert(localExpertForms).values({ id: crypto.randomUUID(), userId, ...form });
  }

  return userId;
}

/**
 * Creates the explicit Landing Moments demo requested by the product owner.
 *
 * The rows remain subject to the production resolver's normal trust gate:
 * non-AI photos, an attributed user, and a non-empty handle. Fixed IDs make
 * the seed idempotent and make the fixtures straightforward to remove later.
 */
export async function seedLandingMomentDemo(): Promise<{
  expertFound: boolean;
  upserted: number;
}> {
  if (!shouldSeedLandingMomentDemo()) {
    return { expertFound: false, upserted: 0 };
  }

  const curatorIds = new Map<string, string>();
  for (const [key, curator] of Object.entries(DEMO_CURATORS)) {
    curatorIds.set(key, await upsertDemoCurator(curator));
  }

  for (const gem of DEMO_MOMENT_GEMS) {
    const curatorId = curatorIds.get(gem.curatorKey);
    if (!curatorId) throw new Error(`Missing Landing Moment demo curator: ${gem.curatorKey}`);
    const { curatorKey: _curatorKey, ...gemValues } = gem;
    await db
      .insert(travelPulseHiddenGems)
      .values({
        ...gemValues,
        aiGenerated: false,
        aiGeneratedAt: null,
        curatedByExpertId: curatorId,
        discoveryStatus: "hidden",
        touristMentions: 0,
        localMentions: 1,
      })
      .onConflictDoUpdate({
        target: travelPulseHiddenGems.id,
        set: {
          city: gem.city,
          country: gem.country,
          placeName: gem.placeName,
          placeType: gem.placeType,
          gemScore: gem.gemScore,
          description: gem.description,
          whyLocalsLoveIt: gem.whyLocalsLoveIt,
          bestFor: [...gem.bestFor],
          priceRange: gem.priceRange,
          imageUrl: gem.imageUrl,
          aiGenerated: false,
          aiGeneratedAt: null,
          curatedByExpertId: curatorId,
          discoveryStatus: "hidden",
          lastUpdated: new Date(),
        },
      });
  }

  return { expertFound: curatorIds.size === Object.keys(DEMO_CURATORS).length, upserted: DEMO_MOMENT_GEMS.length };
}