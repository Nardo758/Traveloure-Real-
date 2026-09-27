#!/usr/bin/env node
/**
 * report-kyoto-supply.cjs — a READ-ONLY census of what a Kyoto traveler could actually be offered.
 * Vertical slice Part 5 (docs/planning/briefs/vertical-slice.md): "Kyoto supply reality check
 * (report only)". Target: ten real Kyoto travelers using the Trips slice in November 2026.
 *
 * IT NEVER WRITES. The session runs `SET default_transaction_read_only = on` before any query.
 *
 * WHAT COUNTS AS KYOTO — the app's own rule, never a looser one (§13):
 *   a listing / expert form is Kyoto when the FIRST comma-segment of its `city`, trimmed and
 *   lower-cased, equals `kyoto` — exactly `resolveMarketSlug` (server/services/trend-engine/
 *   operating-markets.ts). A row whose `city` is NULL/blank but whose free-text `location`
 *   mentions Kyoto is reported SEPARATELY as "location text only" and is NOT counted as Kyoto:
 *   no reader in the app treats it as Kyoto either.
 *
 * WHAT "LIVE" MEANS: the public read gate — `status = 'active' AND approval_status = 'approved'`
 *   (storage.ts's public listing readers).
 *
 * NEGATIVE SPACE: live partner APIs (Viator availability, the Travelpayouts catalog feeds) are not
 * in the database and are not measured here; only `affiliate_products` rows are. Nothing here says
 * whether a listing is GOOD, only whether the fields the Trips slice reads are present.
 *
 * USAGE
 *   node scripts/report-kyoto-supply.cjs "<DATABASE_URL>"      # markdown to stdout
 *   node scripts/report-kyoto-supply.cjs "<DATABASE_URL>" --json
 */
const { Client } = require("pg");

const KYOTO = `lower(btrim(split_part(coalesce(%s,''), ',', 1))) = 'kyoto'`;
const isKyoto = (col) => KYOTO.replace("%s", col);

