import { useEffect } from "react";
import { useLocation } from "wouter";
import { scrollToLocationHash } from "@/lib/hash-scroll";

/**
 * Cold load reads the hash already on the window. Wouter in-app navigation
 * changes `location` and runs this again. A hash-only change does not change
 * the path, so `hashchange` covers that path.
 */
export function useScrollToHash(): void {
  const [location] = useLocation();
  useEffect(() => {
    const run = () => {
      scrollToLocationHash(window.location, document);
    };
    run();
    window.addEventListener("hashchange", run);
    return () => window.removeEventListener("hashchange", run);
  }, [location]);
}
