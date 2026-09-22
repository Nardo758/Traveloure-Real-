import assert from "node:assert/strict";
import test from "node:test";

import {
  formatAffiliateAmount,
  summarizeAffiliateRevenue,
} from "../services/affiliate-commission-report";
import { getBookingComCommissions } from "../services/booking-com-commissions.service";
import { getFeverCommissions } from "../services/fever-commissions.service";
import { getViatorCommissions } from "../services/viator-commissions.service";

type ServiceCase = {
  name: string;
  env: Record<string, string>;
  getReport: () => Promise<{
    configured: boolean;
    thisMonth: number | null;
    lastMonth: number | null;
    total: number | null;
  }>;
  validPayload: unknown;
  malformedPayload: unknown;
  validTotal: number;
};

const serviceCases: ServiceCase[] = [
  {
    name: "Booking.com",
    env: { BOOKING_COM_AFFILIATE_ID: "affiliate", BOOKING_COM_API_KEY: "key" },
    getReport: () => getBookingComCommissions("this_month"),
    validPayload: [{ commission: "12.50" }, {}],
    malformedPayload: [{ commission: "12.50 USD" }],
    validTotal: 12.5,
  },
  {
    name: "Viator",
    env: { VIATOR_API_KEY: "key" },
    getReport: () => getViatorCommissions("this_month"),
    validPayload: { commissions: [{ totalCommission: "9.25" }, {}] },
    malformedPayload: { commissions: [{ totalCommission: "12oops" }] },
    validTotal: 9.25,
  },
  {
    name: "Fever",
    env: { IMPACT_ACCOUNT_SID: "sid", IMPACT_AUTH_TOKEN: "token" },
    getReport: () => getFeverCommissions("this_month"),
    validPayload: { Rows: [{ Commissions: "4.75" }, {}] },
    malformedPayload: { Rows: [{ Commissions: "4.75 dollars" }] },
    validTotal: 4.75,
  },
];

const originalFetch = globalThis.fetch;
const originalEnv = new Map<string, string | undefined>();
for (const { env } of serviceCases) {
  for (const key of Object.keys(env)) originalEnv.set(key, process.env[key]);
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

for (const service of serviceCases) {
  test(`${service.name}: an HTTP error is unknown, not zero`, { concurrency: false }, async () => {
    Object.assign(process.env, service.env);
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });

    const report = await service.getReport();

    assert.equal(report.configured, true);
    assert.equal(report.thisMonth, null);
    assert.equal(report.lastMonth, null);
    assert.equal(report.total, null);
  });

  test(`${service.name}: a thrown fetch is unknown, not zero`, { concurrency: false }, async () => {
    Object.assign(process.env, service.env);
    globalThis.fetch = async () => {
      throw new Error("network unavailable");
    };

    const report = await service.getReport();

    assert.equal(report.configured, true);
    assert.equal(report.total, null);
  });

  test(`${service.name}: an unparseable payload is unknown`, { concurrency: false }, async () => {
    Object.assign(process.env, service.env);
    globalThis.fetch = async () => Response.json({ unexpected: "shape" });

    const report = await service.getReport();

    assert.equal(report.configured, true);
    assert.equal(report.total, null);
  });

  test(`${service.name}: a present but malformed commission is unknown`, { concurrency: false }, async () => {
    Object.assign(process.env, service.env);
    globalThis.fetch = async () => Response.json(service.malformedPayload);

    const report = await service.getReport();

    assert.equal(report.configured, true);
    assert.equal(report.total, null);
  });

  test(`${service.name}: a readable report retains real zero rows`, { concurrency: false }, async () => {
    Object.assign(process.env, service.env);
    globalThis.fetch = async () => Response.json(service.validPayload);

    const report = await service.getReport();

    assert.equal(report.configured, true);
    assert.equal(report.total, service.validTotal);
  });
}

test("affiliate summary is partial and names configured unreadable partners", () => {
  const summary = summarizeAffiliateRevenue([
    {
      name: "Viator",
      report: { configured: true, thisMonth: 5, lastMonth: 4, total: 5, currency: "USD" },
    },
    {
      name: "Fever",
      report: { configured: true, thisMonth: null, lastMonth: null, total: null, currency: "USD" },
    },
    {
      name: "Booking.com",
      report: { configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" },
    },
  ]);

  assert.deepEqual(summary, {
    total: 5,
    partial: true,
    unknownPartners: ["Fever"],
  });
  assert.equal(formatAffiliateAmount(null), "—");
  assert.equal(formatAffiliateAmount(0), "0.00");
});