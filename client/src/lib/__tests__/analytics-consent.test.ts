/**
 * CB-1 (ledger `2026-11-03-cb1-analytics-consent-banner`): the analytics consent banner.
 *
 *   T1 shouldShowConsentBanner: Europe/* and the listed Atlantic zones with the tag loaded and no choice; never
 *      for other or unknown zones, a stored choice, or an unloaded tag
 *   T2 readStoredConsent / storeConsent round-trip; a throwing storage reads null / stores false, without throwing
 *   T5 the banner renders on traveler surfaces for a European zone with no choice, and not on /admin or for
 *      America/Chicago; Allow stores "granted" and No thanks stores "denied" (and each tells the tag)
 *   T6 every banner string is clear of the site never-say list and of "AI"
 *   T7 privacy.tsx names Google Analytics and no longer says it does not use third-party analytics
 *   T8 main.tsx replays the stored choice right after initGa4()
 *
 * T3/T4 (grant/deny pushes and the unchanged init order) live in ga4.test.ts.
 *
 * Run: npx tsx --test client/src/lib/__tests__/analytics-consent.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { siteNeverSayHits } from "@shared/banned-copy";
import {
  ANALYTICS_CONSENT_KEY,
  readStoredConsent,
  shouldShowConsentBanner,
  storeConsent,
} from "@/lib/analytics-consent";
import { ANALYTICS_CONSENT_COPY } from "@/lib/analytics-consent-copy";
import { initGa4, resetGa4ForTests } from "@/lib/ga4";
import {
  AnalyticsConsentBannerView,
  applyConsentChoice,
  consentBannerVisible,
} from "@/components/AnalyticsConsentBanner";

(globalThis as any).React = React;

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}
const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

beforeEach(() => resetGa4ForTests());

describe("T1 shouldShowConsentBanner", () => {
  it("shows for European zones with the tag loaded and no choice, and nowhere else", () => {
    for (const timeZone of ["Europe/Berlin", "Europe/London", "Atlantic/Reykjavik", "Atlantic/Canary"]) {
      assert.equal(shouldShowConsentBanner({ gaLoaded: true, stored: null, timeZone }), true, timeZone);
    }
    for (const timeZone of ["America/New_York", "Asia/Tokyo", undefined, null, ""]) {
      assert.equal(shouldShowConsentBanner({ gaLoaded: true, stored: null, timeZone }), false, String(timeZone));
    }
    assert.equal(shouldShowConsentBanner({ gaLoaded: true, stored: "granted", timeZone: "Europe/Berlin" }), false);
    assert.equal(shouldShowConsentBanner({ gaLoaded: true, stored: "denied", timeZone: "Europe/Berlin" }), false);
    assert.equal(shouldShowConsentBanner({ gaLoaded: false, stored: null, timeZone: "Europe/Berlin" }), false);
  });
});

describe("T2 stored choice", () => {
  it("round-trips, and a throwing storage reads null and stores false", () => {
    const s = memoryStorage();
    assert.equal(readStoredConsent(s), null);
    assert.equal(storeConsent(s, "granted"), true);
    assert.equal(s.getItem(ANALYTICS_CONSENT_KEY), "granted");
    assert.equal(readStoredConsent(s), "granted");
    assert.equal(storeConsent(s, "denied"), true);
    assert.equal(readStoredConsent(s), "denied");
    s.setItem(ANALYTICS_CONSENT_KEY, "maybe");
    assert.equal(readStoredConsent(s), null, "an unknown value is no choice");
    assert.equal(readStoredConsent(throwing), null);
    assert.equal(storeConsent(throwing, "granted"), false);
    assert.equal(readStoredConsent(undefined), null);
    assert.equal(storeConsent(undefined, "denied"), false);
  });
});

function fakeBrowser() {
  const win: { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void; location?: Record<string, string> } = {
    location: { origin: "https://www.traveloure.com", pathname: "/" },
  };
  const doc = { createElement: () => ({}), head: { appendChild: () => undefined } };
  return { win, doc };
}
const consentUpdates = (win: { dataLayer?: unknown[] }) =>
  (win.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>)).filter((c) => c[0] === "consent" && c[1] === "update");

describe("T5 the banner", () => {
  it("renders on traveler surfaces for Europe/Paris with no choice; not on /admin or for America/Chicago", () => {
    for (const location of ["/", "/plans/x"]) {
      assert.equal(consentBannerVisible({ location, gaLoaded: true, stored: null, timeZone: "Europe/Paris" }), true, location);
    }
    assert.equal(consentBannerVisible({ location: "/admin", gaLoaded: true, stored: null, timeZone: "Europe/Paris" }), false);
    assert.equal(consentBannerVisible({ location: "/", gaLoaded: true, stored: null, timeZone: "America/Chicago" }), false);
    assert.equal(consentBannerVisible({ location: "/", gaLoaded: false, stored: null, timeZone: "Europe/Paris" }), false);

    const html = renderToString(
      React.createElement(Router, { ssrPath: "/" } as any, React.createElement(AnalyticsConsentBannerView, { onAllow: () => {}, onDecline: () => {} })),
    );
    for (const id of ["analytics-consent-banner", "analytics-consent-allow", "analytics-consent-decline", "analytics-consent-privacy"]) {
      assert.match(html, new RegExp(`data-testid="${id}"`), id);
    }
    assert.match(html, /role="dialog"/);
    assert.match(html, /href="\/privacy"/);
  });

  it("Allow stores granted and No thanks stores denied, each telling the tag", () => {
    const b = fakeBrowser();
    initGa4({ id: "G-9MSEL3ZVKQ", win: b.win, doc: b.doc as any });
    const s = memoryStorage();
    assert.equal(applyConsentChoice("granted", s), true);
    assert.equal(readStoredConsent(s), "granted");
    assert.equal(consentBannerVisible({ location: "/", gaLoaded: true, stored: readStoredConsent(s), timeZone: "Europe/Paris" }), false, "hidden after Allow");
    assert.equal(applyConsentChoice("denied", s), true);
    assert.equal(readStoredConsent(s), "denied");
    assert.deepEqual(consentUpdates(b.win), [
      ["consent", "update", { analytics_storage: "granted" }],
      ["consent", "update", { analytics_storage: "denied" }],
    ]);
    assert.equal(applyConsentChoice("denied", throwing), false, "a blocked store still applies for the session");
  });
});

describe("T6 banner copy", () => {
  it("every string is clear of the never-say list and of AI", () => {
    for (const [k, v] of Object.entries(ANALYTICS_CONSENT_COPY)) {
      assert.deepEqual(siteNeverSayHits(v), [], k);
      assert.doesNotMatch(v, /\bAI\b/, k);
    }
  });
});

describe("T7 privacy policy §11", () => {
  it("names Google Analytics and the false sentence cannot return", () => {
    const src = fs.readFileSync("client/src/pages/privacy.tsx", "utf8");
    assert.ok(src.includes("Google Analytics"));
    assert.ok(!src.includes("do not use third-party analytics"));
  });
});

describe("T8 main.tsx replays the stored choice after initGa4()", () => {
  it("initGa4() is followed by the replay, which names both grant and deny", () => {
    const src = fs.readFileSync("client/src/main.tsx", "utf8");
    const init = src.indexOf("initGa4();");
    const replay = src.indexOf("replayStoredAnalyticsConsent();", init);
    assert.ok(init >= 0 && replay > init);
    const body = src.slice(src.indexOf("function replayStoredAnalyticsConsent"));
    assert.ok(body.includes("grantAnalyticsConsent()") && body.includes("denyAnalyticsConsent()"));
  });
});
