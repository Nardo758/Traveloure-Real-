/**
 * Row 259: the traveler-facing expert note is the `expert_note` column and nothing else.
 * Run: npx tsx --test shared/__tests__/delivered-expert-note.test.ts
 *
 * No git, no execSync, no execFileSync, no comparison to origin/main or any other ref.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deliveredExpertNote } from "../delivered-expert-note";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

type Item = Parameters<typeof deliveredExpertNote>[0];

const EXPERT_NOTES = ["EXPERT-TEXT", "", null, undefined] as const;
const NOTES_VALUES = ["NOTES-TEXT: Added from Kyoto", "NOTES-TEXT: Source: Viator", null, undefined] as const;
const ORIGINS = ["expert", "traveler", "ai", "assistant", null, undefined] as const;

function deliver(
  expertNote: (typeof EXPERT_NOTES)[number],
  notes: (typeof NOTES_VALUES)[number] | "Added from Kyoto" | "Source: Viator" | "Billboard gem id: g-1",
  origin?: (typeof ORIGINS)[number],
): string | null {
  const item = { expertNote, notes, origin } as unknown as Item;
  return deliveredExpertNote(item);
}

function expectedFromColumn(expertNote: (typeof EXPERT_NOTES)[number] | string | null | undefined): string | null {
  return expertNote === "EXPERT-TEXT" ? "EXPERT-TEXT" : null;
}

for (const expertNote of EXPERT_NOTES) {
  for (const notes of NOTES_VALUES) {
    test(`EN1 · expertNote=${JSON.stringify(expertNote)} notes=${JSON.stringify(notes)} · six origins, notes ignored`, () => {
      const results = ORIGINS.map((origin) => {
        const result = deliver(expertNote, notes, origin);
        assert.equal(
          result,
          expectedFromColumn(expertNote),
          `origin ${JSON.stringify(origin)} must follow expertNote only`,
        );
        if (typeof notes === "string") {
          assert.notEqual(result, notes, "result must not equal notes text");
          assert.equal(
            result == null || !result.includes(notes),
            true,
            "result must not contain notes text",
          );
        }
        return result;
      });
      assert.equal(new Set(results).size, 1, "the six origins give one distinct result");
    });
  }
}

test("EN2a · production repro: a traveler add with notes and no expert_note is not an expert note", () => {
  const item = { expertNote: null, notes: "Added from Kyoto", origin: "traveler" } as unknown as Item;
  assert.equal(
    deliveredExpertNote(item),
    null,
    'a traveler add whose notes are "Added from Kyoto" and whose expert_note is null delivers no expert note',
  );
});

test("EN2b · Source: Viator in notes is not an expert note", () => {
  const item = { expertNote: null, notes: "Source: Viator", origin: "traveler" } as unknown as Item;
  assert.equal(
    deliveredExpertNote(item),
    null,
    'notes "Source: Viator" on a traveler-origin row with a null expert_note delivers no expert note',
  );
});

test("EN2c · an expert-origin row returns the expert-typed note, not the notes text", () => {
  const item = {
    expertNote: "Ask for the courtyard table",
    notes: "Added from Kyoto",
    origin: "expert",
  } as unknown as Item;
  assert.equal(
    deliveredExpertNote(item),
    "Ask for the courtyard table",
    "an expert-origin row with an expert-typed note delivers that note, not the notes text",
  );
});

test("EN2d · an ai-origin row with expert_note set returns that column", () => {
  const item = {
    expertNote: "Advisor edited this",
    notes: "Source: Viator",
    origin: "ai",
  } as unknown as Item;
  assert.equal(
    deliveredExpertNote(item),
    "Advisor edited this",
    "attribution follows expert_note when an advisor has edited an ai-origin row",
  );
});

test("EN2e · a traveler-origin row with expert_note set returns it", () => {
  const item = {
    expertNote: "Written on a traveler row",
    notes: "Added from Kyoto",
    origin: "traveler",
  } as unknown as Item;
  assert.equal(
    deliveredExpertNote(item),
    "Written on a traveler row",
    "a traveler-origin row delivers expert_note when the column is set",
  );
});

test("EN2f · the Billboard gem sentinel in notes is not an expert note", () => {
  const item = { notes: "Billboard gem id: g-1", expertNote: null } as unknown as Item;
  assert.equal(
    deliveredExpertNote(item),
    null,
    'notes "Billboard gem id: g-1" with a null expert_note delivers no expert note',
  );
});

test("EN3 · the plan assembler calls the helper and no longer falls back to item.notes", () => {
  const src = read("server/services/trip-plan.service.ts");
  assert.ok(
    src.includes("expertNote: deliveredExpertNote(item),"),
    "buildActivity must set expertNote from deliveredExpertNote(item)",
  );
  assert.equal(
    /expertNote:[^\n]*\bitem\.notes\b/.test(src),
    false,
    "no expertNote assignment may read item.notes",
  );
  assert.match(
    src,
    /import \{ deliveredExpertNote \} from "@shared\/delivered-expert-note";/,
    "the service must import deliveredExpertNote from @shared/delivered-expert-note",
  );
});

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

test("EN4 · the helper has no notes, no origin, and no import outside comments", () => {
  const code = codeOnly(read("shared/delivered-expert-note.ts"));
  assert.equal(code.includes("notes"), false, "no notes outside comments");
  assert.equal(code.includes("origin"), false, "no origin outside comments");
  assert.equal(/\bimport\b/.test(code), false, "no import");
});

test("EN5 · the plan contract no longer documents a fallback to notes", () => {
  const src = read("shared/trip-plan.ts");
  assert.equal(src.includes("legacy fallback to `notes`"), false);
});
