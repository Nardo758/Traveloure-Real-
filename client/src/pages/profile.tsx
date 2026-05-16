import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Mail, Save, Loader2, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local preview — null means "use server value"
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [form, setForm] = useState({ firstName: "", lastName: "", bio: "" });

  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        bio: (user as any).bio || "",
      });
    }
  }, [user]);

  // Displayed avatar: local preview > server value > nothing
  const displayedAvatar = previewImage ?? user?.profileImageUrl ?? undefined;

  // ── Photo upload ─────────────────────────────────────────────────────────────
  const photoMutation = useMutation({
    mutationFn: (imageData: string) =>
      apiRequest("POST", "/api/profile/photo", { imageData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Photo saved", description: "Your profile photo has been updated." });
    },
    onError: (err: any) => {
      setPreviewImage(null);
      toast({
        title: "Upload failed",
        description: err?.message || "Could not save photo. Please try again.",
        variant: "destructive",
      });
    },
  });

  const removePhotoMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/profile/photo"),
    onSuccess: () => {
      setPreviewImage(null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Photo removed", description: "Your profile photo has been removed." });
    },
    onError: (err: any) => {
      toast({
        title: "Remove failed",
        description: err?.message || "Could not remove photo.",
        variant: "destructive",
      });
    },
  });

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please choose an image under 5 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setPreviewImage(dataUrl);
      photoMutation.mutate(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  // ── Profile fields save ───────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/profile", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Profile updated", description: "Your changes have been saved." });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Could not save profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const isPhotoChanging = photoMutation.isPending || removePhotoMutation.isPending;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-[#111827] dark:text-white" data-testid="text-page-title">
        Profile Settings
      </h1>

      {/* Profile Photo */}
      <Card className="border border-[#E5E7EB]">
        <CardHeader>
          <CardTitle className="text-lg text-[#111827] dark:text-white">Profile Photo</CardTitle>
          <CardDescription className="text-[#6B7280]">
            Uploaded photos are saved immediately and shown across the platform
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
            data-testid="input-photo-file"
          />
          <div className="relative">
            <Avatar className="h-24 w-24 border-4 border-[#E5E7EB]">
              {isPhotoChanging ? (
                <div className="h-full w-full flex items-center justify-center bg-gray-100 rounded-full">
                  <Loader2 className="w-6 h-6 animate-spin text-[#FF385C]" />
                </div>
              ) : (
                <>
                  <AvatarImage src={displayedAvatar} alt={user?.firstName || "User"} />
                  <AvatarFallback className="bg-[#FFE3E8] text-[#FF385C] text-2xl font-bold">
                    {user?.firstName?.[0] || "U"}
                  </AvatarFallback>
                </>
              )}
            </Avatar>
            <Button
              size="icon"
              variant="outline"
              className="absolute -bottom-2 -right-2 rounded-full bg-white border-[#E5E7EB]"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPhotoChanging}
              data-testid="button-change-photo"
            >
              <Camera className="w-4 h-4 text-[#6B7280]" />
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPhotoChanging}
              data-testid="button-upload-photo"
            >
              {photoMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading…</>
              ) : (
                <><Camera className="w-4 h-4 mr-2" />Upload Photo</>
              )}
            </Button>
            {(displayedAvatar) && (
              <Button
                variant="ghost"
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={() => removePhotoMutation.mutate()}
                disabled={isPhotoChanging}
                data-testid="button-remove-photo"
              >
                {removePhotoMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Removing…</>
                ) : (
                  <><Trash2 className="w-4 h-4 mr-2" />Remove Photo</>
                )}
              </Button>
            )}
            <p className="text-xs text-[#6B7280]">JPG, PNG or GIF — max 5 MB</p>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card className="border border-[#E5E7EB]">
        <CardHeader>
          <CardTitle className="text-lg text-[#111827] dark:text-white">Personal Information</CardTitle>
          <CardDescription className="text-[#6B7280]">Update your personal details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-[#111827] dark:text-white">First Name</Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                className="border-[#E5E7EB]"
                data-testid="input-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-[#111827] dark:text-white">Last Name</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                className="border-[#E5E7EB]"
                data-testid="input-last-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-[#111827] dark:text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#6B7280]" />
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              value={user?.email || ""}
              readOnly
              className="border-[#E5E7EB] bg-gray-50 cursor-not-allowed"
              data-testid="input-email"
            />
            <p className="text-xs text-[#6B7280]">Email cannot be changed here. Contact support if needed.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio" className="text-[#111827] dark:text-white">Bio</Label>
            <Textarea
              id="bio"
              value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              placeholder="Tell us a bit about yourself and your travel preferences…"
              className="border-[#E5E7EB] min-h-[100px]"
              maxLength={500}
              data-testid="input-bio"
            />
            <p className="text-xs text-[#6B7280] text-right">{form.bio.length}/500</p>
          </div>
        </CardContent>
      </Card>

      {/* Travel Preferences */}
      <Card className="border border-[#E5E7EB]">
        <CardHeader>
          <CardTitle className="text-lg text-[#111827] dark:text-white">Travel Preferences</CardTitle>
          <CardDescription className="text-[#6B7280]">Help us personalise your experience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[#111827] dark:text-white">Preferred Travel Style</Label>
            <div className="flex flex-wrap gap-2">
              {["Adventure", "Relaxation", "Culture", "Food & Dining", "Nature", "Nightlife"].map(style => (
                <Button
                  key={style}
                  variant="outline"
                  size="sm"
                  className="border-[#E5E7EB]"
                  data-testid={`button-style-${style.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                >
                  {style}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[#111827] dark:text-white">Budget Preference</Label>
            <div className="flex flex-wrap gap-2">
              {["Budget-Friendly", "Moderate", "Luxury"].map(budget => (
                <Button
                  key={budget}
                  variant="outline"
                  size="sm"
                  className="border-[#E5E7EB]"
                  data-testid={`button-budget-${budget.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                >
                  {budget}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          className="bg-[#FF385C] hover:bg-[#E23350] text-white"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-profile"
        >
          {saveMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
          ) : (
            <><Save className="w-4 h-4 mr-2" />Save Changes</>
          )}
        </Button>
      </div>
    </div>
  );
}
