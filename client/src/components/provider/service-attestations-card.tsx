/**
 * D9 attestation capture card (docs/DECISIONS.md ruling 62's D9 clause, executed by ruling 67).
 *
 * Placement: the ServiceForm wizard's "Terms & requirements" step — the C9 precedent that puts
 * per-listing curation on the "what I sell" module. This component is the whole surface; the
 * wizard owns only the checkbox state and the post-save write.
 *
 * ── WHAT RENDERS, AND WHEN ───────────────────────────────────────────────────────────────────
 * The card renders ONLY when the SERVER-SHARED predicate resolves a non-empty applicable set for
 * the listing being edited (`shared/service-attestations.ts` — the identical function the server
 * re-runs on the write, so the card and the accepted set cannot drift). An attestation that does
 * not apply never appears. §13 omissions ("we cannot tell whether this applies") render as ONE
 * muted line INSIDE the card and only when there is already something to affirm — see the noise
 * judgment in ruling 67: every omission here is fixable in step 1 of this same wizard (pick a
 * category / pick a delivery method), so it is an actionable nudge rather than a compliance
 * lecture; a listing with nothing applicable shows no card at all rather than a page of caveats.
 *
 * ── ALREADY-AFFIRMED IS READ-ONLY ────────────────────────────────────────────────────────────
 * The record is append-only (migration 197, no un-affirm path). An attestation already on record
 * renders checked, disabled, and stamped with the date it was made — it is a statement that was
 * made, not a setting.
 *
 * ── i18n (ruling 60 system A / ruling 65) ────────────────────────────────────────────────────
 * Card CHROME goes through `t()` against the `provider` namespace. The attestation LABEL/BODY copy
 * does NOT: it is platform copy that travels with the server's catalog response so the wire and
 * the wizard state one sentence, and it carries its own EN+JA (machine-authored — native review
 * is owed on the EXISTING I18N-1 debt). This file is wholly wrapped, never half — see I18N-2's
 * convention; the surrounding ServiceForm is still hardcoded English and is untouched here.
 * data-testids stay English-derived (ruling 65's hazard note).
 */
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocale } from "@/hooks/use-locale";
import {
  ATTESTATION_CATALOG,
  type AttestationKey,
  type AttestationResolution,
  type ProtectedTitleWarning,
} from "@shared/service-attestations";

export interface ServiceAttestationsCardProps {
  /** The SHARED resolver's output for the listing's live shape. */
  resolution: AttestationResolution;
  /** attestationKey → ISO timestamp, for affirmations already on record (edit mode). */
  affirmedAt: Record<string, string>;
  /** Locally checked-but-not-yet-saved keys. */
  checked: Record<string, boolean>;
  onToggle: (key: AttestationKey, next: boolean) => void;
  /**
   * SS-5a (ruling 69 disposition 3): applicable keys with no affirmation yet — the exact set the
   * server's `ATTESTATION_GATE` 403 would name. Computed by the wizard from this same resolution.
   */
  unaffirmed?: readonly AttestationKey[];
  /**
   * False when the gate cannot fire for this listing — i.e. it is already live and therefore
   * GRANDFATHERED. The card then nudges instead of announcing a block, because announcing one
   * that will not happen is its own §13 dishonesty.
   */
  gateApplies?: boolean;
  /** SS-5c (ruling 69 disposition 5): the advisory protected-title hit, or null. Never blocks. */
  titleClaimWarning?: ProtectedTitleWarning | null;
}

