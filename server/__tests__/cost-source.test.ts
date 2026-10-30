/**
 * Row 242 — `costSource` on the slip DTO is a label, derived per read.
 *
 * Architect, Oct 28, 2026, 01:05 ET: order booking, traveler, service_link, expert, ai;
 * `ai` only when origin is exactly "ai"; otherwise the key is absent. `cost` stays the
 * amount. `costCurrency` / `costPerPerson` are flags. The cost strip does not change.
 *
 * Pure and static. No database, no network, no git, no execSync, no comparison to a ref.
 *
 * Run: npx tsx --test server/__tests__/cost-source.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { itemBookingLabelStatus, itemBookingStatusEntry } from "@shared/booking-visibility";
import { deriveCostFlags, deriveCostSource } from "../services/cost-source";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/[^\n]*/g, "");
}

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(relative(ROOT, full).split(sep).join("/"));
    }
  };
  walk(join(ROOT, root));
  return out;
}

/** The assembler's present-only spread, so an absent source is a missing key and not null. */
function emitted(
  item: { origin?: string | null; providerServiceId?: string | null; currency?: string | null; costPerPerson?: boolean | null },
  hasLiveBooking: boolean,
): { costSource?: string; costCurrency?: string; costPerPerson?: true } {
  const costSource = deriveCostSource(item, hasLiveBooking);
  return { ...(costSource ? { costSource } : {}), ...deriveCostFlags(item) };
}

function countsAsBooked(b: { status?: string | null; refundedOutOfBand?: boolean | null }): boolean {
  return itemBookingStatusEntry(itemBookingLabelStatus(b)).countsAsBooked;
}

describe("K1 — each value from its signal alone", () => {
  it("a live booking reads booking", () => {
    assert.equal(deriveCostSource({}, true), "booking");
  });

  it("origin traveler reads traveler", () => {
    assert.equal(deriveCostSource({ origin: "traveler" }, false), "traveler");
  });

  it("a provider service id reads service_link", () => {
    assert.equal(deriveCostSource({ providerServiceId: "svc-1" }, false), "service_link");
  });

  it("origin expert reads expert", () => {
    assert.equal(deriveCostSource({ origin: "expert" }, false), "expert");
  });

  it("origin ai reads ai", () => {
    assert.equal(deriveCostSource({ origin: "ai" }, false), "ai");
  });
});

describe("K2 — precedence, one case per adjacent pair", () => {
  it("booking beats traveler, expert and ai", () => {
    assert.equal(deriveCostSource({ origin: "traveler" }, true), "booking");
    assert.equal(deriveCostSource({ origin: "expert" }, true), "booking");
    assert.equal(deriveCostSource({ origin: "ai" }, true), "booking");
  });

  it("traveler beats service_link", () => {
    assert.equal(
      deriveCostSource({ origin: "traveler", providerServiceId: "svc-1" }, false),
      "traveler",
    );
  });

  it("service_link beats expert and ai", () => {
    assert.equal(deriveCostSource({ origin: "expert", providerServiceId: "svc-1" }, false), "service_link");
    assert.equal(deriveCostSource({ origin: "ai", providerServiceId: "svc-1" }, false), "service_link");
  });

  it("expert with no link reads expert", () => {
    assert.equal(deriveCostSource({ origin: "expert" }, false), "expert");
  });
});

describe("K3 — absent when no signal, and the spread leaves the key out", () => {
  for (const origin of [null, undefined, "", "system", "constructor", "AI", " ai"] as const) {
    it(`origin ${JSON.stringify(origin)} with no link and no booking is absent`, () => {
      const item = { origin };
      assert.equal(deriveCostSource(item, false), undefined);
      const result = emitted(item, false);
      assert.equal("costSource" in result, false);
      assert.equal(result.costSource, undefined);
    });
  }
});

describe("K4 — ai only when origin is exactly ai", () => {
  it("a row with no origin and nothing else is not ai", () => {
    assert.notEqual(deriveCostSource({}, false), "ai");
    assert.equal(deriveCostSource({}, false), undefined);
  });
});

