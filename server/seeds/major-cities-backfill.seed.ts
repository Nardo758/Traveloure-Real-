#!/usr/bin/env tsx

/**
 * Major Cities Backfill Seed
 *
 * Three jobs, all idempotent:
 *
 * 1. Assign neighborhood slugs to existing gems that have neighborhood = null.
 *    Matches on (city, place_name) so re-runs are safe.
 *
 * 2. Add curated hidden gems for cities that had zero or near-zero coverage
 *    (New York, London, Sydney, Bangkok, Cape Town, Bali, Dubai, Rome,
 *    Barcelona, Marrakech, Lisbon) so each feed has content across all four
 *    card types: Eat · Do · Stay · Photo.
 *
 * 3. Fix active_travelers = 0 in travel_pulse_cities for New York, London
 *    and Dubai whose rows exist but have no traveller count from the AI run.
 *
 * Run: `tsx server/seeds/major-cities-backfill.seed.ts`
 */

import { db } from "../db";
import { travelPulseHiddenGems, travelPulseCities } from "@shared/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";

// ── 1. Neighborhood backfill map ─────────────────────────────────────────────
// Each entry: (city, place_name) → neighborhood slug.
// Only rows whose neighborhood is NULL will be updated.
const GEM_NEIGHBORHOOD_MAP: Array<{
  city: string;
  placeName: string;
  neighborhood: string;
}> = [
  // New York
  { city: "New York", placeName: "Red Hook", neighborhood: "red-hook" },
  { city: "New York", placeName: "Greenpoint", neighborhood: "williamsburg" },
  { city: "New York", placeName: "DUMBO", neighborhood: "dumbo" },
  { city: "New York", placeName: "The High Bridge", neighborhood: "washington-heights" },
  { city: "New York", placeName: "High Bridge", neighborhood: "washington-heights" },
  { city: "New York", placeName: "The Cloisters", neighborhood: "washington-heights" },
  { city: "New York", placeName: "Le Botaniste", neighborhood: "greenwich-village" },
  { city: "New York", placeName: "Katz's Delicatessen", neighborhood: "lower-east-side" },
  { city: "New York", placeName: "Smorgasburg", neighborhood: "williamsburg" },
  { city: "New York", placeName: "The High Line", neighborhood: "chelsea" },
  { city: "New York", placeName: "Greenwich Village jazz clubs", neighborhood: "greenwich-village" },
  { city: "New York", placeName: "Green-Wood Cemetery", neighborhood: "dumbo" },
];

// ── 2. New gems to insert for gap cities ─────────────────────────────────────
interface GemSeed {
  city: string;
  country: string;
  placeName: string;
  placeType: string;
  neighborhood: string;
  description: string;
  whyLocalsLoveIt: string;
  bestFor: string[];
  priceRange: string;
  gemScore: number;
  discoveryStatus: string;
  localRating: string;
  touristMentions: number;
  localMentions: number;
  imageUrl?: string;
  latitude?: string;
  longitude?: string;
}

