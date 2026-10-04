import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    // Keep lazy-loaded console pages and React Query on the same React runtime. Without
    // this, Vite can prebundle a second React entry during HMR and React Query hooks
    // fail with "Invalid hook call" only after navigating into a code-split route.
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  // R300: the browser's Google Maps key is its OWN variable, `GOOGLE_MAPS_BROWSER_KEY`, so it can be
  // restricted (HTTP referrers, Maps JavaScript API only) apart from the server's `GOOGLE_MAPS_API_KEY`
  // (which must never reach the bundle — this prefix does not match it). `VITE_` stays for every
  // other client variable.
  envPrefix: ["VITE_", "GOOGLE_MAPS_BROWSER_"],
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
