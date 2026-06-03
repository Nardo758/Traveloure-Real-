#!/usr/bin/env tsx

/**
 * Popular Cities Content Seed
 *
 * Seeds hidden gems (5-10 per city) and at least one active providerServices
 * row for Tokyo, Kyoto, and Paris so the location feed is never empty in a
 * fresh environment.
 *
 * Categories used: restaurant/café (Eat), attraction/activity (Do),
 * hotel/ryokan (Stay), photography (Photo).
 *
 * Neighborhood slugs match those in city-neighborhoods.seed.ts.
 *
 * Idempotent: skips rows whose placeName already exists in the city.
 *
 * Run standalone: `tsx server/seeds/popular-cities-content.seed.ts`
 */

import { db } from "../db";
import { travelPulseHiddenGems, providerServices, users } from "@shared/schema";
import { and, eq, ilike } from "drizzle-orm";
import { logger } from "../infrastructure";

interface GemSeed {
  city: string;
  country: string;
  placeName: string;
  placeType: string;
  address?: string;
  latitude: string;
  longitude: string;
  localRating: string;
  touristMentions: number;
  localMentions: number;
  gemScore: number;
  discoveryStatus: string;
  daysUntilMainstream?: number;
  description: string;
  whyLocalsLoveIt: string;
  bestFor: string[];
  priceRange: string;
  neighborhood: string;
}

