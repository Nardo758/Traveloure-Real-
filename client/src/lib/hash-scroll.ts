/**
 * Scroll the page to the element named by the URL hash.
 *
 * Cold load: the effect runs once the section is in the document, and the hash
 * is already on `window.location`. In-app navigation (wouter): the same effect
 * runs again when the location changes, and a hash-only change fires
 * `hashchange`. `/kyoto#experts` is the expert form (`section#experts`).
 */

export function hashElementId(hash: string | null | undefined): string | null {
  const id = (hash ?? "").replace(/^#/, "").trim();
  return id.length > 0 ? id : null;
}

export function scrollToLocationHash(
  loc: { hash: string },
  doc: { getElementById(id: string): { scrollIntoView: (opts?: ScrollIntoViewOptions) => void } | null },
): boolean {
  const id = hashElementId(loc.hash);
  if (!id) return false;
  const el = doc.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ block: "start" });
  return true;
}
