import { test, expect } from "@playwright/test";

test.describe("Phase 6 - API Health Smoke Tests", () => {
  test("health endpoint responds", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("service categories endpoint returns data", async ({ request }) => {
    const res = await request.get("/api/service-categories");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("experience types endpoint returns data", async ({ request }) => {
    const res = await request.get("/api/experience-types");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("experts endpoint returns array", async ({ request }) => {
    const res = await request.get("/api/experts");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("auth/user returns 401 when not logged in", async ({ request }) => {
    const res = await request.get("/api/auth/user");
    expect(res.status()).toBe(401);
  });

  test("admin payouts requires auth (returns 401 not 500)", async ({ request }) => {
    const res = await request.get("/api/admin/payouts");
    expect([401, 403]).toContain(res.status());
  });

  test("conversations endpoint requires auth", async ({ request }) => {
    const res = await request.get("/api/conversations");
    expect([401, 403]).toContain(res.status());
  });

  test("discovery gems endpoint is public and returns array", async ({ request }) => {
    const res = await request.get("/api/discovery/gems");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("gems");
  });

  test("login with valid credentials returns user object", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { email: "testuser@traveloure.test", password: "TestPass123!" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe("testuser@traveloure.test");
    expect(body.user.role).toBe("user");
  });

  test("login with invalid credentials returns 401", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { email: "testuser@traveloure.test", password: "WrongPassword!" },
    });
    expect(res.status()).toBe(401);
  });

  test("logout endpoint works", async ({ request }) => {
    // First login to get a session
    await request.post("/api/auth/login", {
      data: { email: "testuser@traveloure.test", password: "TestPass123!" },
    });
    const res = await request.post("/api/auth/logout");
    expect(res.status()).toBe(200);
  });
});
