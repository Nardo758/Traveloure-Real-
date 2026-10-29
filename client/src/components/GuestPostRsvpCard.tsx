/**
 * Order 279 (ledger `2026-10-29-guest-post-rsvp-card`): the one plain card every guest sees on the
 * confirmed step, whatever they answered. Details come from the server's `landing` only, through
 * the rows row 278 builds; the street address row is present only when the server sent it, which
 * it does after an accepted RSVP. No card title and no description: the words are GUEST_CARD_COPY.
 */
import React from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { GuestLandingPayload, GuestLandingRow } from '@/lib/guest-landing';
import { guestCardCity, guestCardRows } from '@/lib/guest-card';
import { GUEST_CARD_COPY } from '@/lib/guest-card-copy';

const CARD_ROW_ICON: Partial<Record<GuestLandingRow['key'], typeof Calendar>> = {
  date: Calendar,
  city: MapPin,
  address: MapPin,
};

export function GuestPostRsvpCard({
  landing,
  landingRows,
}: {
  landing: GuestLandingPayload | null;
  landingRows: readonly GuestLandingRow[];
}) {
  const rows = guestCardRows(landingRows);
  return (
    <Card className="min-w-0" data-testid="guest-post-rsvp-card">
      <CardContent className="space-y-4 pt-6">
        {landing?.title && <p className="text-lg font-semibold break-words" data-testid="guest-card-title">{landing.title}</p>}
        {rows.length > 0 && (
          <dl className="space-y-2 text-muted-foreground" data-testid="guest-card-details">
            {rows.map((row) => (
              <div key={row.key} className="flex items-start gap-2" data-testid={`guest-card-${row.key}`}>
                {CARD_ROW_ICON[row.key] && React.createElement(CARD_ROW_ICON[row.key]!, { className: 'h-4 w-4 shrink-0' })}
                <div className="min-w-0">
                  {row.label && <dt className="text-xs font-medium uppercase tracking-wide">{row.label}</dt>}
                  <dd className="break-words text-foreground">{row.value}</dd>
                </div>
              </div>
            ))}
          </dl>
        )}
        <p className="break-words" data-testid="guest-card-line">{GUEST_CARD_COPY.line(guestCardCity(landing?.area))}</p>
        <Button asChild className="w-full sm:w-auto">
          <a href={GUEST_CARD_COPY.href} data-testid="guest-card-button">{GUEST_CARD_COPY.button}</a>
        </Button>
      </CardContent>
    </Card>
  );
}
