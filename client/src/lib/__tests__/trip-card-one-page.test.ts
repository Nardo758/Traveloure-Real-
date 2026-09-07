/**
 * THE TRIP CARD IS ONE PAGE — static pins over the shipped source.
 * Lane L9 of the Console & AI Concierge brief; ledger `2026-09-07-trip-card-one-page`.
 * CLAUDE.md Locked Decision 45 (6), Locked Decision 42 D8/D9/D16, Locked Decision 30, §13.
 *
 * WHY STATIC PINS. Every one of these fails SILENTLY and in the safe-looking direction. A tab
 * shell that comes back still renders — it just splits the page again. A countdown computed
 * without a zone still renders — it is simply wrong by whole hours, and looks authoritative. A
 * "90 minutes per item" assumption still renders — it just marks a two-hour dinner past halfway
 * through. None of it is visible to a type check or to any server test.
 *
 * What these hold:
 *   T1  `trip-details.tsx` mounts NO tab shell and carries none of the three tab testids
 *   T2  it mounts `TripCardRail` and hands the suggestions panel to the rail (one mount)
 *   T3  the pre-final branch survives verbatim — the notice and its one action to the slip (D8)
 *   T4  the temporal engine no longer assumes a duration; an item's end is its OWN `endTime`
 *   T5  the countdown is gated on the plan's zone (LD 30) and the Up-next hero passes it
 *   T6  the Purchases drawer reads the ONE purchase-status reading, not a raw status string
 *   T7  the rail's "Back to planning" reads the SHARED suppression predicate, not a second copy
 *
 * Pure: no DOM, no DB, no network. Absence pins read CODE with comments stripped, so a removal
 * explained in a comment cannot satisfy one.
 * Run: npx tsx --test client/src/lib/__tests__/trip-card-one-page.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = join(HERE, "..", "..");
const read = (rel: string) => readFileSync(join(CLIENT_SRC, rel), "utf8");
const stripComments = (src: string) =>
  src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const code = (rel: string) => stripComments(read(rel));

const PAGE = "pages/trip-details.tsx";

describe("T1 no tab shell", () => {
  it("the page imports no Tabs primitive", () => {
    const src = code(PAGE);
    assert.ok(!/from\s+"@\/components\/ui\/tabs"/.test(src), "trip-details.tsx must not import the Tabs primitive");
    for (const tag of ["<Tabs", "<TabsList", "<TabsTrigger", "<TabsContent"]) {
      assert.ok(!src.includes(tag), `trip-details.tsx still renders ${tag}`);
    }
  });
  it("none of the three tab testids survive", () => {
    const src = code(PAGE);
    for (const id of ["tab-itinerary", "tab-bookings", "tab-logistics"]) {
      assert.ok(!src.includes(id), `trip-details.tsx still carries the ${id} trigger`);
    }
  });
  it("the page-level stock photo hero is gone (a photo of nowhere — §13, L4's rule)", () => {
    assert.ok(!code(PAGE).includes("picsum.photos"), "the page must not draw a seeded stock photo hero");
  });
});

describe("T2 one page, one rail, one suggestions mount", () => {
  it("the page mounts TripCardRail", () => {
    const src = code(PAGE);
    assert.match(src, /<TripCardRail\b/, "the page must mount TripCardRail");
    assert.match(src, /from\s+"@\/components\/plancard\/TripCardRail"/);
  });
  it("the card is told the rail owns the suggestions panel", () => {
    assert.match(code(PAGE), /suggestionsHome=\{?"rail"\}?/, 'PlanCard must receive suggestionsHome="rail"');
  });
  it("PlanCard mounts the suggestions panel only when it is the home", () => {
    assert.match(
      code("components/plancard/PlanCard.tsx"),
      /suggestionsHome === "card"/,
      "PlanCard must gate its own ExpertSuggestionsPanel mount on suggestionsHome",
    );
  });
  it("the rail mounts the EXISTING panel — no second suggestions renderer", () => {
    const rail = code("components/plancard/TripCardRail.tsx");
    assert.match(rail, /<ExpertSuggestionsPanel\b/);
    assert.match(rail, /from\s+"\.\/ExpertSuggestionsPanel"/);
  });
});

describe("T3 the pre-final branch survives (LD 42 D8)", () => {
  it("the notice and its one action to the slip are still there", () => {
    const src = code(PAGE);
    assert.match(src, /data-testid="trip-not-final-notice"/);
    assert.match(src, /data-testid="button-go-to-slip"/);
    assert.match(src, /\/plans\/\$\{trip\.id\}/, "the notice must link to the slip");
    assert.match(
      src,
      /plancardData\.trip\?\.finalVersion == null/,
      "the branch must key on finalVersion — the same rule PlanCard applies",
    );
  });
});

describe("T4 no invented duration", () => {
  const temporal = code("components/plancard/plancard-temporal.ts");
  it("the 90-minute assumption is gone", () => {
    assert.ok(!/90\s*\*\s*60_?000/.test(temporal), "the temporal engine must not assume 90 minutes per item");
  });
  it("an item's end comes from its OWN endTime", () => {
    assert.match(temporal, /act\.endTime/, "computeTemporalStates must read the item's own endTime");
  });
  it("the activity DTO type carries endTime", () => {
    assert.match(code("components/plancard/plancard-types.tsx"), /endTime\?:\s*string \| null/);
  });
});

describe("T5 the countdown needs the plan's zone (LD 30)", () => {
  it("formatCountdown refuses without one", () => {
    const temporal = code("components/plancard/plancard-temporal.ts");
    assert.match(temporal, /countdownAllowed\(timezone\)/, "formatCountdown must gate on countdownAllowed");
    assert.match(temporal, /from\s+"@shared\/plan-timing"/, "the zone derivation is the ONE shared module");
  });
  it("the Up-next hero passes the plan's zone through", () => {
    const hero = code("components/plancard/UpNextHero.tsx");
    assert.match(hero, /formatCountdown\(upNextActivity, day\.date, now, timezone\)/);
  });
  it("PlanCard reads the zone off the plancard DTO and hands it down", () => {
    const card = code("components/plancard/PlanCard.tsx");
    assert.match(card, /plancardData\?\.trip\?\.timezone \?\? null/);
    assert.match(card, /timezone=\{planTimezone\}/);
  });
});

describe("T6 prepared is not booked (LD 44 (e))", () => {
  it("the Purchases drawer reads the one purchase-status reading", () => {
    const sections = code("components/plancard/CollapsedSections.tsx");
    assert.match(sections, /readPurchaseStatus\(b\.status\)/);
    assert.match(sections, /from\s+"@\/lib\/purchase-status"/);
  });
  it("an answered-but-empty booking list says so — never a fabricated row (§13)", () => {
    assert.match(code("components/plancard/CollapsedSections.tsx"), /No purchases on this plan yet\./);
  });
});

describe("T7 one suppression predicate for Back to planning", () => {
  it("the rail reads the SHARED date-arm predicate, not a hand-rolled window", () => {
    const rail = code("components/plancard/TripCardRail.tsx");
    assert.match(rail, /tripCardForcedPrimaryByDateAlone\(/);
    assert.match(rail, /from\s+"@shared\/trip-primary-surface"/);
    assert.ok(!/48\s*\*\s*60/.test(rail), "the rail must not restate the 48-hour window");
  });
  it("reopen is the SHARED mutation — one implementation, two callers", () => {
    assert.match(code("components/plancard/TripCardRail.tsx"), /from\s+"\.\/use-reopen-mutation"/);
    assert.match(code("components/plancard/SlipRail.tsx"), /from\s+"\.\/use-reopen-mutation"/);
  });
});
