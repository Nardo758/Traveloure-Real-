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
