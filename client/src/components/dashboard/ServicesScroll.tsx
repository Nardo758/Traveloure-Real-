import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

interface ServiceCategory {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  icon?: string | null;
  imageUrl?: string | null;
  isActive?: boolean | null;
  sortOrder?: number | null;
}

const ICON_FALLBACK: Record<string, string> = {
  transport: "🚘",
  tour: "🧭",
  photography: "📸",
  dining: "🍽️",
  accommodation: "🏨",
  wedding: "💍",
  proposal: "💝",
  birthday: "🎂",
  corporate: "🏢",
  activity: "🎯",
  wellness: "🧘",
  default: "✨",
};

function getIcon(category: ServiceCategory): string {
  if (category.icon) return category.icon;
  const slug = (category.slug || category.name || "").toLowerCase();
  for (const key of Object.keys(ICON_FALLBACK)) {
    if (slug.includes(key)) return ICON_FALLBACK[key];
  }
  return ICON_FALLBACK.default;
}

export function ServicesScroll() {
  const { data: categories, isLoading } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  if (isLoading) {
    return (
      <section className="mb-[22px]" data-testid="services-scroll-section">
        <div className="text-[13px] font-medium mb-2.5" style={{ color: "#1A1A18" }}>
          Top services
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex-shrink-0 w-[110px] h-[80px] rounded-[10px] animate-pulse" style={{ background: "#F3F3EE" }} />
          ))}
        </div>
      </section>
    );
  }

  const active = (categories ?? []).filter(c => c.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  if (active.length === 0) return null;

  return (
    <section className="mb-[22px]" data-testid="services-scroll-section">
      <div className="text-[13px] font-medium mb-2.5 flex items-center justify-between" style={{ color: "#1A1A18" }}>
        <span>Top services</span>
        <Link href="/discover">
          <span className="text-[11px] cursor-pointer hover:underline" style={{ color: "#2E8B8B" }} data-testid="link-browse-services">
            Browse all
          </span>
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" data-testid="services-scroll-track">
        {active.map((cat) => (
          <Link key={cat.id} href={`/discover?category=${cat.slug || cat.id}`}>
            <div
              className="flex-shrink-0 w-[110px] rounded-[10px] py-3 px-2.5 cursor-pointer text-center transition-colors hover:opacity-80"
              style={{ background: "#FFFFFF", border: "0.5px solid #E8E8E2" }}
              data-testid={`service-card-${cat.id}`}
            >
              <div className="text-[16px] mb-1">{getIcon(cat)}</div>
              <div className="text-[12px] font-medium truncate" style={{ color: "#1A1A18" }}>{cat.name}</div>
              {cat.description && (
                <div className="text-[10px] mt-0.5 line-clamp-1" style={{ color: "#7A7A72" }}>{cat.description}</div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
