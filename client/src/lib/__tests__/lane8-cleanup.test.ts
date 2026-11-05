/**
 * Lane 8 — cleanup (ledger `2026-11-05-lane8-cleanup`; briefs A-12, A-13, A-21, A-32 part 1).
 *
 *   L1  A-12: while the session or mode read is in flight the press path is "wait"; resolved, it is the path the answers
 *       choose — a signed-in member in waitlist mode, or any viewer in open mode, never reaches the guest rail (409/404).
 *   L2  A-12: every browse add control is drawn disabled while either read is in flight (`pending`), and a press that
 *       still arrives sends nothing; a press is not queued, because the browse shell remounts the page on sign-in.
 *   L3  A-13: the guest storage key is defined once (`client/src/lib/guest-session-key.ts`); every reader imports it.
 *   L4  A-21: no planning tool renders on the guest plan page; Optimize on the slip is behind the dates gate; Getting
 *       home draws nothing anywhere.
 *   L5  A-32 part 1 (CN-1): stays and transport are link-only; the concierge task log writes only its own two tables.
 *
 * Run: npx tsx --test client/src/lib/__tests__/lane8-cleanup.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { browseSavePath } from "../browse-save";
import { browseSavesToPlan } from "../signup-mode";
import { GUEST_SESSION_STORAGE_KEY } from "../guest-session-key";
import { isConciergeLinkOnly } from "@shared/concierge-tasks";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Lane 8 cleanup", () => {
  it("L1 a press waits for both reads, then takes the resolved path", () => {
    const loading = { mode: "waitlist" as const, signedIn: false };
    assert.equal(browseSavePath({ ...loading, modeLoading: false, authLoading: true }), "wait");
    assert.equal(browseSavePath({ ...loading, modeLoading: true, authLoading: false }), "wait");
    // The old decision during the auth read: a signed-in member read as signed out ⇒ guest rail ⇒ 409 signed_in.
    assert.equal(browseSavesToPlan("waitlist", false), true);
    assert.equal(browseSavePath({ modeLoading: false, authLoading: false, mode: "waitlist", signedIn: true }), "card_add");
    // The old decision during the mode read: an open-mode visitor read as waitlist ⇒ guest rail ⇒ 404 not_found.
    assert.equal(browseSavePath({ modeLoading: false, authLoading: false, mode: "open", signedIn: false }), "card_add");
    assert.equal(browseSavePath({ modeLoading: false, authLoading: false, mode: "waitlist", signedIn: false }), "guest_save");
  });

  it("L2 every browse add control is disabled while a read is in flight", () => {
    const hook = read("client/src/lib/browse-save.ts");
    assert.match(hook, /pending: path === "wait",/);
    assert.match(hook, /return \(\) => \{\};/, "a press during the wait sends nothing");
    assert.doesNotMatch(hook, /createHeldPress|useRef/, "no queued press: the shell remounts the page on sign-in");
    assert.match(read("client/src/components/browse-shell.tsx"), /if \(!isLoading && user\) \{\s*return <DashboardLayout>/);
    // Each add <Button> in a card that reads the hook carries the disabled state.
    const sites: Array<[string, number]> = [
      ["client/src/components/city-feed-card.tsx", 8],
      ["client/src/components/city-feed-card-recommendation.tsx", 4],
      ["client/src/components/catalogue-search-results.tsx", 1],
    ];
    for (const [f, n] of sites) {
      assert.equal((read(f).match(/disabled=\{browseSave\.pending\}/g) ?? []).length, n, f);
    }
    assert.equal((read("client/src/components/city-feed-card-recommendation.tsx").match(/disabled=\{saveMode && browseSave\.pending\}/g) ?? []).length, 4);
    const card = read("client/src/components/city-feed-card.tsx");
    assert.match(card, /disabled: browseSave\.pending,/);
    assert.match(card, /onSave=\{action\.onAdd\} disabled=\{action\.disabled\}/);
    assert.match(card, /onClick=\{action\.onAdd\} disabled=\{action\.disabled\}/);
    assert.match(read("client/src/components/plan/SaveToPlanButton.tsx"), /disabled=\{disabled\}/);
  });

  it("L3 the guest storage key has one definition", () => {
    assert.equal(GUEST_SESSION_STORAGE_KEY, "traveloure_guest_session");
    const literal = '"traveloure_guest_session"';
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === "node_modules" || name === "__tests__") continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(name) && readFileSync(p, "utf8").includes(literal)) hits.push(p);
      }
    };
    walk(resolve(process.cwd(), "client/src"));
    walk(resolve(process.cwd(), "shared"));
    assert.deepEqual(hits.map((h) => h.replace(process.cwd() + "/", "")), ["client/src/lib/guest-session-key.ts"]);
    for (const f of ["client/src/lib/waitlist-guest-plan.ts", "client/src/lib/queryClient.ts", "client/src/App.tsx", "client/src/components/SignInModal.tsx", "client/src/pages/cart.tsx", "client/src/lib/guest-session.ts", "client/src/lib/guestSession.ts"]) {
      assert.match(read(f), /guest-session-key"/, f);
    }
  });

  it("L4 no planning tool on the guest plan; Optimize is dates-gated on the slip", () => {
    for (const f of ["client/src/pages/guest-plan-map.tsx", "client/src/components/plan/GuestPlanSlip.tsx"]) {
      assert.doesNotMatch(read(f), /ToolsTray|Optimi[sz]e|getting_home|AskAiDrawer|SlipRail/, f);
    }
    assert.match(read("client/src/components/plancard/MapControlCenter.tsx"), /const showPlanRail = !guest && /);
    assert.match(read("client/src/components/plancard/SlipRail.tsx"), /<DatesGate trip=\{trip\} action="Optimize"/);
    assert.match(read("client/src/components/plan/ToolsTray.tsx"), /case "getting_home":[\s\S]*?return null;/);
  });

  it("L5 CN-1: stays and transport are links; the task log books nothing", () => {
    assert.equal(isConciergeLinkOnly({ id: "x", domain: "stays" }), true);
    assert.equal(isConciergeLinkOnly({ id: "x", domain: "transport" }), true);
    assert.equal(isConciergeLinkOnly({ id: "stays", domain: "other" }), true);
    assert.equal(isConciergeLinkOnly({ id: "x", domain: "meals" }), false);
    const svc = read("server/services/concierge-task-log.service.ts");
    const writes = Array.from(svc.matchAll(/\.(?:insert|update|delete)\((\w+)\)/g)).map((m) => m[1]);
    assert.deepEqual([...new Set(writes)].sort(), ["conciergeTaskEvents", "conciergeTasks"]);
  });
});
