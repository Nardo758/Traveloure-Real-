/**
 * STEP 8a — THE ONE OCCASION PICKER AND THE /experiences START STATE (ledger
 * `2026-10-06-step8a-experiences-entry`; step 8 brief rev 3.1, 8a items 1, 2 and 4).
 *
 *   P1  the page and the modal list the SAME occasions in the SAME groups, from ONE source
 *   P2  the five labels come from ONE home, and the picker renders exactly those five
 *   P3  `proposal` sits under "A moment"
 *   P4  a NULL-switch row appears only under See all and in search — never in a group
 *   P5  the page starts through PlanEntry inline and the provider's one start (E3; `canContinue` deleted)
 *   P6  `?destination=` / `?city=` pre-pick only an EXACT match of the eight (ruling 4)
 *   P7  the map's eight pins come from OPERATING_MARKETS through the board's projection (ruling 2)
 *   P8  only Kyoto and Bogotá carry a (credited) photo; the other six are typographic (ruling 3)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  OCCASION_GROUP_LABELS,
  OCCASION_GROUP_ORDER,
  groupOccasions,
  searchOccasions,
} from "@shared/experience-group";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import {
  cityPhotoFor,
  exactOperatingMarket,
  preselectedMarket,
  projectToWorldMap,
} from "../experiences-entry";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const row = (slug: string, name: string, o: Record<string, unknown>) => ({
  slug,
  name,
  description: null as string | null,
  defaultStops: "one",
  ...o,
});
const CATALOG = [
  row("travel", "Travel", { defaultDuration: "range", defaultGuests: false, defaultStops: "many" }),
  row("date-night", "Date Night", { defaultDuration: "day", defaultGuests: false }),
  row("proposal", "Proposal", { defaultDuration: "day", defaultGuests: false }),
  row("birthday", "Birthday", { defaultDuration: "day", defaultGuests: true }),
  row("wedding", "Wedding", { defaultDuration: "range", defaultGuests: true, rolesNeeded: ["venue", "caterer"] }),
  row("girls-trip", "Girls Trip", { defaultDuration: "range", defaultGuests: true, rolesNeeded: ["accommodation"] }),
  // A row whose switches are not set (LD 28): plain plan.
  row("mystery", "Something else", { defaultDuration: null, defaultGuests: null, defaultStops: null }),
];

const BOARD_LABELS = ["A trip", "A moment", "A celebration", "A hosted event", "Group travel"];

describe("P1 — one picker, one source", () => {
  it("the page and the modal both render <OccasionPicker> and neither keeps its own occasion grid", () => {
    // E2 (sanctioned): the pop-up's occasion picker lives in PlanEntry now; the edit window has none.
    // E3 (sanctioned): the page mounts PlanEntry inline, so its picker is PlanEntry's "More specific".
    const entry = read("client/src/components/plan/PlanEntry.tsx");
    assert.match(entry, /<OccasionPicker\b/, "PlanEntry renders the shared picker");
    assert.doesNotMatch(entry, /option-occasion-/, "PlanEntry must not draw its own occasion tiles");
    const page = read("client/src/pages/experiences.tsx");
    assert.doesNotMatch(page, /<OccasionPicker\b|option-occasion-/, "the page keeps no occasion grid of its own");
    assert.match(page, /<PlanEntryPanel\b/, "the page's occasion question is PlanEntry's");
    // One reader of the rows: the one runtime vocabulary query key.
    assert.match(entry, /queryKey:\s*\["\/api\/experience-types"\]/);
  });

  it("grouping is experienceGroupFor over the rows, in the board's order", () => {
    const { groups, ungrouped } = groupOccasions(CATALOG);
    assert.deepEqual(
      groups.map((g) => [g.key, g.rows.map((r) => r.slug)]),
      [
        ["trips", ["travel"]],
        ["moments", ["date-night", "proposal"]],
        ["celebrations", ["birthday"]],
        ["hosted_events", ["wedding"]],
        ["group_travel", ["girls-trip"]],
      ],
    );
    assert.deepEqual(ungrouped.map((r) => r.slug), ["mystery"]);
  });

  it("a group with no rows is omitted, never drawn empty", () => {
    const { groups } = groupOccasions(CATALOG.filter((r) => r.slug !== "wedding"));
    assert.ok(!groups.some((g) => g.key === "hosted_events"));
  });
});

describe("P2 — the five labels have ONE home", () => {
  it("the home holds exactly the board's five, in order, and no plain_plan label", () => {
    assert.deepEqual(OCCASION_GROUP_ORDER.map((k) => OCCASION_GROUP_LABELS[k]), BOARD_LABELS);
    assert.equal(Object.keys(OCCASION_GROUP_LABELS).length, 5);
    assert.ok(!("plain_plan" in OCCASION_GROUP_LABELS));
  });

  it("the picker renders exactly those labels", () => {
    const { groups } = groupOccasions(CATALOG);
    assert.deepEqual(groups.map((g) => g.label), BOARD_LABELS);
    const picker = read("client/src/components/plan/OccasionPicker.tsx");
    assert.match(picker, /\{g\.label\}/, "the group button draws the label from groupOccasions");
  });

  it("no other client or shared source spells any of the five", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === "node_modules" || name === "__tests__") continue;
          walk(p);
        } else if (/\.(tsx?|json)$/.test(name)) {
          const rel = path.relative(ROOT, p);
          if (rel === path.join("shared", "experience-group.ts")) continue;
          const src = readFileSync(p, "utf8");
          for (const label of BOARD_LABELS) if (src.includes(`"${label}"`)) offenders.push(`${rel}: ${label}`);
        }
      }
    };
    walk(path.join(ROOT, "client/src"));
    walk(path.join(ROOT, "shared"));
    assert.deepEqual(offenders, []);
  });
});

describe("P3/P4 — where a row lands", () => {
  it("proposal is under A moment", () => {
    const g = groupOccasions(CATALOG).groups.find((x) => x.rows.some((r) => r.slug === "proposal"));
    assert.equal(g?.label, "A moment");
  });

  it("a NULL-switch row is in no group, but See all and search reach it", () => {
    const { groups } = groupOccasions(CATALOG);
    assert.ok(!groups.some((g) => g.rows.some((r) => r.slug === "mystery")));
    assert.ok(searchOccasions(CATALOG, "").some((r) => r.slug === "mystery"), "See all lists every row");
    assert.deepEqual(searchOccasions(CATALOG, "something").map((r) => r.slug), ["mystery"]);
    assert.deepEqual(searchOccasions(CATALOG, "WEDD").map((r) => r.slug), ["wedding"]);
  });
});

describe("P5 — the page starts a plan through PlanEntry inline", () => {
  it("the page starts a plan through PlanEntry inline and the provider's one start (E3, sanctioned)", () => {
    const src = read("client/src/pages/experiences.tsx");
    assert.match(src, /<PlanEntryPanel\s+active\s+container="page"/);
    assert.match(src, /planning\.start\(start, \{ door: "experiences", newPlan: true \}\)/);
    assert.doesNotMatch(src, /mintStartPagePlan|startPageGuestRecord|button-experiences-continue/, "E1's Continue and its mint are gone");
    assert.doesNotMatch(src, /\.open\(|focusStep/, "the page opens no pop-up over itself");
    assert.doesNotMatch(src, /IntakePanel|plan"\) === "1"/, "the intake and ?plan=1 are gone");
    assert.doesNotMatch(src, /curated experience templates/, "the template count copy is gone");
  });
});

describe("P6 — a query-string city pre-picks only an exact match", () => {
  it("exact name or 'City, Country', trimmed and case-insensitive", () => {
    assert.equal(exactOperatingMarket("Kyoto")?.marketKey, "kyoto");
    assert.equal(exactOperatingMarket("  kyoto, japan ")?.marketKey, "kyoto");
    assert.equal(exactOperatingMarket("Bogotá")?.marketKey, "bogota");
  });
  it("never the nearest: no folding, no substring, no other city", () => {
    for (const v of ["Bogota", "Kyo", "Kyoto Prefecture", "Osaka", "Paris", "", null, undefined]) {
      assert.equal(exactOperatingMarket(v as string), null, String(v));
    }
  });
  it("?destination= first, then ?city=", () => {
    assert.equal(preselectedMarket(new URLSearchParams("city=Goa"))?.marketKey, "goa");
    assert.equal(preselectedMarket(new URLSearchParams("destination=Porto&city=Goa"))?.marketKey, "porto");
    assert.equal(preselectedMarket(new URLSearchParams("destination=Lisbon&city=Goa"))?.marketKey, "goa");
    assert.equal(preselectedMarket(new URLSearchParams("destinations=Kyoto,Goa&multiCity=true")), null);
  });
});

describe("P7/P8 — the map and the cards", () => {
  it("every pin lands within 0.5 points of the board's own position", () => {
    const board: Record<string, [number, number]> = {
      kyoto: [91.1, 46.9], edinburgh: [40.0, 21.3], porto: [38.0, 40.3], bogota: [13.9, 74.5],
      cartagena: [13.4, 69.6], mumbai: [68.0, 62.1], goa: [68.3, 65.2], jaipur: [69.0, 54.9],
    };
    assert.equal(OPERATING_MARKETS.length, 8);
    for (const m of OPERATING_MARKETS) {
      const { xPct, yPct } = projectToWorldMap(m.lat, m.lng);
      const [bx, by] = board[m.marketKey];
      assert.ok(Math.abs(xPct - bx) <= 0.5 && Math.abs(yPct - by) <= 0.5, `${m.marketKey}: ${xPct},${yPct} vs ${bx},${by}`);
    }
  });

  it("only Kyoto and Bogotá have photos, each credited and present in ATTRIBUTION.json", () => {
    const withPhoto = OPERATING_MARKETS.filter((m) => cityPhotoFor(m.marketKey)).map((m) => m.marketKey);
    assert.deepEqual(withPhoto.sort(), ["bogota", "kyoto"]);
    const attribution = JSON.parse(read("client/public/images/landing/ATTRIBUTION.json")) as Array<{ file: string; creator: string }>;
    for (const k of withPhoto) {
      const p = cityPhotoFor(k)!;
      const entry = attribution.find((a) => p.src.endsWith(a.file));
      assert.ok(entry, `${k} photo is in ATTRIBUTION.json`);
      assert.ok(p.credit.includes(entry!.creator), `${k} credit names ${entry!.creator}`);
    }
  });

  it("the page renders the map credit and the map file is in client/public", () => {
    assert.match(read("client/src/pages/experiences.tsx"), /WORLD_MAP\.credit/);
    assert.ok(statSync(path.join(ROOT, "client/public/images/world-map.svg")).size > 0);
  });
});