const HIDDEN_GEMS: GemSeed[] = [
  // ── TOKYO ────────────────────────────────────────────────────────────────
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Kayaba Coffee",
    placeType: "café",
    address: "6-1-29 Yanaka, Taito City, Tokyo",
    latitude: "35.7234000",
    longitude: "139.7657000",
    localRating: "4.7",
    touristMentions: 120,
    localMentions: 890,
    gemScore: 82,
    discoveryStatus: "hidden",
    daysUntilMainstream: 180,
    description: "A beautifully preserved 1930s wooden coffee house in the Yanaka shitamachi. Famous for its thick tamago-sando (egg sandwich) and single-origin pour-over.",
    whyLocalsLoveIt: "Time-stands-still atmosphere, no Instagram crowds, and the best morning set in east Tokyo.",
    bestFor: ["slow mornings", "breakfast", "photography", "solo travel"],
    priceRange: "$",
    neighborhood: "yanaka",
  },
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Disk Union Shimokitazawa",
    placeType: "shop",
    address: "2-25-8 Kitazawa, Setagaya City, Tokyo",
    latitude: "35.6617000",
    longitude: "139.6683000",
    localRating: "4.8",
    touristMentions: 85,
    localMentions: 1200,
    gemScore: 79,
    discoveryStatus: "hidden",
    daysUntilMainstream: 220,
    description: "Seven-floor vinyl heaven stacked with Japanese pressings, jazz, city pop, and rare imports. Each floor is a different genre.",
    whyLocalsLoveIt: "Serious collectors come weekly. You'll find late-70s Japanese city pop LPs for a few hundred yen.",
    bestFor: ["music lovers", "rainy days", "unique souvenirs", "budget shopping"],
    priceRange: "$",
    neighborhood: "shimokitazawa",
  },
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Nakameguro Koukashita",
    placeType: "restaurant",
    address: "Under the Tokyu Toyoko Line, Meguro City, Tokyo",
    latitude: "35.6442000",
    longitude: "139.6979000",
    localRating: "4.6",
    touristMentions: 200,
    localMentions: 1500,
    gemScore: 74,
    discoveryStatus: "emerging",
    daysUntilMainstream: 90,
    description: "A curated strip of micro-restaurants, coffee roasters, and craft-beer bars built under the elevated rail line along the Meguro canal.",
    whyLocalsLoveIt: "Canal views, zero tourist traps, and genuinely creative chefs working tiny open kitchens.",
    bestFor: ["date night", "craft beer", "canal photos", "evening out"],
    priceRange: "$$",
    neighborhood: "nakameguro",
  },
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Asakusa Hoppy Street",
    placeType: "bar",
    address: "Hoppy-dori, Asakusa, Taito City, Tokyo",
    latitude: "35.7146000",
    longitude: "139.7945000",
    localRating: "4.5",
    touristMentions: 300,
    localMentions: 1800,
    gemScore: 71,
    discoveryStatus: "emerging",
    daysUntilMainstream: 60,
    description: "A rowdy pedestrian street where old-timers have drunk Hoppy (low-alcohol beer mix) and eaten stewed offal since the post-war era. Plastic stools spill onto the cobbles.",
    whyLocalsLoveIt: "Unpretentious, dirt cheap, and utterly Tokyo working-class culture. The shichirin grilled skewers are sublime.",
    bestFor: ["budget dining", "local culture", "evening drinks", "street food"],
    priceRange: "$",
    neighborhood: "asakusa",
  },
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Golden Gai at 2am",
    placeType: "bar district",
    address: "Golden Gai, Kabukicho, Shinjuku City, Tokyo",
    latitude: "35.6940000",
    longitude: "139.7050000",
    localRating: "4.9",
    touristMentions: 500,
    localMentions: 3000,
    gemScore: 88,
    discoveryStatus: "hidden",
    daysUntilMainstream: 365,
    description: "200+ micro bars packed into six tiny alleyways. Each fits 6-8 people, has its own theme, and is run by a single bartender who often doubles as the DJ and chef.",
    whyLocalsLoveIt: "Nowhere else on earth feels like this after midnight. Each bar is a world unto itself.",
    bestFor: ["nightlife", "solo travel", "conversation", "unique experience"],
    priceRange: "$$",
    neighborhood: "shinjuku",
  },
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Tsutaya Books Daikanyama T-Site",
    placeType: "bookshop",
    address: "17-5 Sarugakucho, Shibuya City, Tokyo",
    latitude: "35.6494000",
    longitude: "139.7036000",
    localRating: "4.9",
    touristMentions: 350,
    localMentions: 2200,
    gemScore: 76,
    discoveryStatus: "emerging",
    description: "A landmark bookshop and cultural complex open until 2am — architecture magazines, a vinyl lounge, a Starbucks Reserve, and gardens designed for slow browsing.",
    whyLocalsLoveIt: "The best place in Tokyo to spend a rainy Sunday. The staff curation is extraordinary — every table is an education.",
    bestFor: ["book lovers", "design", "rainy days", "coffee", "photography"],
    priceRange: "$",
    neighborhood: "daikanyama",
  },
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Yanaka Ginza Shopping Street",
    placeType: "market street",
    address: "Yanaka Ginza, Taito City, Tokyo",
    latitude: "35.7265000",
    longitude: "139.7663000",
    localRating: "4.6",
    touristMentions: 280,
    localMentions: 1600,
    gemScore: 73,
    discoveryStatus: "emerging",
    description: "A 170-metre shotengai (covered shopping street) that escaped wartime bombing. Family-run tofu shops, cat cafés, sweet shops, and fishmongers since the 1940s.",
    whyLocalsLoveIt: "Strolling here feels like 1970s Tokyo. Locals do their actual grocery shopping here.",
    bestFor: ["street food", "photography", "local culture", "souvenirs"],
    priceRange: "$",
    neighborhood: "yanaka",
  },

  // ── KYOTO ────────────────────────────────────────────────────────────────
  {
    city: "Kyoto",
    country: "Japan",
    placeName: "Ippodo Tea Honten",
    placeType: "tea shop",
    address: "52 Teramachi Nijo-agaru, Nakagyo Ward, Kyoto",
    latitude: "35.0156000",
    longitude: "135.7672000",
    localRating: "4.9",
    touristMentions: 150,
    localMentions: 2100,
    gemScore: 85,
    discoveryStatus: "hidden",
    daysUntilMainstream: 240,
    description: "Established in 1717, this is the definitive matcha source for Kyoto's tea masters. The adjoining Kaboku tearoom lets you order any tea from their range, brewed precisely.",
    whyLocalsLoveIt: "Serious tea culture, zero tourist kitsch. The staff can guide you to the perfect sencha for your taste and budget.",
    bestFor: ["tea lovers", "cultural immersion", "gifts", "quiet afternoon"],
    priceRange: "$$",
    neighborhood: "kawaramachi-sanjo",
  },
  {
    city: "Kyoto",
    country: "Japan",
    placeName: "Fushimi Inari Pre-Dawn Hike",
    placeType: "attraction",
    address: "68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto",
    latitude: "34.9671000",
    longitude: "135.7727000",
    localRating: "5.0",
    touristMentions: 2000,
    localMentions: 4000,
    gemScore: 92,
    discoveryStatus: "hidden",
    daysUntilMainstream: 730,
    description: "The famous 10,000 torii path is magical but overcrowded by 8am. Arriving at 4:30am — the gates open 24 hours — means walking the full summit trail completely alone in mist and candlelight.",
    whyLocalsLoveIt: "Dawn at the summit is a genuinely spiritual experience. Most tourists only do the first 30 minutes.",
    bestFor: ["photography", "hiking", "spiritual experience", "avoiding crowds"],
    priceRange: "$",
    neighborhood: "fushimi",
  },
  {
    city: "Kyoto",
    country: "Japan",
    placeName: "Nishiki Market Side Alleys",
    placeType: "market",
    address: "Nishiki Market, Nakagyo Ward, Kyoto",
    latitude: "35.0052000",
    longitude: "135.7648000",
    localRating: "4.7",
    touristMentions: 800,
    localMentions: 3500,
    gemScore: 78,
    discoveryStatus: "emerging",
    description: "Kyoto's 'kitchen' market — 100+ stalls of pickled vegetables, fresh tofu, grilled skewers, and seasonal sweets. The tiny perpendicular alleys off the main lane have the best value eating.",
    whyLocalsLoveIt: "Grandmothers still come here for their daily pickles. The tsukemono varieties are unmatched anywhere.",
    bestFor: ["food tasting", "local culture", "souvenirs", "lunch"],
    priceRange: "$",
    neighborhood: "kawaramachi-sanjo",
  },
  {
    city: "Kyoto",
    country: "Japan",
    placeName: "Kanga-an Temple Shojin Ryori",
    placeType: "restaurant",
    address: "17 Miyanishicho, Kita Ward, Kyoto",
    latitude: "35.0454000",
    longitude: "135.7447000",
    localRating: "4.8",
    touristMentions: 60,
    localMentions: 480,
    gemScore: 86,
    discoveryStatus: "hidden",
    daysUntilMainstream: 300,
    description: "A 17th-century Zen temple offering shojin ryori (Buddhist vegetarian cuisine) in private tatami rooms overlooking a moss garden. Reservation weeks in advance required.",
    whyLocalsLoveIt: "The seasonally changing kaiseki-style menu is sourced entirely from the temple's own garden and local farmers.",
    bestFor: ["fine dining", "vegetarian", "cultural immersion", "peaceful escape"],
    priceRange: "$$$",
    neighborhood: "nishijin",
  },
  {
    city: "Kyoto",
    country: "Japan",
    placeName: "Pontocho Alley at Dusk",
    placeType: "bar district",
    address: "Pontocho, Nakagyo Ward, Kyoto",
    latitude: "35.0083000",
    longitude: "135.7707000",
    localRating: "4.8",
    touristMentions: 900,
    localMentions: 2800,
    gemScore: 80,
    discoveryStatus: "emerging",
    description: "A 500-metre stone alley running parallel to the Kamo River. In summer, restaurants extend kawayuka (elevated riverside platforms) over the water for open-air dining.",
    whyLocalsLoveIt: "The pre-dinner golden hour — lanterns lit before crowds arrive — is the most photogenic moment in all Kyoto.",
    bestFor: ["photography", "date night", "evening drinks", "summer dining"],
    priceRange: "$$",
    neighborhood: "pontocho",
  },
  {
    city: "Kyoto",
    country: "Japan",
    placeName: "Philosopher's Path Café Route",
    placeType: "café",
    address: "Tetsugaku no Michi, Sakyo Ward, Kyoto",
    latitude: "35.0168000",
    longitude: "135.7940000",
    localRating: "4.7",
    touristMentions: 600,
    localMentions: 2000,
    gemScore: 75,
    discoveryStatus: "emerging",
    description: "The canal-side walking path connecting Nanzen-ji to Ginkaku-ji passes a dozen independent cafés tucked into machiya townhouses — each different, all excellent.",
    whyLocalsLoveIt: "The canal walk in cherry blossom season is transcendent, but most tourists rush it. The cafés are the secret reward.",
    bestFor: ["walking", "photography", "coffee", "cherry blossom season"],
    priceRange: "$",
    neighborhood: "higashiyama",
  },

  // ── PARIS ────────────────────────────────────────────────────────────────
  {
    city: "Paris",
    country: "France",
    placeName: "Marché d'Aligre",
    placeType: "market",
    address: "Place d'Aligre, 75012 Paris",
    latitude: "48.8500000",
    longitude: "2.3740000",
    localRating: "4.8",
    touristMentions: 180,
    localMentions: 3200,
    gemScore: 84,
    discoveryStatus: "hidden",
    daysUntilMainstream: 200,
    description: "The most Parisian market in Paris — outdoor flea stalls open from 7am Thursday to Sunday, surrounded by covered food halls with oysters, charcuterie, and cheese.",
    whyLocalsLoveIt: "Flea items for €2 that tourists pay €50 for in Le Marais. The covered Beauvau hall has the best oyster bar in the 12th.",
    bestFor: ["bargain hunting", "food tasting", "local culture", "morning"],
    priceRange: "$",
    neighborhood: "bastille",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Buttes-Chaumont Park Viewpoint",
    placeType: "attraction",
    address: "Parc des Buttes-Chaumont, 75019 Paris",
    latitude: "48.8788000",
    longitude: "2.3817000",
    localRating: "4.9",
    touristMentions: 250,
    localMentions: 4500,
    gemScore: 87,
    discoveryStatus: "hidden",
    daysUntilMainstream: 365,
    description: "Paris's most dramatic park — a Victorian landscape with a rocky island temple, suspension bridge, and sweeping panoramas across the city. Locals picnic here while tourists queue at Eiffel.",
    whyLocalsLoveIt: "The island temple view at golden hour is equal to any postcard Paris — completely free and uncrowded.",
    bestFor: ["picnic", "photography", "families", "afternoon escape"],
    priceRange: "$",
    neighborhood: "belleville",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Au Passage",
    placeType: "restaurant",
    address: "1bis Passage Saint-Sébastien, 75011 Paris",
    latitude: "48.8605000",
    longitude: "2.3715000",
    localRating: "4.8",
    touristMentions: 120,
    localMentions: 1800,
    gemScore: 83,
    discoveryStatus: "hidden",
    daysUntilMainstream: 180,
    description: "A cult natural-wine bar and small plates restaurant hidden in a covered passage near République. The lamb neck croquettes and the wine list are the talk of Paris's restaurant community.",
    whyLocalsLoveIt: "Zero décor investment, maximum food and wine obsession. The chefs here go on to run Paris's hottest tables.",
    bestFor: ["natural wine", "small plates", "date night", "foodie"],
    priceRange: "$$",
    neighborhood: "bastille",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Shakespeare and Company Upstairs",
    placeType: "bookshop",
    address: "37 Rue de la Bûcherie, 75005 Paris",
    latitude: "48.8527000",
    longitude: "2.3469000",
    localRating: "4.9",
    touristMentions: 1200,
    localMentions: 2000,
    gemScore: 77,
    discoveryStatus: "emerging",
    description: "Everyone knows the ground floor of this legendary English bookshop. Few visitors climb to the cramped upstairs reading room with Seine views, a piano, and an honesty library.",
    whyLocalsLoveIt: "The upstairs piano is played by anyone who likes. Sunday afternoon readings are free and intimate.",
    bestFor: ["book lovers", "photography", "rainy days", "Seine views"],
    priceRange: "$",
    neighborhood: "latin-quarter",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Coulée Verte René-Dumont",
    placeType: "attraction",
    address: "Promenade Plantée, 75012 Paris",
    latitude: "48.8485000",
    longitude: "2.3762000",
    localRating: "4.7",
    touristMentions: 200,
    localMentions: 2800,
    gemScore: 80,
    discoveryStatus: "hidden",
    daysUntilMainstream: 270,
    description: "The world's first elevated park — built on a 19th-century viaduct above the 12th arrondissement — predating New York's High Line by 15 years. Gardens, roses, and city views from 10m up.",
    whyLocalsLoveIt: "A green ribbon of calm above the street noise. The arches below are now studios and galleries — worth exploring both levels.",
    bestFor: ["walking", "photography", "gardens", "urban exploration"],
    priceRange: "$",
    neighborhood: "bastille",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Café de la Mairie (Place Saint-Sulpice)",
    placeType: "café",
    address: "8 Place Saint-Sulpice, 75006 Paris",
    latitude: "48.8506000",
    longitude: "2.3333000",
    localRating: "4.6",
    touristMentions: 90,
    localMentions: 1500,
    gemScore: 78,
    discoveryStatus: "hidden",
    daysUntilMainstream: 210,
    description: "An unchanged 1950s zinc-bar café facing the Saint-Sulpice fountain — Sontag, Perec, and Fitzgerald all drank here. Terrace seats face the square with zero tourist-trap pricing.",
    whyLocalsLoveIt: "The best people-watching terrace on the Left Bank at normal French café prices. No gimmicks, perfect crêpes.",
    bestFor: ["coffee", "writing", "people watching", "literary Paris"],
    priceRange: "$",
    neighborhood: "saint-germain",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Montmartre Vineyard & Clos Montmartre",
    placeType: "attraction",
    address: "Rue des Saules, 75018 Paris",
    latitude: "48.8876000",
    longitude: "2.3405000",
    localRating: "4.7",
    touristMentions: 300,
    localMentions: 1200,
    gemScore: 75,
    discoveryStatus: "emerging",
    description: "Paris's last working vineyard in the 18th arrondissement, producing around 1,700 bottles of Pinot Noir annually. The annual harvest festival in October is a neighbourhood institution.",
    whyLocalsLoveIt: "Standing in a vineyard looking over Paris rooftops is surreal and secret. The October fête is the best local party of the year.",
    bestFor: ["photography", "wine lovers", "autumn visit", "unique experience"],
    priceRange: "$",
    neighborhood: "montmartre",
  },
];

