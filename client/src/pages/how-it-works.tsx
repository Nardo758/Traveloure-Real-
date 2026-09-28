import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  ArrowRight,
  ClipboardList,
  UserCheck,
  PartyPopper,
  Check
} from "lucide-react";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { usePlanning } from "@/contexts/PlanningContext";
import { HOW_IT_WORKS_STEPS } from "@/lib/how-it-works-steps";
import { PageLayout, SectionTitle, PAGE_ACTION } from "@/components/company/company-page";

const STEP_ICONS = [ClipboardList, Sparkles, UserCheck, PartyPopper];

// The four steps come from the ONE shared list the landing strip also reads (ledger
// `2026-09-28-landing-reorder`): the landing names them, this page describes them.
const steps = HOW_IT_WORKS_STEPS.map((step, i) => ({
  number: step.n,
  title: step.title,
  description: step.body,
  icon: STEP_ICONS[i] ?? ClipboardList,
  features: step.details,
}));

export default function HowItWorksPage() {
  const { openSignInModal } = useSignInModal();
  const { open: openPlanning } = usePlanning();
  
  return (
    <PageLayout
      width="content"
      title="How Traveloure Works"
      lead="From an idea to a plan you can use, in four steps. Build it yourself, sharpen it with AI, or hand it to someone who lives there."
      actions={
        <Button size="lg" className={PAGE_ACTION.primary} onClick={() => openSignInModal()} data-testid="button-get-started">
          Get Started <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      }
    >
      {/* Steps Section */}
      <section>
        <div className="space-y-16 md:space-y-24">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="grid md:grid-cols-2 gap-8 md:gap-16 items-center"
              data-testid={`section-step-${step.number}`}
            >
              <div className={index % 2 === 1 ? "md:order-2" : ""}>
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-6xl font-bold text-muted-foreground/20" data-testid={`text-step-number-${step.number}`}>{step.number}</span>
                  <div className="w-14 h-14 rounded-xl bg-[color:var(--earn-coral-bg)] flex items-center justify-center">
                    <step.icon className="w-7 h-7 text-primary" />
                  </div>
                </div>
                <SectionTitle className="mb-4" testId={`text-step-title-${step.number}`}>
                  {step.title}
                </SectionTitle>
                <p className="text-lg text-muted-foreground mb-6">
                  {step.description}
                </p>
                <ul className="space-y-3">
                  {step.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3" data-testid={`text-step-feature-${step.number}-${i}`}>
                      <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={index % 2 === 1 ? "md:order-1" : ""}>
                <div className="aspect-video rounded-2xl bg-[color:var(--earn-chip)] flex items-center justify-center" data-testid={`img-step-placeholder-${step.number}`}>
                  <step.icon className="w-24 h-24 text-muted-foreground/30" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* What it costs. The hand-typed "Choose Your Planning Style" price cards were removed
          (ledger `2026-09-28-landing-doors`): their prices were literals beside a page that is now
          the destination of the landing's "See pricing", and every number lives on /pricing, which
          renders from fee_bands. The three ways to plan are the steps above. */}
      <section className="rounded-2xl border bg-card p-6 md:p-8" data-testid="section-what-it-costs">
        <SectionTitle className="mb-2">What it costs</SectionTitle>
        <p className="text-muted-foreground max-w-2xl">
          Building a plan yourself is free. What an AI run or a Trip Pass costs, and the platform's fees, are on the
          pricing page, read from our live fee settings. A local expert sets their own price on their listing.
        </p>
        <Link
          href="/pricing"
          className="mt-4 inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          data-testid="link-see-pricing"
        >
          See pricing <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* CTA Section */}
      <section className="rounded-2xl border bg-card p-8 md:p-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <SectionTitle className="mb-4">
            Ready to Start Planning?
          </SectionTitle>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Create your first trip and see how much of the planning we can take off your hands.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" className={PAGE_ACTION.primary} onClick={() => openPlanning()} data-testid="button-create-trip-cta">
              Create Your First Trip <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Link href="/experts">
              <Button size="lg" variant="outline" className={PAGE_ACTION.secondary} data-testid="button-browse-experts">
                Browse Experts
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>
    </PageLayout>
  );
}
