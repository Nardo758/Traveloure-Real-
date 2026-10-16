/**
 * LW-1f (ledger `2026-10-16-lw1f-kyoto-ticker`; hand-off Part A): the ticker's pure rules — no DOM, no DB.
 *
 *   K1  an href is NULL or a relative internal path: outside URLs, `//host`, schemes, backslashes and spaces are
 *       refused; the query and hash are not part of the route match.
 *   K2  an internal path must match the committed client route list (`:param` = one segment); an unknown path is
 *       refused with its own sentence.
 *   K3  `/blog/<slug>` is recognised as a blog link (its publication is the server's check).
 *   K4  the right button follows the sign-up switch: waitlist ⇒ "Join the Kyoto waitlist" to /kyoto; open ⇒
 *       "Start planning" with the city; an unknown mode is waitlist (fail-closed).
 *   K5  the launch market's city comes from its slug; a slug naming no market is NULL, never a guess.
 *   K6  the ribbon is mounted on the public marketing pages only — never checkout, admin, the workspace, the
 *       guest planner or the waitlist page itself.
 *   K7  the committed route list is current (the same check CI runs) and holds the seeded links.
 *
 * Run: npx tsx --test client/src/lib/__tests__/ticker-rules.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  TICKER_OPEN_BUTTON,
  blogSlugOf,
  hrefRefusal,
  internalPathOf,
  isClientRoutePath,
  launchCityName,
  tickerButton,
} from "../../../../shared/ticker";
import { CLIENT_ROUTES } from "../../../../shared/client-routes.generated";
import { showsTicker } from "../ticker-mount";

describe("K1 — the link shape", () => {
  it("accepts a relative internal path and strips query and hash for matching", () => {
    assert.equal(internalPathOf("/kyoto"), "/kyoto");
    assert.equal(internalPathOf("/signup?intent=supply"), "/signup");
    assert.equal(internalPathOf("/blog/x#top"), "/blog/x");
  });
  it("refuses outside and disguised links", () => {
    for (const bad of ["https://evil.example", "//evil.example/x", "kyoto", "/\\evil", "/a b", "javascript:alert(1)", "/javascript:x", ""]) {
      assert.equal(internalPathOf(bad), null, bad);
      assert.ok(hrefRefusal(bad), `${bad} is refused`);
    }
  });
  it("no link at all is allowed", () => {
    assert.equal(hrefRefusal(null), null);
  });
});

describe("K2 — the route list", () => {
  const routes = ["/", "/kyoto", "/blog/:slug", "/signup", "/s/:handle"];
  it("matches literal and parameter routes", () => {
    assert.ok(isClientRoutePath("/kyoto", routes));
    assert.ok(isClientRoutePath("/blog/some-post", routes));
    assert.ok(isClientRoutePath("/", routes));
    assert.ok(isClientRoutePath("/kyoto/", routes), "a trailing slash is the same page");
  });
  it("refuses an unknown path, a missing segment and an extra one", () => {
    assert.ok(!isClientRoutePath("/osaka", routes));
    assert.ok(!isClientRoutePath("/blog", routes));
    assert.ok(!isClientRoutePath("/blog/a/b", routes));
    assert.match(hrefRefusal("/no-such-page", routes) ?? "", /is not a page on this site/);
    assert.equal(hrefRefusal("/signup?intent=supply", routes), null);
  });
});

describe("K3 — blog links", () => {
  it("finds the post slug in a /blog/<slug> link only", () => {
    assert.equal(blogSlugOf("/blog/kyoto-foliage"), "kyoto-foliage");
    assert.equal(blogSlugOf("/blog/kyoto-foliage?x=1"), "kyoto-foliage");
    assert.equal(blogSlugOf("/blog"), null);
    assert.equal(blogSlugOf("/kyoto"), null);
    assert.equal(blogSlugOf(null), null);
    assert.equal(blogSlugOf("/blog/%E0%A4%A"), "%E0%A4%A", "a malformed escape never throws");
  });
});

describe("K4 — the button follows the sign-up switch", () => {
  it("waitlist mode: Join the Kyoto waitlist, to the waitlist page", () => {
    assert.deepEqual(tickerButton("waitlist", "kyoto", "Kyoto"), { kind: "waitlist", label: "Join the Kyoto waitlist", href: "/kyoto" });
  });
  it("open mode: Start planning, in that city", () => {
    assert.deepEqual(tickerButton("open", "kyoto", "Kyoto"), { kind: "plan", label: TICKER_OPEN_BUTTON, city: "Kyoto" });
    assert.equal(TICKER_OPEN_BUTTON, "Start planning");
  });
  it("an unknown or missing mode reads as waitlist", () => {
    assert.equal(tickerButton(undefined, "kyoto", "Kyoto").kind, "waitlist");
    assert.equal(tickerButton("OPEN", "kyoto", "Kyoto").kind, "waitlist");
  });
});

describe("K5 — the launch city", () => {
  it("names Kyoto for kyoto, and nothing for an unknown slug", () => {
    assert.equal(launchCityName("kyoto"), "Kyoto");
    assert.equal(launchCityName("atlantis"), null);
    assert.equal(launchCityName(null), null);
  });
});

describe("K6 — where the ribbon is mounted", () => {
  it("shows on the marketing pages", () => {
    for (const p of ["/", "/pricing", "/about", "/how-it-works", "/blog", "/blog/some-post", "/help/billing", "/experiences", "/pricing?x=1"]) {
      assert.ok(showsTicker(p), p);
    }
  });
  it("never on checkout, admin, the workspace, planning, invites or the waitlist page", () => {
    for (const p of ["/checkout", "/cart", "/admin", "/admin/ticker", "/dashboard", "/plans/new", "/plans/abc", "/invite/t", "/kyoto", "/blog/a/b", "/experiences/x", "/privacy"]) {
      assert.ok(!showsTicker(p), p);
    }
  });
});

describe("K7 — the committed route list", () => {
  it("is current with App.tsx", () => {
    execFileSync("node", ["scripts/generate-client-routes.cjs", "--check"], { stdio: "pipe" });
  });
  it("holds the pages the seeded lines link to", () => {
    assert.ok(isClientRoutePath("/kyoto", CLIENT_ROUTES));
    assert.ok(isClientRoutePath("/signup", CLIENT_ROUTES));
    assert.ok(isClientRoutePath("/blog/any-post", CLIENT_ROUTES));
  });
});
