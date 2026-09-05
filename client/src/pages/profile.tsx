import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PaymentMethodsCard } from "@/components/payment/PaymentMethodsCard";

import { Camera, Mail, Bell, MapPin, Calendar, Save, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// H8: the fixed vocabulary the "Preferred Travel Style" (multi-select) and "Budget Preference"
// (single-select) chips offer. Mirrored server-side (storefront.routes.ts travelPreferencesPatchSchema)
// so the client can never send a value the server would reject.
const TRAVEL_STYLES = ["Adventure", "Relaxation", "Culture", "Food & Dining", "Nature", "Nightlife"] as const;
const BUDGET_PREFERENCES = ["Budget-Friendly", "Moderate", "Luxury"] as const;

interface TravelPreferences {
  travelStyles: string[];
  budgetPreference: string | null;
}

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notification email — for earner roles only (expert-family + service_provider; NOT executive_assistant)
  const EARNER_ROLES = new Set(["expert","local_expert","travel_expert","event_planner","service_provider"]);
  const isEarner = user?.role != null && EARNER_ROLES.has(user.role);
  const [notificationEmail, setNotificationEmail] = useState<string>("");
  const [notificationEmailError, setNotificationEmailError] = useState<string>("");
  const hydratedNotifEmail = useRef(false);

  const { data: savedNotificationEmail } = useQuery<{ notificationEmail: string | null }>({
    queryKey: ["/api/me/notification-email"],
    enabled: !!isEarner,
  });

  useEffect(() => {
    if (!savedNotificationEmail || hydratedNotifEmail.current) return;
    hydratedNotifEmail.current = true;
    setNotificationEmail(savedNotificationEmail.notificationEmail ?? "");
  }, [savedNotificationEmail]);

  const saveNotificationEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/me/notification-email", {
        notificationEmail: notificationEmail.trim() || null,
      });
      return res.json() as Promise<{ notificationEmail: string | null }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/notification-email"] });
    },
  });

  // H8: Travel Preferences — persisted via GET/PATCH /api/me/travel-preferences
  // (users.preferences.travelPreferences, no schema change). Hydrates once from the saved
  // value, then the chips are locally-controlled toggle state until Save Changes.
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<string | null>(null);
  const hydratedPrefs = useRef(false);

  const { data: savedTravelPreferences } = useQuery<TravelPreferences>({
    queryKey: ["/api/me/travel-preferences"],
  });

  useEffect(() => {
    if (!savedTravelPreferences || hydratedPrefs.current) return;
    hydratedPrefs.current = true;
    setSelectedStyles(savedTravelPreferences.travelStyles ?? []);
    setSelectedBudget(savedTravelPreferences.budgetPreference ?? null);
  }, [savedTravelPreferences]);

  const toggleStyle = (style: string) => {
    setSelectedStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  };

  const toggleBudget = (budget: string) => {
    setSelectedBudget((prev) => (prev === budget ? null : budget));
  };

  /**
   * ── HOME CITY (ledger `2026-09-05-slip-events-first-render`) ───────────────────────────────
   * `users.home_city` had exactly ONE writer — `PATCH /api/me/home-city` — and the only surface
   * that opened it was the PLUS occasions page. A traveler who never went near Plus therefore had
   * no way to state a home city at all, which meant CLAUDE.md Locked Decision 38's date-night
   * home-city pre-fill on step 2 of the plan modal could never fire for them, and registration
   * asks nothing. That route is a plain `isAuthenticated` route with no Plus gate, so this is a
   * second SURFACE on the SAME writer — never a second writer, and no new admission rail (§19).
   *
   * The OPTIONS are the server's own answer (`markets`, returned by that route from
   * `OPERATING_MARKET_CITY_NAMES`), not a list restated here — a client-side copy is the drift
   * class §18 rule 1 names and is exactly how the expert application ended up offering ten cities
   * that did not include Kyoto. §13 — the field says out loud that it offers only the markets the
   * platform operates in, and "Not set" is a real, clearable answer rather than a hidden default.
   */
  const [homeCity, setHomeCity] = useState<string>("");
  const hydratedHomeCity = useRef(false);

  const { data: savedHomeCity } = useQuery<{ homeCity: string | null; markets: string[] }>({
    queryKey: ["/api/me/home-city"],
  });

  useEffect(() => {
    if (!savedHomeCity || hydratedHomeCity.current) return;
    hydratedHomeCity.current = true;
    setHomeCity(savedHomeCity.homeCity ?? "");
  }, [savedHomeCity]);

  const saveHomeCityMutation = useMutation({
    mutationFn: async () => {
      // The body carries exactly one key, and the route reads exactly that one — an unknown key
      // could never reach the column even if it were sent.
      const res = await apiRequest("PATCH", "/api/me/home-city", { homeCity: homeCity || null });
      return res.json() as Promise<{ homeCity: string | null; markets: string[] }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/home-city"] });
      // The plan modal reads the home city off the auth payload it already fetches (ruling 38), so
      // that cache is stale the moment this lands.
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

  /**
   * ── PERSONAL INFORMATION (QA F2, the same sweep that removed the dead Location input) ────────
   * First name, last name and Bio were `defaultValue` inputs on an UNCONTROLLED form: nothing read
   * them back out, no mutation carried them, and Save Changes toasted "Profile updated" over three
   * more answers it had thrown away. Unlike Location these have BOTH a column (`users.first_name`
   * / `last_name` / `bio`) and a route that already admits them — `PATCH /api/profile`'s
   * hand-written `updateProfileSchema` allowlist — so the fix is to CALL that route, never to
   * widen it (§19: an allowlist is only ever extended deliberately, and nothing here needed it).
   * It is the same route `useAuth().updatePreferredCurrency` already patches: one writer, one more
   * caller (§18 rule 1), no new admission rail.
   *
   * Hydrated ONCE from the auth payload the page already holds, so a background refetch can never
   * overwrite something the user is mid-way through typing.
   */
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [personalError, setPersonalError] = useState<string>("");
  const hydratedPersonal = useRef(false);

  useEffect(() => {
    if (!user || hydratedPersonal.current) return;
    hydratedPersonal.current = true;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setBio(user.bio ?? "");
  }, [user]);

  /**
   * §13 — WHAT THE SERVER WILL NOT STORE, THIS PAGE WILL NOT CLAIM TO HAVE STORED.
   * `updateProfileSchema` types the names `min(1)`, so an emptied name is a 400 rather than a
   * clear. Rather than send it and let the whole save fail with an opaque message — or, worse,
   * silently omit it and toast success over a change that did not happen — the page refuses the
   * save and says which field. Bio has no `min`, so clearing it IS a real, storable answer.
   */
  const validatePersonal = (): string => {
    if (firstName.trim() === "" && (user?.firstName ?? "") !== "") return "First name can't be empty.";
    if (lastName.trim() === "" && (user?.lastName ?? "") !== "") return "Last name can't be empty.";
    if (bio.length > 500) return "Bio must be 500 characters or fewer.";
    return "";
  };

  const savePersonalInfoMutation = useMutation({
    mutationFn: async () => {
      // Only fields the traveler actually stated are sent; an untouched empty name is an
      // unanswered question, not an instruction to blank the column.
      const body: Record<string, string> = {};
      if (firstName.trim() !== "") body.firstName = firstName.trim();
      if (lastName.trim() !== "") body.lastName = lastName.trim();
      if (bio !== (user?.bio ?? "")) body.bio = bio;
      // Nothing changed ⇒ no request. A no-op PATCH would still return 200 and make the toast
      // look earned.
      if (Object.keys(body).length === 0) return null;
      const res = await apiRequest("PATCH", "/api/profile", body);
      return res.json();
    },
    onSuccess: (updated) => {
      if (updated) queryClient.setQueryData(["/api/auth/user"], updated);
    },
  });

  const saveTravelPreferencesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/me/travel-preferences", {
        travelStyles: selectedStyles,
        budgetPreference: selectedBudget,
      });
      return res.json() as Promise<TravelPreferences>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/travel-preferences"] });
    },
  });

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: "Please select an image under 5MB.", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result as string);
        toast({ title: "Photo updated", description: "Your profile photo has been updated." });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setProfileImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast({ title: "Photo removed", description: "Your profile photo has been removed." });
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateNotificationEmail = (value: string): string => {
    if (value.trim() === "") return "";
    return EMAIL_RE.test(value.trim()) ? "" : "Please enter a valid email address.";
  };

  const handleNotificationEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNotificationEmail(value);
    // Clear error immediately once the value becomes empty or valid
    if (value.trim() === "" || EMAIL_RE.test(value.trim())) {
      setNotificationEmailError("");
    }
  };

  const handleNotificationEmailBlur = () => {
    setNotificationEmailError(validateNotificationEmail(notificationEmail));
  };

  const handleSave = async () => {
    const personalErr = validatePersonal();
    setPersonalError(personalErr);
    if (personalErr) return;
    if (isEarner) {
      const emailErr = validateNotificationEmail(notificationEmail);
      if (emailErr) {
        setNotificationEmailError(emailErr);
        return;
      }
    }
    setIsLoading(true);
    try {
      const saves: Promise<any>[] = [
        savePersonalInfoMutation.mutateAsync(),
        saveTravelPreferencesMutation.mutateAsync(),
        saveHomeCityMutation.mutateAsync(),
      ];
      if (isEarner) saves.push(saveNotificationEmailMutation.mutateAsync());
      await Promise.all(saves);
      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Couldn't save your profile",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-foreground dark:text-white" data-testid="text-page-title">
          Profile Settings
        </h1>

        {/* Profile Photo */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-lg text-foreground dark:text-white">Profile Photo</CardTitle>
            <CardDescription className="text-muted-foreground">
              This will be displayed on your profile and in messages
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
              data-testid="input-photo-file"
            />
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-border">
                <AvatarImage src={profileImage || user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                <AvatarFallback className="bg-[#FFE3E8] text-primary text-2xl font-bold">
                  {user?.firstName?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <Button
                size="icon"
                variant="outline"
                className="absolute -bottom-2 -right-2 rounded-full bg-white border-border"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-change-photo"
              >
                <Camera className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
            <div>
              <Button variant="outline" className="mr-2" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-photo">
                Upload Photo
              </Button>
              <Button variant="ghost" className="text-muted-foreground" onClick={handleRemovePhoto} data-testid="button-remove-photo">
                Remove
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Personal Information */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-lg text-foreground dark:text-white">Personal Information</CardTitle>
            <CardDescription className="text-muted-foreground">
              Update your personal details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-foreground dark:text-white">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="border-border"
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-foreground dark:text-white">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="border-border"
                  data-testid="input-last-name"
                />
              </div>
            </div>

            {personalError && (
              <p className="text-xs text-destructive" data-testid="error-personal-info">
                {personalError}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground dark:text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                Email Address
              </Label>
              {/* QA F2, same class: this input was editable and went nowhere. `users.email` is the
                  account identity every login path authenticates against, and NO route on the
                  platform changes it — `PATCH /api/profile`'s allowlist deliberately omits it, and
                  there is no change-email flow to call. So it is shown, read-only, and the page
                  says why rather than offering an edit that silently reverts. */}
              <Input
                id="email"
                type="email"
                value={user?.email || ""}
                readOnly
                className="border-border bg-muted/40"
                data-testid="input-email"
                aria-describedby="email-readonly-note"
              />
              <p id="email-readonly-note" className="text-xs text-muted-foreground" data-testid="text-email-readonly-note">
                This is the email your account signs in with. It can't be changed here.
              </p>
            </div>

            {/* QA F2 — THE "Location" INPUT WAS REMOVED, NOT WIRED (§13, and no schema change).
                It accepted "City, Country", Save Changes toasted "Profile updated", and a reload
                showed it empty: there is no `users.location` column in `shared/models/auth.ts`,
                no migration ever added one, and `PATCH /api/profile`'s allowlist does not name it,
                so nothing anywhere could have stored the answer. A control that takes an answer and
                drops it is a lie the page tells every time it is used, and inventing a column to
                make it true is a schema decision this lane does not own. "Home city" below is the
                platform's PERSISTED location concept (`users.home_city`, one writer) and stays.
                The "Phone Number" input above it was removed in the same pass and for the same
                reason: `users` has no phone column either, so it took an answer and dropped it. */}

            {/* HOME CITY — the one persisted place a traveler can state where they live, and the
                only thing Locked Decision 38's date-night pre-fill can read. It is a SELECT, not
                free text, because the column is validated against the operating markets by its one
                writer; the options are the SERVER's list, never restated here. */}
            <div className="space-y-2">
              <Label htmlFor="homeCity" className="text-foreground dark:text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                Home city
              </Label>
              <select
                id="homeCity"
                value={homeCity}
                onChange={(e) => setHomeCity(e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                data-testid="select-home-city"
              >
                <option value="">Not set</option>
                {(savedHomeCity?.markets ?? []).map((market) => (
                  <option key={market} value={market}>
                    {market}
                  </option>
                ))}
              </select>
              {/* §13 — say what the list is, rather than implying it is the world. */}
              <p className="text-xs text-muted-foreground" data-testid="text-home-city-note">
                We can only plan from the markets we operate in today. Leave it unset if yours is
                not here — we will not guess one for you.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio" className="text-foreground dark:text-white">Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                placeholder="Tell us a bit about yourself and your travel preferences..."
                className="border-border min-h-[100px]"
                data-testid="input-bio"
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification email — experts and providers only */}
        {isEarner && (
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-lg text-foreground dark:text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-muted-foreground" />
                Booking Notifications
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Choose where booking alert emails are delivered
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notificationEmail" className="text-foreground dark:text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  Notification email
                </Label>
                <Input
                  id="notificationEmail"
                  type="email"
                  placeholder={user?.email || "your@business.com"}
                  value={notificationEmail}
                  onChange={handleNotificationEmailChange}
                  onBlur={handleNotificationEmailBlur}
                  className={`border-border${notificationEmailError ? " border-destructive" : ""}`}
                  data-testid="input-notification-email"
                  aria-invalid={!!notificationEmailError}
                  aria-describedby={notificationEmailError ? "notification-email-error" : "notification-email-hint"}
                />
                {notificationEmailError ? (
                  <p id="notification-email-error" className="text-xs text-destructive" data-testid="error-notification-email">
                    {notificationEmailError}
                  </p>
                ) : (
                  <p id="notification-email-hint" className="text-xs text-muted-foreground">
                    Booking alerts will go here instead of your account email. Leave blank to use your account email.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment Methods (FP-2) */}
        <PaymentMethodsCard />

        {/* Travel Preferences */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-lg text-foreground dark:text-white">Travel Preferences</CardTitle>
            <CardDescription className="text-muted-foreground">
              Help us personalize your experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-foreground dark:text-white">Preferred Travel Style</Label>
              <div className="flex flex-wrap gap-2">
                {TRAVEL_STYLES.map(style => {
                  const isSelected = selectedStyles.includes(style);
                  return (
                    <Button
                      key={style}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className={isSelected ? "" : "border-border"}
                      aria-pressed={isSelected}
                      onClick={() => toggleStyle(style)}
                      data-testid={`button-style-${style.toLowerCase()}`}
                    >
                      {style}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground dark:text-white">Budget Preference</Label>
              <div className="flex flex-wrap gap-2">
                {BUDGET_PREFERENCES.map(budget => {
                  const isSelected = selectedBudget === budget;
                  return (
                    <Button
                      key={budget}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className={isSelected ? "" : "border-border"}
                      aria-pressed={isSelected}
                      onClick={() => toggleBudget(budget)}
                      data-testid={`button-budget-${budget.toLowerCase()}`}
                    >
                      {budget}
                    </Button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            className="bg-primary hover:bg-primary/90 text-white"
            onClick={handleSave}
            disabled={isLoading}
            data-testid="button-save-profile"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
    </div>
  );
}
