/**
 * TB4.11 (round 2, Leon Nov 10, 2026): the ONE step tracker over the two application wizards (`/become-expert`, all
 * four `?type=`, and `/become-provider`). Both pages carried their own inline copy on a `flex … overflow-x-auto` row
 * whose fixed-width connectors (`w-2 sm:w-8 md:w-12` / `md:w-20`) pushed the later steps off the right edge: the
 * expert trackers scrolled sideways and hid steps at 375px AND at desktop, the provider tracker hid step 5 at desktop.
 *
 * The row never scrolls now. It WRAPS: every step is a fixed-size circle, the connector is a flexible line
 * (`flex-1`, never a fixed width), the label truncates, and at phone width only the circles draw (the label is
 * `hidden sm:inline`, as before). One component, two callers; the words are the callers' own step titles — no new
 * string. Markup and colours are the pages' existing ones.
 */
import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ApplicationStep {
  id: number;
  title: string;
}

export function ApplicationStepTracker({ steps, currentStep, testId = "application-step-tracker" }: { steps: readonly ApplicationStep[]; currentStep: number; testId?: string }) {
  return (
    <div className="bg-white border-b border-border py-4">
      <div className="container mx-auto px-4 max-w-4xl">
        <ol className="flex flex-wrap items-center gap-y-2" data-testid={testId} aria-label="Application steps">
          {steps.map((step, idx) => {
            const done = currentStep > step.id;
            const active = currentStep === step.id;
            return (
              <li key={step.id} className={cn("flex items-center min-w-0", idx < steps.length - 1 && "flex-1")} data-testid={`${testId}-step-${step.id}`} aria-current={active ? "step" : undefined}>
                <div className={cn("flex items-center gap-2 px-1 py-1 sm:px-2 rounded-lg transition-colors min-w-0", active ? "bg-[#FFE3E8] text-primary" : done ? "text-green-600" : "text-[#9CA3AF]")}>
                  <div className={cn("w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-medium", active ? "bg-primary text-white" : done ? "bg-green-100 text-green-600" : "bg-[#F3F4F6] text-[#9CA3AF]")}>
                    {done ? <Check className="w-4 h-4" aria-hidden="true" /> : step.id}
                  </div>
                  <span className="hidden sm:inline text-sm font-medium truncate max-w-[7.5rem] lg:max-w-[9rem]">{step.title}</span>
                </div>
                {idx < steps.length - 1 && <div className={cn("h-0.5 flex-1 min-w-2 mx-1 sm:mx-2", done ? "bg-green-300" : "bg-[#E5E7EB]")} aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
