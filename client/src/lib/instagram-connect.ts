/**
 * instagram-connect.ts
 *
 * Shared Instagram OAuth-connect kickoff. ONE implementation, reused by Content Studio's
 * "Connect Instagram" banner AND the D4 share-kit publish button (share-tools.tsx) — so a
 * second OAuth-redirect implementation never forks from this one (server/routes/instagram.ts
 * stays the single publish/OAuth backend either way).
 *
 * Fetches the Meta app id from the existing public GET /api/instagram/config (so a missing config is
 * reported here, without leaving the page), then sends the browser to GET /api/instagram/authorize,
 * which issues the OAuth `state` and redirects to Instagram; GET /api/instagram/callback checks that
 * state, completes the flow and stores the token server-side.
 */
export type InstagramConnectResult =
  | { ok: true }
  | { ok: false; reason: "missing_config" | "network_error" };

export async function connectInstagram(): Promise<InstagramConnectResult> {
  try {
    const configRes = await fetch("/api/instagram/config");
    const config = await configRes.json();
    const clientId = config?.appId;
    if (!clientId) {
      return { ok: false, reason: "missing_config" };
    }

    // The server builds the authorize URL and issues the one-time OAuth `state` it will check on
    // the callback (board task #1545, ledger `2026-09-23-phase1-security`). The flow returns to the
    // page it started from, so a provider no longer lands on the expert content studio.
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/api/instagram/authorize?returnTo=${returnTo}`;
    return { ok: true };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}
