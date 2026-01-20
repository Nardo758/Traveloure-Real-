import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Plane,
  Heart,
  Gem,
  Moon,
  Cake,
  Building2,
  Users,
  Sparkles,
  Calendar,
  Baby,
  GraduationCap,
  Home,
  Award,
  PartyPopper,
  TreePine,
  Briefcase,
  ChevronRight,
} from "lucide-react";
import { useLocation } from "wouter";

interface ExperienceType {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
}

interface ExperienceTemplatesProps {
  selectedMonth?: number;
  selectedVibe?: string;
  onTemplateClick?: (slug: string) => void;
}

const templateIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Plane,
  Heart,
  Gem,
  Moon,
  Cake,
  Building2,
  Users,
  Sparkles,
  Calendar,
  Baby,
  GraduationCap,
  Home,
  Award,
  PartyPopper,
  TreePine,
  Briefcase,
};

const monthSeasonalMappings: Record<number, string[]> = {
  1: ["travel", "retreat", "corporate"],
  2: ["proposal", "date-night", "romantic"],
  3: ["travel", "retreat", "wedding"],
  4: ["travel", "wedding", "proposal"],
  5: ["wedding", "graduation-party", "travel"],
  6: ["wedding", "graduation-party", "honeymoon"],
  7: ["travel", "family", "retreat"],
  8: ["travel", "family", "retreat"],
  9: ["travel", "corporate", "retreat"],
  10: ["travel", "wedding", "corporate"],
  11: ["travel", "corporate", "reunion"],
  12: ["holiday-party", "family", "travel"],
};

const vibeMappings: Record<string, string[]> = {
  romantic: ["proposal", "date-night", "wedding-anniversaries", "honeymoon"],
  adventure: ["travel", "retreat"],
  cultural: ["travel", "corporate-events"],
  beach: ["travel", "honeymoon", "retreat"],
  foodie: ["date-night", "travel", "birthday"],
  nightlife: ["date-night", "birthday", "bachelor-party"],
  family: ["travel", "birthday", "reunion", "family"],
  nature: ["travel", "retreat", "honeymoon"],
};

const popularTemplates = [
  { slug: "travel", name: "Travel", icon: "Plane", bgClass: "bg-muted", iconClass: "text-foreground" },
  { slug: "wedding", name: "Wedding", icon: "Heart", bgClass: "bg-muted", iconClass: "text-foreground" },
  { slug: "proposal", name: "Proposal", icon: "Gem", bgClass: "bg-muted", iconClass: "text-foreground" },
  { slug: "date-night", name: "Date Night", icon: "Moon", bgClass: "bg-muted", iconClass: "text-foreground" },
  { slug: "birthday", name: "Birthday", icon: "Cake", bgClass: "bg-muted", iconClass: "text-foreground" },
  { slug: "corporate", name: "Corporate", icon: "Briefcase", bgClass: "bg-muted", iconClass: "text-foreground" },
  { slug: "retreat", name: "Retreats", icon: "TreePine", bgClass: "bg-muted", iconClass: "text-foreground" },
  { slug: "reunion", name: "Reunions", icon: "Users", bgClass: "bg-muted", iconClass: "text-foreground" },
];

function getRecommendedTemplates(
  month: number | undefined,
  vibe: string | undefined,
  allTemplates: ExperienceType[]
): { template: ExperienceType; reason: string }[] {
  const recommendations: { template: ExperienceType; reason: string }[] = [];
  const addedSlugs = new Set<string>();

  const vibeRecommendedSlugs = vibe && vibe !== "all" ? vibeMappings[vibe] || [] : [];
  for (const slug of vibeRecommendedSlugs) {
    const template = allTemplates.find(t => t.slug === slug || t.slug.includes(slug));
    if (template && !addedSlugs.has(template.slug)) {
      addedSlugs.add(template.slug);
      recommendations.push({
        template,
        reason: `Perfect for ${vibe} vibes`,
      });
    }
    if (recommendations.length >= 2) break;
  }

  const monthRecommendedSlugs = month ? monthSeasonalMappings[month] || [] : [];
  const monthNames = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  for (const slug of monthRecommendedSlugs) {
    if (recommendations.length >= 4) break;
    const template = allTemplates.find(t => t.slug === slug || t.slug.includes(slug));
    if (template && !addedSlugs.has(template.slug)) {
      addedSlugs.add(template.slug);
      recommendations.push({
        template,
        reason: `Popular in ${month ? monthNames[month] : "this season"}`,
      });
    }
  }

  return recommendations;
}

export function ExperienceTemplates({
  selectedMonth,
  selectedVibe,
  onTemplateClick,
}: ExperienceTemplatesProps) {
  const [, navigate] = useLocation();

  const { data: experienceTypes, isLoading } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
  });

  const handleTemplateClick = (slug: string) => {
    if (onTemplateClick) {
      onTemplateClick(slug);
    } else {
      navigate(`/experience/${slug}`);
    }
  };

  const recommendedTemplates = getRecommendedTemplates(
    selectedMonth,
    selectedVibe,
    experienceTypes || []
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-6 w-48 mb-3" />
          <div className="flex gap-3 overflow-hidden">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-28 flex-shrink-0 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-lg font-semibold flex items-center gap-2" data-testid="heading-experience-templates">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            Plan Your Experience
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/experience")}
            data-testid="button-view-all-experiences"
          >
            View All
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        <ScrollArea className="w-full">
          <div className="flex gap-3 pb-2">
            {popularTemplates.map((template) => {
              const IconComponent = templateIcons[template.icon] || Sparkles;
              return (
                <Card
                  key={template.slug}
                  className="flex-shrink-0 w-28 hover-elevate cursor-pointer"
                  onClick={() => handleTemplateClick(template.slug)}
                  data-testid={`template-card-${template.slug}`}
                >
                  <CardContent className="p-3 flex flex-col items-center text-center">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${template.bgClass}`}>
                      <IconComponent className={`h-5 w-5 ${template.iconClass}`} />
                    </div>
                    <span className="text-xs font-medium line-clamp-1">
                      {template.name}
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {recommendedTemplates.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3" data-testid="heading-recommended-templates">
            Recommended for You
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recommendedTemplates.map(({ template, reason }) => {
              const IconComponent = templateIcons[template.icon || "Sparkles"] || Sparkles;
              return (
                <Card
                  key={template.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => handleTemplateClick(template.slug)}
                  data-testid={`recommended-template-${template.slug}`}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
                      <IconComponent className="h-6 w-6 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="font-medium text-sm">{template.name}</h5>
                      <Badge variant="secondary" className="text-xs mt-1">
                        {reason}
                      </Badge>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
