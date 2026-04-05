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
  Save
} from "lucide-react";
import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function ExpertProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [newSpecialty, setNewSpecialty] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);

  const { data: expertProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/experts", user?.id],
    enabled: !!user?.id,
  });

  const { data: selectedServices, isLoading: servicesLoading } = useQuery({
    queryKey: ["/api/expert/selected-services"],
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
            <h1 className="text-2xl font-bold text-gray-900">Business Profile</h1>
            <p className="text-gray-600">Manage your public profile and preferences</p>
          </div>
          <Button className="bg-[#FF385C] " data-testid="button-save-profile">
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>

        {/* Profile Photo */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Profile Photo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="relative">
                <Avatar className="w-24 h-24 border-4 border-[#FF385C]/20">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-[#FF385C]/10 text-[#FF385C] text-2xl font-medium">
                    {user?.firstName?.[0] || "E"}{user?.lastName?.[0] || "X"}
                  </AvatarFallback>
                </Avatar>
                <Button
                  size="icon"
                  className="absolute bottom-0 right-0 rounded-full w-8 h-8 bg-[#FF385C] "
                  data-testid="button-change-photo"
                >
                  <Camera className="w-4 h-4" />
                </Button>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">
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
        <Card className="border border-gray-200">
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
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="w-5 h-5 text-gray-500" />
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

        {/* Specialties */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Star className="w-5 h-5 text-gray-500" />
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
                  <p className="text-sm text-gray-500">No specialties added yet</p>
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
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="w-5 h-5 text-gray-500" />
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
                  <p className="text-sm text-gray-500">No languages added</p>
                )}
              </div>
            )}
            <Button variant="outline" size="sm" data-testid="button-add-language">
              <Plus className="w-4 h-4 mr-1" /> Add Language
            </Button>
          </CardContent>
        </Card>

        {/* Availability */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Availability Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Available for New Clients</p>
                <p className="text-sm text-gray-500">Toggle off when you're fully booked</p>
              </div>
              <Switch defaultChecked data-testid="switch-availability" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Accept Last-Minute Requests</p>
                <p className="text-sm text-gray-500">Events within 48 hours</p>
              </div>
              <Switch defaultChecked data-testid="switch-last-minute" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Vacation Mode</p>
                <p className="text-sm text-gray-500">Temporarily hide your profile</p>
              </div>
              <Switch data-testid="switch-vacation" />
            </div>
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
