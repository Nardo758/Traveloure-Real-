import { Link } from "wouter";

interface Conversation {
  id: number;
  title: string;
  userId?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

interface Trip {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  title?: string | null;
}

function activityTimestamp(conv: Conversation): string {
  return conv.updatedAt ?? conv.createdAt;
}

function getRelativeTime(dateStr: string): string {
  const diffMins = Math.floor(
    (new Date().getTime() - new Date(dateStr).getTime()) / 60000
  );
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 5) return "online now";
  if (diffMins < 60) return `last seen ${diffMins}m ago`;
  if (diffHours < 24) return `last seen ${diffHours}h ago`;
  if (diffDays === 1) return "last seen yesterday";
  return `last seen ${diffDays}d ago`;
}

function isOnline(dateStr: string): boolean {
  return Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 60000) < 5;
}

function getInitials(title: string): string {
  const clean = title
    .replace(/chat with /i, "")
    .replace(/conversation with /i, "")
    .replace(/conversation/i, "Chat")
    .trim();
  return (
    clean
      .split(" ")
      .filter(Boolean)
      .map(w => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "CX"
  );
}

function expertDisplayName(title: string): string {
  return (
    title
      .replace(/chat with /i, "")
      .replace(/conversation with /i, "")
      .trim() || title
  );
}

function matchConversationToTrip(
  conv: Conversation,
  trips: Trip[]
): Trip | null {
  const cTitle = conv.title.toLowerCase();
  const match = trips.find(t => {
    const destKey = t.destination?.split(",")[0]?.toLowerCase().trim();
    const titleKey = t.title?.toLowerCase().trim();
    return (
      (destKey && cTitle.includes(destKey)) ||
      (titleKey && cTitle.includes(titleKey))
    );
  });
  return match ?? null;
}

const AVATAR_COLORS: Array<{ bg: string; text: string }> = [
  { bg: "#E8B339", text: "#412402" },
  { bg: "#B5D4F4", text: "#0C447C" },
  { bg: "#CECBF6", text: "#3C3489" },
  { bg: "#9FE1CB", text: "#04342C" },
  { bg: "#F4C0D1", text: "#72243E" },
];

interface ActiveExpertsListProps {
  conversations: Conversation[];
  trips: Trip[];
  isLoading?: boolean;
}

export function ActiveExpertsList({
  conversations,
  trips,
  isLoading,
}: ActiveExpertsListProps) {
  if (isLoading) {
    return (
      <section className="mb-[22px]" data-testid="active-experts-section">
        <div className="text-[13px] font-medium mb-2.5 flex items-center justify-between" style={{ color: "#1A1A18" }}>
          <span>Your active experts</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {[1, 2].map(i => (
            <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: "#F3F3EE" }} />
          ))}
        </div>
      </section>
    );
  }

  if (!conversations || conversations.length === 0) return null;

  const displayed = conversations.slice(0, 5);

  return (
    <section className="mb-[22px]" data-testid="active-experts-section">
      <div className="text-[13px] font-medium mb-2.5 flex items-center justify-between" style={{ color: "#1A1A18" }}>
        <span>Your active experts</span>
        <Link href="/chat">
          <span
            className="text-[11px] cursor-pointer hover:underline"
            style={{ color: "#2E8B8B" }}
            data-testid="link-view-all-experts"
          >
            View all
          </span>
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        {displayed.map((conv, i) => {
          const activityTs = activityTimestamp(conv);
          const online = isOnline(activityTs);
          const relTime = getRelativeTime(activityTs);
          const initials = getInitials(conv.title);
          const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
          const displayName = expertDisplayName(conv.title);
          const linkedTrip = matchConversationToTrip(conv, trips);

          return (
            <Link key={conv.id} href="/chat">
              <div
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-[#F3F3EE]"
                style={{ background: "#FFFFFF", border: "0.5px solid #E8E8E2" }}
                data-testid={`expert-row-${conv.id}`}
              >
                <div
                  className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                  style={{ background: color.bg, color: color.text }}
                >
                  {initials}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate" style={{ color: "#1A1A18" }}>
                    {displayName}
                  </div>
                  {linkedTrip && (
                    <div className="text-[10px] mt-px" style={{ color: "#7A7A72" }}>
                      {linkedTrip.destination}
                    </div>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  {linkedTrip && (
                    <div className="text-[10px] font-medium mb-0.5 max-w-[120px] truncate text-right" style={{ color: "#1A1A18" }} data-testid={`expert-trip-name-${conv.id}`}>
                      {linkedTrip.title || linkedTrip.destination}
                    </div>
                  )}
                  <div className="flex items-center gap-1 justify-end">
                    {online && (
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#5DCAA5" }} />
                    )}
                    <span className="text-[9px]" style={{ color: online ? "#2E8B8B" : "#7A7A72" }}>
                      {online ? "● Online" : relTime}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
