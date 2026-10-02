/**
 * city-events.manual.ts — the hand-kept list of festivals and one-night shows in the operating
 * cities (ledger `2026-09-28-city-events`).
 *
 * ENTRIES COME FROM THE DECISION-MAKER ONLY: series, city, venue, dates and the organiser's ticket
 * URL. Never pad this list — the landing strip stays absent until there are three real events in
 * the next 180 days, and an invented row would put a false date in front of a traveler (§13).
 *
 * Each entry:
 *   { source: "manual", sourceId: "<stable-slug>", series, title, city: "<operating city>",
 *     venue, venueLat?, venueLng?, startsAt: "<ISO with offset>", endsAt?, ticketUrl?,
 *     billedArtists?, blurb: "<one line of copy>", imagePath?, vertical?, seriesKey? }
 *   - `sourceId` never changes once published: the seeder keys on it and inserts only (it may fill a
 *     NULL `vertical`/`seriesKey` on an existing manual row, and nothing else — migration 335).
 *   - `city` IS THE OPERATING MARKET the event belongs to; `venue` (and its coordinates) may lie
 *     OUTSIDE that city, within the race-weekend leg budget of it (`RACE_WEEKEND_LEG_BUDGET_MINUTES`,
 *     ledger `2026-09-30-blog-race-weekend`). That is the rule, not a workaround: the Japanese Grand
 *     Prix is `city: "Kyoto"`, `venue: "Suzuka Circuit"` with Suzuka's own coordinates. Give such a
 *     venue its real coordinates — a race weekend needs them to compute the getting-there leg.
 *   - `vertical` is one of music | fashion | motorsport | other, stated, never guessed; `seriesKey` is
 *     a lower-case kebab key that groups one series across years and cities.
 *   - `imagePath` only for a photo the repo has rights to; never an organiser's, venue's or
 *     artist's official image. Leave it out and the card uses the city's own repo fallback
 *     (today Kyoto and Bogotá), else no photo.
 *   - `ticketUrl` is the organiser's or primary seller's page; an affiliate or resale host is refused
 *     by the seeder.
 *   - Do not state nights or a neighbourhood: both are derived.
 *   - COORDINATES ARE NOT HAND-TYPED (ledger `2026-10-01-city-events-nine-seed`). Leave
 *     `venueLat`/`venueLng` out and the seeder asks OpenStreetMap ONCE, when the row is first
 *     inserted, for "venue, venueLocality (default: city), country"; no match ⇒ NULL and flagged in
 *     the run's `unlocated`, never a guess; OSM unreachable ⇒ the row waits for the next run
 *     (`deferred`), because a seeded row is never looked up again. `venueLocality` is lookup-only, never stored. The
 *     coordinate is OSM data: "© OpenStreetMap contributors" is REQUIRED wherever it renders.
 *   - A date-only event starts at local midnight of its first day (ends at local midnight of its
 *     last) and leaves `startTimeKnown` unset, so the card shows no time; set `startTimeKnown: true`
 *     only for a time the organiser published (migration 337).
 *
 * Run: `tsx server/seeds/city-events.manual.ts` (also runs at boot; a no-op while empty).
 */
import type { CityEventSeedEntry } from "../services/city-events.service";

/**
 * Decision-maker's list, Oct 1, 2026 — dates verified against official or primary pages (sources in
 * the ledger row `2026-10-01-city-events-nine-seed`). Held until confirmed on the organiser's page:
 * Sunburn Goa 2026, Lakmé Fashion Week x FDCI, Serendipity Arts Festival 2026, Jaipur Literature
 * Festival 2027, Goa Carnival 2027. A `ticketUrl` is set only where the organiser's or primary seller's
 * own page was given; none is guessed. IMAGINE NOH's stays unset until the Kanze theatre's page is read.
 */
