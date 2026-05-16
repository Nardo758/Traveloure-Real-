/**
 * TRIP-01–16: Trip Planning & Itinerary Management
 * Tests the full lifecycle: auth guards, CRUD, itinerary items, plancard, E2E flow
 */
import { test, expect } from "@playwright/test";
import { loginAs, logout, TEST_ACCOUNTS } from "../helpers/auth";

const FUTURE_START = "2027-01-10";
const FUTURE_END = "2027-01-17";

// ─── Auth Guards ─────────────────────────────────────────────────────────────

test("TRIP-01: GET /api/trips → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/trips");
  console.log("TRIP-01:", resp.status());
  expect(resp.status()).toBe(401);
});

test("TRIP-02: POST /api/trips → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.post("/api/trips", {
    data: { title: "Anon Trip", destination: "Paris", startDate: FUTURE_START, endDate: FUTURE_END },
  });
  console.log("TRIP-02:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── List & Create ───────────────────────────────────────────────────────────

test("TRIP-03: GET /api/trips → returns array for authenticated user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/trips");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("TRIP-03: trip count =", body.length);
});

test("TRIP-04: POST /api/trips → creates trip, returns 201 with id", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/trips", {
    data: {
      title: "Test Tokyo Trip",
      destination: "Tokyo, Japan",
      startDate: FUTURE_START,
      endDate: FUTURE_END,
    },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();
  expect(body).toHaveProperty("id");
  expect(body.title).toBe("Test Tokyo Trip");
  expect(body.destination).toBe("Tokyo, Japan");
  console.log("TRIP-04: created tripId =", body.id);
});

test("TRIP-05: POST /api/trips → 400 when end date before start date", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/trips", {
    data: {
      title: "Bad Dates Trip",
      destination: "London",
      startDate: "2027-01-17",
      endDate: "2027-01-10",
    },
  });
  console.log("TRIP-05:", resp.status());
  expect(resp.status()).toBe(400);
  const body = await resp.json();
  expect(body.message).toMatch(/end date/i);
});

// ─── Read & Ownership ────────────────────────────────────────────────────────

test("TRIP-06: GET /api/trips/:id → 404 for non-existent trip", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/trips/00000000-0000-0000-0000-000000000000");
  console.log("TRIP-06:", resp.status());
  expect(resp.status()).toBe(404);
});

test("TRIP-07: GET /api/trips/:id → returns trip owned by user", async ({ page }) => {
  await loginAs(page, "user");
  // First create a trip
  const create = await page.request.post("/api/trips", {
    data: { title: "Read Test Trip", destination: "Barcelona", startDate: FUTURE_START, endDate: FUTURE_END },
  });
  const { id } = await create.json();

  const resp = await page.request.get(`/api/trips/${id}`);
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.id).toBe(id);
  expect(body.destination).toBe("Barcelona");
  console.log("TRIP-07: trip read ok, destination:", body.destination);
});

// ─── Update ──────────────────────────────────────────────────────────────────

test("TRIP-08: PATCH /api/trips/:id → updates title and returns updated trip", async ({ page }) => {
  await loginAs(page, "user");
  const create = await page.request.post("/api/trips", {
    data: { title: "Before Update", destination: "Rome", startDate: FUTURE_START, endDate: FUTURE_END },
  });
  const { id } = await create.json();

  const resp = await page.request.patch(`/api/trips/${id}`, {
    data: { title: "After Update" },
  });
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.title).toBe("After Update");
  console.log("TRIP-08: update ok:", body.title);
});

test("TRIP-09: PATCH /api/trips/:id → 404 for non-existent trip", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.patch("/api/trips/00000000-0000-0000-0000-000000000000", {
    data: { title: "Ghost Trip" },
  });
  console.log("TRIP-09:", resp.status());
  expect(resp.status()).toBe(404);
});

// ─── Delete ──────────────────────────────────────────────────────────────────

