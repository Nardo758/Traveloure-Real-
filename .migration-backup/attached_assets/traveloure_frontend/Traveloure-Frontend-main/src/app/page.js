"use client";

import * as React from "react";
import HeroSection from "../components/hero-section";
import ExpertSection from "../components/expert-section";
import CtaSection from "../components/cta-section";
import TestimonialSection from "../components/testimonial-section";
import Impactsection from "../components/impact";
import BetaBanner from "../components/BetaBanner";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Beta Launch Banner */}
      <BetaBanner />
      
      <main className="flex-grow">
        <HeroSection />
        <ExpertSection />
        <Impactsection />
        <TestimonialSection />
        <CtaSection />
      </main>
    </div>
  );
}
