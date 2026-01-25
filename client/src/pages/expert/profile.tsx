import { ExpertLayout } from "@/components/expert-layout";
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
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

export default function ExpertProfile() {
  const { user } = useAuth();
  const [specialties, setSpecialties] = useState([
    "Tokyo Travel",
    "Japanese Cuisine",
    "Cultural Experiences",
    "Proposal Planning",
  ]);
  const [languages, setLanguages] = useState(["English", "Japanese"]);
  const [newSpecialty, setNewSpecialty] = useState("");

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
              <Input
                id="displayName"
                defaultValue="Yuki M."
                placeholder="How clients will see your name"
                data-testid="input-display-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="headline">Professional Headline</Label>
              <Input
                id="headline"
                defaultValue="Tokyo Local Expert | Specializing in Authentic Japanese Experiences"
                placeholder="A short tagline about your expertise"
                data-testid="input-headline"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">About Me</Label>
              <Textarea
                id="bio"
                rows={4}
                defaultValue="Born and raised in Tokyo, I've spent over 10 years helping travelers discover the authentic side of Japan. From hidden ramen shops to traditional tea ceremonies, I specialize in creating unique experiences that go beyond typical tourist attractions."
                placeholder="Tell clients about yourself and your expertise"
                data-testid="input-bio"
              />
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
                <Input
                  id="city"
                  defaultValue="Tokyo"
                  data-testid="input-city"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Select defaultValue="japan">
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
            <div className="flex flex-wrap gap-2">
              {specialties.map((specialty) => (
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
              ))}
            </div>
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
            <div className="flex flex-wrap gap-2 mb-4">
              {languages.map((language) => (
                <Badge key={language} variant="outline" className="py-1.5">
                  {language}
                </Badge>
              ))}
            </div>
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
