import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

interface ProviderService {
  id: string;
  userId: string;
  categoryId: string;
  serviceName: string;
  description: string;
  price: string | null;
  priceType: string | null;
  location: string | null;
  averageRating: string | null;
  reviewCount: number;
  status: string;
  category?: { name: string; slug: string } | null;
  provider?: {
    businessName: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface RecommendedServicesProps {
  destinations: string[];
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  transport: { bg: "#E1F5EE", text: "#085041" },
  photography: { bg: "#FBEAF0", text: "#72243E" },
  dining: { bg: "#FAEEDA", text: "#633806" },
  food: { bg: "#FAEEDA", text: "#633806" },
  tour: { bg: "#E6F1FB", text: "#0C447C" },
  guide: { bg: "#E6F1FB", text: "#0C447C" },
  culture: { bg: "#EEEDFE", text: "#3C3489" },
  accommodation: { bg: "#E6F1FB", text: "#0C447C" },
  wedding: { bg: "#FBEAF0", text: "#72243E" },
  default: { bg: "#F3F4F6", text: "#6B7280" },
};

function getCategoryColor(categoryName: string) {
  const slug = (categoryName || "").toLowerCase();
  for (const key of Object.keys(CATEGORY_COLORS)) {
    if (slug.includes(key)) return CATEGORY_COLORS[key];
  }
  return CATEGORY_COLORS.default;
}

function deriveReason(category: string | undefined, location: string | null): string {
  if (category && location) {
    return `Matches your ${location} itinerary — ${category.toLowerCase()}`;
  }
  if (category) {
    return `Trending ${category.toLowerCase()} service for your trip`;
  }
  if (location) {
    return `Popular service in ${location}`;
  }
  return "Recommended for your travel plans";
}

export function RecommendedServices({
  destinations,
}: RecommendedServicesProps) {
  const [filter, setFilter] = useState<string>("all");

  const { data: services, isLoading } = useQuery<ProviderService[]>({
    queryKey: ["/api/provider-services"],
  });

  if (isLoading) {
    return (
      <section className="mb-6" data-testid="recommended-services-section">
        <div className="text-sm font-medium text-foreground mb-3">
          Recommended services
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  const allServices = services ?? [];
  const filterTabs = ["all", ...new Set(destinations.map((d) => d.toLowerCase()))];

  const filtered =
    filter === "all"
      ? allServices
      : allServices.filter((s) =>
          (s.location || "").toLowerCase().includes(filter)
        );

  const displayServices = filtered.slice(0, 8);

  if (allServices.length === 0) return null;

  return (
    <section className="mb-6" data-testid="recommended-services-section">
      <div className="text-sm font-medium text-foreground mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>Recommended services</span>
          <span
            className="text-[9px] px-2 py-0.5 rounded-md font-medium"
            style={{ background: "#FAEEDA", color: "#633806" }}
          >
            Based on your plans
          </span>
        </div>
        <div className="flex gap-1">
          {filterTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`text-[9px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
                filter === tab
                  ? "border-[#E85D55] text-[#E85D55] bg-[#E85D55]/5 border font-medium"
                  : "border-border text-muted-foreground border hover:text-foreground"
              }`}
              style={{ borderWidth: "0.5px" }}
              data-testid={`filter-${tab}`}
            >
              {tab === "all"
                ? "All"
                : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-[8px]" data-testid="services-list">
        {displayServices.map((svc, i) => {
          const catName = svc.category?.name || "Service";
          const catColors = getCategoryColor(catName);
          const provName =
            svc.provider?.businessName ||
            `${svc.provider?.firstName || ""} ${svc.provider?.lastName || ""}`.trim() ||
            "Provider";
          const initials = provName
            .split(" ")
            .map((w) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
          const price = parseFloat(svc.price || "0");
          const rating = parseFloat(svc.averageRating || "0");
          const reason = deriveReason(svc.category?.name, svc.location);

          return (
            <div
              key={svc.id}
              className="flex items-center gap-3 px-3 py-2.5 bg-card border border-border cursor-pointer hover:bg-muted/20 transition-colors"
              style={{
                borderRadius:
                  i === 0
                    ? "8px 8px 0 0"
                    : i === displayServices.length - 1
                      ? "0 0 8px 8px"
                      : 0,
                borderTop: i > 0 ? "none" : undefined,
              }}
              data-testid={`service-row-${svc.id}`}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold flex-shrink-0"
                style={{
                  background: catColors.bg,
                  color: catColors.text,
                }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[12px] font-medium text-foreground truncate">
                    {svc.serviceName}
                  </span>
                  <span
                    className="text-[8px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                    style={{
                      background: catColors.bg,
                      color: catColors.text,
                    }}
                  >
                    {catName}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                  <span className="font-medium text-foreground">
                    {provName}
                  </span>
                  {svc.location && <span data-testid={`service-location-${svc.id}`}>📍 {svc.location}</span>}
                  {rating > 0 && (
                    <span style={{ color: "#E8B339" }}>
                      ★ {rating.toFixed(1)}
                    </span>
                  )}
                  {svc.reviewCount > 0 && (
                    <span>({svc.reviewCount})</span>
                  )}
                </div>
                <div
                  className="text-[10px] italic mt-0.5"
                  style={{ color: "#2E8B8B" }}
                  data-testid={`service-reason-${svc.id}`}
                >
                  💡 {reason}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-semibold text-foreground mb-1">
                  ${price > 0 ? price.toFixed(0) : "—"}
                </div>
                <button
                  className="text-[9px] px-2.5 py-1 rounded font-medium border transition-colors"
                  style={{
                    borderColor: "#E85D55",
                    color: "#E85D55",
                    borderWidth: "0.5px",
                    background: "transparent",
                  }}
                  data-testid={`button-add-service-${svc.id}`}
                >
                  Add to cart
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
