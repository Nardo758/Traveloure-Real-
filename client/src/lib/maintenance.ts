// Client-side detection of the server's maintenance-mode gate.
// The gate (server/routes.ts) returns 503 { maintenance: true, message } for
// non-admin API requests while maintenance mode is on. queryClient calls
// checkMaintenanceResponse() on every non-ok response; when a maintenance 503
// is seen we flip a module-level flag and emit an event so the app root can
// swap in the full-screen MaintenanceGate. Admins never receive these 503s
// (exempted server-side), so their experience is unchanged.

export const MAINTENANCE_EVENT = "app:maintenance-mode";

let active = false;
let message: string | null = null;

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
