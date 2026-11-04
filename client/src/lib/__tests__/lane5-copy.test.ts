/**
 * Lane 5 — copy and guards (ledger `2026-11-05-lane5-copy`; briefs K-7, K-8, K-9, N-7, A-15, A-30; A-14 audited).
 *
 *   Q1  K-7: the never-say guard reads a template piece that carries a space (`crowd ${band}`), and still skips a
 *       token-like piece (`slip-day-busy-${id}`); the three crowd clauses are gone.
 *   Q2  K-8: "perfect" is on the site never-say list; the briefed perfect/best sites are gone; the /experts hero reads the
 *       approved line.
 *   Q3  K-9: /architecture and /landing-mockups are development-only, /ai-assistant is sign-in only, and the mock's
 *       "Plan with AI" line is gone.
 *   Q4  N-7: the three ledger/workflow guards read text with line endings normalised and split on CRLF or LF.
 *   Q5  A-15: forgot-password sends a reset link (never a verification letter) and the email says the approved copy.
 *
 * Run: npx tsx --test client/src/lib/__tests__/lane5-copy.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scanCode } from "../../../../scripts/check-never-say-copy";
import { SITE_NEVER_SAY, siteNeverSayHits } from "@shared/banned-copy";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Lane 5 copy and guards", () => {
  it("Q1 the guard reads composed template pieces; the crowd clauses are gone", () => {
    assert.deepEqual(scanCode("client/src/x.tsx", "const a = `crowd ${band}`;").map((h) => h.words), ["crowd"]);
    assert.deepEqual(scanCode("client/src/x.tsx", "const a = `${level} crowd`;").map((h) => h.words), ["crowd"]);
    assert.deepEqual(scanCode("client/src/x.tsx", "const id = `slip-day-busy-${n}`;"), []);
    assert.doesNotMatch(read("client/src/components/landing/cities-rail.tsx"), /`crowd \$\{/);
    assert.doesNotMatch(read("client/src/components/landing/landing-hero.tsx"), /`crowd \$\{/);
    const card = read("client/src/components/travelpulse/CityCard.tsx");
    assert.doesNotMatch(card, /\} crowd`/);
    assert.doesNotMatch(card, /crowdClasses/);
  });

  it("Q2 perfect is never-say; the briefed sites are gone", () => {
    assert.ok(SITE_NEVER_SAY.some((e) => e.words === "perfect"));
    assert.deepEqual(siteNeverSayHits("Find Your Perfect Local Expert"), ["perfect"]);
    const experts = read("client/src/pages/experts.tsx");
    assert.match(experts, /`Find a local expert in \$\{launchMarket\.cityName\}`/);
    assert.doesNotMatch(experts, /Perfect/);
    const matched = read("client/src/components/ai-matched-experts-section.tsx");
    assert.doesNotMatch(matched, /Perfect|best expert/);
    assert.doesNotMatch(read("client/src/pages/pricing.tsx"), /BEST FOR ONE TRIP/);
    assert.doesNotMatch(read("client/src/components/destination-calendar.tsx"), /best times/);
    assert.doesNotMatch(read("client/src/pages/ready-made-detail.tsx"), /"Best season"/);
    assert.doesNotMatch(read("client/src/pages/ai-assistant.tsx"), /Best destinations/);
  });

  it("Q3 the AI pages stay off public routes", () => {
    const app = read("client/src/App.tsx");
    assert.match(app, /<Route path="\/architecture">\s*\{process\.env\.NODE_ENV === "development" \? <ArchitectureDiagram \/> : <Redirect to="\/" \/>\}/);
    assert.match(app, /<Route path="\/landing-mockups">\s*\{process\.env\.NODE_ENV === "development" \? <LandingMockups \/> : <Redirect to="\/" \/>\}/);
    assert.match(app, /<Route path="\/ai-assistant">\s*\{\(\) => <DashboardLayout><ProtectedRoute component=\{AIAssistant\} \/><\/DashboardLayout>\}/);
    // The ruled line (:293); the rest of this development-only page never reaches production.
    assert.doesNotMatch(read("client/src/pages/landing-mockups.tsx"), /<span className="font-medium">Plan with AI<\/span>/);
  });

  it("Q4 the guards read CRLF checkouts as LF", () => {
    for (const f of ["scripts/check-decision-guards.cjs", "scripts/check-ledger-union-merge.cjs", "scripts/check-test-files-wired.cjs", "scripts/ledger-files.cjs"]) {
      const src = read(f);
      assert.match(src, /const readText = \(p\) => fs\.readFileSync\(p, "utf8"\)\.replace\(\/\\r\\n\?\/g, "\\n"\);/, f);
      assert.doesNotMatch(src, /\.split\("\\n"\)/, `${f} splits on LF only`);
      assert.doesNotMatch(src, /fs\.readFileSync\([^)]*"utf8"\)(?!\.replace)/, `${f} reads text without normalising`);
    }
  });

  it("Q5 forgot-password sends a reset link with the approved copy", () => {
    const auth = read("server/replit_integrations/auth/emailAuth.ts");
    const forgot = auth.slice(auth.indexOf('app.post("/api/auth/forgot-password"'), auth.indexOf("const resetPasswordSchema"));
    assert.doesNotMatch(forgot, /issueEmailVerification/, "never a verification letter");
    assert.match(forgot, /issuePasswordResetToken\(user\.id\)/);
    assert.doesNotMatch(forgot, /console\.(error|log|warn)\([^)]*(raw|resetUrl|token)/, "a token is never logged");
    const email = read("server/services/email.service.ts");
    assert.match(email, /PASSWORD_RESET_EMAIL_SUBJECT = "Reset your Traveloure password"/);
    assert.match(email, /PASSWORD_RESET_EMAIL_BODY = "Use this link to set a new password\. It expires in 1 hour\."/);
    assert.match(read("server/services/password-reset-tokens.service.ts"), /RESET_TOKEN_TTL_MIN = 60;/, "1 hour is the token's own lifetime");
  });
});
