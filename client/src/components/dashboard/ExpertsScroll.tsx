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
  /** The list route's own review aggregate (`averageRating` / `reviewCount`); null/0 = no reviews. */
  expertRating?: number | null;
  expertReviewCount?: number | null;
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

// FE-1 (c): the positional badge ("Founding expert" / "Top rated" / "Rising star" / "Verified",
// assigned by list position) and the invented rating (4.7–4.9, 64+23i reviews) are gone. No data
// stood behind either; no badge is better than a false one. A rating renders only from the list
// route's real review aggregate.
function realRating(expert: Expert): { rating: string; reviews: number } | null {
  const rating = typeof expert.expertRating === "number" ? expert.expertRating : Number(expert.expertRating);
  const reviews = Number(expert.expertReviewCount ?? 0);
  if (!Number.isFinite(rating) || rating <= 0 || !Number.isFinite(reviews) || reviews <= 0) return null;
  return { rating: rating.toFixed(1), reviews };
}

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
      <section className="mb-[22px]" data-testid="experts-scroll-section">
        <div className="text-[13px] font-medium mb-2.5" style={{ color: "#1A1A18" }}>
          Top experts in your destinations
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-shrink-0 w-[175px] h-[160px] rounded-xl animate-pulse" style={{ background: "#F3F3EE" }} />
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
    <section className="mb-[22px]" data-testid="experts-scroll-section">
      <div className="text-[13px] font-medium mb-2.5 flex items-center justify-between" style={{ color: "#1A1A18" }}>
        <span>Top experts in your destinations</span>
        <Link href="/chat">
          <span className="text-[11px] cursor-pointer hover:underline" style={{ color: "#2E8B8B" }} data-testid="link-view-all-dest-experts">
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
          const real = realRating(expert);

          return (
            <Link key={expert.id} href={`/chat`}>
              <div
                className="flex-shrink-0 w-[175px] rounded-xl overflow-hidden cursor-pointer transition-colors hover:opacity-90"
                style={{ background: "#FFFFFF", border: "0.5px solid #E8E8E2" }}
                data-testid={`expert-card-${expert.id}`}
              >
                <div className="relative h-14" style={{ background: headerGrad }}>
                  <div
                    className="absolute -bottom-[18px] left-3.5 w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-medium"
                    style={{ background: avatarColor.bg, color: avatarColor.text, border: "2px solid #FFFFFF" }}
                  >
                    {initials}
                  </div>
                </div>

                <div className="pt-6 px-3.5 pb-3.5">
                  <div className="text-[13px] font-medium truncate" style={{ color: "#1A1A18" }}>
                    {expert.firstName} {expert.lastName}
                  </div>
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: "#7A7A72" }}>
                    {location && `${location} · `}{specialty}
                  </div>
                  {real ? (
                    <div className="flex items-center gap-1 mt-1.5" data-testid={`expert-rating-${expert.id}`}>
                      <span className="text-[11px]" style={{ color: "#E8B339" }}>★</span>
                      <span className="text-[11px]" style={{ color: "#7A7A72" }}>{real.rating} ({real.reviews})</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
