# Dispatch LG-2: Open-coordinate quality pass, before any leg rebuild (2026-10-18)

From: Coding Bot, for the architect, via Leon. Base: main `e28c281`. Follows LG-1 and the OSM apply counted on #1541.

## Leon's direction (architect's words, relayed by Leon)
"Quality pass before anything else, and the suspect links come out."

## Why
- Some of the 64 "resolved" links are wrong. Nanzen-ji matched the neighbourhood "Nanzenji-Fukuchicho" 4,317 m from the stored point. Tenryu-ji matched "Sagatenryuji-Susukinobabacho". Nijō Castle's candidates were five segments of Horikawa Street. The matcher accepts OSM admin areas and streets that carry the name.
- These links are live routing inputs now, not only after `--apply`. In `server/services/routing/open-routing-points.ts`, `routingPointFor` ranks an item's linked open place (`itemOpen`) above its Google point. Only an admin row for the place id outranks the link. So a leg to Nanzen-ji is computed from a neighbourhood centroid today.
- Wikidata resolved 0 of 104 because the query planner sent the fallback text ("Kyoto, Japan", "Accommodation in Central Kyoto") instead of the place name.
- The non-place classifier skipped the most routable places in Kyoto (Arashiyama Bamboo Grove, Philosopher's Path, Togetsukyo Bridge, Pontocho Alley, Yasaka Pagoda, Sannenzaka) because their titles end in "Walk", "Streets", "Photo Spot", "Tour" and similar.

## Order of work
Ask 1 ships first and on its own if needed. No leg rebuild `--apply` until Ask 1 is done and its counts are posted.

### Ask 1. Take the suspect links out, keep them for review (no data lost)
1. Add a review table (for example `itinerary_item_open_coords_review`) holding each removed link with: item id, open place id, OSM type and id, OSM display name, the item's stored point, distance between the two, the reason code, and when it was removed.
2. Move into it, and remove from `itinerary_item_open_coords`, every link where any of these holds:
   - the OSM match is an administrative area, neighbourhood, quarter, block, suburb or street (way with a `highway` tag, or `place=*` / `boundary=administrative`),
   - the OSM name does not contain the item's own place name (normalised: case, macrons, "Temple"/"-ji"/"Shrine"/"-jinja" equivalence),
   - the distance from the item's stored point is over a threshold set in admin config: `[OPEN_COORD_MAX_DRIFT_M]` (Leon sets the value; no default is invented here).
3. Do not touch `open_place_coords` rows, Google points or any other table. Delete nothing. A link can be moved back from the review table once checked.
4. Write none of the four ambiguous items (`7f315df7` Nishiki Market, `bdb7c079` Sagano train, `5504d98f` Arashiyama dinner, `c8805c16` Nijō Castle).
5. Post on the PR: counts only (links examined, moved to review by reason, kept). No coordinates of user plans in the public repo.

### Ask 2. Fix the matcher
- Accept only a feature whose OSM class fits a visitable place (tourism, amenity, historic, leisure, religious building or site, railway station, natural feature, shop for food items, named pedestrian street only when the item IS that street, e.g. "Sannenzaka").
- Reject administrative areas and road segments for named places. Several same-name segments is "ambiguous", never "resolved".
- Pin tests: Nanzen-ji, Tenryu-ji and Nijō Castle must not resolve to a neighbourhood or Horikawa Street; Sannenzaka may resolve to its street.

### Ask 3. Fix the Wikidata query planner
- Search the place phrase taken from the title, never the fallback city text. If no place phrase can be taken, skip with a reason; don't query "Kyoto, Japan".
- Keep the region gate (`Q120730 = "Kyoto Prefecture"`).
- Pin test: "Kyoto Dawn Temple Private Tour" must not produce the query "Kyoto, Japan".

### Ask 4. Fix the non-place classifier
- Strip activity words before deciding ("Walk", "Walking Tour", "Stroll", "Photo Spot", "Visit", "Shopping Streets", "Self-Guided", "(optional …)", "& Riverside Walk") and match what remains.
- Titles joining two places ("Sannenzaka & Ninenzaka", "Ryoanji … OR …") are multi-place: route from the first named place, or mark ambiguous. Never a city centroid.
- Pin tests from the 34 skipped titles in the run (Bamboo Grove, Philosopher's Path, Togetsukyo Bridge, Pontocho Alley, Yasaka Pagoda, Sannenzaka must not be skipped).

### Ask 5. Items that shouldn't get a single place point
- Private tours, "Arrive in …", airport arrivals and "Check-in at hotel" route from a provider meeting point or the traveler's chosen stay, never a city or district centre. With neither, the stop is unlocated.

### Ask 6. What the traveler sees for an unchecked leg (Product Bot's ruling, confirmed by Leon)
- Today, an item with no open point falls back to its Google point tagged `google`; under the strict Google reading the adapter refuses it, so the stop is unlocated and gets no computed leg.
- A leg with no checked open point shows "Travel time not checked yet". Never a guessed time.
- The day's check never reports a pass when any leg in it is unchecked.

### Ask 7. Hand-picked admin points for the common spots (the coverage shortcut)
- Build the admin-row path so a person can enter a point picked from OSM for a place id (admin rows already win in `mergeOpenCoords` and `routingPointFor`).
- Today an admin row attaches only by Google place id (`mergeOpenCoords`, `routingPointFor`), so items without a place id (41 of the 64 resolved had none) never reach it. Let an admin point also be linked to plan items by matched place name, through the same `itinerary_item_open_coords` link an OSM match uses, with origin `admin` so it outranks an OSM link. Matching is a dry run first, with counts posted, and a person approves before links are written.
- Research Bot's sheet: https://docs.google.com/spreadsheets/d/14fJRxFRwqoTx9n_uoe6yUL0pm3_AXMmW48t4X10FKrg/edit (temples and the castle use the main gate; enter only rows with reviewed_by and approved filled in). Higashiyama area and Arashiyama dinner have no point and stay unlocated until a meeting point or restaurant is chosen.
- The list (about 20 most frequent Kyoto spots in plan items, plus the four ambiguous items) is picked by a person, not by the script. Nijō Castle is the castle itself. The code only needs the entry path, the source note (OSM id) and the checked date (LD 65).

### Ask 7b. Walks and streets get a start and an end point (Product Bot)
- A path or street stop (Philosopher's Path, Sannenzaka and similar) routes its arriving leg to a start point and its leaving leg from an end point, not a midpoint. Example: Philosopher's Path starts at the Ginkaku-ji end and finishes at the Nanzen-ji end.
- Admin rows need an optional end point (start = the existing point). Research Bot's sheet has start and end for the paths (Philosopher's Path, Sannenzaka, Ninenzaka, Pontocho, Hanamikoji, Bamboo Grove path, Nishiki Market); either end can be the start. Pick direction per plan: the end nearer the previous stop is the start, unless the item names its start (e.g. a tour from Ginkaku-ji).
- This means a stop can carry two points. Check how the routing engine's one-point-per-stop shape (`RoutePoint`) can take an optional end point without breaking existing legs, and report the approach before building it if it touches leg keys.
- Until 7b ships (Product Bot): enter each path as its start point only, and show the leg leaving a path stop as "Travel time not checked yet" so the day check can't pass on it (same rule as Ask 6). Once end points work, that leg is computed from the end point.

### Ask 8. Licence and geocoding terms (Research Bot)
- Wherever open coordinates show (map, Trip Card), show the credit exactly: "© OpenStreetMap contributors".
- The coordinate tables stay internal: no public export or API that returns them in bulk (ODbL share-alike).
- No further runs or rechecks against the public Nominatim server (its policy bans bulk geocoding). The rerun waits for a self-hosted instance or a paid geocoder; make the geocoder base URL a config value and refuse the public host for batch runs.

### Ask 9. Planner title rules (Marketing) — Track A's lane, not Logistics'
- Add these to the trip generator's banned phrases, checked on generated titles and descriptions: "geisha spotting"; "hidden gem(s)", "secret", "insider"; "vetted", "verified", "certified", "licensed", "authenticated" when they describe Traveloure or its listings; "no hidden fees", "no markup"; "Trending" (use "In season").
- A title that trips the check is regenerated or reworded ("Gion District Walk" for the Gion case). Pin test with the two Gion titles.
- Leon approved renaming the two saved items (`18754d33`, `92049500`) to "Gion District Walk".

## Constraints
- Public repo: no secrets, no user-plan coordinates or traveler data in code, tests or PR text. Counts only.
- No made-up thresholds or numbers in code defaults; use admin config with the value left for Leon.
- Delete nothing. Ask 1's removal is a move into the review table.
- No `--apply` of the leg rebuild in this PR.

## Done when
- Ask 1's counts are posted and the suspect links are in the review table, not in routing.
- Matcher, query planner and classifier pin tests pass; a dry run (no writes) on the same 244 items reports new counts for resolved, ambiguous and skipped.
- "Travel time not checked yet" shows for unchecked legs and the day check can't pass with one.
- The OSM credit shows wherever open points render.
- The batch geocoder refuses the public Nominatim host.
- The banned-phrase check runs on generated titles (Track A).

## Leon's rulings (Oct 18, 3:31 PM ET)
1. Drift threshold: 500 m, set in admin config as `OPEN_COORD_MAX_DRIFT_M`. Every neighbourhood, district or street match is pulled regardless of distance (Ask 1).
2. Ask 6 is confirmed: "Travel time not checked yet", and the day check can't pass with an unchecked leg.
3. Paths are one admin row with a start and an end point (Ask 7b is in this PR). If the end-point approach touches leg keys and has to wait, the interim rule in 7b applies.
4. Name attach (Ask 7) uses exact name match only, with source `admin`. Dry run and counts first, then a person approves the writes.
5. Points sheet: approved as Ops Bot reviewed. Hanamikoji is held: don't enter it, and its leaving leg stays "Travel time not checked yet". Each path is one row (start in lat/lon, end in end_lat/end_lng); Nishiki is one row (Teramachi end to Takakura end). Enter only rows showing reviewed_by and approved.
6. Gion rename (Ask 9): approved. The two saved items (`18754d33`, `92049500`) are renamed to "Gion District Walk" in Track A's PR.
7. Geocoder: waits until after Oct 21, with the rerun. No geocoder work in this PR beyond the config value and the public-host refusal (Ask 8).

## Architect's additions (Oct 18)
- Ask 1 review table is link-level: `open_place_coords` rows are never moved. A pulled item must not fall back to the same place through its Google place id. A restored link is not pulled again.
- Admin/neighbourhood/street is read from the row's name for now (no OSM class stored; no public re-query); class is stored on the post-Oct 21 rerun.
- Ask 7b: one `open_place_coords` row with `kind = 'path'` and nullable `end_lat`/`end_lng`; path ends tagged in leg keys (`@a`/`@b`) so a flipped direction recomputes both adjacent legs; ordinary point keys unchanged. Approved as reported.
- Google Routes `travel_time_matrix`: no writer or reader on `e28c281`; stored cells and the two dead Route Matrix functions go in a separate PR held for "delete approved — Leon".
