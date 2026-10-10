/**
 * earn-section.tsx — "Ways to earn" (landing-build Phase 2.8).
 * Visual of record: docs/design/landing-earn-mock.html "EARN: two columns, hairlines".
 *
 * Coral button 2 of the ruled 3 (hero, earn, final) — the final CTA section was cut by H1 (ledger
 * `2026-10-08-h1-home-copy`), and every primary fills with `--coral-fill`. The role links keep the EXISTING
 * /earn parameter vocabulary (LANDING_SPEC.md preserve-exactly): `?track=provider` and
 * `?track=expert` are the shipped aliases (earn.tsx maps them to service_provider /
 * trip_planner), and `?role=` takes role keys directly — local_expert uses it.
 */
import { Link } from "wouter";
import { Briefcase, Waypoints, Lamp } from "lucide-react";
import { SectionHeader, OpenSection } from "./section-header";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const ROLES = [
  {
    icon: Briefcase,
    title: "Offer local services",
    note: "tours, transport, photography, food",
    href: "/earn?track=provider",
    testId: "earn-role-provider",
  },
  {
    icon: Waypoints,
    title: "Plan trips for others",
    note: "advise, review, coordinate",
    href: "/earn?track=expert",
    testId: "earn-role-trip-planner",
  },
  {
    icon: Lamp,
    title: "Guide your neighborhood",
    note: "the streets you actually know",
    href: "/earn?role=local_expert",
    testId: "earn-role-local-expert",
  },
];

export function EarnSection() {
  return (
    <OpenSection testId="section-earn">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <span
            className="text-[10.5px] font-medium uppercase tracking-[0.12em]"
            style={{ fontFamily: EARN_MONO, color: "var(--earn-coral-ink)" }}
          >
            Ways to earn
          </span>
          <h3
            className="mb-2 mt-1.5 text-[30px] font-semibold"
            style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}
          >
            Know a city well? Get paid for it.
          </h3>
          <p className="mb-4 max-w-[460px] text-[15px]" style={{ color: "var(--earn-muted)" }}>
            Choose the role that fits how you want to work.
          </p>
          {/* Coral 2 of 3 (ruled). */}
          <Link
            href="/earn"
            className="inline-flex items-center rounded-[8px] px-3.5 py-2 text-[13px] font-semibold text-white"
            style={{ background: "var(--coral-fill)" }}
            data-testid="button-see-ways-to-earn"
          >
            See ways to earn
          </Link>
        </div>
        <div className="flex flex-col gap-3" data-testid="earn-roles">
          {ROLES.map((r) => (
            <Link
              key={r.testId}
              href={r.href}
              className="flex items-start gap-3 rounded-[12px] border bg-white px-3.5 py-3"
              style={{ borderColor: "var(--earn-border)", color: "var(--earn-ink)" }}
              data-testid={r.testId}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
                style={{ background: "var(--earn-teal-wash)", color: "var(--earn-teal-ink)" }}
              >
                <r.icon className="h-4 w-4" />
              </span>
              {/* H1 (ledger `2026-10-08-h1-home-copy`): one line per role. */}
              <span className="self-center text-[14px]">
                <b>{r.title}</b>
                <span style={{ color: "var(--earn-muted)" }}> · {r.note}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </OpenSection>
  );
}
