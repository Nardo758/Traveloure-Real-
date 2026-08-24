// Provider Console — overview/shell frame.
// Renders the doc's console shell with the default Catalog screen (list mode),
// identical to docs/design/provider-console-mockup/mockup.html. The shell and
// listing data live in CatalogList/_consoleShared so this frame cannot drift.

import { CatalogList } from "./CatalogList";

export function ProviderConsole() {
  return <CatalogList />;
}