interface ServiceSeed {
  serviceName: string;
  shortDescription: string;
  description: string;
  serviceType: string;
  price: string;
  location: string;
  neighborhood: string;
  deliveryMethod: string;
  deliveryTimeframe: string;
  whatIncluded: string[];
  averageRating: string;
}

const CITY_SERVICES: ServiceSeed[] = [
  {
    serviceName: "Tokyo Hidden Bars Night Walk",
    shortDescription: "A guided evening through Golden Gai, Memory Lane, and secret basement bars",
    description: "Your local guide leads a 3-hour evening tour through Tokyo's most atmospheric bar districts — Golden Gai's 200 micro-bars, Omoide Yokocho (Memory Lane) yakitori under the Shinjuku tracks, and one or two secret spots known only to regulars. Includes first-round drinks at two venues.",
    serviceType: "experience",
    price: "89.00",
    location: "Tokyo, Japan",
    neighborhood: "shinjuku",
    deliveryMethod: "in_person",
    deliveryTimeframe: "3 hours (starts 8pm)",
    whatIncluded: ["3-hour guided walk", "First drinks at 2 venues", "Door-to-door bar tips", "Pocket neighborhood map", "Post-tour recommendations list"],
    averageRating: "4.9",
  },
  {
    serviceName: "Kyoto Dawn Temple Private Tour",
    shortDescription: "Beat the crowds with a private guide at Fushimi Inari and Gion at sunrise",
    description: "Begin at 5am at Fushimi Inari before the first tour buses arrive, then walk through the lantern-lit streets of Gion as geiko return from evening engagements. Finishes with a private matcha ceremony at a neighborhood tea room. Limited to 4 guests.",
    serviceType: "experience",
    price: "120.00",
    location: "Kyoto, Japan",
    neighborhood: "gion",
    deliveryMethod: "in_person",
    deliveryTimeframe: "4 hours (starts 5am)",
    whatIncluded: ["Private licensed guide", "Fushimi Inari summit hike", "Gion dawn walk", "Private matcha ceremony", "Transport between sites"],
    averageRating: "5.0",
  },
  {
    serviceName: "Paris Secret Passages & Natural Wine Tour",
    shortDescription: "Explore 19th-century covered arcades and taste cutting-edge natural wines",
    description: "A 3-hour afternoon experience combining Paris's hidden glass-roofed shopping arcades (Vivienne, Colbert, Jouffroy) with stops at two of the city's best natural-wine bars. Your guide is a sommelier and former Galeries Lafayette buyer with stories behind every bottle.",
    serviceType: "experience",
    price: "95.00",
    location: "Paris, France",
    neighborhood: "le-marais",
    deliveryMethod: "in_person",
    deliveryTimeframe: "3 hours (2pm–5pm)",
    whatIncluded: ["Licensed sommelier guide", "Entry to 3 covered passages", "Natural wine tastings at 2 bars", "Cheese pairing", "Take-home wine map"],
    averageRating: "4.8",
  },
];

