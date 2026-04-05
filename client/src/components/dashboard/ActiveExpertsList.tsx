import { Link } from "wouter";

interface Conversation {
  id: number;
  title: string;
  userId?: string | null;
  createdAt: string;
}

interface Trip {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  title?: string | null;
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

function expertSpecialty(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("wedding")) return "Wedding specialist";
  if (lower.includes("proposal")) return "Proposal expert";
  if (lower.includes("birthday")) return "Birthday planner";
  if (lower.includes("corporate")) return "Corporate events";
  return "Travel expert";
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
      <section className="mb-6" data-testid="active-experts-section">
        <div className="text-sm font-medium text-foreground mb-3 flex items-center justify-between">
          <span>Your active experts</span>
        </div>
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (!conversations || conversations.length === 0) return null;

  const displayed = conversations.slice(0, 5);

  return (
    <section className="mb-6" data-testid="active-experts-section">
      <div className="text-sm font-medium text-foreground mb-3 flex items-center justify-between">
        <span>Your active experts</span>
        <Link href="/chat">
          <span
            className="text-[12px] text-[#2E8B8B] cursor-pointer hover:underline"
            data-testid="link-view-all-experts"
          >
            View all
          </span>
        </Link>
      </div>

      <div className="space-y-2">
        {displayed.map((conv, i) => {
          const online = isOnline(conv.createdAt);
          const relTime = getRelativeTime(conv.createdAt);
          const initials = getInitials(conv.title);
          const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
          const displayName = expertDisplayName(conv.title);
          const specialty = expertSpecialty(conv.title);
          const linkedTrip = matchConversationToTrip(conv, trips);

          return (
            <Link key={conv.id} href="/chat">
              <div
                className="flex items-center gap-3 px-3.5 py-2.5 bg-card border border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                style={{ borderWidth: "0.5px" }}
                data-testid={`expert-row-${conv.id}`}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-medium flex-shrink-0"
                  style={{ background: color.bg, color: color.text }}
                >
                  {initials}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-foreground truncate">
                    {displayName}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-px">
                    {specialty}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  {linkedTrip && (
                    <div
                      className="text-[11px] font-medium text-foreground mb-0.5 max-w-[120px] truncate text-right"
                      data-testid={`expert-trip-name-${conv.id}`}
                    >
                      {linkedTrip.title || linkedTrip.destination}
                    </div>
                  )}
                  <div className="flex items-center gap-1 justify-end">
                    {online && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5DCAA5] inline-block" />
                    )}
                    <span
                      className={`text-[10px] ${
                        online ? "text-[#2E8B8B]" : "text-muted-foreground"
                      }`}
                    >
                      {relTime}
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