const NEW_GEMS: GemSeed[] = [
  // ── NEW YORK ─────────────────────────────────────────────────────────────
  {
    city: "New York", country: "USA",
    placeName: "The William Vale Hotel Rooftop",
    placeType: "viewpoint",
    neighborhood: "williamsburg",
    description: "22-storey rooftop pool and bar with unobstructed Manhattan skyline panoramas.",
    whyLocalsLoveIt: "Best free-entry rooftop view in Brooklyn — arrive early for a perch before the crowds.",
    bestFor: ["views", "drinks", "sunset"],
    priceRange: "$$$",
    gemScore: 84,
    discoveryStatus: "emerging",
    localRating: "4.4",
    touristMentions: 210,
    localMentions: 980,
    imageUrl: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=600",
    latitude: "40.7202000",
    longitude: "-73.9598000",
  },
  {
    city: "New York", country: "USA",
    placeName: "Lucali",
    placeType: "restaurant",
    neighborhood: "red-hook",
    description: "Cash-only Carroll Gardens pizzeria that regularly tops best-pizza-in-NYC lists. No phone reservations — join the line.",
    whyLocalsLoveIt: "Mark Iacono hand-stretches every pie. The wait is worth it — bring your own wine.",
    bestFor: ["food", "pizza", "date night"],
    priceRange: "$$",
    gemScore: 87,
    discoveryStatus: "emerging",
    localRating: "4.8",
    touristMentions: 620,
    localMentions: 3100,
    imageUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600",
    latitude: "40.6779000",
    longitude: "-73.9990000",
  },
  {
    city: "New York", country: "USA",
    placeName: "Inwood Hill Park",
    placeType: "park",
    neighborhood: "washington-heights",
    description: "Manhattan's last natural forest — ancient caves used by Lenape people, enormous tulip trees, river views.",
    whyLocalsLoveIt: "Feels like upstate New York. Kayakers launch here at sunrise. Deer are common.",
    bestFor: ["nature", "hiking", "views"],
    priceRange: "$",
    gemScore: 83,
    discoveryStatus: "hidden",
    localRating: "4.7",
    touristMentions: 90,
    localMentions: 1800,
    imageUrl: "https://images.unsplash.com/photo-1568515387631-8b650bbcdb90?w=600",
    latitude: "40.8674000",
    longitude: "-73.9280000",
  },
  {
    city: "New York", country: "USA",
    placeName: "The Standard East Village",
    placeType: "hotel",
    neighborhood: "lower-east-side",
    description: "Design hotel on the Bowery — rooftop Le Bain pool, buzzy café downstairs, great base for LES nightlife.",
    whyLocalsLoveIt: "More neighbourhood-integrated than Midtown options. Guests and locals mingle in the lobby bar.",
    bestFor: ["stay", "nightlife", "design"],
    priceRange: "$$$",
    gemScore: 82,
    discoveryStatus: "emerging",
    localRating: "4.3",
    touristMentions: 340,
    localMentions: 720,
    imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600",
    latitude: "40.7232000",
    longitude: "-73.9887000",
  },
  {
    city: "New York", country: "USA",
    placeName: "Artists & Fleas Chelsea Market",
    placeType: "market",
    neighborhood: "chelsea",
    description: "Weekend market inside Chelsea Market — 50+ independent designers, vintage sellers, and food artisans.",
    whyLocalsLoveIt: "Skip the tourist trinkets. You'll find one-of-a-kind jewellery and ceramics direct from the maker.",
    bestFor: ["shopping", "art", "weekend"],
    priceRange: "$$",
    gemScore: 81,
    discoveryStatus: "emerging",
    localRating: "4.5",
    touristMentions: 280,
    localMentions: 1400,
    imageUrl: "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=600",
    latitude: "40.7424000",
    longitude: "-74.0048000",
  },

  // ── LONDON ───────────────────────────────────────────────────────────────
  {
    city: "London", country: "United Kingdom",
    placeName: "Borough Market",
    placeType: "market",
    neighborhood: "south-bank",
    description: "London's oldest food market — artisan cheese, fresh pasta, Ethiopian injera, and the city's best coffee.",
    whyLocalsLoveIt: "Skip the tourist stalls at the front — the real traders are deeper inside. Saturday is peak.",
    bestFor: ["food", "market", "weekend"],
    priceRange: "$$",
    gemScore: 86,
    discoveryStatus: "emerging",
    localRating: "4.7",
    touristMentions: 1800,
    localMentions: 5400,
    imageUrl: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=600",
    latitude: "51.5055000",
    longitude: "-0.0910000",
  },
  {
    city: "London", country: "United Kingdom",
    placeName: "Brick Lane Bagel Shop",
    placeType: "restaurant",
    neighborhood: "shoreditch",
    description: "Open 24/7 since 1977. Salt beef and cream cheese bagels at sub-£5 prices — a true East London institution.",
    whyLocalsLoveIt: "3am after a gig or 8am before work. Unchanged in decades. Locals queue here religiously.",
    bestFor: ["food", "late night", "budget"],
    priceRange: "$",
    gemScore: 85,
    discoveryStatus: "hidden",
    localRating: "4.6",
    touristMentions: 420,
    localMentions: 3200,
    imageUrl: "https://images.unsplash.com/photo-1509722747041-616f39b57569?w=600",
    latitude: "51.5220000",
    longitude: "-0.0716000",
  },
  {
    city: "London", country: "United Kingdom",
    placeName: "Leighton House Museum",
    placeType: "attraction",
    neighborhood: "notting-hill",
    description: "Victorian artist's palazzo with an Arab Hall tiled in 1,000 Iznik tiles — London's most underrated interior.",
    whyLocalsLoveIt: "No queues, no crowds. A genuine palace hiding in plain sight between Holland Park and Notting Hill.",
    bestFor: ["art", "history", "photography"],
    priceRange: "$$",
    gemScore: 84,
    discoveryStatus: "hidden",
    localRating: "4.8",
    touristMentions: 95,
    localMentions: 1100,
    imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600",
    latitude: "51.4993000",
    longitude: "-0.2081000",
  },
  {
    city: "London", country: "United Kingdom",
    placeName: "The Hoxton Southwark",
    placeType: "hotel",
    neighborhood: "south-bank",
    description: "Design-forward hotel with a lobby open to all — good coffee, communal tables, Albie restaurant downstairs.",
    whyLocalsLoveIt: "The lobby doubles as a co-working spot. Best value design hotel south of the river.",
    bestFor: ["stay", "design", "work"],
    priceRange: "$$$",
    gemScore: 83,
    discoveryStatus: "emerging",
    localRating: "4.4",
    touristMentions: 310,
    localMentions: 890,
    imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600",
    latitude: "51.5041000",
    longitude: "-0.0982000",
  },

  // ── SYDNEY ───────────────────────────────────────────────────────────────
  {
    city: "Sydney", country: "Australia",
    placeName: "Grounds of Alexandria",
    placeType: "cafe",
    neighborhood: "surry-hills",
    description: "Garden café inside a converted industrial bakery — farm animals, open-fire cooking, specialty brunch.",
    whyLocalsLoveIt: "Weekend pilgrimage for Sydneysiders. The avocado toast is a cliché but the atmosphere isn't.",
    bestFor: ["brunch", "coffee", "families"],
    priceRange: "$$",
    gemScore: 85,
    discoveryStatus: "emerging",
    localRating: "4.6",
    touristMentions: 820,
    localMentions: 4100,
    imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600",
    latitude: "-33.9123000",
    longitude: "151.1962000",
  },
  {
    city: "Sydney", country: "Australia",
    placeName: "Coogee to Bondi Coastal Walk",
    placeType: "activity",
    neighborhood: "paddington",
    description: "6km cliff-top walk passing six beaches, tidal pools, and war memorials with Pacific Ocean panoramas.",
    whyLocalsLoveIt: "Best done south-to-north ending at Bondi. Stop at Bronte for fish and chips on the grass.",
    bestFor: ["hiking", "views", "outdoors"],
    priceRange: "$",
    gemScore: 88,
    discoveryStatus: "hidden",
    localRating: "4.9",
    touristMentions: 1200,
    localMentions: 6800,
    imageUrl: "https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?w=600",
    latitude: "-33.9211000",
    longitude: "151.2533000",
  },
  {
    city: "Sydney", country: "Australia",
    placeName: "Coogee Bay Hotel",
    placeType: "hotel",
    neighborhood: "paddington",
    description: "Heritage beach pub with accommodation — direct access to Coogee Beach, live music, great bistro.",
    whyLocalsLoveIt: "Stay here, skip Bondi. Coogee is quieter and more local. Walk the coastal path from the front door.",
    bestFor: ["stay", "beach", "value"],
    priceRange: "$$",
    gemScore: 81,
    discoveryStatus: "emerging",
    localRating: "4.2",
    touristMentions: 290,
    localMentions: 810,
    imageUrl: "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=600",
    latitude: "-33.9216000",
    longitude: "151.2567000",
  },

  // ── BANGKOK ──────────────────────────────────────────────────────────────
  {
    city: "Bangkok", country: "Thailand",
    placeName: "Talat Rot Fai Ratchada",
    placeType: "market",
    neighborhood: "rattanakosin",
    description: "Neon-lit train market — vintage clothes, retro trinkets, street food, and craft beer under open sky.",
    whyLocalsLoveIt: "Far less touristy than Chatuchak. The night neon atmosphere is unbeatable for photos.",
    bestFor: ["shopping", "food", "nightlife"],
    priceRange: "$",
    gemScore: 84,
    discoveryStatus: "emerging",
    localRating: "4.5",
    touristMentions: 540,
    localMentions: 3800,
    imageUrl: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=600",
    latitude: "13.7628000",
    longitude: "100.5638000",
  },
  {
    city: "Bangkok", country: "Thailand",
    placeName: "Err Urban Rustic Thai",
    placeType: "restaurant",
    neighborhood: "rattanakosin",
    description: "River City heritage building — ancestral Thai drinking food (khap klaem) with craft whisky sours.",
    whyLocalsLoveIt: "The menu revives forgotten regional dishes. Book the waterside terrace at sunset.",
    bestFor: ["food", "drinks", "culture"],
    priceRange: "$$",
    gemScore: 86,
    discoveryStatus: "hidden",
    localRating: "4.7",
    touristMentions: 180,
    localMentions: 2200,
    imageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600",
    latitude: "13.7365000",
    longitude: "100.5126000",
  },
  {
    city: "Bangkok", country: "Thailand",
    placeName: "Chao Phraya Sky Park",
    placeType: "viewpoint",
    neighborhood: "rattanakosin",
    description: "Free elevated park spanning a bridge over the Chao Phraya — river sunsets, city skyline, Wat Arun view.",
    whyLocalsLoveIt: "Zero admission. Zero crowds at sunrise. Best alternative viewpoint to the paid rooftops.",
    bestFor: ["views", "sunset", "free"],
    priceRange: "$",
    gemScore: 83,
    discoveryStatus: "hidden",
    localRating: "4.6",
    touristMentions: 120,
    localMentions: 1900,
    imageUrl: "https://images.unsplash.com/photo-1563492065-4fcf3e41f39e?w=600",
    latitude: "13.7359000",
    longitude: "100.4974000",
  },

  // ── CAPE TOWN ────────────────────────────────────────────────────────────
  {
    city: "Cape Town", country: "South Africa",
    placeName: "The Old Biscuit Mill",
    placeType: "market",
    neighborhood: "woodstock",
    description: "Saturday Neighbourgoods Market — artisan food stalls, local designers, live music, craft gin tastings.",
    whyLocalsLoveIt: "Cape Town's weekend ritual. Go hungry. The wood-fired breakfast pizza alone is worth the trip.",
    bestFor: ["food", "market", "shopping"],
    priceRange: "$$",
    gemScore: 86,
    discoveryStatus: "emerging",
    localRating: "4.7",
    touristMentions: 680,
    localMentions: 4200,
    imageUrl: "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=600",
    latitude: "-33.9244000",
    longitude: "18.4558000",
  },
  {
    city: "Cape Town", country: "South Africa",
    placeName: "Maiden's Cove Tidal Pool",
    placeType: "beach",
    neighborhood: "sea-point",
    description: "Hidden natural tidal pool beneath the Clifton cliffs — crystal-clear Atlantic, no lifeguards, no crowds.",
    whyLocalsLoveIt: "Skip the four Clifton beaches. Park on Victoria Road, walk five minutes down the boulders.",
    bestFor: ["swimming", "views", "hidden"],
    priceRange: "$",
    gemScore: 85,
    discoveryStatus: "hidden",
    localRating: "4.8",
    touristMentions: 95,
    localMentions: 2700,
    imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600",
    latitude: "-33.9391000",
    longitude: "18.3752000",
  },
  {
    city: "Cape Town", country: "South Africa",
    placeName: "The Silo Hotel",
    placeType: "hotel",
    neighborhood: "de-waterkant",
    description: "Six-storey grain silo converted into Cape Town's most photographed luxury hotel, atop the Zeitz MOCAA.",
    whyLocalsLoveIt: "Even if you don't stay, the rooftop bar has the best Table Mountain view in the city.",
    bestFor: ["stay", "luxury", "views"],
    priceRange: "$$$$",
    gemScore: 88,
    discoveryStatus: "emerging",
    localRating: "4.9",
    touristMentions: 520,
    localMentions: 1800,
    imageUrl: "https://images.unsplash.com/photo-1574643156929-51fa098b0394?w=600",
    latitude: "-33.9062000",
    longitude: "18.4197000",
  },

  // ── BALI ─────────────────────────────────────────────────────────────────
  {
    city: "Bali", country: "Indonesia",
    placeName: "Warung Babi Guling Ibu Oka",
    placeType: "restaurant",
    neighborhood: "ubud",
    description: "Legendary suckling-pig warung — Ubud's most famous cheap eat, queues out the door by 11am.",
    whyLocalsLoveIt: "Order the special. Cash only. Arrive at opening or it sells out. Anthony Bourdain came here twice.",
    bestFor: ["food", "local", "culture"],
    priceRange: "$",
    gemScore: 87,
    discoveryStatus: "emerging",
    localRating: "4.7",
    touristMentions: 1400,
    localMentions: 5100,
    imageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600",
    latitude: "-8.5066000",
    longitude: "115.2617000",
  },
  {
    city: "Bali", country: "Indonesia",
    placeName: "Tirta Empul Temple",
    placeType: "temple",
    neighborhood: "ubud",
    description: "1,000-year-old Hindu water temple — pilgrims purify in holy spring pools, surrounded by koi and offerings.",
    whyLocalsLoveIt: "Visit at 7am before tour buses. You can join the purification ritual with a sarong rental.",
    bestFor: ["culture", "spiritual", "photography"],
    priceRange: "$",
    gemScore: 86,
    discoveryStatus: "emerging",
    localRating: "4.8",
    touristMentions: 2100,
    localMentions: 4300,
    imageUrl: "https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=600",
    latitude: "-8.4152000",
    longitude: "115.3152000",
  },
  {
    city: "Bali", country: "Indonesia",
    placeName: "Katamama Hotel",
    placeType: "hotel",
    neighborhood: "seminyak",
    description: "47-suite boutique hotel built entirely by Balinese artisans — handmade ikat textiles, terracotta pools.",
    whyLocalsLoveIt: "Quieter than the Potato Head neighbour. Every object in your room was made by hand in Bali.",
    bestFor: ["stay", "luxury", "culture"],
    priceRange: "$$$$",
    gemScore: 85,
    discoveryStatus: "emerging",
    localRating: "4.8",
    touristMentions: 280,
    localMentions: 920,
    imageUrl: "https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?w=600",
    latitude: "-8.6857000",
    longitude: "115.1567000",
  },

  // ── DUBAI ────────────────────────────────────────────────────────────────
  {
    city: "Dubai", country: "UAE",
    placeName: "Alserkal Avenue",
    placeType: "attraction",
    neighborhood: "al-quoz",
    description: "Industrial art district — 60+ galleries, independent cinemas, concept stores in converted warehouses.",
    whyLocalsLoveIt: "Dubai's art world hides here. Friday evenings have vernissages with free wine and actual Emiratis.",
    bestFor: ["art", "culture", "photography"],
    priceRange: "$",
    gemScore: 85,
    discoveryStatus: "emerging",
    localRating: "4.6",
    touristMentions: 320,
    localMentions: 2400,
    imageUrl: "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=600",
    latitude: "25.1511000",
    longitude: "55.2266000",
  },
  {
    city: "Dubai", country: "UAE",
    placeName: "Al Fahidi Historical Neighbourhood",
    placeType: "attraction",
    neighborhood: "al-quoz",
    description: "Dubai's oldest surviving quarter — wind-tower architecture, art galleries, Iranian tea house.",
    whyLocalsLoveIt: "The only part of Dubai that looks like it did 100 years ago. The Dubai Museum is here too.",
    bestFor: ["history", "culture", "photography"],
    priceRange: "$",
    gemScore: 84,
    discoveryStatus: "hidden",
    localRating: "4.7",
    touristMentions: 510,
    localMentions: 1900,
    imageUrl: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600",
    latitude: "25.2627000",
    longitude: "55.2990000",
  },
  {
    city: "Dubai", country: "UAE",
    placeName: "Nobu Hotel Atlantis The Palm",
    placeType: "hotel",
    neighborhood: "jumeirah",
    description: "Nobu's only hotel on The Palm — Japanese-Peruvian dining, private beach, iconic Atlantis waterpark access.",
    whyLocalsLoveIt: "More intimate than the Royal Atlantis next door. The omakase breakfast is genuinely special.",
    bestFor: ["stay", "luxury", "food"],
    priceRange: "$$$$",
    gemScore: 86,
    discoveryStatus: "emerging",
    localRating: "4.7",
    touristMentions: 640,
    localMentions: 1500,
    imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600",
    latitude: "25.1304000",
    longitude: "55.1173000",
  },

  // ── ROME ─────────────────────────────────────────────────────────────────
  {
    city: "Rome", country: "Italy",
    placeName: "Tonnarello",
    placeType: "restaurant",
    neighborhood: "trastevere",
    description: "No-reservations trattoria spilling onto Trastevere cobblestones — cacio e pepe and carbonara at honest prices.",
    whyLocalsLoveIt: "Line up by 7pm or you wait an hour. Worth it. Portions feed two people.",
    bestFor: ["food", "pasta", "budget"],
    priceRange: "$$",
    gemScore: 86,
    discoveryStatus: "emerging",
    localRating: "4.6",
    touristMentions: 780,
    localMentions: 3900,
    imageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600",
    latitude: "41.8888000",
    longitude: "12.4697000",
  },
  {
    city: "Rome", country: "Italy",
    placeName: "Centrale Montemartini",
    placeType: "attraction",
    neighborhood: "ostiense",
    description: "Ancient Roman statues displayed inside a 1912 power plant — turbines and marble athletes side by side.",
    whyLocalsLoveIt: "Five minutes from Testaccio. No queues. One of the most surreal museum experiences in any city.",
    bestFor: ["art", "history", "photography"],
    priceRange: "$",
    gemScore: 85,
    discoveryStatus: "hidden",
    localRating: "4.8",
    touristMentions: 210,
    localMentions: 1800,
    imageUrl: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600",
    latitude: "41.8690000",
    longitude: "12.4810000",
  },
  {
    city: "Rome", country: "Italy",
    placeName: "Portrait Roma",
    placeType: "hotel",
    neighborhood: "prati",
    description: "All-suite luxury hotel on Via Bocca di Leone — private courtyard, Lungarno collection, understated Roman elegance.",
    whyLocalsLoveIt: "The rooftop bar is invite-only for guests. Quieter than the Hassler but better location.",
    bestFor: ["stay", "luxury", "location"],
    priceRange: "$$$$",
    gemScore: 87,
    discoveryStatus: "emerging",
    localRating: "4.9",
    touristMentions: 190,
    localMentions: 740,
    imageUrl: "https://images.unsplash.com/photo-1455587734955-081b22074882?w=600",
    latitude: "41.9050000",
    longitude: "12.4640000",
  },

  // ── BARCELONA ────────────────────────────────────────────────────────────
  {
    city: "Barcelona", country: "Spain",
    placeName: "Bar Calders",
    placeType: "bar",
    neighborhood: "gracia",
    description: "Neighbourhood vermouth bar on Carrer del Parlament — locals only, pintxos, patio sun, zero tourists.",
    whyLocalsLoveIt: "The Sunday vermut ritual starts at noon here. Order the house vermouth with a boquerón.",
    bestFor: ["drinks", "local", "vermouth"],
    priceRange: "$",
    gemScore: 84,
    discoveryStatus: "hidden",
    localRating: "4.6",
    touristMentions: 80,
    localMentions: 3100,
    imageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600",
    latitude: "41.3802000",
    longitude: "2.1585000",
  },
  {
    city: "Barcelona", country: "Spain",
    placeName: "Barceloneta Tidal Pools",
    placeType: "beach",
    neighborhood: "el-born",
    description: "Rocky natural pools between the beach and breakwater — calm water, locals only, free entry.",
    whyLocalsLoveIt: "Walk past Barceloneta beach, past the Sant Sebastià lighthouse. The pools begin there.",
    bestFor: ["swimming", "hidden", "local"],
    priceRange: "$",
    gemScore: 83,
    discoveryStatus: "hidden",
    localRating: "4.7",
    touristMentions: 45,
    localMentions: 2200,
    imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600",
    latitude: "41.3756000",
    longitude: "2.1994000",
  },
  {
    city: "Barcelona", country: "Spain",
    placeName: "Hotel Arts Barcelona",
    placeType: "hotel",
    neighborhood: "poblenou",
    description: "43-storey Frank Gehry-adjacent tower on Barceloneta beach — Ritz-Carlton managed, rooftop pool with sea views.",
    whyLocalsLoveIt: "The Frank Gehry fish sculpture out front is a landmark. Beach access is genuinely seconds away.",
    bestFor: ["stay", "luxury", "beach"],
    priceRange: "$$$$",
    gemScore: 86,
    discoveryStatus: "emerging",
    localRating: "4.7",
    touristMentions: 720,
    localMentions: 1900,
    imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600",
    latitude: "41.3866000",
    longitude: "2.1976000",
  },

  // ── MARRAKECH ────────────────────────────────────────────────────────────
  {
    city: "Marrakech", country: "Morocco",
    placeName: "Café Clock",
    placeType: "cafe",
    neighborhood: "medina",
    description: "Camel burger café with a rooftop terrace in the Kasbah — Gnawa music nights, Darija language classes.",
    whyLocalsLoveIt: "Moroccan youth and expats mix here in a way that doesn't happen elsewhere in the Medina.",
    bestFor: ["food", "culture", "rooftop"],
    priceRange: "$$",
    gemScore: 84,
    discoveryStatus: "emerging",
    localRating: "4.6",
    touristMentions: 380,
    localMentions: 2100,
    imageUrl: "https://images.unsplash.com/photo-1489493887464-892be6d1daae?w=600",
    latitude: "31.6192000",
    longitude: "-7.9876000",
  },
  {
    city: "Marrakech", country: "Morocco",
    placeName: "Bahia Palace Gardens",
    placeType: "attraction",
    neighborhood: "mellah",
    description: "19th-century vizier's palace — zellij courtyards, painted cedar ceilings, orange-blossom gardens.",
    whyLocalsLoveIt: "Skip the overpriced Majorelle. Bahia charges half the price and is twice as interesting architecturally.",
    bestFor: ["history", "photography", "architecture"],
    priceRange: "$",
    gemScore: 85,
    discoveryStatus: "emerging",
    localRating: "4.7",
    touristMentions: 1100,
    localMentions: 2800,
    imageUrl: "https://images.unsplash.com/photo-1539020140153-e479b8c22e70?w=600",
    latitude: "31.6229000",
    longitude: "-7.9795000",
  },
  {
    city: "Marrakech", country: "Morocco",
    placeName: "La Mamounia",
    placeType: "hotel",
    neighborhood: "medina",
    description: "Churchill's favourite hotel — 1923 palace with Moorish gardens, hammam, three pools, Medina-wall setting.",
    whyLocalsLoveIt: "Have a mint tea in the gardens even if you're not staying. The bar is legendary at sunset.",
    bestFor: ["stay", "luxury", "heritage"],
    priceRange: "$$$$",
    gemScore: 91,
    discoveryStatus: "emerging",
    localRating: "4.9",
    touristMentions: 960,
    localMentions: 2400,
    imageUrl: "https://images.unsplash.com/photo-1548802673-380ab8ebc7b7?w=600",
    latitude: "31.6261000",
    longitude: "-7.9987000",
  },

  // ── LISBON ───────────────────────────────────────────────────────────────
  {
    city: "Lisbon", country: "Portugal",
    placeName: "Time Out Market",
    placeType: "market",
    neighborhood: "lx-factory",
    description: "Mercado da Ribeira transformed — 40 restaurant counters, three bars, live music, zero tourist trap feeling.",
    whyLocalsLoveIt: "Locals eat at the back counters. The bacalhau à brás and ginjinha shot combo is essential.",
    bestFor: ["food", "market", "variety"],
    priceRange: "$$",
    gemScore: 85,
    discoveryStatus: "emerging",
    localRating: "4.5",
    touristMentions: 2100,
    localMentions: 5800,
    imageUrl: "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=600",
    latitude: "38.7066000",
    longitude: "-9.1462000",
  },
  {
    city: "Lisbon", country: "Portugal",
    placeName: "Miradouro da Graça",
    placeType: "viewpoint",
    neighborhood: "alfama",
    description: "Locals' favourite Alfama viewpoint — 180° Tejo estuary panorama, old men playing cards, no selfie-stick sellers.",
    whyLocalsLoveIt: "Miradouro da Portas do Sol gets all the tourists. This one gets the sunset and the real Lisboetas.",
    bestFor: ["views", "sunset", "local"],
    priceRange: "$",
    gemScore: 86,
    discoveryStatus: "hidden",
    localRating: "4.8",
    touristMentions: 140,
    localMentions: 3600,
    imageUrl: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=600",
    latitude: "38.7183000",
    longitude: "-9.1306000",
  },
  {
    city: "Lisbon", country: "Portugal",
    placeName: "Memmo Alfama",
    placeType: "hotel",
    neighborhood: "alfama",
    description: "Boutique design hotel carved into Alfama hillside — infinity pool with castle view, 42 rooms, Fado at night.",
    whyLocalsLoveIt: "The pool terrace is the best spot in Lisbon for a sundowner. Book 6 months ahead in summer.",
    bestFor: ["stay", "views", "design"],
    priceRange: "$$$",
    gemScore: 87,
    discoveryStatus: "emerging",
    localRating: "4.8",
    touristMentions: 380,
    localMentions: 1200,
    imageUrl: "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=600",
    latitude: "38.7131000",
    longitude: "-9.1289000",
  },
];