describe("K5 — expert is origin only", () => {
  it("expertNote and notes with origin null read absent", () => {
    const item = { origin: null, expertNote: "from the expert", notes: "ephemeral scratch" };
    assert.equal(deriveCostSource(item, false), undefined);
    assert.equal("costSource" in emitted(item, false), false);
  });
});

describe("K6 — an ended booking never reads booking", () => {
  const ended = [
    { status: "refunded" },
    { status: "cancelled" },
    { status: "payment_pending" },
    { status: "failed" },
    { status: "expired" },
    { status: "confirmed", refundedOutOfBand: true },
  ];

  for (const b of ended) {
    it(`${JSON.stringify(b)} does not count as booked and falls through`, () => {
      const live = countsAsBooked(b);
      assert.equal(live, false);
      assert.equal(deriveCostSource({ origin: "traveler" }, live), "traveler");
      assert.equal(deriveCostSource({ providerServiceId: "svc-1" }, live), "service_link");
      const none = emitted({}, live);
      assert.equal("costSource" in none, false);
    });
  }

  for (const status of ["confirmed", "completed"]) {
    it(`${status} counts as booked and reads booking`, () => {
      const live = countsAsBooked({ status });
      assert.equal(live, true);
      assert.equal(deriveCostSource({ origin: "traveler" }, live), "booking");
    });
  }

  it("a disputed booking stays under booking", () => {
    const live = countsAsBooked({ status: "disputed" });
    assert.equal(live, true);
    assert.equal(deriveCostSource({ origin: "ai" }, live), "booking");
  });
});

describe("K7 — flags only when set", () => {
  it("costPerPerson true is the flag, and false null undefined omit the key", () => {
    assert.deepEqual(deriveCostFlags({ costPerPerson: true }), { costPerPerson: true });
    for (const costPerPerson of [false, null, undefined] as const) {
      const got = deriveCostFlags({ costPerPerson });
      assert.equal("costPerPerson" in got, false, String(costPerPerson));
    }
  });

  it("USD and an empty currency omit costCurrency; EUR is carried upper-cased", () => {
    for (const currency of ["USD", "usd", " USD ", null, ""] as const) {
      const got = deriveCostFlags({ currency });
      assert.equal("costCurrency" in got, false, JSON.stringify(currency));
    }
    assert.deepEqual(deriveCostFlags({ currency: "EUR" }), { costCurrency: "EUR" });
    assert.deepEqual(deriveCostFlags({ currency: "eur" }), { costCurrency: "EUR" });
    assert.deepEqual(deriveCostFlags({ currency: " eur " }), { costCurrency: "EUR" });
  });

  it("both flags together", () => {
    assert.deepEqual(deriveCostFlags({ currency: "eur", costPerPerson: true }), {
      costCurrency: "EUR",
      costPerPerson: true,
    });
  });
});

describe("K8 — cost is unchanged and the label reads no listing price", () => {
  it("the live assembler still prices from estimatedCost", () => {
    const assembler = stripComments(read("server", "services", "trip-plan.service.ts"));
    assert.match(assembler, /cost: parseFloat\(item\.estimatedCost\?\.toString\(\) \|\| "0"\)/);
  });

  it("the helper and the two call sites do not read a provider_services price", () => {
    const helper = stripComments(read("server", "services", "cost-source.ts"));
    assert.doesNotMatch(helper, /providerServices|provider_services|\.price\b/);
    const assembler = stripComments(read("server", "services", "trip-plan.service.ts"));
    const sourceCall = assembler.match(/deriveCostSource\(([^)]*)\)/);
    const flagsCall = assembler.match(/deriveCostFlags\(([^)]*)\)/);
    assert.ok(sourceCall, "deriveCostSource call");
    assert.ok(flagsCall, "deriveCostFlags call");
    assert.doesNotMatch(sourceCall[1], /price|providerServices|provider_services/);
    assert.doesNotMatch(flagsCall[1], /price|providerServices|provider_services/);
    assert.equal(sourceCall[1].replace(/\s+/g, ""), "item,!!linked.booking");
    assert.equal(flagsCall[1].replace(/\s+/g, ""), "item");
  });
});