export const MANUAL_CITY_EVENTS: readonly CityEventSeedEntry[] = [
  {
    source: "manual",
    sourceId: "lollapalooza-india-2027",
    series: "Lollapalooza India",
    title: "Lollapalooza India 2027",
    city: "Mumbai",
    venue: "Mahalaxmi Racecourse",
    startsAt: "2027-01-23T00:00:00+05:30",
    endsAt: "2027-01-24T00:00:00+05:30",
    vertical: "music",
    seriesKey: "lollapalooza-india",
    // The organiser's site (BookMyShow is the seller) — decision-maker, Oct 1, 2026.
    ticketUrl: "https://lollaindia.com",
  },
  {
    source: "manual",
    sourceId: "estereo-picnic-2027",
    series: "Festival Estéreo Picnic",
    title: "Festival Estéreo Picnic 2027",
    city: "Bogotá",
    venue: "Parque Simón Bolívar",
    startsAt: "2027-03-19T00:00:00-05:00",
    endsAt: "2027-03-21T00:00:00-05:00",
    vertical: "music",
    seriesKey: "estereo-picnic",
    ticketUrl: "https://www.festivalestereopicnic.com",
  },
  // DATE CONFLICT, unresolved: the organiser's banner says Jan 9–17, 2027 and a news item says Jan 5–13.
  // The organiser's banner is kept; the founder is to confirm with the organiser before this is changed.
  {
    source: "manual",
    sourceId: "cartagena-festival-musica-2027",
    series: "Cartagena Festival de Música",
    title: "Cartagena Festival de Música 2027",
    city: "Cartagena",
    venue: "Multiple venues",
    startsAt: "2027-01-09T00:00:00-05:00",
    endsAt: "2027-01-17T00:00:00-05:00",
    vertical: "music",
    seriesKey: "cartagena-festival-musica",
    ticketUrl: "https://www.cartagenamusicfestival.com/index.php/programese-estas-son-las-fechas-del-festival-internacional-de-musica-de-cartagena/",
  },
  {
    source: "manual",
    sourceId: "hay-cartagena-2027",
    series: "Hay Festival Cartagena",
    title: "Hay Festival Cartagena 2027",
    city: "Cartagena",
    venue: "Centro Histórico",
    startsAt: "2027-01-28T00:00:00-05:00",
    endsAt: "2027-01-31T00:00:00-05:00",
    vertical: "other",
    seriesKey: "hay-cartagena",
    ticketUrl: "https://www.hayfestival.com/cartagena/inicio",
  },
  {
    source: "manual",
    sourceId: "edinburgh-hogmanay-2026-torchlight",
    series: "Edinburgh's Hogmanay",
    title: "Edinburgh's Hogmanay 2026 — Torchlight Procession",
    city: "Edinburgh",
    venue: "Old Town",
    startsAt: "2026-12-29T18:30:00+00:00",
    startTimeKnown: true,
    vertical: "music",
    seriesKey: "edinburgh-hogmanay",
    ticketUrl: "https://edwinterfest.com/hogmanay/whats-on/edinburghs-hogmanay-street-party-202526",
  },
  {
    source: "manual",
    sourceId: "edinburgh-hogmanay-2026-gardens",
    series: "Edinburgh's Hogmanay",
    title: "Hogmanay in the Gardens with Underworld + Street Party",
    city: "Edinburgh",
    venue: "Princes Street Gardens",
    startsAt: "2026-12-31T20:00:00+00:00",
    startTimeKnown: true,
    billedArtists: "Underworld",
    vertical: "music",
    seriesKey: "edinburgh-hogmanay",
    ticketUrl: "https://edwinterfest.com/hogmanay/whats-on/edinburghs-hogmanay-street-party-202526",
  },
  {
    // Operating market Porto; the venue is in Portimão (the race-weekend rule in this file's header).
    source: "manual",
    sourceId: "motogp-portugal-2026",
    series: "MotoGP Grande Prémio de Portugal",
    title: "MotoGP Grande Prémio de Portugal 2026",
    city: "Porto",
    venue: "Autódromo Internacional do Algarve",
    venueLocality: "Portimão",
    startsAt: "2026-11-20T00:00:00+00:00",
    endsAt: "2026-11-22T00:00:00+00:00",
    vertical: "motorsport",
    seriesKey: "motogp-portugal",
    ticketUrl: "https://autodromodoalgarve.com/race-calendar/motogp-grand-prix-of-portugal-2026/",
  },
  {
    // Operating market Kyoto; the venue is in Suzuka. Race day Apr 11; tickets on sale Nov 15.
    source: "manual",
    sourceId: "japanese-grand-prix-2027",
    series: "F1 Japanese Grand Prix",
    title: "F1 Japanese Grand Prix 2027",
    city: "Kyoto",
    venue: "Suzuka Circuit",
    venueLocality: "Suzuka",
    startsAt: "2027-04-09T00:00:00+09:00",
    endsAt: "2027-04-11T00:00:00+09:00",
    vertical: "motorsport",
    seriesKey: "japanese-grand-prix",
    ticketUrl: "https://www.suzukacircuit.jp/eng/f1/index.html",
  },
  {
    source: "manual",
    sourceId: "imagine-noh-2026",
    series: "IMAGINE NOH",
    title: "IMAGINE NOH — Legends and Laughter on Stage",
    city: "Kyoto",
    venue: "京都観世会館",
    startsAt: "2026-10-14T00:00:00+09:00",
    endsAt: "2026-11-05T00:00:00+09:00",
    vertical: "other",
    seriesKey: "kyoto-kanze-noh",
  },
  {
    source: "manual",
    sourceId: "sunburn-festival-2026",
    series: "Sunburn Festival",
    title: "Sunburn Festival 2026",
    city: "Mumbai",
    venue: "Mahalaxmi Racecourse",
    startsAt: "2026-12-18T16:00:00+05:30",
    endsAt: "2026-12-19T22:00:00+05:30",
    startTimeKnown: true,
    vertical: "music",
    seriesKey: "sunburn",
    ticketUrl: "https://sunburn.in/event/sunburn-festival-2026/",
  },
  {
    source: "manual",
    sourceId: "serendipity-arts-festival-2026",
    series: "Serendipity Arts Festival",
    title: "Serendipity Arts Festival 2026",
    city: "Goa",
    venue: "The Old GMC Complex",
    startsAt: "2026-12-13T00:00:00+05:30",
    endsAt: "2026-12-20T00:00:00+05:30",
    vertical: "other",
    seriesKey: "serendipity-arts",
    ticketUrl: "https://serendipityartsfestival.com",
  },
  {
    source: "manual",
    sourceId: "jaipur-literature-festival-2027",
    series: "Jaipur Literature Festival",
    title: "Jaipur Literature Festival 2027",
    city: "Jaipur",
    venue: "Hotel Clarks Amer",
    startsAt: "2027-01-14T00:00:00+05:30",
    endsAt: "2027-01-18T00:00:00+05:30",
    vertical: "other",
    seriesKey: "jaipur-literature-festival",
    ticketUrl: "https://jaipurliteraturefestival.org",
  },
  {
    source: "manual",
    sourceId: "royal-enfield-motoverse-2026",
    series: "Royal Enfield Motoverse",
    title: "Royal Enfield Motoverse 2026",
    city: "Goa",
    venue: "Vagator",
    startsAt: "2026-11-27T00:00:00+05:30",
    endsAt: "2026-11-29T00:00:00+05:30",
    vertical: "other",
    seriesKey: "royal-enfield-motoverse",
    ticketUrl: "https://royalenfield.com/in/en/rides/events/motoverse/",
  },
  {
    source: "manual",
    sourceId: "max-richter-live-mumbai-2026",
    title: "Max Richter Live",
    city: "Mumbai",
    venue: "Nita Mukesh Ambani Cultural Centre",
    startsAt: "2026-10-24T19:30:00+05:30",
    startTimeKnown: true,
    vertical: "music",
    ticketUrl: "https://nmacc.com",
  },
  {
    source: "manual",
    sourceId: "gulaab-shilpa-rao-2027",
    title: "Gulaab — Ghazals by Shilpa Rao",
    city: "Mumbai",
    venue: "Nita Mukesh Ambani Cultural Centre",
    startsAt: "2027-01-16T19:30:00+05:30",
    startTimeKnown: true,
    vertical: "music",
    ticketUrl: "https://nmacc.com",
  },
  {
    source: "manual",
    sourceId: "rock-al-parque-2026",
    series: "Rock al Parque",
    title: "Rock al Parque 2026 (30 años)",
    city: "Bogotá",
    venue: "Parque Simón Bolívar",
    startsAt: "2026-10-10T00:00:00-05:00",
    endsAt: "2026-10-12T00:00:00-05:00",
    vertical: "music",
    seriesKey: "rock-al-parque",
    ticketUrl: "https://rockalparque.gov.co",
  },
  {
    source: "manual",
    sourceId: "aitana-cuarto-azul-bogota-2026",
    title: "Aitana — Cuarto Azul World Tour",
    city: "Bogotá",
    venue: "Movistar Arena",
    startsAt: "2026-10-16T21:30:00-05:00",
    startTimeKnown: true,
    vertical: "music",
    ticketUrl: "https://movistararena.co/evento/aitana-cuarto-azul-world-tour/",
  },
  {
    source: "manual",
    sourceId: "snarky-puppy-porto-2027",
    title: "Snarky Puppy",
    city: "Porto",
    venue: "Coliseu Porto Ageas",
    startsAt: "2027-04-01T21:00:00+01:00",
    startTimeKnown: true,
    vertical: "music",
    ticketUrl: "https://coliseu.pt/evento/20270401-snarky-puppy/",
  },
  // The organiser prints doors at 19:00 and no set time; the stated time is the doors time.
  {
    source: "manual",
    sourceId: "starsailor-edinburgh-2026",
    title: "Starsailor",
    city: "Edinburgh",
    venue: "Usher Hall",
    startsAt: "2026-10-17T19:00:00+01:00",
    startTimeKnown: true,
    vertical: "music",
    ticketUrl: "https://cultureedinburgh.com/events/starsailor",
  },
  {
    source: "manual",
    sourceId: "mitsuko-uchida-kyoto-2026",
    title: "Mitsuko Uchida Piano Recital 2026",
    city: "Kyoto",
    venue: "Kyoto Concert Hall",
    startsAt: "2026-11-12T19:00:00+09:00",
    startTimeKnown: true,
    vertical: "music",
    ticketUrl: "https://kyotoconcerthall.org/en/",
  },
  // Two nights, two rows. The venue is in Osaka, outside the Kyoto market but within its leg budget.
  {
    source: "manual",
    sourceId: "yoasobi-chowakusei-osaka-2026-10-24",
    series: "YOASOBI Chowakusei dome tour",
    title: "YOASOBI — Chowakusei dome tour (Oct 24)",
    city: "Kyoto",
    venue: "Kyocera Dome Osaka",
    venueLocality: "Osaka",
    startsAt: "2026-10-24T18:00:00+09:00",
    startTimeKnown: true,
    vertical: "music",
    seriesKey: "yoasobi-chowakusei",
    ticketUrl: "https://kyoceradome-osaka.jp/schedule/",
  },
  {
    source: "manual",
    sourceId: "yoasobi-chowakusei-osaka-2026-10-25",
    series: "YOASOBI Chowakusei dome tour",
    title: "YOASOBI — Chowakusei dome tour (Oct 25)",
    city: "Kyoto",
    venue: "Kyocera Dome Osaka",
    venueLocality: "Osaka",
    startsAt: "2026-10-25T17:00:00+09:00",
    startTimeKnown: true,
    vertical: "music",
    seriesKey: "yoasobi-chowakusei",
    ticketUrl: "https://kyoceradome-osaka.jp/schedule/",
  },
];

export async function seedManualCityEvents() {
  const { seedCityEvents } = await import("../services/city-events.service");
  return seedCityEvents(MANUAL_CITY_EVENTS);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedManualCityEvents()
    .then((r) => {
      console.log(`[city-events] inserted ${r.inserted}, skipped ${r.skipped}, filled ${r.filled}, refused ${r.refused.length}, located ${r.located.length}, unlocated ${r.unlocated.length}, deferred ${r.deferred.length}`);
      for (const l of r.located) console.log(`  located   ${l.sourceId} ← "${l.matchedName}" (© OpenStreetMap contributors)`);
      for (const u of r.unlocated) console.log(`  unlocated ${u} (coordinates left empty)`);
      for (const d of r.deferred) console.log(`  deferred  ${d} (OpenStreetMap unreachable; not inserted, retried next run)`);
      for (const x of r.refused) console.log(`  refused   ${x.sourceId}: ${x.reason}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
