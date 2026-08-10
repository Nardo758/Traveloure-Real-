/**
 * instagram-connect.ts
 *
 * Shared Instagram OAuth-connect kickoff. ONE implementation, reused by Content Studio's
 * "Connect Instagram" banner AND the D4 share-kit publish button (share-tools.tsx) — so a
 * second OAuth-redirect implementation never forks from this one (server/routes/instagram.ts
 * stays the single publish/OAuth backend either way).
 *
 * Fetches the Meta app id from the existing public GET /api/instagram/config, then redirects the
 * browser into Instagram's OAuth consent screen; the existing GET /api/instagram/callback
 * completes the flow and stores the token server-side.
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

    const redirectUri = encodeURIComponent(`${window.location.origin}/api/instagram/callback`);
    const scope = encodeURIComponent("instagram_business_basic,instagram_business_content_publish");
    const authUrl = `https://www.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;

    window.location.href = authUrl;
    return { ok: true };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}
