import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Mail, Save, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    bio: "",
  });

  // Populate form once user data is available
  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        bio: (user as any).bio || "",
      });
    }
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/profile", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Profile updated",
        description: "Your changes have been saved successfully.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Could not save profile. Please try again.",
        variant: "destructive",
      });
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
            <Avatar className="h-24 w-24 border-4 border-[#E5E7EB]">
              <AvatarImage src={profileImage || user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
              <AvatarFallback className="bg-[#FFE3E8] text-[#FF385C] text-2xl font-bold">
                {user?.firstName?.[0] || "U"}
              </AvatarFallback>
            </Avatar>
            <Button
              size="icon"
              variant="outline"
              className="absolute -bottom-2 -right-2 rounded-full bg-white border-[#E5E7EB]"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-change-photo"
            >
              <Camera className="w-4 h-4 text-[#6B7280]" />
            </Button>
          </div>
          <div>
            <Button variant="outline" className="mr-2" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-photo">
              Upload Photo
            </Button>
            <Button variant="ghost" className="text-[#6B7280]" onClick={handleRemovePhoto} data-testid="button-remove-photo">
              Remove
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card className="border border-[#E5E7EB]">
        <CardHeader>
          <CardTitle className="text-lg text-[#111827] dark:text-white">Personal Information</CardTitle>
          <CardDescription className="text-[#6B7280]">
            Update your personal details
          </CardDescription>
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
              placeholder="Tell us a bit about yourself and your travel preferences..."
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
          <CardDescription className="text-[#6B7280]">
            Help us personalize your experience
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[#111827] dark:text-white">Preferred Travel Style</Label>
            <div className="flex flex-wrap gap-2">
              {["Adventure", "Relaxation", "Culture", "Food & Dining", "Nature", "Nightlife"].map(style => (
                <Button key={style} variant="outline" size="sm" className="border-[#E5E7EB]" data-testid={`button-style-${style.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                  {style}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[#111827] dark:text-white">Budget Preference</Label>
            <div className="flex flex-wrap gap-2">
              {["Budget-Friendly", "Moderate", "Luxury"].map(budget => (
                <Button key={budget} variant="outline" size="sm" className="border-[#E5E7EB]" data-testid={`button-budget-${budget.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
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
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
