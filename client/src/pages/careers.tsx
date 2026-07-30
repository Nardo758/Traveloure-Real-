import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Mail, ArrowRight, Users } from "lucide-react";

/**
 * §13 (fabrication removal): this page previously advertised SIX invented job
 * openings, each with a specific six-figure salary band, invented departments
 * and office locations, a benefits package (health insurance, equity, annual
 * travel credits) nobody had committed to, and an apply button with no handler
 * behind it. There is no ATS, no job store, and no
 * `/api/jobs`-shaped endpoint anywhere in the codebase — nothing could ever
 * receive an application. Posting named roles at named salaries that do not
 * exist invites real applications for jobs nobody can be hired into (and in
 * several jurisdictions a posted pay range carries legal weight), so the
 * postings, the perks grid, and the dead apply affordance are all gone.
 *
 * What is left is true: there are no open roles right now, and the two ways to
 * actually reach us both exist — the /contact form posts to the live
 * POST /api/contact (persisted + admins notified) and /earn is the real,
 * shipped path to earning on the platform as a local expert or provider.
 * A real posting can only appear here once there is a real role behind it.
 */

const CONTACT_EMAIL = "hello@traveloure.com";

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground py-20">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-primary-foreground">
            Careers at Traveloure
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/90">
            We're a small, early-stage team building a travel platform around
            local expertise. We aren't running any open recruitment right now —
            but we do read every note that reaches us.
          </p>
        </div>
      </section>

      {/* No open roles + real ways in */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <Card className="border-border">
            <CardContent className="p-6 md:p-10 text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                No open roles at the moment
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                There are no positions posted today. If you'd like to be
                considered when that changes, send us a note with what you do
                and what you'd want to work on — it goes straight to the team.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <Button size="lg" asChild data-testid="button-careers-contact">
                  <Link href="/contact">
                    Send us a note
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    data-testid="link-careers-email"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    {CONTACT_EMAIL}
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* The real, live way to work with us */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Looking to earn with Traveloure instead?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Local experts and service providers work with us through the
            platform rather than on payroll. That path is open now — you apply,
            we review, and you list what you offer.
          </p>
          <Button size="lg" variant="outline" asChild data-testid="button-careers-earn">
            <Link href="/earn">
              See how earning works
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
