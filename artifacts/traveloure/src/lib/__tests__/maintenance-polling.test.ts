// Tests for the maintenance-mode auto-recovery poller (client/src/lib/maintenance.ts).
// Run: npx tsx --test client/src/lib/__tests__/maintenance-polling.test.ts
//
// The module is browser code (window, fetch), so we stub a minimal window
// before importing it, and drive the 30s poll interval with mocked timers.

import { test, mock } from "node:test";
import assert from "node:assert/strict";

// ── Minimal window/global stubs (must exist before the module is imported) ──
let reloadCount = 0;
const fetchCalls: string[] = [];
let fetchImpl: () => Promise<Response> = async () => {
  throw new Error("fetchImpl not set");
};

const fakeWindow = {
  dispatchEvent: (_e: Event) => true,
  addEventListener: (_t: string, _l: unknown) => {},
  removeEventListener: (_t: string, _l: unknown) => {},
  location: {
    origin: "https://app.example.com",
    reload: () => {
      reloadCount++;
    },
  },
  fetch: (..._args: unknown[]) => fetchImpl(),
};

(globalThis as any).window = fakeWindow;
(globalThis as any).fetch = (input: any, _init?: any) => {
  fetchCalls.push(String(input));
  return fetchImpl();
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const { checkMaintenanceResponse, MAINTENANCE_POLL_INTERVAL_MS } = await import(
  "../maintenance"
);

test("maintenance poller reloads only on a healthy response", async (t) => {
  mock.timers.enable({ apis: ["setInterval"] });
  t.after(() => mock.timers.reset());

  // Activate maintenance mode via the real entry point.
  await checkMaintenanceResponse(
    jsonResponse(503, { maintenance: true, message: "Down for a bit" }),
  );

  const tick = async () => {
    mock.timers.tick(MAINTENANCE_POLL_INTERVAL_MS);
    // Let the async probe settle.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  };

  // 1. Still in maintenance: 503 { maintenance: true } → no reload.
  fetchImpl = async () => jsonResponse(503, { maintenance: true });
  await tick();
  assert.equal(reloadCount, 0, "maintenance 503 must not reload");

  // 2. Non-maintenance 503 (e.g. /api/health with unhealthy DB) → no reload.
  fetchImpl = async () => jsonResponse(503, { status: "error", db: false });
  await tick();
  assert.equal(reloadCount, 0, "unhealthy-DB 503 must not reload");

  // 3. Network failure mid-restart → no reload, keep polling.
  fetchImpl = async () => {
    throw new TypeError("network error");
  };
  await tick();
  assert.equal(reloadCount, 0, "network error must not reload");

  // 4. Healthy 200 → exactly one reload, and polling stops.
  fetchImpl = async () => jsonResponse(200, { status: "ok", db: true });
  await tick();
  assert.equal(reloadCount, 1, "healthy 200 must trigger reload");

  const callsAtRecovery = fetchCalls.length;
  await tick();
  await tick();
  assert.equal(fetchCalls.length, callsAtRecovery, "polling must stop after recovery");
  assert.equal(reloadCount, 1, "no further reloads after recovery");

  // Sanity: the probe hits the health endpoint.
  assert.ok(
    fetchCalls.every((u) => u === "/api/health"),
    "probe must target /api/health",
  );
});
