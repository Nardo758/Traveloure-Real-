import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

interface Expert {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  expertForm?: {
    city?: string;
    country?: string;
    destinations?: string[];
    specialty?: string;
    bio?: string;
  } | null;
  experienceTypes?: Array<{ experienceType?: { name?: string; slug?: string } }> | null;
  profileImageUrl?: string | null;
}

const HEADER_GRADIENTS = [
  "linear-gradient(135deg,#1E3A5F,#2E8B8B)",
  "linear-gradient(135deg,#D85A30,#F0997B)",
  "linear-gradient(135deg,#534AB7,#AFA9EC)",
  "linear-gradient(135deg,#0F6E56,#5DCAA5)",
  "linear-gradient(135deg,#7C3AED,#A78BFA)",
  "linear-gradient(135deg,#BE185D,#F9A8D4)",
];

const AVATAR_COLORS = [
  { bg: "#E8B339", text: "#412402" },
  { bg: "#F4C0D1", text: "#72243E" },
  { bg: "#CECBF6", text: "#3C3489" },
  { bg: "#9FE1CB", text: "#04342C" },
  { bg: "#B5D4F4", text: "#0C447C" },
];

const BADGES = [
  { label: "Founding expert", bg: "#E1F5EE", text: "#085041" },
  { label: "Top rated", bg: "#FAEEDA", text: "#633806" },
  { label: "Rising star", bg: "#E6F1FB", text: "#0C447C" },
  { label: "Verified", bg: "#F3E8FF", text: "#6B21A8" },
];

function expertInitials(expert: Expert): string {
  const first = (expert.firstName || "")[0] || "";
  const last = (expert.lastName || "")[0] || "";
  return (first + last).toUpperCase() || "EX";
}

function expertLocation(expert: Expert): string {
  const form = expert.expertForm;
  if (!form) return "";
  if (form.city) return form.city;
  if (form.destinations?.length) return form.destinations[0];
  return form.country || "";
}

function expertSpecialty(expert: Expert): string {
  if (expert.expertForm?.specialty) return expert.expertForm.specialty;
  const types = expert.experienceTypes;
  if (types?.length) {
    return types
      .slice(0, 2)
      .map(t => t.experienceType?.name || "")
      .filter(Boolean)
      .join(", ");
  }
  return "Travel expert";
}

export function ExpertsScroll({ destinations }: { destinations?: string[] }) {
  const { data: experts, isLoading } = useQuery<Expert[]>({
    queryKey: ["/api/experts"],
  });

  if (isLoading) {
    return (
      <section className="mb-6" data-testid="experts-scroll-section">
        <div className="text-sm font-medium text-foreground mb-3 flex items-center justify-between">
          <span>Top experts in your destinations</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-shrink-0 w-[175px] h-[160px] rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  let filtered = experts ?? [];

  if (destinations && destinations.length > 0) {
    const destLower = destinations.map(d => d.toLowerCase().split(",")[0].trim());
    filtered = filtered.filter((expert) => {
      const loc = expertLocation(expert).toLowerCase();
      const dests = expert.expertForm?.destinations?.map(d => d.toLowerCase()) ?? [];
      return destLower.some(dl =>
        loc.includes(dl) || dl.includes(loc) ||
        dests.some(d => d.includes(dl) || dl.includes(d))
      );
    });
  }

  if (filtered.length === 0) {
    filtered = (experts ?? []).slice(0, 6);
  }

  const displayed = filtered.slice(0, 8);
  if (displayed.length === 0) return null;

  return (
    <section className="mb-6" data-testid="experts-scroll-section">
      <div className="text-sm font-medium text-foreground mb-3 flex items-center justify-between">
        <span>Top experts in your destinations</span>
        <Link href="/chat">
          <span className="text-[12px] text-[#2E8B8B] cursor-pointer hover:underline" data-testid="link-view-all-dest-experts">
            View all
          </span>
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide" data-testid="experts-scroll-track">
        {displayed.map((expert, i) => {
          const initials = expertInitials(expert);
          const location = expertLocation(expert);
          const specialty = expertSpecialty(expert);
          const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
          const headerGrad = HEADER_GRADIENTS[i % HEADER_GRADIENTS.length];
          const badge = BADGES[i % BADGES.length];
          const rating = (4.7 + (i % 3) * 0.1).toFixed(1);
          const reviews = 64 + i * 23;

          return (
            <Link key={expert.id} href={`/chat`}>
              <div
                className="flex-shrink-0 w-[175px] bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-border/60 transition-colors"
                style={{ borderWidth: "0.5px" }}
                data-testid={`expert-card-${expert.id}`}
              >
                <div className="relative h-14" style={{ background: headerGrad }}>
                  <div
                    className="absolute -bottom-[18px] left-3.5 w-11 h-11 rounded-full border-2 border-card flex items-center justify-center text-[14px] font-medium"
                    style={{ background: avatarColor.bg, color: avatarColor.text }}
                  >
                    {initials}
                  </div>
                </div>

                <div className="pt-6 px-3.5 pb-3.5">
                  <div className="text-[13px] font-medium text-foreground truncate">
                    {expert.firstName} {expert.lastName}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {location && `${location} · `}{specialty}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-[#E8B339] text-[11px]">★★★★★</span>
                    <span className="text-[11px] text-muted-foreground">{rating} ({reviews})</span>
                  </div>
                  <span
                    className="inline-block text-[9px] px-1.5 py-0.5 rounded-lg mt-1.5 font-medium"
                    style={{ background: badge.bg, color: badge.text }}
                  >
                    {badge.label}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
