/**
 * Pure sitemap and per-route head output (row 258).
 * The canonical origin is SITE_ORIGIN. This module imports nothing from the
 * database so the output can be tested without DATABASE_URL.
 */
import { SITE_ORIGIN } from "@shared/site-origin";

export { SITE_ORIGIN };

export const escXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function sitemapUrlsFor(input: {
  staticRoutes: readonly string[];
  services: readonly { id: string; updatedAt?: { toISOString(): string } | null }[];
  readyMade: readonly { id: string; updatedAt?: { toISOString(): string } | null }[];
  storefronts: readonly { handle: string | null }[];
  blog: readonly { path: string; lastmod?: string }[];
}): { loc: string; lastmod?: string }[] {
  const { staticRoutes, services, readyMade, storefronts, blog } = input;
  return [
    ...staticRoutes.map((r) => ({ loc: `${SITE_ORIGIN}${r}` })),
    ...services.map((s) => ({
      loc: `${SITE_ORIGIN}/services/${s.id}`,
      lastmod: s.updatedAt?.toISOString().slice(0, 10),
    })),
    ...readyMade.map((r) => ({
      loc: `${SITE_ORIGIN}/ready-made/${r.id}`,
      lastmod: r.updatedAt?.toISOString().slice(0, 10),
    })),
    ...storefronts
      .filter((u) => !!u.handle)
      .map((u) => ({ loc: `${SITE_ORIGIN}/s/${u.handle}` })),
    ...blog.map((b) => ({ loc: `${SITE_ORIGIN}${b.path}`, lastmod: b.lastmod })),
  ];
}

export function buildSitemapXml(urls: readonly { loc: string; lastmod?: string }[]): string {
  const body = urls
    .map(
      (u) =>
        `  <url><loc>${escXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function routeHeadTags(
  meta: { title: string; description: string },
  routePath: string,
): string {
  const canonical = `${SITE_ORIGIN}${routePath}`;
  return [
    `<title>${escHtml(meta.title)}</title>`,
    `<meta name="description" content="${escHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escHtml(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escHtml(canonical)}" />`,
    `<meta property="og:title" content="${escHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escHtml(meta.description)}" />`,
    `<meta property="og:image" content="${SITE_ORIGIN}/og-cover.png" />`,
    `<meta property="og:site_name" content="Traveloure" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${SITE_ORIGIN}/og-cover.png" />`,
  ].join("\n    ");
}
