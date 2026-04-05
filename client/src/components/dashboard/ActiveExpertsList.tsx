import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MessageSquare } from "lucide-react";

interface Conversation {
  id: number;
  title: string;
  userId?: string | null;
  createdAt: string;
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 5) return "online now";
  if (diffMins < 60) return `last seen ${diffMins}m ago`;
  if (diffHours < 24) return `last seen ${diffHours}h ago`;
  if (diffDays === 1) return "last seen yesterday";
  return `last seen ${diffDays}d ago`;
}

function isOnline(dateStr: string): boolean {
  const diffMins = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 60000);
  return diffMins < 5;
}

function getInitials(title: string): string {
  const clean = title
    .replace(/chat with /i, "")
    .replace(/conversation with /i, "")
    .replace(/conversation/i, "Chat")
    .trim();
  return clean
    .split(" ")
    .filter(Boolean)
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "CX";
}

const AVATAR_COLORS = [
  { bg: "#E8B339", text: "#412402" },
  { bg: "#B5D4F4", text: "#0C447C" },
  { bg: "#CECBF6", text: "#3C3489" },
  { bg: "#9FE1CB", text: "#04342C" },
  { bg: "#F4C0D1", text: "#72243E" },
];

function expertDisplayName(title: string): string {
  return title
    .replace(/chat with /i, "")
    .replace(/conversation with /i, "")
    .trim() || title;
}

function expertSpecialty(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("wedding")) return "Wedding specialist";
  if (lower.includes("proposal")) return "Proposal expert";
  if (lower.includes("birthday")) return "Birthday planner";
  if (lower.includes("corporate")) return "Corporate events";
  return "Travel expert";
}

export function ActiveExpertsList() {
  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

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
          <span className="text-[12px] text-[#2E8B8B] cursor-pointer hover:underline" data-testid="link-view-all-experts">
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

          return (
            <Link key={conv.id} href={`/chat`}>
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
                  <div className="text-[13px] font-medium text-foreground truncate">{displayName}</div>
                  <div className="text-[11px] text-muted-foreground mt-px">{specialty}</div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1 justify-end">
                    {online && <span className="w-1.5 h-1.5 rounded-full bg-[#5DCAA5] inline-block" />}
                    <span
                      className={`text-[10px] ${online ? "text-[#2E8B8B]" : "text-muted-foreground"}`}
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
