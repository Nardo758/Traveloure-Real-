#!/usr/bin/env tsx

/**
 * City Neighborhoods Seed (v2 spec §5.1, §9, §10 — Phase 1b-1).
 *
 * Seeds explicit neighborhood lookups for the launch market (Kyoto) and the
 * already-seeded Paris market. Centroids drive the gem auto-backfill
 * (`server/scripts/backfill-gem-neighborhoods.ts` — Phase 1b-2) and populate
 * the provider listing form's neighborhood picker.
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
  centroidLat: string; // decimal as string for drizzle decimal type
  centroidLng: string;
  radiusKm?: string;
  description?: string;
}

interface CitySeed {
  city: string;
  country: string;
  neighborhoods: NeighborhoodSeed[];
}

// Centroids are approximate, sourced from public coordinate references for
// each neighborhood centre. Radius defaults to 1.5km — tighter than typical
// city districts so backfill assignments stay specific.
const SEED_DATA: CitySeed[] = [
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

// CLI entry — only when invoked directly
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
