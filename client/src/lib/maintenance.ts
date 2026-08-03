// Client-side detection of the server's maintenance-mode gate.
// The gate (server/routes.ts) returns 503 { maintenance: true, message } for
// non-admin API requests while maintenance mode is on. queryClient calls
// checkMaintenanceResponse() on every non-ok response; when a maintenance 503
// is seen we flip a module-level flag and emit an event so the app root can
// swap in the full-screen MaintenanceGate. Admins never receive these 503s
// (exempted server-side), so their experience is unchanged.

export const MAINTENANCE_EVENT = "app:maintenance-mode";

/** How often (ms) to ping the server while the maintenance screen is up. */
export const MAINTENANCE_POLL_INTERVAL_MS = 30_000;
/** Lightweight public endpoint used to probe whether maintenance has ended. */
const MAINTENANCE_PROBE_PATH = "/api/health";

let active = false;
let message: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function isMaintenanceActive(): boolean {
  return active;
}

export function getMaintenanceMessage(): string | null {
  return message;
}

function activate(msg?: string) {
  if (msg) message = msg;
  if (active) return;
  active = true;
  window.dispatchEvent(new Event(MAINTENANCE_EVENT));
  startMaintenancePolling();
}

/**
 * While the maintenance screen is shown, periodically ping a lightweight
 * endpoint. As soon as the server stops answering 503 { maintenance: true },
 * reload the page so the visitor resumes automatically — no manual refresh.
 * Idempotent: repeated calls won't stack timers.
 */
function startMaintenancePolling(): void {
  if (pollTimer !== null) return;
  const probe = async () => {
    try {
      const res = await fetch(MAINTENANCE_PROBE_PATH, {
        cache: "no-store",
        credentials: "same-origin",
      });
      // Only an explicitly healthy (2xx) response counts as recovered.
      // Anything else — the maintenance 503, a DB-unhealthy 503 from
      // /api/health, a 5xx while the server restarts — means keep waiting,
      // otherwise a flapping backend would cause a 30s reload loop.
      if (!res.ok) return;
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      window.location.reload();
    } catch {
      // Network error (server restarting mid-maintenance) — keep polling.
    }
  };
  pollTimer = setInterval(() => void probe(), MAINTENANCE_POLL_INTERVAL_MS);
}

/**
 * Inspect a failed API response; if it is the maintenance-gate 503, trigger
 * the maintenance screen. Safe to call with any Response — non-JSON bodies
 * and other statuses are ignored. Uses a clone so the caller can still read
 * the body.
 */
export async function checkMaintenanceResponse(res: Response): Promise<void> {
  if (res.status !== 503) return;
  try {
    const body = await res.clone().json();
    if (body && body.maintenance === true) {
      activate(typeof body.message === "string" ? body.message : undefined);
    }
  } catch {
    // Not JSON — a plain 503 from elsewhere; ignore.
  }
}

/**
 * Global coverage: the client has many direct `fetch` calls that bypass the
 * shared queryClient helpers. Wrapping window.fetch once at startup means
 * ANY same-origin /api response of 503 { maintenance: true } triggers the
 * maintenance screen, no matter which code path made the request.
 * Installed from main.tsx before the app renders.
 */
export function installMaintenanceFetchInterceptor(): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await originalFetch(input, init);
    if (res.status === 503) {
      try {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        // Only same-origin API calls — external 503s are unrelated.
        const path = new URL(url, window.location.origin);
        if (path.origin === window.location.origin && path.pathname.startsWith("/api")) {
          // Fire-and-forget: don't delay the caller's own body handling.
          void checkMaintenanceResponse(res);
        }
      } catch {
        // URL parsing failure — ignore.
      }
    }
    return res;
  };
}
