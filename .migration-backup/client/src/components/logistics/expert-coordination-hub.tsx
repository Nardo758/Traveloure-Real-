import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  CheckCircle,
  Clock,
  AlertTriangle,
  Phone,
  Mail,
  Trash2,
  FileText,
  Users,
  Send,
} from "lucide-react";

interface VendorCoordination {
  id: string;
  vendorName: string;
  vendorCategory: string;
  vendorEmail: string | null;
  vendorPhone: string | null;
  setupTime: string | null;
  arrivalTime: string | null;
  startTime: string | null;
  endTime: string | null;
  serviceDate: string | null;
  status: string;
  contractStatus: string;
  depositAmount: string | null;
  totalAmount: string | null;
  anchorConstraintNote: string | null;
  notes: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-800", icon: Clock },
  contacted: { label: "Contacted", color: "bg-blue-100 text-blue-800", icon: Send },
  confirmed: { label: "Confirmed", color: "bg-green-100 text-green-800", icon: CheckCircle },
  contract_signed: { label: "Contract Signed", color: "bg-emerald-100 text-emerald-800", icon: FileText },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800", icon: AlertTriangle },
};

const VENDOR_CATEGORIES = [
  "photographer", "videographer", "florist", "caterer", "dj_band",
  "hair_makeup", "transportation", "officiant", "venue", "cake_bakery",
  "entertainment", "av_tech", "coordinator", "rental_company", "other",
];

interface ExpertCoordinationHubProps {
  tripId: string;
}

export function ExpertCoordinationHub({ tripId }: ExpertCoordinationHubProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({
    vendorName: "",
    vendorCategory: "photographer",
    vendorEmail: "",
    vendorPhone: "",
    arrivalTime: "",
    startTime: "",
    endTime: "",
    serviceDate: "",
    totalAmount: "",
    anchorConstraintNote: "",
    notes: "",
  });

  const { data } = useQuery<{
    vendors: VendorCoordination[];
    confirmed: VendorCoordination[];
    pending: VendorCoordination[];
    total: number;
  }>({
    queryKey: [`/api/expert/trips/${tripId}/vendors`],
    enabled: !!tripId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/expert/trips/${tripId}/vendors`, {
        vendorName: form.vendorName,
        vendorCategory: form.vendorCategory,
        vendorEmail: form.vendorEmail || null,
        vendorPhone: form.vendorPhone || null,
        arrivalTime: form.arrivalTime || null,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        serviceDate: form.serviceDate || null,
        totalAmount: form.totalAmount || null,
        anchorConstraintNote: form.anchorConstraintNote || null,
        notes: form.notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/expert/trips/${tripId}/vendors`] });
      setShowAddForm(false);
      setForm({
        vendorName: "", vendorCategory: "photographer", vendorEmail: "",
        vendorPhone: "", arrivalTime: "", startTime: "", endTime: "",
        serviceDate: "", totalAmount: "", anchorConstraintNote: "", notes: "",
      });
      toast({ title: "Vendor Added" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PUT", `/api/expert/vendors/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/expert/trips/${tripId}/vendors`] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/expert/vendors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/expert/trips/${tripId}/vendors`] });
    },
  });

  const vendors = data?.vendors || [];
  const confirmed = data?.confirmed || [];
  const pending = data?.pending || [];

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Vendor Coordination
              </CardTitle>
              <CardDescription>
                {confirmed.length} confirmed, {pending.length} pending of {vendors.length} total
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Vendor
            </Button>
          </div>
        </CardHeader>

        {showAddForm && (
          <CardContent>
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Vendor Name</Label>
                  <Input
                    value={form.vendorName}
                    onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
                    placeholder="Sarah Chen Photography"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <select
                    value={form.vendorCategory}
                    onChange={(e) => setForm({ ...form, vendorCategory: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {VENDOR_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={form.vendorEmail}
                    onChange={(e) => setForm({ ...form, vendorEmail: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={form.vendorPhone}
                    onChange={(e) => setForm({ ...form, vendorPhone: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Service Date</Label>
                  <Input
                    type="date"
                    value={form.serviceDate}
                    onChange={(e) => setForm({ ...form, serviceDate: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Total Amount</Label>
                  <Input
                    type="number"
                    value={form.totalAmount}
                    onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
                    placeholder="3000"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Arrival Time</Label>
                  <Input
                    type="time"
                    value={form.arrivalTime}
                    onChange={(e) => setForm({ ...form, arrivalTime: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Start</Label>
                    <Input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">End</Label>
                    <Input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                      className="h-9"
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Anchor Constraint</Label>
                <Input
                  value={form.anchorConstraintNote}
                  onChange={(e) => setForm({ ...form, anchorConstraintNote: e.target.value })}
                  placeholder="Must be ready by 3:30 PM (30min before ceremony)"
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional coordination details..."
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => addMutation.mutate()} disabled={!form.vendorName || addMutation.isPending}>
                  Add Vendor
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Vendor List */}
      <Card>
        <CardContent className="pt-4">
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-3">
              {vendors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No vendors added yet. Click "Add Vendor" to start coordinating.
                </div>
              ) : (
                vendors.map((vendor) => {
                  const statusConf = STATUS_CONFIG[vendor.status] || STATUS_CONFIG.pending;
                  const StatusIcon = statusConf.icon;

                  return (
                    <div key={vendor.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{vendor.vendorName}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {vendor.vendorCategory.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`${statusConf.color} text-[10px] flex items-center gap-1`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusConf.label}
                          </Badge>
                          <button onClick={() => deleteMutation.mutate(vendor.id)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {vendor.serviceDate && <span>Date: {vendor.serviceDate}</span>}
                        {vendor.arrivalTime && <span>Arrives: {vendor.arrivalTime}</span>}
                        {vendor.startTime && vendor.endTime && (
                          <span>Service: {vendor.startTime} - {vendor.endTime}</span>
                        )}
                        {vendor.totalAmount && <span>Total: ${parseFloat(vendor.totalAmount).toLocaleString()}</span>}
                      </div>

                      {vendor.anchorConstraintNote && (
                        <div className="text-xs bg-amber-50 text-amber-800 rounded p-1.5 flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {vendor.anchorConstraintNote}
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-xs">
                        {vendor.vendorEmail && (
                          <a href={`mailto:${vendor.vendorEmail}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                            <Mail className="h-3 w-3" />{vendor.vendorEmail}
                          </a>
                        )}
                        {vendor.vendorPhone && (
                          <a href={`tel:${vendor.vendorPhone}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                            <Phone className="h-3 w-3" />{vendor.vendorPhone}
                          </a>
                        )}
                      </div>

                      {/* Status actions */}
                      <div className="flex gap-1 pt-1">
                        {vendor.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px]"
                            onClick={() => updateStatusMutation.mutate({ id: vendor.id, status: "contacted" })}
                          >
                            Mark Contacted
                          </Button>
                        )}
                        {(vendor.status === "pending" || vendor.status === "contacted") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] text-green-700 border-green-300"
                            onClick={() => updateStatusMutation.mutate({ id: vendor.id, status: "confirmed" })}
                          >
                            Confirm
                          </Button>
                        )}
                        {vendor.status === "confirmed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] text-emerald-700 border-emerald-300"
                            onClick={() => updateStatusMutation.mutate({ id: vendor.id, status: "contract_signed" })}
                          >
                            Contract Signed
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
