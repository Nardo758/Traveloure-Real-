import { Router, type Request, type Response, type NextFunction } from "express";
import { resolveCanonicalCity } from "../utils/canonical-city";

const router = Router();

/**
 * GET /discover/location/:city — 301 to the canonical city casing.
 *
 * The page is an SPA route (Vite/static catch-all), and the marketplace reads are
 * now case-insensitive (location-view.service.ts), so a mis-cased URL already
 * renders the right feed. This canonicalises the URL itself so shares, browser
 * history, and the recently-viewed rail (which re-emits the raw route param —
 * layout.tsx:379, discover-location.tsx:1590/1603) settle on ONE casing
 * ("Kyoto"), not a mix. Must be registered BEFORE the SPA catch-all (it is —
 * registerRoutes runs before setupVite/mountSpaFallback).
 *
 * - Unknown city OR already-canonical casing ⇒ next() → the SPA serves the page.
 * - The query string (?country=…&date=…) is preserved on the redirect.
 * - A resolver failure falls through to the SPA rather than 500ing a page load.
 */
router.get("/discover/location/:city", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.params.city ?? ""; // Express has already URL-decoded the param.
    if (!raw) return next();
    const canonical = await resolveCanonicalCity(raw);
    if (!canonical || canonical === raw) return next();
    const qIdx = req.originalUrl.indexOf("?");
    const qs = qIdx >= 0 ? req.originalUrl.slice(qIdx) : "";
    return res.redirect(301, `/discover/location/${encodeURIComponent(canonical)}${qs}`);
  } catch {
    return next();
  }
});

export default router;
