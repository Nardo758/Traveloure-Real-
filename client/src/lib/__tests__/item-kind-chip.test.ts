/**
 * item-kind-chip.test.ts — THE CLIENT SIDE OF THE ITEM-KIND CONTRACT: ONE MAP, AND EVERY SURFACE
 * THAT LABELS AN ITEM READS IT.
 *
 * (decision-maker ruling 2026-09-15, punchlist **D-4**, option A; ledger
 *  `2026-09-15-d4-item-kind-contract`; CLAUDE.md §13, §18 rule 1, Locked Decision 39,
 *  Locked Decision 42 D23, Locked Decision 44)
 *
 * The companion to `shared/__tests__/item-kind.test.ts`, which proves the four rules themselves.
 * What this file pins is the thing a reader cannot see by opening one component: that the FOUR
 * SURFACES which label a plan item all render `itemKindChip`'s own words, and that the chip
 * component is the pill family's ONE home rather than one of several.
 *
 *   D1  `ItemKindBadge` lives beside `RoutingBadge`/`OriginBadge` in the pill family's one home
 *       and renders the shared chip — it writes no label of its own.
 *   D2  every render site mounts that component (or calls the one derivation) rather than
 *       authoring a label: the slip row, the PlanCard full stage (which IS the Trip Card's frozen
 *       plan, LD 45 (6) — one page, the full-stage card), the cart line, the ready-made detail.
 *   D3  the KIND is never confused with the ROUTING STATUS (LD 44): no render site maps a
 *       `routing_status` value onto a kind word, and the two chips are drawn separately.
 *   D4  the cart does not print a price on a line whose kind is not `platformPriced` — the §13
 *       half of D-4, since checkout skips an item with no service on both loops.
 *   D5  the ready-made detail draws its by-kind counts only from the approval snapshot, and never
 *       zero-fills a listing approved before the snapshot carried them.
 *
 * DERIVED, NOT LISTED: D2's site list is the set of files that import the shared module, so a new
 * render site is covered the day it is written; the assertions below name the four that exist.
 *
 * Run solo: npx tsx --test client/src/lib/__tests__/item-kind-chip.test.ts
 * CI: `unit-suite-client-lib` (client/src/lib/__tests__ — whole directory).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ITEM_KINDS, itemKindChip } from "@shared/item-kind";

const REPO = path.resolve(import.meta.dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(REPO, rel), "utf8");

const PILL_HOME = "client/src/components/plancard/ActivitiesSection.tsx";
const RENDER_SITES = [
  PILL_HOME,
  "client/src/components/plancard/SlipView.tsx",
  "client/src/pages/cart.tsx",
  "client/src/pages/ready-made-detail.tsx",
] as const;

// ── D1 — the chip component is in the pill family's one home and writes no labels ───────────────

test("D1 — ItemKindBadge lives beside RoutingBadge/OriginBadge and renders the shared chip", () => {
  const src = read(PILL_HOME);
  assert.ok(src.includes("export function ItemKindBadge("), "the chip component lives here");
  assert.ok(src.includes("export function RoutingBadge("), "beside the routing pill");
  assert.ok(src.includes("export function OriginBadge("), "and the origin chip");
  assert.ok(src.includes('from "@shared/item-kind"'), "reading the one module");
  for (const kind of ITEM_KINDS) {
    const label = itemKindChip(kind)!.label;
    assert.ok(
      !src.includes(`"${label}"`) && !src.includes(`>${label}<`),
      `${PILL_HOME} does not re-type the "${label}" label`,
    );
  }
});

// ── D2 — every render site reads the one module ─────────────────────────────────────────────────

test("D2 — every surface that labels a plan item reads the one module, directly or via the chip", () => {
  for (const rel of RENDER_SITES) {
    const src = read(rel);
    assert.ok(
      src.includes('from "@shared/item-kind"') || src.includes("ItemKindBadge"),
      `${rel} reads the one item-kind module, or mounts the one chip component that does`,
    );
  }
});

test("D2 — the slip and the PlanCard full stage both MOUNT the one chip component", () => {
  // The Trip Card is the PlanCard full stage plus a rail (LD 45 (6) — one page, no tab shell), so
  // mounting the chip in the full-stage activity row is what puts it on the frozen plan too.
  assert.ok(
    read("client/src/components/plancard/SlipView.tsx").includes("<ItemKindBadge activity={a} />"),
    "the slip item row mounts the chip",
  );
  assert.ok(
    read(PILL_HOME).includes("<ItemKindBadge activity={a} />"),
    "the PlanCard full stage's activity row mounts the chip",
  );
});

test("D2 — the site list is DERIVED: no other client file writes a kind word of its own", () => {
  // The signature of a second map is one file holding ALL FOUR labels. Individual words like
  // "recommended" are ordinary copy and are deliberately not swept (stated negative space, §18d:
  // this pin catches a second MAP, not a one-off sentence that happens to reuse a word).
  const labels = ITEM_KINDS.map((k) => itemKindChip(k)!.label);
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      const src = readFileSync(full, "utf8");
      if (labels.every((l) => src.includes(`"${l}"`) || src.includes(`'${l}'`) || src.includes(`>${l}<`))) {
        offenders.push(path.relative(REPO, full));
      }
    }
  };
  walk(path.join(REPO, "client/src"));
  assert.deepEqual(offenders, [], "render itemKindChip()'s value instead of a second table");
});

// ── D3 — a kind is not a routing status (LD 44) ─────────────────────────────────────────────────

test("D3 — the kind chip and the routing pill are drawn as two chips, not folded into one", () => {
  const slip = read("client/src/components/plancard/SlipView.tsx");
  const routingAt = slip.indexOf("<RoutingBadge activity={a} showPlanning");
  const kindAt = slip.indexOf("<ItemKindBadge activity={a} />");
  assert.ok(routingAt > -1 && kindAt > -1, "both chips render on the slip row");
  assert.notEqual(routingAt, kindAt);
});

test("D3 — no render site maps a routing_status value onto a kind word", () => {
  const routingValues = ["in_planning", "with_expert", "ready_for_checkout", "purchased"];
  const kinds = [...ITEM_KINDS] as string[];
  for (const rel of RENDER_SITES) {
    const src = read(rel);
    for (const status of routingValues) {
      for (const kind of kinds) {
        assert.ok(
          !src.includes(`${status}": "${kind}`) && !src.includes(`${status}: "${kind}"`),
          `${rel} must not translate routing status ${status} into kind ${kind} (LD 44)`,
        );
      }
    }
  }
});

// ── D4 — the cart prints no price it cannot charge ──────────────────────────────────────────────

test("D4 — the cart's trip-routed line hides the price and shows the kind instead", () => {
  const cart = read("client/src/pages/cart.tsx");
  assert.ok(
    cart.includes("{contentDisplay.price && !isTripRoutedItem && ("),
    "a routed plan item's price is not printed — checkout skips the row (`if (!item.service) continue;`)",
  );
  assert.ok(cart.includes("itemKindChipFor({"), "and the kind is derived, not typed");
  assert.ok(
    cart.includes("not included in this checkout total"),
    "the pre-existing honest line stays",
  );
});

test("D4 — `platformPriced` is what a surface reads to decide whether a price may show", () => {
  assert.equal(itemKindChip("recommended")!.platformPriced, false);
  assert.equal(itemKindChip("external")!.platformPriced, false);
  assert.equal(itemKindChip("bookable_separately")!.platformPriced, true);
  assert.equal(itemKindChip("included")!.platformPriced, true);
});

// ── D5 — the ready-made detail never zero-fills ─────────────────────────────────────────────────

test("D5 — by-kind counts render only from the approval snapshot, and zeros are omitted", () => {
  const detail = read("client/src/pages/ready-made-detail.tsx");
  assert.ok(detail.includes("byKind"), "the page reads the approval snapshot's own counts");
  assert.ok(
    detail.includes(".filter((row) => row.n > 0)"),
    "a kind with no items is omitted, never printed as 0 (§13)",
  );
  assert.ok(
    detail.includes("{kindCounts.length > 0 && ("),
    "a listing approved before the snapshot carried byKind draws nothing at all",
  );
});
