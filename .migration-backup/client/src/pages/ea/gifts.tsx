import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Gift,
  Calendar,
  User,
  Plus,
  Bot,
  Star,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDelegateToAi } from "./use-ea-ai-delegate";

interface EaGift {
  id: string; executiveId?: string | null; executiveName?: string; occasion: string; occasionDate?: string;
  recipient?: string; gift?: string; amount?: string; status: string;
  rating?: number; giftNeeded?: boolean; notes?: string;
  createdAt?: string;
}

interface EaExecutive {
  id: string;
  name: string;
}

const emptyForm = {
  executiveId: "",
  occasion: "",
  occasionDate: "",
  recipient: "",
  gift: "",
  amount: "",
  giftNeeded: true,
};

export default function EAGifts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [fulfillingGift, setFulfillingGift] = useState<EaGift | null>(null);
  const [fulfillGiftName, setFulfillGiftName] = useState("");
  const [fulfillAmount, setFulfillAmount] = useState("");

  const { data: allGifts = [] } = useQuery<EaGift[]>({
    queryKey: ["/api/ea/gifts"],
  });
  const { data: executives = [] } = useQuery<EaExecutive[]>({
    queryKey: ["/api/ea/executives"],
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const exec = executives.find((e) => e.id === form.executiveId);
      return apiRequest("POST", "/api/ea/gifts", {
        executiveId: form.executiveId || undefined,
        executiveName: exec?.name || undefined,
        occasion: form.occasion,
        occasionDate: form.occasionDate || undefined,
        recipient: form.recipient || undefined,
        gift: form.gift || undefined,
        amount: form.amount || undefined,
        giftNeeded: form.giftNeeded,
        status: "pending",
      }).then((r) => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ea/gifts"] });
      toast({ title: "Occasion added" });
      setForm(emptyForm);
      setAddOpen(false);
    },
    onError: (e: any) => toast({ title: "Could not add occasion", description: e.message, variant: "destructive" }),
  });

  const fulfillMutation = useMutation({
    mutationFn: () => {
      if (!fulfillingGift) return Promise.reject(new Error("No occasion selected"));
      return apiRequest("PATCH", `/api/ea/gifts/${fulfillingGift.id}`, {
        gift: fulfillGiftName,
        amount: fulfillAmount || undefined,
        status: "sent",
        giftNeeded: false,
      }).then((r) => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ea/gifts"] });
      toast({ title: "Gift recorded" });
      setFulfillingGift(null);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const delegate = useDelegateToAi();

  const upcomingOccasions = allGifts.filter(g => g.giftNeeded !== false && !g.gift);
  const giftHistory = allGifts.filter(g => (g.gift && g.status === "sent") || g.rating);

  // Derive stat cards from the real gifts list (were hardcoded 3/8/24/$18.5k — §13).
  const thisYear = new Date().getFullYear();
  const nowTs = new Date();
  const giftsNeededCount = upcomingOccasions.length;
  const upcomingCount = allGifts.filter(g => {
    if (!g.occasionDate) return false;
    const d = new Date(g.occasionDate);
    return !isNaN(d.getTime()) && d >= nowTs;
  }).length;
  const giftsThisYear = giftHistory.filter(g => {
    const raw = g.occasionDate ?? g.createdAt;
    if (!raw) return false;
    const d = new Date(raw);
    return !isNaN(d.getTime()) && d.getFullYear() === thisYear;
  }).length;
  const ytdSpent = giftHistory.reduce((sum, g) => {
    const amt = parseFloat(String(g.amount ?? "").replace(/[^0-9.]/g, "")) || 0;
    return sum + amt;
  }, 0);
  const ytdSpentLabel = ytdSpent >= 1000 ? `$${(ytdSpent / 1000).toFixed(1)}k` : `$${ytdSpent.toFixed(0)}`;

  return (
    <EALayout title="Gifts">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-gifts-title">
              Gift Management
            </h1>
            <p className="text-gray-600">Track occasions and manage gift giving</p>
          </div>
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90" data-testid="button-order-gift">
                <Plus className="w-4 h-4 mr-2" /> Add Occasion
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Gift Occasion</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div>
                  <Label>Occasion <span className="text-red-500">*</span></Label>
                  <Input value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })} placeholder="e.g. Client anniversary" data-testid="input-gift-occasion" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Executive</Label>
                    <Select value={form.executiveId || undefined} onValueChange={(v) => setForm({ ...form, executiveId: v })}>
                      <SelectTrigger data-testid="select-gift-executive">
                        <SelectValue placeholder="Select executive" />
                      </SelectTrigger>
                      <SelectContent>
                        {executives.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-gray-400">No executives added yet</div>
                        )}
                        {executives.map((exec) => (
                          <SelectItem key={exec.id} value={exec.id}>{exec.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Occasion Date</Label>
                    <Input type="date" value={form.occasionDate} onChange={(e) => setForm({ ...form, occasionDate: e.target.value })} data-testid="input-gift-date" />
                  </div>
                </div>
                <div>
                  <Label>Recipient</Label>
                  <Input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder="Who receives the gift" data-testid="input-gift-recipient" />
                </div>
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={createMutation.isPending || !form.occasion}
                  onClick={() => createMutation.mutate()}
                  data-testid="button-submit-gift"
                >
                  {createMutation.isPending ? "Adding…" : "Add Occasion"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border border-gray-200" data-testid="stat-pending-gifts">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-yellow-600">{giftsNeededCount}</p>
              <p className="text-sm text-gray-600">Gifts Needed</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-upcoming">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">{upcomingCount}</p>
              <p className="text-sm text-gray-600">Upcoming Occasions</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-this-year">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">{giftsThisYear}</p>
              <p className="text-sm text-gray-600">Gifts This Year</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-budget">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{ytdSpentLabel}</p>
              <p className="text-sm text-gray-600">YTD Spent</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upcoming Occasions */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border border-gray-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">Upcoming Occasions</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingOccasions.length === 0 && (
                  <div className="text-center py-6">
                    <Calendar className="w-8 h-8 text-[#AEAEA6] mx-auto mb-2" />
                    <p className="text-[#7A7A72] text-sm">No upcoming occasions</p>
                  </div>
                )}
                {upcomingOccasions.map((occasion) => (
                  <div
                    key={occasion.id}
                    className={`p-4 rounded-lg border ${occasion.giftNeeded ? "border-yellow-200 bg-yellow-50/50" : "border-gray-200"}`}
                    data-testid={`occasion-${occasion.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-gray-900">{occasion.executiveName || "—"}</p>
                          {occasion.giftNeeded && (
                            <Badge className="bg-yellow-100 text-yellow-700">Gift Needed</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{occasion.occasion}</p>
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                          <Clock className="w-3 h-3" /> {occasion.occasionDate || "no date set"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {occasion.giftNeeded && (
                          <Button
                            size="sm"
                            className="bg-primary hover:bg-primary/90"
                            onClick={() => {
                              setFulfillingGift(occasion);
                              setFulfillGiftName(occasion.gift || "");
                              setFulfillAmount(occasion.amount || "");
                            }}
                            data-testid={`button-select-gift-${occasion.id}`}
                          >
                            <Gift className="w-3 h-3 mr-1" /> Select Gift
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={delegate.isPending}
                          onClick={() => delegate.mutate({
                            type: "gift_suggestion",
                            task: `Suggest gift ideas for ${occasion.executiveName || "an executive"}'s ${occasion.occasion}`,
                            executiveName: occasion.executiveName,
                          })}
                          data-testid={`button-ai-suggest-${occasion.id}`}
                        >
                          <Bot className="w-3 h-3 mr-1" /> AI Suggest
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Gift History */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Recent Gift History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {giftHistory.length === 0 && (
                <div className="text-center py-6">
                  <Gift className="w-8 h-8 text-[#AEAEA6] mx-auto mb-2" />
                  <p className="text-[#7A7A72] text-sm">No gift history yet</p>
                </div>
              )}
              {giftHistory.map((gift) => (
                <div
                  key={gift.id}
                  className="p-3 rounded-lg border border-gray-100"
                  data-testid={`gift-history-${gift.id}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{gift.executiveName}</span>
                  </div>
                  <p className="text-sm text-gray-600">{gift.occasion}</p>
                  <p className="text-sm text-gray-900 font-medium mt-1">{gift.gift}</p>
                  <div className="flex items-center justify-between mt-2 text-sm text-gray-500">
                    <span>{gift.amount ? `$${gift.amount}` : ""}</span>
                    <div className="flex items-center gap-1">
                      {gift.rating ? [...Array(gift.rating)].map((_, i) => (
                        <Star key={i} className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      )) : null}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{gift.occasionDate ?? gift.createdAt}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Fulfill / Select Gift Dialog */}
      <Dialog open={!!fulfillingGift} onOpenChange={(open) => { if (!open) setFulfillingGift(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Gift — {fulfillingGift?.occasion}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label>Gift</Label>
              <Input value={fulfillGiftName} onChange={(e) => setFulfillGiftName(e.target.value)} placeholder="What was sent" data-testid="input-fulfill-gift-name" />
            </div>
            <div>
              <Label>Amount</Label>
              <Input value={fulfillAmount} onChange={(e) => setFulfillAmount(e.target.value)} placeholder="e.g. 150.00" data-testid="input-fulfill-gift-amount" />
            </div>
            <Button
              className="w-full bg-primary hover:bg-primary/90"
              disabled={fulfillMutation.isPending || !fulfillGiftName}
              onClick={() => fulfillMutation.mutate()}
              data-testid="button-save-fulfilled-gift"
            >
              {fulfillMutation.isPending ? "Saving…" : "Mark as Sent"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </EALayout>
  );
}
