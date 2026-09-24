/**
 * The SQL half of the ONE city-match rule (board #1385; the pure half is shared/location-match.ts).
 *
 * `provider_services.location` is free text ("Kyoto, Japan", "Gion, Kyoto, Japan"), and the filters
 * used `ILIKE '%q%'` — so "Kyo" matched Kyoto, "Rome" matched "Romeoville", and a `%` or `_` in the
 * query was a wildcard. A listing now matches when the query's CITY segment EQUALS its `city`
 * column or ANY comma segment of its `location` — whole segments only, case- and (common) accent-
 * insensitive. Never a substring.
 */
import { sql, type SQL, type AnyColumn } from "drizzle-orm";
import { citySegment } from "@shared/location-match";

const ACCENTED = "áàâäãåéèêëíìîïóòôöõúùûüñçý";
const PLAIN = "aaaaaaeeeeiiiiooooouuuuncy";

function folded(column: AnyColumn | SQL): SQL {
  return sql`translate(lower(trim(coalesce(${column}, ''))), ${ACCENTED}, ${PLAIN})`;
}

/** A condition for a listing whose `city` or `location` names the query's city. Null when the query is empty. */
export function listingLocationMatches(
  query: string | null | undefined,
  cityColumn: AnyColumn,
  locationColumn: AnyColumn,
): SQL | null {
  const q = citySegment(query);
  if (!q) return null;
  const segments = sql`string_to_array(regexp_replace(${folded(locationColumn)}, '\\s*,\\s*', ',', 'g'), ',')`;
  return sql`(${folded(cityColumn)} = ${q} OR ${q} = ANY(${segments}))`;
}
