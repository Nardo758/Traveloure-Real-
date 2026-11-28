/**
 * Server-rendered <head> helpers. `buildItineraryViewOgTags`: the tags for a shared itinerary page (`GET /itinerary-view/:token`). Pure.
 *
 * Every value is ESCAPED AT RENDER (board #1318 audit). `destination` is traveler text, and two
 * write paths (`POST /api/itinerary-comparisons`, the AI generate route) store it with no sanitizing
 * at all, so this page may not rely on anything done on write: unescaped, a destination containing
 * `"` broke out of a `content="…"` attribute and one containing `<` injected markup into <head>.
 */
import { escHtml } from "./email-escape";

export function buildItineraryViewOgTags(input: {
  destination: string;
  variantName: string;
  shareUrl: string;
}): string {
  const { destination, variantName, shareUrl } = input;
  const title = escHtml(`${variantName} – ${destination} | Traveloure`);
  const description = escHtml(
    `Explore this AI-powered itinerary for ${destination}. View day-by-day activities, transport options, and more — shared via Traveloure.`,
  );
  const url = escHtml(shareUrl);
  // S5d (ledger `2026-11-28-photo-rule-a-b-d`): the og:image is the app's OWN cover, not a stock search.
  // `source.unsplash.com` is a retired Unsplash endpoint, so every shared itinerary carried a broken social
  // card; the brand asset is ours, needs no credit, and is in the photo rule. The origin comes from the share
  // link itself, so the tag is absolute wherever the app is served from.
  const origin = (() => {
    try {
      return new URL(shareUrl).origin;
    } catch {
      return "";
    }
  })();
  const ogImage = escHtml(`${origin}/og-cover.png`);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:site_name" content="Traveloure" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
  ].join("\n    ");
}

/** Put tags at the top of <head>. A FUNCTION replacement, so `$&` / `$'` in user text stay literal. */
export function injectIntoHead(template: string, tags: string): string {
  return template.replace("<head>", () => `<head>\n    ${tags}`);
}
