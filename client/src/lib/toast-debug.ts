/**
 * R4-3 part 2 — the QA-only toast logger. It OBSERVES; it never changes the store.
 *
 * OFF unless the page asks for it: `?debugToasts=1` in the URL, or `localStorage.debugToasts === "1"`.
 * The answer is memoised on first use ("read once at load"), so a query-string change mid-session does
 * not flip it under a running session. With it off, every call here is a cheap boolean and nothing is
 * written anywhere — no behaviour change, no new user-facing string.
 *
 * One `console.info("[toast] …")` line per event, JSON payload:
 *   add       { id, title, duration, at }
 *   dismiss   { id, title, at, reason, ms, … }   reason ∈ timer | user | replaced | programmatic
 *             • "timer"        Radix closed it at/after its duration (elapsed is the evidence)
 *             • "user"         closed BEFORE its duration — close button, Escape, swipe, action click
 *             • "replaced"     evicted by TOAST_LIMIT when a new toast was added (names the replacer)
 *             • "programmatic" someone called dismiss(); carries the caller's top stack line
 *
 * `ms` is measured from that toast's own add. The add time is kept per id in this module's map, which is
 * the only state it owns.
 */

type ToastDebugReason = "timer" | "user" | "replaced" | "programmatic";

let debugOnce: boolean | null = null;
const addedAt = new Map<string, number>();

/** Test seam + the one place the memo is cleared. Production never calls it. */
export function __resetToastDebugForTests(): void {
  debugOnce = null;
  addedAt.clear();
}

export function toastDebugEnabled(): boolean {
  if (debugOnce !== null) return debugOnce;
  try {
    if (typeof window === "undefined") {
      debugOnce = false;
      return debugOnce;
    }
    const fromUrl = new URLSearchParams(window.location?.search ?? "").get("debugToasts") === "1";
    const fromStorage = window.localStorage?.getItem("debugToasts") === "1";
    debugOnce = Boolean(fromUrl || fromStorage);
  } catch {
    debugOnce = false;
  }
  return debugOnce;
}

function titleOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value == null) return null;
  return String(value);
}

export function logToastAdd(id: string, title: unknown, duration: unknown): void {
  if (!toastDebugEnabled()) return;
  const at = Date.now();
  addedAt.set(id, at);
  console.info("[toast] " + JSON.stringify({ event: "add", id, title: titleOf(title), duration: duration ?? null, at }));
}

export function logToastDismiss(
  id: string,
  title: unknown,
  reason: ToastDebugReason,
  extra: Record<string, unknown> = {},
): void {
  if (!toastDebugEnabled()) return;
  const at = Date.now();
  const added = addedAt.get(id);
  addedAt.delete(id);
  console.info(
    "[toast] " +
      JSON.stringify({
        event: "dismiss",
        id,
        title: titleOf(title),
        at,
        reason,
        ms: added == null ? null : at - added,
        ...extra,
      }),
  );
}

/** The caller's top line outside this module — what "programmatic" needs to name its source. */
export function toastCallerLine(): string | null {
  const stack = new Error().stack?.split("\n") ?? [];
  const line = stack.find((l) => !l.includes("use-toast") && !l.includes("toast-debug") && l.trim().startsWith("at "));
  return line ? line.trim().replace(/^at\s+/, "") : null;
}

/**
 * Radix reports "closed" for BOTH its own timer and a user close, so the elapsed time is the only
 * evidence inside this callback. A quarter-second of tolerance keeps a timer that fires marginally early
 * from being mislabelled as a user close.
 */
export function toastCloseReason(elapsedMs: number, durationMs: number): ToastDebugReason {
  return elapsedMs + 250 >= durationMs ? "timer" : "user";
}
