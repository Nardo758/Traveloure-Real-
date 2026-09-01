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
    placeName: "Arashiyama Bamboo Forest",
    placeType: "attraction",
    gemScore: 98,
    description: "A quiet walk through Arashiyama's towering bamboo grove.",
    whyLocalsLoveIt: "Early mornings reveal the grove before the daytime crowds arrive.",
    bestFor: ["proposal", "romantic", "photography"],
    priceRange: "$",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/4/4a/Bamboo_Forest%2C_Arashiyama%2C_Kyoto%2C_Japan.jpg",
  },
  {
    id: "landing-moment-demo-edinburgh-golf",
    city: "Edinburgh",
    country: "United Kingdom",
    placeName: "Ross Fountain and Edinburgh Castle",
    placeType: "viewpoint",
    gemScore: 97,
    description: "A classic Edinburgh view from Princes Street Gardens.",
    whyLocalsLoveIt: "The fountain frames the castle and the Old Town skyline in one walk.",
    bestFor: ["golf trip", "friends", "photography"],
    priceRange: "$",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/b/bc/Ross_Fountain_and_Castle%2C_Edinburgh_%28IMG_20190628_175956%29.jpg",
  },
  {
    id: "landing-moment-demo-cartagena-girls-trip",
    city: "Cartagena",
    country: "Colombia",
    placeName: "Cartagena Old City",
    placeType: "neighborhood",
    gemScore: 96,
    description: "Colorful colonial streets inside Cartagena's historic walls.",
    whyLocalsLoveIt: "The old city comes alive around its shaded plazas and evening promenades.",
    bestFor: ["girls trip", "celebration", "photography"],
    priceRange: "$",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/a/ab/Cartagena_Old_City.JPG",
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