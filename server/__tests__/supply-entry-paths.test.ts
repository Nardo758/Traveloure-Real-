/**
 * S-01 / S-10 (ledger `2026-10-21-supply-entry-paths`).
 *
 *   P1  A role-less supply sign-up continues to /earn, not the account form.
 *   P2  A named role continues to that role's one application.
 *   P3  offeringTypeKey, offeringName and source ride along; junk is omitted.
 *   P4  An unknown role is the chooser. It does not invent an application.
 *   P5  qa=1 and a non-supply intent stay on the account form.
 *   P6  The public ticker rewrites only a supply /signup href.
 *   P7  The Local Expert apply path is a same-site return, and the earn card uses it.
 *   P8  The signup page, the public ticker read and the waitlist door call this module.
 *
 * Run: npx tsx --test server/__tests__/supply-entry-paths.test.ts
 */
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { sameSiteReturnPath } from "@shared/safe-return-path";
import {
  LOCAL_EXPERT_APPLY_PATH,
  SUPPLY_APPLICATION_BY_ROLE,
  carriedOfferingName,
  carriedOfferingTypeKey,
  carriedSupplySource,
  publicSupplyEntryHref,
  supplySignupContinuation,
} from "@shared/supply-entry";
import { EARN_ROLES, EA_SIGNUP } from "../../client/src/lib/earn-roles";

function hrefOf(search: string): string {
  const next = supplySignupContinuation(search);
  assert.notEqual(next.kind, "account", search);
  return next.kind === "account" ? "" : next.href;
}

test("P1 — a role-less supply sign-up continues to /earn", () => {
  const next = supplySignupContinuation("?intent=supply");
  assert.equal(next.kind, "chooser");
  assert.equal(next.kind === "chooser" ? next.href : "", "/earn");
  assert.equal(publicSupplyEntryHref("/signup?intent=supply"), "/earn");
});

test("P2 — each role continues to its one application", () => {
  assert.equal(hrefOf("?intent=supply&role=local_expert"), "/become-expert?type=local_expert");
  assert.equal(hrefOf("?intent=supply&role=service_provider"), "/become-provider");
  assert.equal(hrefOf("?intent=supply&role=trip_planner"), "/become-expert?type=travel_expert");
  assert.equal(hrefOf("?intent=supply&role=travel_expert"), "/become-expert?type=travel_expert");
  assert.equal(hrefOf("?intent=supply&role=event_planner"), "/start/events");
  assert.equal(hrefOf("?intent=supply&role=executive_assistant"), "/become-expert?type=executive_assistant");
  assert.equal(LOCAL_EXPERT_APPLY_PATH, SUPPLY_APPLICATION_BY_ROLE.local_expert);
  assert.equal(EARN_ROLES.find((r) => r.key === "local_expert")?.signupPath, LOCAL_EXPERT_APPLY_PATH);
  assert.equal(EARN_ROLES.find((r) => r.key === "service_provider")?.signupPath, SUPPLY_APPLICATION_BY_ROLE.service_provider);
  assert.equal(EARN_ROLES.find((r) => r.key === "event_planner")?.signupPath, SUPPLY_APPLICATION_BY_ROLE.event_planner);
  assert.equal(EARN_ROLES.find((r) => r.key === "trip_planner")?.signupPath, SUPPLY_APPLICATION_BY_ROLE.trip_planner);
  assert.equal(EA_SIGNUP.signupPath, SUPPLY_APPLICATION_BY_ROLE.executive_assistant);
});

test("P3 — a safe offering and source are carried; junk is omitted", () => {
  const href = hrefOf(
    "?intent=supply&role=local_expert&offeringTypeKey=city_guide&offeringName=City%20guide&source=ig_dm",
  );
  const url = new URL(href, "https://traveloure.test");
  assert.equal(url.pathname, "/become-expert");
  assert.equal(url.searchParams.get("type"), "local_expert");
  assert.equal(url.searchParams.get("offeringTypeKey"), "city_guide");
  assert.equal(url.searchParams.get("offeringName"), "City guide");
  assert.equal(url.searchParams.get("source"), "ig_dm");

  const events = new URL(
    hrefOf("?intent=supply&role=event_planner&offeringTypeKey=florist&offeringName=Florist"),
    "https://traveloure.test",
  );
  assert.equal(events.pathname, "/start/events");
  assert.equal(events.searchParams.get("offeringTypeKey"), "florist");
  assert.equal(events.searchParams.get("offeringName"), "Florist");

  const dropped = new URL(
    hrefOf("?intent=supply&role=service_provider&offeringTypeKey=../admin&offeringName=" + encodeURIComponent("a\nb") + "&source=https://evil.example"),
    "https://traveloure.test",
  );
  assert.equal(dropped.pathname, "/become-provider");
  assert.equal(dropped.search, "");
  assert.equal(carriedOfferingTypeKey("../admin"), null);
  assert.equal(carriedOfferingTypeKey("ok_key"), "ok_key");
  assert.equal(carriedOfferingName("a\nb"), null);
  assert.equal(carriedSupplySource("https://evil.example"), null);
  assert.equal(carriedSupplySource("//evil.example"), null);
  assert.equal(carriedSupplySource("ig_dm"), "ig_dm");

  const chooser = supplySignupContinuation("?intent=supply&source=kyoto_waitlist_page");
  assert.equal(chooser.kind, "chooser");
  assert.equal(chooser.kind === "chooser" ? chooser.href : "", "/earn?source=kyoto_waitlist_page");
});

