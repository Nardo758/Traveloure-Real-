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
  transport: "🚗",
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

const ICON_COLORS: Record<string, string> = {
  transport: "#E1F5EE",
  tour: "#FAEEDA",
  photography: "#FBEAF0",
  dining: "#FAECE7",
  accommodation: "#E6F1FB",
  wedding: "#FBEAF0",
  proposal: "#FBEAF0",
  birthday: "#FAEEDA",
  corporate: "#E6F1FB",
  default: "#F3F4F6",
};

function getIcon(category: ServiceCategory): string {
  if (category.icon) return category.icon;
  const slug = (category.slug || category.name || "").toLowerCase();
  for (const key of Object.keys(ICON_FALLBACK)) {
    if (slug.includes(key)) return ICON_FALLBACK[key];
  }
  return ICON_FALLBACK.default;
}

function getIconColor(category: ServiceCategory): string {
  const slug = (category.slug || category.name || "").toLowerCase();
  for (const key of Object.keys(ICON_COLORS)) {
    if (slug.includes(key)) return ICON_COLORS[key];
  }
  return ICON_COLORS.default;
}

export function ServicesScroll() {
  const { data: categories, isLoading } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  if (isLoading) {
    return (
      <section className="mb-6" data-testid="services-scroll-section">
        <div className="text-sm font-medium text-foreground mb-3 flex items-center justify-between">
          <span>Top services</span>
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-shrink-0 w-[145px] h-[90px] rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  const active = (categories ?? []).filter(c => c.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  if (active.length === 0) return null;

  return (
    <section className="mb-6" data-testid="services-scroll-section">
      <div className="text-sm font-medium text-foreground mb-3 flex items-center justify-between">
        <span>Top services</span>
        <Link href="/discover">
          <span className="text-[12px] text-[#2E8B8B] cursor-pointer hover:underline" data-testid="link-browse-services">
            Browse all
          </span>
        </Link>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide" data-testid="services-scroll-track">
        {active.map((cat) => (
          <Link key={cat.id} href={`/discover?category=${cat.slug || cat.id}`}>
            <div
              className="flex-shrink-0 w-[145px] bg-card border border-border rounded-xl py-4 px-3.5 cursor-pointer text-center hover:border-border/80 transition-colors"
              style={{ borderWidth: "0.5px" }}
              data-testid={`service-card-${cat.id}`}
            >
              <div
                className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-lg"
                style={{ background: getIconColor(cat) }}
              >
                {getIcon(cat)}
              </div>
              <div className="text-[13px] font-medium text-foreground truncate">{cat.name}</div>
              {cat.description && (
                <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{cat.description}</div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
