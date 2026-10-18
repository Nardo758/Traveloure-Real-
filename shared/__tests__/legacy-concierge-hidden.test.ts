/**
 * The old done-for-you concierge's traveler doors are behind ONE switch, off by default (ledger
 * `2026-10-18-legacy-concierge-hidden`). Pure + structural.
 *
 *   LC1 shown only on an explicit `{ enabled: true }` — undefined, an error body, false or a string read off
 *   LC2 every traveler door reads the switch: the /concierge route, the plan card's Concierge module, the bottom
 *       bar's "Get help", the handoff banner's concierge fallback, the Finalize modal's Concierge lane, the
 *       My events empty state and the AI assistant's "Get help from our team"
 *   LC3 the admin settings PATCH accepts only "true"/"false" for the switch, and the server read defaults it off
 *
 * Negative space: LC2 checks that each named file reads the switch; it does not render the components, and a NEW
 * door to /concierge added elsewhere is caught only if it is added to this list.
 *
 * Run: npx tsx --test shared/__tests__/legacy-concierge-hidden.test.ts
 */
import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { LEGACY_CONCIERGE_SETTING, legacyConciergeShown } from "../legacy-concierge";

test("LC1: shown only on an explicit { enabled: true }", () => {
  assert.equal(legacyConciergeShown({ enabled: true }), true);
  for (const v of [undefined, null, {}, { enabled: false }, { enabled: "true" }, { error: "x" }, "true", true]) {
    assert.equal(legacyConciergeShown(v), false, `${JSON.stringify(v)} reads off`);
  }
});

const DOORS = [
  "client/src/components/plancard/ConciergeModule.tsx",
  "client/src/components/plancard/BottomActionBar.tsx",
  "client/src/components/plan/HandoffBanner.tsx",
  "client/src/components/plancard/FinalizeBookingModal.tsx",
  "client/src/pages/my-events.tsx",
  "client/src/pages/ai-assistant.tsx",
];

test("LC2: every traveler door reads the switch", () => {
  for (const f of DOORS) {
    const src = fs.readFileSync(f, "utf8");
    assert.match(src, /useLegacyConciergeShown\(\)/, `${f} reads the switch`);
  }
  const app = fs.readFileSync("client/src/App.tsx", "utf8");
  assert.match(
    app,
    /<Route path="\/concierge">\s*<LegacyConciergeRoute>\s*<ConciergePage \/>\s*<\/LegacyConciergeRoute>/,
    "/concierge renders only through the gate",
  );
  const gate = fs.readFileSync("client/src/components/concierge/LegacyConciergeRoute.tsx", "utf8");
  assert.match(gate, /if \(!shown\) return <Redirect to="\/" \/>/);
  const finalize = fs.readFileSync("client/src/components/plancard/FinalizeBookingModal.tsx", "utf8");
  assert.match(finalize, /\.\.\.\(conciergeShown \? \[\{ id: "concierge"/, "the Concierge lane is listed only when shown");
});

test("LC3: the admin PATCH validates the switch as a boolean; the server read defaults it off", () => {
  const admin = fs.readFileSync("server/routes/admin.routes.ts", "utf8");
  assert.match(admin, /BOOLEAN_FLAG_KEYS = \[[^\]]*LEGACY_CONCIERGE_SETTING\]/);
  const routes = fs.readFileSync("server/routes/concierge.routes.ts", "utf8");
  assert.match(routes, /getPlatformFlag\(LEGACY_CONCIERGE_SETTING, false\)/);
  assert.equal(LEGACY_CONCIERGE_SETTING, "legacy_concierge_enabled");
});
