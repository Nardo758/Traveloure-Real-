/**
 * TG-1 (ledger `2026-11-03-tg1-ga4-tag`): the GA4 tag.
 *
 *   T1 env unset or malformed → no script, no dataLayer, no window.gtag
 *   T2 env set → consent default (regioned, all denied) → consent default (analytics granted, ads denied) → js → config
 *      (send_page_view:false, anonymize_ip:true, page_location sanitised); the script host is www.googletagmanager.com
 *      with the id URL-encoded
 *   T3 sanitizePath: tokens, ids, query and hash
 *   T4 routeTitle is a static map ("Other" otherwise); isTravelerSurface is false for the console prefixes and /api
 *   T5 trackPageView: nothing from /admin; /plans/<uuid> sends page_path "/plans/:id", page_title "Plan" and
 *      page_location origin + "/plans/:id" (TG-1b)
 *   T6 trackEvent: unknown names send nothing; extra params and free-text values are dropped
 *   T7 lib/analytics.ts carries no GA call; no file in client/src calls gtag/dataLayer except lib/ga4.ts
 *   T8 lib/ga4.ts never names user_id or set_user_properties
 *   T9 (TG-1b) a page view from /invite/abc123TOKEN?ref=x#y sends page_location ending /invite/:token, and the raw
 *      token, query and hash appear nowhere in the dataLayer
 *
 * A fake window/document stands in for the browser (no jsdom).
 *
 * Run: npx tsx --test client/src/lib/__tests__/ga4.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  GA4_DENIED_REGIONS,
  initGa4,
  isTravelerSurface,
  resetGa4ForTests,
  routeTitle,
  sanitizePath,
  trackEvent,
  trackPageView,
} from "@/lib/ga4";

const ID = "G-9MSEL3ZVKQ";
const UUID = "3f2a1c9e-8b7d-4e6f-a1b2-c3d4e5f60718";
const ORIGIN = "https://www.traveloure.com";

function fakeBrowser(pathname = "/", search = "", hash = "") {
  const appended: any[] = [];
  const win: { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void; location?: Record<string, string> } = {
    location: { origin: ORIGIN, pathname, search, hash, href: `${ORIGIN}${pathname}${search}${hash}` },
  };
  const doc = { createElement: (tag: string) => ({ tag }), head: { appendChild: (el: any) => appended.push(el) } };
  return { win, doc, appended };
}
const calls = (win: { dataLayer?: unknown[] }) => (win.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
const events = (win: { dataLayer?: unknown[] }) => calls(win).filter((c) => c[0] === "event");

beforeEach(() => resetGa4ForTests());

describe("T1 no id, no tag", () => {
  it("unset, empty or malformed ids do nothing", () => {
    for (const id of ["", "UA-12345-1", "G-abc", "G-TOOLONGTOOLONG1", "9MSEL3ZVKQ"]) {
      const b = fakeBrowser();
      assert.equal(initGa4({ id, win: b.win, doc: b.doc as any }), false, id);
      assert.equal(b.win.dataLayer, undefined);
      assert.equal(b.win.gtag, undefined);
      assert.equal(b.appended.length, 0);
    }
  });
});

describe("T2 the load order", () => {
  it("consent defaults, js, then config; the script comes from googletagmanager with the id encoded", () => {
    const b = fakeBrowser();
    assert.equal(initGa4({ id: ID, win: b.win, doc: b.doc as any }), true);
    const c = calls(b.win);
    assert.deepEqual(c.map((x) => [x[0], x[1] instanceof Date ? "date" : x[1]]), [
      ["consent", "default"],
      ["consent", "default"],
      ["js", "date"],
      ["config", ID],
    ]);
    assert.deepEqual(c[0][2], {
      ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied",
      region: [...GA4_DENIED_REGIONS], wait_for_update: 500,
    });
    assert.equal((c[0][2] as any).region.length, 32);
    for (const r of ["GB", "CH", "IS", "LI", "NO", "DE", "FR"]) assert.ok((c[0][2] as any).region.includes(r), r);
    assert.deepEqual(c[1][2], { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" });
    assert.deepEqual(c[3][2], {
      send_page_view: false, anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false,
      page_location: `${ORIGIN}/`,
    });
    assert.equal(b.appended.length, 1);
    const src = new URL(b.appended[0].src);
    assert.equal(src.host, "www.googletagmanager.com");
    assert.equal(src.pathname, "/gtag/js");
    assert.equal(src.searchParams.get("id"), ID);
    assert.equal(b.appended[0].async, true);
  });
});

describe("T3 sanitizePath", () => {
  it("replaces tokens and ids and drops the query and hash", () => {
    assert.equal(sanitizePath("/invite/abc123TOKENxyz789"), "/invite/:token");
    assert.equal(sanitizePath("/trips/shared/Zx9_ab12CD34ef56GH78"), "/trips/shared/:token");
    assert.equal(sanitizePath("/saved/shared/short1"), "/saved/shared/:token");
    assert.equal(sanitizePath(`/plans/${UUID}?x=1#y`), "/plans/:id");
    assert.equal(sanitizePath(`/plans/${UUID}/compare/0123456789abcdef0123`), "/plans/:id/compare/:id");
    assert.equal(sanitizePath("/kyoto?ref=ig"), "/kyoto");
    assert.equal(sanitizePath("/"), "/");
    assert.equal(sanitizePath("/experiences/kyoto-golden-week-weekend"), "/experiences/kyoto-golden-week-weekend", "a readable slug survives");
  });
});

describe("T4 titles and surfaces", () => {
  it("static titles only, Other otherwise; console prefixes and /api are not traveler surfaces", () => {
    (globalThis as any).document = { title: "Secret plan name — Traveloure" };
    try {
      assert.equal(routeTitle("/"), "Landing");
      assert.equal(routeTitle("/kyoto"), "Waitlist");
      assert.equal(routeTitle("/discover/location/Kyoto"), "Discover");
      assert.equal(routeTitle(`/plans/${UUID}`), "Plan");
      assert.equal(routeTitle(`/plans/${UUID}/compare/${UUID}`), "Versions");
      assert.equal(routeTitle(`/trip/${UUID}`), "Trip Card");
      assert.equal(routeTitle("/invite/abc123TOKENxyz789"), "Invite");
      assert.equal(routeTitle("/trips/shared/abc123TOKENxyz789"), "Shared trip");
      assert.equal(routeTitle("/some/unknown/page"), "Other");
      for (const p of ["/", "/kyoto", "/nope"]) assert.ok(!routeTitle(p).includes("Secret"));
    } finally {
      delete (globalThis as any).document;
    }
    for (const p of ["/admin", "/admin/fee-bands", "/expert/inbox", "/provider/services", "/backoffice/x", "/internal/jobs", "/api/health"]) {
      assert.equal(isTravelerSurface(p), false, p);
    }
    for (const p of ["/", "/kyoto", `/plans/${UUID}`, "/experts", "/providers"]) assert.equal(isTravelerSurface(p), true, p);
  });
});

describe("T5 page views", () => {
  it("nothing from a console surface; a plan view is sanitised with a static title and a sanitised page_location", () => {
    const b = fakeBrowser();
    initGa4({ id: ID, win: b.win, doc: b.doc as any });
    trackPageView("/admin/anything");
    assert.equal(events(b.win).length, 0);
    trackPageView(`/plans/${UUID}`);
    trackPageView(`/plans/${UUID}`);
    const ev = events(b.win);
    assert.equal(ev.length, 1, "consecutive identical paths are sent once");
    assert.deepEqual(ev[0], ["event", "page_view", { page_path: "/plans/:id", page_title: "Plan", page_location: `${ORIGIN}/plans/:id` }]);
  });
  it("before the tag loads, nothing is sent", () => {
    trackPageView("/kyoto");
    trackEvent("quick_draft");
  });
});

describe("T6 events", () => {
  it("only the allowlist, only declared enum params", () => {
    const b = fakeBrowser(`/plans/${UUID}`, "?x=1");
    initGa4({ id: ID, win: b.win, doc: b.doc as any });
    trackEvent("purchase", { value: 10 });
    assert.equal(events(b.win).length, 0);
    trackEvent("plan_started", { door: "hero", group: "moments", city: "Kyoto" });
    trackEvent("plan_started", { door: "hero", group: "Kyoto weekend" });
    trackEvent("waitlist_signup", { market: "kyoto" });
    trackEvent("waitlist_signup", { market: "lisbon" });
    trackEvent("quick_draft", { destination: "Kyoto" });
    const loc = `${ORIGIN}/plans/:id`;
    assert.deepEqual(events(b.win), [
      ["event", "plan_started", { door: "hero", group: "moments", page_location: loc }],
      ["event", "plan_started", { door: "hero", page_location: loc }],
      ["event", "waitlist_signup", { market: "kyoto", page_location: loc }],
      ["event", "waitlist_signup", { page_location: loc }],
      ["event", "quick_draft", { page_location: loc }],
    ]);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("T7 the GA module is the only GA caller", () => {
  it("lib/analytics.ts carries no GA call; no other client file calls gtag or dataLayer", () => {
    const analytics = fs.readFileSync("client/src/lib/analytics.ts", "utf8");
    for (const s of ["gtag", "dataLayer", "googletagmanager", "ga4"]) assert.ok(!analytics.includes(s), s);
    const callers = walk("client/src").filter((f) => /\bgtag\s*\(|dataLayer/.test(fs.readFileSync(f, "utf8")));
    assert.deepEqual(callers.map((f) => f.replace(/\\/g, "/")), ["client/src/lib/ga4.ts"]);
  });
});

describe("T8 no identity or location fields", () => {
  it("lib/ga4.ts never names user_id or set_user_properties", () => {
    const src = fs.readFileSync("client/src/lib/ga4.ts", "utf8");
    for (const s of ["user_id", "set_user_properties"]) assert.ok(!src.includes(s), s);
  });
});

describe("T9 no raw URL reaches the dataLayer (TG-1b)", () => {
  it("a page view from an invite link sends page_location ending /invite/:token and never the token", () => {
    const TOKEN = "abc123TOKEN";
    const b = fakeBrowser(`/invite/${TOKEN}`, "?ref=mail", "#rsvp");
    initGa4({ id: ID, win: b.win, doc: b.doc as any });
    trackPageView(`/invite/${TOKEN}`);
    trackEvent("quick_draft");
    const config = calls(b.win).find((c) => c[0] === "config")!;
    assert.equal((config[2] as any).page_location, `${ORIGIN}/invite/:token`);
    const pv = events(b.win).find((e) => e[1] === "page_view")!;
    assert.ok(String((pv[2] as any).page_location).endsWith("/invite/:token"));
    assert.equal((pv[2] as any).page_location, `${ORIGIN}/invite/:token`);
    for (const e of events(b.win)) assert.equal((e[2] as any).page_location, `${ORIGIN}/invite/:token`, String(e[1]));
    const dump = JSON.stringify(calls(b.win).map((c) => c.map((x) => (x instanceof Date ? "date" : x))));
    for (const raw of [TOKEN, "ref=mail", "#rsvp", "?"]) assert.ok(!dump.includes(raw), raw);
  });
});
