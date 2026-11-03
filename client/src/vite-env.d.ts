/// <reference types="vite/client" />

// TG-1 (ledger `2026-11-03-tg1-ga4-tag`): the client's VITE_ env keys, typed. Vite inlines them at BUILD,
// so a deployment must set them as build-time secrets (a runtime-only secret ships an empty string).
interface ImportMetaEnv {
  /** GA4 measurement id (`G-…`). Unset ⇒ no GA tag at all (`lib/ga4.ts`). */
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY_TEST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
