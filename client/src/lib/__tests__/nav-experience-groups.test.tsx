/**
 * THE NAV'S EXPERIENCES MENU IS THE FIVE GROUPS (ledger `2026-10-07-nav-experience-groups`).
 *
 *   G1  the Experiences entry holds exactly five leaves, built from `OCCASION_GROUP_ORDER` /
 *       `OCCASION_GROUP_LABELS` (one source): the labels in order, each linking to
 *       `/experiences?group=<key>`; no leaf renders a raw key (R127). The mobile nav reads the same
 *       config, so it carries the same five.
 *   G2  `?group=` pre-picks only an EXACT key: `moments` → A moment; `xyz`, `Moments`, empty → none.
 *   G3  the picker opens on that group's tab; with no group, no tab is pressed.
 *   G4  the start page reads `?group=` through the one helper and hands it to the picker.
 *
 * Run: npx tsx --test client/src/lib/__tests__/nav-experience-groups.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { navGroupsConfig } from "../nav-config";
import { preselectedGroup } from "../experiences-entry";
import { OccasionPicker } from "../../components/plan/OccasionPicker";
import { OCCASION_GROUP_LABELS, OCCASION_GROUP_ORDER } from "@shared/experience-group";

(globalThis as any).React = React;
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const row = (slug: string, name: string, o: Record<string, unknown>) => ({ slug, name, description: null, defaultStops: "one", ...o });
const CATALOG = [
  row("travel", "Travel", { defaultDuration: "range", defaultGuests: false, defaultStops: "many" }),
  row("date-night", "Date Night", { defaultDuration: "day", defaultGuests: false }),
  row("birthday", "Birthday", { defaultDuration: "day", defaultGuests: true }),
  row("wedding", "Wedding", { defaultDuration: "range", defaultGuests: true, rolesNeeded: ["venue", "caterer"] }),
  row("girls-trip", "Girls Trip", { defaultDuration: "range", defaultGuests: true, rolesNeeded: ["accommodation"] }),
];

describe("the nav's Experiences menu", () => {
  it("G1 five leaves from the one manifest, labels shown, keys only in the href", () => {
    const group = navGroupsConfig.find((g) => g.name === "Experiences");
    assert.ok(group, "the Experiences entry exists");
    const leaves = (group!.sections ?? []).flatMap((s) => s.items);
    assert.equal(leaves.length, 5);
    assert.deepEqual(
      leaves.map((l) => l.name),
      OCCASION_GROUP_ORDER.map((k) => OCCASION_GROUP_LABELS[k]),
    );
    assert.deepEqual(
      leaves.map((l) => l.href),
      OCCASION_GROUP_ORDER.map((k) => `/experiences?group=${k}`),
    );
    for (const l of leaves) assert.ok(!(OCCASION_GROUP_ORDER as readonly string[]).includes(l.name), `${l.name} is a label, not a key`);
    // One source: the labels are not restated in the config file.
    const src = read("client/src/lib/nav-config.ts");
    for (const label of Object.values(OCCASION_GROUP_LABELS)) assert.ok(!src.includes(`"${label}"`), `"${label}" is not copied into nav-config`);
  });

  it("G2 ?group= pre-picks an exact key only", () => {
    const g = preselectedGroup(new URLSearchParams("group=moments"));
    assert.equal(g, "moments");
    assert.equal(OCCASION_GROUP_LABELS[g!], "A moment");
    assert.equal(preselectedGroup(new URLSearchParams("group=xyz")), null);
    assert.equal(preselectedGroup(new URLSearchParams("group=Moments")), null);
    assert.equal(preselectedGroup(new URLSearchParams("group=")), null);
    assert.equal(preselectedGroup(new URLSearchParams("")), null);
  });

  it("G3 the picker opens on the pre-picked group; with none, no group is pressed", () => {
    const render = (initialGroup: any) =>
      renderToString(React.createElement(OccasionPicker as any, { occasions: CATALOG, value: "", onPick: () => {}, initialGroup }));
    const picked = render("moments");
    assert.match(picked, /aria-pressed="true"[^>]*data-testid="occasion-group-moments"|data-testid="occasion-group-moments"[^>]*aria-pressed="true"/);
    assert.ok(picked.includes("Date Night"), "the A moment tab lists its occasions");
    const none = render(null);
    assert.doesNotMatch(none, /aria-pressed="true"[^>]*data-testid="occasion-group-/);
    assert.ok(!none.includes("Date Night"), "no tab ⇒ no occasions listed");
  });

  it("G4 the start page reads ?group= through the one helper", () => {
    const page = read("client/src/pages/experiences.tsx");
    // E3 (sanctioned): the page hands ?group= to PlanEntry inline as its starting `group`.
    assert.match(page, /const group = preselectedGroup\(params\);/);
    assert.match(page, /\.\.\.\(group \? \{ group \} : \{\}\)/);
  });
});
