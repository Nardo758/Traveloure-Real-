import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Camera, 
  MapPin, 
  Globe, 
  Star,
  Plus,
  X,
  Save,
  StickyNote,
  Lock,
  Home,
  BadgeCheck,
  AlertCircle,
  Info,
  Briefcase,
  ChevronRight,
} from "lucide-react";
import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";

const EXPERT_ROLE_LABELS: Record<string, string> = {
  travel_expert: "Travel Advisor",
  local_expert: "Local Expert",
  event_planner: "Event Planner",
  executive_assistant: "Executive Assistant",
  expert: "Expert",
};

const LOCALITY_PROOF_OPTIONS = [
  { value: "born_raised", label: "Born & raised here" },
  { value: "long_term_10yr", label: "Long-term resident (10+ years)" },
  { value: "resident_5yr", label: "Resident (5+ years)" },
  { value: "current_resident", label: "Current resident (1–5 years)" },
];

interface ExpertOfferingType {
  id: number;
  offering_type_key: string;
  service_tier: string;
  display_name: string;
  tagline: string | null;
  base_price_cents: number | null;
  description: string | null;
}

const TIER_COLORS: Record<string, string> = {
  entry: "bg-slate-100 text-slate-700 border-slate-200",
  standard: "bg-blue-50 text-blue-700 border-blue-200",
  premium: "bg-violet-50 text-violet-700 border-violet-200",
  elite: "bg-amber-50 text-amber-700 border-amber-200",
  concierge: "bg-rose-50 text-rose-700 border-rose-200",
};

