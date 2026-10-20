/**
 * LW-1f-b (ledger `2026-10-16-lw1f-b-beta-cities`, issue #1486): /privacy §14 covers every waitlist city. DB-free;
 * reads the page source, whose §14 is plain text in JSX.
 *
 *   P1  §14's heading is "Our City Waitlists".
 *   P2  §14 has no Kyoto-only waitlist wording left: it names the city a person signed up for, demand in each city,
 *       and an email only for a city whose box was ticked.
 *   P3  §14.3 states the ruled retention — the later of 12 months after traveler sign-ups open and 12 months after
 *       signing up, unless an account is created — and §14.4's 30 days and §14.5's US location stay word for word,
 *       with the Japan transfer sentence.
 *
 * Run: npx tsx --test client/src/lib/__tests__/privacy-city-waitlists.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(path.join(process.cwd(), "client/src/pages/privacy.tsx"), "utf8");
const start = SRC.indexOf(">14. ");
const end = SRC.indexOf(">15. ");
const S14 = SRC.slice(start, end).replace(/\s+/g, " ");

describe("/privacy §14 — every waitlist city", () => {
  it("P1 — the heading is Our City Waitlists", () => {
    assert.ok(start > 0 && end > start, "§14 and §15 are found");
    assert.ok(S14.startsWith(">14. Our City Waitlists<"));
  });

  it("P2 — no Kyoto-only waitlist wording is left", () => {
    for (const old of ["The Kyoto Waitlist", "Kyoto waitlist", "opens for Kyoto", "demand for Kyoto", "not yet open in Kyoto"]) {
      assert.ok(!S14.includes(old), `§14 still says "${old}"`);
    }
    assert.ok(S14.includes("Traveloure is starting with Kyoto. You can join the waitlist for Kyoto, or another city you tell us about, on our Kyoto page, as a traveler or as a local guide or provider."));
    assert.ok(S14.includes("another city you name"));
    assert.equal((S14.match(/The sign-up is for Kyoto/g) ?? []).length, 2, "both forms say the sign-up is for Kyoto");
    assert.ok(S14.includes('the "Join the Kyoto list" line'));
    assert.ok(S14.includes("To count demand in each city"));
    assert.ok(S14.includes("We email you about a city only if you ticked that city's box."));
  });

  it("P3 — retention, removal and location as ruled", () => {
    assert.ok(S14.includes(
      "We keep a waitlist sign-up until 12 months after Traveloure opens traveler sign-ups, or 12 months after you sign up, whichever is later, unless you create an account.",
    ));
    assert.ok(S14.includes("We complete removal requests within 30 days."));
    assert.ok(S14.includes(
      "Our site is hosted by Replit on Google Cloud, and waitlist sign-ups are stored in a database run by Neon (PostgreSQL). Both are in the United States.",
    ));
    assert.ok(S14.includes("If you sign up from Japan, your details are transferred to and stored in the United States."));
    assert.ok(!/Standard Contractual Clauses|Data Privacy Framework/.test(S14), "no transfer-mechanism claim until Leon confirms the DPAs");
  });
});
