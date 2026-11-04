/**
 * N-5 (round 2, ledger `2026-11-04-round2-exp-qa`): a route-specific browser tab title on pages that carry no SEOHead
 * (the plan pages). The title is the page's own data — the plan's name — followed by " | Traveloure", the suffix
 * SEOHead uses; with no data yet the tab reads "Traveloure". No new words. On unmount the tab returns to
 * "Traveloure", so a later page with no title of its own never inherits a plan's name (the bug in reverse).
 */
import { useEffect } from "react";

const SITE_NAME = "Traveloure";

/** Pure: the tab title for a page's own name. */
export function documentTitleFor(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  return n ? `${n} | ${SITE_NAME}` : SITE_NAME;
}

export function useDocumentTitle(name: string | null | undefined): void {
  const title = documentTitleFor(name);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = title;
    return () => {
      document.title = SITE_NAME;
    };
  }, [title]);
}
