import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { useParams, useRoute } from "wouter";
import { Plus, Trash2 } from "lucide-react";

interface ServiceFormData {
  name: string;
  category: "Full Service" | "Review" | "Consultation" | "Custom";
  description: string;
  basePrice: number;
  priceType: "Fixed" | "Range" | "Per-person";
  duration: string;
  photos: string[];
  whatIncluded: string[];
  maxConcurrentClients: number;
  active: boolean;
}

const MOCK_SERVICE: ServiceFormData = {
  name: "Full Expert Itinerary Planning",
  category: "Full Service",
  description: "Complete 7-day Kyoto itinerary with expert guidance and insider recommendations.",
  basePrice: 499,
  priceType: "Fixed",
  duration: "7 days",
  photos: ["photo1.jpg"],
  whatIncluded: ["Custom itinerary", "24/7 support", "Booking assistance", "Local recommendations"],
  maxConcurrentClients: 5,
  active: true,
};

export default function ExpertServiceForm() {
  const params = useParams<{ id: string }>();
  const isEditMode = !!params?.id;
  const [formData, setFormData] = useState<ServiceFormData>(
    isEditMode ? MOCK_SERVICE : {
      name: "",
      category: "Full Service",
      description: "",
      basePrice: 0,
      priceType: "Fixed",
      duration: "",
      photos: [],
      whatIncluded: [],
      maxConcurrentClients: 1,
      active: true,
    }
  );
  const [newIncluded, setNewIncluded] = useState("");

  const handleAddIncluded = () => {
    if (newIncluded.trim()) {
      setFormData({
        ...formData,
        whatIncluded: [...formData.whatIncluded, newIncluded],
      });
      setNewIncluded("");
    }
  };

  const handleRemoveIncluded = (index: number) => {
    setFormData({
      ...formData,
      whatIncluded: formData.whatIncluded.filter((_, i) => i !== index),
    });
  };

  return (
    <ExpertLayout title={isEditMode ? "Edit Service" : "New Service"}>
      <div className="p-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>{isEditMode ? "Edit Service" : "Create New Service"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Service Name */}
            <div>
              <Label htmlFor="name">Service Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Full Expert Service"
                className="mt-2"
              />
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.category} onValueChange={(val: any) => setFormData({ ...formData, category: val })}>
                <SelectTrigger id="category" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Full Service">Full Service</SelectItem>
                  <SelectItem value="Review">Review</SelectItem>
                  <SelectItem value="Consultation">Consultation</SelectItem>
                  <SelectItem value="Custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what your service includes..."
                rows={4}
                className="mt-2"
              />
            </div>

            {/* Base Price */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="basePrice">Base Price ($) *</Label>
                <Input
                  id="basePrice"
                  type="number"
                  value={formData.basePrice}
                  onChange={(e) => setFormData({ ...formData, basePrice: parseInt(e.target.value) || 0 })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="priceType">Price Type</Label>
                <Select value={formData.priceType} onValueChange={(val: any) => setFormData({ ...formData, priceType: val })}>
                  <SelectTrigger id="priceType" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fixed">Fixed</SelectItem>
                    <SelectItem value="Range">Range</SelectItem>
                    <SelectItem value="Per-person">Per-person</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Duration */}
            <div>
              <Label htmlFor="duration">Duration *</Label>
              <Input
                id="duration"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                placeholder="e.g., 7 days, 2 hours"
                className="mt-2"
              />
            </div>

            {/* Photos */}
            <div>
              <Label>Photos</Label>
              <div className="mt-2 border-2 border-dashed rounded-lg p-8 text-center">
                <p className="text-sm text-muted-foreground">Drag photos here or click to upload</p>
              </div>
            </div>

            {/* What's Included */}
            <div>
              <Label>What's Included</Label>
              <div className="mt-2 space-y-2">
                {formData.whatIncluded.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-secondary p-2 rounded">
                    <span className="text-sm">{item}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveIncluded(idx)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  value={newIncluded}
                  onChange={(e) => setNewIncluded(e.target.value)}
                  placeholder="Add an item..."
                  onKeyDown={(e) => e.key === "Enter" && handleAddIncluded()}
                />
                <Button onClick={handleAddIncluded} variant="outline" size="icon">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Max Concurrent Clients */}
            <div>
              <Label htmlFor="maxClients">Max Concurrent Clients</Label>
              <Input
                id="maxClients"
                type="number"
                value={formData.maxConcurrentClients}
                onChange={(e) => setFormData({ ...formData, maxConcurrentClients: parseInt(e.target.value) || 1 })}
                className="mt-2"
              />
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between bg-secondary p-3 rounded-lg">
              <Label htmlFor="active" className="cursor-pointer">Active</Label>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => window.history.back()}>
                Cancel
              </Button>
              <Button variant="outline">Save Draft</Button>
              <Button className="bg-[#FF385C] hover:bg-[#FF385C]/90">
                Publish
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