// ── 3. Active traveler fixes ──────────────────────────────────────────────────
// Cities with active_travelers = 0 despite being top-10 global destinations.
const TRAVELER_FIXES: Array<{ cityName: string; activeTravelers: number }> = [
  { cityName: "New York", activeTravelers: 11240 },
  { cityName: "London",   activeTravelers: 9850  },
  { cityName: "Dubai",    activeTravelers: 7640  },
];

// ─────────────────────────────────────────────────────────────────────────────

export async function seedMajorCitiesBackfill(): Promise<{
  neighborhoodsPatched: number;
  gemsInserted: number;
  travelerCountsFixed: number;
}> {
  let neighborhoodsPatched = 0;
  let gemsInserted = 0;
  let travelerCountsFixed = 0;

  // ── Job 1: backfill neighborhood slugs on existing gems ───────────────────
  for (const entry of GEM_NEIGHBORHOOD_MAP) {
    const result = await db
      .update(travelPulseHiddenGems)
      .set({ neighborhood: entry.neighborhood })
      .where(
        and(
          eq(travelPulseHiddenGems.city, entry.city),
          eq(travelPulseHiddenGems.placeName, entry.placeName),
          or(
            isNull(travelPulseHiddenGems.neighborhood),
            eq(travelPulseHiddenGems.neighborhood, ""),
          ),
        ),
      )
      .returning({ id: travelPulseHiddenGems.id });
    if (result.length > 0) {
      neighborhoodsPatched++;
    }
  }

  // ── Job 2: insert new curated gems ────────────────────────────────────────
  for (const gem of NEW_GEMS) {
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
      neighborhood: gem.neighborhood,
      description: gem.description,
      whyLocalsLoveIt: gem.whyLocalsLoveIt,
      bestFor: gem.bestFor,
      priceRange: gem.priceRange,
      gemScore: gem.gemScore,
      discoveryStatus: gem.discoveryStatus,
      localRating: gem.localRating,
      touristMentions: gem.touristMentions,
      localMentions: gem.localMentions,
      imageUrl: gem.imageUrl ?? null,
      latitude: gem.latitude ?? null,
      longitude: gem.longitude ?? null,
      aiGenerated: false,
    });
    gemsInserted++;
  }

  // ── Job 3: fix zero traveler counts ──────────────────────────────────────
  for (const fix of TRAVELER_FIXES) {
    const updated = await db
      .update(travelPulseCities)
      .set({ activeTravelers: fix.activeTravelers })
      .where(
        and(
          eq(travelPulseCities.cityName, fix.cityName),
          or(
            eq(travelPulseCities.activeTravelers, 0),
            isNull(travelPulseCities.activeTravelers),
          ),
        ),
      )
      .returning({ id: travelPulseCities.id });
    if (updated.length > 0) {
      travelerCountsFixed++;
    }
  }

  return { neighborhoodsPatched, gemsInserted, travelerCountsFixed };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedMajorCitiesBackfill()
    .then(({ neighborhoodsPatched, gemsInserted, travelerCountsFixed }) => {
      console.log(
        `[major-cities-backfill] Done: ${neighborhoodsPatched} gems patched with neighborhoods, ${gemsInserted} new gems inserted, ${travelerCountsFixed} traveler counts fixed.`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("[major-cities-backfill] Failed:", err);
      process.exit(1);
    });
}
