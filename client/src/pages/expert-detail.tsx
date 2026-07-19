import { useParams, Link, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star,
  MapPin,
  Languages,
  Award,
  MessageCircle,
  Calendar,
  CheckCircle,
  ArrowLeft,
  DollarSign,
  Clock,
  Users,
  Heart,
  Share2,
  Verified,
  TrendingUp,
  Globe,
  Briefcase,
  ShieldCheck,
  Home,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useToast } from "@/hooks/use-toast";

export default function ExpertDetailPage() {
  const { id: expertId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { isAuthenticated } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();

  // Sprint 2.1 plan handoff: arriving from the cart/planner with ?tripId=
  // unlocks a "share my trip plan" request — the expert-booking-request carries
  // the tripId, which is what authorizes the expert's plan-snapshot view.
  const handoffTripId = new URLSearchParams(searchString).get("tripId");

  // Fetch expert details
  const { data: expert, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/experts", expertId],
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("Request timed out")), 10_000);
      try {
        const res = await fetch(`/api/experts/${expertId}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Expert not found");
        return res.json();
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !!expertId,
    retry: false,
  });

  // Fetch expert's services/offerings
  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["/api/expert-services", expertId],
    queryFn: async () => {
      const res = await fetch(`/api/experts/${expertId}/services`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!expertId,
  });

  // This expert's purchasable packages (marketplace Phase B4). Server-gated:
  // only approved + published templates return, content-redacted to a teaser.
  const { data: packages = [] } = useQuery<any[]>({
    queryKey: ["/api/expert-templates", { expertId }],
    queryFn: async () => {
      const res = await fetch(`/api/expert-templates?expertId=${expertId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!expertId,
  });

  const handleContactExpert = () => {
    if (!isAuthenticated) {
      openSignInModal();
      return;
    }
    navigate(`/chat?expertId=${expertId}`);
  };

  // Sprint 2.1: request this expert's help WITH the trip plan attached. Creates
  // a pending expert-booking-request (no payment moves here — amounts derive
  // server-side from the service record, §14); the tripId on the booking is
  // what lets the expert open the traveler's plan snapshot in their console.
  const requestHelpMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/expert-booking-requests", {
        tripId: handoffTripId,
        serviceId: services[0]?.id,
        notes: "Traveler shared their trip plan and requested help from your storefront.",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      toast({
        title: "Request sent with your trip plan",
        description: `${expert?.firstName || "The expert"} can now see your plan and will respond to your request.`,
      });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Could not send request", description: "Please try again." });
    },
  });

  const handleRequestHelpWithPlan = () => {
    if (!isAuthenticated) {
      openSignInModal();
      return;
    }
    requestHelpMutation.mutate();
  };

  const handleScheduleConsultation = () => {
    if (!isAuthenticated) {
      openSignInModal();
      return;
    }
    if (services.length > 0) {
      navigate(`/cart?expertId=${expertId}&serviceId=${services[0]?.id || ""}`);
    } else {
      toast({
        title: "No services available",
        description: `${expert?.firstName || "This expert"} hasn't listed any services yet. Contact them directly instead.`,
      });
    }
  };

  // Fetch expert's reviews
  const { data: reviews = [] } = useQuery<any[]>({
    queryKey: ["/api/expert-reviews", expertId],
    queryFn: async () => {
      const res = await fetch(`/api/experts/${expertId}/reviews`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!expertId,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-background py-8">
          <div className="container mx-auto px-4 max-w-6xl">
            <Skeleton className="h-8 w-32 mb-6" />
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <Skeleton className="h-64 mb-6" />
                <Skeleton className="h-48" />
              </div>
              <div>
                <Skeleton className="h-96" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (isError || !expert) {
    return (
      <Layout>
        <div className="min-h-screen bg-background py-16">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h1 className="text-2xl font-bold mb-4">Expert Not Found</h1>
            <p className="text-muted-foreground mb-8">
              The expert you're looking for doesn't exist or has been removed.
            </p>
            <Link href="/experts">
              <Button>Browse All Experts</Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.trim();
  const initials = `${expert.firstName?.[0] || ""}${expert.lastName?.[0] || ""}`.toUpperCase();
  // Roadmap 3.5: the server now attaches a REAL expert-level rating aggregate
  // (avg of the expert's approved service reviews). expertRating is null when
  // the expert has no reviews → the honest "New" state renders. (Legacy
  // averageRating/reviewCount kept as a fallback for any stale caller.)
  const averageRating =
    typeof expert.expertRating === "number"
      ? expert.expertRating
      : expert.averageRating ? parseFloat(expert.averageRating) : 0;
  const totalReviews = expert.expertReviewCount ?? expert.reviewCount ?? reviews.length ?? 0;
  const responseTime = expert.expertForm?.responseTime || "< 24 hours";
  const languages = expert.expertForm?.languages || ["English"];
  const specializations = expert.expertForm?.specializations || [];
  const destinations = expert.expertForm?.destinations || [];
  const bio = expert.expertForm?.bio || "Experienced local expert ready to help plan your perfect trip.";
  const neighbourhoods: string[] = Array.isArray(expert.expertForm?.neighborhoods) ? expert.expertForm.neighborhoods : [];
  const localityProof: string = expert.expertForm?.localityProof || "";

  const localityProofLabels: Record<string, string> = {
    born_raised: "Born & raised here",
    long_term_10yr: "Long-term resident (10+ years)",
    resident_5yr: "Resident (5+ years)",
    current_resident: "Current resident (1–5 years)",
  };
  const localityProofLabel = localityProofLabels[localityProof] || "";
  const superExpert = expert.superExpert || false;
  const verified = expert.verified === true;
  const idVerified = expert.expertForm?.identityVerificationStatus === "verified";

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        {/* Back Button */}
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 max-w-6xl py-4">
            <Link href="/experts">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Experts
              </Button>
            </Link>
          </div>
        </div>

        {/* Hero Section */}
        <section className="py-12 bg-muted/30">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              {/* Avatar & Basic Info */}
              <div className="flex-shrink-0">
                <Avatar className="w-32 h-32 border-4 border-background shadow-lg">
                  <AvatarImage src={expert.profileImage} alt={fullName} />
                  <AvatarFallback className="text-3xl">{initials}</AvatarFallback>
                </Avatar>
              </div>

              {/* Expert Info */}
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h1 className="text-3xl font-bold">{fullName}</h1>
                      {verified && (
                        <CheckCircle className="w-6 h-6 text-primary" title="Verified Expert" />
                      )}
                      {idVerified && (
                        <Badge className="bg-blue-600 text-white" title="Identity verified via Stripe Identity">
                          <ShieldCheck className="w-3 h-3 mr-1" />
                          ID Verified
                        </Badge>
                      )}
                      {superExpert && (
                        <Badge className="bg-amber-500">
                          <Award className="w-3 h-3 mr-1" />
                          Super Expert
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mb-4">{bio}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon">
                      <Heart className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon">
                      <Share2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex flex-wrap gap-6 mb-6">
                  {/* §13 honesty: the expert rating is a review-count-weighted mean of the
                      expert's own services' reviews (server: getExpertsWithProfiles), null
                      until they have any. Show a star + score only when review-backed; else
                      an honest "New" — never "0.0 (0 reviews)". */}
                  <div className="flex items-center gap-2">
                    {totalReviews > 0 ? (
                      <>
                        <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                        <span className="font-semibold">{averageRating.toFixed(1)}</span>
                        <span className="text-muted-foreground">({totalReviews} reviews)</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">New expert · no reviews yet</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Briefcase className="w-5 h-5" />
                    <span>{expert.completedTrips || 0} trips completed</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-5 h-5" />
                    <span>{responseTime} response time</span>
                  </div>
                </div>

                {/* Quick Info */}
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-4">
                    {destinations.length > 0 && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <div className="flex flex-wrap gap-2">
                          {destinations.slice(0, 3).map((dest: string) => (
                            <Badge key={dest} variant="secondary">{dest}</Badge>
                          ))}
                          {destinations.length > 3 && (
                            <Badge variant="secondary">+{destinations.length - 3}</Badge>
                          )}
                        </div>
                      </div>
                    )}
                    {languages.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Languages className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {languages.join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                  {neighbourhoods.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap" data-testid="hero-neighbourhoods">
                      <Home className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      {localityProofLabel && (
                        <Badge variant="secondary" className="text-xs font-normal" data-testid="hero-locality-proof">
                          {localityProofLabel}
                        </Badge>
                      )}
                      {neighbourhoods.slice(0, 5).map((n: string, idx: number) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="flex items-center gap-1 text-xs"
                          data-testid={`hero-badge-neighbourhood-${idx}`}
                        >
                          <MapPin className="w-3 h-3" />
                          {n}
                        </Badge>
                      ))}
                      {neighbourhoods.length > 5 && (
                        <Badge variant="outline" className="text-xs" data-testid="hero-neighbourhoods-overflow">
                          +{neighbourhoods.length - 5} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <section className="py-12">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Left Column - Main Content */}
              <div className="lg:col-span-2">
                <Tabs defaultValue="about" className="w-full">
                  <TabsList className="mb-6">
                    <TabsTrigger value="about">About</TabsTrigger>
                    <TabsTrigger value="services">Services</TabsTrigger>
                    {packages.length > 0 && (
                      <TabsTrigger value="packages" data-testid="tab-expert-packages">
                        Trips ({packages.length})
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="reviews">Reviews ({totalReviews})</TabsTrigger>
                  </TabsList>

                  {/* Packages Tab — purchasable itinerary packages by this expert (Phase B4) */}
                  {packages.length > 0 && (
                    <TabsContent value="packages">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {packages.map((pkg: any) => (
                          <Link key={pkg.id} href={`/expert-templates/${pkg.id}`}>
                            <Card className="hover-elevate cursor-pointer h-full" data-testid={`expert-package-${pkg.id}`}>
                              <CardContent className="p-4">
                                {pkg.coverImage && (
                                  <img
                                    src={pkg.coverImage}
                                    alt={pkg.title}
                                    className="w-full h-32 object-cover rounded-lg mb-3"
                                  />
                                )}
                                <div className="flex items-start justify-between gap-2">
                                  <h3 className="font-semibold line-clamp-2">{pkg.title}</h3>
                                  <p className="font-bold text-primary whitespace-nowrap">${pkg.price}</p>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-2 flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> {pkg.destination}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> {pkg.duration} days
                                  </span>
                                  {pkg.averageRating && parseFloat(pkg.averageRating) > 0 && (
                                    <span className="flex items-center gap-1 text-amber-600">
                                      <Star className="w-3 h-3 fill-current" /> {parseFloat(pkg.averageRating).toFixed(1)}
                                    </span>
                                  )}
                                </div>
                                {pkg.shortDescription && (
                                  <p className="text-sm text-muted-foreground line-clamp-2 mt-2">{pkg.shortDescription}</p>
                                )}
                              </CardContent>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    </TabsContent>
                  )}

                  {/* About Tab */}
                  <TabsContent value="about">
                    <Card>
                      <CardHeader>
                        <CardTitle>About {expert.firstName}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div>
                          <h3 className="font-semibold mb-2">Bio</h3>
                          <p className="text-muted-foreground">{bio}</p>
                        </div>

                        {specializations.length > 0 && (
                          <div>
                            <h3 className="font-semibold mb-2">Specializations</h3>
                            <div className="flex flex-wrap gap-2">
                              {specializations.map((spec: string) => (
                                <Badge key={spec} variant="outline">{spec}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {destinations.length > 0 && (
                          <div>
                            <h3 className="font-semibold mb-2">Destinations</h3>
                            <div className="flex flex-wrap gap-2">
                              {destinations.map((dest: string) => (
                                <Badge key={dest} variant="secondary">
                                  <Globe className="w-3 h-3 mr-1" />
                                  {dest}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {neighbourhoods.length > 0 && (
                          <div data-testid="section-areas-of-knowledge">
                            <div className="flex items-center gap-2 mb-2">
                              <Home className="w-4 h-4 text-muted-foreground" />
                              <h3 className="font-semibold">Areas of deep knowledge</h3>
                              {localityProofLabel && (
                                <Badge variant="secondary" className="text-xs font-normal" data-testid="badge-locality-proof">
                                  {localityProofLabel}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {neighbourhoods.map((n: string, idx: number) => (
                                <Badge
                                  key={idx}
                                  variant="outline"
                                  className="flex items-center gap-1"
                                  data-testid={`badge-neighbourhood-detail-${idx}`}
                                >
                                  <MapPin className="w-3 h-3" />
                                  {n}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {expert.expertForm?.certifications && (
                          <div>
                            <h3 className="font-semibold mb-2">Certifications</h3>
                            <p className="text-muted-foreground">{expert.expertForm.certifications}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Services Tab */}
                  <TabsContent value="services">
                    {services.length > 0 ? (
                      <div className="space-y-4">
                        {services.map((service: any) => (
                          <Card key={service.id}>
                            <CardContent className="p-6">
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <h3 className="font-semibold text-lg mb-2">{service.name}</h3>
                                  <p className="text-muted-foreground text-sm">{service.description}</p>
                                </div>
                                <div className="text-right">
                                  <div className="flex items-center gap-1 text-lg font-bold">
                                    <DollarSign className="w-5 h-5" />
                                    {service.price}
                                  </div>
                                  <p className="text-xs text-muted-foreground">{service.deliveryMethod}</p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-4 h-4" />
                                    {service.deliveryTimeframe}
                                  </span>
                                  {service.location && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-4 h-4" />
                                      {service.location}
                                    </span>
                                  )}
                                </div>
                                <Button
                                  onClick={() => {
                                    if (!isAuthenticated) {
                                      openSignInModal();
                                      return;
                                    }
                                    navigate(`/cart?expertId=${expertId}&serviceId=${service.id}`);
                                  }}
                                  data-testid={`button-book-service-${service.id}`}
                                >
                                  Book Now
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card>
                        <CardContent className="p-12 text-center">
                          <Briefcase className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="text-muted-foreground">No services available yet</p>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  {/* Reviews Tab */}
                  <TabsContent value="reviews">
                    {reviews.length > 0 ? (
                      <div className="space-y-4">
                        {reviews.map((review: any) => (
                          <Card key={review.id}>
                            <CardContent className="p-6">
                              <div className="flex items-start gap-4">
                                <Avatar>
                                  <AvatarFallback>
                                    {review.reviewerName?.[0]?.toUpperCase() || "T"}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <span className="font-semibold">{review.reviewerName || "Traveler"}</span>
                                    <div className="flex items-center gap-1">
                                      {[...Array(5)].map((_, i) => (
                                        <Star
                                          key={i}
                                          className={`w-4 h-4 ${
                                            i < review.rating
                                              ? "text-amber-500 fill-amber-500"
                                              : "text-gray-300"
                                          }`}
                                        />
                                      ))}
                                    </div>
                                    {review.serviceName && (
                                      <span className="text-xs text-muted-foreground">· {review.serviceName}</span>
                                    )}
                                  </div>
                                  {review.reviewText && (
                                    <p className="text-muted-foreground text-sm mb-2">{review.reviewText}</p>
                                  )}
                                  {review.responseText && (
                                    <div className="mt-2 pl-3 border-l-2 border-muted text-sm">
                                      <span className="font-medium text-foreground">Response: </span>
                                      <span className="text-muted-foreground">{review.responseText}</span>
                                    </div>
                                  )}
                                  {review.createdAt && (
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(review.createdAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card>
                        <CardContent className="p-12 text-center">
                          <Star className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="text-muted-foreground">No reviews yet</p>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                </Tabs>
              </div>

              {/* Right Column - Booking Card */}
              <div>
                <Card className="sticky top-4">
                  <CardHeader>
                    <CardTitle>Book with {expert.firstName}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Starting from</span>
                        <span className="text-2xl font-bold">
                          ${services[0]?.price || "Contact"}
                        </span>
                      </div>
                      {services.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {services[0]?.name || "Custom service"}
                        </p>
                      )}
                    </div>

                    {/* Plan handoff: only when the traveler arrived with a trip
                        (?tripId= from the cart) AND the expert has a bookable
                        service to attach the request to. */}
                    {handoffTripId && services.length > 0 && (
                      <Button
                        className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                        size="lg"
                        onClick={handleRequestHelpWithPlan}
                        disabled={requestHelpMutation.isPending || requestHelpMutation.isSuccess}
                        data-testid="button-request-help-with-plan"
                      >
                        <Briefcase className="w-4 h-4 mr-2" />
                        {requestHelpMutation.isSuccess
                          ? "Request sent ✓"
                          : requestHelpMutation.isPending
                            ? "Sending..."
                            : "Share my trip plan & request help"}
                      </Button>
                    )}

                    <Button className="w-full" size="lg" variant={handoffTripId && services.length > 0 ? "outline" : "default"} onClick={handleContactExpert} data-testid="button-contact-expert">
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Contact Expert
                    </Button>

                    <Button variant="outline" className="w-full" size="lg" onClick={handleScheduleConsultation} data-testid="button-schedule-consultation">
                      <Calendar className="w-4 h-4 mr-2" />
                      Schedule Consultation
                    </Button>

                    {/* §13 honesty: the old "free cancellation / instant confirmation /
                        24-7 support" claims were fabricated (no per-expert cancellation
                        policy exists; bookings go through a request/confirm flow, not
                        instant). Replaced with statements that are actually true of the
                        platform: Stripe checkout + the escrow hold/dispute protection. */}
                    <div className="pt-4 border-t space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span>Secure checkout via Stripe</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span>Payment protected until the service is delivered</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
