/**
 * PWA wiring — Phase 3 (SMS/PWA delivery lane).
 *
 * Service-worker registration, install-prompt capture, and web-push SUBSCRIPTION
 * plumbing only. No send layer. The push-permission prompt is requested at an
 * explicit intent moment (see PwaController) — never on first load.
 */

let deferredInstallPrompt: any = null;

/** Register the service worker (production only — avoids dev/HMR conflicts). */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.warn("[pwa] service worker registration failed", err));
  });
}

/** Capture beforeinstallprompt so we can offer install at an intent moment. */
export function captureInstallPrompt(onAvailable: () => void): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    onAvailable();
  });
}

export function canInstall(): boolean {
  return !!deferredInstallPrompt;
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredInstallPrompt) return "unavailable";
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  return choice?.outcome === "accepted" ? "accepted" : "dismissed";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Request notification permission, create a push subscription, and persist it.
 * Call ONLY at an intent moment. Idempotent: returns early if already subscribed
 * or denied. Phase 3 stores the subscription; nothing is sent to it yet.
 */
export async function ensurePushSubscription(): Promise<
  "subscribed" | "denied" | "unsupported" | "skipped"
> {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return "subscribed";
    if (Notification.permission === "denied") return "denied";

    const perm =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (perm !== "granted") return perm === "denied" ? "denied" : "skipped";

    const keyRes = await fetch("/api/push/vapid-public-key");
    if (!keyRes.ok) return "skipped";
    const { publicKey } = await keyRes.json();
    if (!publicKey) return "skipped";

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = sub.toJSON();
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    return "subscribed";
  } catch (err) {
    console.warn("[pwa] push subscription failed", err);
    return "skipped";
  }
}
