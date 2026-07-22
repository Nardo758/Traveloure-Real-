import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { Camera, Mail, Phone, MapPin, Calendar, Save, Loader2 } from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSave = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsLoading(false);
    toast({
      title: "Profile updated",
      description: "Your profile has been saved successfully.",
    });
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
                  defaultValue={user?.firstName || ""}
                  className="border-border"
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-foreground dark:text-white">Last Name</Label>
                <Input
                  id="lastName"
                  defaultValue={user?.lastName || ""}
                  className="border-border"
                  data-testid="input-last-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground dark:text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                defaultValue={user?.email || ""}
                className="border-border"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-foreground dark:text-white flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                Phone Number
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                className="border-border"
                data-testid="input-phone"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location" className="text-foreground dark:text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                Location
              </Label>
              <Input
                id="location"
                placeholder="City, Country"
                className="border-border"
                data-testid="input-location"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio" className="text-foreground dark:text-white">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell us a bit about yourself and your travel preferences..."
                className="border-border min-h-[100px]"
                data-testid="input-bio"
              />
            </div>
          </CardContent>
        </Card>

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
                {["Adventure", "Relaxation", "Culture", "Food & Dining", "Nature", "Nightlife"].map(style => (
                  <Button key={style} variant="outline" size="sm" className="border-border" data-testid={`button-style-${style.toLowerCase()}`}>
                    {style}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground dark:text-white">Budget Preference</Label>
              <div className="flex flex-wrap gap-2">
                {["Budget-Friendly", "Moderate", "Luxury"].map(budget => (
                  <Button key={budget} variant="outline" size="sm" className="border-border" data-testid={`button-budget-${budget.toLowerCase()}`}>
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
