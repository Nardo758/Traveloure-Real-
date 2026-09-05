/**
 * OCCASION SWITCHES — every seeded occasion states all six, and the values are real.
 * Ledger `2026-09-03-occasion-switches`; migration 276; CLAUDE.md Locked Decision 28.
 *
 * WHY THIS EXISTS. The six switch columns are deliberately NULLABLE with **no DB CHECK** — a CHECK
 * over a column production rows can violate fails the Replit deploy push mid-push and offers the
 * destructive "copy dev database over production" option (CLAUDE.md publish-trap note; migrations
 * 181/195/273 precedent). That trade buys publish safety and costs the database's ability to
 * refuse a bad value, so the value sets are APP-enforced — and this file is where "app-enforced"
 * stops being a claim. Without it, a typo (`"days"`, `"attendee"`, `"visible"`) would seed
 * silently and the flow would read it as a value it has no branch for.
 *
 * What these hold:
 *   S1  EVERY row in the seeder's `templates` array states all six switches, and each value is a
 *       member of its allowed set. NULL in the DB legitimately means "not decided" (§13) — but the
 *       seeder is the one author of these values, so a row IT writes must never be undecided.
 *   S2  `proposal` is the ONLY occasion with `visibility: "hidden"`. Hidden suppresses the Guests
 *       page, Share and every invite link, so a second row acquiring it by copy-paste would
 *       silently delete those surfaces for an occasion that needs them.
 *   S3  the occasions the seeding ledger rows added are present — `romance` and `corporate` are the
 *       targets of two nav items that linked to template-less pages, and `milestone-birthday` /
 *       `family-occasion` are the two landing Moments that had no occasion to seed. `honeymoon`
 *       joined them by ledger `2026-09-03-occasion-hygiene` — a word five vocabularies already
 *       knew and the ONE runtime catalog did not.
 *   S4  the honeymoon's ratified switch shape, named value by value.
 *
 * Pure unit: no DB, no fetch, no React, and the seed is NEVER executed. The only I/O is reading
 * the seed file as TEXT — the same technique `occasions.test.ts` O1 uses, and for the same reason:
 * importing the seed module pulls in the DB client, and the point of the proof is that the file's
 * own literal is correct, not that the seeder can run.
 *
 * Run: npx tsx --test shared/__tests__/experience-type-switches.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { experienceTypeSwitchesSchema } from "../schema";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(HERE, "../../server/seeds/experience-template-tabs.seed.ts");

const ALLOWED = {
  stops: ["one", "many"],
  duration: ["day", "range"],
  schedule: ["true", "false"],
  guests: ["true", "false"],
  vocabulary: ["travelers", "guests", "attendees"],
  visibility: ["shown", "hidden"],
} as const;

type ParsedRow = { slug: string; switches: Record<string, string> };

/** The `{ slug, …, switches: { … } }` entries of the seeder's `templates` array, read as text. */
function seededRows(): ParsedRow[] {
  const src = readFileSync(SEED, "utf8");
  const start = src.indexOf("const templates: Array<{");
  assert.ok(start > -1, "the seeder's `templates` array must still be findable — update this parser");
  const open = src.indexOf("}> = [", start);
  const end = src.indexOf("\n  ];", open);
  assert.ok(open > -1 && end > open, "the seeder's `templates` array literal must still be findable");
  const block = src.slice(open, end);

  const rows: ParsedRow[] = [];
  // One entry = a slug followed by the nearest `switches: { … }`. Non-greedy, so an entry that
  // LOST its switches block would swallow the next entry's and change the slug count — which S1's
  // count assertion then fails on, rather than passing by silently skipping the broken row.
  for (const m of block.matchAll(/slug:\s*"([^"]+)"[\s\S]*?switches:\s*\{([^}]*)\}/g)) {
    const [, slug, body] = m;
    const switches: Record<string, string> = {};
    for (const kv of body.matchAll(/(\w+):\s*("([^"]*)"|true|false)/g)) {
      switches[kv[1]] = kv[3] ?? kv[2];
    }
    rows.push({ slug, switches });
  }
  return rows;
}

