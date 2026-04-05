import { Link } from "wouter";

interface ActiveExpertsPanelProps {
  conversations: Array<{
    id: number;
    title: string;
    userId?: string | null;
    createdAt: string;
  }>;
  trips: Array<any>;
}

export function ActiveExpertsPanel({
  conversations,
  trips,
}: ActiveExpertsPanelProps) {
  const activeConvs = conversations.slice(0, 3);

  if (activeConvs.length === 0 && trips.length === 0) return null;

  return (
    <div
      className="bg-card border border-border rounded-xl p-3"
      data-testid="active-experts-panel"
    >
      <div className="text-[11px] font-medium text-foreground mb-2">
        Active experts
      </div>
      {activeConvs.length > 0 ? (
        activeConvs.map((conv, i) => {
          const name = conv.title
            .replace(/chat with /i, "")
            .replace(/conversation with /i, "")
            .trim();
          const initials = name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
          return (
            <div
              key={conv.id}
              className="py-1.5"
              style={{
                borderTop: i > 0 ? "0.5px solid var(--border)" : "none",
              }}
              data-testid={`active-expert-${conv.id}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full text-[9px] font-semibold flex items-center justify-center flex-shrink-0"
                  style={{ background: "#E8B339", color: "#412402" }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-medium text-foreground">
                    {name}
                  </div>
                  <div className="text-[9px] text-muted-foreground truncate">
                    {new Date(conv.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <p className="text-[10px] text-muted-foreground">
          No active expert conversations
        </p>
      )}
      <Link href="/chat">
        <button
          className="w-full mt-2 py-1.5 rounded-md text-[10px] font-medium border border-border text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-view-all-experts"
        >
          View all experts
        </button>
      </Link>
    </div>
  );
}
