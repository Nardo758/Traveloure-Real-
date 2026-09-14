/**
 * Regression contract for URL-driven destination handoffs on /experts.
 *
 * The directory has two independent fields:
 * - What: free-text search (`searchQuery`)
 * - Where: destination scoping (`selectedDestination`)
 *
 * A destination URL parameter must only hydrate Where. The API then returns the
 * destination-scoped experts, and any user-entered What text filters within that
 * result set.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { expertSearchMatches } from "../expert-search.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const expertsPageSource = readFileSync(
  resolve(__dirname, "../../pages/experts.tsx"),
  "utf8",
);

describe("expert directory destination handoff", () => {
  it("hydrates the Where selector without copying destination into What", () => {
    const destinationBranch = expertsPageSource.match(
      /if \(destParam\) \{([\s\S]*?)\n\s*\}/,
    )?.[1];

    assert.ok(destinationBranch, "Expected a destination URL-parameter branch");
    assert.match(
      destinationBranch,
      /setSelectedDestination\(match\)/,
      "destination must populate the Where selector",
    );
    assert.doesNotMatch(
      destinationBranch,
      /setSearchQuery\(/,
      "destination must not populate the free-text What input",
    );
  });

  it("keeps free-text filtering independent within the API-scoped result set", () => {
    // The page still filters the destination-scoped API response — that half of
    // the contract is a property of experts.tsx and stays a source pin.
    assert.match(
      expertsPageSource,
      /const filteredExperts = apiExperts\.filter/,
      "the page must filter the destination-scoped API results",
    );
    // The text-filter itself moved out of this page into the shared
    // `expertSearchMatches` matcher (client/src/lib/expert-search.ts), so the
    // remaining two pins are asserted against the matcher's BEHAVIOUR rather
    // than against the inline expression they used to be written on. The
    // invariant is unchanged: What is the only thing this filter reads, and an
    // empty What removes nothing the API returned.
    assert.match(
      expertsPageSource,
      /expertSearchMatches\(expert, searchQuery\)/,
      "the independent What input must remain the client text-filter source",
    );

    const scoped = [
      { firstName: "Raj", lastName: "Patel", expertForm: { city: "Mumbai" } },
      { firstName: "Aiko", lastName: "Sato", expertForm: { city: "Osaka" } },
      {},
    ];
    for (const expert of scoped) {
      assert.equal(
        expertSearchMatches(expert, ""),
        true,
        "an empty What input must preserve all destination-scoped API results",
      );
    }

    // …and a non-empty What narrows within that set rather than re-querying it.
    assert.equal(expertSearchMatches(scoped[0], "raj"), true);
    assert.equal(expertSearchMatches(scoped[1], "raj"), false);
  });
});