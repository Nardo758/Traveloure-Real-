/**
 * Public earner storefront — /p/:handle (backoffice Phase 1b).
 *
 * The mockup's "one link that books and pays" landing surface
 * (docs/backoffice/mockups/mockup-offering-page.html breadcrumb "Yuki's Offerings").
 * Lists the earner's ADMIN-APPROVED offerings across the three lanes, each linking into the
 * existing booking-capable detail pages (/services/:id, /expert-templates/:id, /ready-made/:id).
 * Ratings are real aggregates or an honest "New" — never a fabricated number (§13).
 */
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { SEOHead } from "@/components/seo-head";
import { Star, MapPin, Share2, Sparkles, Map, Briefcase } from "lucide-react";

interface StorefrontData {
  earner: {
    name: string;
    bio: string | null;
    profileImageUrl: string | null;
    role: string;
    handle: string;
    averageRating: number | null;
    reviewCount: number;
  };
  services: Array<{
    id: string;
    serviceName: string;
    price: string | null;
    priceType: string | null;
    averageRating: string | null;
    reviewCount: number | null;
  }>;
  templates: Array<{
    id: string;
    title: string;
    destination: string;
    price: string;
    coverImage: string | null;
  }>;
  readyMade: Array<{
    id: string;
    title: string;
    heroImageUrl: string | null;
    priceCents: number | null;
  }>;
}

function RatingLine({ rating, count }: { rating: string | null; count: number | null }) {
  if (!count || count === 0 || !rating) {
    return <Badge variant="outline" className="text-xs">New</Badge>;
  }
  return (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
      {Number(rating).toFixed(1)}
      <span className="text-xs">({count})</span>
    </span>
  );
}

export default function StorefrontPage() {
  const [, params] = useRoute("/p/:handle");
  const handle = params?.handle ?? "";
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery<StorefrontData>({
    queryKey: [`/api/storefront/${handle}`],
    enabled: handle.length > 0,
    retry: false,
  });

  function copyLink() {
    const url = `${window.location.origin}/p/${handle}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied", description: "Share it anywhere — it books and pays." });
    });
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center" data-testid="storefront-not-found">
        <h1 className="text-2xl font-bold mb-2">Storefront not found</h1>
        <p className="text-muted-foreground mb-6">
          This link may be incorrect, or the owner has no bookable offerings yet.
        </p>
        <Link href="/discover">
          <Button>Explore Traveloure</Button>
        </Link>
      </div>
    );
  }

  const { earner, services, templates, readyMade } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-10" data-testid="storefront-page">
      <SEOHead
        title={`${earner.name} — Book local experiences | Traveloure`}
        description={earner.bio ?? `Bookable experiences from ${earner.name} on Traveloure.`}
      />

      {/* Earner header */}
      <div className="flex items-start gap-5">
        {earner.profileImageUrl ? (
          <img
            src={earner.profileImageUrl}
            alt={earner.name}
            className="w-20 h-20 rounded-full object-cover border"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-2xl font-semibold">
            {earner.name.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold" data-testid="storefront-name">{earner.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm text-muted-foreground">@{earner.handle}</p>
            <span data-testid="storefront-earner-rating">
              <RatingLine
                rating={earner.averageRating != null ? String(earner.averageRating) : null}
                count={earner.reviewCount}
              />
            </span>
          </div>
          {earner.bio && <p className="mt-2 text-sm text-foreground max-w-xl">{earner.bio}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={copyLink} data-testid="button-share-storefront">
          <Share2 className="w-4 h-4 mr-1.5" />
          Share
        </Button>
      </div>

      {/* Lane 1: services */}
      {services.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" />
            Experiences & Services
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {services.map((s) => (
              <Link key={s.id} href={`/services/${s.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full" data-testid={`storefront-service-${s.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium">{s.serviceName}</h3>
                      {s.price && (
                        <span className="font-semibold whitespace-nowrap">
                          ${Number(s.price).toFixed(0)}
                          {s.priceType === "hourly" ? "/hr" : ""}
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      <RatingLine rating={s.averageRating} count={s.reviewCount} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Lane 2: itinerary templates */}
      {templates.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Map className="w-5 h-5 text-primary" />
            Itinerary Templates
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {templates.map((t) => (
              <Link key={t.id} href={`/expert-templates/${t.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden h-full" data-testid={`storefront-template-${t.id}`}>
                  {t.coverImage && (
                    <img src={t.coverImage} alt={t.title} className="h-32 w-full object-cover" />
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium">{t.title}</h3>
                      <span className="font-semibold whitespace-nowrap">${Number(t.price).toFixed(0)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {t.destination}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Lane 3: Ready Made Trips */}
      {readyMade.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Ready Made Trips
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {readyMade.map((r) => (
              <Link key={r.id} href={`/ready-made/${r.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden h-full" data-testid={`storefront-readymade-${r.id}`}>
                  {r.heroImageUrl && (
                    <img src={r.heroImageUrl} alt={r.title} className="h-32 w-full object-cover" />
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium">{r.title}</h3>
                      {typeof r.priceCents === "number" && (
                        <span className="font-semibold whitespace-nowrap">
                          ${(r.priceCents / 100).toFixed(0)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className="pt-6 border-t text-center text-xs text-muted-foreground">
        Bookings and payments are secured by Traveloure. Reviews are verified purchases.
      </footer>
    </div>
  );
}
