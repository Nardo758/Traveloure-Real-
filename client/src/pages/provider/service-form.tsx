import { ProviderLayout } from "@/components/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DynamicPricingEditor } from "@/components/shared/dynamic-pricing-editor";
import { useState } from "react";
import { useParams } from "wouter";
import { Plus, Trash2 } from "lucide-react";

interface ServiceFormData {
  name: string;
  category: string;
  description: string;
  basePrice: number;
  priceType: "Fixed" | "Range" | "Per-person";
  duration: string;
  photos: string[];
  whatIncluded: string[];
  maxConcurrentClients: number;
  maxGroupSize: number;
  serviceArea: string;
  pickupAvailable: boolean;
  pickupRadius: number;
  active: boolean;
}

const MOCK_SERVICE = {
  id: "1",
  name: "Airport Transfer (Kansai)",
  category: "Transport",
  description: "Premium airport transfer service from Kansai International Airport to your destination in Kyoto.",
  basePrice: 85,
  priceType: "Fixed" as const,
  duration: "2-3 hours",
  photos: ["photo1.jpg"],
  whatIncluded: ["Vehicle", "Driver", "Luggage"],
  maxConcurrentClients: 4,
  maxGroupSize: 8,
  serviceArea: "Kyoto, Osaka, Nara",
  pickupAvailable: true,
  pickupRadius: 15,
  active: true,
};

export default function ProviderServiceForm() {
  const params = useParams<{ id: string }>();
  const isEditMode = !!params?.id;
  const [formData, setFormData] = useState<ServiceFormData>(
    isEditMode ? MOCK_SERVICE : {
      name: "",
      category: "",
      description: "",
      basePrice: 0,
      priceType: "Fixed",
      duration: "",
      photos: [],
      whatIncluded: [],
      maxConcurrentClients: 1,
      maxGroupSize: 4,
      serviceArea: "",
      pickupAvailable: false,
      pickupRadius: 0,
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
    <ProviderLayout title={isEditMode ? "Edit Service" : "New Service"}>
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
                placeholder="e.g., Airport Transfer"
                className="mt-2"
              />
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="category">Category *</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Transport, Tour, Equipment"
                className="mt-2"
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe your service in detail..."
                rows={4}
                className="mt-2"
              />
            </div>

            {/* Base Price & Type */}
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
                placeholder="e.g., 2-3 hours, Full day"
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

            {/* Max Group Size */}
            <div>
              <Label htmlFor="maxGroupSize">Max Group Size</Label>
              <Input
                id="maxGroupSize"
                type="number"
                value={formData.maxGroupSize}
                onChange={(e) => setFormData({ ...formData, maxGroupSize: parseInt(e.target.value) || 1 })}
                className="mt-2"
              />
            </div>

            {/* Service Area */}
            <div>
              <Label htmlFor="serviceArea">Service Area</Label>
              <Input
                id="serviceArea"
                value={formData.serviceArea}
                onChange={(e) => setFormData({ ...formData, serviceArea: e.target.value })}
                placeholder="e.g., Kyoto, Osaka, Nara"
                className="mt-2"
              />
            </div>

            {/* Pickup Available */}
            <div className="flex items-center justify-between bg-secondary p-3 rounded-lg">
              <Label htmlFor="pickup" className="cursor-pointer">Pickup Available</Label>
              <Switch
                id="pickup"
                checked={formData.pickupAvailable}
                onCheckedChange={(checked) => setFormData({ ...formData, pickupAvailable: checked })}
              />
            </div>

            {/* Pickup Radius */}
            {formData.pickupAvailable && (
              <div>
                <Label htmlFor="pickupRadius">Pickup Radius (km)</Label>
                <Input
                  id="pickupRadius"
                  type="number"
                  value={formData.pickupRadius}
                  onChange={(e) => setFormData({ ...formData, pickupRadius: parseInt(e.target.value) || 0 })}
                  className="mt-2"
                />
              </div>
            )}

            {/* Dynamic Pricing Editor */}
            <div className="border-t pt-6">
              <DynamicPricingEditor basePrice={formData.basePrice} />
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
    </ProviderLayout>
  );
}
