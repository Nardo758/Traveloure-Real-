/**
 * /start/events — the Event Planner fork (Build 2, ratified).
 *
 * "Event Planner" is two different businesses on this platform, and before this page the
 * entry points disagreed about which one you were starting: the /earn card sent everyone
 * into the PROVIDER form (→ role service_provider, Provider console), while the nav and
 * partner-with-us links sent everyone into the EXPERT application (→ role event_planner,
 * Expert console + coordinator pipeline). One card, one fork question — every Event
 * Planner entry point now lands here and the person picks the business they're starting.
 */
import { Link, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, CalendarHeart, ArrowRight, ArrowLeft } from "lucide-react";

const OPTIONS = [
  {
    key: "vendor",
    icon: Building2,
    title: "I provide event services",
    description:
      "You run an event business travelers book directly — catering, flowers, officiating, photography or videography, hair & makeup, AV, rentals, entertainment.",
    detail: "You'll list your services, set availability and prices, and take bookings.",
    cta: "Continue as a Service Provider",
    href: "/become-provider",
  },
  {
    key: "planner",
    icon: CalendarHeart,
    title: "I plan & coordinate events",
    description:
      "You design and run the whole event — weddings, proposals, birthdays, corporate events — coordinating vendors, timelines, and budgets for clients.",
    detail: "You'll apply as an Event Planner expert and can be assigned coordination engagements.",
    cta: "Apply as an Event Planner",
    href: "/become-expert?type=event_planner",
  },
] as const;

export default function StartEventsPage() {
  // Forward the /earn card's ?offeringTypeKey=&offeringName= through the fork — dropping
  // them here severed the signup forms' offering banner + the migration-107 persistence
  // for all Event Planner traffic (earn-trace gap 5).
  const search = useSearch();
  const withSearch = (href: string) =>
    search ? `${href}${href.includes("?") ? "&" : "?"}${search}` : href;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link
          href="/earn"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8"
          data-testid="link-back-earn"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-start-events-title">
          Which event business are you starting?
        </h1>
        <p className="text-muted-foreground mb-10">
          Both earn on Traveloure — they just use different tools, so pick the one that matches
          what you actually do.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {OPTIONS.map((opt) => (
            <Link key={opt.key} href={withSearch(opt.href)} data-testid={`option-${opt.key}`}>
              <Card className="h-full cursor-pointer transition-shadow hover:shadow-md border border-border">
                <CardContent className="p-6 flex flex-col h-full">
                  <opt.icon className="w-8 h-8 text-primary mb-4" />
                  <h2 className="text-lg font-semibold text-foreground mb-2">{opt.title}</h2>
                  <p className="text-sm text-muted-foreground mb-3">{opt.description}</p>
                  <p className="text-sm text-muted-foreground/80 mb-6">{opt.detail}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    {opt.cta} <ArrowRight className="w-4 h-4" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
