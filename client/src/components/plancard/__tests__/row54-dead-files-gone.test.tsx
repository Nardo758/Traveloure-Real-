/**
 * Row 54 part 2 (ledger `2026-10-26-row54-dead-files-and-fences`): the dead pre-Trip-Card itinerary surface is
 * gone, its one live type lives in plancard-types, and the two scope fences are retired.
 *
 *   RF1 none of the nine dead files exists
 *   RF2 the logistics barrel no longer re-exports itinerary-optimization; its live exports stay
 *   RF3 InlineTransportLegData and TransportAlternative are exported from plancard-types
 *   RF4 nothing under client/src imports a deleted module
 *   RF5 App.tsx has no MyItineraryPage and keeps both redirects
 *   RF6 the TN9, TN16 and TS16 fences are gone
 *   RF7 the three importer-clean orphans are gone and unimported; lib/transport-cancel.ts is gone too (row 254)
 *   RF8 the page-hex baseline has no itinerary.tsx key
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row54-dead-files-gone.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const abs = (rel: string) => path.join(ROOT, rel);
const read = (rel: string) => fs.readFileSync(abs(rel), "utf8");

const NINE = [
  "client/src/pages/my-itinerary.tsx",
  "client/src/pages/itinerary.tsx",
  "client/src/components/itinerary/DayTransportPanel.tsx",
  "client/src/components/itinerary/InlineTransportSelector.tsx",
  "client/src/components/itinerary/TransportHub.tsx",
  "client/src/components/itinerary/TransportBookingCard.tsx",
  "client/src/components/itinerary/NavigateNextButton.tsx",
  "client/src/components/transportation-analysis.tsx",
  "client/src/components/logistics/itinerary-optimization.tsx",
];
const ORPHANS = [
  "client/src/components/itinerary/BookingFeeBreakdown.tsx",
  "client/src/components/itinerary/MultiDayPassCard.tsx",
  "client/src/components/itinerary/PartnerizeBookingCTA.tsx",
];

/** Every non-test source file under client/src. */
function sources(): Array<{ rel: string; text: string }> {
  const out: Array<{ rel: string; text: string }> = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(abs(dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== "__tests__" && e.name !== "node_modules") walk(rel);
      } else if (/\.(tsx?|jsx?)$/.test(e.name)) {
        out.push({ rel, text: read(rel) });
      }
    }
  };
  walk("client/src");
  return out;
}
const importsOf = (text: string) =>
  Array.from(text.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)).map((m) => m[1]);

describe("row 54 part 2: the dead itinerary surface is gone", () => {
  it("RF1 none of the nine dead files exists", () => {
    for (const f of NINE) assert.equal(fs.existsSync(abs(f)), false, f);
  });

  it("RF2 the logistics barrel no longer re-exports itinerary-optimization; its live exports stay", () => {
    const barrel = read("client/src/components/logistics/index.ts");
    assert.doesNotMatch(barrel, /itinerary-optimization|ItineraryOptimization|\bItineraryItem\b|\bDayItinerary\b/);
    for (const name of ["TripLogisticsDashboard", "TemporalAnchorManager", "ScheduleValidator", "EnergyBudgetDisplay", "AnchorSuggestionsPanel", "WeddingAnchorPresets"]) {
      assert.match(barrel, new RegExp(`export \\{ ${name} \\}`), name);
    }
  });

  it("RF3 InlineTransportLegData and TransportAlternative are exported from plancard-types", () => {
    const types = read("client/src/components/plancard/plancard-types.tsx");
    assert.match(types, /export interface InlineTransportLegData \{/);
    assert.match(types, /export interface TransportAlternative \{/);
    assert.match(types, /export interface PlanCardLegData extends InlineTransportLegData \{/);
    assert.doesNotMatch(types, /InlineTransportSelector/);
  });

  it("RF4 nothing under client/src imports a deleted module", () => {
    const dead = [
      /itinerary\/InlineTransportSelector$/, /itinerary\/TransportHub$/, /itinerary\/DayTransportPanel$/, /itinerary\/TransportBookingCard$/,
      /itinerary\/NavigateNextButton$/, /pages\/my-itinerary$/, /pages\/itinerary$/, /components\/transportation-analysis$/,
      /logistics\/itinerary-optimization$/, /^\.\/(InlineTransportSelector|TransportHub|DayTransportPanel|TransportBookingCard|NavigateNextButton|itinerary-optimization)$/,
    ];
    for (const { rel, text } of sources()) {
      for (const spec of importsOf(text)) assert.ok(!dead.some((d) => d.test(spec)), `${rel} imports ${spec}`);
    }
  });

  it("RF5 App.tsx has no MyItineraryPage and keeps both redirects", () => {
    const app = read("client/src/App.tsx");
    assert.doesNotMatch(app, /\bMyItineraryPage\b/);
    for (const p of ["/itinerary/:id", "/my-itinerary/:id"]) {
      assert.match(app, new RegExp(`<Route path="${p.replace(/\//g, "\\/")}">[\\s\\S]*?<Redirect to=\\{\`/trip/\\$\\{`), p);
    }
  });

  it("RF6 the TN9, TN16 and TS16 fences are gone", () => {
    for (const f of [
      "client/src/components/plancard/__tests__/b8-live-site-unchecked-minutes.test.tsx",
      "client/src/components/plancard/__tests__/b8-transport-section-checked-minutes.test.tsx",
    ]) {
      const src = read(f);
      assert.doesNotMatch(src, /execFileSync|origin\/main\.\.\.HEAD|allowedTests|TN9 scope fence|TN16 the dead pages|TS16 scope fence/, f);
    }
  });

  it("RF7 the three importer-clean orphans are gone and unimported; lib/transport-cancel.ts is gone too (row 254)", () => {
    for (const f of ORPHANS) assert.equal(fs.existsSync(abs(f)), false, f);
    // Row 254 (sanctioned RF7 edit, Architect Oct 29, 2026): the module and its own test are deleted,
    // and nothing imports it; the dialog pins moved to lib/__tests__/cancel-booking-dialog.test.ts.
    for (const f of ["client/src/lib/transport-cancel.ts", "client/src/lib/__tests__/transport-cancel.test.ts"]) {
      assert.equal(fs.existsSync(abs(f)), false, f);
    }
    const names = /itinerary\/(BookingFeeBreakdown|MultiDayPassCard|PartnerizeBookingCTA)$|^\.\/(BookingFeeBreakdown|MultiDayPassCard|PartnerizeBookingCTA)$/;
    for (const { rel, text } of sources()) {
      for (const spec of importsOf(text)) {
        assert.ok(!names.test(spec), `${rel} imports ${spec}`);
        assert.ok(!/(^|\/)transport-cancel$/.test(spec), `${rel} imports ${spec}`);
      }
    }
  });

  it("RF8 the page-hex baseline has no itinerary.tsx key", () => {
    const baseline = JSON.parse(read("scripts/page-hex-baseline.json"));
    assert.equal(Object.prototype.hasOwnProperty.call(baseline, "itinerary.tsx"), false);
    assert.equal(baseline["itinerary-view.tsx"], 3);
  });
});
