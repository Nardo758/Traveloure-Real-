/**
 * /start/events — the Event Planner fork (Build 2, ratified).
 *
 * "Event Planner" is two different businesses on this platform, and before this page the
 * entry points disagreed about which one you were starting: the /earn card sent everyone
 * into the PROVIDER form (→ role service_provider, Provider console), while the nav and
 * partner-with-us links sent everyone into the EXPERT application (→ role event_planner,
 * Expert console + coordinator pipeline). One card, one fork question — every Event
 * Planner entry point now lands here and the person picks the business they're starting.
 *
 * THIRD DOOR — the traveler (ledger `2026-09-04-wedding-entry-doors`, ratified artboard
 * `docs/design/wedding-flow/Planner.dc.html`). The fork above unified the two SUPPLY doors and
 * stopped there, so the page still asked "which event business are you starting?" — and a couple
 * following any "Event Planner" link was offered nothing but two ways to sell. The mock's own
 * footer names that as the bug it fixes. The host door is therefore NOT a third signup: it opens
 * THE single planning entry (`usePlanning().open`, ruling `2026-08-28-single-planning-entry`) via
 * the shared `PlanEntryCta` — never a second modal, never a raw route push.
 *
 * IT PASSES NO OCCASION (§13). This page holds none: it is reached from /earn, the nav and the
 * partner links, none of which name a wedding rather than a reunion. Passing an `experienceType`
 * or `experienceSlug` here would be a surface inventing the traveler's occasion to look better
 * informed — the chooser asks instead.
 */
import { Link, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, CalendarHeart, ArrowRight, ArrowLeft, PartyPopper } from "lucide-react";
import { PlanEntryCta } from "@/components/planning/plan-entry-cta";

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
      <div className="max-w-4xl mx-auto px-4 py-16">
        <Link
          href="/earn"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8"
          data-testid="link-back-earn"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-start-events-title">
          Which side of the event are you on?
        </h1>
        <p className="text-muted-foreground mb-10">
          Two of these are for people who work events. One is for you.
        </p>

        <div className="grid gap-6 md:grid-cols-3">
          {/* The host door. A card, not a Link — it opens the planning chooser in place rather
              than routing anywhere, which is the whole difference between it and the two
              supply-side doors beside it. */}
          <Card className="h-full border border-primary" data-testid="option-host">
            <CardContent className="p-6 flex flex-col h-full">
              <PartyPopper className="w-8 h-8 text-primary mb-4" />
              <span className="text-xs font-medium uppercase tracking-wider text-primary mb-2">
                new
              </span>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                I&apos;m planning my own event
              </h2>
              <p className="text-sm text-muted-foreground mb-3">
                A wedding, a proposal, a reunion — you&apos;re the host.
              </p>
              <div className="mt-auto pt-3">
                {/* No `source`: this page holds no destination and no occasion, and an absent
                    field is how the chooser is told "not known" (§13). */}
                <PlanEntryCta testId="button-start-events-plan" />
              </div>
            </CardContent>
          </Card>

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
