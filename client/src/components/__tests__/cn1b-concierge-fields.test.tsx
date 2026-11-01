/**
 * CN-1b-UI (ledger `2026-11-01-cn1b-ui-concierge-fields`): a concierge listing's fields and the admin task list.
 *
 *   F1  the per-trip price saves (pricing_unit per_trip) and shows (the stored unit reads back on edit; the server's
 *       label is CN-1's held "{price} per trip")
 *   F2  a task outside the admin list is refused before it is sent
 *   F3  a cap is a positive whole number or empty
 *   F4  stays and transport cannot be added as bookable tasks: never offered, never sent, dropped from a stored read
 *   F5  response hours save per listing and show CN-1's held line
 *   F6  listing languages still go out unchanged, and the concierge fields never touch them
 *   F7  no traveler fee on the fields or the admin screen; the admin screen offers no "bookable" switch
 *
 * Run: npx tsx --test client/src/components/__tests__/cn1b-concierge-fields.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { CN1_COPY, conciergePerTripPrice, conciergeResponseHoursLine } from "@shared/cn1-copy";
import { PER_TRIP_PRICING_UNIT } from "@shared/concierge-tasks";
import {
  admitConciergeCap,
  conciergeFieldsPayload,
  conciergePerTripFromStored,
  conciergeTasksFromStored,
  pickableConciergeKinds,
  type ConciergeTaskKindOption,
} from "@/lib/concierge-listing-form";
import { ConciergeListingFields } from "../ConciergeListingFields";

(globalThis as any).React = React;

const kinds: ConciergeTaskKindOption[] = [
  { id: "meals", label: "Meals", domain: "meals", linkOnly: false },
  { id: "entry", label: "Entry", domain: "entry", linkOnly: false },
  { id: "stays", label: "Stays", domain: "stays", linkOnly: true },
  { id: "transport", label: "Transport", domain: "transport", linkOnly: true },
];
const base = { serviceType: "concierge", perTrip: true, pricingUnit: "", responseHours: "", tasks: [], kinds };
const form = readFileSync("client/src/components/ServiceForm.tsx", "utf8");
const admin = readFileSync("client/src/pages/admin/concierge-task-kinds.tsx", "utf8");

function render(over: Partial<React.ComponentProps<typeof ConciergeListingFields>> = {}) {
  return renderToString(
    <ConciergeListingFields
      perTrip={false}
      onPerTrip={() => {}}
      responseHours=""
      onResponseHours={() => {}}
      showResponseHours
      kinds={kinds}
      tasks={[]}
      onTasks={() => {}}
      {...over}
    />,
  );
}

describe("CN-1b-UI: concierge listing fields", () => {
  it("F1 the per-trip price saves and reads back", () => {
    const out = conciergeFieldsPayload(base);
    assert.ok(out.ok);
    assert.equal((out as any).fields.pricingUnit, PER_TRIP_PRICING_UNIT);
    assert.equal(conciergePerTripFromStored(PER_TRIP_PRICING_UNIT), true);
    assert.equal(conciergePerTripFromStored(null), false);
    assert.equal(conciergePerTripPrice("$150"), "$150 per trip");
    assert.match(form, /conciergePerTrip: conciergePerTripFromStored\(\(s as any\)\.pricingUnit\),/);
    // Turning per-trip off clears the stored unit; leaving concierge clears it too (the server refuses it elsewhere).
    assert.equal((conciergeFieldsPayload({ ...base, perTrip: false, pricingUnit: PER_TRIP_PRICING_UNIT }) as any).fields.pricingUnit, null);
    assert.deepEqual((conciergeFieldsPayload({ ...base, serviceType: "planning", pricingUnit: PER_TRIP_PRICING_UNIT }) as any).fields, { pricingUnit: null });
    assert.deepEqual((conciergeFieldsPayload({ ...base, serviceType: "planning" }) as any).fields, {});
  });

  it("F2 a task outside the admin list is refused", () => {
    assert.deepEqual(conciergeFieldsPayload({ ...base, tasks: [{ taskKindKey: "nightclub_vip", cap: "" }] }), { ok: false, reason: "not_on_list" });
  });

  it("F3 a cap is a positive whole number or empty", () => {
    assert.deepEqual(admitConciergeCap(""), { ok: true, value: null });
    assert.deepEqual(admitConciergeCap(" 3 "), { ok: true, value: 3 });
    for (const bad of ["0", "-1", "1.5", "two", "1e3"]) assert.deepEqual(admitConciergeCap(bad), { ok: false }, bad);
    assert.deepEqual(conciergeFieldsPayload({ ...base, tasks: [{ taskKindKey: "meals", cap: "0" }] }), { ok: false, reason: "cap" });
    const ok = conciergeFieldsPayload({ ...base, tasks: [{ taskKindKey: "meals", cap: "4" }, { taskKindKey: "entry", cap: "" }] });
    assert.deepEqual((ok as any).fields.conciergeTasks, [{ taskKindKey: "meals", cap: 4 }, { taskKindKey: "entry", cap: null }]);
    assert.match(form, /if \(!conciergeFields\.ok\) throw new Error\(CN1B_HELD_COPY\.capInvalid\);/);
  });

  it("F4 stays and transport are never offered, sent or kept as bookable tasks", () => {
    assert.deepEqual(pickableConciergeKinds(kinds).map((k) => k.id), ["meals", "entry"]);
    assert.deepEqual(conciergeFieldsPayload({ ...base, tasks: [{ taskKindKey: "stays", cap: "" }] }), { ok: false, reason: "link_only" });
    assert.deepEqual(
      conciergeTasksFromStored([{ taskKindKey: "transport", linkOnly: true, cap: null }, { taskKindKey: "meals", linkOnly: false, cap: 2 }]),
      [{ taskKindKey: "meals", cap: "2" }],
    );
    const html = render();
    assert.ok(html.includes('data-testid="checkbox-concierge-task-meals"'));
    assert.equal(/concierge-task-(stays|transport)/.test(html), false);
    assert.equal(/bookable/i.test(readFileSync("client/src/lib/concierge-listing-form.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "")), false);
  });

  it("F5 response hours save per listing and show CN-1's line", () => {
    assert.equal((conciergeFieldsPayload({ ...base, responseHours: "12" }) as any).fields.responseWindowHours, 12);
    assert.equal((conciergeFieldsPayload({ ...base, responseHours: "" }) as any).fields.responseWindowHours, null);
    const html = render({ responseHours: "12" });
    assert.ok(html.includes(conciergeResponseHoursLine(12)));
    assert.equal(conciergeResponseHoursLine(12), CN1_COPY.responseHours.replace("{hours}", "12"));
    assert.equal(render({ showResponseHours: false }).includes("input-concierge-response-hours"), false);
  });

  it("F6 listing languages still go out, untouched by the concierge fields", () => {
    assert.match(form, /deliveryLanguages: formData\.deliveryLanguages,/);
    const out = conciergeFieldsPayload({ ...base, tasks: [{ taskKindKey: "meals", cap: "" }] });
    assert.deepEqual(Object.keys((out as any).fields).sort(), ["conciergeTasks", "pricingUnit", "responseWindowHours"]);
  });

  it("F7 no traveler fee anywhere, and no bookable switch on the admin screen", () => {
    const html = render({ perTrip: true, responseHours: "6", tasks: [{ taskKindKey: "meals", cap: "1" }] });
    assert.equal(/fee/i.test(html), false);
    assert.equal(/fee/i.test(admin.replace(/\/\*[\s\S]*?\*\//g, "")), false);
    assert.equal(/bookable/.test(admin.replace(/\/\*[\s\S]*?\*\//g, "")), false);
    assert.match(admin, /ADMIN_CONCIERGE_TASK_KINDS_URL = "\/api\/admin\/concierge-task-kinds"/);
  });
});
