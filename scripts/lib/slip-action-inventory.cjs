#!/usr/bin/env node
/**
 * slip-action-inventory — WHAT THE SLIP'S CONTROLS ARE, AND WHAT EACH ONE DOES.
 *
 * Ledger `2026-09-06-slip-conformance` (CLAUDE.md Locked Decision 42). Node built-ins only.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────
 * That lane RELAID OUT the slip: the rail moved into a fixed right column, its cards were
 * reordered, two rows were added and one control moved off the event header. A relayout is the
 * change most likely to LOSE a control quietly — a card left out of the new container, a row
 * dropped in a merge, a handler re-pointed while moving a block — and none of that throws. The
 * rail simply stops offering a rail, and the only signal is a traveler who cannot find it.
 *
 * So the decision-maker's instruction is pinned mechanically: every action control on the slip's
 * FILE SET keeps the SAME testid AND the SAME handler target across the relayout, and the only
 * permitted differences are the ones the ruling named. This module extracts that inventory from
 * source; `client/src/lib/__tests__/fixtures/slip-actions.main.json` is the snapshot taken from
 * `origin/main` before the relayout, and `slip-conformance.test.ts` compares the two.
 *
 * ── WHAT IT EXTRACTS ─────────────────────────────────────────────────────────────────────────
 * For every JSX opening tag carrying a slip-ish testid (`slip-*`, `button-slip-*`,
 * `button-toggle-slip-*`, `text-slip-*`, `trip-pass-*`), the id plus its HANDLER TARGETS, which
 * are the `href` and `onClick` expressions on that same tag, whitespace-normalised. That pairing
 * is the point: an id that survives while its handler is quietly re-pointed is the failure a
 * testid-only inventory cannot see.
 *
 * ── STATED NEGATIVE SPACE (§18d, and it is load-bearing) ─────────────────────────────────────
 *  · It reads TEXT, not behaviour. `onClick={() => doThing()}` is compared as a string: a change
 *    INSIDE `doThing`'s body is invisible here. That is the e2e spec's job
 *    (`playwright/tests/slip-rail-actions.spec.ts`), which presses the controls.
 *  · It sees only STATIC testids. A template-literal id (`slip-item-${a.id}`, `slip-event-…`) is
 *    per-row and is deliberately out of scope — those are the day list's, not the rail's.
 *  · It does not know a control is REACHABLE. A row inside a gate nobody can satisfy still
 *    appears here; whether it renders is the browser's answer.
 *  · Its tag scanner is deliberately naive about `<` (a TS generic like `Record<string, …>` opens
 *    a junk "tag"). Junk tags carry no testid and are dropped, so the worst case is noise, never
 *    a missed control.
 *
 * Usage:
 *   node scripts/lib/slip-action-inventory.cjs <file...>            # print the inventory as JSON
 *   node scripts/lib/slip-action-inventory.cjs --self-test          # predicate fixtures (§18d)
 */

const fs = require("fs");

/** The testid prefixes this inventory considers a slip control. */
const SLIP_ID = /^(?:slip-|button-slip-|button-toggle-slip-|text-slip-|trip-pass-)/;

/**
 * Strip comments so the inventory is about CODE.
 *
 * This codebase documents its rulings in the files that implement them, and a removal is always
 * explained where it used to be — so an inventory built over raw text would keep listing controls
 * that exist only in the paragraph describing their deletion.
 *
 * `//` preceded by `:` is left alone so a URL inside a string is never mistaken for a comment.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Every JSX opening tag in `src`, as raw text.
 *
 * Scans for `<Identifier` and walks forward to the `>` that closes the tag, tracking `{}` depth
 * and quote state so an expression attribute containing either cannot end the tag early.
 */
function openingTags(src) {
  const tags = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "<" || !/[A-Za-z]/.test(src[i + 1] || "")) continue;
    let depth = 0;
    let quote = null;
    let j = i + 1;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) {
        if (c === "\\") j++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === "<" && depth === 0) break; // not a tag after all — bail out
      else if (c === ">" && depth === 0) {
        tags.push(src.slice(i, j + 1));
        break;
      }
    }
    if (j > i) i = j - 1;
  }
  return tags;
}

/** Collapse whitespace so re-indentation by a relayout is not read as a re-wiring. */
function normalize(expr) {
  return expr.replace(/\s+/g, " ").trim();
}

/**
 * The `href` / `onClick` expressions on one opening tag, normalised and prefixed by attribute.
 *
 * An attribute whose value is a `{...}` expression is captured by brace matching rather than by a
 * lazy regex, so a nested object or arrow body cannot truncate the value.
 */
function handlerTargets(tag) {
  const targets = [];
  for (const attr of ["href", "onClick"]) {
    const at = tag.indexOf(`${attr}=`);
    if (at < 0) continue;
    const valueAt = at + attr.length + 1;
    if (tag[valueAt] === '"') {
      const end = tag.indexOf('"', valueAt + 1);
      targets.push(`${attr}:${normalize(tag.slice(valueAt + 1, end))}`);
      continue;
    }
    if (tag[valueAt] !== "{") continue;
    let depth = 0;
    let quote = null;
    for (let k = valueAt; k < tag.length; k++) {
      const c = tag[k];
      if (quote) {
        if (c === "\\") k++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          targets.push(`${attr}:${normalize(tag.slice(valueAt + 1, k))}`);
          break;
        }
      }
    }
  }
  return targets.sort();
}