/** The slugs the seeder writes at all — the same parse `occasions.test.ts` O1 performs. */
function seededSlugs(): string[] {
  const src = readFileSync(SEED, "utf8");
  const open = src.indexOf("}> = [", src.indexOf("const templates: Array<{"));
  const block = src.slice(open, src.indexOf("\n  ];", open));
  return [...block.matchAll(/\{\s*slug:\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("occasion switches", () => {
  // S1 — the seeder decides all six for every row it writes, and every value is real.
  it("S1: every seeded occasion states all six switches with in-set values", () => {
    const rows = seededRows();
    const slugs = seededSlugs();
    assert.equal(
      rows.length,
      slugs.length,
      `${slugs.length} templates are seeded but only ${rows.length} carry a \`switches\` block — ` +
        "every row must state all six (the nullable columns exist for rows nobody has decided, " +
        "not for rows the seeder forgot)",
    );
    assert.ok(rows.length >= 27, `expected the full seeded template set, parsed ${rows.length}`);

    for (const { slug, switches } of rows) {
      for (const [key, allowed] of Object.entries(ALLOWED)) {
        assert.ok(
          key in switches,
          `"${slug}" is missing the \`${key}\` switch — state it explicitly`,
        );
        assert.ok(
          (allowed as readonly string[]).includes(switches[key]),
          `"${slug}".${key} = "${switches[key]}" is not one of ${allowed.join(" | ")}`,
        );
      }
    }
  });

  // S1b — the same value sets, checked through the shipped allowlist schema rather than a copy of
  // it. A drift between this test's ALLOWED table and `experienceTypeSwitchesSchema` is exactly
  // the derivation-drift the platform's §18 rule 1 names, so both are exercised on every row.
  it("S1b: every seeded row parses through experienceTypeSwitchesSchema", () => {
    for (const { slug, switches } of seededRows()) {
      const parsed = experienceTypeSwitchesSchema.safeParse({
        defaultStops: switches.stops,
        defaultDuration: switches.duration,
        defaultSchedule: switches.schedule === "true",
        defaultGuests: switches.guests === "true",
        vocabulary: switches.vocabulary,
        defaultVisibility: switches.visibility,
      });
      assert.ok(parsed.success, `"${slug}" fails the allowlist schema: ${JSON.stringify(parsed)}`);
    }
    // …and the schema actually refuses a wrong value — a validator that accepts everything would
    // make the assertion above vacuous.
    assert.equal(experienceTypeSwitchesSchema.safeParse({ defaultDuration: "days" }).success, false);
    assert.equal(experienceTypeSwitchesSchema.safeParse({ vocabulary: "attendee" }).success, false);
    assert.equal(experienceTypeSwitchesSchema.safeParse({ defaultVisibility: "visible" }).success, false);
  });

  // S2 — hidden deletes real surfaces; exactly one occasion is allowed to do that.
  it("S2: proposal is the only hidden occasion", () => {
    const hidden = seededRows()
      .filter((r) => r.switches.visibility === "hidden")
      .map((r) => r.slug);
    assert.deepEqual(
      hidden,
      ["proposal"],
      "`hidden` suppresses the Guests page, Share and invite links — only the proposal, where the " +
        `surprise is the product, may set it. Found: ${hidden.join(", ") || "none"}`,
    );
  });

  // S3 — the rows the seeding ledger rows exist to add.
  it("S3: the newly seeded occasions exist", () => {
    const slugs = seededSlugs();
    for (const slug of [
      "romance",
      "corporate",
      "milestone-birthday",
      "family-occasion",
      "honeymoon",
      "golf-trip",
    ]) {
      assert.ok(slugs.includes(slug), `"${slug}" must be seeded — a surface already links to it`);
    }
  });

  // S4 — the honeymoon's ratified switch shape, spelled out (ledger `2026-09-03-occasion-hygiene`).
  // It is the whole reason the row exists rather than the word continuing to resolve to `travel`:
  // many stops over a date RANGE, and NEITHER an internal schedule NOR a guest list. A copy-paste
  // from a celebration row would turn a honeymoon into an event with an invite list.
  it("S4: honeymoon is a multi-stop, multi-day couple's trip with no schedule and no guest list", () => {
    const row = seededRows().find((r) => r.slug === "honeymoon");
    assert.ok(row, "`honeymoon` must be seeded");
    assert.deepEqual(row!.switches, {
      stops: "many",
      duration: "range",
      schedule: "false",
      guests: "false",
      vocabulary: "travelers",
      visibility: "shown",
    });
  });

  // S5 — the golf trip's ratified switch shape (ledger `2026-09-04-golf-occasion-and-housekeeping`).
  // `schedule: true` is the WHOLE point of the row: golf resolved to `travel` (`schedule: false`),
  // so `showsSchedule()` answered false and the tee-times step the artboard draws could never
  // render. `guests: false` matters just as much — a golf trip is a group of travelers, and
  // copy-pasting a celebration row's switches would hang an invite list off it.
  it("S5: golf-trip is a multi-stop, multi-day trip WITH a schedule and no guest list", () => {
    const row = seededRows().find((r) => r.slug === "golf-trip");
    assert.ok(row, "`golf-trip` must be seeded");
    assert.deepEqual(row!.switches, {
      stops: "many",
      duration: "range",
      schedule: "true",
      guests: "false",
      vocabulary: "travelers",
      visibility: "shown",
    });
  });

  // S6 — the two rows the post-build re-audit found disagreeing with the ratified
  // `OccasionRow.dc.html` board (ledger `2026-09-04-reaudit-fixes`, items A24 and A25). Both are
  // ONE column each, and both are the kind of divergence nothing else can catch: a wrong switch
  // still renders a working modal, just one asking the wrong question. Pinned by value, because
  // the seeder is the one author and a hand-edit here is exactly how they drifted.
  it("S6a: girls-trip speaks GUESTS — the vocabulary agrees with its own guest-list switch", () => {
    const row = seededRows().find((r) => r.slug === "girls-trip");
    assert.ok(row, "`girls-trip` must be seeded");
    assert.equal(
      row!.switches.guests,
      "true",
      "the row has a guest list; that half was never in dispute",
    );
    assert.equal(
      row!.switches.vocabulary,
      "guests",
      "`travelers` beside `guests: true` is the pair disagreeing with itself — step 4 asked " +
        '"Who is traveling with you?" for an occasion whose shape is people being invited',
    );
  });

  it("S6b: corporate-events lasts a DAY — the retreat is the multi-day product", () => {
    const row = seededRows().find((r) => r.slug === "corporate-events");
    assert.ok(row, "`corporate-events` must be seeded");
    assert.equal(
      row!.switches.duration,
      "day",
      "a corporate EVENT is a run of show inside one day; `range` made it indistinguishable in " +
        "the flow from the separate `corporate` (Corporate Retreats) row",
    );
    // …and that separate row is still the range-shaped one, so the two really are distinct.
    const retreat = seededRows().find((r) => r.slug === "corporate");
    assert.ok(retreat, "`corporate` (Corporate Retreats) must be seeded");
    assert.equal(retreat!.switches.duration, "range");
  });
});

/**
 * HERO CONFIG — the P4 block (`updateExperienceTypeHeroConfigs`) is the seeder's OTHER per-slug
 * UPDATE half, and it is a SEPARATE literal from the `templates` array above. QA F11: `golf-trip`
 * was added to `templates` (ledger `2026-09-04-golf-occasion-and-housekeeping`) and never to the
 * hero `configs` map, so `GET /api/experience-types` reported `headcountLabel: null,
 * locationLabel: null` for it while every other active occasion defined both.
 *
 * That failure is silent by construction: NULL is a legal, HONEST state of those columns (§13 —
 * not set ⇒ the reader falls back or omits, it never invents), so nothing throws and no guard
 * fires. The only thing that can catch "the seeder wrote the row but forgot to answer for it" is
 * a proof that the two literals cover the same slugs.
 *
 * NEGATIVE SPACE (§18d): this reads the seed file as TEXT and proves COVERAGE and value shape.
 * It does not run the seeder, does not touch a DB, and says nothing about whether a row already on
 * disk has been updated — the seeder's stale-only UPDATE is what does that.
 */

/** The `configs` map of `updateExperienceTypeHeroConfigs`, read as text. */
function heroConfigs(): Array<{ slug: string; body: string }> {
  const src = readFileSync(SEED, "utf8");
  const start = src.indexOf("const configs: Record<string, HeroConfig> = {");
  assert.ok(start > -1, "the hero `configs` map must still be findable — update this parser");
  const open = src.indexOf("{", src.indexOf("=", start));
  const end = src.indexOf("\n  };", open);
  assert.ok(end > open, "the hero `configs` map literal must still be findable");
  const block = src.slice(open, end);

  const rows: Array<{ slug: string; body: string }> = [];
  // A key followed by its object body up to the next top-level key (or the end of the block).
  // Non-greedy on the body so a row that lost its object cannot swallow its neighbour.
  for (const m of block.matchAll(/^    "([^"]+)":\s*\{([\s\S]*?)^    \},$/gm)) {
    rows.push({ slug: m[1], body: m[2] });
  }
  return rows;
}

describe("occasion hero configs (P4 block)", () => {
  // H1 — the coverage proof. Every occasion the seeder writes also gets its hero answers.
  it("H1: every seeded occasion has a hero config", () => {
    const configured = new Set(heroConfigs().map((r) => r.slug));
    assert.ok(configured.size >= 27, `expected the full hero config map, parsed ${configured.size}`);
    const missing = seededSlugs().filter((s) => !configured.has(s));
    assert.deepEqual(
      missing,
      [],
      "these occasions are seeded into `templates` but have no entry in the P4 hero `configs` " +
        "map, so their headcountLabel/showKids/showOriginCity/locationLabel stay NULL while every " +
        `other occasion answers: ${missing.join(", ")}`,
    );
  });

  // H1b — and the other direction: a config keyed on a slug nothing seeds applies to no row at
  // all. That already happened once ("corporate-retreats", fixed by `2026-09-03-occasion-switches`),
  // and the seeder's own UPDATE swallows it silently ("Row may not exist yet in this environment").
  it("H1b: every hero config names a slug the seeder actually writes", () => {
    // ONE key is tolerated, named rather than silently allowed. `birthday-party` is keyed on a
    // slug no code path creates (the seeded celebration row is `birthday`), so it already updates
    // nothing — it is the same shape as the `corporate-retreats` orphan, found by this proof and
    // NOT removed here: the seeder also maintains rows added directly to the DB, and this lane
    // cannot check production for a hand-made `birthday-party` row. Recorded, not fixed; a NEW
    // orphan still fails.
    const KNOWN_ORPHANS = ["birthday-party"];
    const seeded = new Set(seededSlugs());
    const orphans = heroConfigs()
      .map((r) => r.slug)
      .filter((s) => !seeded.has(s) && !KNOWN_ORPHANS.includes(s));
    assert.deepEqual(
      orphans,
      [],
      `hero configs keyed on slugs no template seeds — they update nothing: ${orphans.join(", ")}`,
    );
  });

  // H2 — every config answers all four columns. A partially-answered row is the same silent NULL
  // as an absent one, one column at a time.
  it("H2: every hero config states all four columns", () => {
    for (const { slug, body } of heroConfigs()) {
      for (const key of ["headcountLabel", "showKids", "showOriginCity", "locationLabel"]) {
        assert.ok(new RegExp(`\\b${key}:`).test(body), `"${slug}" is missing \`${key}\``);
      }
    }
  });

  // H3 — QA F11's row, pinned by value. `travel`'s answers minus kids: the `templates` entry's own
  // comment says a golf trip is "a group of travelers, not an invited event", and it reuses
  // `travel`'s tabs and filters wholesale, so no new vocabulary is authored for it.
  it("H3: golf-trip answers with the travel shape, minus kids", () => {
    const row = heroConfigs().find((r) => r.slug === "golf-trip");
    assert.ok(row, "`golf-trip` must have a hero config (QA F11)");
    assert.match(row!.body, /headcountLabel:\s*"traveler"/);
    assert.match(row!.body, /locationLabel:\s*"Destination city"/);
    assert.match(row!.body, /showKids:\s*false/);
    assert.match(row!.body, /showOriginCity:\s*"required"/);
  });
});
