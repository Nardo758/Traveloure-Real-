/**
 * OCCASION VOCABULARY — the table is the source, and the translations out of it are complete.
 * Ledger `2026-09-03-occasion-vocabulary`.
 *
 * What these hold:
 *   O1  EVERY slug the `experience_types` seeder writes has an explicit class. The seed file is
 *       read from disk and parsed, so adding a template without classing it FAILS HERE rather than
 *       silently falling through to a keyword sniff that was never asked about it. This is the
 *       proof that makes the explicit table worth having: a keyword list cannot be exhaustive by
 *       construction, a table checked against its source can.
 *   O2  every value the slug→eventType map produces is a real `eventTypeEnum` member — the trap the
 *       map exists for is writing a raw slug into `trips.event_type`, where the fee/optimizer
 *       branches read literals.
 *   O3  an unmapped slug resolves to "other" and NEVER to a nearer-looking member (§13), and a slug
 *       that IS already an enum member passes straight through.
 *       Extended by ledger `2026-09-03-occasion-switches`: the four occasions that ruling seeded
 *       (`romance`, `corporate`, `milestone-birthday`, `family-occasion`) are additionally named
 *       one by one, so a seeder regression that drops one cannot pass by leaving nothing to check.
 *   O4  the TWO anniversaries are different occasions and land in different classes —
 *       `anniversary-trip` (a couple's getaway) vs `wedding-anniversaries` (a party with guests).
 *       They were indistinguishable under the keyword sniff, and the nav item labelled just
 *       "Anniversary" is what that collision looked like on screen.
 *
 * Pure unit: no DB, no fetch, no React. The only I/O is reading the seed file as TEXT.
 * Run: npx tsx --test shared/__tests__/occasions.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { eventTypeEnum } from "../schema";
import {
  OCCASION_CLASS_BY_SLUG,
  OCCASION_SLUG_TO_EVENT_TYPE,
  classifyOccasion,
  eventTypeForSlug,
} from "../occasions";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(HERE, "../../server/seeds/experience-template-tabs.seed.ts");

/**
 * The slugs the seeder actually writes, read from its `templates` array. Parsed from the file
 * TEXT rather than imported, because importing the seed module pulls in the DB client — and the
 * point of this proof is that the two lists agree, not that the seeder runs.
 */
function seededSlugs(): string[] {
  const src = readFileSync(SEED, "utf8");
  const start = src.indexOf("const templates: Array<{");
  assert.ok(start > -1, "the seeder's `templates` array must still be findable — update this parser");
  const open = src.indexOf("}> = [", start);
  const end = src.indexOf("\n  ];", open);
  assert.ok(open > -1 && end > open, "the seeder's `templates` array literal must still be findable");
  const block = src.slice(open, end);
  const slugs = [...block.matchAll(/\{\s*slug:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(slugs.length >= 20, `expected the full seeded template set, parsed ${slugs.length}`);
  return slugs;
}

describe("occasion vocabulary", () => {
  // O1 — the explicit table covers the ONE runtime vocabulary, exactly.
  it("O1: every seeded template slug has an explicit occasion class", () => {
    const slugs = seededSlugs();
    for (const slug of slugs) {
      assert.ok(
        OCCASION_CLASS_BY_SLUG[slug],
        `seeded slug "${slug}" has no entry in OCCASION_CLASS_BY_SLUG — class it explicitly`,
      );
    }
    // The four seeded by ledger `2026-09-03-occasion-switches`, named explicitly: the loop above
    // is only as strong as the seed file it parses, so a row silently dropped from the seeder
    // would make this test pass by having nothing left to check.
    for (const slug of ["romance", "corporate", "milestone-birthday", "family-occasion"]) {
      assert.ok(slugs.includes(slug), `"${slug}" must still be seeded — a shipped surface links to it`);
      assert.ok(OCCASION_CLASS_BY_SLUG[slug], `"${slug}" has no explicit occasion class`);
    }
    // …and nothing extra: an entry for a slug the seeder no longer writes is stale vocabulary.
    for (const slug of Object.keys(OCCASION_CLASS_BY_SLUG)) {
      assert.ok(
        slugs.includes(slug),
        `OCCASION_CLASS_BY_SLUG names "${slug}", which the seeder does not write — remove it or seed it`,
      );
    }
  });

  // O2 — the map can only ever produce a real trips.event_type value.
  it("O2: every mapped eventType is a member of eventTypeEnum", () => {
    for (const [slug, eventType] of Object.entries(OCCASION_SLUG_TO_EVENT_TYPE)) {
      assert.ok(
        (eventTypeEnum as readonly string[]).includes(eventType),
        `"${slug}" maps to "${eventType}", which is not an eventTypeEnum member`,
      );
    }
    for (const slug of Object.keys(OCCASION_CLASS_BY_SLUG)) {
      assert.ok(
        (eventTypeEnum as readonly string[]).includes(eventTypeForSlug(slug)),
        `eventTypeForSlug("${slug}") escaped eventTypeEnum`,
      );
    }
  });

  // O3 — honest fallback, and pass-through for slugs that are already enum members.
  it("O3: an unmapped slug is \"other\", and an enum-member slug passes through", () => {
    for (const slug of ["boys-trip", "baby-shower", "sports-event", "not-a-real-occasion", ""]) {
      assert.equal(eventTypeForSlug(slug), "other", `"${slug}" must fall back to "other"`);
    }
    assert.equal(eventTypeForSlug("wedding"), "wedding");
    assert.equal(eventTypeForSlug("proposal"), "proposal");
    assert.equal(eventTypeForSlug("birthday"), "birthday");
    // The explicit entries, spelled out — these are the ones a fee/optimizer branch reads.
    assert.equal(eventTypeForSlug("corporate-events"), "corporate");
    assert.equal(eventTypeForSlug("wedding-anniversaries"), "anniversary");
    assert.equal(eventTypeForSlug("travel"), "vacation");
    // Display names resolve too — a caller holding only `experienceType.name` gets the same answer.
    assert.equal(eventTypeForSlug("Corporate Events"), "corporate");
  });

  // O4 — the collision this lane was opened for.
  it("O4: the two anniversaries are different occasions in different classes", () => {
    assert.notEqual(
      OCCASION_CLASS_BY_SLUG["anniversary-trip"],
      OCCASION_CLASS_BY_SLUG["wedding-anniversaries"],
      "anniversary-trip and wedding-anniversaries are two products and must not share a class",
    );
    assert.equal(classifyOccasion("anniversary-trip"), "couple");
    assert.equal(classifyOccasion("wedding-anniversaries"), "event");
    // …and by display name, which is what the Trip Strip actually holds.
    assert.equal(classifyOccasion("Anniversary Trip"), "couple");
    assert.equal(classifyOccasion("Wedding Anniversaries"), "event");
  });
});
