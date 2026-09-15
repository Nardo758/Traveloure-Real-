/**
 * EVERY DRIFT KIND THE JOB EMITS HAS A HUMAN SENTENCE, AND AN UNKNOWN ONE IS PRINTED, NEVER
 * GUESSED — a pure pin over `shared/reconciliation-kinds.ts` and the one surface that renders it.
 * Punchlist **V-28**; ledger `2026-09-15-v27-v28-privacy-kind-labels`; CLAUDE.md **§13**,
 * **§17**, **§18 rule 1**, **§18d**.
 *
 * WHAT WENT WRONG, AND WHY A TEST IS THE LAYER. `/admin/reconciliation` kept a HAND-WRITTEN
 * `KIND_LABELS` map and `server/services/email.service.ts` kept a second one whose comment said it
 * "mirrors" the first. The §17 job emits seventeen kinds; both maps named ten. The six `rm_*`
 * ready-made kinds (V-3's rail, ledger `2026-09-12-readymade-reconciliation-rail`, plus D-18's
 * `rm_delivery_not_announced`) and D-11's `trip_booking_without_item` therefore rendered as a raw
 * identifier — printed twice on the page, since the row already shows the kind underneath — with
 * the sentence saying what drifted simply absent, for the operator deciding whether money moved.
 * Nothing tied a map to the vocabulary, so it fell behind on every kind the job grew; two lanes
 * landed detection without landing a label.
 *
 * TWO LAYERS, AND THE FIRST IS THE COMPILER. `RECONCILIATION_KIND_LABELS` is typed
 * `Record<ReconciliationExceptionKind, string>`, so a kind added without a label does not compile.
 * This file is the runtime layer over the same pairing, and it asserts the direction a type cannot:
 * that a label is not merely the identifier spelled back, and that the FALLBACK is the raw kind.
 *
 * STATED NEGATIVE SPACE (§18d — green is green-within-stated-bounds).
 *   • It does NOT prove the job emits exactly these kinds. The job assigns
 *     `ReconciliationExceptionKind`-typed values (`stripeReconciliation.ts`), so tsc is that layer.
 *     A kind the job invents as a bare string would be invisible here — and would render as itself.
 *   • It does NOT judge WORDING. It asserts a label exists, is non-empty, and is not the enum name;
 *     whether the sentence is the best one is a human's call.
 *   • It says nothing about severity, rail, dedupe keys or any other column the job writes.
 *   • The two surface pins are TEXT pins over source: they prove each file calls the shared reader
 *     and carries no private map. They do not render the page.
 *
 * Pure: no DOM, no DB, no fetch, no React. Wired by build.yml's `unit-suite-client-lib` job, which
 * runs `client/src/lib/__tests__/*.test.ts*` as a whole directory.
 * Run: npx tsx --test client/src/lib/__tests__/reconciliation-kind-labels.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RECONCILIATION_EXCEPTION_KINDS,
  RECONCILIATION_KIND_LABELS,
  reconciliationKindLabel,
  isKnownReconciliationKind,
} from "../../../../shared/reconciliation-kinds";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..");
const ADMIN_PAGE = join(REPO, "client", "src", "pages", "admin", "reconciliation.tsx");
const EMAIL_SERVICE = join(REPO, "server", "services", "email.service.ts");
const SCHEMA = join(REPO, "shared", "schema.ts");

/** The same comment-stripping the sibling copy pins use: a rule explained in a comment must not
 *  satisfy — or trip — a grep that is meant to read the CODE. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const source = (path: string) => stripComments(readFileSync(path, "utf8"));

/** The seven the punchlist row names — the ones that rendered as a bare identifier. */
const V28_UNLABELLED = [
  "trip_booking_without_item",
  "rm_pi_succeeded_no_purchase",
  "rm_purchase_paid_not_cloned",
  "rm_amount_mismatch",
  "rm_purchase_pi_not_succeeded",
  "rm_refund_not_reversed",
  "rm_delivery_not_announced",
] as const;

