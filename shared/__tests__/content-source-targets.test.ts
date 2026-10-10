/**
 * SS-1a — the refresh targets config checks (ledger `2026-10-10-ss1a-registry-entry-sheet`).
 *
 *   ST1  a clean config against its rows has no problems; the shipped config is empty and clean
 *   ST2  a target naming a source id no row holds fails (SS-1 ruling 2: loudly)
 *   ST3  the url must be https on the row's own host (a subdomain is the same host); never a partner page
 *   ST4  the need must be ours and covered by the row; a `does_not_cover` exclusion wins
 *   ST5  last-service pages anchor on a station slug; stop pages anchor on a place id; nothing else fits
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { targetProblemLine, validateTargets, type ContentSourceTargets } from "../content-source-targets";
import { CONTENT_SOURCE_TARGETS } from "../../server/config/content-source-targets.config";

const rows = [
  { id: "keihan", homepage: "https://www.keihan.co.jp/", covers: ["transport.local.last_service"], doesNotCover: ["transport.intercity"] },
  { id: "kyoto_city_transport", homepage: "https://city.kyoto.lg.jp/", covers: ["transport.local"], doesNotCover: ["transport.local.fares"] },
  { id: "kyoto_travel", homepage: "https://kyoto.travel/", covers: ["stop.hours"], doesNotCover: [] },
];
const station = { kind: "station" as const, slug: "gion-shijo" };
const place = { kind: "place" as const, placeId: "ChIJ8cM8zdaoAWARPR27azYdlsA" };

test("ST1 — a clean config, and the shipped config", () => {
  const ok: ContentSourceTargets = {
    keihan: [{ label: "Keihan — last trains, Gion-Shijo", url: "https://www.keihan.co.jp/traffic/", need: "transport.local.last_service", anchor: station }],
    kyoto_city_transport: [{ label: "Subway — last trains", url: "https://www2.city.kyoto.lg.jp/kotsu/", need: "transport.local.last_service", anchor: { kind: "station", slug: "shijo" } }],
    kyoto_travel: [{ label: "Kiyomizu-dera", url: "https://kyoto.travel/en/shrine_temple/132.html", need: "stop.hours", anchor: place }],
  };
  assert.deepEqual(validateTargets(ok, rows), []);
  assert.deepEqual(CONTENT_SOURCE_TARGETS, {}, "empty until Leon types the rows and the pages are read");
  assert.deepEqual(validateTargets(CONTENT_SOURCE_TARGETS, []), []);
});

test("ST2 — an unknown source id fails, by name", () => {
  const p = validateTargets({ hankyu: [] }, rows);
  assert.deepEqual(p, [{ sourceId: "hankyu", problem: "unknown_source" }]);
  assert.match(targetProblemLine(p[0]), /hankyu: unknown_source — no content_sources row has this id/);
});

test("ST3 — the url is https on the row's own host", () => {
  const t = (url: string) => validateTargets({ keihan: [{ label: "x", url, need: "transport.local.last_service", anchor: station }] }, rows).map((p) => p.problem);
  assert.deepEqual(t("https://keihan.co.jp/traffic/"), [], "www is the same host");
  assert.deepEqual(t("https://www.hankyu.co.jp/"), ["off_host"]);
  assert.deepEqual(t("http://www.keihan.co.jp/"), ["bad_url"]);
  assert.deepEqual(t("not a url"), ["bad_url"]);
});

test("ST4 — the need is ours and covered; an exclusion wins", () => {
  const t = (sourceId: string, need: string, anchor: any = place) =>
    validateTargets({ [sourceId]: [{ label: "x", url: (rows.find((r) => r.id === sourceId)!.homepage as string) + "p", need, anchor }] }, rows).map((p) => p.problem);
  assert.deepEqual(t("kyoto_travel", "stop.ticketing"), ["need_not_covered"]);
  assert.deepEqual(t("kyoto_travel", "last trains"), ["unknown_need"]);
  assert.deepEqual(t("kyoto_city_transport", "transport.local.last_service", station), [], "a parent cover reaches its sub-need");
  assert.deepEqual(t("kyoto_city_transport", "transport.local.fares"), ["need_not_covered"], "the row excludes fares");
});

test("ST5 — anchors fit their need", () => {
  const t = (need: string, anchor: any, id = "keihan") =>
    validateTargets({ [id]: [{ label: "x", url: id === "keihan" ? "https://www.keihan.co.jp/" : "https://kyoto.travel/", need, anchor }] }, rows).map((p) => p.problem);
  assert.deepEqual(t("transport.local.last_service", place), ["anchor_need_mismatch"]);
  assert.deepEqual(t("stop.hours", station, "kyoto_travel"), ["anchor_need_mismatch"]);
  assert.deepEqual(t("transport.local.last_service", { kind: "station", slug: "Gion Shijo" }), ["bad_anchor"]);
  assert.deepEqual(t("stop.hours", { kind: "place", placeId: "x" }, "kyoto_travel"), ["bad_anchor"]);
  assert.deepEqual(t("transport.local.last_service", { kind: "station", slug: "gion-shijo", lat: 35 }), [], "extra keys are ignored, never read");
  assert.deepEqual(
    validateTargets({ keihan: [{ label: " ", url: "https://www.keihan.co.jp/", need: "transport.local.last_service", anchor: station }] }, rows).map((p) => p.problem),
    ["no_label"],
  );
});
