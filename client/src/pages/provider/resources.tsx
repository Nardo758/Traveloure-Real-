/**
 * Provider Playbook (formerly "Resources", /provider/resources → /provider/playbook).
 *
 * §13 rebuild: the previous version of this page was entirely fabricated — sample "guides"
 * with invented reading times, "video tutorials" with invented durations and no video files,
 * "downloadable resources" with invented file sizes and no files behind them, and a "Read /
 * Play / Download" button on every single card with no onClick. None of it was routed in the
 * sidebar nav for exactly that reason (see provider-sidebar.tsx's prior comment).
 *
 * This version has no cards that promise content that doesn't exist. Every section below is
 * written, factual copy about how this platform's real mechanics work, grounded in the actual
 * server behavior (approval lifecycle, listing-completeness factors, Stripe Connect payouts,
 * vendor_availability_slots). No invented SLAs, no fee percentages or dollar figures (§8 — those
 * live in admin-configured fee_bands and on the real Earnings page, never as copy on this page).
 */
import { Link } from "wouter";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ClipboardCheck,
  MapPin,
  CreditCard,
  CalendarClock,
  MessageSquare,
  CheckCircle2,
} from "lucide-react";

export default function ProviderResources() {
  return (
    <ProviderLayout title="Playbook">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-console-darkest">Provider Playbook</h2>
          <p className="text-console-dark">
            How review, bookability, payouts, and availability actually work on Traveloure.
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            <Accordion type="multiple" defaultValue={["approval"]} className="w-full">
              {/* 1. Getting approved */}
              <AccordionItem value="approval" className="px-6">
                <AccordionTrigger className="text-left" data-testid="accordion-trigger-approval">
                  <span className="flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-primary" />
                    Getting approved
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-console-dark space-y-3">
                  <p>
                    Every listing you create — a single service, or a bundle — is born with review
                    status <strong>submitted</strong>. Nothing you save as a draft or publish goes
                    live automatically, and nothing you submit skips review.
                  </p>
                  <p>
                    An admin reviews submitted listings before they become visible to travelers.
                    Public and Discover surfaces only ever show <strong>approved</strong> listings;
                    your own Catalog page always shows all of your listings regardless of status,
                    so you can see exactly where each one stands.
                  </p>
                  <p>
                    If you change the price or the set of included items on an already-approved
                    <strong> bundle</strong> listing, it's automatically dropped back to submitted
                    and re-enters the review queue — so what's live to travelers always matches
                    what was actually reviewed, never a silently-changed price. Editing a
                    standalone service listing's details after approval doesn't trigger a new
                    review; ownership and ID fields on any listing are never client-editable
                    regardless.
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* 2. Making your listing bookable */}
              <AccordionItem value="bookable" className="px-6">
                <AccordionTrigger className="text-left" data-testid="accordion-trigger-bookable">
                  <span className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    Making your listing bookable
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-console-dark space-y-3">
                  <p>A few things make a listing genuinely ready to be booked, not just approved:</p>
                  <ul className="space-y-2 pl-1">
                    <li className="flex gap-2">
                      <CheckCircle2 className="w-4 h-4 text-console-mid flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>A cover photo.</strong> Listings with no photo are harder for
                        travelers to trust and choose — add one from the listing editor.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2 className="w-4 h-4 text-console-mid flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>A confirmed map pin.</strong> A pin you place yourself is marked
                        <em> Exact location confirmed</em>. Until you place one, a listing in a
                        neighborhood we recognize shows as <em>Approximate location from your
                        neighborhood</em> — real coordinates, but a fuzzy one. A listing with no
                        location at all doesn't get coordinates, and proximity-based
                        recommendations (like the itinerary-planning engine that surfaces nearby
                        platform stays) can only ever consider listings that have coordinates.
                        Placing an exact pin is what gets you considered, and gets travelers the
                        precise spot rather than a neighborhood-sized guess.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2 className="w-4 h-4 text-console-mid flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>Published availability.</strong> Travelers can only book dated
                        slots you've actually opened — see "Availability & calendar" below.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2 className="w-4 h-4 text-console-mid flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>A clear description and price.</strong> Publishing requires a price
                        greater than zero, and in-person or hybrid delivery requires a meeting
                        point — both enforced when you switch a listing to active.
                      </span>
                    </li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              {/* 3. Payouts & fees */}
              <AccordionItem value="payouts" className="px-6">
                <AccordionTrigger className="text-left" data-testid="accordion-trigger-payouts">
                  <span className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    Payouts & fees
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-console-dark space-y-3">
                  <p>
                    Getting paid runs through Stripe Connect. You connect (or finish connecting)
                    your Stripe account from Settings; until that's complete, payouts can't be
                    requested — the request flow tells you to finish setup rather than failing
                    silently.
                  </p>
                  <p>
                    Once you have a cleared, available balance from completed bookings, you can
                    request a payout from your Money page. Platform fees are admin-configured per
                    service category and are never a hardcoded number in the app — your exact
                    rate, the fee taken, and your net payout are always shown on the booking itself
                    and on your Money page, which is the source of truth for your real numbers, not
                    this page.
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* 4. Availability & calendar */}
              <AccordionItem value="availability" className="px-6">
                <AccordionTrigger className="text-left" data-testid="accordion-trigger-availability">
                  <span className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-primary" />
                    Availability & calendar
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-console-dark space-y-3">
                  <p>
                    Bookability isn't just "approved" — it's approved <em>and</em> having open
                    dated slots. Travelers can only book a slot you've actually published; an
                    approved listing with no open slots simply has nothing for a traveler to
                    select.
                  </p>
                  <p>
                    Manage slots per-listing from{" "}
                    <Link href="/provider/services" className="text-primary underline underline-offset-2" data-testid="link-playbook-catalog">
                      Catalog
                    </Link>{" "}
                    — open individual dates or a date range at once. Once published, they show up
                    on your{" "}
                    <Link href="/provider/calendar" className="text-primary underline underline-offset-2" data-testid="link-playbook-calendar">
                      Calendar
                    </Link>{" "}
                    alongside your actual bookings, so you can see what's open and what's already
                    claimed in one place. Deleting a slot that already has a real booking on it
                    isn't allowed — cancel the booking first if you need to free the date.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Need Help — real support path (POST /api/contact persists the message and notifies
            admins; no invented "24/7 team" or dead buttons). */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6 text-center">
            <MessageSquare className="w-12 h-12 text-primary mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-console-darkest">Need More Help?</h3>
            <p className="text-console-dark mt-1 mb-4">
              Send us a message and we'll pick it up as soon as we can.
            </p>
            <div className="flex justify-center">
              <Link href="/contact">
                <Button data-testid="button-contact-support">
                  Contact Support
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
