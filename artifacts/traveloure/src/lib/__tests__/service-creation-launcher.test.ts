/**
 * S5 — the one-door creation launcher (ruling 74 disp. 1, executed).
 *
 * Static source-grep unit tests — no browser, no DB (mirrors footer-route-coverage.test.ts's
 * "read the source, assert the shape" pattern).
 *
 * What this pins:
 *   1. The Workstation ("What are you building?") renders the three primary tiles — single
 *      service, bundle, property — AND the category inspiration tiles that used to live on
 *      Catalog's empty state.
 *   2. Every "Add New Service" affordance on Catalog (header button + first-time empty state)
 *      routes to the Workstation launcher, NOT straight into ServiceForm step 1.
 *   3. The ONE permitted direct deep link into ServiceForm step 1 is the launcher's own
 *      "Single service" tile — this asserts it still exists, so the create route itself stays
 *      reachable (existing bookmarks keep working).
 *
 * Run: npx tsx --test client/src/lib/__tests__/service-creation-launcher.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const workstationSrc = readFileSync(
  resolve(__dirname, "../../pages/provider/workstation.tsx"),
  "utf-8"
);
const catalogSrc = readFileSync(
  resolve(__dirname, "../../pages/provider/services.tsx"),
  "utf-8"
);

describe("S5 launcher — Workstation renders the three primary tiles", () => {
  it("has a single-service, bundle, and property tile", () => {
    for (const testid of ["card-ladder-service", "card-ladder-bundle", "card-ladder-property"]) {
      assert.match(
        workstationSrc,
        new RegExp(`data-testid="${testid}"`),
        `Workstation is missing the "${testid}" launcher tile`
      );
    }
  });

  it("the single-service tile is the ONE permitted direct deep link into ServiceForm step 1", () => {
    assert.match(
      workstationSrc,
      /<Link href="\/provider\/services\/new">/,
      "the launcher's own Single service tile must still link straight into the create route"
    );
  });

  it("the bundle and property tiles open their existing dialogs, not a raw form link", () => {
    assert.match(workstationSrc, /button-ladder-new-bundle/);
    assert.match(workstationSrc, /button-ladder-new-property/);
  });
});

describe("S5 launcher — category inspiration tiles moved to the Workstation", () => {
  it("Workstation renders the category grid, jumping into single-service create with ?category=", () => {
    assert.match(workstationSrc, /data-testid="grid-workstation-categories"/);
    assert.match(
      workstationSrc,
      /href={`\/provider\/services\/new\?category=\$\{encodeURIComponent\(card\.slug\)\}`}/,
      "each category tile must deep-link into single-service create with the category pre-selected"
    );
  });

  it("Catalog no longer owns the category inspiration tiles", () => {
    assert.doesNotMatch(
      catalogSrc,
      /const inspirationCards\s*=/,
      "inspirationCards must not be re-declared on Catalog — it lives on the Workstation now"
    );
    assert.doesNotMatch(
      catalogSrc,
      /data-testid=\{`card-inspiration-/,
      "Catalog's empty state must not render category tiles directly anymore"
    );
  });
});

describe("S5 launcher — every Catalog create entry point routes through the Workstation", () => {
  it("the Catalog header 'Add New Service' button points at the launcher, not the form", () => {
    const headerButtonBlock = catalogSrc.slice(
      catalogSrc.indexOf('data-testid="button-add-service"') - 200,
      catalogSrc.indexOf('data-testid="button-add-service"') + 50
    );
    assert.match(
      headerButtonBlock,
      /<Link href="\/provider\/workstation">/,
      "Catalog header 'Add New Service' must route to /provider/workstation"
    );
    assert.doesNotMatch(
      headerButtonBlock,
      /<Link href="\/provider\/services\/new">/,
      "Catalog header 'Add New Service' must NOT deep-link straight into ServiceForm"
    );
  });

  it("the Catalog first-time empty state points at the launcher, not the form", () => {
    const emptyStateButtonBlock = catalogSrc.slice(
      catalogSrc.indexOf('data-testid="button-add-first-service"') - 200,
      catalogSrc.indexOf('data-testid="button-add-first-service"') + 50
    );
    assert.match(
      emptyStateButtonBlock,
      /<Link href="\/provider\/workstation">/,
      "Catalog empty state's create button must route to /provider/workstation"
    );
  });

  it("Catalog no longer has a raw services/new deep link outside the (retired) navigate helper", () => {
    const rawDeepLinks = catalogSrc.match(/<Link href="\/provider\/services\/new">/g) ?? [];
    assert.equal(
      rawDeepLinks.length,
      0,
      "Catalog must have zero direct <Link> deep links into ServiceForm step 1 — the launcher is the one door"
    );
  });
});
