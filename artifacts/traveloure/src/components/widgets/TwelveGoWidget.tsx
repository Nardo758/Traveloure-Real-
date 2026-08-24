/**
 * 12Go transport surfaces — §16 (CLAUDE.md affiliate-outbound rule).
 *
 * These components used to embed 12Go's affiliate iframes (`marker=<affiliate id>`) and
 * render raw `<a href="https://12go.asia/...affiliate_id=…">` booking CTAs — off-site
 * booking surfaces built in the browser, with the affiliate id living in client code.
 * §16 forbids that: a "book" action on partner-fulfilled content routes through the
 * in-platform booking-agent rail (POST /api/affiliate-booking-requests). The client now
 * sends only a `partnerRoute` reference ({partner:"12go", origin?, destination?}); the
 * SERVER builds the 12Go deep link, keeps it server-side, assigns a booking agent, and
 * logs the confirmed booking onto the traveler's trip.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Train, UserCheck, CheckCircle2 } from 'lucide-react';
import { useContentAgentBooking } from '@/hooks/use-content-agent-booking';

interface TwelveGoWidgetProps {
  /** Retained for call-site compatibility; all variants render the same rail surface. */
  type?: 'search' | 'timetable' | 'city';
  from?: string;
  to?: string;
  language?: string;
  className?: string;
}

export function TwelveGoWidget({
  from,
  to,
  className = '',
}: TwelveGoWidgetProps) {
  const routeLabel = from && to ? `${prettify(from)} → ${prettify(to)}` : from ? prettify(from) : null;

  const agentBooking = useContentAgentBooking({
    itemName: routeLabel ? `Ground transport: ${routeLabel}` : 'Ground transport',
    itemDescription: 'Trains, buses, ferries via 12Go Asia',
    partnerName: '12Go Asia',
    partnerCategory: 'ground-transport',
    partnerRoute: { partner: '12go', origin: from || undefined, destination: to || undefined },
  });

  return (
    <Card className={className} data-testid="twelve-go-widget-container">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Train className="h-5 w-5" />
          Book transportation with 12Go
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {routeLabel
            ? `Our booking agent finds the best trains, buses and ferries for ${routeLabel}, books them for you, and adds them to your trip.`
            : 'Our booking agent finds the best trains, buses and ferries for your route, books them for you, and adds them to your trip.'}
        </p>
        {agentBooking.requested ? (
          <div
            className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-300"
            data-testid="text-twelve-go-agent-requested"
          >
            <CheckCircle2 className="h-4 w-4" /> Request sent — our booking agent will follow up.
          </div>
        ) : (
          <Button
            onClick={agentBooking.book}
            disabled={agentBooking.isPending}
            data-testid="button-twelve-go-agent-book"
          >
            <UserCheck className="h-4 w-4 mr-1.5" />
            {agentBooking.isPending ? 'Sending…' : 'Book via agent'}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Powered by 12Go Asia — trains, buses, ferries &amp; flights across Asia
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Route hand-off used by the popular-route cards (previously a raw affiliate `<a>`):
 * clicking sends a booking-agent request for that route. Children render as the card body.
 */
export function TwelveGoDeepLink({
  from,
  to,
  children,
  className = '',
}: {
  from: string;
  to: string;
  children: React.ReactNode;
  className?: string;
}) {
  const agentBooking = useContentAgentBooking({
    itemName: `Ground transport: ${prettify(from)} → ${prettify(to)}`,
    itemDescription: 'Trains, buses, ferries via 12Go Asia',
    partnerName: '12Go Asia',
    partnerCategory: 'ground-transport',
    partnerRoute: { partner: '12go', origin: from, destination: to },
  });

  return (
    <button
      type="button"
      onClick={agentBooking.book}
      disabled={agentBooking.isPending || agentBooking.requested}
      className={`${className} text-left w-full`}
      data-testid={`twelve-go-agent-route-${from}-${to}`}
    >
      {children}
      {agentBooking.requested && (
        <span className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-300 mt-1">
          <CheckCircle2 className="h-3 w-3" /> Booking request sent
        </span>
      )}
    </button>
  );
}

function prettify(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
