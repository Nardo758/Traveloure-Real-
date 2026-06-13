#!/usr/bin/env tsx

/**
 * City Neighborhoods Seed (v3 — expanded to all cities with gem data).
 *
 * Seeds explicit neighborhood lookups for the full launch market.
 * Centroids drive the gem auto-backfill and provider listing form's
 * neighborhood picker.
 *
 * Idempotent: re-running matches on (city, country, slug) and skips existing
 * rows rather than failing.
 *
 * Run: `tsx server/seeds/city-neighborhoods.seed.ts`
 */

import { db } from "../db";
import { cityNeighborhoods } from "@shared/schema";
import { and, eq } from "drizzle-orm";

interface NeighborhoodSeed {
  name: string;
  slug: string;
  centroidLat: string;
  centroidLng: string;
  radiusKm?: string;
  description?: string;
}

interface CitySeed {
  city: string;
  country: string;
  neighborhoods: NeighborhoodSeed[];
}

const SEED_DATA: CitySeed[] = [
  // ── TOKYO ────────────────────────────────────────────────────────────────
  {
    city: "Tokyo",
    country: "Japan",
    neighborhoods: [
      {
        name: "Shimokitazawa",
        slug: "shimokitazawa",
        centroidLat: "35.6613000",
        centroidLng: "139.6680000",
        radiusKm: "1.00",
        description: "Bohemian southwest Tokyo — vintage clothing, indie live houses, cosy coffee shops, theater scene.",
      },
      {
        name: "Yanaka",
        slug: "yanaka",
        centroidLat: "35.7258000",
        centroidLng: "139.7649000",
        radiusKm: "1.00",
        description: "Old-town atmosphere surviving earthquakes and war — narrow alleys, temples, Yanaka Cemetery cherry blossoms.",
      },
      {
        name: "Nakameguro",
        slug: "nakameguro",
        centroidLat: "35.6440000",
        centroidLng: "139.6985000",
        radiusKm: "1.20",
        description: "Canal-side cool — cherry-blossom walkway, gallery cafes, boutique fashion, understated nightlife.",
      },
      {
        name: "Asakusa",
        slug: "asakusa",
        centroidLat: "35.7148000",
        centroidLng: "139.7967000",
        radiusKm: "1.20",
        description: "Traditional downtown — Senso-ji temple, Nakamise shopping street, rickshaws, old craft shops.",
      },
      {
        name: "Shinjuku",
        slug: "shinjuku",
        centroidLat: "35.6896000",
        centroidLng: "139.6917000",
        radiusKm: "1.50",
        description: "Mega-hub — Golden Gai tiny bars, Kabukicho nightlife, Omoide Yokocho yakitori, sprawling station.",
      },
      {
        name: "Daikanyama",
        slug: "daikanyama",
        centroidLat: "35.6494000",
        centroidLng: "139.7031000",
        radiusKm: "0.80",
        description: "Tokyo's most liveable village — Tsutaya Books T-site, European café terraces, design studios.",
      },
    ],
  },

  // ── KYOTO ────────────────────────────────────────────────────────────────
  {
    city: "Kyoto",
    country: "Japan",
    neighborhoods: [
      {
        name: "Gion",
        slug: "gion",
        centroidLat: "35.0036000",
        centroidLng: "135.7752000",
        radiusKm: "1.00",
        description: "Historic geisha district east of the Kamo River — teahouses, Hanamikoji street, evening ochaya.",
      },
      {
        name: "Higashiyama",
        slug: "higashiyama",
        centroidLat: "34.9985000",
        centroidLng: "135.7800000",
        radiusKm: "1.50",
        description: "Eastern hills neighbourhood — Kiyomizu-dera, Sannenzaka stone steps, traditional craft shops.",
      },
      {
        name: "Arashiyama",
        slug: "arashiyama",
        centroidLat: "35.0094000",
        centroidLng: "135.6669000",
        radiusKm: "2.00",
        description: "West-side bamboo grove, Togetsukyo bridge, Tenryu-ji temple, monkey park.",
      },
      {
        name: "Pontocho",
        slug: "pontocho",
        centroidLat: "35.0080000",
        centroidLng: "135.7707000",
        radiusKm: "0.50",
        description: "Narrow lantern-lit alley along the Kamo River — riverside dining (kawayuka) in summer.",
      },
      {
        name: "Kyoto Station Area",
        slug: "kyoto-station",
        centroidLat: "34.9858000",
        centroidLng: "135.7588000",
        radiusKm: "1.00",
        description: "Transit + retail hub — Kyoto Station building, Kyoto Tower, Higashi/Nishi Hongan-ji.",
      },
      {
        name: "Nishijin",
        slug: "nishijin",
        centroidLat: "35.0319000",
        centroidLng: "135.7472000",
        radiusKm: "1.20",
        description: "Centuries-old textile district — weaving studios, machiya townhouses, quiet residential streets.",
      },
      {
        name: "Kawaramachi / Sanjo",
        slug: "kawaramachi-sanjo",
        centroidLat: "35.0094000",
        centroidLng: "135.7681000",
        radiusKm: "0.80",
        description: "Downtown shopping + nightlife axis around Sanjo and Shijo — Nishiki Market sits just west.",
      },
      {
        name: "Fushimi",
        slug: "fushimi",
        centroidLat: "34.9671000",
        centroidLng: "135.7726000",
        radiusKm: "2.00",
        description: "Southern Kyoto — Fushimi Inari shrine's torii path, sake brewery district along the canals.",
      },
    ],
  },

  // ── PARIS ────────────────────────────────────────────────────────────────
  {
    city: "Paris",
    country: "France",
    neighborhoods: [
      {
        name: "Le Marais",
        slug: "le-marais",
        centroidLat: "48.8575000",
        centroidLng: "2.3614000",
        radiusKm: "1.00",
        description: "3rd/4th arrondissements — Jewish quarter, Place des Vosges, independent boutiques, queer nightlife.",
      },
      {
        name: "Saint-Germain-des-Prés",
        slug: "saint-germain",
        centroidLat: "48.8540000",
        centroidLng: "2.3334000",
        radiusKm: "1.00",
        description: "Left Bank literary core — Café de Flore, Les Deux Magots, Jardin du Luxembourg edge.",
      },
      {
        name: "Montmartre",
        slug: "montmartre",
        centroidLat: "48.8867000",
        centroidLng: "2.3431000",
        radiusKm: "1.20",
        description: "18th arrondissement hill — Sacré-Cœur, Place du Tertre artists, winding stairs and old village feel.",
      },
      {
        name: "Latin Quarter",
        slug: "latin-quarter",
        centroidLat: "48.8489000",
        centroidLng: "2.3469000",
        radiusKm: "1.00",
        description: "5th arrondissement — Sorbonne, Panthéon, Shakespeare and Company, bouquinistes along the Seine.",
      },
      {
        name: "Champs-Élysées",
        slug: "champs-elysees",
        centroidLat: "48.8698000",
        centroidLng: "2.3076000",
        radiusKm: "1.20",
        description: "8th arrondissement axis — Arc de Triomphe, flagship retail, Grand Palais.",
      },
      {
        name: "Île de la Cité",
        slug: "ile-de-la-cite",
        centroidLat: "48.8550000",
        centroidLng: "2.3470000",
        radiusKm: "0.60",
        description: "Seine island — Notre-Dame, Sainte-Chapelle, Conciergerie, the original heart of medieval Paris.",
      },
      {
        name: "Belleville",
        slug: "belleville",
        centroidLat: "48.8730000",
        centroidLng: "2.3781000",
        radiusKm: "1.50",
        description: "19th/20th edges — multicultural eastern hill, panoramic Parc de Belleville, street art, Édith Piaf birthplace.",
      },
      {
        name: "Bastille",
        slug: "bastille",
        centroidLat: "48.8530000",
        centroidLng: "2.3690000",
        radiusKm: "1.00",
        description: "11th/12th junction — Opéra Bastille, rue de la Roquette nightlife, Marché d'Aligre.",
      },
    ],
  },

  // ── NEW YORK ─────────────────────────────────────────────────────────────
  {
    city: "New York",
    country: "USA",
    neighborhoods: [
      {
        name: "Williamsburg",
        slug: "williamsburg",
        centroidLat: "40.7081000",
        centroidLng: "-73.9571000",
        radiusKm: "1.50",
        description: "Brooklyn's creative engine — rooftop bars, indie music venues, vintage markets, smorgasburg food hall.",
      },
      {
        name: "DUMBO",
        slug: "dumbo",
        centroidLat: "40.7033000",
        centroidLng: "-73.9881000",
        radiusKm: "0.80",
        description: "Under the Manhattan Bridge — cobblestone streets, stunning bridge views, design studios, weekend art markets.",
      },
      {
        name: "Red Hook",
        slug: "red-hook",
        centroidLat: "40.6766000",
        centroidLng: "-74.0099000",
        radiusKm: "1.20",
        description: "Brooklyn waterfront — art galleries, food vendors, ikea ferry, Manhattan skyline views.",
      },
      {
        name: "Greenwich Village",
        slug: "greenwich-village",
        centroidLat: "40.7335000",
        centroidLng: "-74.0027000",
        radiusKm: "1.00",
        description: "NYC's bohemian soul — jazz clubs, NYU streets, Washington Square Park, intimate Italian restaurants.",
      },
      {
        name: "Chelsea",
        slug: "chelsea",
        centroidLat: "40.7465000",
        centroidLng: "-74.0014000",
        radiusKm: "1.20",
        description: "Gallery district meets the High Line — 200+ art galleries, Chelsea Market, Hudson Yards edge.",
      },
      {
        name: "Lower East Side",
        slug: "lower-east-side",
        centroidLat: "40.7156000",
        centroidLng: "-73.9862000",
        radiusKm: "1.00",
        description: "Historic immigrant neighbourhood turned nightlife hub — delis, vintage stores, basement bars, Tenement Museum.",
      },
      {
        name: "Washington Heights",
        slug: "washington-heights",
        centroidLat: "40.8448000",
        centroidLng: "-73.9396000",
        radiusKm: "1.50",
        description: "Upper Manhattan's hidden gem — The Cloisters, High Bridge Park, Dominican culture, Hudson River views.",
      },
    ],
  },

  // ── LONDON ───────────────────────────────────────────────────────────────
  {
    city: "London",
    country: "United Kingdom",
    neighborhoods: [
      {
        name: "Shoreditch",
        slug: "shoreditch",
        centroidLat: "51.5234000",
        centroidLng: "-0.0780000",
        radiusKm: "1.00",
        description: "East London creative hub — Brick Lane street food, Boxpark, street art murals, start-up culture.",
      },
      {
        name: "Notting Hill",
        slug: "notting-hill",
        centroidLat: "51.5142000",
        centroidLng: "-0.2052000",
        radiusKm: "1.00",
        description: "Pastel townhouses, Portobello Road market, Carnival in August — photogenic and quietly upscale.",
      },
      {
        name: "Covent Garden",
        slug: "covent-garden",
        centroidLat: "51.5117000",
        centroidLng: "-0.1236000",
        radiusKm: "0.80",
        description: "Victorian market hall — street performers, boutique shops, pre-theatre dining, London Transport Museum.",
      },
      {
        name: "South Bank",
        slug: "south-bank",
        centroidLat: "51.5055000",
        centroidLng: "-0.1132000",
        radiusKm: "1.50",
        description: "Thames riverside culture — Tate Modern, Bankside, Borough Market, Shakespeare's Globe, skate park.",
      },
      {
        name: "Camden Town",
        slug: "camden",
        centroidLat: "51.5390000",
        centroidLng: "-0.1426000",
        radiusKm: "1.00",
        description: "Alternative north London — Camden Market, live music legacy, canal walks, vintage fashion.",
      },
    ],
  },

  // ── SYDNEY ───────────────────────────────────────────────────────────────
  {
    city: "Sydney",
    country: "Australia",
    neighborhoods: [
      {
        name: "Newtown",
        slug: "newtown",
        centroidLat: "-33.8979000",
        centroidLng: "151.1779000",
        radiusKm: "1.20",
        description: "Sydney's alt-culture heartland — King Street cafés, vegan restaurants, vintage shops, live music.",
      },
      {
        name: "Surry Hills",
        slug: "surry-hills",
        centroidLat: "-33.8874000",
        centroidLng: "151.2095000",
        radiusKm: "1.00",
        description: "Creative inner-suburb — specialty coffee roasters, brunch spots, fashion boutiques, intimate galleries.",
      },
      {
        name: "Manly",
        slug: "manly",
        centroidLat: "-33.7969000",
        centroidLng: "151.2858000",
        radiusKm: "1.50",
        description: "Northern beaches village — Manly Beach, ferry ride views, surf culture, relaxed restaurants.",
      },
      {
        name: "Glebe",
        slug: "glebe",
        centroidLat: "-33.8796000",
        centroidLng: "151.1872000",
        radiusKm: "1.00",
        description: "Leafy university neighbourhood — Glebe Markets, Victorian terraces, bookshops, veggie-friendly eateries.",
      },
      {
        name: "Paddington",
        slug: "paddington",
        centroidLat: "-33.8844000",
        centroidLng: "151.2273000",
        radiusKm: "1.00",
        description: "Victorian-terrace streets — Oxford Street boutiques, Paddington Markets, art galleries, quality dining.",
      },
    ],
  },

  // ── BANGKOK ──────────────────────────────────────────────────────────────
  {
    city: "Bangkok",
    country: "Thailand",
    neighborhoods: [
      {
        name: "Sukhumvit",
        slug: "sukhumvit",
        centroidLat: "13.7440000",
        centroidLng: "100.5590000",
        radiusKm: "2.00",
        description: "Bangkok's cosmopolitan corridor — expat dining, rooftop bars, BTS-accessible nightlife, mega malls.",
      },
      {
        name: "Silom & Sathorn",
        slug: "silom-sathorn",
        centroidLat: "13.7231000",
        centroidLng: "100.5289000",
        radiusKm: "1.50",
        description: "Financial district by day, Patpong market by night — rooftop sky bars, Lumphini Park edge.",
      },
      {
        name: "Rattanakosin",
        slug: "rattanakosin",
        centroidLat: "13.7499000",
        centroidLng: "100.4913000",
        radiusKm: "1.50",
        description: "Bangkok's historic island — Grand Palace, Wat Pho, Wat Arun, backpacker Khao San Road nearby.",
      },
      {
        name: "Ari",
        slug: "ari",
        centroidLat: "13.7793000",
        centroidLng: "100.5421000",
        radiusKm: "1.00",
        description: "Bangkok's neighbourhood café culture — specialty coffee, plant-based restaurants, local boutiques, calm streets.",
      },
      {
        name: "Thonglor",
        slug: "thonglor",
        centroidLat: "13.7306000",
        centroidLng: "100.5770000",
        radiusKm: "1.20",
        description: "Stylish Soi 55 — Japanese restaurants, designer bars, expat-favourite brunch spots, W Hotel rooftop.",
      },
    ],
  },

  // ── CAPE TOWN ────────────────────────────────────────────────────────────
  {
    city: "Cape Town",
    country: "South Africa",
    neighborhoods: [
      {
        name: "Bo-Kaap",
        slug: "bo-kaap",
        centroidLat: "-33.9224000",
        centroidLng: "18.4163000",
        radiusKm: "0.60",
        description: "Cobbled streets of colourful Cape Malay houses — Bo-Kaap Museum, cooking classes, signal cannon.",
      },
      {
        name: "Woodstock",
        slug: "woodstock",
        centroidLat: "-33.9299000",
        centroidLng: "18.4479000",
        radiusKm: "1.00",
        description: "Cape Town's art district — Old Biscuit Mill market, street murals, gin distilleries, gallery studios.",
      },
      {
        name: "De Waterkant",
        slug: "de-waterkant",
        centroidLat: "-33.9204000",
        centroidLng: "18.4206000",
        radiusKm: "0.60",
        description: "Cape Quarter — Cape Town's queer-friendly village, boutique hotels, outdoor restaurants, cobblestone charm.",
      },
      {
        name: "Observatory",
        slug: "observatory",
        centroidLat: "-33.9407000",
        centroidLng: "18.4696000",
        radiusKm: "0.80",
        description: "Bohemian student suburb — Lower Main Road cafés, vintage stores, live music, alternative nightlife.",
      },
      {
        name: "Sea Point",
        slug: "sea-point",
        centroidLat: "-33.9179000",
        centroidLng: "18.3857000",
        radiusKm: "1.20",
        description: "Atlantic seaboard promenade — running track, tidal pool, family-friendly restaurants, ocean sunsets.",
      },
    ],
  },

  // ── BALI ─────────────────────────────────────────────────────────────────
  {
    city: "Bali",
    country: "Indonesia",
    neighborhoods: [
      {
        name: "Seminyak",
        slug: "seminyak",
        centroidLat: "-8.6929000",
        centroidLng: "115.1669000",
        radiusKm: "1.50",
        description: "Upscale beach resort strip — sunset beach clubs, villa hotels, designer boutiques, fine dining.",
      },
      {
        name: "Ubud",
        slug: "ubud",
        centroidLat: "-8.5069000",
        centroidLng: "115.2625000",
        radiusKm: "2.00",
        description: "Bali's cultural heartland — rice terraces, traditional dance, healing retreats, artist studios.",
      },
      {
        name: "Canggu",
        slug: "canggu",
        centroidLat: "-8.6531000",
        centroidLng: "115.1378000",
        radiusKm: "2.00",
        description: "Digital nomad favourite — Echo Beach surf, rice paddy warung cafés, pool bars, yoga shalas.",
      },
      {
        name: "Kuta",
        slug: "kuta",
        centroidLat: "-8.7215000",
        centroidLng: "115.1683000",
        radiusKm: "1.50",
        description: "Bali's original beach resort — surf school HQ, Legian nightlife, Beachwalk Mall, airport adjacent.",
      },
      {
        name: "Sanur",
        slug: "sanur",
        centroidLat: "-8.7021000",
        centroidLng: "115.2588000",
        radiusKm: "1.50",
        description: "Calm sunrise beach — calmer than Kuta, expat community, cycling beach path, fast boat to Nusa Penida.",
      },
    ],
  },

  // ── DUBAI ────────────────────────────────────────────────────────────────
  {
    city: "Dubai",
    country: "UAE",
    neighborhoods: [
      {
        name: "Dubai Marina",
        slug: "dubai-marina",
        centroidLat: "25.0801000",
        centroidLng: "55.1403000",
        radiusKm: "1.50",
        description: "Waterfront skyscraper canyon — marina walk restaurants, yacht cruises, JBR beach, nightlife strip.",
      },
      {
        name: "Downtown Dubai",
        slug: "downtown-dubai",
        centroidLat: "25.1972000",
        centroidLng: "55.2744000",
        radiusKm: "1.50",
        description: "Burj Khalifa and Dubai Mall — fountain shows, luxury hotels, Dubai Opera, high-end dining.",
      },
      {
        name: "Jumeirah",
        slug: "jumeirah",
        centroidLat: "25.2048000",
        centroidLng: "55.2436000",
        radiusKm: "2.00",
        description: "Beach district — Kite Beach, La Mer, Madinat Jumeirah souk, Burj Al Arab backdrop.",
      },
      {
        name: "Al Quoz",
        slug: "al-quoz",
        centroidLat: "25.1560000",
        centroidLng: "55.2234000",
        radiusKm: "1.50",
        description: "Dubai's creative quarter — Alserkal Avenue galleries, independent cinemas, concept stores, art events.",
      },
      {
        name: "DIFC",
        slug: "difc",
        centroidLat: "25.2112000",
        centroidLng: "55.2839000",
        radiusKm: "0.80",
        description: "Financial centre art district — Gate Village galleries, rooftop restaurants, contemporary art fair hub.",
      },
    ],
  },

  // ── ROME ─────────────────────────────────────────────────────────────────
  {
    city: "Rome",
    country: "Italy",
    neighborhoods: [
      {
        name: "Trastevere",
        slug: "trastevere",
        centroidLat: "41.8879000",
        centroidLng: "12.4680000",
        radiusKm: "1.00",
        description: "Rome's most atmospheric neighbourhood — cobblestone alleys, ivy-clad trattorias, ivy-draped fountains, lively piazzas.",
      },
      {
        name: "Testaccio",
        slug: "testaccio",
        centroidLat: "41.8763000",
        centroidLng: "12.4753000",
        radiusKm: "0.80",
        description: "Working-class food district — Rome's best market, offal cuisine, nightclub Pigneto scene, Monte Testaccio.",
      },
      {
        name: "Pigneto",
        slug: "pigneto",
        centroidLat: "41.8889000",
        centroidLng: "12.5198000",
        radiusKm: "1.00",
        description: "Rome's hip eastern suburb — Pier Paolo Pasolini's haunt, aperitivo bars, street art, indie cinemas.",
      },
      {
        name: "Prati",
        slug: "prati",
        centroidLat: "41.9052000",
        centroidLng: "12.4601000",
        radiusKm: "1.00",
        description: "Vatican-adjacent residential — Via Cola di Rienzo shopping, gelaterie, neighbourhood bakeries.",
      },
      {
        name: "Ostiense",
        slug: "ostiense",
        centroidLat: "41.8657000",
        centroidLng: "12.4797000",
        radiusKm: "1.20",
        description: "Industrial regeneration — Centrale Montemartini museum, street art, craft beer bars, MACRO Testaccio.",
      },
    ],
  },

  // ── BARCELONA ────────────────────────────────────────────────────────────
  {
    city: "Barcelona",
    country: "Spain",
    neighborhoods: [
      {
        name: "El Born",
        slug: "el-born",
        centroidLat: "41.3840000",
        centroidLng: "2.1810000",
        radiusKm: "0.80",
        description: "Medieval Ribera quarter — Picasso Museum, Santa Maria del Mar, pintxos bars, cocktail bars.",
      },
      {
        name: "Gràcia",
        slug: "gracia",
        centroidLat: "41.4052000",
        centroidLng: "2.1546000",
        radiusKm: "1.20",
        description: "Village-within-city feel — Plaça del Sol terraces, independent cinemas, bohemian bars, La Vermouth culture.",
      },
      {
        name: "El Raval",
        slug: "el-raval",
        centroidLat: "41.3794000",
        centroidLng: "2.1706000",
        radiusKm: "1.00",
        description: "MACBA museum quarter — multicultural food market, vintage record shops, Boqueria Market edge.",
      },
      {
        name: "Poblenou",
        slug: "poblenou",
        centroidLat: "41.4031000",
        centroidLng: "2.1974000",
        radiusKm: "1.50",
        description: "22@ tech district — Rambla del Poblenou beach bars, design studios, Palo Alto market.",
      },
      {
        name: "Sarrià",
        slug: "sarria",
        centroidLat: "41.4001000",
        centroidLng: "2.1110000",
        radiusKm: "1.20",
        description: "Upper-village feel, once a separate town — quiet squares, family restaurants, Tibidabo tramway access.",
      },
    ],
  },

  // ── MARRAKECH ────────────────────────────────────────────────────────────
  {
    city: "Marrakech",
    country: "Morocco",
    neighborhoods: [
      {
        name: "Medina",
        slug: "medina",
        centroidLat: "31.6295000",
        centroidLng: "-7.9811000",
        radiusKm: "1.50",
        description: "UNESCO-listed walled city — Jemaa el-Fna square, souks, riads, Koutoubia Mosque.",
      },
      {
        name: "Guéliz",
        slug: "gueliz",
        centroidLat: "31.6371000",
        centroidLng: "-8.0135000",
        radiusKm: "1.20",
        description: "French-built nouvelle ville — contemporary galleries, rooftop restaurants, concept stores.",
      },
      {
        name: "Mellah",
        slug: "mellah",
        centroidLat: "31.6253000",
        centroidLng: "-7.9827000",
        radiusKm: "0.60",
        description: "Historic Jewish quarter — spice souks, El Badi Palace ruins, goldsmiths, Saadian Tombs nearby.",
      },
      {
        name: "Kasbah",
        slug: "kasbah",
        centroidLat: "31.6179000",
        centroidLng: "-7.9872000",
        radiusKm: "0.80",
        description: "Southern medina — Saadian Tombs, kasbah mosque, quieter riad streets, artisan workshops.",
      },
      {
        name: "Palmeraie",
        slug: "palmeraie",
        centroidLat: "31.6762000",
        centroidLng: "-7.9671000",
        radiusKm: "3.00",
        description: "Palm grove resort belt — luxury spa hotels, camel rides, quad biking, Atlas Mountain views.",
      },
    ],
  },

  // ── LISBON ───────────────────────────────────────────────────────────────
  {
    city: "Lisbon",
    country: "Portugal",
    neighborhoods: [
      {
        name: "Alfama",
        slug: "alfama",
        centroidLat: "38.7133000",
        centroidLng: "-9.1317000",
        radiusKm: "1.00",
        description: "Oldest Lisbon quarter — São Jorge Castle, Fado houses, narrow Mouraria alleys, Portas do Sol viewpoint.",
      },
      {
        name: "Bairro Alto",
        slug: "bairro-alto",
        centroidLat: "38.7135000",
        centroidLng: "-9.1480000",
        radiusKm: "0.80",
        description: "Lisbon's traditional nightlife grid — bars spill onto the streets nightly, Fado restaurants, vintage shops.",
      },
      {
        name: "LX Factory",
        slug: "lx-factory",
        centroidLat: "38.7017000",
        centroidLng: "-9.1778000",
        radiusKm: "0.60",
        description: "Repurposed 19th-century textile complex — Sunday market, independent restaurants, bookshop Ler Devagar.",
      },
      {
        name: "Mouraria",
        slug: "mouraria",
        centroidLat: "38.7159000",
        centroidLng: "-9.1348000",
        radiusKm: "0.60",
        description: "Birthplace of Fado — multicultural immigrant neighbourhood, tiled azulejo murals, authentic tascas.",
      },
      {
        name: "Príncipe Real",
        slug: "principe-real",
        centroidLat: "38.7158000",
        centroidLng: "-9.1497000",
        radiusKm: "0.70",
        description: "Leafy hilltop square — antique dealers, design shops, jardim do Príncipe Real Saturday market.",
      },
    ],
  },
];

export async function seedCityNeighborhoods(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const citySeed of SEED_DATA) {
    for (const n of citySeed.neighborhoods) {
      const existing = await db
        .select({ id: cityNeighborhoods.id })
        .from(cityNeighborhoods)
        .where(
          and(
            eq(cityNeighborhoods.city, citySeed.city),
            eq(cityNeighborhoods.country, citySeed.country),
            eq(cityNeighborhoods.slug, n.slug),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(cityNeighborhoods).values({
        city: citySeed.city,
        country: citySeed.country,
        name: n.name,
        slug: n.slug,
        centroidLat: n.centroidLat,
        centroidLng: n.centroidLng,
        radiusKm: n.radiusKm ?? "1.50",
        description: n.description ?? null,
      });
      inserted++;
    }
  }

  return { inserted, skipped };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedCityNeighborhoods()
    .then(({ inserted, skipped }) => {
      console.log(`[city-neighborhoods] Seed complete: ${inserted} inserted, ${skipped} already present.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[city-neighborhoods] Seed failed:", err);
      process.exit(1);
    });
}
