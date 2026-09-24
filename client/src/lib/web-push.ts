/**
 * Phone push on this browser — the client half (Locked Decision 53, ledger `2026-09-24-web-push`).
 *
 * `derivePhonePushState` is the ONE answer to "what should the phone-notifications card say?"
 * (pure, unit-tested); the rest is the thin browser plumbing that registers `/sw.js`, asks for
 * permission, and hands the subscription to `POST /api/push/subscriptions`.
 *
 * §13: every state is a fact about this browser or this server. "Unavailable" (no VAPID keys) is
 * not "off", and on an iPhone that has not added Traveloure to its Home Screen the card says so
 * rather than offering a button that cannot work — iOS only exposes push to an installed web app
 * (iOS 16.4+).
 */

export type PhonePushState =
  | "loading"
  | "unavailable"
  | "ios_needs_install"
  | "unsupported"
  | "denied"
  | "off"
  | "on";

export interface PhonePushFacts {
  /** From GET /api/push/config; undefined while loading. */
  serverAvailable: boolean | undefined;
  /** serviceWorker + PushManager + Notification all present. */
  supported: boolean;
  isIos: boolean;
  /** Running as an installed web app (display-mode: standalone). */
  standalone: boolean;
  permission: NotificationPermission | "unknown";
  /** Whether THIS browser is registered to the signed-in account; undefined while loading. */
  subscribedHere: boolean | undefined;
}

export function derivePhonePushState(f: PhonePushFacts): PhonePushState {
  if (f.serverAvailable === undefined) return "loading";
  if (!f.serverAvailable) return "unavailable";
  if (f.isIos && !f.standalone) return "ios_needs_install";
  if (!f.supported) return "unsupported";
  if (f.permission === "denied") return "denied";
  if (f.subscribedHere === undefined) return "loading";
  return f.subscribedHere && f.permission === "granted" ? "on" : "off";
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS reports itself as a Mac; a touch-capable "Mac" is an iPad.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as any).standalone === true;
}

export function currentPermission(): NotificationPermission | "unknown" {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unknown";
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function existingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Is THIS browser registered to the signed-in account? */
export async function isSubscribedHere(): Promise<boolean> {
  const sub = await existingSubscription();
  if (!sub) return false;
  const res = await fetch(`/api/push/subscriptions/status?endpointHash=${await sha256Hex(sub.endpoint)}`, {
    credentials: "include",
  });
  if (!res.ok) return false;
  const body = await res.json();
  return body?.subscribed === true;
}

/** Ask permission, subscribe this browser, and register it to the signed-in account. */
export async function enablePhonePush(publicKey: string): Promise<"on" | "denied"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));
  const json = sub.toJSON();
  const res = await fetch("/api/push/subscriptions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } }),
  });
  if (!res.ok) throw new Error(`subscribe failed: ${res.status}`);
  return "on";
}

/** Remove this browser from the signed-in account and drop the browser's subscription. */
export async function disablePhonePush(): Promise<void> {
  const sub = await existingSubscription();
  if (!sub) return;
  await fetch("/api/push/subscriptions", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

/**
 * Called on sign-out: a shared device must stop receiving the account's notices. Bounded so a slow
 * network never holds up signing out.
 */
export async function forgetPhonePushOnSignOut(timeoutMs = 1500): Promise<void> {
  try {
    await Promise.race([disablePhonePush(), new Promise((r) => setTimeout(r, timeoutMs))]);
  } catch {
    /* signing out never fails on push cleanup */
  }
}