export function ServiceAttestationsCard({
  resolution,
  affirmedAt,
  checked,
  onToggle,
  unaffirmed = [],
  gateApplies = true,
  titleClaimWarning = null,
}: ServiceAttestationsCardProps) {
  const { t } = useTranslation("provider");
  const { locale } = useLocale();

  // The card's own render rule (see header): nothing applicable ⇒ no card — EXTENDED by SS-5c,
  // because a protected-title claim is worth saying out loud even on a listing whose category
  // makes no attestation applicable, and this card is the one surface that owns this subject.
  if (resolution.applicable.length === 0 && !titleClaimWarning) return null;

  return (
    <Card data-testid="card-service-attestations">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />
          {t("attestations.title", "Confirmations")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── SS-5c SOFT WARNING (ruling 69 disposition 5) ────────────────────────────────────
            Advisory ONLY: it never blocks a save, never blocks a publish and never edits the
            text. The copy is localized platform copy carried by the shared detector — the same
            treatment the attestation label/body pair gets, so the wire and the card say one
            sentence. Its ABSENCE proves nothing (§13): this list is small and deliberate. */}
        {titleClaimWarning && (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3"
            data-testid="warning-protected-title-claim"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="text-xs text-amber-900">
              {titleClaimWarning.message[locale] ?? titleClaimWarning.message.en}
            </p>
          </div>
        )}

        {resolution.applicable.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="text-attestations-intro">
          {t(
            "attestations.intro",
            "These are shown because of what you sell and how you deliver it. They are your own statements — Traveloure does not verify them, and they are not shown to travelers.",
          )}
        </p>
        )}

        {/* ── SS-5a GATE NOTICE (ruling 69 disposition 3) ─────────────────────────────────────
            A disabled control whose reason is invisible is a dead end (the M-2 finding, one
            surface over). The Publish button goes disabled when this set is non-empty, so the
            reason is stated here, where the boxes are. A GRANDFATHERED listing (already live)
            gets the softer sentence, because for it no block will actually occur. */}
        {unaffirmed.length > 0 && (
          <p
            className={gateApplies ? "text-xs font-medium text-amber-700" : "text-xs text-muted-foreground"}
            data-testid="text-attestations-gate"
          >
            {gateApplies
              ? t(
                  "attestations.gateBlocked",
                  "Confirm these before publishing. You can still save this as a draft.",
                )
              : t(
                  "attestations.gateGrandfathered",
                  "This listing is already live, so these are not blocking it — please confirm them when you can.",
                )}
          </p>
        )}

        {resolution.applicable.map((key) => {
          const type = ATTESTATION_CATALOG[key as AttestationKey];
          const onRecord = affirmedAt[key];
          const isChecked = !!onRecord || !!checked[key];
          return (
            <div
              key={key}
              className="flex items-start gap-3 rounded-md border p-3"
              data-testid={`attestation-row-${key}`}
            >
              <Checkbox
                id={`attestation-${key}`}
                checked={isChecked}
                disabled={!!onRecord}
                onCheckedChange={(v) => onToggle(key as AttestationKey, v === true)}
                data-testid={`checkbox-attestation-${key}`}
                className="mt-0.5"
              />
              <label htmlFor={`attestation-${key}`} className="flex-1 cursor-pointer">
                <span className="text-sm font-medium">{type.label[locale] ?? type.label.en}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {type.body[locale] ?? type.body.en}
                </span>
                {onRecord && (
                  <span
                    className="mt-1 block text-xs text-muted-foreground"
                    data-testid={`text-attestation-affirmed-${key}`}
                  >
                    {t("attestations.affirmedOn", "Confirmed on {{date}}", {
                      date: new Date(onRecord).toLocaleDateString(),
                    })}
                  </span>
                )}
              </label>
            </div>
          );
        })}

        {/* §13: what we could NOT decide, with the reason — one muted line, never a fake pass. */}
        {resolution.omitted.length > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="text-attestations-omitted">
            {t(
              "attestations.omitted",
              "Some confirmations could not be worked out for this listing yet:",
            )}{" "}
            {/* De-duplicated defensively: two keys can be blocked by the same missing signal,
                and repeating one sentence reads as a rendering bug rather than as two facts. */}
            {Array.from(new Set(resolution.omitted.map((o) => o.reason[locale] ?? o.reason.en))).join("; ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default ServiceAttestationsCard;
