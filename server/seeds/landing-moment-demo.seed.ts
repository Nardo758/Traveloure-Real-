import { eq } from "drizzle-orm";
import { db } from "../db";
import { travelPulseHiddenGems, users } from "@shared/schema";

const TEST_EXPERT_EMAIL = "yuki.nakamura@example.com";
const TEST_EXPERT_HANDLE = "yuki-flowers";

const DEMO_MOMENT_GEMS = [
  {
    id: "landing-moment-demo-kyoto-proposal",
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
  const [testExpert] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TEST_EXPERT_EMAIL))
    .limit(1);

  if (!testExpert) {
    return { expertFound: false, upserted: 0 };
  }

  await db
    .update(users)
    .set({ handle: TEST_EXPERT_HANDLE })
    .where(eq(users.id, testExpert.id));

  for (const gem of DEMO_MOMENT_GEMS) {
    await db
      .insert(travelPulseHiddenGems)
      .values({
        ...gem,
        aiGenerated: false,
        aiGeneratedAt: null,
        curatedByExpertId: testExpert.id,
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
          curatedByExpertId: testExpert.id,
          discoveryStatus: "hidden",
          lastUpdated: new Date(),
        },
      });
  }

  return { expertFound: true, upserted: DEMO_MOMENT_GEMS.length };
}