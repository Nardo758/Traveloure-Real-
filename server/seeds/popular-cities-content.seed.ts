#!/usr/bin/env tsx

/**
 * Popular Cities Content Seed
 *
 * Seeds hidden gems (8 per city) and at least one active providerServices
 * row for Tokyo, Kyoto, and Paris so the location feed is never empty in a
 * fresh environment.
 *
 * Each city has gems covering all four feed categories:
 *   Eat  — placeType includes: restaurant | cafe | dining | food
 *   Do   — placeType includes: attraction | activity | temple | shrine | park
 *   Stay — placeType includes: hotel | ryokan | hostel
 *   Photo— placeType includes: viewpoint | scenic | photo spot | photography
 *
 * Neighborhood slugs match those in city-neighborhoods.seed.ts.
 *
 * Idempotent: skips rows whose (city, placeName) already exist.
 * Provider services: creates a deterministic seed provider user if none exist.
 *
 * Run standalone: `tsx server/seeds/popular-cities-content.seed.ts`
 */

import { db } from "../db";
import { travelPulseHiddenGems, providerServices, users } from "@shared/schema";
import { and, eq, ilike, isNull, or } from "drizzle-orm";
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
  imageUrl?: string;
}

const HIDDEN_GEMS: GemSeed[] = [
  // ── TOKYO (8 gems: 3 Eat · 2 Do · 1 Stay · 2 Photo) ─────────────────────
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Kayaba Coffee",
    placeType: "cafe",
    address: "6-1-29 Yanaka, Taito City, Tokyo",
    latitude: "35.7234000",
    longitude: "139.7657000",
    localRating: "4.7",
    touristMentions: 120,
    localMentions: 890,
    gemScore: 82,
    discoveryStatus: "hidden",
    daysUntilMainstream: 180,
    description: "A beautifully preserved 1930s wooden coffee house in the Yanaka shitamachi. Famous for its thick tamago-sando egg sandwich and single-origin pour-over.",
    whyLocalsLoveIt: "Time-stands-still atmosphere, no Instagram crowds, and the best morning set in east Tokyo.",
    bestFor: ["slow mornings", "breakfast", "solo travel"],
    priceRange: "$",
    neighborhood: "yanaka",
    imageUrl: "https://images.unsplash.com/photo-1576618148400-f54bbd73ed4f?auto=format&fit=crop&w=800&q=80",
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
    description: "A curated strip of micro-restaurants, craft-beer bars, and coffee roasters built under the elevated rail line along the Meguro canal.",
    whyLocalsLoveIt: "Canal views, zero tourist traps, and genuinely creative chefs working tiny open kitchens.",
    bestFor: ["date night", "craft beer", "evening out"],
    priceRange: "$$",
    neighborhood: "nakameguro",
    imageUrl: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Asakusa Hoppy Street Yakitori",
    placeType: "dining",
    address: "Hoppy-dori, Asakusa, Taito City, Tokyo",
    latitude: "35.7146000",
    longitude: "139.7945000",
    localRating: "4.5",
    touristMentions: 300,
    localMentions: 1800,
    gemScore: 71,
    discoveryStatus: "emerging",
    daysUntilMainstream: 60,
    description: "A rowdy pedestrian street where Tokyo working-class culture has thrived since the post-war era. Plastic stools, cheap hoppy beer, and shichirin grilled skewers.",
    whyLocalsLoveIt: "Unpretentious, dirt cheap, and utterly authentic. The grilled chicken skewers here have been perfected over decades.",
    bestFor: ["budget dining", "local culture", "street food"],
    priceRange: "$",
    neighborhood: "asakusa",
    imageUrl: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Golden Gai Late-Night Bars",
    placeType: "attraction",
    address: "Golden Gai, Kabukicho, Shinjuku City, Tokyo",
    latitude: "35.6940000",
    longitude: "139.7050000",
    localRating: "4.9",
    touristMentions: 500,
    localMentions: 3000,
    gemScore: 88,
    discoveryStatus: "hidden",
    daysUntilMainstream: 365,
    description: "200+ micro-bars packed into six tiny alleyways. Each fits 6-8 people, has its own theme, and is run by a single bartender who often doubles as DJ.",
    whyLocalsLoveIt: "Nowhere else on earth feels like this after midnight. Each bar is a world unto itself.",
    bestFor: ["nightlife", "solo travel", "unique experience"],
    priceRange: "$$",
    neighborhood: "shinjuku",
    imageUrl: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Disk Union Shimokitazawa",
    placeType: "activity",
    address: "2-25-8 Kitazawa, Setagaya City, Tokyo",
    latitude: "35.6617000",
    longitude: "139.6683000",
    localRating: "4.8",
    touristMentions: 85,
    localMentions: 1200,
    gemScore: 79,
    discoveryStatus: "hidden",
    daysUntilMainstream: 220,
    description: "Seven-floor vinyl heaven stacked with Japanese pressings, jazz, city pop, and rare imports. Each floor is a different genre — come prepared to stay for hours.",
    whyLocalsLoveIt: "Serious collectors come weekly. Late-70s Japanese city pop LPs go for a few hundred yen.",
    bestFor: ["music lovers", "rainy days", "unique souvenirs"],
    priceRange: "$",
    neighborhood: "shimokitazawa",
    imageUrl: "https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Claska Hotel Meguro",
    placeType: "hotel",
    address: "1-3-18 Chuo-cho, Meguro City, Tokyo",
    latitude: "35.6425000",
    longitude: "139.7004000",
    localRating: "4.6",
    touristMentions: 180,
    localMentions: 600,
    gemScore: 72,
    discoveryStatus: "emerging",
    description: "A design-forward boutique hotel in a converted 1960s ryokan building. The Gallery shop on the ground floor is one of Tokyo's best curated design shops.",
    whyLocalsLoveIt: "The interiors are textbook Japanese minimal design. Locals come for the gallery even if they aren't staying.",
    bestFor: ["design lovers", "couples", "boutique stay"],
    priceRange: "$$$",
    neighborhood: "nakameguro",
    imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Yanaka Cemetery Cherry Blossom Walk",
    placeType: "scenic",
    address: "7-5-24 Yanaka, Taito City, Tokyo",
    latitude: "35.7255000",
    longitude: "139.7633000",
    localRating: "4.8",
    touristMentions: 180,
    localMentions: 2200,
    gemScore: 81,
    discoveryStatus: "hidden",
    daysUntilMainstream: 250,
    description: "Yanaka Cemetery's main avenue becomes a canopy of sakura blossoms in late March — entirely free, almost entirely locals, and no crowds compared to Ueno or Shinjuku.",
    whyLocalsLoveIt: "The combination of ancient gravestones and sakura blossoms is uniquely Tokyo. Golden hour here is transcendent.",
    bestFor: ["photography", "cherry blossom season", "walking"],
    priceRange: "$",
    neighborhood: "yanaka",
    imageUrl: "https://images.unsplash.com/photo-1522383225653-ed111181a951?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Tokyo",
    country: "Japan",
    placeName: "Nakameguro Canal Viewpoint at Dusk",
    placeType: "viewpoint",
    address: "Nakameguro, Meguro City, Tokyo",
    latitude: "35.6450000",
    longitude: "139.6990000",
    localRating: "4.9",
    touristMentions: 600,
    localMentions: 3500,
    gemScore: 84,
    discoveryStatus: "emerging",
    description: "The 2km canal walk glows copper at sunset as boutique café lights reflect off the water. The tree canopy forms tunnels best photographed 30 minutes before dark.",
    whyLocalsLoveIt: "One of Tokyo's best free photo spots at any season — the lantern glow in autumn is particularly stunning.",
    bestFor: ["photography", "evening walk", "golden hour"],
    priceRange: "$",
    neighborhood: "nakameguro",
    imageUrl: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=800&q=80",
  },

  // ── KYOTO (8 gems: 3 Eat · 2 Do · 1 Stay · 2 Photo) ─────────────────────
  {
    city: "Kyoto",
    country: "Japan",
    placeName: "Ippodo Tea Kaboku Tearoom",
    placeType: "cafe",
    address: "52 Teramachi Nijo-agaru, Nakagyo Ward, Kyoto",
    latitude: "35.0156000",
    longitude: "135.7672000",
    localRating: "4.9",
    touristMentions: 150,
    localMentions: 2100,
    gemScore: 85,
    discoveryStatus: "hidden",
    daysUntilMainstream: 240,
    description: "Established in 1717, this is the definitive matcha source for Kyoto's tea masters. The adjoining Kaboku tearoom serves any tea from their range, brewed with precision.",
    whyLocalsLoveIt: "Serious tea culture, zero tourist kitsch. Staff guide you to the perfect sencha for your taste and budget.",
    bestFor: ["tea lovers", "cultural immersion", "quiet afternoon"],
    priceRange: "$$",
    neighborhood: "kawaramachi-sanjo",
    imageUrl: "https://images.unsplash.com/photo-1569144157591-c60f3f82f137?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Kyoto",
    country: "Japan",
    placeName: "Nishiki Market Side Alleys",
    placeType: "food",
    address: "Nishiki Market, Nakagyo Ward, Kyoto",
    latitude: "35.0052000",
    longitude: "135.7648000",
    localRating: "4.7",
    touristMentions: 800,
    localMentions: 3500,
    gemScore: 78,
    discoveryStatus: "emerging",
    description: "Kyoto's 'kitchen' market — 100+ stalls of pickled vegetables, fresh tofu, grilled skewers, and seasonal sweets. The perpendicular side alleys have the best value eating.",
    whyLocalsLoveIt: "Grandmothers still shop here for their daily pickles. The tsukemono variety is unmatched anywhere.",
    bestFor: ["food tasting", "local culture", "lunch"],
    priceRange: "$",
    neighborhood: "kawaramachi-sanjo",
    imageUrl: "https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&w=800&q=80",
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
    description: "A 17th-century Zen temple offering shojin ryori Buddhist vegetarian cuisine in private tatami rooms overlooking a moss garden. Reservation weeks in advance required.",
    whyLocalsLoveIt: "The seasonally changing menu is sourced entirely from the temple's own garden. An experience impossible to replicate.",
    bestFor: ["fine dining", "vegetarian", "cultural immersion"],
    priceRange: "$$$",
    neighborhood: "nishijin",
    imageUrl: "https://images.unsplash.com/photo-1492571350019-22de08371fd3?auto=format&fit=crop&w=800&q=80",
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
    description: "The 10,000 torii path is magical but overcrowded by 8am. Arriving at 4:30am means walking the full summit trail completely alone in mist and candlelight.",
    whyLocalsLoveIt: "Dawn at the summit is a genuinely spiritual experience. Most tourists only do the first 30 minutes.",
    bestFor: ["hiking", "spiritual experience", "avoiding crowds"],
    priceRange: "$",
    neighborhood: "fushimi",
    imageUrl: "https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Kyoto",
    country: "Japan",
    placeName: "Pontocho Alley Evening Stroll",
    placeType: "activity",
    address: "Pontocho, Nakagyo Ward, Kyoto",
    latitude: "35.0083000",
    longitude: "135.7707000",
    localRating: "4.8",
    touristMentions: 900,
    localMentions: 2800,
    gemScore: 80,
    discoveryStatus: "emerging",
    description: "A 500-metre stone alley running parallel to the Kamo River. In summer, restaurants extend kawayuka elevated platforms over the water for open-air dining.",
    whyLocalsLoveIt: "The pre-dinner golden hour with lanterns just lit and no crowds is the most photogenic moment in all Kyoto.",
    bestFor: ["evening walk", "summer dining", "atmosphere"],
    priceRange: "$$",
    neighborhood: "pontocho",
    imageUrl: "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Kyoto",
    country: "Japan",
    placeName: "Yoshida Sanso Ryokan",
    placeType: "ryokan",
    address: "59-1 Yoshida Shimoadachi-cho, Sakyo Ward, Kyoto",
    latitude: "35.0267000",
    longitude: "135.7839000",
    localRating: "4.9",
    touristMentions: 95,
    localMentions: 520,
    gemScore: 88,
    discoveryStatus: "hidden",
    daysUntilMainstream: 400,
    description: "A converted 1932 Imperial guesthouse on the forested slopes of Mount Yoshida. Nine suites, a private garden, and multi-course kaiseki dinner served in your room.",
    whyLocalsLoveIt: "The Japanese imperial hospitality tradition is alive here. No-one rushes you, no-one under 18, pure Kyoto.",
    bestFor: ["luxury stay", "couples", "authentic ryokan"],
    priceRange: "$$$$",
    neighborhood: "higashiyama",
    imageUrl: "https://images.unsplash.com/photo-1548165892-cd6be85a7f69?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Kyoto",
    country: "Japan",
    placeName: "Fushimi Inari Torii Tunnel at Dawn",
    placeType: "viewpoint",
    address: "Fushimi Inari Taisha, Fushimi Ward, Kyoto",
    latitude: "34.9673000",
    longitude: "135.7729000",
    localRating: "5.0",
    touristMentions: 1500,
    localMentions: 3800,
    gemScore: 93,
    discoveryStatus: "hidden",
    daysUntilMainstream: 730,
    description: "The lower torii tunnel photographed empty at 5am, backlit by the first sun slicing through the orange gates. Arguably the best photo opportunity in all of Japan.",
    whyLocalsLoveIt: "By 9am this exact spot has 200 people queuing. At dawn it is yours alone and lit like a film set.",
    bestFor: ["photography", "dawn", "iconic shot"],
    priceRange: "$",
    neighborhood: "fushimi",
    imageUrl: "https://images.unsplash.com/photo-1580917922805-21d32edd27e3?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Kyoto",
    country: "Japan",
    placeName: "Philosopher's Path Canal in Autumn",
    placeType: "scenic",
    address: "Tetsugaku no Michi, Sakyo Ward, Kyoto",
    latitude: "35.0168000",
    longitude: "135.7940000",
    localRating: "4.7",
    touristMentions: 600,
    localMentions: 2000,
    gemScore: 75,
    discoveryStatus: "emerging",
    description: "The canal-side path connecting Nanzen-ji to Ginkaku-ji. Less visited in autumn than spring, the red maple canopy over the water is arguably more beautiful than sakura season.",
    whyLocalsLoveIt: "Autumn maples reflected in the still canal at 7am — one of Kyoto's secret great photos.",
    bestFor: ["photography", "autumn foliage", "walking", "golden hour"],
    priceRange: "$",
    neighborhood: "higashiyama",
    imageUrl: "https://images.unsplash.com/photo-1601823984263-6ec76b4c8aaf?auto=format&fit=crop&w=800&q=80",
  },

  // ── PARIS (8 gems: 3 Eat · 2 Do · 1 Stay · 2 Photo) ─────────────────────
  {
    city: "Paris",
    country: "France",
    placeName: "Au Passage Natural Wine Bar",
    placeType: "restaurant",
    address: "1bis Passage Saint-Sebastien, 75011 Paris",
    latitude: "48.8605000",
    longitude: "2.3715000",
    localRating: "4.8",
    touristMentions: 120,
    localMentions: 1800,
    gemScore: 83,
    discoveryStatus: "hidden",
    daysUntilMainstream: 180,
    description: "A cult natural-wine bar and small plates restaurant hidden in a covered passage near Republique. The lamb neck croquettes and the wine list are the talk of Paris's chef community.",
    whyLocalsLoveIt: "Zero decor investment, maximum food and wine obsession. The chefs here go on to run Paris's hottest tables.",
    bestFor: ["natural wine", "small plates", "date night", "foodie"],
    priceRange: "$$",
    neighborhood: "bastille",
    imageUrl: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Marche d'Aligre Sunday Morning",
    placeType: "food",
    address: "Place d'Aligre, 75012 Paris",
    latitude: "48.8500000",
    longitude: "2.3740000",
    localRating: "4.8",
    touristMentions: 180,
    localMentions: 3200,
    gemScore: 84,
    discoveryStatus: "hidden",
    daysUntilMainstream: 200,
    description: "The most Parisian market in Paris — outdoor flea stalls from 7am Thursday to Sunday, surrounded by covered food halls with oysters, charcuterie, and cheese.",
    whyLocalsLoveIt: "Flea items for 2 euros that cost 50 in Le Marais. The Beauvau covered hall has the best oyster bar in the 12th.",
    bestFor: ["bargain hunting", "food tasting", "local culture", "morning"],
    priceRange: "$",
    neighborhood: "bastille",
    imageUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Cafe de la Mairie Saint-Sulpice",
    placeType: "cafe",
    address: "8 Place Saint-Sulpice, 75006 Paris",
    latitude: "48.8506000",
    longitude: "2.3333000",
    localRating: "4.6",
    touristMentions: 90,
    localMentions: 1500,
    gemScore: 78,
    discoveryStatus: "hidden",
    daysUntilMainstream: 210,
    description: "An unchanged 1950s zinc-bar cafe facing the Saint-Sulpice fountain — Sontag, Perec, and Fitzgerald all drank here. Terrace seats at normal French cafe prices.",
    whyLocalsLoveIt: "The best people-watching terrace on the Left Bank. No gimmicks, perfect crepes, honest pricing.",
    bestFor: ["coffee", "writing", "people watching", "literary Paris"],
    priceRange: "$",
    neighborhood: "saint-germain",
    imageUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Buttes-Chaumont Park",
    placeType: "park",
    address: "Parc des Buttes-Chaumont, 75019 Paris",
    latitude: "48.8788000",
    longitude: "2.3817000",
    localRating: "4.9",
    touristMentions: 250,
    localMentions: 4500,
    gemScore: 87,
    discoveryStatus: "hidden",
    daysUntilMainstream: 365,
    description: "Paris's most dramatic park — a Victorian landscape with a rocky island temple, suspension bridge, and sweeping panoramas. Locals picnic here while tourists queue at the Eiffel Tower.",
    whyLocalsLoveIt: "The island temple view at golden hour is equal to any postcard Paris. Completely free and uncrowded.",
    bestFor: ["picnic", "families", "afternoon escape", "views"],
    priceRange: "$",
    neighborhood: "belleville",
    imageUrl: "https://images.unsplash.com/photo-1551918120-9739cb430c6d?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Coulee Verte Elevated Park",
    placeType: "attraction",
    address: "Promenade Plantee, 75012 Paris",
    latitude: "48.8485000",
    longitude: "2.3762000",
    localRating: "4.7",
    touristMentions: 200,
    localMentions: 2800,
    gemScore: 80,
    discoveryStatus: "hidden",
    daysUntilMainstream: 270,
    description: "The world's first elevated park, built on a 19th-century railway viaduct above the 12th arrondissement — predating New York's High Line by 15 years. Gardens and city views from 10m up.",
    whyLocalsLoveIt: "A green ribbon of calm above street noise. The viaduct arches below are now art galleries worth exploring too.",
    bestFor: ["walking", "urban exploration", "gardens"],
    priceRange: "$",
    neighborhood: "bastille",
    imageUrl: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Hotel du Petit Moulin Le Marais",
    placeType: "hotel",
    address: "29-31 Rue de Poitou, 75003 Paris",
    latitude: "48.8612000",
    longitude: "2.3597000",
    localRating: "4.7",
    touristMentions: 160,
    localMentions: 480,
    gemScore: 77,
    discoveryStatus: "hidden",
    daysUntilMainstream: 300,
    description: "A 17th-century bakery — the oldest in Paris — converted into a 17-room design hotel by Christian Lacroix. Every room has a different hand-painted design.",
    whyLocalsLoveIt: "The building's history and Lacroix's artistry combine in ways no chain hotel ever could. No two rooms are the same.",
    bestFor: ["design lovers", "couples", "boutique stay", "Le Marais"],
    priceRange: "$$$",
    neighborhood: "le-marais",
    imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe2f5?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Buttes-Chaumont Temple de la Sibylle Viewpoint",
    placeType: "viewpoint",
    address: "Ile du Belveder, Parc des Buttes-Chaumont, 75019 Paris",
    latitude: "48.8800000",
    longitude: "2.3820000",
    localRating: "4.9",
    touristMentions: 180,
    localMentions: 3000,
    gemScore: 88,
    discoveryStatus: "hidden",
    daysUntilMainstream: 365,
    description: "Standing on the island summit temple gives a 360-degree panorama across Paris's rooftops and the Sacre-Coeur on the horizon — a view locals protect fiercely from overexposure.",
    whyLocalsLoveIt: "Better Parisian skyline view than the Eiffel Tower, completely free, and 90% fewer tourists.",
    bestFor: ["photography", "panoramic views", "golden hour"],
    priceRange: "$",
    neighborhood: "belleville",
    imageUrl: "https://images.unsplash.com/photo-1431274172761-fca41d930114?auto=format&fit=crop&w=800&q=80",
  },
  {
    city: "Paris",
    country: "France",
    placeName: "Montmartre Vineyard Clos Montmartre",
    placeType: "scenic",
    address: "Rue des Saules, 75018 Paris",
    latitude: "48.8876000",
    longitude: "2.3405000",
    localRating: "4.7",
    touristMentions: 300,
    localMentions: 1200,
    gemScore: 75,
    discoveryStatus: "emerging",
    description: "Paris's last working vineyard in the 18th arrondissement — 1,700 bottles of Pinot Noir per year. The October harvest festival is a neighbourhood institution.",
    whyLocalsLoveIt: "Standing in a vineyard looking over Paris rooftops is surreal and secret. The October fete is the best local party of the year.",
    bestFor: ["photography", "wine lovers", "autumn visit", "unique experience"],
    priceRange: "$",
    neighborhood: "montmartre",
    imageUrl: "https://images.unsplash.com/photo-1471919743851-c3efa5059c11?auto=format&fit=crop&w=800&q=80",
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
    serviceName: "Paris Secret Passages and Natural Wine Tour",
    shortDescription: "Explore 19th-century covered arcades and taste cutting-edge natural wines",
    description: "A 3-hour afternoon experience combining Paris's hidden glass-roofed shopping arcades (Vivienne, Colbert, Jouffroy) with stops at two of the city's best natural-wine bars. Your guide is a sommelier and former Galeries Lafayette buyer.",
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

const SEED_PROVIDER_EMAIL = "seed-provider@traveloure.internal";

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

    if (existing.length > 0) {
      // Patch imageUrl on already-seeded rows that are missing a photo
      if (gem.imageUrl) {
        await db
          .update(travelPulseHiddenGems)
          .set({ imageUrl: gem.imageUrl })
          .where(
            and(
              eq(travelPulseHiddenGems.id, existing[0].id),
              or(
                isNull(travelPulseHiddenGems.imageUrl),
                eq(travelPulseHiddenGems.imageUrl, ""),
              ),
            ),
          );
      }
      continue;
    }

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
      imageUrl: gem.imageUrl,
      aiGenerated: false,
    });
    gemsCreated++;
  }

  // ── Provider Services ────────────────────────────────────────────────────
  // Resolve or create a deterministic seed provider user so this works in
  // completely fresh environments where no users have been created yet.
  let userId: string;

  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SEED_PROVIDER_EMAIL))
    .limit(1);

  if (existingUser.length > 0) {
    userId = existingUser[0].id;
  } else {
    const anyUser = await db.select({ id: users.id }).from(users).limit(1);
    if (anyUser.length > 0) {
      userId = anyUser[0].id;
    } else {
      const [created] = await db.insert(users).values({
        email: SEED_PROVIDER_EMAIL,
        firstName: "Traveloure",
        lastName: "Seed Provider",
        role: "provider",
      }).returning({ id: users.id });
      userId = created.id;
    }
  }

  for (const svc of CITY_SERVICES) {
    const cityKeyword = svc.location.split(",")[0].trim();
    const existing = await db
      .select({ id: providerServices.id })
      .from(providerServices)
      .where(
        and(
          ilike(providerServices.location, `%${cityKeyword}%`),
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
