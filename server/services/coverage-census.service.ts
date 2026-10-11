/**
 * FD-5 — THE COVERAGE CENSUS, loader (ledger `2026-10-10-fd5-coverage-targets`; brief
 * docs/planning/briefs/fd-5-coverage-targets.md). Reads a market's neighbourhoods and its live local content
 * and official feasibility facts, and hands them to the pure `buildCoverageCensus`.
 *
 * READ-ONLY by construction: it issues SELECTs only, through an INJECTED query function, so the read-only
 * script (`scripts/report-coverage-census.cjs`, which sets `default_transaction_read_only`) and the nightly
 * census job run the same SQL. It imports no db.
 *
 * The local measure is the teaser's own (shared/free-draft-cap.ts via local-teaser.service): tagged local,
 * unexpired gems by their soft slug and nuggets by id or name. Official facts are live (`expires_at` in the
 * future, not superseded) rows of the three FD-3 types with `license = 'official'`, by source name.
 */
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { buildCoverageCensus, type CoverageCensus, type SlugTargets } from "@shared/coverage-targets";

export type CensusQuery = (text: string, params: unknown[]) => Promise<{ rows: any[] }>;

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** The market's city as `city_neighborhoods`/gems/nuggets store it, or null for a market we do not run. */
export function censusCityFor(market: string): string | null {
  const m = OPERATING_MARKETS.find((x) => x.marketKey === market.trim().toLowerCase());
  return m?.cityName ?? null;
}

export async function loadCoverageCensus(market: string, targets: Record<string, SlugTargets>, query: CensusQuery): Promise<CoverageCensus> {
  const key = market.trim().toLowerCase();
  const city = censusCityFor(key);
  if (!city) return buildCoverageCensus({ market: key, neighbourhoods: [], gems: [], notes: [], facts: [], targets });
  const [hoods, gems, notes, facts] = await Promise.all([
    query(`select id, slug, name, centroid_lat, centroid_lng from city_neighborhoods where city ilike $1`, [city]),
    query(
      `select neighborhood from travel_pulse_hidden_gems
        where city ilike $1 and source_class = 'local' and (expires_at is null or expires_at > now())`,
      [city],
    ),
    query(
      `select neighborhood_id, linked_neighbourhood from local_knowledge_nuggets
        where city ilike $1 and source_class = 'local' and (expires_at is null or expires_at > now())`,
      [city],
    ),
    query(
      `select pf.place_lat, pf.place_lng, pf.source_class, pf.license, pf.fact_type, cs.name as source_name
         from place_facts pf left join content_sources cs on cs.id = pf.source_id
        where lower(btrim(pf.market)) = $1
          and pf.superseded_by is null
          and (pf.expires_at is null or pf.expires_at > now())
          and pf.place_lat is not null and pf.place_lng is not null
          and (pf.source_class = 'local'
               or (pf.license = 'official' and pf.fact_type in ('hours', 'last_admission', 'last_service')))`,
      [key],
    ),
  ]);
  return buildCoverageCensus({
    market: key,
    neighbourhoods: hoods.rows.map((h) => ({ id: String(h.id), slug: String(h.slug), name: String(h.name), lat: num(h.centroid_lat), lng: num(h.centroid_lng) })),
    gems: gems.rows.map((g) => ({ neighbourhoodSlug: g.neighborhood ?? null })),
    notes: notes.rows.map((n) => ({ neighbourhoodId: n.neighborhood_id ?? null, neighbourhoodName: n.linked_neighbourhood ?? null })),
    facts: facts.rows.map((f) => ({
      lat: num(f.place_lat), lng: num(f.place_lng), sourceClass: f.source_class ?? null, license: f.license ?? null,
      factType: String(f.fact_type), sourceName: f.source_name ?? null,
    })),
    targets,
  });
}
