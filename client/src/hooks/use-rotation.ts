/**
 * use-rotation.ts — THE shared rotation utility (landing-build lane; created here because
 * Phase 0 found no existing one). Contract per docs/design/LANDING_SPEC.md:
 *
 *   - advances every `intervalMs` (default 8s),
 *   - pauses while `paused` is true (callers wire hover/focus to it),
 *   - never advances under `prefers-reduced-motion` (index stays 0),
 *   - wraps modulo `count`; a count of 0/1 never ticks.
 *
 * Every rotating surface (typed search, experiences ticker, cities rail) consumes THIS
 * hook — no per-surface reimplementations.
 */
import { useEffect, useState } from "react";

export const ROTATION_INTERVAL_MS = 8000;

export function shouldAdvanceRotation(
  count: number,
  paused: boolean,
  reducedMotion: boolean,
): boolean {
  return count > 1 && !paused && !reducedMotion;
}

export function nextRotationIndex(index: number, count: number): number {
  return count > 0 ? (index + 1) % count : 0;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export function useRotation(
  count: number,
  opts?: { intervalMs?: number; paused?: boolean },
): number {
  const intervalMs = opts?.intervalMs ?? ROTATION_INTERVAL_MS;
  const paused = opts?.paused ?? false;
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!shouldAdvanceRotation(count, paused, reducedMotion)) return;
    const id = window.setInterval(() => {
      setIndex((i) => nextRotationIndex(i, count));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [count, intervalMs, paused, reducedMotion]);

  // Keep the index valid if the list shrinks; reduced-motion holds at 0.
  if (reducedMotion && index !== 0) return 0;
  return count > 0 ? index % count : 0;
}
