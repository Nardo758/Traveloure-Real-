import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  Briefcase
} from "lucide-react";
import { format } from "date-fns";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useToast } from "@/hooks/use-toast";
import { ExpertAvailabilityPicker } from "@/components/expert/ExpertAvailabilityPicker";
import { SiInstagram, SiLinkedin, SiFacebook, SiTiktok, SiYoutube } from "react-icons/si";

export default function ExpertDetailPage() {
  const [, params] = useRoute("/experts/:id");
  const expertId = params?.id;
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const handleSlotSelect = (date: Date, slot: string) => {
    setSelectedDate(date);
    setSelectedSlot(slot);
  };

  // Fetch expert details
  const { data: expert, isLoading } = useQuery<any>({
    queryKey: ["/api/experts", expertId],
    queryFn: async () => {
      const res = await fetch(`/api/experts/${expertId}`);
      if (!res.ok) throw new Error("Expert not found");
      return res.json();
    },
    enabled: !!expertId,
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

  const handleContactExpert = () => {
    if (!isAuthenticated) {
      openSignInModal({ returnTo: window.location.pathname + window.location.search });
      return;
    }
    navigate(`/chat?expertId=${expertId}`);
  };

  const handleScheduleConsultation = () => {
    if (!isAuthenticated) {
      openSignInModal({ returnTo: window.location.pathname + window.location.search });
      return;
    }
    if (services.length > 0) {
      const params = new URLSearchParams({
        expertId: expertId!,
        serviceId: services[0]?.id || "",
      });
      if (selectedDate && selectedSlot) {
        params.set("date", format(selectedDate, "yyyy-MM-dd"));
        params.set("time", selectedSlot);
      }
      navigate(`/cart?${params.toString()}`);
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

  if (!expert) {
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
  const liveAvgRating = reviews.length > 0
    ? reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviews.length
    : 0;
  const averageRating = liveAvgRating || (expert.averageRating ? parseFloat(expert.averageRating) : 0);
  const totalReviews = reviews.length || expert.reviewCount || 0;
  const responseTime = expert.expertForm?.responseTime || "< 24 hours";
  const languages = expert.expertForm?.languages || ["English"];
  const specializations = expert.expertForm?.specializations || [];
  const destinations = expert.expertForm?.destinations || [];
  const bio = expert.expertForm?.bio || "Experienced local expert ready to help plan your perfect trip.";
  const superExpert = expert.superExpert || false;
  const verified = expert.verified || true;

  const socialLinks = [
    expert.expertForm?.instagramLink && {
      platform: "Instagram", href: expert.expertForm.instagramLink,
      Icon: SiInstagram, color: "text-pink-500 hover:text-pink-600",
    },
    expert.expertForm?.linkedinLink && {
      platform: "LinkedIn", href: expert.expertForm.linkedinLink,
      Icon: SiLinkedin, color: "text-blue-600 hover:text-blue-700",
    },
    expert.expertForm?.facebookLink && {
      platform: "Facebook", href: expert.expertForm.facebookLink,
      Icon: SiFacebook, color: "text-blue-500 hover:text-blue-600",
    },
    expert.expertForm?.tiktokLink && {
      platform: "TikTok", href: expert.expertForm.tiktokLink,
      Icon: SiTiktok, color: "text-foreground hover:text-foreground/80",
    },
    expert.expertForm?.youtubeLink && {
      platform: "YouTube", href: expert.expertForm.youtubeLink,
      Icon: SiYoutube, color: "text-red-600 hover:text-red-700",
    },
  ].filter(Boolean) as { platform: string; href: string; Icon: React.ComponentType<{ className?: string }>; color: string }[];

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
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                    <span className="font-semibold">{averageRating.toFixed(1)}</span>
                    <span className="text-muted-foreground">({totalReviews} reviews)</span>
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
                <div className="flex flex-wrap gap-4">
                  {destinations.length > 0 && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <div className="flex gap-2">
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

                {/* Social Links Row — shown in hero when expert has social profiles */}
                {socialLinks.length > 0 && (
                  <div className="flex items-center gap-3 mt-4" data-testid="social-links-hero">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Follow</span>
                    {socialLinks.map(({ platform, href, Icon, color }) => (
                      <a
                        key={platform}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={platform}
                        data-testid={`social-link-${platform.toLowerCase()}`}
                        className={`transition-colors ${color}`}
                      >
                        <Icon className="w-5 h-5" />
                      </a>
                    ))}
                  </div>
                )}
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
                    <TabsTrigger value="reviews">Reviews ({totalReviews})</TabsTrigger>
                  </TabsList>

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

                        {expert.expertForm?.certifications && (
                          <div>
                            <h3 className="font-semibold mb-2">Certifications</h3>
                            <p className="text-muted-foreground">{expert.expertForm.certifications}</p>
                          </div>
                        )}

                        {socialLinks.length > 0 && (
                          <div data-testid="social-links-about">
                            <h3 className="font-semibold mb-3">Connect with {expert.firstName}</h3>
                            <div className="flex flex-wrap gap-3">
                              {socialLinks.map(({ platform, href, Icon, color }) => (
                                <a
                                  key={platform}
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  data-testid={`social-about-${platform.toLowerCase()}`}
                                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/40 hover:bg-muted transition-colors text-sm font-medium ${color}`}
                                >
                                  <Icon className="w-4 h-4" />
                                  {platform}
                                </a>
                              ))}
                            </div>
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
                                <Button>Book Now</Button>
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
                      <div className="space-y-4" data-testid="expert-reviews-list">
                        {/* Average summary bar */}
                        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg mb-2">
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-5 h-5 ${
                                  i < Math.round(averageRating)
                                    ? "text-amber-500 fill-amber-500"
                                    : "text-gray-300"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-lg font-semibold" data-testid="text-expert-avg-rating">
                            {averageRating.toFixed(1)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ({totalReviews} {totalReviews === 1 ? "review" : "reviews"})
                          </span>
                        </div>

                        {reviews.map((review: any) => {
                          const reviewerName = review.reviewerFirstName
                            ? `${review.reviewerFirstName} ${review.reviewerLastName || ""}`.trim()
                            : review.userName || "Anonymous";
                          const initial = reviewerName[0]?.toUpperCase() || "U";
                          const reviewText = review.review || review.comment || "";
                          return (
                            <Card key={review.id} data-testid={`card-expert-review-${review.id}`}>
                              <CardContent className="p-6">
                                <div className="flex items-start gap-4">
                                  <Avatar>
                                    {review.reviewerAvatar ? (
                                      <img src={review.reviewerAvatar} alt={reviewerName} className="w-full h-full object-cover rounded-full" />
                                    ) : (
                                      <AvatarFallback>{initial}</AvatarFallback>
                                    )}
                                  </Avatar>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                      <span className="font-semibold text-sm" data-testid={`text-reviewer-name-${review.id}`}>
                                        {reviewerName}
                                      </span>
                                      <div className="flex items-center gap-0.5">
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
                                    </div>
                                    {reviewText && (
                                      <p className="text-muted-foreground text-sm mb-2" data-testid={`text-expert-review-${review.id}`}>
                                        {reviewText}
                                      </p>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(review.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                    </span>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
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
                <Card className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
                  <CardHeader>
                    <CardTitle>Book with {expert.firstName}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Price */}
                    <div className="space-y-1">
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

                    {/* Availability slot picker */}
                    {expertId && (
                      <div className="border-t pt-4">
                        <ExpertAvailabilityPicker
                          expertId={expertId}
                          onSlotSelect={handleSlotSelect}
                        />
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="space-y-2 pt-1">
                      <Button className="w-full" size="lg" onClick={handleContactExpert} data-testid="button-contact-expert">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Contact Expert
                      </Button>

                      <Button
                        variant={selectedSlot ? "default" : "outline"}
                        className={`w-full ${selectedSlot ? "bg-primary hover:bg-primary/90" : ""}`}
                        size="lg"
                        onClick={handleScheduleConsultation}
                        data-testid="button-schedule-consultation"
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        {selectedSlot
                          ? `Book ${selectedDate ? format(selectedDate, "MMM d") : ""} at ${selectedSlot}`
                          : "Schedule Consultation"}
                      </Button>
                    </div>

                    <div className="pt-2 border-t space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span>Free cancellation up to 24h</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span>Instant confirmation</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span>24/7 support</span>
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
