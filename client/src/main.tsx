import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Ruling 60 Phase A — chrome i18n. Imported for its side effect (i18next.init) BEFORE the tree
// renders, so the very first paint is already in the resolved locale (no English flash for a
// ja-JP browser). Resolution steps 2-4 run here; step 1 (account preference) lands in useLocale.
import "@/lib/i18n";
import { installMaintenanceFetchInterceptor } from "@/lib/maintenance";
import { initGa4, grantAnalyticsConsent, denyAnalyticsConsent } from "@/lib/ga4";
import { readStoredConsent } from "@/lib/analytics-consent";
// §8 phone delivery: catch the browser's Add to Home Screen offer before it is missed.
import "@/lib/install-prompt";

installMaintenanceFetchInterceptor();
// TG-1: the GA4 tag — a no-op unless VITE_GA_MEASUREMENT_ID is set at build.
initGa4();
// CB-1: replay the visitor's stored banner choice, synchronously, inside the tag's 500 ms wait_for_update window.
replayStoredAnalyticsConsent();

function replayStoredAnalyticsConsent(): void {
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  const stored = readStoredConsent(storage);
  if (stored === "granted") grantAnalyticsConsent();
  else if (stored === "denied") denyAnalyticsConsent();
}

createRoot(document.getElementById("root")!).render(<App />);
