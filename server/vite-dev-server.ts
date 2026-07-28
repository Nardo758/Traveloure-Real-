// Tiny registry for the dev-only Vite server instance — deliberately imports NOTHING
// from the `vite` package so route modules (storefront.routes.ts OG injection) can read
// it without pulling vite into the production bundle/runtime. setupVite (dev-only,
// dynamically imported in server/index.ts) sets it; production never does, so
// getViteDevServer() returns null there and OG templates are served untransformed.
//
// Why routes need it at all: raw client/index.html lacks the @vitejs/plugin-react
// refresh preamble, so dev responses that bypass vite's catch-all must be run through
// vite.transformIndexHtml or the SPA throws "can't detect preamble" and renders blank.

export interface HtmlTransformer {
  transformIndexHtml(url: string, html: string): Promise<string>;
}

let viteDevServer: HtmlTransformer | null = null;

export function setViteDevServer(server: HtmlTransformer) {
  viteDevServer = server;
}

export function getViteDevServer(): HtmlTransformer | null {
  return viteDevServer;
}