/**
 * The inventory for one source string: `{ [testid]: string[] }`, ids sorted, targets sorted.
 *
 * A control with NO href and NO onClick (a container, a note, a status pill) maps to `[]` — it is
 * still inventoried, because losing a container's testid breaks the same CI pins as losing a
 * button's.
 */
function inventoryOf(src) {
  const out = {};
  for (const tag of openingTags(stripComments(src))) {
    const m = tag.match(/(?:data-testid|testId)="([A-Za-z0-9-]+)"/);
    if (!m || !SLIP_ID.test(m[1])) continue;
    const targets = handlerTargets(tag);
    // Two tags can legitimately carry one id across branches (a rendered-two-ways control); the
    // union is the honest answer and keeps the comparison order-free.
    out[m[1]] = Array.from(new Set([...(out[m[1]] || []), ...targets])).sort();
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** The inventory across a FILE SET, merged — a control that moves between files is not a change. */
function inventoryOfFiles(paths) {
  return inventoryOf(paths.map((p) => fs.readFileSync(p, "utf8")).join("\n"));
}

// ── self-test (§18d): the predicate's own fixtures, committed and run before every use ─────────

function selfTest() {
  const assert = require("node:assert/strict");

  // 1. A link row: the id and its href travel together.
  assert.deepEqual(
    inventoryOf('<RailRow href={slipPdfPath(tripId)} testId="slip-action-pdf" />'),
    { "slip-action-pdf": ["href:slipPdfPath(tripId)"] },
  );

  // 2. Re-indentation by a relayout is NOT a re-wiring.
  assert.deepEqual(
    inventoryOf('<RailRow\n      href={slipPdfPath(tripId)}\n      testId="slip-action-pdf"\n    />'),
    inventoryOf('<RailRow href={slipPdfPath(tripId)} testId="slip-action-pdf" />'),
  );

  // 3. But a RE-POINTED handler is. This is the failure the whole module exists for.
  assert.notDeepEqual(
    inventoryOf('<RailRow href={slipPdfPath(tripId)} testId="slip-action-pdf" />'),
    inventoryOf('<RailRow href={"/somewhere-else"} testId="slip-action-pdf" />'),
  );

  // 4. An arrow body containing braces and a nested object is captured whole, not truncated.
  assert.deepEqual(
    inventoryOf(
      '<RailRow onClick={() => m.mutate(undefined, { onSuccess: (d) => { if (d.ok) open(); } })} testId="slip-action-finalize-plan" />',
    ),
    {
      "slip-action-finalize-plan": [
        "onClick:() => m.mutate(undefined, { onSuccess: (d) => { if (d.ok) open(); } })",
      ],
    },
  );

  // 5. A comparison inside an expression does not end the tag early, and a `>` inside a string
  //    attribute does not either.
  assert.deepEqual(
    inventoryOf('<div className={n > 1 ? "a" : "b"} title="a > b" data-testid="slip-rail" />'),
    { "slip-rail": [] },
  );

  // 6. Comments never contribute: a deleted control explained in prose stays deleted.
  assert.deepEqual(
    inventoryOf('{/* <RailRow testId="slip-action-add-all-checkout" /> */}\n<div data-testid="slip-rail" />'),
    { "slip-rail": [] },
  );
  assert.deepEqual(
    inventoryOf('// <RailRow testId="slip-action-trip-card" />\n<div data-testid="slip-rail" />'),
    { "slip-rail": [] },
  );

  // 7. Only slip-ish ids are inventoried — an unrelated component in the same file is not ours.
  assert.deepEqual(inventoryOf('<button data-testid="button-send-comment-1" />'), {});

  // 8. A template-literal (per-row) id is deliberately invisible.
  assert.deepEqual(inventoryOf("<div data-testid={`slip-item-${a.id}`} />"), {});

  // 9. A TS generic opens no control: junk tags carry no testid and are dropped.
  assert.deepEqual(inventoryOf("const m: Record<string, number> = {};"), {});

  // 10. A file SET is merged, so a control that MOVES between files reads as unchanged.
  const a = '<RailRow href={"/cart"} testId="slip-action-go-to-checkout" />';
  const b = '<div data-testid="slip-rail" />';
  assert.deepEqual(inventoryOf(`${a}\n${b}`), inventoryOf(`${b}\n${a}`));

  console.log("slip-action-inventory self-test: 10/10 ✅");
}

module.exports = { inventoryOf, inventoryOfFiles, stripComments, SLIP_ID };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === "--self-test") {
    selfTest();
  } else if (args.length > 0) {
    console.log(JSON.stringify(inventoryOfFiles(args), null, 2));
  } else {
    console.error("usage: slip-action-inventory.cjs <file...> | --self-test");
    process.exit(2);
  }
}
