import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Search, 
  Plus, 
  User, 
  Mail, 
  Phone, 
  Plane, 
  Hotel, 
  Utensils, 
  Gift, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Trash2
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EaExecutive {
  id: string; name: string; title?: string; status: string;
  email?: string; phone?: string;
  preferences?: Record<string, string>;
  family?: { spouse?: string; anniversary?: string; children?: string; importantDates?: Array<{ label: string; date: string }> };
  notes?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

function monthDayToStr(month: string, day: string): string {
  if (!month || !day) return "";
  return `${month} ${day}`;
}

function strToMonthDay(s: string): { month: string; day: string } {
  if (!s) return { month: "", day: "" };
  const parts = s.trim().split(/\s+/);
  if (parts.length < 2) return { month: "", day: "" };
  const month = MONTHS.find((m) => m.toLowerCase() === parts[0].toLowerCase()) ?? "";
  const day = parts[1] && !isNaN(parseInt(parts[1], 10)) ? String(parseInt(parts[1], 10)) : "";
  return { month, day };
}

interface ImportantDateEntry {
  label: string;
  month: string;
  day: string;
}

interface EditFormState {
  email: string;
  phone: string;
  travelClass: string;
  hotelBrands: string;
  dietary: string;
  seating: string;
  preferenceNotes: string;
  spouse: string;
  anniversaryMonth: string;
  anniversaryDay: string;
  children: string;
  notes: string;
}

function buildFormState(exec: EaExecutive): EditFormState {
  const { month: anniversaryMonth, day: anniversaryDay } = strToMonthDay(exec.family?.anniversary ?? "");
  return {
    email: exec.email ?? "",
    phone: exec.phone ?? "",
    travelClass: exec.preferences?.travelClass ?? "",
    hotelBrands: exec.preferences?.hotelBrands ?? "",
    dietary: exec.preferences?.dietary ?? "",
    seating: exec.preferences?.seating ?? "",
    preferenceNotes: exec.preferences?.notes ?? "",
    spouse: exec.family?.spouse ?? "",
    anniversaryMonth,
    anniversaryDay,
    children: exec.family?.children ?? "",
    notes: exec.notes ?? "",
  };
}

export default function EAExecutives() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingExec, setEditingExec] = useState<EaExecutive | null>(null);
  const [formState, setFormState] = useState<EditFormState | null>(null);
  const [importantDates, setImportantDates] = useState<ImportantDateEntry[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: executives = [] } = useQuery<EaExecutive[]>({
    queryKey: ["/api/ea/executives"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: object }) => {
      return apiRequest("PATCH", `/api/ea/executives/${id}`, payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ea/executives"] });
      toast({ title: "Profile updated", description: "Executive profile saved successfully." });
      setExpandedId(variables.id);
      setEditingExec(null);
      setFormState(null);
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save changes. Please try again.", variant: "destructive" });
    },
  });

  function openEdit(exec: EaExecutive, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingExec(exec);
    setFormState(buildFormState(exec));
    setImportantDates(
      (exec.family?.importantDates ?? []).map((d) => {
        const { month, day } = strToMonthDay(d.date);
        return { label: d.label, month, day };
      })
    );
  }

  function addImportantDate() {
    setImportantDates((prev) => [...prev, { label: "", month: "", day: "" }]);
  }

  function updateImportantDate(idx: number, field: keyof ImportantDateEntry, value: string) {
    setImportantDates((prev) => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  }

  function removeImportantDate(idx: number) {
    setImportantDates((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleField(field: keyof EditFormState, value: string) {
    setFormState((prev) => prev ? { ...prev, [field]: value } : prev);
  }

  function handleSave() {
    if (!editingExec || !formState) return;
    const anniversaryStr = monthDayToStr(formState.anniversaryMonth, formState.anniversaryDay);
    const payload = {
      email: formState.email || null,
      phone: formState.phone || null,
      notes: formState.notes || null,
      preferences: {
        travelClass: formState.travelClass || null,
        hotelBrands: formState.hotelBrands || null,
        dietary: formState.dietary || null,
        seating: formState.seating || null,
        notes: formState.preferenceNotes || null,
      },
      family: {
        spouse: formState.spouse || null,
        anniversary: anniversaryStr || null,
        children: formState.children || null,
        importantDates: importantDates
          .filter((d) => d.label.trim() || d.month || d.day)
          .map((d) => ({ label: d.label, date: monthDayToStr(d.month, d.day) })),
      },
    };
    updateMutation.mutate({ id: editingExec.id, payload });
  }

  return (
    <EALayout title="Executive Management">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-executives-title">
              Executive Management
            </h1>
            <p className="text-gray-600">Manage executive profiles and preferences</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" data-testid="button-import">
              Import from Directory
            </Button>
            <Button variant="outline" data-testid="button-export-list">
              Export List
            </Button>
            <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-add-executive">
              <Plus className="w-4 h-4 mr-2" /> Add New Executive
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input 
            placeholder="Search executives..." 
            className="pl-9"
            data-testid="input-search-executives"
          />
        </div>

        {/* Executives List */}
        <div className="space-y-4">
          {executives.length === 0 && (
            <Card className="border border-[#E8E8E2]">
              <CardContent className="p-12 text-center">
                <User className="w-12 h-12 text-[#AEAEA6] mx-auto mb-3" />
                <p className="font-medium text-[#1A1A18]">No executives added yet</p>
                <p className="text-sm text-[#7A7A72] mt-1">Add executives to manage their preferences and events</p>
              </CardContent>
            </Card>
          )}
          {executives.map((exec) => (
            <Card key={exec.id} className="border border-gray-200" data-testid={`executive-${exec.id}`}>
              <CardHeader 
                className="cursor-pointer"
                onClick={() => setExpandedId(expandedId === exec.id ? null : exec.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#FF385C]/10 flex items-center justify-center">
                      <User className="w-6 h-6 text-[#FF385C]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">
                          {exec.name ?? "Unknown Executive"}{exec.title ? ` — ${exec.title}` : ""}
                        </CardTitle>
                        <Badge className="bg-green-100 text-green-700">Active</Badge>
                      </div>
                      <p className="text-sm text-gray-500">
                        Status: {exec.status ?? "—"}
                        {exec.notes && (
                          <span className="text-yellow-600 ml-2">
                            <AlertCircle className="w-3 h-3 inline mr-1" />
                            {exec.notes}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" data-testid={`button-profile-${exec.id}`}>
                      View Full Profile
                    </Button>
                    {expandedId === exec.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </CardHeader>

              {expandedId === exec.id && (
                <CardContent className="border-t border-gray-100 pt-4 space-y-6">
                  {/* Profile Information */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Profile Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <p className="flex items-center gap-2 text-gray-600">
                        <Mail className="w-4 h-4" /> {exec.email ?? "—"}
                      </p>
                      <p className="flex items-center gap-2 text-gray-600">
                        <Phone className="w-4 h-4" /> {exec.phone ?? "—"}
                      </p>
                    </div>
                  </div>

                  {/* Preferences */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Preferences</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <p className="text-gray-600">
                        <span className="flex items-center gap-1"><Plane className="w-4 h-4" /> Travel Class:</span>
                        {exec.preferences?.travelClass ?? "—"}
                      </p>
                      <p className="text-gray-600">
                        <span className="flex items-center gap-1"><Hotel className="w-4 h-4" /> Hotels:</span>
                        {exec.preferences?.hotelBrands ?? "—"}
                      </p>
                      <p className="text-gray-600">
                        <span className="flex items-center gap-1"><Utensils className="w-4 h-4" /> Dietary:</span>
                        {exec.preferences?.dietary ?? "—"}
                      </p>
                      <p className="text-gray-600">Seating: {exec.preferences?.seating ?? "—"}</p>
                    </div>
                    {exec.preferences?.notes && (
                      <p className="text-sm text-yellow-600 mt-2">
                        <AlertCircle className="w-4 h-4 inline mr-1" />
                        {exec.preferences.notes}
                      </p>
                    )}
                  </div>

                  {/* Family Information */}
                  {exec.family && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3">Family Information</h3>
                      <div className="text-sm space-y-1 text-gray-600">
                        <p>Spouse: {exec.family.spouse ?? "—"}{exec.family.anniversary ? ` (Anniversary: ${exec.family.anniversary})` : ""}</p>
                        <p>Children: {exec.family.children ?? "—"}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {(exec.family?.importantDates ?? []).map((date, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {date.label}: {date.date}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {exec.notes && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Gift className="w-4 h-4" /> Notes
                      </h3>
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{exec.notes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`button-edit-profile-${exec.id}`}
                      onClick={(e) => openEdit(exec, e)}
                    >
                      Edit Profile
                    </Button>
                    <Button size="sm" variant="outline" data-testid={`button-all-events-${exec.id}`}>
                      View All Events
                    </Button>
                    <Button size="sm" variant="outline" data-testid={`button-communication-${exec.id}`}>
                      Communication History
                    </Button>
                    <Button size="sm" variant="outline" data-testid={`button-gift-suggestions-${exec.id}`}>
                      Gift Suggestions
                    </Button>
                    <Button size="sm" variant="outline" data-testid={`button-travel-history-${exec.id}`}>
                      Travel History
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        <Button variant="ghost" className="w-full text-[#FF385C]" data-testid="button-show-all">
          Show All 8 Executives
        </Button>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={!!editingExec} onOpenChange={(open) => { if (!open) { setEditingExec(null); setFormState(null); setImportantDates([]); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-profile">
          <DialogHeader>
            <DialogTitle>Edit Profile — {editingExec?.name}</DialogTitle>
          </DialogHeader>

          {formState && (
            <div className="space-y-5 py-2">
              {/* Contact */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Contact Information</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input
                      id="edit-email"
                      data-testid="input-edit-email"
                      value={formState.email}
                      onChange={(e) => handleField("email", e.target.value)}
                      placeholder="email@company.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-phone">Phone</Label>
                    <Input
                      id="edit-phone"
                      data-testid="input-edit-phone"
                      value={formState.phone}
                      onChange={(e) => handleField("phone", e.target.value)}
                      placeholder="+1 555 000 0000"
                    />
                  </div>
                </div>
              </div>

              {/* Travel Preferences */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Travel Preferences</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="edit-travel-class">Travel Class</Label>
                    <Input
                      id="edit-travel-class"
                      data-testid="input-edit-travel-class"
                      value={formState.travelClass}
                      onChange={(e) => handleField("travelClass", e.target.value)}
                      placeholder="e.g. Business, First Class"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-hotel-brands">Preferred Hotel Brands</Label>
                    <Input
                      id="edit-hotel-brands"
                      data-testid="input-edit-hotel-brands"
                      value={formState.hotelBrands}
                      onChange={(e) => handleField("hotelBrands", e.target.value)}
                      placeholder="e.g. Four Seasons, Marriott"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-dietary">Dietary Requirements</Label>
                    <Input
                      id="edit-dietary"
                      data-testid="input-edit-dietary"
                      value={formState.dietary}
                      onChange={(e) => handleField("dietary", e.target.value)}
                      placeholder="e.g. Vegetarian, Gluten-free"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-seating">Seating Preference</Label>
                    <Input
                      id="edit-seating"
                      data-testid="input-edit-seating"
                      value={formState.seating}
                      onChange={(e) => handleField("seating", e.target.value)}
                      placeholder="e.g. Aisle, Window"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-preference-notes">Preference Notes</Label>
                    <Textarea
                      id="edit-preference-notes"
                      data-testid="input-edit-preference-notes"
                      value={formState.preferenceNotes}
                      onChange={(e) => handleField("preferenceNotes", e.target.value)}
                      placeholder="Any additional preference details..."
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Family */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Family Information</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="edit-spouse">Spouse / Partner</Label>
                    <Input
                      id="edit-spouse"
                      data-testid="input-edit-spouse"
                      value={formState.spouse}
                      onChange={(e) => handleField("spouse", e.target.value)}
                      placeholder="Spouse name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Anniversary Date</Label>
                    <div className="flex gap-2">
                      <Select
                        value={formState.anniversaryMonth}
                        onValueChange={(v) => handleField("anniversaryMonth", v)}
                      >
                        <SelectTrigger data-testid="select-anniversary-month" className="flex-1">
                          <SelectValue placeholder="Month" />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={formState.anniversaryDay}
                        onValueChange={(v) => handleField("anniversaryDay", v)}
                      >
                        <SelectTrigger data-testid="select-anniversary-day" className="w-24">
                          <SelectValue placeholder="Day" />
                        </SelectTrigger>
                        <SelectContent>
                          {DAYS.map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-children">Children</Label>
                    <Input
                      id="edit-children"
                      data-testid="input-edit-children"
                      value={formState.children}
                      onChange={(e) => handleField("children", e.target.value)}
                      placeholder="e.g. 2 (ages 8, 11)"
                    />
                  </div>

                  {/* Important Dates */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Important Dates</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={addImportantDate}
                        data-testid="button-add-important-date"
                        className="h-7 text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add Date
                      </Button>
                    </div>
                    {importantDates.length === 0 && (
                      <p className="text-xs text-gray-400 italic">No important dates added yet.</p>
                    )}
                    {importantDates.map((entry, idx) => (
                      <div key={idx} className="space-y-1" data-testid={`important-date-row-${idx}`}>
                        <div className="flex gap-2 items-center">
                          <Input
                            value={entry.label}
                            onChange={(e) => updateImportantDate(idx, "label", e.target.value)}
                            placeholder="Label (e.g. Birthday)"
                            className="flex-1 text-sm"
                            data-testid={`input-important-date-label-${idx}`}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeImportantDate(idx)}
                            data-testid={`button-remove-important-date-${idx}`}
                            className="h-8 w-8 text-gray-400 hover:text-red-500 flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Select
                            value={entry.month}
                            onValueChange={(v) => updateImportantDate(idx, "month", v)}
                          >
                            <SelectTrigger
                              data-testid={`select-important-date-month-${idx}`}
                              className="flex-1 text-sm h-8"
                            >
                              <SelectValue placeholder="Month" />
                            </SelectTrigger>
                            <SelectContent>
                              {MONTHS.map((m) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={entry.day}
                            onValueChange={(v) => updateImportantDate(idx, "day", v)}
                          >
                            <SelectTrigger
                              data-testid={`select-important-date-day-${idx}`}
                              className="w-20 text-sm h-8"
                            >
                              <SelectValue placeholder="Day" />
                            </SelectTrigger>
                            <SelectContent>
                              {DAYS.map((d) => (
                                <SelectItem key={d} value={d}>{d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* General Notes */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">General Notes</h4>
                <Textarea
                  data-testid="input-edit-notes"
                  value={formState.notes}
                  onChange={(e) => handleField("notes", e.target.value)}
                  placeholder="Any notes about this executive..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setEditingExec(null); setFormState(null); }}
              data-testid="button-cancel-edit"
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#FF385C] hover:bg-[#E23350]"
              onClick={handleSave}
              data-testid="button-save-profile"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EALayout>
  );
}