test("TRIP-10: DELETE /api/trips/:id → 204 on success", async ({ page }) => {
  await loginAs(page, "user");
  const create = await page.request.post("/api/trips", {
    data: { title: "To Delete", destination: "Vienna", startDate: FUTURE_START, endDate: FUTURE_END },
  });
  const { id } = await create.json();

  const resp = await page.request.delete(`/api/trips/${id}`);
  console.log("TRIP-10: delete status:", resp.status());
  expect(resp.status()).toBe(204);

  // Verify gone
  const check = await page.request.get(`/api/trips/${id}`);
  expect(check.status()).toBe(404);
  console.log("TRIP-10: confirmed gone via GET");
});

// ─── Itinerary Items ─────────────────────────────────────────────────────────

test("TRIP-11: GET /api/trips/:tripId/itinerary-items → returns array", async ({ page }) => {
  await loginAs(page, "user");
  const create = await page.request.post("/api/trips", {
    data: { title: "Items Trip", destination: "Amsterdam", startDate: FUTURE_START, endDate: FUTURE_END },
  });
  const { id: tripId } = await create.json();

  const resp = await page.request.get(`/api/trips/${tripId}/itinerary-items`);
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("TRIP-11: itinerary items count:", body.length);
});

test("TRIP-12: POST /api/trips/:tripId/itinerary-items → adds item, returns 201", async ({ page }) => {
  await loginAs(page, "user");
  const create = await page.request.post("/api/trips", {
    data: { title: "Add Item Trip", destination: "Prague", startDate: FUTURE_START, endDate: FUTURE_END },
  });
  const { id: tripId } = await create.json();

  const resp = await page.request.post(`/api/trips/${tripId}/itinerary-items`, {
    data: {
      title: "Visit Old Town Square",
      dayNumber: 1,
      itemType: "activity",
      startTime: "10:00",
    },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();
  expect(body).toHaveProperty("id");
  expect(body.title).toBe("Visit Old Town Square");
  expect(body.dayNumber).toBe(1);
  console.log("TRIP-12: item created, id:", body.id);
});

// ─── Plancard ────────────────────────────────────────────────────────────────

test("TRIP-13: GET /api/trips/:tripId/plancard → returns plancard data shape", async ({ page }) => {
  await loginAs(page, "user");
  // Get an existing trip from the dashboard
  const trips = await page.request.get("/api/trips");
  const all = await trips.json();

  if (all.length === 0) {
    // Create one first
    const create = await page.request.post("/api/trips", {
      data: { title: "Plancard Test", destination: "Lisbon", startDate: FUTURE_START, endDate: FUTURE_END },
    });
    const { id } = await create.json();
    const resp = await page.request.get(`/api/trips/${id}/plancard`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty("trip");
    console.log("TRIP-13: plancard ok, destination:", body.trip?.destination);
  } else {
    const tripId = all[0].id;
    const resp = await page.request.get(`/api/trips/${tripId}/plancard`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty("trip");
    console.log("TRIP-13: plancard ok, destination:", body.trip?.destination);
  }
});

// ─── Itinerary Item Update & Delete ──────────────────────────────────────────

test("TRIP-14: PATCH /api/itinerary-items/:id → updates item title", async ({ page }) => {
  await loginAs(page, "user");
  const create = await page.request.post("/api/trips", {
    data: { title: "Update Item Trip", destination: "Budapest", startDate: FUTURE_START, endDate: FUTURE_END },
  });
  const { id: tripId } = await create.json();

  const addItem = await page.request.post(`/api/trips/${tripId}/itinerary-items`, {
    data: { title: "Original Title", dayNumber: 1, itemType: "activity" },
  });
  expect(addItem.status()).toBe(201);
  const { id: itemId } = await addItem.json();

  const resp = await page.request.patch(`/api/itinerary-items/${itemId}`, {
    data: { title: "Updated Title" },
  });
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.title).toBe("Updated Title");
  console.log("TRIP-14: item updated:", body.title);
});

test("TRIP-15: DELETE /api/itinerary-items/:id → 204 on success", async ({ page }) => {
  await loginAs(page, "user");
  const create = await page.request.post("/api/trips", {
    data: { title: "Delete Item Trip", destination: "Krakow", startDate: FUTURE_START, endDate: FUTURE_END },
  });
  const { id: tripId } = await create.json();

  const addItem = await page.request.post(`/api/trips/${tripId}/itinerary-items`, {
    data: { title: "Delete Me", dayNumber: 1, itemType: "activity" },
  });
  const { id: itemId } = await addItem.json();

  const resp = await page.request.delete(`/api/itinerary-items/${itemId}`);
  console.log("TRIP-15: delete item status:", resp.status());
  expect([200, 204]).toContain(resp.status());
  console.log("TRIP-15: item deleted ok");
});

// ─── E2E Flow ────────────────────────────────────────────────────────────────

test("TRIP-16: E2E — create trip → add 2 items → update → verify → delete", async ({ page }) => {
  await loginAs(page, "user");

  // 1. Create trip
  const createResp = await page.request.post("/api/trips", {
    data: {
      title: "E2E Test Trip",
      destination: "Dubrovnik, Croatia",
      startDate: FUTURE_START,
      endDate: FUTURE_END,
    },
  });
  expect(createResp.status()).toBe(201);
  const { id: tripId } = await createResp.json();
  console.log("TRIP-16 Step 1: trip created:", tripId);

  // 2. Verify trip appears in list
  const listResp = await page.request.get("/api/trips");
  const trips = await listResp.json();
  const found = trips.find((t: any) => t.id === tripId);
  expect(found).toBeTruthy();
  console.log("TRIP-16 Step 2: trip in list ✓");

  // 3. Add Day 1 morning activity
  const item1 = await page.request.post(`/api/trips/${tripId}/itinerary-items`, {
    data: { title: "Walk Old City Walls", dayNumber: 1, itemType: "activity", startTime: "09:00", durationMinutes: 120 },
  });
  expect(item1.status()).toBe(201);
  const { id: item1Id } = await item1.json();
  console.log("TRIP-16 Step 3: item1 added:", item1Id);

  // 4. Add Day 1 afternoon activity
  const item2 = await page.request.post(`/api/trips/${tripId}/itinerary-items`, {
    data: { title: "Stradun Street Lunch", dayNumber: 1, itemType: "meal", startTime: "13:00", durationMinutes: 90 },
  });
  expect(item2.status()).toBe(201);
  const { id: item2Id } = await item2.json();
  console.log("TRIP-16 Step 4: item2 added:", item2Id);

  // 5. Verify itinerary has both items
  const itemsResp = await page.request.get(`/api/trips/${tripId}/itinerary-items`);
  const items = await itemsResp.json();
  expect(Array.isArray(items)).toBe(true);
  const myItems = items.filter((i: any) => i.tripId === tripId);
  expect(myItems.length).toBeGreaterThanOrEqual(2);
  console.log("TRIP-16 Step 5: items count:", myItems.length, "✓");

  // 6. Update trip title
  const updateResp = await page.request.patch(`/api/trips/${tripId}`, {
    data: { title: "E2E Updated Trip" },
  });
  expect(updateResp.status()).toBe(200);
  const updated = await updateResp.json();
  expect(updated.title).toBe("E2E Updated Trip");
  console.log("TRIP-16 Step 6: title updated ✓");

  // 7. Get plancard
  const plancard = await page.request.get(`/api/trips/${tripId}/plancard`);
  expect(plancard.status()).toBe(200);
  const plancardBody = await plancard.json();
  expect(plancardBody).toHaveProperty("trip");
  console.log("TRIP-16 Step 7: plancard ok ✓");

  // 8. Delete trip (cascades itinerary items)
  const delResp = await page.request.delete(`/api/trips/${tripId}`);
  expect(delResp.status()).toBe(204);
  const checkResp = await page.request.get(`/api/trips/${tripId}`);
  expect(checkResp.status()).toBe(404);
  console.log("TRIP-16 Step 8: trip deleted and confirmed gone ✓");
  console.log("TRIP-16 E2E complete ✓");
});
