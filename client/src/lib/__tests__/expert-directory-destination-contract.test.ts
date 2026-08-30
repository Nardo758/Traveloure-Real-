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
    assert.match(
      expertsPageSource,
      /const filteredExperts = apiExperts\.filter/,
      "the page must filter the destination-scoped API results",
    );
    assert.match(
      expertsPageSource,
      /const query = searchQuery\.toLowerCase\(\)/,
      "the independent What input must remain the client text-filter source",
    );
    assert.match(
      expertsPageSource,
      /searchQuery === "" \|\|/,
      "an empty What input must preserve all destination-scoped API results",
    );
  });
});