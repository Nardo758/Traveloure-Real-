import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Search,
  MapPin,
  Star,
  Heart,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EaSavedVenue {
  id: string; name: string; type?: string; location?: string; rating?: string;
  priceRange?: string; usedBy?: string[]; lastUsed?: string; favorite?: boolean; notes?: string;
}

const VENUE_TYPES = ["Restaurant", "Hotel", "Event Space", "Bar", "Other"];

const emptyForm = {
  name: "",
  type: "Restaurant",
  location: "",
  priceRange: "",
  notes: "",
};

export default function EAVenues() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  const { data: savedVenues = [] } = useQuery<EaSavedVenue[]>({
    queryKey: ["/api/ea/venues"],
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/ea/venues", {
        name: form.name,
        type: form.type,
        location: form.location || undefined,
        priceRange: form.priceRange || undefined,
        notes: form.notes || undefined,
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ea/venues"] });
      toast({ title: "Venue saved" });
      setForm(emptyForm);
      setAddOpen(false);
    },
    onError: (e: any) => toast({ title: "Could not save venue", description: e.message, variant: "destructive" }),
  });

  const favoriteMutation = useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      apiRequest("PATCH", `/api/ea/venues/${id}`, { favorite }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ea/venues"] }),
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const filteredVenues = savedVenues.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.name.toLowerCase().includes(q) || (v.location ?? "").toLowerCase().includes(q) || (v.type ?? "").toLowerCase().includes(q);
  });

  return (
    <EALayout title="Venues">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-venues-title">
              Venues & Locations
            </h1>
            <p className="text-gray-600">Manage favorite venues for your executives</p>
          </div>
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90" data-testid="button-add-venue">
                <Plus className="w-4 h-4 mr-2" /> Add Venue
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Save a Venue</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div>
                  <Label>Name <span className="text-red-500">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kikunoi" data-testid="input-venue-name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger data-testid="select-venue-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VENUE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Price Range</Label>
                    <Select value={form.priceRange || undefined} onValueChange={(v) => setForm({ ...form, priceRange: v })}>
                      <SelectTrigger data-testid="select-venue-price">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="$">$</SelectItem>
                        <SelectItem value="$$">$$</SelectItem>
                        <SelectItem value="$$$">$$$</SelectItem>
                        <SelectItem value="$$$$">$$$$</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Gion, Kyoto" data-testid="input-venue-location" />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} data-testid="input-venue-notes" />
                </div>
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={createMutation.isPending || !form.name}
                  onClick={() => createMutation.mutate()}
                  data-testid="button-submit-venue"
                >
                  {createMutation.isPending ? "Saving…" : "Save Venue"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search saved venues, restaurants, hotels..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-venues"
              />
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border border-[#E8E8E2]" data-testid="stat-saved">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-[#1A1A18]">{savedVenues.length}</p>
              <p className="text-sm text-[#7A7A72]">Saved Venues</p>
            </CardContent>
          </Card>
          <Card className="border border-[#E8E8E2]" data-testid="stat-favorites">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-primary">{savedVenues.filter(v => v.favorite).length}</p>
              <p className="text-sm text-[#7A7A72]">Favorites</p>
            </CardContent>
          </Card>
          <Card className="border border-[#E8E8E2]" data-testid="stat-restaurants">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-[#1A1A18]">{savedVenues.filter(v => v.type === "Restaurant").length}</p>
              <p className="text-sm text-[#7A7A72]">Restaurants</p>
            </CardContent>
          </Card>
          <Card className="border border-[#E8E8E2]" data-testid="stat-hotels">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-[#1A1A18]">{savedVenues.filter(v => v.type === "Hotel").length}</p>
              <p className="text-sm text-[#7A7A72]">Hotels</p>
            </CardContent>
          </Card>
        </div>

        {/* Saved Venues */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Saved Venues</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {savedVenues.length === 0 && (
              <div className="text-center py-8">
                <MapPin className="w-10 h-10 text-[#AEAEA6] mx-auto mb-3" />
                <p className="font-medium text-[#1A1A18]">No saved venues yet</p>
                <p className="text-sm text-[#7A7A72] mt-1">Save venues your executives prefer for quick access</p>
              </div>
            )}
            {savedVenues.length > 0 && filteredVenues.length === 0 && (
              <p className="text-center text-sm text-[#7A7A72] py-6">No venues match your search</p>
            )}
            {filteredVenues.map((venue) => (
              <div
                key={venue.id}
                className="p-4 rounded-lg border border-gray-200 hover:bg-gray-50"
                data-testid={`venue-${venue.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900">{venue.name}</h3>
                      <Badge variant="outline">{venue.type}</Badge>
                      {venue.priceRange && <Badge variant="secondary">{venue.priceRange}</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                      {venue.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" /> {venue.location}
                        </span>
                      )}
                      {venue.rating && (
                        <span className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500" /> {venue.rating}
                        </span>
                      )}
                    </div>
                    {!!(venue.usedBy ?? []).length && (
                      <p className="text-sm text-gray-500 mb-2">
                        Used by: {(venue.usedBy ?? []).join(", ")}
                        {venue.lastUsed && ` • Last used: ${venue.lastUsed}`}
                      </p>
                    )}
                    {venue.notes && (
                      <p className="text-sm text-gray-500 italic">Note: {venue.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={favoriteMutation.isPending}
                      onClick={() => favoriteMutation.mutate({ id: venue.id, favorite: !venue.favorite })}
                      data-testid={`button-favorite-${venue.id}`}
                    >
                      <Heart className={`w-4 h-4 ${venue.favorite ? "text-primary fill-[#FF385C]" : "text-gray-400"}`} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </EALayout>
  );
}