function formatCents(cents: number | null) {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function ExpertOfferingTypesCard() {
  const { data: offerings, isLoading } = useQuery<ExpertOfferingType[]>({
    queryKey: ["/api/offering-types/experts"],
    staleTime: 10 * 60_000,
    retry: false,
  });

  return (
    <Card className="border border-console-light" data-testid="card-expert-offering-types">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-primary" />
          Your Service Menu
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          All five tiers of expert services available on the platform. Clients browse and book these offerings from your profile.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </>
        ) : (offerings ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No offering types configured yet.</p>
        ) : (
          (offerings ?? []).map((offering) => {
            const tierClass = TIER_COLORS[offering.service_tier] ?? TIER_COLORS.standard;
            const price = formatCents(offering.base_price_cents);
            return (
              <div
                key={offering.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 bg-background"
                data-testid={`row-offering-type-${offering.offering_type_key}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">
                      {offering.display_name}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${tierClass}`}>
                      {offering.service_tier}
                    </span>
                    {price && (
                      <span className="text-xs text-muted-foreground">
                        from {price}
                      </span>
                    )}
                  </div>
                  {offering.tagline && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {offering.tagline}
                    </p>
                  )}
                </div>
                <a
                  href={`/expert/services?offeringTypeKey=${encodeURIComponent(offering.offering_type_key)}`}
                  className="flex items-center gap-0.5 text-[11px] text-primary font-semibold whitespace-nowrap"
                  data-testid={`link-manage-offering-${offering.offering_type_key}`}
                >
                  Manage <ChevronRight className="w-3 h-3" />
                </a>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default function ExpertProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newSpecialty, setNewSpecialty] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [expertNotesStyle, setExpertNotesStyle] = useState("");
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [newNeighborhood, setNewNeighborhood] = useState("");
  const [localityProof, setLocalityProof] = useState("");
  const [selectedRole, setSelectedRole] = useState("");

  const { data: expertProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/experts", user?.id],
    enabled: !!user?.id,
  });

  const { data: neighborhoodsData, isLoading: neighborhoodsLoading } = useQuery({
    queryKey: ["/api/expert/neighborhoods"],
  });

  const { data: specializationData, isLoading: specializationsLoading } = useQuery({
    queryKey: ["/api/expert/specializations"],
  });

  // Update specialties when data loads
  React.useEffect(() => {
    if (specializationData?.specializations) {
      setSpecialties(specializationData.specializations);
    } else {
      setSpecialties([]);
    }
  }, [specializationData]);

  // Update languages when data loads
  React.useEffect(() => {
    if (expertProfile?.languages) {
      setLanguages(expertProfile.languages);
    } else {
      setLanguages([]);
    }
  }, [expertProfile]);

  // Sync expertNotesStyle from loaded profile
  React.useEffect(() => {
    if ((expertProfile as any)?.expertNotesStyle !== undefined) {
      setExpertNotesStyle((expertProfile as any).expertNotesStyle || "");
    }
  }, [expertProfile]);

  // Sync selectedRole from loaded profile
  React.useEffect(() => {
    const roleFromForm = (expertProfile as any)?.expertForm?.expertType;
    const roleFromUser = user?.role;
    setSelectedRole(roleFromForm ?? roleFromUser ?? "travel_expert");
  }, [expertProfile, user?.role]);

  // Sync neighborhoods + localityProof from loaded data
  React.useEffect(() => {
    if (neighborhoodsData) {
      setNeighborhoods((neighborhoodsData as any).neighborhoods || []);
      setLocalityProof((neighborhoodsData as any).localityProof || "");
    }
  }, [neighborhoodsData]);

  const saveRoleMutation = useMutation({
    mutationFn: (expertType: string) =>
      apiRequest("PATCH", "/api/expert/role", { expertType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experts", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Role updated successfully" });
    },
    onError: (error: any) => {
      let message = "Failed to update role";
      try {
        const raw: string = error?.message ?? "";
        const jsonStart = raw.indexOf("{");
        if (jsonStart !== -1) {
          const body = JSON.parse(raw.slice(jsonStart));
          if (body?.message) message = body.message;
        }
      } catch {}
      toast({ title: message, variant: "destructive" });
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: (notesStyle: string) =>
      apiRequest("PATCH", "/api/expert/profile-notes", { notesStyle }),
    onSuccess: () => {
      toast({ title: "Expert Notes style saved" });
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const saveNeighborhoodsMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/expert/neighborhoods", { neighborhoods, localityProof }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/neighborhoods"] });
      toast({ title: "Neighbourhood coverage saved" });
    },
    onError: () => {
      toast({ title: "Failed to save neighbourhood coverage", variant: "destructive" });
    },
  });

  const handleAddNeighborhood = () => {
    const trimmed = newNeighborhood.trim();
    if (trimmed && !neighborhoods.includes(trimmed)) {
      setNeighborhoods([...neighborhoods, trimmed]);
      setNewNeighborhood("");
    }
  };

  const handleRemoveNeighborhood = (name: string) => {
    setNeighborhoods(neighborhoods.filter((n) => n !== name));
  };

  const handleAddSpecialty = () => {
    if (newSpecialty.trim() && !specialties.includes(newSpecialty.trim())) {
      setSpecialties([...specialties, newSpecialty.trim()]);
      setNewSpecialty("");
    }
  };

  const handleRemoveSpecialty = (specialty: string) => {
    setSpecialties(specialties.filter((s) => s !== specialty));
  };

  return (
    <ExpertLayout title="Profile">
      <div className="p-6 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-console-darkest">Business Profile</h1>
            <p className="text-console-mid">Manage your public profile and preferences</p>
          </div>
          <Button className="bg-primary " data-testid="button-save-profile">
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>

        {/* Profile Photo */}
        <Card className="border border-console-light">
          <CardHeader>
            <CardTitle className="text-lg">Profile Photo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="relative">
                <Avatar className="w-24 h-24 border-4 border-[#FF385C]/20">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-[#FF385C] text-2xl font-medium">
                    {user?.firstName?.[0] || "E"}{user?.lastName?.[0] || "X"}
                  </AvatarFallback>
                </Avatar>
                <Button
                  size="icon"
                  className="absolute bottom-0 right-0 rounded-full w-8 h-8 bg-primary "
                  data-testid="button-change-photo"
                >
                  <Camera className="w-4 h-4" />
                </Button>
              </div>
              <div>
                <p className="text-sm text-console-mid mb-2">
                  Upload a professional photo that shows your face clearly
                </p>
                <Button variant="outline" size="sm" data-testid="button-upload-photo">
                  Upload New Photo
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Basic Information */}
        <Card className="border border-console-light">
          <CardHeader>
            <CardTitle className="text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  defaultValue={user?.firstName || ""}
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  defaultValue={user?.lastName || ""}
                  data-testid="input-last-name"
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-1.5">
                <BadgeCheck className="w-4 h-4 text-[#FF385C]" />
                Expert Role
              </Label>
              {profileLoading ? (
                <Skeleton className="h-10 rounded" />
              ) : (() => {
                const currentExpertType = (expertProfile as any)?.expertForm?.expertType ?? user?.role ?? "travel_expert";
                const isRoleUnchanged = selectedRole === currentExpertType;
                const requiresReview = selectedRole === "local_expert" && currentExpertType !== "local_expert";
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedRole}
                        onValueChange={setSelectedRole}
                        data-testid="select-expert-role"
                      >
                        <SelectTrigger className="flex-1" data-testid="trigger-expert-role">
                          <SelectValue placeholder="Select your role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="travel_expert">Travel Advisor</SelectItem>
                          <SelectItem value="local_expert">
                            Local Expert{currentExpertType !== "local_expert" ? " (requires review)" : ""}
                          </SelectItem>
                          <SelectItem value="event_planner">Event Planner</SelectItem>
                          <SelectItem value="executive_assistant">Executive Assistant</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="bg-primary shrink-0"
                        onClick={() => saveRoleMutation.mutate(selectedRole)}
                        disabled={
                          saveRoleMutation.isPending ||
                          isRoleUnchanged ||
                          requiresReview
                        }
                        data-testid="button-save-role"
                      >
                        {saveRoleMutation.isPending ? "Saving…" : "Save"}
                      </Button>
                    </div>
                    {requiresReview && (
                      <div
                        className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                        data-testid="alert-role-requires-review"
                      >
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          Switching to <strong>Local Expert</strong> requires admin review. Your current role was vetted for a different category. Please contact support to have your application re-evaluated.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              {profileLoading ? (
                <Skeleton className="h-10 rounded" />
              ) : (
                <Input
                  id="displayName"
                  defaultValue={expertProfile?.displayName || `${user?.firstName} ${user?.lastName}`.trim()}
                  placeholder="How clients will see your name"
                  data-testid="input-display-name"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="headline">Professional Headline</Label>
              {profileLoading ? (
                <Skeleton className="h-10 rounded" />
              ) : (
                <Input
                  id="headline"
                  defaultValue={expertProfile?.headline || ""}
                  placeholder="A short tagline about your expertise"
                  data-testid="input-headline"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">About Me</Label>
              {profileLoading ? (
                <Skeleton className="h-24 rounded" />
              ) : (
                <Textarea
                  id="bio"
                  rows={4}
                  defaultValue={expertProfile?.bio || ""}
                  placeholder="Tell clients about yourself and your expertise"
                  data-testid="input-bio"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card className="border border-console-light">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="w-5 h-5 text-console-mid" />
              Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                {profileLoading ? (
                  <Skeleton className="h-10 rounded" />
                ) : (
                  <Input
                    id="city"
                    defaultValue={expertProfile?.city || ""}
                    data-testid="input-city"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                {profileLoading ? (
                  <Skeleton className="h-10 rounded" />
                ) : (
                  <Select defaultValue={expertProfile?.country || ""}>
                    <SelectTrigger data-testid="select-country">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="japan">Japan</SelectItem>
                      <SelectItem value="usa">United States</SelectItem>
                      <SelectItem value="uk">United Kingdom</SelectItem>
                      <SelectItem value="france">France</SelectItem>
                      <SelectItem value="italy">Italy</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* My Neighbourhoods */}
        <Card className="border border-console-light">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Home className="w-5 h-5 text-console-mid" />
              My Neighbourhoods
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-console-mid">
              List the neighbourhoods you know well. These appear on your public profile and help travellers find the right local expert for their area.
            </p>

            {/* Locality proof */}
            <div className="space-y-2">
              <Label htmlFor="localityProof">My connection to these areas</Label>
              {neighborhoodsLoading ? (
                <Skeleton className="h-10 rounded" />
              ) : (
                <Select
                  value={localityProof}
                  onValueChange={setLocalityProof}
                >
                  <SelectTrigger data-testid="select-locality-proof">
                    <SelectValue placeholder="Select your connection…" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALITY_PROOF_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Neighbourhood tags */}
            {neighborhoodsLoading ? (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-28 rounded-full" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {neighborhoods.length > 0 ? (
                  neighborhoods.map((name) => (
                    <Badge
                      key={name}
                      variant="secondary"
                      className="pl-3 pr-1 py-1.5 flex items-center gap-1"
                      data-testid={`badge-neighbourhood-${name}`}
                    >
                      {name}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => handleRemoveNeighborhood(name)}
                        data-testid={`button-remove-neighbourhood-${name}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-console-mid">No neighbourhoods added yet</p>
                )}
              </div>
            )}

            {/* Add neighbourhood input */}
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Shinjuku, Montmartre, Brooklyn Heights…"
                value={newNeighborhood}
                onChange={(e) => setNewNeighborhood(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddNeighborhood()}
                data-testid="input-new-neighbourhood"
              />
              <Button
                variant="outline"
                onClick={handleAddNeighborhood}
                data-testid="button-add-neighbourhood"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                className="bg-primary hover:bg-[#e0324f] text-white"
                disabled={saveNeighborhoodsMutation.isPending || neighborhoodsLoading}
                onClick={() => saveNeighborhoodsMutation.mutate()}
                data-testid="button-save-neighbourhoods"
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {saveNeighborhoodsMutation.isPending ? "Saving…" : "Save Neighbourhoods"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Specialties */}
        <Card className="border border-console-light">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Star className="w-5 h-5 text-console-mid" />
              Specialties
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {specializationsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-32 rounded-full" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {specialties.length > 0 ? (
                  specialties.map((specialty) => (
                    <Badge
                      key={specialty}
                      variant="secondary"
                      className="pl-3 pr-1 py-1.5 flex items-center gap-1"
                    >
                      {specialty}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 "
                        onClick={() => handleRemoveSpecialty(specialty)}
                        data-testid={`button-remove-specialty-${specialty}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-console-mid">No specialties added yet</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Add a specialty..."
                value={newSpecialty}
                onChange={(e) => setNewSpecialty(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddSpecialty()}
                data-testid="input-new-specialty"
              />
              <Button variant="outline" onClick={handleAddSpecialty} data-testid="button-add-specialty">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Languages */}
        <Card className="border border-console-light">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="w-5 h-5 text-console-mid" />
              Languages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profileLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-8 w-24 rounded-full" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 mb-4">
                {languages.length > 0 ? (
                  languages.map((language) => (
                    <Badge key={language} variant="outline" className="py-1.5">
                      {language}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-console-mid">No languages added</p>
                )}
              </div>
            )}
            <Button variant="outline" size="sm" data-testid="button-add-language">
              <Plus className="w-4 h-4 mr-1" /> Add Language
            </Button>
          </CardContent>
        </Card>

        {/* Expert Notes Style */}
        <Card className="border border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-amber-500" />
              Expert Notes Style
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-100 rounded-lg p-3">
              <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
              <p>Expert Notes are private annotations you add to each itinerary stop before sending a plan to a client. Describe your annotation style so clients know what to expect.</p>
            </div>
            {profileLoading ? (
              <Skeleton className="h-24 rounded" />
            ) : (
              <Textarea
                rows={3}
                value={expertNotesStyle}
                onChange={(e) => setExpertNotesStyle(e.target.value)}
                placeholder="e.g., I annotate every stop with local crowd timing, hidden entrances, and personal tips from living here 10+ years."
                data-testid="input-expert-notes-style"
              />
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-amber-700">This description appears on your public profile and service listings to build client trust.</p>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                disabled={saveNotesMutation.isPending || profileLoading}
                onClick={() => saveNotesMutation.mutate(expertNotesStyle)}
                data-testid="button-save-notes-style"
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {saveNotesMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Expert Offering Types — full five-tier service menu */}
        <ExpertOfferingTypesCard />

        {/* Availability */}
        <Card className="border border-console-light">
          <CardHeader>
            <CardTitle className="text-lg">Availability Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-console-darkest">Available for New Clients</p>
                <p className="text-sm text-console-mid">Toggle off when you're fully booked</p>
              </div>
              <Switch defaultChecked data-testid="switch-availability" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-console-darkest">Accept Last-Minute Requests</p>
                <p className="text-sm text-console-mid">Events within 48 hours</p>
              </div>
              <Switch defaultChecked data-testid="switch-last-minute" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-console-darkest">Vacation Mode</p>
                <p className="text-sm text-console-mid">Temporarily hide your profile</p>
              </div>
              <Switch data-testid="switch-vacation" />
            </div>
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
