/**
 * LG-2 Ask 7 (decision-maker, Oct 18, 2026 — Leon's rulings 3–5): hand-picked OpenStreetMap points from the reviewed
 * points sheet, and the name attach. THIS SCRIPT IS A DRY RUN — it writes nothing:
 *
 *   npx tsx scripts/admin-osm-points.ts --csv <file>        # counts only
 *
 * Order, and it is the ruling: these counts are posted and approved by a person BEFORE anything is entered or attached.
 * Entering the points and writing the links is a later lane (migration 394, held), which adds `--enter` and `--attach`.
 * The sheet is never committed (it holds coordinates — internal, ODbL); the operator passes its path. Its first line is
 * the OSM credit and must be present.
 *
 * Rows are admitted only where `reviewed_by` and `approved` are filled; Hanamikoji never (held until Leon approves). A
 * path row counts as its START only until paths ship (Ask 7b's interim rule). The name attach is EXACT: an item's
 * title, normalised, equals one of the point's names (`planNameAttach`), the title as written or with its activity
 * words stripped (Ask 4); the counts say which. An item two points match takes neither.
 *
 * Output is COUNTS only — per point (its sheet name and how many items would take it) and in total. No item title, id or
 * coordinate is printed (plan content).
 */
import { readFileSync } from "node:fs";
import { eq, ilike } from "drizzle-orm";
import { db } from "../server/db";
import { itineraryItemOpenCoords, itineraryItems, trips } from "../shared/schema";
import { admitPointRow, adminPointId, parsePointsSheet, planNameAttach, type AdmittedPoint, type AttachItem } from "../shared/admin-osm-points";
import { strippedPlaceTitle } from "../server/services/item-osm-regeocode.service";
import { enteredAdminPointIds } from "../server/services/routing/open-place-coords.service";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}
const has = (name: string) => process.argv.includes(name);

async function loadKyotoItems(): Promise<AttachItem[]> {
  const rows = await db
    .select({ id: itineraryItems.id, title: itineraryItems.title, linkSource: itineraryItemOpenCoords.source, destination: trips.destination })
    .from(itineraryItems)
    .innerJoin(trips, eq(trips.id, itineraryItems.tripId))
    .leftJoin(itineraryItemOpenCoords, eq(itineraryItemOpenCoords.itemId, itineraryItems.id))
    .where(ilike(trips.destination, "%kyoto%"));
  return rows.map((r) => {
    const first = strippedPlaceTitle(r.title ?? "", r.destination).places[0] ?? null;
    return { id: r.id, title: r.title ?? "", strippedTitle: first && first !== r.title ? first : null, linkSource: r.linkSource ?? null };
  });
}

async function main(): Promise<void> {
  const file = arg("--csv");
  if (!file) throw new Error("--csv <file> is required");
  if (has("--enter") || has("--attach") || has("--apply")) {
    console.error("REFUSED: this script is a dry run. Entering points and writing links wait for the approved counts and migration 394.");
    process.exitCode = 1;
    return;
  }

  const sheet = parsePointsSheet(readFileSync(file, "utf8"));
  if (!sheet.ok) {
    console.error(`REFUSED: ${sheet.reason}${sheet.missing ? ` (${sheet.missing.join(", ")})` : ""}. Nothing read.`);
    process.exitCode = 1;
    return;
  }
  const refused: Record<string, number> = {};
  const points: AdmittedPoint[] = [];
  for (const row of sheet.rows) {
    const a = admitPointRow(row);
    if (a.ok) points.push(a.point);
    else refused[a.reason] = (refused[a.reason] ?? 0) + 1;
  }
  const entered = await enteredAdminPointIds(points.map(adminPointId));
  const items = await loadKyotoItems();
  const plan = planNameAttach(items, points);

  const attachPlan = plan.filter((d): d is Extract<typeof d, { kind: "attach" }> => d.kind === "attach");
  const perPoint: Record<string, number> = {};
  for (const p of points) perPoint[p.place] = 0;
  for (const d of attachPlan) perPoint[d.place] = (perPoint[d.place] ?? 0) + 1;
  const counts = {
    sheetRows: sheet.rows.length,
    admitted: points.length,
    refused,
    pathRowsEnteredAtStartOnly: points.filter((p) => p.pointBasis === "path_start").length,
    alreadyEntered: points.filter((p) => entered.has(adminPointId(p))).length,
    kyotoItems: items.length,
    attach: attachPlan.length,
    attachByTitle: attachPlan.filter((d) => d.basis === "title").length,
    attachByStrippedTitle: attachPlan.filter((d) => d.basis === "stripped_title").length,
    attachReplacingAnOsmLink: attachPlan.filter((d) => d.replaces && d.replaces !== "admin").length,
    alreadyAdminLinked: plan.filter((d) => d.kind === "already_admin").length,
    ambiguous: plan.filter((d) => d.kind === "ambiguous").length,
    unmatched: plan.filter((d) => d.kind === "unmatched").length,
    pointsWithNoItem: Object.values(perPoint).filter((n) => n === 0).length,
  };

  console.log(`DRY RUN (Ask 7) — nothing written. Credit line: present.`);
  console.log(JSON.stringify({ counts, itemsPerPoint: perPoint }, null, 2));
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err?.message ?? err);
    process.exit(1);
  });
