import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, DollarSign, Loader2 } from "lucide-react";

interface AddCustomVenueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  experienceType: string;
  tripId?: string;
  userId?: string;
  onVenueAdded?: (venue: any) => void;
}

export function AddCustomVenueModal({
  open,
  onOpenChange,
  experienceType,
  tripId,
  userId,
  onVenueAdded,
}: AddCustomVenueModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [notes, setNotes] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");

  const createVenueMutation = useMutation({
    mutationFn: async (venueData: any) => {
      const response = await apiRequest("POST", "/api/custom-venues", venueData);
      return response.json();
    },
    onSuccess: (venue) => {
      toast({ title: "Venue added", description: `${venue.name} has been added to your plan` });
      queryClient.invalidateQueries({ queryKey: ["/api/custom-venues"] });
      onVenueAdded?.(venue);
      resetForm();
      onOpenChange(false);
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to add venue" });
    },
  });

  const resetForm = () => {
    setName("");
    setAddress("");
    setLatitude("");
    setLongitude("");
    setNotes("");
    setEstimatedCost("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name required", description: "Please enter a venue name" });
      return;
    }
    
    if (!address.trim() && (!latitude || !longitude)) {
      toast({ 
        variant: "destructive", 
        title: "Location required", 
        description: "Please enter an address or coordinates" 
      });
      return;
    }

    createVenueMutation.mutate({
      userId,
      tripId,
      experienceType,
      name: name.trim(),
      address: address.trim() || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      notes: notes.trim() || null,
      estimatedCost: estimatedCost ? parseFloat(estimatedCost) : null,
      venueType: "custom",
      source: "custom",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-add-custom-venue">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#FF385C]" />
            Add Custom Venue
          </DialogTitle>
          <DialogDescription>
            Add a location like a park, beach, or any address to your plan
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="venue-name">Venue Name *</Label>
            <Input
              id="venue-name"
              data-testid="input-venue-name"
              placeholder="e.g., Central Park, Miami Beach"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="venue-address">Address</Label>
            <Input
              id="venue-address"
              data-testid="input-venue-address"
              placeholder="e.g., 123 Main St, New York, NY"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="venue-lat">Latitude</Label>
              <Input
                id="venue-lat"
                data-testid="input-venue-latitude"
                type="number"
                step="any"
                placeholder="40.7829"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venue-lng">Longitude</Label>
              <Input
                id="venue-lng"
                data-testid="input-venue-longitude"
                type="number"
                step="any"
                placeholder="-73.9654"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="venue-cost" className="flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              Estimated Cost (optional)
            </Label>
            <Input
              id="venue-cost"
              data-testid="input-venue-cost"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="venue-notes">Notes (optional)</Label>
            <Textarea
              id="venue-notes"
              data-testid="input-venue-notes"
              placeholder="Any additional details about this venue..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>
          
          <div className="flex gap-2 pt-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="flex-1"
              data-testid="button-cancel-venue"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-[#FF385C] hover:bg-[#E31C5F]"
              disabled={createVenueMutation.isPending}
              data-testid="button-add-venue"
            >
              {createVenueMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add to Plan"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
