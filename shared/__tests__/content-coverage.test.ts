/**
 * A6 (1) — sub-needs, `needCovers`, and the nested coverage report (ledger `2026-10-01-a6-sub-needs`;
 * a6-design decision 1B).
 *   S1  needCovers: a parent reaches its sub-needs; a sub-need never reaches its parent or a sibling;
 *       unknown strings reach nothing
 *   S2  sourceNeedStanding: 12Go (intercity, not rail) is `partial` on intercity, `excludes` on rail,
 *       `covers` on bus; a rail-only source does not cover intercity; an exclusion always wins
 *   S3  admitNeedList refuses free text by name ("everything else", "tip") and de-duplicates
 *   S4  report nests every sub-need under its parent, in CONTENT_NEEDS order
 *   S5  a required need with no ACTIVE source is flagged; an inactive source does not satisfy it
 *   S6  12Go excluding rail surfaces the JR rail gap on the recommended intercity row
 *   S7  terms older than 180 days are flagged (flag only — the source stays active in the report);
 *       a never-checked source is listed; stored values that are not ours are named
 *   S8  a market with no stated requirement says so and flags nothing as required
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_NEEDS, admitNeedList, needCovers, sourceNeedStanding, subNeedsOf } from "../content-facts";
import { buildCoverageReport, renderCoverageMarkdown, type CoverageSourceRow } from "../content-coverage";

const NOW = new Date("2026-10-01T00:00:00Z");
const src = (o: Partial<CoverageSourceRow> & { id: string }): CoverageSourceRow => ({
  name: o.id, market: "kyoto", covers: [], doesNotCover: [], active: true, termsCheckedAt: "2026-09-01T00:00:00Z", ...o,
});

test("S1: needCovers is one level, parent → child only", () => {
  assert.equal(needCovers("transport.intercity", "transport.intercity.rail"), true);
  assert.equal(needCovers("transport.intercity", "transport.intercity"), true);
  assert.equal(needCovers("transport.intercity.rail", "transport.intercity"), false);
  assert.equal(needCovers("transport.intercity.rail", "transport.intercity.bus"), false);
  assert.equal(needCovers("transport.local", "transport.intercity.rail"), false);
  assert.equal(needCovers("everything else", "dining"), false);
  assert.equal(needCovers("dining", "tip"), false);
  assert.deepEqual(subNeedsOf("transport.local"), ["transport.local.fares"]);
});

test("S2: standings — partial, excludes, covers, and a rail-only source", () => {
  const twelveGo = { covers: ["transport.intercity"], doesNotCover: ["transport.intercity.rail", "transport.cruise"] };
  assert.equal(sourceNeedStanding(twelveGo, "transport.intercity"), "partial");
  assert.equal(sourceNeedStanding(twelveGo, "transport.intercity.rail"), "excludes");
  assert.equal(sourceNeedStanding(twelveGo, "transport.intercity.bus"), "covers");
  assert.equal(sourceNeedStanding(twelveGo, "transport.cruise"), "excludes");
  assert.equal(sourceNeedStanding(twelveGo, "dining"), "none");
  const jr = { covers: ["transport.intercity.rail"], doesNotCover: [] };
  assert.equal(sourceNeedStanding(jr, "transport.intercity"), "none");
  assert.equal(sourceNeedStanding(jr, "transport.intercity.rail"), "covers");
  assert.equal(sourceNeedStanding({ covers: ["dining"], doesNotCover: ["dining"] }, "dining"), "excludes");
});

test("S3: admitNeedList refuses free text by name", () => {
  assert.deepEqual(admitNeedList([" dining ", "dining", "transport.local.fares"]), { ok: true, needs: ["dining", "transport.local.fares"] });
  assert.deepEqual(admitNeedList(["dining", "everything else", "tip"]), { ok: false, refused: ["everything else", "tip"] });
  assert.equal(admitNeedList("dining").ok, false);
});

test("S4: rows nest each sub-need directly under its parent", () => {
  const r = buildCoverageReport("kyoto", [], NOW);
  const tops = r.rows.filter((x) => x.parent === null).map((x) => x.need);
  assert.deepEqual(tops, [...CONTENT_NEEDS]);
  const i = r.rows.findIndex((x) => x.need === "transport.intercity");
  assert.deepEqual(r.rows.slice(i + 1, i + 4).map((x) => [x.need, x.parent]), [
    ["transport.intercity.rail", "transport.intercity"],
    ["transport.intercity.bus", "transport.intercity"],
    ["transport.intercity.ferry", "transport.intercity"],
  ]);
  assert.match(renderCoverageMarkdown(r), /↳ `transport\.intercity\.rail`/);
});

test("S5: a required need is gated on an ACTIVE source", () => {
  const r = buildCoverageReport("Kyoto", [
    src({ id: "places", market: null, covers: ["stop.hours", "dining"] }),
    src({ id: "lodging_draft", covers: ["lodging"], active: false }),
  ], NOW);
  const by = (n: string) => r.rows.find((x) => x.need === n)!;
  assert.equal(by("stop.hours").gap, null);
  assert.deepEqual(by("stop.hours").activeCovering, ["places"]);
  assert.equal(by("lodging").gap, "required_uncovered");
  assert.equal(by("transport.local.fares").gap, "required_sub_uncovered");
  assert.equal(by("transport.cruise").requirement, "not_applicable");
  assert.equal(by("transport.cruise").gap, null);
});

test("S6: 12Go excluding rail shows the JR rail gap", () => {
  const r = buildCoverageReport("kyoto", [
    src({ id: "12go", market: null, covers: ["transport.intercity"], doesNotCover: ["transport.intercity.rail"] }),
  ], NOW);
  const by = (n: string) => r.rows.find((x) => x.need === n)!;
  assert.equal(by("transport.intercity").cells[0].standing, "partial");
  assert.equal(by("transport.intercity").gap, null);
  assert.equal(by("transport.intercity.rail").gap, "recommended_uncovered");
  assert.equal(by("transport.intercity.bus").gap, null);
});

test("S7: stale and unchecked terms, unknown stored values", () => {
  const r = buildCoverageReport("kyoto", [
    src({ id: "old", covers: ["dining"], termsCheckedAt: "2026-03-01T00:00:00Z" }),
    src({ id: "never", covers: ["tip", "everything else"], termsCheckedAt: null, active: false }),
    src({ id: "elsewhere", market: "edinburgh", covers: ["lodging"] }),
  ], NOW);
  assert.deepEqual(r.staleTerms.map((s) => s.sourceId), ["old"]);
  assert.equal(r.sources.find((s) => s.id === "old")!.active, true, "flag only — never deactivated");
  assert.deepEqual(r.uncheckedTerms, ["never"]);
  assert.deepEqual(r.unknownValues, [{ sourceId: "never", value: "tip" }, { sourceId: "never", value: "everything else" }]);
  assert.equal(r.sources.some((s) => s.id === "elsewhere"), false);
});

test("S8: a market with no stated requirement says so", () => {
  const r = buildCoverageReport("lisbon", [], NOW);
  assert.equal(r.requirementsStated, false);
  assert.ok(r.rows.every((x) => x.requirement === "unstated" && x.gap === null));
  assert.match(renderCoverageMarkdown(r), /No coverage requirement is stated/);
});
