/**
 * 291b (ledger `2026-10-29-waitlist-consent-screens`): the waitlist consent SCREENS — the second (news) box, the
 * unsubscribe page and the admin "market opened" card. Client only; the server half is 291a (#1753). DB-free:
 * components under react-dom/server, the network through a fake fetcher, page sources read with readFileSync.
 * No git, no execSync, no execFileSync, no comparison with any ref.
 *
 *   W1  box 2 is drawn only while WAITLIST_MARKETING_BOX_ENABLED is true AND its words resolve (once per form,
 *       unticked). Row 294 leaves the flag on. No network call decides it.
 *   W2  box 1 is unchanged: same tick, same ids, same label source.
 *   W3  box 2 posts `marketingConsent`; box 1 and box 2 are independent.
 *   W4  every posted body passes the strict `waitlistJoinBodySchema`; the only new key is `marketingConsent`.
 *   W5  box 2's label is the box2Label text.
 *   U1  a valid token: one GET, zero POSTs.        U2  the city when the server names one; a city-less line when not.
 *   U3  the press: one POST, body exactly {token}.  U4  a double press is one POST; the button is disabled in flight.
 *   U5  missing token / GET 400 / POST 400 ⇒ invalid. U6  5xx ⇒ error, not done.   U7  the token is never shown.
 *   U8  /unsubscribe is a public route and the generated route list is current.
 *   U9  the new screens import nothing from server/ (the PR diff touches no server file; see the PR body).
 *   A1  only the admin card calls the market-opened route, and only /admin/waitlist mounts it.
 *   A2  the button waits for a city and a role; the body is exactly {market, role}; the POST happens on confirm.
 *   A3  the result line shows both numbers, 0s included. A4  "queued", never "sent"/"send"/"emailed".
 *   A5  a double confirm is one POST; 400/403/500 show the admin error.
 *   X1  the copy object equals the strings table; no "AI", no PayPal.  X2  the 390px classes.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/row291b-waitlist-consent-screens.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import {
  WAITLIST_MARKETING_BOX_ENABLED,
  WAITLIST_MARKETING_CONSENT_LINE,
  WAITLIST_MARKET_OPTIONS,
  waitlistConsentLine,
  waitlistJoinBodySchema,
  waitlistMarketingConsentLine,
} from "@shared/launch-waitlist";
import { CLIENT_ROUTES } from "@shared/client-routes.generated";
import { WAITLIST_CONSENT_COPY } from "../waitlist-consent-copy";
import { ConsentBoxes, marketingBoxOpen } from "../../pages/launch-waitlist";
import {
  UnsubscribeView,
  loadUnsubscribe,
  revokeUnsubscribe,
  singleFlight,
  unsubscribeTokenFromSearch,
  type UnsubscribeState,
} from "../../pages/waitlist-unsubscribe";
import {
  MARKET_OPENED_ROUTE,
  WaitlistMarketOpenedCard,
  marketOpenedBody,
  marketOpenedConfirmLine,
  marketOpenedResultLine,
  marketOpenedRunner,
  postMarketOpened,
} from "../../components/admin/WaitlistMarketOpenedCard";

(globalThis as any).React = React;

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const PAGE = read("client/src/pages/launch-waitlist.tsx");
const UNSUB = read("client/src/pages/waitlist-unsubscribe.tsx");
const CARD = read("client/src/components/admin/WaitlistMarketOpenedCard.tsx");
const APP = read("client/src/App.tsx");
const noop = () => {};

function boxes(role: "traveler" | "provider", over: Partial<React.ComponentProps<typeof ConsentBoxes>> = {}) {
  return renderToString(
    <Router ssrPath="/kyoto"><ConsentBoxes
      role={role}
      market="kyoto"
      consent={false}
      onConsent={noop}
      marketingConsent={false}
      onMarketingConsent={noop}
      marketingOpen
      {...over}
    /></Router>,
  );
}
const button = (html: string, id: string) => html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? "";
const count = (html: string, needle: string) => html.split(needle).length - 1;

type Call = { url: string; method: string; body: string | undefined };
function fakeFetch(answers: Record<string, { status: number; json?: unknown } | Error>) {
  const calls: Call[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    const a = answers[method];
    if (!a) throw new Error(`unexpected ${method}`);
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.json ?? {}), { status: a.status, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fetcher };
}
const TOKEN = "11111111-2222-3333-4444-555555555555.abcdef0123456789";

describe("W1 — box 2 renders only behind the gate", () => {
  it("draws box 2 once per form, unticked, when the gate is open", () => {
    for (const [role, prefix] of [["traveler", "waitlist"], ["provider", "provider"]] as const) {
      const html = boxes(role);
      assert.equal(count(html, `data-testid="checkbox-${prefix}-marketing-consent"`), 1, role);
      const box2 = button(html, `checkbox-${prefix}-marketing-consent`);
      assert.match(box2, /aria-checked="false"/, `${role}: box 2 unticked`);
      assert.match(html, new RegExp(`data-testid="consent-boxes-${role}"`));
    }
  });
  it("does not draw box 2 when the gate is closed", () => {
    for (const [role, prefix] of [["traveler", "waitlist"], ["provider", "provider"]] as const) {
      const html = boxes(role, { marketingOpen: false });
      assert.equal(count(html, "marketing-consent"), 0, role);
      assert.equal(count(html, `data-testid="checkbox-${prefix}-consent"`), 1, `${role}: box 1 still drawn`);
    }
  });
  it("opens only while the flag is on AND the market has words", () => {
    assert.equal(WAITLIST_MARKETING_BOX_ENABLED, true, "row 294: the approved news sentence is on");
    assert.equal(marketingBoxOpen("kyoto"), true, "the default reads the flag");
    assert.equal(marketingBoxOpen("kyoto", true), true);
    assert.equal(marketingBoxOpen("kyoto", false), false);
    assert.equal(marketingBoxOpen("lisbon", true), false, "no words for a market ⇒ no box");
    assert.equal(waitlistMarketingConsentLine("lisbon"), null);
    assert.ok(PAGE.includes("return enabled && waitlistMarketingConsentLine(market) !== null;"));
  });
  it("no network call decides the box", () => {
    const code = stripComments(PAGE);
    assert.doesNotMatch(code, /TEXT_VERSION_ROUTE|useMarketingTextVersion|consent-text-version/);
    assert.equal(count(code, "useQuery<"), 3, "only the page's existing three reads (signup mode, live markets, experts)");
  });
  it("both forms use the one shared component and pass their role", () => {
    assert.equal(count(PAGE, "<ConsentBoxes\n"), 2);
    assert.ok(PAGE.includes('<ConsentBoxes\n        role="traveler"'));
    assert.ok(PAGE.includes('<ConsentBoxes\n        role="provider"'));
    assert.equal(count(PAGE, "const marketingOpen = marketingBoxOpen(market);"), 2);
  });
});

describe("W2 — box 1 is unchanged", () => {
  it("keeps its tick, ids and label source", () => {
    for (const market of ["kyoto", "goa"]) {
      for (const [role, prefix] of [["traveler", "waitlist"], ["provider", "provider"]] as const) {
        const html = boxes(role, { market });
        assert.equal(count(html, `data-testid="checkbox-${prefix}-consent"`), 1);
        const label = html.match(new RegExp(`data-testid="label-${prefix}-consent"[^>]*>([^<]*)<`))?.[1];
        assert.equal(label, waitlistConsentLine(market).replace(/'/g, "&#x27;"));
        assert.ok(html.includes('href="/privacy"'));
      }
    }
    assert.ok(PAGE.includes("{waitlistConsentLine(market)}"));
    assert.equal(count(PAGE, "<ConsentTick "), 1);
  });
});

describe("W3 — box 2 posts marketingConsent, independent of box 1", () => {
  it("each tick reflects only its own state", () => {
    const a = boxes("traveler", { consent: true, marketingConsent: false });
    assert.match(button(a, "checkbox-waitlist-consent"), /aria-checked="true"/);
    assert.match(button(a, "checkbox-waitlist-marketing-consent"), /aria-checked="false"/);
    const b = boxes("provider", { consent: false, marketingConsent: true });
    assert.match(button(b, "checkbox-provider-consent"), /aria-checked="false"/);
    assert.match(button(b, "checkbox-provider-marketing-consent"), /aria-checked="true"/);
  });
  it("each form posts marketingConsent from box 2 only, and false while the gate is closed", () => {
    assert.equal(count(PAGE, "      consent,\n      marketingConsent: marketingOpen && marketingConsent,\n"), 2);
    assert.equal(count(PAGE, "const [marketingConsent, setMarketingConsent] = useState(false);"), 2);
    assert.equal(count(PAGE, "onMarketingConsent={setMarketingConsent}"), 2);
    assert.equal(count(PAGE, "onConsent={setConsent}"), 2);
    const posted = (open: boolean, ticked: boolean) => open && ticked;
    assert.equal(posted(true, true), true);
    assert.equal(posted(true, false), false);
    assert.equal(posted(false, true), false, "a tick that could save nothing is never posted as true");
  });
});

describe("W4 — the posted bodies pass the strict schema", () => {
  it("traveler and provider, box 2 ticked and not", () => {
    for (const marketingConsent of [true, false]) {
      const traveler = {
        role: "traveler", email: "a@b.co", market: "kyoto", consent: true, marketingConsent,
        source: "kyoto", ref: "abc", tripType: "wedding", roughMonth: "2027-04", worry: "x", otherCity: "Lisbon",
      };
      const provider = {
        role: "provider", email: "a@b.co", market: "kyoto", consent: false, marketingConsent,
        contactName: "A", businessName: "B", serviceType: "guide_planner", source: "kyoto", otherCity: "Lisbon",
      };
      assert.equal(waitlistJoinBodySchema.safeParse(traveler).success, true, JSON.stringify(traveler));
      const p = waitlistJoinBodySchema.safeParse(provider);
      assert.equal(p.success, true, JSON.stringify(p.success ? "" : p.error.issues));
    }
  });
  it("adds no key beyond marketingConsent", () => {
    const keys = (form: string) => {
      const start = PAGE.indexOf(`role: "${form}",`);
      const end = PAGE.indexOf("});", start);
      return Array.from(PAGE.slice(start, end).matchAll(/^\s+(?:\.\.\.\([^?]+\?\s*\{\s*)?(\w+)[:,]/gm), (m) => m[1]);
    };
    for (const form of ["traveler", "provider"]) {
      const ks = keys(form);
      assert.ok(ks.includes("marketingConsent"), form);
      const parsed = waitlistJoinBodySchema.safeParse(Object.fromEntries(ks.map((k) => [k, undefined])));
      const unknown = parsed.success ? [] : parsed.error.issues.filter((i) => i.code === "unrecognized_keys");
      assert.deepEqual(unknown, [], `${form}: ${ks.join(",")}`);
    }
  });
});

describe("W5 — box 2's label", () => {
  it("is the box2Label text, for every market that has one", () => {
    assert.equal(
      WAITLIST_MARKETING_CONSENT_LINE,
      "Send me news and offers from Traveloure. You can unsubscribe at any time.",
    );
    for (const m of WAITLIST_MARKET_OPTIONS) assert.equal(waitlistMarketingConsentLine(m.key), WAITLIST_MARKETING_CONSENT_LINE);
    const html = boxes("traveler");
    assert.ok(html.includes(`data-testid="label-waitlist-marketing-consent">${WAITLIST_MARKETING_CONSENT_LINE}<`));
  });
});

describe("U1–U3 — confirm on GET, revoke on one POST", () => {
  it("U1: a valid token makes one GET and no POST", async () => {
    const { calls, fetcher } = fakeFetch({ GET: { status: 200, json: { ok: true, list: "waitlist", market: "kyoto", city: "Kyoto" } } });
    const s = await loadUnsubscribe(TOKEN, fetcher);
    assert.deepEqual(s, { kind: "confirm", city: "Kyoto", posting: false });
    assert.deepEqual(calls.map((c) => [c.method, c.url]), [["GET", `/api/waitlist/unsubscribe?token=${encodeURIComponent(TOKEN)}`]]);
    assert.equal(calls[0].body, undefined);
    // On mount the page runs the GET only; the POST is wired to the button alone.
    assert.ok(UNSUB.includes("useEffect(load, [token]);"));
    assert.equal(count(UNSUB, "revokeUnsubscribe(token, fetcher)"), 1);
    assert.ok(UNSUB.includes("onUnsubscribe={() => void revoke()}"));
  });
  it("U2: names the city when known, a city-less line when not", async () => {
    const withCity = renderToString(<UnsubscribeView state={{ kind: "confirm", city: "Kyoto", posting: false }} onUnsubscribe={noop} onRetry={noop} />);
    assert.ok(withCity.includes("You&#x27;ll stop getting emails about Traveloure opening in Kyoto."));
    const { fetcher } = fakeFetch({ GET: { status: 200, json: { ok: true, list: "waitlist", market: null, city: null } } });
    const s = await loadUnsubscribe(TOKEN, fetcher);
    assert.deepEqual(s, { kind: "confirm", city: null, posting: false });
    const noCity = renderToString(<UnsubscribeView state={s} onUnsubscribe={noop} onRetry={noop} />);
    assert.ok(noCity.includes("You&#x27;ll stop getting waitlist emails from Traveloure."));
    assert.ok(noCity.includes(WAITLIST_CONSENT_COPY.unsubConfirmHeading));
    assert.ok(noCity.includes(`>${WAITLIST_CONSENT_COPY.unsubButton}<`));
  });
  it("U3: the press posts exactly {token} and lands on done", async () => {
    const { calls, fetcher } = fakeFetch({ POST: { status: 200, json: { ok: true } } });
    const s = await revokeUnsubscribe(TOKEN, fetcher);
    assert.deepEqual(s, { kind: "done" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/waitlist/unsubscribe");
    assert.deepEqual(JSON.parse(calls[0].body ?? ""), { token: TOKEN });
    const done = renderToString(<UnsubscribeView state={s} onUnsubscribe={noop} onRetry={noop} />);
    assert.ok(done.includes(WAITLIST_CONSENT_COPY.unsubDoneHeading.replace(/'/g, "&#x27;")));
    assert.ok(done.includes(WAITLIST_CONSENT_COPY.unsubDoneBody.replace(/'/g, "&#x27;")));
    assert.doesNotMatch(done, /button/i, "no undo, no resubscribe");
  });
});

describe("U4 — a double press is one POST", () => {
  it("drops a second press while the first is in flight, and disables the button", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let posts = 0;
    const press = singleFlight(async () => { posts++; await gate; return "done"; });
    const first = press();
    const second = await press();
    assert.equal(second, undefined);
    release();
    assert.equal(await first, "done");
    assert.equal(posts, 1);
    const html = renderToString(<UnsubscribeView state={{ kind: "confirm", city: null, posting: true }} onUnsubscribe={noop} onRetry={noop} />);
    assert.match(button(html, "button-unsubscribe"), /disabled=""/);
  });
});

describe("U5/U6 — invalid and error states", () => {
  it("U5: missing token is invalid with no network call", async () => {
    const { calls, fetcher } = fakeFetch({});
    assert.equal(unsubscribeTokenFromSearch(""), null);
    assert.equal(unsubscribeTokenFromSearch("token="), null);
    assert.equal(unsubscribeTokenFromSearch(`?token=${encodeURIComponent(TOKEN)}`), TOKEN);
    assert.deepEqual(await loadUnsubscribe(null, fetcher), { kind: "invalid" });
    assert.equal(calls.length, 0);
  });
  it("U5: GET 400 is invalid and posts nothing; POST 400 is invalid", async () => {
    const g = fakeFetch({ GET: { status: 400, json: { error: "Invalid unsubscribe link" } } });
    assert.deepEqual(await loadUnsubscribe(TOKEN, g.fetcher), { kind: "invalid" });
    assert.deepEqual(g.calls.map((c) => c.method), ["GET"]);
    const p = fakeFetch({ POST: { status: 400, json: { error: "Invalid unsubscribe link" } } });
    assert.deepEqual(await revokeUnsubscribe(TOKEN, p.fetcher), { kind: "invalid" });
    const html = renderToString(<UnsubscribeView state={{ kind: "invalid" }} onUnsubscribe={noop} onRetry={noop} />);
    assert.ok(html.includes(WAITLIST_CONSENT_COPY.unsubInvalid.replace(/'/g, "&#x27;")));
  });
  it("U6: a 5xx or a network failure is the error copy, never done", async () => {
    assert.deepEqual(await loadUnsubscribe(TOKEN, fakeFetch({ GET: { status: 500 } }).fetcher), { kind: "error", step: "load" });
    assert.deepEqual(await loadUnsubscribe(TOKEN, fakeFetch({ GET: new Error("offline") }).fetcher), { kind: "error", step: "load" });
    assert.deepEqual(await revokeUnsubscribe(TOKEN, fakeFetch({ POST: { status: 503 } }).fetcher), { kind: "error", step: "revoke" });
    assert.deepEqual(await revokeUnsubscribe(TOKEN, fakeFetch({ POST: new Error("offline") }).fetcher), { kind: "error", step: "revoke" });
    for (const step of ["load", "revoke"] as const) {
      const html = renderToString(<UnsubscribeView state={{ kind: "error", step }} onUnsubscribe={noop} onRetry={noop} />);
      assert.ok(html.includes(WAITLIST_CONSENT_COPY.unsubError));
      assert.ok(html.includes('data-testid="button-unsubscribe-retry"'));
      assert.equal(html.includes(WAITLIST_CONSENT_COPY.unsubDoneHeading.replace(/'/g, "&#x27;")), false);
    }
  });
});

describe("U7 — the token is never shown or logged", () => {
  it("no state renders it, and the page never logs", () => {
    const states: UnsubscribeState[] = [
      { kind: "loading" }, { kind: "confirm", city: "Kyoto", posting: false }, { kind: "done" }, { kind: "invalid" },
      { kind: "error", step: "load" }, { kind: "error", step: "revoke" },
    ];
    for (const s of states) {
      const html = renderToString(<UnsubscribeView state={s} onUnsubscribe={noop} onRetry={noop} />);
      assert.equal(html.includes(TOKEN), false, s.kind);
      assert.equal(html.includes("abcdef0123456789"), false, s.kind);
    }
    assert.doesNotMatch(stripComments(UNSUB), /console\.|logger/);
  });
});

describe("U8 — a public route at exactly /unsubscribe", () => {
  it("is registered without ProtectedRoute and listed in the generated route file", () => {
    const route = APP.match(/<Route path="\/unsubscribe">\s*([\s\S]*?)<\/Route>/)?.[1] ?? "";
    assert.equal(route.trim(), "<Layout><WaitlistUnsubscribePage /></Layout>");
    assert.equal(count(APP, 'path="/unsubscribe"'), 1);
    assert.ok(APP.includes('const WaitlistUnsubscribePage = lazy(() => import("@/pages/waitlist-unsubscribe"));'));
    // The generator's own rule (scripts/generate-client-routes.cjs), applied here without running it.
    const fromApp = Array.from(new Set(Array.from(APP.matchAll(/<Route\b[^>]*?\bpath="([^"]+)"/g), (m) => m[1]))).sort();
    assert.deepEqual([...CLIENT_ROUTES], fromApp, "shared/client-routes.generated.ts is current");
    assert.ok(CLIENT_ROUTES.includes("/unsubscribe"));
  });
});

describe("U9 — screens only", () => {
  it("the new screens and the copy import nothing from server/", () => {
    for (const src of [PAGE, UNSUB, CARD, read("client/src/lib/waitlist-consent-copy.ts")]) {
      assert.doesNotMatch(src, /from ["'](?:\.\.\/)+server\/|from ["']@server\//);
    }
  });
});

describe("A1 — the market-opened route lives on the admin card only", () => {
  it("no other client file calls it, and only /admin/waitlist mounts the card", () => {
    const hits: string[] = [];
    const cardUsers: string[] = [];
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        const src = fs.readFileSync(p, "utf8");
        if (src.includes("/api/admin/waitlist/market-opened")) hits.push(path.relative(ROOT, p));
        if (src.includes("<WaitlistMarketOpenedCard")) cardUsers.push(path.relative(ROOT, p));
      }
    };
    walk(path.join(ROOT, "client/src"));
    assert.deepEqual(hits, ["client/src/components/admin/WaitlistMarketOpenedCard.tsx"]);
    assert.deepEqual(cardUsers, ["client/src/pages/admin/waitlist.tsx"]);
    assert.equal(MARKET_OPENED_ROUTE, "/api/admin/waitlist/market-opened");
    assert.ok(/<Route path="\/admin\/waitlist">\s*\{\(\) => <ProtectedRoute component=\{AdminWaitlist\} requiredRole="admin" \/>\}/.test(APP));
  });
});

describe("A2 — choose, confirm, then one POST of {market, role}", () => {
  it("the button is disabled until both are chosen, and only opens the confirm", () => {
    const html = renderToString(<WaitlistMarketOpenedCard post={async () => { throw new Error("no post on render"); }} />);
    assert.match(button(html, "button-market-opened"), /disabled=""/);
    assert.equal(count(html, '<option value="" selected="">—</option>'), 2, "no default city or role");
    assert.ok(html.includes('<option value="traveler">Traveler</option>'), "role value unchanged, label shown");
    assert.ok(html.includes('<option value="provider">Provider</option>'));
    assert.ok(CARD.includes("onClick={() => setConfirming(true)}"));
    assert.equal(count(stripComments(CARD), "run(market, role)"), 1, "the POST runs from the confirm only");
  });
  it("the body is exactly {market, role} and the confirm names both", async () => {
    assert.deepEqual(marketOpenedBody("kyoto", "provider"), { market: "kyoto", role: "provider" });
    const sent: Array<[string, string, unknown]> = [];
    await postMarketOpened("goa", "traveler", async (m, u, b) => {
      sent.push([m, u, b]);
      return new Response(JSON.stringify({ ok: true, enqueued: 0, skipped: 0 }), { status: 200 });
    });
    assert.deepEqual(sent, [["POST", "/api/admin/waitlist/market-opened", { market: "goa", role: "traveler" }]]);
    assert.equal(marketOpenedConfirmLine("kyoto", "traveler"), "Queue the \"we're open\" email for travelers on the Kyoto waitlist?");
    assert.equal(marketOpenedConfirmLine("goa", "provider"), "Queue the \"we're open\" email for providers on the Goa waitlist?");
  });
});

describe("A3 — both numbers, always", () => {
  it("shows enqueued and skipped, 0s included", async () => {
    const ok = (json: unknown) => async () => new Response(JSON.stringify(json), { status: 200 });
    const r = await postMarketOpened("kyoto", "traveler", ok({ ok: true, enqueued: 3, skipped: 1 }));
    assert.deepEqual(r, { kind: "ok", enqueued: 3, skipped: 1 });
    assert.equal(marketOpenedResultLine(3, 1), "3 queued, 1 skipped");
    const z = await postMarketOpened("kyoto", "traveler", ok({ ok: true, enqueued: 0, skipped: 0 }));
    assert.deepEqual(z, { kind: "ok", enqueued: 0, skipped: 0 });
    assert.equal(marketOpenedResultLine(0, 0), "0 queued, 0 skipped");
  });
});

describe("A4 — queued, never sent", () => {
  it("the card's words say queued and none of sent/send/emailed", () => {
    const words = [
      WAITLIST_CONSENT_COPY.adminCardTitle, WAITLIST_CONSENT_COPY.adminButton, WAITLIST_CONSENT_COPY.adminConfirm,
      WAITLIST_CONSENT_COPY.adminResult, WAITLIST_CONSENT_COPY.adminError,
    ].join(" ");
    assert.match(words, /queued/i);
    const html = renderToString(<WaitlistMarketOpenedCard />).replace(/<[^>]+>/g, " ");
    for (const text of [words, html, stripComments(CARD).replace(/"[^"]*"\s*:/g, "")]) {
      assert.doesNotMatch(text.replace(/data-testid="[^"]*"/g, ""), /\b(sent|send|emailed)\b/i);
    }
  });
});

describe("A5 — one POST per confirm; errors show the admin error", () => {
  it("a double confirm posts once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let posts = 0;
    const run = marketOpenedRunner(async () => {
      posts++;
      await gate;
      return new Response(JSON.stringify({ ok: true, enqueued: 1, skipped: 0 }), { status: 200 });
    });
    const first = run("kyoto", "traveler");
    assert.equal(await run("kyoto", "traveler"), null);
    release();
    assert.deepEqual(await first, { kind: "ok", enqueued: 1, skipped: 0 });
    assert.equal(posts, 1);
  });
  it("400, 403 and 500 are the error result", async () => {
    // apiRequest throws "<status>: <body>" on a non-2xx answer.
    for (const [status, body] of [
      [400, { error: "Choose a city and a role." }],
      [403, { error: "Admin access required" }],
      [500, { error: "Could not queue the launch email." }],
    ] as const) {
      const r = await postMarketOpened("kyoto", "traveler", async () => { throw new Error(`${status}: ${JSON.stringify(body)}`); });
      assert.deepEqual(r, { kind: "error", message: body.error });
    }
    const opaque = await postMarketOpened("kyoto", "traveler", async () => { throw new Error("500: <html>"); });
    assert.deepEqual(opaque, { kind: "error", message: null });
    assert.ok(CARD.includes("{COPY.adminError}"));
    assert.equal(WAITLIST_CONSENT_COPY.adminError, "Could not queue the email.");
    assert.doesNotMatch(stripComments(CARD), /already|again\?|repeat/i, "no repeat-run warning (ruling 4)");
  });
});

describe("X1 — the strings table", () => {
  it("equals the table exactly; no AI, no PayPal", () => {
    assert.deepEqual({ ...WAITLIST_CONSENT_COPY }, {
      unsubConfirmHeading: "Unsubscribe from waitlist emails?",
      unsubConfirmBodyCity: "You'll stop getting emails about Traveloure opening in {city}.",
      unsubConfirmBody: "You'll stop getting waitlist emails from Traveloure.",
      unsubButton: "Unsubscribe",
      unsubDoneHeading: "You're unsubscribed",
      unsubDoneBody: "We won't email you about the waitlist again.",
      unsubInvalid: "This unsubscribe link isn't valid. Please use the link from your most recent email.",
      unsubError: "Something went wrong. Please try again.",
      adminCardTitle: "Market opened email",
      adminButton: "Queue \"we're open\" email",
      adminConfirm: "Queue the \"we're open\" email for {role}s on the {city} waitlist?",
      adminResult: "{enqueued} queued, {skipped} skipped",
      adminError: "Could not queue the email.",
      adminRoleTraveler: "Traveler",
      adminRoleProvider: "Provider",
    });
    for (const v of [...Object.values(WAITLIST_CONSENT_COPY), WAITLIST_MARKETING_CONSENT_LINE]) {
      assert.doesNotMatch(v, /\bAI\b/);
      assert.doesNotMatch(v, /paypal/i);
    }
  });
});

describe("X2 — 390px", () => {
  it("the boxes, the unsubscribe card and the admin card carry wrapping, shrinking classes", () => {
    assert.match(PAGE, /className="min-w-0 break-words text-sm font-normal leading-snug"/);
    const unsub = renderToString(<UnsubscribeView state={{ kind: "confirm", city: "Kyoto", posting: false }} onUnsubscribe={noop} onRetry={noop} />);
    assert.match(unsub, /mx-auto w-full max-w-md px-4/);
    assert.match(unsub, /break-words/);
    assert.match(unsub, /w-full sm:w-auto/);
    const card = renderToString(<WaitlistMarketOpenedCard />);
    assert.match(card, /min-w-0/);
    assert.match(card, /flex flex-wrap gap-3/);
    assert.match(card, /h-auto max-w-full whitespace-normal/);
  });
});