const QUERIES = {
  listingsByCategory: `
    select coalesce(c.category_key, c.slug, '(no category)') as category,
           count(*) filter (where true) as all_rows,
           count(*) filter (where s.status = 'active' and s.approval_status = 'approved') as live,
           count(*) filter (where s.approval_status = 'submitted') as awaiting_review,
           count(*) filter (where s.approval_status = 'rejected') as rejected
      from provider_services s left join service_categories c on c.id = s.category_id
     where ${isKyoto("s.city")}
     group by 1 order by live desc, all_rows desc`,
  liveFieldCoverage: `
    with live as (
      select s.* from provider_services s
       where ${isKyoto("s.city")} and s.status = 'active' and s.approval_status = 'approved')
    select count(*) as live,
           count(*) filter (where latitude is not null and longitude is not null) as has_coordinates,
           count(*) filter (where location_precision = 'exact') as precision_exact,
           count(*) filter (where location_precision = 'neighborhood_centroid') as precision_centroid,
           count(*) filter (where location_precision is null) as precision_null,
           count(*) filter (where price is not null and price > 0) as has_price,
           count(*) filter (where price_type = 'custom_quote') as custom_quote,
           count(*) filter (where cancellation_policy_type is not null) as has_cancellation_tier,
           count(*) filter (where cancellation_policy_type is null and nullif(btrim(cancellation_policy),'') is not null) as free_text_policy_only,
           count(*) filter (where exists (select 1 from vendor_availability_slots v
                                           where v.service_id = live.id and v.date >= current_date
                                             and coalesce(v.status,'') <> 'fully_booked'
                                             and coalesce(v.booked_count,0) < coalesce(v.capacity,1))) as has_future_open_slot,
           count(*) filter (where availability is not null) as has_availability_json,
           count(*) filter (where can_anchor is true) as can_anchor,
           count(*) filter (where product_shape in ('property','property_room')) as stays
      from live`,
  locationTextOnly: `
    select count(*) as rows,
           count(*) filter (where status = 'active' and approval_status = 'approved') as live
      from provider_services
     where nullif(btrim(coalesce(city,'')),'') is null and location ilike '%kyoto%'`,
  expertsByStatus: `
    select coalesce(f.status,'(null)') as form_status, coalesce(u.role,'(no user)') as role,
           count(*) as experts,
           count(*) filter (where nullif(btrim(coalesce(u.handle,'')),'') is not null) as with_handle
      from local_expert_forms f left join users u on u.id = f.user_id
     where ${isKyoto("f.city")}
     group by 1, 2 order by experts desc`,
  expertNeighborhoods: `
    select count(distinct en.expert_id) filter (where en.verified_at is not null) as experts_with_verified_neighborhood,
           count(distinct en.expert_id) as experts_with_any_neighborhood_row,
           (select count(*) from city_neighborhoods where ${isKyoto("city")}) as kyoto_neighborhoods
      from expert_neighborhoods en join city_neighborhoods n on n.id = en.neighborhood_id
     where ${isKyoto("n.city")}`,
  affiliateInventory: `
    select coalesce(p.name, '(no partner)') as partner, coalesce(a.category,'(none)') as category,
           count(*) as rows, count(*) filter (where a.is_active) as active,
           count(*) filter (where a.is_active and a.coordinates is not null) as active_with_coordinates,
           count(*) filter (where a.is_active and a.price is not null) as active_with_price
      from affiliate_products a left join affiliate_partners p on p.id = a.partner_id
     where ${isKyoto("a.city")}
     group by 1, 2 order by active desc, rows desc`,
  // The Trips slice's hotel ANCHOR candidates come from hotel_cache (anchor-candidates.ts reads
  // `city ILIKE '%<city>%'`, limit 60) — the one place hotels live for the anchor question.
  hotelCache: `
    select coalesce(provider,'(null)') as provider, count(*) as rows,
           count(*) filter (where latitude is not null and longitude is not null) as with_coordinates,
           count(*) filter (where expires_at is null or expires_at > now()) as not_expired,
           max(last_updated) as newest
      from hotel_cache where city ilike '%kyoto%'
     group by 1 order by rows desc`,
  bookings: `
    select (select count(*) from service_bookings) as service_bookings_total,
           (select count(*) from service_bookings b join provider_services s on s.id = b.service_id
             where ${isKyoto("s.city")}) as service_bookings_kyoto,
           (select count(*) from trips where market_slug = 'kyoto') as kyoto_plans`,
};

function table(rows) {
  if (!rows.length) return "_(no rows)_\n";
  const cols = Object.keys(rows[0]);
  return [`| ${cols.join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${cols.map((c) => String(r[c] ?? "")).join(" | ")} |`)].join("\n") + "\n";
}

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith("--")) || process.env.DATABASE_URL;
  if (!url) { console.error("usage: report-kyoto-supply.cjs <DATABASE_URL> [--json]"); process.exit(2); }
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("SET default_transaction_read_only = on");
  const out = {};
  try {
    for (const [k, q] of Object.entries(QUERIES)) out[k] = (await client.query(q)).rows;
  } finally { await client.end(); }
  if (args.includes("--json")) { console.log(JSON.stringify(out, null, 2)); return; }
  const titles = {
    listingsByCategory: "Listings by category (city = Kyoto)",
    liveFieldCoverage: "Live listings — the fields the Trips slice reads",
    locationTextOnly: "NOT counted as Kyoto: city blank, location text mentions Kyoto",
    expertsByStatus: "Expert applications (city = Kyoto)",
    expertNeighborhoods: "Neighborhood claims in Kyoto",
    affiliateInventory: "Affiliate inventory rows (city = Kyoto)",
    hotelCache: "Hotel anchor candidates (hotel_cache, the anchor loader's source)",
    bookings: "Bookings and plans",
  };
  console.log(`# Kyoto supply census — ${new Date().toISOString()}\n`);
  for (const k of Object.keys(QUERIES)) console.log(`## ${titles[k]}\n\n${table(out[k])}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
