import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Camera, Mail, Phone, MapPin, Calendar, Save, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

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
    <DashboardLayout>
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
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-[#E5E7EB]">
                <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                <AvatarFallback className="bg-[#FFE3E8] text-[#FF385C] text-2xl font-bold">
                  {user?.firstName?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <Button
                size="icon"
                variant="outline"
                className="absolute -bottom-2 -right-2 rounded-full bg-white border-[#E5E7EB]"
                data-testid="button-change-photo"
              >
                <Camera className="w-4 h-4 text-[#6B7280]" />
              </Button>
            </div>
            <div>
              <Button variant="outline" className="mr-2" data-testid="button-upload-photo">
                Upload Photo
              </Button>
              <Button variant="ghost" className="text-[#6B7280]" data-testid="button-remove-photo">
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
                  defaultValue={user?.firstName || ""}
                  className="border-[#E5E7EB]"
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-[#111827] dark:text-white">Last Name</Label>
                <Input
                  id="lastName"
                  defaultValue={user?.lastName || ""}
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
                defaultValue={user?.email || ""}
                className="border-[#E5E7EB]"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-[#111827] dark:text-white flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#6B7280]" />
                Phone Number
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                className="border-[#E5E7EB]"
                data-testid="input-phone"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location" className="text-[#111827] dark:text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#6B7280]" />
                Location
              </Label>
              <Input
                id="location"
                placeholder="City, Country"
                className="border-[#E5E7EB]"
                data-testid="input-location"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio" className="text-[#111827] dark:text-white">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell us a bit about yourself and your travel preferences..."
                className="border-[#E5E7EB] min-h-[100px]"
                data-testid="input-bio"
              />
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
                  <Button key={style} variant="outline" size="sm" className="border-[#E5E7EB]" data-testid={`button-style-${style.toLowerCase()}`}>
                    {style}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[#111827] dark:text-white">Budget Preference</Label>
              <div className="flex flex-wrap gap-2">
                {["Budget-Friendly", "Moderate", "Luxury"].map(budget => (
                  <Button key={budget} variant="outline" size="sm" className="border-[#E5E7EB]" data-testid={`button-budget-${budget.toLowerCase()}`}>
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
    </DashboardLayout>
  );
}
