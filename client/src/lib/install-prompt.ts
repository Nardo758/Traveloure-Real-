// §8 phone delivery (ledger `2026-10-17-phone-delivery-calendar`): Add to Home Screen. Chrome and Edge on Android fire
// `beforeinstallprompt` once, early, so it is caught at startup (imported by main.tsx) and kept for the chooser's
// button. iPhone Safari never fires it: the chooser shows the Share → Add to Home Screen steps instead. Nothing here
// stores anything or claims the page works offline.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
  });
}

/** True when the browser offered an install prompt we can show. */
export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** Show the browser's own install prompt; "unavailable" when the browser offered none. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = deferred;
  if (!e) return "unavailable";
  deferred = null;
  await e.prompt();
  return (await e.userChoice).outcome;
}

/** True when this page is already running from the Home Screen. */
export function runningFromHomeScreen(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as any).standalone === true;
}
