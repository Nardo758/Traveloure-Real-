/**
 * "Available now" and "Usually replies within …" for a traveler-facing earner surface (Locked
 * Decision 54). Both read the server's own answer (`availableNow`, `replyTime`); a missing answer
 * draws nothing — never "offline", never a guessed reply time (§13).
 */
import { REPLY_TIME_LABELS, type ReplyTimeBucket } from "@shared/live-availability";

export function LiveStatusBadges({
  availableNow,
  replyTime,
  testIdSuffix = "",
  className = "",
}: {
  availableNow?: boolean | null;
  replyTime?: ReplyTimeBucket | string | null;
  testIdSuffix?: string;
  className?: string;
}) {
  const label = replyTime && replyTime in REPLY_TIME_LABELS ? REPLY_TIME_LABELS[replyTime as ReplyTimeBucket] : null;
  if (!availableNow && !label) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {availableNow && (
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
          style={{ background: "rgba(34,197,94,0.10)", borderColor: "rgba(34,197,94,0.35)", color: "#15803D" }}
          data-testid={`badge-available-now${testIdSuffix}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" aria-hidden />
          Available now
        </span>
      )}
      {label && (
        <span className="text-[11px] text-muted-foreground" data-testid={`text-reply-time${testIdSuffix}`}>
          {label}
        </span>
      )}
    </div>
  );
}