test("P4 — an unknown role is the chooser and does not name an application", () => {
  for (const role of ["provider", "expert", "admin", "//evil.example", "local_expert/../admin"]) {
    const next = supplySignupContinuation(`?intent=supply&role=${encodeURIComponent(role)}`);
    assert.equal(next.kind, "chooser", role);
    const href = next.kind === "chooser" ? next.href : "";
    assert.equal(href, "/earn", role);
    assert.equal(href.includes("become-"), false);
    assert.equal(href.includes(role), false);
  }
});

test("P5 — qa=1 and a non-supply intent stay on the account form", () => {
  assert.equal(supplySignupContinuation("?intent=supply&qa=1").kind, "account");
  assert.equal(supplySignupContinuation("?intent=supply&role=local_expert&qa=1").kind, "account");
  assert.equal(supplySignupContinuation("").kind, "account");
  assert.equal(supplySignupContinuation("?intent=traveler&role=local_expert").kind, "account");
  assert.equal(publicSupplyEntryHref("/signup?intent=supply&qa=1"), "/signup?intent=supply&qa=1");
});

test("P6 — the public ticker rewrites only a supply signup href", () => {
  assert.equal(publicSupplyEntryHref(null), null);
  assert.equal(publicSupplyEntryHref("/kyoto"), "/kyoto");
  assert.equal(publicSupplyEntryHref("/blog/kyoto-guide"), "/blog/kyoto-guide");
  assert.equal(publicSupplyEntryHref("/signup"), "/signup");
  assert.equal(publicSupplyEntryHref("/signup?intent=traveler"), "/signup?intent=traveler");
  assert.equal(
    publicSupplyEntryHref("/signup?intent=supply&role=service_provider&offeringTypeKey=tour_guide"),
    "/become-provider?offeringTypeKey=tour_guide",
  );
  assert.equal(publicSupplyEntryHref("/signup/?intent=supply"), "/signup/?intent=supply");
});

test("P7 — the Local Expert apply path is a same-site return the earn card uses", () => {
  assert.equal(sameSiteReturnPath(LOCAL_EXPERT_APPLY_PATH), LOCAL_EXPERT_APPLY_PATH);
  assert.equal(sameSiteReturnPath("/become-expert?type=local_expert"), "/become-expert?type=local_expert");
  const earn = readFileSync(new URL("../../client/src/pages/earn.tsx", import.meta.url), "utf8");
  assert.match(earn, /activeKey === "local_expert"/);
  assert.match(earn, /data-testid="earn-apply-local-expert"/);
  assert.match(earn, /Apply as a Local Expert/);
  assert.match(earn, /Sign in to apply as a Local Expert/);
  assert.match(earn, /Create an account or sign in, and you'll come back to the Local Expert application\./);
  assert.match(earn, /intent:\s*"supply"/);
  assert.match(earn, /returnTo:\s*LOCAL_EXPERT_APPLY_PATH/);
  assert.match(earn, /navigate\(LOCAL_EXPERT_APPLY_PATH\)/);
});

test("P8 — signup, the public ticker read and the waitlist door call this module", () => {
  const signup = readFileSync(new URL("../../client/src/pages/Signup.tsx", import.meta.url), "utf8");
  assert.match(signup, /supplySignupContinuation\(window\.location\.search\)/);
  assert.match(signup, /window\.location\.replace\(supplyContinuation\.href\)/);
  const ticker = readFileSync(new URL("../services/ticker.service.ts", import.meta.url), "utf8");
  assert.match(ticker, /publicSupplyEntryHref\(item\.href\)/);
  const waitlist = readFileSync(new URL("../../client/src/pages/launch-waitlist.tsx", import.meta.url), "utf8");
  assert.match(waitlist, /supplySignupContinuation\("\?intent=supply"\)/);
  assert.doesNotMatch(waitlist, /href="\/signup\?intent=supply"/);
});
