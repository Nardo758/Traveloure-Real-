/**
 * moments-section.tsx — "Some trips are really one evening." (Landing v2.5 Lane 2, position 2).
 * Visual of record: docs/design/landing-earn-mock-v2.5.html (the Moments section).
 *
 * ONE moment per slide. Data is GET /api/landing/moments: `moments` = the LIVE set (each with ≥1
 * attributed real photo — the TRUST-surface gate, 2026-09-01-photo-tiers), `roster` = all seven
 * for the tab strip's faint pills (server-owned, never restated here — §18 rule 1).
 *
 * EMPTY STATE B (2026-09-01-landing-moments): when the live set is empty the section renders
 * NOTHING and appears the moment the first attributed real photo lands. With today's data the
 * gate admits zero (Phase 0: gem photos are Unsplash stock), so this is suppressed on real data.
 *
 * Rotation reuses the shared useRotation (8s · hover pause · reduced-motion hold; one photo never
 * ticks and hides its dots). Attribution mirrors the upsell session posture (a per-session token,
 * no PII): a slide ≥2s visible = one impression; tab/dot/cta = clicks. The CTA prefills the AI
 * chooser with the coarse experienceType AND the fine momentKey (2026-09-01-moment-key).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionHeader, OpenSection } from "./section-header";
import { useRotation } from "@/hooks/use-rotation";
import { usePlanning } from "@/contexts/PlanningContext";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface MomentPhoto { url: string; place: string; handle: string }
interface LiveMoment {
  key: string;
  label: string;
  eyebrow: string;
  headline: string;
  pieces: string[];
  experienceType: string;
  photos: MomentPhoto[];
  builder: { handle: string; reviews: number } | null;
}
interface MomentsPayload { moments: LiveMoment[]; roster: { key: string; label: string }[] }

type EventKind = "impression" | "tab" | "dot" | "cta";

/** A per-session token — the same no-PII posture the upsell events use. */
function sessionToken(): string {
  try {
    const k = "tl_moment_sid";
    let v = window.sessionStorage.getItem(k);
    if (!v) {
      v = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random()}`;
      window.sessionStorage.setItem(k, v);
    }
    return v;
  } catch {
    return "anon";
  }
}

function postEvent(momentKey: string, kind: EventKind, position?: number) {
  try {
    void fetch("/api/landing/moments/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ momentKey, kind, position, sessionId: sessionToken() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* attribution is best-effort — never break the page */
  }
}

export function MomentsSection() {
  const { open } = usePlanning();
  const { data } = useQuery<MomentsPayload>({ queryKey: ["/api/landing/moments"], staleTime: 60_000 });

  const moments = data?.moments ?? [];
  const roster = data?.roster ?? [];
  const liveKeys = useMemo(() => new Set(moments.map((m) => m.key)), [moments]);

  // Which live moment is showing. Auto-advances unless the viewer pins one by tapping a tab.
  const [pinned, setPinned] = useState<number | null>(null);
  const [momentHover, setMomentHover] = useState(false);
  const auto = useRotation(moments.length, { intervalMs: 8000, paused: momentHover || pinned !== null });
  const active = pinned !== null && pinned < moments.length ? pinned : auto;
  const moment: LiveMoment | undefined = moments[active];

  // The photo slideshow within the active moment (one photo never ticks; dots hidden).
  const [photoHover, setPhotoHover] = useState(false);
  const photoCount = moment?.photos.length ?? 0;
  const photoIdx = useRotation(photoCount, { intervalMs: 8000, paused: photoHover });

  // Impression: the active moment ≥2s visible = one impression.
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? false),
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!inView || !moment) return;
    const key = moment.key;
    const t = window.setTimeout(() => postEvent(key, "impression", active), 2000);
    return () => window.clearTimeout(t);
  }, [inView, moment, active]);

  // Empty state B — suppress entirely until ≥1 moment is live. (All hooks run above this return.)
  if (moments.length === 0 || !moment) return null;

  const photo = moment.photos[Math.min(photoIdx, photoCount - 1)] ?? moment.photos[0];

  return (
    <div ref={sectionRef}>
      <OpenSection testId="section-moments">
        <SectionHeader
          eyebrow="Plan the moment · not just the trip"
          title="Some trips are really one evening."
          link={{ label: "All occasions →", href: "/experiences/travel", testId: "link-all-occasions" }}
        />

        {/* ONE moment per slide: photo slideshow + the story */}
        <div
          className="grid min-w-0 auto-rows-[minmax(300px,auto)] overflow-hidden rounded-[16px] border lg:auto-rows-[minmax(340px,auto)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
          style={{ borderColor: "var(--earn-border, #E4E4DE)", background: "var(--earn-card, #fff)" }}
          data-testid={`moment-slide-${moment.key}`}
        >
          {/* photo slideshow */}
          <div
            className="relative min-h-[300px] lg:min-h-0"
            onMouseEnter={() => setPhotoHover(true)}
            onMouseLeave={() => setPhotoHover(false)}
          >
            <img
              src={photo.url}
              alt={photo.place}
              className="absolute inset-0 h-full w-full object-cover"
              data-testid="moment-photo"
            />
            <span
              className="absolute left-3.5 top-3.5 rounded-[6px] bg-white px-2 py-1 text-[9.5px] font-medium uppercase tracking-[0.08em]"
              style={{ fontFamily: EARN_MONO }}
            >
              {moment.label}
            </span>
            <div
              className="absolute bottom-3.5 left-3.5 text-[10.5px] uppercase tracking-[0.08em]"
              style={{ fontFamily: EARN_MONO, color: "rgba(255,255,255,0.9)", textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}
              data-testid="moment-caption"
            >
              {photo.place} · @{photo.handle}
            </div>
            {photoCount > 1 && (
              <div className="absolute bottom-4 right-3.5 flex gap-1.5" data-testid="moment-dots">
                {moment.photos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Photo ${i + 1}`}
                    onClick={() => postEvent(moment.key, "dot", i)}
                    className="h-1 rounded-[2px]"
                    style={{
                      width: i === Math.min(photoIdx, photoCount - 1) ? 18 : 8,
                      background: i === Math.min(photoIdx, photoCount - 1) ? "#fff" : "rgba(255,255,255,0.5)",
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* the story */}
          <div className="flex min-w-0 flex-col gap-3 p-7 lg:min-h-[340px] lg:pl-0">
            <span
              className="text-[10.5px] font-medium uppercase tracking-[0.14em]"
              style={{ fontFamily: EARN_MONO, color: "var(--earn-coral-ink)" }}
            >
              {moment.eyebrow}
            </span>
            <h4
              className="text-[24px] font-semibold leading-[1.15]"
              style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}
              data-testid="moment-headline"
            >
              {moment.headline}
            </h4>
            <ul className="grid min-w-0 list-none gap-[7px] p-0 text-[14px]" style={{ color: "var(--earn-ink)" }}>
              {moment.pieces.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[10.5px]" style={{ fontFamily: EARN_MONO, color: "var(--earn-teal-ink)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 break-words">{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap items-center gap-3.5 pt-2">
              <button
                type="button"
                className="inline-flex items-center rounded-[8px] px-3.5 py-2 text-[13px] font-semibold text-white"
                style={{ background: "var(--earn-coral-ink)" }}
                data-testid="moment-cta"
                onClick={() => {
                  postEvent(moment.key, "cta", active);
                  open({ branch: "ai", experienceType: moment.experienceType, momentKey: moment.key });
                }}
              >
                Plan this moment
              </button>
              {moment.builder && (
                <span className="text-[11px]" style={{ fontFamily: EARN_MONO, color: "var(--earn-muted)" }}>
                  built by @{moment.builder.handle}
                  {moment.builder.reviews > 0 ? ` · ${moment.builder.reviews} review${moment.builder.reviews === 1 ? "" : "s"}` : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* tab strip — live pills + faint "coming as locals join" */}
        <div
          className="mt-3.5 flex flex-wrap items-center gap-1.5"
          data-testid="moment-tabs"
          onMouseEnter={() => setMomentHover(true)}
          onMouseLeave={() => setMomentHover(false)}
        >
          <span
            className="mr-1.5 text-[10.5px] uppercase tracking-[0.06em]"
            style={{ fontFamily: EARN_MONO, color: "var(--earn-faint)" }}
          >
            the moments
          </span>
          {roster.map((r) => {
            const isLive = liveKeys.has(r.key);
            const liveIndex = moments.findIndex((m) => m.key === r.key);
            const isActive = isLive && liveIndex === active;
            if (!isLive) {
              return (
                <span
                  key={r.key}
                  title="Coming as locals join"
                  className="cursor-default rounded-full px-2.5 py-[5px] text-[11px] font-medium uppercase tracking-[0.06em]"
                  style={{ fontFamily: EARN_MONO, color: "var(--earn-faint)", border: "1px dashed var(--earn-border-dash, #D5D0C8)" }}
                  data-testid={`moment-tab-faint-${r.key}`}
                >
                  {r.label}
                </span>
              );
            }
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  setPinned(liveIndex);
                  postEvent(r.key, "tab", liveIndex);
                }}
                className="rounded-full px-2.5 py-[5px] text-[11px] font-medium uppercase tracking-[0.06em]"
                style={{
                  fontFamily: EARN_MONO,
                  background: isActive ? "var(--earn-navy)" : "transparent",
                  color: isActive ? "#fff" : "var(--earn-ink)",
                  border: isActive ? "1px solid var(--earn-navy)" : "1px solid var(--earn-border, #E4E4DE)",
                }}
                data-testid={`moment-tab-${r.key}`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </OpenSection>
    </div>
  );
}