export async function seedPopularCitiesContent(): Promise<{ gems: number; services: number }> {
  let gemsCreated = 0;
  let servicesCreated = 0;

  // ── Hidden Gems ──────────────────────────────────────────────────────────
  for (const gem of HIDDEN_GEMS) {
    const existing = await db
      .select({ id: travelPulseHiddenGems.id })
      .from(travelPulseHiddenGems)
      .where(
        and(
          eq(travelPulseHiddenGems.city, gem.city),
          eq(travelPulseHiddenGems.placeName, gem.placeName),
        ),
      )
      .limit(1);

    if (existing.length > 0) continue;

    await db.insert(travelPulseHiddenGems).values({
      city: gem.city,
      country: gem.country,
      placeName: gem.placeName,
      placeType: gem.placeType,
      address: gem.address,
      latitude: gem.latitude,
      longitude: gem.longitude,
      localRating: gem.localRating,
      touristMentions: gem.touristMentions,
      localMentions: gem.localMentions,
      gemScore: gem.gemScore,
      discoveryStatus: gem.discoveryStatus,
      daysUntilMainstream: gem.daysUntilMainstream,
      description: gem.description,
      whyLocalsLoveIt: gem.whyLocalsLoveIt,
      bestFor: gem.bestFor,
      priceRange: gem.priceRange,
      neighborhood: gem.neighborhood,
      aiGenerated: false,
    });
    gemsCreated++;
  }

  // ── Provider Services ────────────────────────────────────────────────────
  const firstUser = await db.select({ id: users.id }).from(users).limit(1);
  if (firstUser.length === 0) {
    logger.warn("No users found — skipping popular-cities provider services seed");
    return { gems: gemsCreated, services: 0 };
  }
  const userId = firstUser[0].id;

  for (const svc of CITY_SERVICES) {
    const existing = await db
      .select({ id: providerServices.id })
      .from(providerServices)
      .where(
        and(
          ilike(providerServices.location, `%${svc.location.split(",")[0]}%`),
          eq(providerServices.serviceName, svc.serviceName),
        ),
      )
      .limit(1);

    if (existing.length > 0) continue;

    await db.insert(providerServices).values({
      userId,
      serviceName: svc.serviceName,
      shortDescription: svc.shortDescription,
      description: svc.description,
      serviceType: svc.serviceType,
      price: svc.price,
      location: svc.location,
      neighborhood: svc.neighborhood,
      deliveryMethod: svc.deliveryMethod,
      deliveryTimeframe: svc.deliveryTimeframe,
      whatIncluded: svc.whatIncluded,
      averageRating: svc.averageRating,
      status: "active",
      isFeatured: true,
    });
    servicesCreated++;
  }

  return { gems: gemsCreated, services: servicesCreated };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedPopularCitiesContent()
    .then(({ gems, services }) => {
      console.log(`[popular-cities-content] Seed complete: ${gems} gems, ${services} services inserted.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[popular-cities-content] Seed failed:", err);
      process.exit(1);
    });
}
