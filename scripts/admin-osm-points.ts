/**
 * LG-2 Ask 7 (decision-maker, Oct 18, 2026 — Leon's rulings 3–5): hand-picked OpenStreetMap points from the reviewed
 * points sheet, and the name attach. Three modes; the DEFAULT writes nothing.
 *
 *   npx tsx scripts/admin-osm-points.ts --csv <file>                                      # DRY RUN — counts only
 *   npx tsx scripts/admin-osm-points.ts --csv <file> --enter --by "<name>" --checked YYYY-MM-DD
 *                                                    # enters the admitted points (open_place_coords, source 'admin')
 *   npx tsx scripts/admin-osm-points.ts --csv <file> --attach --by "<name>" --approved-counts
 *                                                    # writes the name-attach links (source 'admin')
 *
 * Order, and it is the ruling: the dry run's counts are posted and approved by a person BEFORE anything is entered or
 * attached. `--attach` also refuses a point that has not been entered. The sheet is never committed (it holds
 * coordinates — internal, ODbL); the operator passes its path. Its first line is the OSM credit and must be present.
 *
 * Rows are entered only where `reviewed_by` and `approved` are filled; Hanamikoji never (held until Leon approves). A
 * path row is entered at its START only until paths ship (Ask 7b's interim rule): the leg leaving it reads as not
 * checked. The name attach is EXACT: an item's title, normalised, equals one of the point's names (`planNameAttach`),
 * the title as written or with its activity words stripped (Ask 4). An item two points match takes neither.
 *
 * Output is COUNTS only — per point (its sheet name and how many items would take it) and in total. No item title,
 * id or coordinate is printed (plan content). The counts also say how many of the links Ask 1 pulled into review
 * (unrestored, by reason) the sheet would carry — give an admin point to — and how many it leaves unlocated.
 *
 *   npx tsx scripts/admin-osm-points.ts --csv <file> --mismatch-report
 *                                                    # READ-ONLY: the Ask 1 `name_mismatch` review rows, one line each
 *
 * `--mismatch-report` is the one mode that prints names: for each unrestored `name_mismatch` row, the OSM place name the
 * link pointed at, the item's title, the distance, and what the sheet would do (which sheet point, or nothing). No id
 * and no coordinate. Its output goes to the chat report only — never onto a PR (counts only there).
 */
import { readFileSync } from "node:fs";
import { eq, ilike, isNull } from "drizzle-orm";
import { db } from "../server/db";
import { itineraryItemOpenCoords, itineraryItemOpenCoordsReview, itineraryItems, trips } from "../shared/schema";
import { admitPointRow, adminPointId, parsePointsSheet, planNameAttach, type AdmittedPoint, type AttachItem } from "../shared/admin-osm-points";
import { strippedPlaceTitle } from "../server/services/item-osm-regeocode.service";
import { enterAdminOsmPoint, enteredAdminPointIds } from "../server/services/routing/open-place-coords.service";
import { attachAdminPointToItem } from "../server/services/routing/open-coord-review.service";

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

/** The Ask 1 review rows still out of routing (unrestored), with each item's title. Read-only. */
async function loadOpenReviewRows(): Promise<Array<{ itemId: string; reason: string; displayName: string | null; distanceM: number | null; title: string | null }>> {
  const rows = await db
    .select({
      itemId: itineraryItemOpenCoordsReview.itemId,
      reason: itineraryItemOpenCoordsReview.reason,
      displayName: itineraryItemOpenCoordsReview.displayName,
      distanceM: itineraryItemOpenCoordsReview.distanceM,
      title: itineraryItems.title,
    })
    .from(itineraryItemOpenCoordsReview)
    .leftJoin(itineraryItems, eq(itineraryItems.id, itineraryItemOpenCoordsReview.itemId))
    .where(isNull(itineraryItemOpenCoordsReview.restoredAt));
  return rows.filter((r) => r.itemId).map((r) => ({ itemId: r.itemId!, reason: r.reason ?? "unknown", displayName: r.displayName, distanceM: r.distanceM, title: r.title }));
}

async function main(): Promise<void> {
  const file = arg("--csv");
  if (!file) throw new Error("--csv <file> is required");
  const enter = has("--enter");
  const attach = has("--attach");
  if (enter && attach) throw new Error("--enter and --attach run separately");
  const by = arg("--by");
  if ((enter || attach) && !by) throw new Error("--by <name> is required to write");

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

  // Ask 1's pulled links (unrestored): how many the sheet would give an admin point, by reason. Counts only.
  const reviewRows = await loadOpenReviewRows();
  const attachByItem = new Map(attachPlan.map((d) => [d.itemId, d]));
  const reviewCarried: Record<string, { pulled: number; sheetCarries: number }> = {};
  for (const r of reviewRows) {
    const e = (reviewCarried[r.reason] ??= { pulled: 0, sheetCarries: 0 });
    e.pulled += 1;
    if (attachByItem.has(r.itemId)) e.sheetCarries += 1;
  }

  if (has("--mismatch-report")) {
    if (enter || attach) throw new Error("--mismatch-report is read-only; run it alone");
    const rows = reviewRows.filter((r) => r.reason === "name_mismatch");
    console.log(`MISMATCH REPORT (Ask 1 name_mismatch rows, read-only) — ${rows.length} row(s). Chat report only; never on a PR.`);
    for (const r of rows) {
      const d = attachByItem.get(r.itemId);
      console.log(
        `- pointed at: ${r.displayName ?? "(no name)"} · item: ${r.title ?? "(item gone)"} · ${r.distanceM == null ? "no distance" : `${r.distanceM} m`} · sheet: ${d ? `attach "${d.place}" (${d.basis})` : "nothing — stays unlocated"}`,
      );
    }
    return;
  }

  if (!enter && !attach) {
    console.log(`DRY RUN (Ask 7) — nothing written. Credit line: present.`);
    console.log(JSON.stringify({ counts, reviewRowsBySheet: reviewCarried, itemsPerPoint: perPoint }, null, 2));
    return;
  }

  if (enter) {
    const checked = arg("--checked");
    if (!checked || !/^\d{4}-\d{2}-\d{2}$/.test(checked)) throw new Error("--checked YYYY-MM-DD is required to enter points");
    let n = 0;
    for (const p of points) if ((await enterAdminOsmPoint(p, by!, new Date(`${checked}T00:00:00Z`))).entered) n += 1;
    console.log(JSON.stringify({ entered: n, alreadyEntered: points.length - n, refused }, null, 2));
    return;
  }

  // --attach
  if (!has("--approved-counts")) {
    console.error("REFUSED: --attach writes links only after the dry run's counts were posted and approved; pass --approved-counts to say they were.");
    process.exitCode = 1;
    return;
  }
  const notEntered = attachPlan.filter((d) => !entered.has(d.pointId));
  if (notEntered.length) {
    console.error(`REFUSED: ${new Set(notEntered.map((d) => d.place)).size} point(s) the attach needs are not entered yet. Run --enter first.`);
    process.exitCode = 1;
    return;
  }
  const result = { attached: 0, replacedAnOsmLink: 0, skipped: 0 };
  for (const d of attachPlan) {
    const r = await attachAdminPointToItem(d.itemId, d.pointId, by!);
    if (r.attached) {
      result.attached += 1;
      if (r.replaced) result.replacedAnOsmLink += 1;
    } else result.skipped += 1;
  }
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err?.message ?? err);
    process.exit(1);
  });
