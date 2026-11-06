/**
 * PLAN-2 lane 1 (DeepSeek report finding #3 / A-1…A-7, A-10): every save claim reflects a real
 * server-confirmed plan write.
 *
 *   S1 the Discover heart writes the guest plan and never toasts a bare "Saved to plan"
 *   S2 the waitlist Finalize chooser does not exist, and its divider is drawn only with a person lane
 *   S3 the slip's finish rail is absent in waitlist (no Finalize press, no toast-only save)
 *   S4 the storefront offering draws no save control (it only navigated)
 *   S5 the add-to-experience dialog announces nothing it did not write
 *   S6 Discover and the curated card save a waitlist guest through the ONE CAP-2 guest rail
 *
 * Source-level, like the repo's other claim guards: the behaviour is in React components that need a
 * DOM harness, and the invariant is that no claim exists outside the confirmed-save path.
 *
 * Run: npx tsx --test client/src/lib/__tests__/plan2-lane1-save-claims.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("PLAN-2 lane 1 — save claims are confirmed writes", () => {
  it("S1 the heart saves to the guest plan, never a bare claim", () => {
    const src = read("client/src/components/SaveToggle.tsx");
    assert.match(src, /saveToGuestPlan\(/, "the guest rail is the write");
    assert.match(src, /guestSavedMessage\(/, "the toast is the server's answer");
    assert.match(src, /guestSaveErrorMessage\(/, "a refusal says so");
    assert.match(src, /if \(!user && saveToPlan && !guestRef\) return null;/, "an unplaceable item draws no heart");
    assert.doesNotMatch(src, /toast\(\{\s*title:\s*WAITLIST_COPY\.savedToPlan\s*\}\)/, "no optimistic claim");
  });

  it("S2 the waitlist Finalize chooser does not exist; the divider needs a person lane", () => {
    const src = read("client/src/components/plancard/FinalizeBookingModal.tsx");
    assert.match(src, /if \(waitlist\) return null;/);
    assert.doesNotMatch(src, /finalize-option-save-to-plan/, "the write-nothing button is gone");
    assert.match(src, /\{people\.length > 0 \? \(/, "the divider is conditional");
  });

  it("S3 the slip finish rail is absent in waitlist", () => {
    const src = read("client/src/components/plancard/SlipRail.tsx");
    assert.match(src, /if \(waitlist\) return null;/, "no finish rail in waitlist");
    assert.doesNotMatch(src, /slip-action-save-to-plan/, "the toast-only save is gone");
  });

  it("S4 the storefront draws no save claim", () => {
    const src = read("client/src/pages/storefront.tsx");
    assert.doesNotMatch(src, /output === "save"/, "the navigating 'Save to plan' is removed");
  });

  it("S5 the add-to-experience dialog announces nothing it did not write", () => {
    const src = read("client/src/components/add-to-experience-dialog.tsx");
    assert.doesNotMatch(src, /WAITLIST_COPY\.savedToPlan/);
  });

  it("S6 Discover and curated send a waitlist guest through the guest rail", () => {
    for (const f of ["client/src/pages/discover.tsx", "client/src/components/curated-content-section.tsx"]) {
      const src = read(f);
      assert.match(src, /guestWaitlist/, `${f}: guest branch`);
      assert.match(src, /saveToGuestPlan\(/, `${f}: real write`);
      assert.match(src, /guestSavedMessage\(/, `${f}: confirmed toast`);
    }
  });
});
