/**
 * TG-1: one sanitised GA4 page view per location change, including the first. Mounted once in App. Does
 * nothing unless the tag is loaded (`lib/ga4.ts`), and nothing on console surfaces.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { trackPageView } from "@/lib/ga4";

export function Ga4PageViews() {
  const [location] = useLocation();
  useEffect(() => {
    trackPageView(location);
  }, [location]);
  return null;
}
