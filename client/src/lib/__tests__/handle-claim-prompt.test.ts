/**
 * HANDLES ARE CLAIMED, NEVER ASSIGNED — ledger `2026-09-05-handles-are-claimed`,
 * CLAUDE.md Locked Decision 40.
 *
 * WHY THIS EXISTS. The failure this lane fixes was INVISIBLE: `PATCH /api/me/handle` worked, the
 * claim card existed, nothing 500'd and nothing logged — and 0 of 12 public experts had a handle,
 * because no surface ever ASKED. A prompt that stops rendering fails exactly the same way: the
 * console looks fine and the funnel simply goes quiet again. So the pins are on the two halves a
 * regression must pass through — the pure suggestion, and the shipped mounts.
 *
 * What these hold:
 *   H1  the suggestion is a real handle SHAPE, by the server's own regex — never a value the
 *       claim route would refuse.
 *   H2  diacritics FOLD (José → jose), and separators collapse to single hyphens.
 *   H3  a name that yields nothing usable is `null`, and NOT a fabricated fallback (§13).
 *   H4  it NEVER appends digits — no `yuki-2`, no year, no counter.
 *   H5  the length cap is the server's, and a truncation never leaves a trailing hyphen.
 *   H6  a two-character name is `null` rather than padded up to the minimum.
 *   H7  `displayName` wins over the name parts when both are given; the parts are used otherwise.
 *   B1  the banner's predicate: earner + no handle ⇒ prompt; a claimed handle, a non-earner, and
 *       an UNANSWERED auth query ⇒ silence.
 *   S1  the banner mounts in `BackofficeShell` — the ONE shell both earner consoles render
 *       through — so both consoles carry it and there is one decision, not two.
 *   S2  both consoles do in fact render through that shell (the pin above means nothing if a
 *       console stops doing so).
 *   S3  the banner is gated on the predicate, not on something looser.
 *   S4  both wizards carry the step, prefilled from the ONE shared helper.
 *   S5  neither wizard calls the claim rail — an applicant is not yet an earner (403).
 *   S6  there is EXACTLY ONE client writer of `/api/me/handle`.
 *   S7  nothing restates the handle shape: the suggestion helper imports it.
 *
 * Pure unit + static reads: no DOM, no DB, no fetch.
 * Run: npx tsx --test client/src/lib/__tests__/handle-claim-prompt.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { suggestHandle } from "../../../../shared/handle-suggestion";
import { HANDLE_RE, HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from "../../../../shared/handle";
import { shouldPromptHandleClaim } from "../handle-claim-prompt";

const CLIENT_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_ROOT = join(CLIENT_SRC, "..", "..");
const read = (rel: string) => readFileSync(join(CLIENT_SRC, rel), "utf8");

describe("suggestHandle — a suggestion, never an assignment", () => {
  it("H1 suggests a shape the claim route would accept", () => {
    for (const source of [
      { firstName: "Yuki", lastName: "Tanaka" },
      { displayName: "Kyoto Photo Walks" },
      { firstName: "  Ana  ", lastName: "" },
    ]) {
      const suggested = suggestHandle(source);
      assert.ok(suggested, `expected a suggestion for ${JSON.stringify(source)}`);
      assert.ok(HANDLE_RE.test(suggested!), `${suggested} must satisfy the server's own HANDLE_RE`);
    }
    assert.equal(suggestHandle({ firstName: "Yuki", lastName: "Tanaka" }), "yuki-tanaka");
  });

  it("H2 folds diacritics and collapses every separator run to one hyphen", () => {
    assert.equal(suggestHandle({ displayName: "José Álvarez" }), "jose-alvarez");
    assert.equal(suggestHandle({ displayName: "Anna–Maria   O'Neill" }), "anna-maria-o-neill");
    assert.equal(suggestHandle({ displayName: "  --Kenji--  " }), "kenji");
  });

  it("H3 answers null rather than inventing one when the name yields nothing (§13)", () => {
    for (const source of [
      null,
      undefined,
      {},
      { displayName: "   " },
      { firstName: null, lastName: null },
      { displayName: "!!! ---" },
      // A script that folds away entirely: the honest answer is "we could not suggest one",
      // and the field is left EMPTY for the person to type their own.
      { displayName: "日本語" },
    ] as const) {
      assert.equal(suggestHandle(source as any), null, `${JSON.stringify(source)} must suggest nothing`);
    }
  });

  it("H4 never appends digits, a year or a counter to force a result", () => {
    const suggested = suggestHandle({ firstName: "Yuki", lastName: "Tanaka" });
    assert.equal(suggested, "yuki-tanaka");
    assert.ok(!/\d/.test(suggested!), "a suggestion carries no invented digits");
    // Digits that are part of the NAME are the person's own and survive.
    assert.equal(suggestHandle({ displayName: "Studio 54 Tours" }), "studio-54-tours");
  });

  it("H5 truncates at the server's cap and never leaves a trailing hyphen", () => {
    const long = suggestHandle({ displayName: "Alexandria Wentworth Fairweather Consulting" });
    assert.ok(long);
    assert.ok(long!.length <= HANDLE_MAX_LENGTH, "within the server's max");
    assert.ok(!long!.endsWith("-"), "a cut that lands on a separator is re-stripped");
    assert.ok(HANDLE_RE.test(long!));
    // The cut lands exactly on a hyphen here — the case that would otherwise produce `...-`.
    const onSeparator = suggestHandle({ displayName: "abcdefghij klmnopqrst uvwxyz abc" });
    assert.ok(onSeparator && !onSeparator.endsWith("-") && HANDLE_RE.test(onSeparator));
  });

  it("H6 refuses to pad a too-short name up to the minimum", () => {
    assert.equal(suggestHandle({ displayName: "Jo" }), null);
    assert.equal(HANDLE_MIN_LENGTH, 3, "the minimum comes from shared/handle.ts");
    assert.equal(suggestHandle({ displayName: "Ada" }), "ada");
  });

  it("H7 prefers displayName, falls back to the name parts", () => {
    assert.equal(
      suggestHandle({ displayName: "Kyoto Photo Walks", firstName: "Kenji", lastName: "Nakamura" }),
      "kyoto-photo-walks",
    );
    assert.equal(
      suggestHandle({ displayName: "   ", firstName: "Kenji", lastName: "Nakamura" }),
      "kenji-nakamura",
    );
  });
});

describe("shouldPromptHandleClaim — when the console asks", () => {
  it("B1 asks an earner with no handle, and nobody else", () => {
    assert.equal(shouldPromptHandleClaim({ role: "local_expert", handle: null }), true);
    assert.equal(shouldPromptHandleClaim({ role: "service_provider", handle: "" }), true);
    assert.equal(shouldPromptHandleClaim({ role: "expert", handle: "   " }), true);
    // Finished state — the prompt disappears for good.
    assert.equal(shouldPromptHandleClaim({ role: "expert", handle: "yuki" }), false);
    // Not an earner: an EA/admin/traveler has no storefront to name, and the rail would 403.
    assert.equal(shouldPromptHandleClaim({ role: "executive_assistant", handle: null }), false);
    assert.equal(shouldPromptHandleClaim({ role: "admin", handle: null }), false);
    assert.equal(shouldPromptHandleClaim({ role: "user", handle: null }), false);
    // §13: an unanswered auth query is not a user without a handle.
    assert.equal(shouldPromptHandleClaim(null), false);
    assert.equal(shouldPromptHandleClaim(undefined), false);
  });
});

describe("shipped wiring — the prompt is actually mounted", () => {
  it("S1 the banner mounts once, in the shell BOTH earner consoles render through", () => {
    const shell = read("components/backoffice/backoffice-shell.tsx");
    assert.ok(shell.includes("HandleClaimBanner"), "BackofficeShell imports the banner");
    assert.ok(/<HandleClaimBanner\s*\/>/.test(shell), "and renders it");
  });

  it("S2 both consoles render through that shell", () => {
    for (const rel of ["components/expert/expert-layout.tsx", "components/provider/provider-layout.tsx"]) {
      const src = read(rel);
      assert.ok(src.includes("BackofficeShell"), `${rel} must render through the shared shell`);
    }
  });

  it("S3 the banner is gated on handle == null via the one predicate", () => {
    const src = read("components/backoffice/handle-claim-banner.tsx");
    assert.ok(src.includes("shouldPromptHandleClaim(user)"), "renders through the predicate");
    const predicate = read("lib/handle-claim-prompt.ts");
    assert.ok(predicate.includes("isEarnerRole"), "earner roles come from shared/roles.ts");
    assert.ok(
      /data-testid="handle-claim-banner"/.test(src) &&
        /data-testid="handle-claim-input"/.test(src) &&
        /data-testid="handle-claim-submit"/.test(src),
      "the ratified testids are present",
    );
  });

  it("S4 both wizards carry the optional handle step, prefilled from the one helper", () => {
    for (const rel of ["pages/travel-experts.tsx", "pages/services-provider.tsx"]) {
      const src = read(rel);
      assert.ok(src.includes('title: "Your Handle"'), `${rel} lists the step`);
      assert.ok(src.includes('from "@shared/handle-suggestion"'), `${rel} reads the shared helper`);
      assert.ok(src.includes("handleFieldValue"), `${rel} prefills the field`);
      assert.ok(src.includes("savePendingHandle("), `${rel} HOLDS the answer instead of claiming it`);
      assert.ok(
        src.includes('data-testid="input-public-handle"'),
        `${rel} exposes the field`,
      );
    }
  });

  it("S5 neither wizard calls the claim rail — an applicant is not yet an earner (403)", () => {
    for (const rel of ["pages/travel-experts.tsx", "pages/services-provider.tsx"]) {
      const src = read(rel);
      // The quoted form is the CALL; the wizards name the route in a comment explaining why they
      // deliberately do not call it, and a prose mention is not a write.
      assert.ok(
        !src.includes('"/api/me/handle"'),
        `${rel} must not write the handle at application time`,
      );
      assert.ok(!src.includes("useClaimHandle"), `${rel} must not reach the claim mutation`);
    }
  });

  it("S6 there is EXACTLY ONE client writer of PATCH /api/me/handle", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules" || entry === "__tests__") continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        if (readFileSync(full, "utf8").includes('"/api/me/handle"')) hits.push(full);
      }
    };
    walk(CLIENT_SRC);
    assert.deepEqual(
      hits.map((h) => h.slice(CLIENT_SRC.length + 1)),
      ["hooks/use-claim-handle.ts"],
      "a second writer is the derivation-drift class §18 rule 1 names",
    );
  });

  it("S7 the suggestion restates no shape rule — it imports the server's", () => {
    const src = readFileSync(join(REPO_ROOT, "shared", "handle-suggestion.ts"), "utf8");
    assert.ok(/from "\.\/handle"/.test(src), "imports shared/handle.ts");
    assert.ok(!/\/\^\[a-z0-9\]/.test(src), "no second copy of HANDLE_RE");
    // The route reads the same bounds rather than re-typing 3/30.
    const route = readFileSync(join(REPO_ROOT, "server", "routes", "storefront.routes.ts"), "utf8");
    assert.ok(route.includes("HANDLE_MIN_LENGTH") && route.includes("HANDLE_MAX_LENGTH"));
  });
});
