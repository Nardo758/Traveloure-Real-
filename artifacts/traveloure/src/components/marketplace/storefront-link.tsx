/**
 * StorefrontLink — the marketplace RETURN PATH (MP-2, Jul 30 2026).
 *
 * The bridge problem this solves: before this component, the entire client had
 * exactly TWO inbound links to a /s/:handle storefront — the service-detail
 * breadcrumb and an expert-detail redirect. A traveler could find an item they
 * liked and had no way to ask "show me everything this person offers." Supply
 * discovery dead-ended at whatever single item they happened to land on.
 *
 * Two rules this component exists to enforce in one place:
 *
 *  1. NO DEAD LINKS. `users.handle` is nullable (migration 136) — an earner who
 *     has not claimed a handle has no storefront page at all. When `handle` is
 *     null this renders NOTHING. It never guesses a handle from a name/id and
 *     never renders a disabled-looking link to a 404. This mirrors the guard
 *     service-detail.tsx already applies to its breadcrumb.
 *
 *  2. NO FABRICATED SCALE (§13). Deliberately no "12 other offerings" count —
 *     we don't have that number at this call site, and inventing or guessing
 *     one is the exact class of claim §13 exists to prohibit. The label states
 *     only what is true: this seller has a storefront.
 *
 * Not used on Discover cards: those cards are already wrapped in a <Link>, so
 * nesting this inside one would emit invalid nested anchors. The return path
 * belongs on the DETAIL page, which is where a traveler forms the "more from
 * them" intent anyway.
 */
// React default import: required for the node-side render proofs (tsx --test compiles
// JSX to React.createElement — the same reason city-feed-card-external-stub.tsx has it).
// Vite's automatic runtime is unaffected.
import React from "react";
import { Link } from "wouter";
import { Store, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface StorefrontLinkProps {
  /** The owner's claimed handle. Null/undefined → renders nothing (rule 1). */
  handle: string | null | undefined;
  /**
   * Display name of the seller, e.g. the author's first name. OPTIONAL because
   * not every hosting surface has one — service-detail only knows the handle
   * (its public-verification DTO carries no display name). When omitted the
   * handle stands in, rather than inventing or guessing a name (§13).
   */
  name?: string;
  /**
   * What this seller is called on this surface. Purely a label — it does NOT
   * imply a role check. `provider_services` is role-agnostic (CLAUDE.md "one
   * builder"), so an "expert" and a "provider" can both own the same kind of
   * listing; pass whatever the hosting page honestly knows.
   */
  sellerNoun?: string;
  /** `section` = a full card block (detail pages). `inline` = a one-line link. */
  variant?: "section" | "inline";
  "data-testid"?: string;
}

export function StorefrontLink({
  handle,
  name,
  sellerNoun = "expert",
  variant = "section",
  "data-testid": testId = "link-storefront-return",
}: StorefrontLinkProps) {
  // Rule 1: no handle → no storefront → render nothing at all.
  if (!handle) return null;

  const href = `/s/${handle}`;
  const displayName = name || `@${handle}`;
  // Don't repeat the handle in the subtitle when it is already the title.
  const subtitle = name
    ? `Everything this ${sellerNoun} offers · @${handle}`
    : `Everything this ${sellerNoun} offers`;

  if (variant === "inline") {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        data-testid={testId}
      >
        <Store className="w-3.5 h-3.5" aria-hidden="true" />
        More from {displayName}
      </Link>
    );
  }

  return (
    <Card className="mt-8" data-testid={`${testId}-card`}>
      <CardContent className="p-5">
        <Link href={href} className="flex items-center justify-between gap-4 group" data-testid={testId}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Store className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate">More from {displayName}</div>
              {/* §13: states only what is true — that a storefront exists. No item count. */}
              <div className="text-sm text-muted-foreground truncate">{subtitle}</div>
            </div>
          </div>
          <ArrowRight
            className="w-5 h-5 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </CardContent>
    </Card>
  );
}

export default StorefrontLink;
