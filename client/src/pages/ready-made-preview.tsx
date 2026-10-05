/**
 * /t/:slug — the Ready Made Trip's PUBLIC PREVIEW (Slice B1 — work plan L3-1 + L3-14; ledger
 * `2026-10-05-rmt-public-preview`). The page a Story link sticker, a bio link or a shared message
 * opens: cover, title, days, the expert and their local-verified stamp, the price the buyer pays and
 * ONE sample day. The rest of the plan stays behind "Get this trip", which opens the store page where
 * the purchase lives (`/ready-made/:id` — one buy flow, never a second).
 *
 * Every figure is the server's (`GET /api/ready-made/preview/:slug`): the price line is the purchase's
 * own total, the legs are the CONFIRMED legs with their own minutes, and an absent fact draws nothing
 * (§13) — no price ⇒ no price line, no confirmed legs ⇒ no travel line, no verified neighbourhood ⇒ no
 * stamp. A retitled listing's old slug is replaced in the address bar by the canonical one.
 */
import { useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { TraveloureLogo } from "@/components/ui/traveloure-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { legModeLabel } from "@/components/plan/LegRow";
import type { ReadyMadePreview } from "@shared/ready-made-preview";
import { BadgeCheck, CalendarDays, Clock3, LockKeyhole, MapPin } from "lucide-react";

const FRAUNCES = { fontFamily: "Fraunces, serif" } as const;

/** The words between two sample stops when a confirmed leg joins them; null when none does. */
export function sampleLegLine(day: NonNullable<ReadyMadePreview["sampleDay"]>, toIndex: number): string | null {
  const leg = day.legs.find((l) => l.toIndex === toIndex);
  return leg ? `${legModeLabel(leg.mode)} · ${leg.minutes} min (confirmed)` : null;
}

export function ReadyMadePreviewView({ preview }: { preview: ReadyMadePreview }) {
  const day = preview.sampleDay;
  return (
    <main className="mx-auto max-w-[760px] px-4 pb-16" data-testid="rm-preview">
      <section className="overflow-hidden rounded-2xl border border-[#e3e8e6] bg-white">
        {preview.heroImageUrl ? (
          <figure className="relative">
            <img src={preview.heroImageUrl} alt="" className="h-[260px] w-full object-cover sm:h-[340px]" data-testid="rm-preview-hero" />
            {preview.heroCredit ? (
              <figcaption className="absolute bottom-2 right-3 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white" data-testid="rm-preview-hero-credit">
                Photo by{" "}
                {preview.heroCredit.profileUrl ? (
                  <a href={preview.heroCredit.profileUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">{preview.heroCredit.photographer}</a>
                ) : preview.heroCredit.photographer}{" "}
                on Unsplash
              </figcaption>
            ) : null}
          </figure>
        ) : null}
        <div className="space-y-4 p-5 sm:p-7">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#247d78]">{preview.planLabel} · {preview.market}</p>
          <h1 className="text-[30px] font-semibold leading-[1.05] tracking-[-0.035em] text-[#193752] sm:text-[38px]" style={FRAUNCES} data-testid="rm-preview-title">
            {preview.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#45607a]">
            <span className="inline-flex items-center gap-1" data-testid="rm-preview-days"><CalendarDays className="h-4 w-4" />{preview.durationDays} {preview.durationDays === 1 ? "day" : "days"}</span>
            <span aria-hidden>·</span>
            <span data-testid="rm-preview-expert">
              by{" "}
              {preview.expert.handle ? <Link href={`/s/${preview.expert.handle}`} className="font-semibold text-[#193752] underline-offset-2 hover:underline">{preview.expert.name}</Link> : <strong className="text-[#193752]">{preview.expert.name}</strong>}
            </span>
            {preview.expert.localVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f3f2] px-2 py-0.5 text-[12px] font-semibold text-[#247d78]" data-testid="rm-preview-verified">
                <BadgeCheck className="h-3.5 w-3.5" />Local · verified in {preview.market}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e3e8e6] pt-4">
            {preview.priceLine ? (
              <strong className="text-[22px] font-semibold text-[#193752]" style={FRAUNCES} data-testid="rm-preview-price">{preview.priceLine}</strong>
            ) : <span />}
            <Link
              href={`/ready-made/${preview.id}`}
              className="inline-flex h-11 items-center rounded-full bg-[#f34d6e] px-6 text-[15px] font-semibold text-white hover:bg-[#e03d5e]"
              data-testid="rm-preview-get"
            >
              Get this trip
            </Link>
          </div>
        </div>
      </section>

      {day ? (
        <section className="mt-6 rounded-2xl border border-[#e3e8e6] bg-white p-5 sm:p-7" data-testid="rm-preview-sample-day">
          <h2 className="text-[22px] font-semibold text-[#193752]" style={FRAUNCES}>A sample day · Day {day.dayNumber}</h2>
          <ol className="mt-4 space-y-3">
            {day.stops.map((s, i) => (
              <li key={i} data-testid={`rm-preview-stop-${i}`}>
                {i > 0 && sampleLegLine(day, i) ? (
                  <p className="mb-2 ml-6 text-[12px] text-[#45607a]" data-testid={`rm-preview-leg-${i}`}>{sampleLegLine(day, i)}</p>
                ) : null}
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#193752] text-[12px] font-bold text-white">{i + 1}</span>
                  <div>
                    <p className="font-semibold text-[#193752]">{s.title}</p>
                    <p className="flex flex-wrap gap-x-3 text-[12px] text-[#45607a]">
                      {s.startTime ? <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{s.startTime}</span> : null}
                      {s.locationName ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.locationName}</span> : null}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {preview.lockedDays > 0 ? (
            <p className="mt-5 flex items-center gap-2 rounded-xl bg-[#f8faf9] p-3 text-[13px] text-[#45607a]" data-testid="rm-preview-locked">
              <LockKeyhole className="h-4 w-4" />
              The other {preview.lockedDays} {preview.lockedDays === 1 ? "day opens" : "days open"} in your own editable trip when you get it.
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

export default function ReadyMadePreviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { data, isLoading, isError } = useQuery<ReadyMadePreview>({
    queryKey: [`/api/ready-made/preview/${slug}`],
    enabled: !!slug,
    retry: false,
  });
  useEffect(() => {
    if (data && data.slug !== slug) navigate(data.path, { replace: true });
  }, [data, slug, navigate]);

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#193752]" style={{ fontFamily: '"DM Sans", "Inter", sans-serif' }}>
      <header className="mx-auto flex max-w-[760px] items-center px-4 py-4">
        <Link href="/" aria-label="Traveloure home"><TraveloureLogo /></Link>
      </header>
      {isLoading ? (
        <main className="mx-auto max-w-[760px] space-y-4 px-4"><Skeleton className="h-[300px] w-full rounded-2xl" /><Skeleton className="h-8 w-2/3" /></main>
      ) : isError || !data ? (
        <main className="mx-auto max-w-[760px] px-4 py-16 text-center">
          <h1 className="mb-2 text-[24px] font-semibold" style={FRAUNCES}>Trip not found</h1>
          <p className="text-[#45607a]">This trip may have been withdrawn. <Link href="/ready-made" className="underline">See Ready Made Trips</Link></p>
        </main>
      ) : (
        <ReadyMadePreviewView preview={data} />
      )}
    </div>
  );
}
