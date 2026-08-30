// Dev-only HTML transform registry, kept dependency-free (no `vite` import here) so this
// module is safe to import from any server file — including OG-injection routes that also
// build the production bundle. `server/vite.ts` (dev-only) registers the real transformer
// after it creates the Vite dev server; in production nothing ever calls
// registerViteHtmlTransformer, so transformDevHtml is a pass-through.
let transformer: ((url: string, html: string) => Promise<string>) | null = null;

export function registerViteHtmlTransformer(fn: (url: string, html: string) => Promise<string>) {
  transformer = fn;
}

export async function transformDevHtml(url: string, html: string): Promise<string> {
  if (!transformer) return html;
  return transformer(url, html);
}
