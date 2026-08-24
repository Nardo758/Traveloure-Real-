/**
 * EX-2 regression pin (docs/testing/EXPERT_UX_WALKTHROUGH.md) — schema layer.
 *
 * The bug: POST /api/provider/services (the §5 shared expert+provider create endpoint) persisted
 * price=-50 and price=0 straight to rows — a -99 listing reached status=active /
 * approval_status=submitted, i.e. the admin approval queue. No floor existed at any layer.
 *
 * The fix is layered; this file pins LAYER 1 — `insertProviderServiceSchema`'s field-level floor:
 *   - a NEGATIVE or non-numeric price is rejected on BOTH paths (the field-level refine survives
 *     `.partial()`, which is exactly how the PATCH route parses);
 *   - ZERO is deliberately ACCEPTED here — it is ServiceForm's price-not-set draft default, and
 *     the "no zero-price listing goes LIVE" half is the route-level PRICE_REQUIRED publish gate
 *     (draft-exempt, beside the meeting-point gate). Do not "tighten" this to .positive(): that
 *     bricks draft saves.
 *
 * Pure unit — parses the zod schema only. No DB, no server, CI-safe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { insertProviderServiceSchema } from "../../shared/schema";

const base = { serviceName: "price-floor-pin", description: "pin fixture" };

test("EX-2 pin: negative price is rejected on the CREATE shape", () => {
  const r = insertProviderServiceSchema.safeParse({ ...base, price: "-50" });
  assert.equal(r.success, false, "price=-50 must not parse");
});

test("EX-2 pin: negative price is rejected on the PATCH shape (.partial())", () => {
  const r = insertProviderServiceSchema.partial().safeParse({ price: "-0.01" });
  assert.equal(r.success, false, "a single-field PATCH of a negative price must not parse");
});

test("EX-2 pin: a non-numeric price is rejected", () => {
  const r = insertProviderServiceSchema.safeParse({ ...base, price: "abc" });
  assert.equal(r.success, false, 'price="abc" must not parse');
});

test("EX-2 pin: zero parses (draft price-not-set state) — publish gating is the route's job", () => {
  const r = insertProviderServiceSchema.safeParse({ ...base, price: "0" });
  assert.equal(r.success, true, "price=0 must remain parseable or ServiceForm draft saves brick");
});

test("EX-2 pin: a positive price parses", () => {
  const r = insertProviderServiceSchema.safeParse({ ...base, price: "40" });
  assert.equal(r.success, true);
});

test("EX-2 pin: an absent price parses (schema-level; column is nullable)", () => {
  const r = insertProviderServiceSchema.safeParse({ ...base });
  assert.equal(r.success, true);
});
