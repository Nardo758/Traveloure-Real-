import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Ruling 60 Phase A — chrome i18n. Imported for its side effect (i18next.init) BEFORE the tree
// renders, so the very first paint is already in the resolved locale (no English flash for a
// ja-JP browser). Resolution steps 2-4 run here; step 1 (account preference) lands in useLocale.
import "@/lib/i18n";
import { installMaintenanceFetchInterceptor } from "@/lib/maintenance";
import { initGa4 } from "@/lib/ga4";
// §8 phone delivery: catch the browser's Add to Home Screen offer before it is missed.
import "@/lib/install-prompt";

installMaintenanceFetchInterceptor();
// TG-1: the GA4 tag — a no-op unless VITE_GA_MEASUREMENT_ID is set at build.
initGa4();

createRoot(document.getElementById("root")!).render(<App />);
