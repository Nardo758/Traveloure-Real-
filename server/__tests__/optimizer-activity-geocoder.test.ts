import assert from "node:assert/strict";
import test from "node:test";
import {
  createOptimizerGeocodeBudget,
  resolveOptimizerActivityCoordinates,
} from "../services/optimizer-activity-geocoder.service";

function memoryCache() {
  const rows = new Map<string, any>();
  return {
    rows,
    adapter: {
      async get(provider: string, queryHash: string) {
        return rows.get(`${provider}:${queryHash}`) ?? null;
      },
      async put(entry: any) {
        rows.set(`${entry.provider}:${entry.queryHash}`, {
          status: entry.status,
          latitude: entry.result ? String(entry.result.lat) : null,
          longitude: entry.result ? String(entry.result.lng) : null,
        });
      },
    },
  };
}

test("catalog coordinates win without a Google lookup", async () => {
  const items = [{ name: "Catalog Tour", providerServiceId: "svc-1", location: "Kyoto" }];
  let calls = 0;
  await resolveOptimizerActivityCoordinates(
    items,
    [],
    new Map([["svc-1", { latitude: "35.0116", longitude: "135.7681" }]]),
    "Kyoto, Japan",
    createOptimizerGeocodeBudget(),
    {
      cache: memoryCache().adapter,
      geocode: async () => { calls += 1; return null; },
    },
  );
  assert.equal(calls, 0);
  assert.deepEqual(
    { latitude: items[0].latitude, longitude: items[0].longitude },
    { latitude: 35.0116, longitude: 135.7681 },
  );
});

test("matching baseline coordinates hydrate an echoed AI activity", async () => {
  const items = [{ name: "Gion Night Walk", location: "Gion" }];
  await resolveOptimizerActivityCoordinates(
    items,
    [{ name: "Gion Night Walk", latitude: 35.0037, longitude: 135.7788 }],
    new Map(),
    "Kyoto, Japan",
    createOptimizerGeocodeBudget(),
    { cache: memoryCache().adapter, geocode: async () => null },
  );
  assert.equal(items[0].latitude, 35.0037);
  assert.equal(items[0].longitude, 135.7788);
});

test("specific Google results are cached and reused", async () => {
  const cache = memoryCache();
  let calls = 0;
  const geocode = async () => {
    calls += 1;
    return {
      lat: 35.0037,
      lng: 135.7788,
      formattedAddress: "Gion, Kyoto, Japan",
      locationType: "GEOMETRIC_CENTER",
      types: ["point_of_interest"],
    };
  };
  const first = [{ name: "Gion Night Walk", location: "Gion" }];
  const second = [{ name: "Gion Night Walk", location: "Gion" }];
  const budget = createOptimizerGeocodeBudget();

  await resolveOptimizerActivityCoordinates(first, [], new Map(), "Kyoto, Japan", budget, {
    cache: cache.adapter,
    geocode,
  });
  await resolveOptimizerActivityCoordinates(second, [], new Map(), "Kyoto, Japan", budget, {
    cache: cache.adapter,
    geocode,
  });

  assert.equal(calls, 1);
  assert.equal(second[0].latitude, 35.0037);
  assert.equal(second[0].longitude, 135.7788);
});

test("generic results and exhausted budgets leave coordinates honest", async () => {
  const cache = memoryCache();
  const items = [
    { name: "Luxury Morning California", location: "California" },
    { name: "Another Place", location: "California" },
  ];
  let calls = 0;
  await resolveOptimizerActivityCoordinates(
    items,
    [],
    new Map(),
    "California",
    createOptimizerGeocodeBudget(1),
    {
      cache: cache.adapter,
      geocode: async () => {
        calls += 1;
        return {
          lat: 36.778261,
          lng: -119.4179324,
          formattedAddress: "California, USA",
          locationType: "APPROXIMATE",
          types: ["administrative_area_level_1", "political"],
        };
      },
    },
  );

  assert.equal(calls, 1);
  assert.equal(items[0].latitude, undefined);
  assert.equal(items[0].longitude, undefined);
  assert.equal(items[1].latitude, undefined);
  assert.equal(items[1].longitude, undefined);
});

test("parallel variants share one in-flight Google request", async () => {
  const cache = memoryCache();
  let calls = 0;
  const geocode = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return {
      lat: 35.0037,
      lng: 135.7788,
      formattedAddress: "Gion, Kyoto, Japan",
      types: ["point_of_interest"],
    };
  };
  const budget = createOptimizerGeocodeBudget(12);
  const first = [{ name: "Gion Night Walk", location: "Gion" }];
  const second = [{ name: "Gion Night Walk", location: "Gion" }];

  await Promise.all([
    resolveOptimizerActivityCoordinates(first, [], new Map(), "Kyoto, Japan", budget, {
      cache: cache.adapter,
      geocode,
    }),
    resolveOptimizerActivityCoordinates(second, [], new Map(), "Kyoto, Japan", budget, {
      cache: cache.adapter,
      geocode,
    }),
  ]);

  assert.equal(calls, 1);
  assert.equal(budget.used(), 1);
  assert.equal(first[0].latitude, 35.0037);
  assert.equal(second[0].latitude, 35.0037);
});