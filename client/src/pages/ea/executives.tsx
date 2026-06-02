import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Calendar,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useState } from "react";

export default function EAExecutives() {
  const [expandedId, setExpandedId] = useState<number | null>(1);

  const executives: Array<{
    id: number; name: string; title: string; status: string;
    email: string; phone: string; activeEvents: number; upcoming: number;
    preferences?: Record<string, string>;
    family?: { spouse?: string; anniversary?: string; children?: string; importantDates?: Array<{ label: string; date: string }> };
    giftHistory?: Array<{ event: string; gift: string; amount: string }>;
    activeEventsList?: Array<{ event: string; status?: string; date: string }>;
    currentTrip?: string; attention?: string;
  }> = [];

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
                        <CardTitle className="text-lg">{exec.name} - {exec.title}</CardTitle>
                        <Badge className="bg-green-100 text-green-700">Active</Badge>
                      </div>
                      <p className="text-sm text-gray-500">
                        Active Events: {exec.activeEvents} | Upcoming: {exec.upcoming}
                        {exec.attention && (
                          <span className="text-yellow-600 ml-2">
                            <AlertCircle className="w-3 h-3 inline mr-1" />
                            {exec.attention}
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

              {expandedId === exec.id && exec.preferences && (
                <CardContent className="border-t border-gray-100 pt-4 space-y-6">
                  {/* Profile Information */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Profile Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <p className="flex items-center gap-2 text-gray-600">
                        <Mail className="w-4 h-4" /> {exec.email}
                      </p>
                      <p className="flex items-center gap-2 text-gray-600">
                        <Phone className="w-4 h-4" /> {exec.phone}
                      </p>
                    </div>
                  </div>

                  {/* Preferences */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Preferences</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <p className="text-gray-600">
                        <span className="flex items-center gap-1"><Plane className="w-4 h-4" /> Travel Class:</span> 
                        {exec.preferences.travelClass}
                      </p>
                      <p className="text-gray-600">
                        <span className="flex items-center gap-1"><Hotel className="w-4 h-4" /> Hotels:</span> 
                        {exec.preferences.hotelBrands}
                      </p>
                      <p className="text-gray-600">
                        <span className="flex items-center gap-1"><Utensils className="w-4 h-4" /> Dietary:</span> 
                        {exec.preferences.dietary}
                      </p>
                      <p className="text-gray-600">Seating: {exec.preferences.seating}</p>
                    </div>
                    {exec.preferences.notes && (
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
                        <p>Spouse: {exec.family.spouse} (Anniversary: {exec.family.anniversary})</p>
                        <p>Children: {exec.family.children}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {exec.family.importantDates.map((date, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {date.label}: {date.date}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Gift History */}
                  {exec.giftHistory && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Gift className="w-4 h-4" /> Gift History
                      </h3>
                      <div className="space-y-2">
                        {exec.giftHistory.map((gift, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded-lg">
                            <div>
                              <span className="font-medium">{gift.event}:</span> {gift.gift}
                            </div>
                            <span className="text-gray-500">{gift.amount}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active Events */}
                  {exec.activeEventsList && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Active Events
                      </h3>
                      <div className="space-y-2">
                        {exec.activeEventsList.map((event, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className={event.status === "URGENT" ? "text-red-600 font-medium" : "text-gray-700"}>
                              {event.event}
                              {event.status && <Badge className="ml-2 bg-red-500 text-white text-xs">{event.status}</Badge>}
                            </span>
                            <span className="text-gray-500">{event.date}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
                    <Button size="sm" variant="outline" data-testid={`button-edit-profile-${exec.id}`}>
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
    </EALayout>
  );
}