describe("V-28 — the reconciliation kind labels derive from the one vocabulary", () => {
  it("K0 the vocabulary is non-trivial and covers all three rails", () => {
    assert.ok(
      RECONCILIATION_EXCEPTION_KINDS.length >= 17,
      `the drift vocabulary looks truncated (${RECONCILIATION_EXCEPTION_KINDS.length} kinds)`,
    );
    for (const rail of [
      ["cart", "pi_succeeded_no_booking"],
      ["ready-made", "rm_pi_succeeded_no_purchase"],
      ["legacy", "stripe_charge_no_booking"],
    ] as Array<[string, string]>) {
      assert.ok(
        (RECONCILIATION_EXCEPTION_KINDS as readonly string[]).includes(rail[1]),
        `the ${rail[0]} rail's kinds are missing from the vocabulary`,
      );
    }
  });

  it("K1 every declared kind has a label — the gap V-28 was filed for", () => {
    const missing = (RECONCILIATION_EXCEPTION_KINDS as readonly string[]).filter(
      (kind) => !Object.prototype.hasOwnProperty.call(RECONCILIATION_KIND_LABELS, kind),
    );
    assert.deepEqual(
      missing,
      [],
      "A drift kind with no label renders as a raw identifier to the operator deciding whether " +
        "money moved (§17's own output). Unlabelled:\n  " +
        missing.join("\n  "),
    );
  });

  it("K2 no label names a kind the vocabulary does not declare — the lists cannot drift (§18 rule 1)", () => {
    const declared = new Set<string>(RECONCILIATION_EXCEPTION_KINDS as readonly string[]);
    const orphans = Object.keys(RECONCILIATION_KIND_LABELS).filter((k) => !declared.has(k));
    assert.deepEqual(
      orphans,
      [],
      "A label for a kind nothing emits is a sentence about a fact that cannot occur — and it is " +
        "how a map starts describing a vocabulary that has moved. Orphaned:\n  " +
        orphans.join("\n  "),
    );
    assert.equal(
      Object.keys(RECONCILIATION_KIND_LABELS).length,
      RECONCILIATION_EXCEPTION_KINDS.length,
      "the list and the label map must be the same size in both directions",
    );
  });

  it("K3 a label is a SENTENCE, never the identifier spelled back (§13)", () => {
    for (const [kind, label] of Object.entries(RECONCILIATION_KIND_LABELS)) {
      assert.ok(label.trim().length > 0, `${kind} carries an empty label`);
      assert.notEqual(label, kind, `${kind}'s label is just the identifier`);
      assert.notEqual(
        label.toLowerCase().replaceAll(" ", "_"),
        kind,
        `${kind}'s label is the identifier with the underscores spaced out`,
      );
      assert.ok(
        !/^[a-z0-9_]+$/.test(label),
        `${kind}'s label reads as an enum name rather than a sentence: ${label}`,
      );
    }
  });

  it("K4 the seven kinds V-28 names are present AND labelled", () => {
    for (const kind of V28_UNLABELLED) {
      assert.ok(
        (RECONCILIATION_EXCEPTION_KINDS as readonly string[]).includes(kind),
        `${kind} is no longer in the vocabulary — the row's evidence has moved`,
      );
      const label = reconciliationKindLabel(kind);
      assert.notEqual(label, kind, `${kind} still renders as its own identifier`);
    }
    // Every ready-made kind says so, so an operator can tell the rails apart at a glance — the
    // page prints the rail in its own column, but the digest email does not.
    for (const kind of RECONCILIATION_EXCEPTION_KINDS) {
      if (!kind.startsWith("rm_")) continue;
      assert.match(
        RECONCILIATION_KIND_LABELS[kind],
        /Ready-made/,
        `${kind}'s label should name the ready-made rail`,
      );
    }
  });

  it("K5 an UNKNOWN kind renders as itself — never a guess, never 'Unknown' (§13)", () => {
    for (const unknown of [
      "a_kind_from_a_newer_server",
      "rm_something_not_built_yet",
      "",
      "amount_mismatch_typo",
    ]) {
      assert.equal(
        reconciliationKindLabel(unknown),
        unknown,
        "an unrecognised kind is printed verbatim; a nearest-looking label would be a claim the " +
          "client cannot support",
      );
      assert.equal(isKnownReconciliationKind(unknown), false);
    }
    // And the reader is not fooled by inherited object properties.
    assert.equal(reconciliationKindLabel("toString"), "toString");
    assert.equal(reconciliationKindLabel("constructor"), "constructor");
    assert.equal(isKnownReconciliationKind("constructor"), false);
  });

  it("K6 the admin page reads the shared helper and keeps no private map", () => {
    const page = source(ADMIN_PAGE);
    assert.match(
      page,
      /import \{ reconciliationKindLabel \} from "@shared\/reconciliation-kinds"/,
      "the page must import the one reader",
    );
    assert.match(page, /\{reconciliationKindLabel\(e\.kind\)\}/, "the row must render through it");
    assert.ok(
      !/KIND_LABELS/.test(page),
      "the page must not carry a second label map — that is the drift this row is about",
    );
  });

  it("K7 the digest email reads the same helper — one vocabulary, every surface", () => {
    const email = source(EMAIL_SERVICE);
    assert.match(
      email,
      /import \{ reconciliationKindLabel \} from "@shared\/reconciliation-kinds"/,
      "the admin digest must import the one reader",
    );
    assert.match(email, /reconciliationKindLabel\(m\.type\)/, "the digest row must render through it");
    assert.ok(
      !/RECONCILIATION_LABELS/.test(email),
      "the digest's own map — whose comment said it 'mirrors' the page's — must be gone",
    );
  });

  it("K8 the vocabulary is still ONE list — schema.ts re-exports it rather than restating it", () => {
    const schema = source(SCHEMA);
    assert.match(
      schema,
      /export \{[\s\S]{0,200}RECONCILIATION_EXCEPTION_KINDS[\s\S]{0,200}\} from "\.\/reconciliation-kinds"/,
      "shared/schema.ts must RE-EXPORT the vocabulary so the job's import is untouched",
    );
    assert.ok(
      !/export const RECONCILIATION_EXCEPTION_KINDS/.test(schema),
      "a second declaration of the vocabulary in schema.ts would be the derivation drift §18 " +
        "rule 1 names — it moved, it was not copied",
    );
  });

  it("K9 the pin is not vacuous — the pre-fix shapes all fail", () => {
    // A label map missing a kind (the ten-of-seventeen state this row was filed for).
    const short: Record<string, string> = { ...RECONCILIATION_KIND_LABELS };
    delete short["rm_delivery_not_announced"];
    assert.ok(
      (RECONCILIATION_EXCEPTION_KINDS as readonly string[]).some(
        (kind) => !Object.prototype.hasOwnProperty.call(short, kind),
      ),
      "K1's predicate must catch a map that is missing a kind",
    );
    // A map naming a kind nothing emits.
    const wide = { ...RECONCILIATION_KIND_LABELS, retired_kind: "Something the job stopped emitting" };
    const declared = new Set<string>(RECONCILIATION_EXCEPTION_KINDS as readonly string[]);
    assert.ok(
      Object.keys(wide).some((k) => !declared.has(k)),
      "K2's predicate must catch a map naming an undeclared kind",
    );
    // A "label" that is only the identifier.
    assert.ok(/^[a-z0-9_]+$/.test("rm_amount_mismatch"), "K3's predicate must catch an enum-shaped label");
    // A surface that kept a private map.
    assert.ok(/KIND_LABELS/.test("const KIND_LABELS = {}"), "K6's predicate must catch a private map");
    assert.ok(
      /RECONCILIATION_LABELS/.test("const RECONCILIATION_LABELS = {}"),
      "K7's predicate must catch the digest's private map",
    );
    assert.ok(
      /export const RECONCILIATION_EXCEPTION_KINDS/.test("export const RECONCILIATION_EXCEPTION_KINDS = []"),
      "K8's predicate must catch a second declaration",
    );
  });
});
