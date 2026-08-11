/**
 * Shared traveler-facing offering card (Catalog+Distribute ruling 74, lane C1).
 *
 * Extracted verbatim from the local, un-exported `OfferingCard` in
 * client/src/pages/storefront.tsx so a later lane (C2) can render the EXACT
 * storefront card inside the provider Catalog's Preview toggle — one card, one
 * truth. This is a faithful move only: same markup, same classes/inline styles,
 * same data-testid, same prop contract. Do not add features here — C3 will
 * extend the prop contract (showPrice / bookingMode) with today's behavior as
 * the default.
 *
 * The deterministic gradient fallback (a card with no real image gets an
 * on-brand tint hashed from its title) travels with the card as a private
 * helper, since nothing else references it.
 */
import { Link } from "wouter";
import type { ReactNode } from "react";

// Deterministic gradient fallback for a card with no real image — cycles a small on-brand
// palette by a hash of the offering id so the same card always gets the same tint.
const CARD_GRADIENTS = [
  "from-rose-300 to-rose-500 dark:from-rose-900/70 dark:to-rose-950/80",
  "from-emerald-300 to-emerald-600 dark:from-emerald-900/70 dark:to-emerald-950/80",
  "from-amber-300 to-amber-600 dark:from-amber-900/70 dark:to-amber-950/80",
  "from-sky-300 to-sky-600 dark:from-sky-900/70 dark:to-sky-950/80",
];
function gradientFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CARD_GRADIENTS[hash % CARD_GRADIENTS.length];
}

export function OfferingCard({
  href,
  testId,
  image,
  title,
  chips,
  ratingSlot,
  price,
  unit,
  cta,
}: {
  href: string;
  testId: string;
  image: string | null;
  title: string;
  chips: string[];
  ratingSlot?: ReactNode;
  price: string;
  unit?: string | null;
  cta: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card no-underline text-inherit transition-shadow hover:shadow-lg hover:-translate-y-0.5"
    >
      <div
        className={`h-36 w-full shrink-0 ${image ? "bg-cover bg-center" : `bg-gradient-to-br ${gradientFor(title)}`}`}
        style={image ? { backgroundImage: `url(${image})` } : undefined}
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-semibold leading-snug">{title}</h3>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c}
                className="rounded-full border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        )}
        {ratingSlot}
        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2.5">
          <div className="text-base font-bold">
            {price}
            {unit && <span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span>}
          </div>
          <span className="text-sm font-semibold text-primary whitespace-nowrap">{cta}</span>
        </div>
      </div>
    </Link>
  );
}

export default OfferingCard;