describe("K9 — wiring is the live buildActivity only", () => {
  const raw = read("server", "services", "trip-plan.service.ts");
  const variantAt = raw.indexOf("export async function assembleTripPlanFromVariant");
  const liveFn = raw.slice(raw.indexOf("export async function assembleTripPlan("), variantAt);
  const variantFn = raw.slice(variantAt);

  it("the live builder passes !!linked.booking and spreads only when defined", () => {
    assert.ok(variantAt > 0, "variant producer not found");
    const src = stripComments(liveFn);
    assert.match(src, /const linked = linkedBookingFields\(/);
    assert.match(src, /deriveCostSource\(item, !!linked\.booking\)/);
    assert.doesNotMatch(src, /deriveCostSource\([^)]*bookingId/);
    assert.match(src, /\.\.\.linked,/);
    assert.doesNotMatch(src, /\.\.\.linkedBookingFields\(/);
    assert.match(src, /\.\.\.\(costSource \? \{ costSource \} : \{\}\)/);
    assert.match(src, /\.\.\.deriveCostFlags\(item\)/);
    assert.match(
      src,
      /supplySlot: true as const \} : \{\}\),\s*\.\.\.\(costSource \? \{ costSource \} : \{\}\),\s*\.\.\.deriveCostFlags\(item\)/,
    );
  });

  it("teaser and preview return before any activity is built", () => {
    const src = stripComments(raw);
    const buildIdx = src.indexOf("const buildActivity");
    assert.ok(buildIdx > 0, "buildActivity not found");
    const before = src.slice(0, buildIdx);
    assert.match(before, /if\s*\(level === "preview"\)/);
    assert.match(before, /if\s*\(level === "teaser"\)/);
  });

  it("the variant-snapshot buildActivity never mentions costSource", () => {
    assert.equal(variantFn.includes("costSource"), false);
    assert.equal(variantFn.includes("deriveCostSource"), false);
    assert.equal(variantFn.includes("deriveCostFlags"), false);
    assert.equal(variantFn.includes("costCurrency"), false);
    assert.equal(variantFn.includes("costPerPerson"), false);
  });
});

describe("K10 — the cost strip is untouched", () => {
  it("stopOwnPrice still reads only a booking and a traveler amount", () => {
    const strip = read("client", "src", "lib", "plan-cost-strip.ts");
    const view = read("client", "src", "components", "plan", "PlanCostStrip.tsx");
    for (const src of [strip, view]) {
      assert.doesNotMatch(src, /costSource|costCurrency|costPerPerson/);
    }
    const fn = strip.match(/export function stopOwnPrice\([\s\S]*?\n\}/);
    assert.ok(fn, "stopOwnPrice not found");
    assert.match(fn[0], /a\.booking/);
    assert.match(fn[0], /origin === "traveler"/);
    assert.match(fn[0], /Pick<PlanCardActivity, "origin" \| "cost" \| "booking">/);
  });
});

describe("K11 — the client mirror is type only", () => {
  it("PlanCardActivity declares the three optional fields and no other client file mentions them", () => {
    const types = stripComments(read("client", "src", "components", "plancard", "plancard-types.tsx"));
    assert.match(types, /costSource\?: CostSource/);
    assert.match(types, /costCurrency\?: string/);
    assert.match(types, /costPerPerson\?: true/);
    const shared = stripComments(read("shared", "trip-plan.ts"));
    assert.match(shared, /export type CostSource = "booking" \| "traveler" \| "service_link" \| "expert" \| "ai"/);
    assert.match(shared, /costSource\?: CostSource/);
    assert.match(shared, /costCurrency\?: string/);
    assert.match(shared, /costPerPerson\?: true/);
    const typeFile = "client/src/components/plancard/plancard-types.tsx";
    const others = sourceFiles("client/src").filter((f) => f !== typeFile);
    const hits = others.filter((f) => /costSource|costCurrency|costPerPerson/.test(read(...f.split("/"))));
    assert.deepEqual(hits, []);
  });
});
