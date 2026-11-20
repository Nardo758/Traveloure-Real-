/**
 * F3, part 2 (Leon, Nov 19, 2026): on the service detail page a WAITLIST GUEST's add writes to the guest plan
 * through the one add runner - the same write the /services card makes for the same listing. It used to open
 * the sign-in wall, in a mode where sign-up is closed.
 *
 *   G1 signed out + waitlist + the plain add of the listing -> the guest-plan write; anything else signed out
 *      (a room, an add that proceeds to checkout, open mode) keeps the sign-in door
 *   G2 the write is the /services card's: a `listing` ref by the service id, in the listing's own city, through
 *      `runGuestAdd`; no city -> the approved "couldn't save" toast and nothing sent
 *   G3 the signed-in path is untouched
 *   G4 hooks stay above the page's loading and error returns
 *
 * Source pins: the page is too large to render in a unit test. The guest write itself is covered by the add
 * runner's own tests and by the /services card's.
 *
 * Run: npx tsx --test client/src/lib/__tests__/f3b-service-detail-guest-add.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const read = (p: string) => readFileSync(join(resolve(import.meta.dirname, "../../../.."), p), "utf8");
const page = read("client/src/pages/service-detail.tsx");
const begin = page.slice(page.indexOf("const beginAdd = (kind:"), page.indexOf("beginAddRef.current = beginAdd;"));
const guest = page.slice(page.indexOf("const addForGuest = async () => {"), page.indexOf("const beginAdd = (kind:"));

test("G1 signed out: only a waitlist guest's plain add of the listing skips the sign-in door", () => {
  assert.match(
    begin,
    /if \(!user\) \{[\s\S]*?if \(signupMode === "waitlist" && kind === "service" && !proceed\) void addForGuest\(\);\s*else openSignInModal\(\);\s*return;\s*\}/,
  );
  assert.match(page, /const \{ mode: signupMode \} = useSignupMode\(\);/, "the shared, fail-closed mode read");
});

test("G2 the write is the /services card's own", () => {
  assert.match(guest, /const ref = \{ kind: "listing" as const, source_id: String\(service\.id\), city \};/);
  assert.match(guest, /await runGuestAdd\(\{ key: savedRefKey\(ref\), ref, city, chosenDate: null \}\);/);
  assert.match(guest, /if \(!city \|\| city === "Unknown" \|\| guestAdding\) \{[\s\S]*?GUEST_PLAN_COPY\.saveFailed[\s\S]*?return;/, "no city: say so, send nothing");
  const card = read("client/src/pages/discover.tsx");
  assert.match(card, /const ref = \{ kind: "listing" as const, source_id: String\(service\.id\), city \};/, "the same ref the card builds");
  assert.doesNotMatch(guest, /localStorage|\/api\/cart/, "never the old guest cart");
});

test("G3 the signed-in path is as it was", () => {
  const signedIn = begin.slice(begin.indexOf("// The open-plan list has not answered."));
  assert.match(signedIn, /decideAddTarget\(\{ targetTripId, signedIn: true, authLoading: false \}\) === "pick"/);
  assert.match(signedIn, /if \(kind === "room"\) addRoomToCartMutation\.mutate\(\{ proceed, tripId \}\);\s*else addToCartMutation\.mutate\(\{ proceed, tripId \}\);/);
  assert.doesNotMatch(signedIn, /addForGuest|runGuestAdd/);
});

test("G4 the new state is declared above the page's early returns", () => {
  const firstReturn = page.indexOf("if (serviceLoading) {");
  assert.ok(firstReturn > 0);
  const state = page.indexOf("const [guestAdding, setGuestAdding] = useState(false);");
  assert.ok(state > 0 && state < firstReturn, "a hook after a conditional return breaks the page");
  assert.ok(page.indexOf("useSignupMode();") < firstReturn);
});
