import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  ShieldAlert, 
  Phone, 
  Hospital,
  Building,
  Cloud,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Clock,
  CheckCircle,
  Globe,
  HeartPulse,
  Shield,
  FileText,
  UserCheck,
  Plane,
  CalendarX
} from "lucide-react";

export interface EmergencyContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  available24h: boolean;
  languages: string[];
  specializations?: string[];
}

export interface MedicalFacility {
  id: string;
  name: string;
  type: "hospital" | "clinic" | "pharmacy" | "emergency";
  address: string;
  phone: string;
  distance?: string;
  rating?: number;
  open24h: boolean;
  englishSpeaking: boolean;
  coordinates?: { lat: number; lng: number };
}

export interface EmbassyInfo {
  id: string;
  country: string;
  city: string;
  address: string;
  phone: string;
  emergencyPhone: string;
  email?: string;
  website?: string;
  hours: string;
}

export interface WeatherAlert {
  id: string;
  type: "storm" | "heat" | "cold" | "flood" | "wildfire" | "earthquake" | "other";
  severity: "advisory" | "watch" | "warning" | "emergency";
  title: string;
  description: string;
  affectedAreas: string[];
  startTime: Date;
  endTime?: Date;
  source: string;
}

export interface RebookingOption {
  id: string;
  type: "flight" | "hotel" | "activity" | "transport";
  originalBooking: string;
  status: "available" | "pending" | "confirmed" | "unavailable";
  options: {
    id: string;
    description: string;
    priceDifference: number;
    availability: string;
  }[];
}

interface EmergencyResponseProps {
  experienceId: string;
  experienceName: string;
  destination: string;
  expertContacts: EmergencyContact[];
  medicalFacilities: MedicalFacility[];
  embassies: EmbassyInfo[];
  weatherAlerts: WeatherAlert[];
  rebookingOptions: RebookingOption[];
  onContactExpert?: (contactId: string) => void;
  onRequestRebooking?: (bookingId: string, optionId: string) => void;
  onDismissAlert?: (alertId: string) => void;
}

export function EmergencyResponse({
  experienceName,
  destination,
  expertContacts,
  medicalFacilities,
  embassies,
  weatherAlerts,
  rebookingOptions,
  onContactExpert,
  onRequestRebooking,
}: EmergencyResponseProps) {
  const [activeTab, setActiveTab] = useState("overview");

  const activeAlerts = weatherAlerts.filter(a => {
    const now = new Date();
    return new Date(a.startTime) <= now && (!a.endTime || new Date(a.endTime) >= now);
  });
  
  const criticalAlerts = activeAlerts.filter(a => a.severity === "emergency" || a.severity === "warning");
  const nearbyHospitals = medicalFacilities.filter(f => f.type === "hospital" || f.type === "emergency");
  const available24hContacts = expertContacts.filter(c => c.available24h);

  const getAlertIcon = (type: WeatherAlert["type"]) => {
    switch (type) {
      case "storm": return <Cloud className="w-5 h-5" />;
      case "heat": return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case "cold": return <Cloud className="w-5 h-5 text-blue-500" />;
      case "flood": return <Cloud className="w-5 h-5 text-blue-600" />;
      case "earthquake": return <AlertTriangle className="w-5 h-5" />;
      default: return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const getSeverityBadge = (severity: WeatherAlert["severity"]) => {
    switch (severity) {
      case "emergency": return <Badge variant="destructive">Emergency</Badge>;
      case "warning": return <Badge variant="destructive" className="bg-orange-600">Warning</Badge>;
      case "watch": return <Badge variant="secondary" className="bg-amber-500">Watch</Badge>;
      default: return <Badge variant="outline">Advisory</Badge>;
    }
  };

  return (
    <Card className="w-full" data-testid="card-emergency-response">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2" data-testid="text-emergency-title">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            Emergency Response
          </CardTitle>
          <CardDescription data-testid="text-emergency-description">
            24/7 support, medical facilities, and contingency planning for {experienceName}
          </CardDescription>
        </div>
        {criticalAlerts.length > 0 && (
          <Badge variant="destructive" className="animate-pulse" data-testid="badge-active-alerts">
            <AlertTriangle className="w-4 h-4 mr-1" />
            {criticalAlerts.length} Active Alert{criticalAlerts.length > 1 ? 's' : ''}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {criticalAlerts.length > 0 && (
          <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 mb-4" data-testid="card-critical-alert">
            <CardContent className="pt-4">
              {criticalAlerts.map(alert => (
                <div key={alert.id} className="flex items-start gap-3" data-testid={`row-critical-alert-${alert.id}`}>
                  {getAlertIcon(alert.type)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {getSeverityBadge(alert.severity)}
                      <span className="font-medium" data-testid={`text-critical-alert-title-${alert.id}`}>{alert.title}</span>
                    </div>
                    <p className="text-sm mt-1" data-testid={`text-critical-alert-description-${alert.id}`}>{alert.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Affected: {alert.affectedAreas.join(", ")}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-4 gap-4 mb-4">
          <Card data-testid="card-24h-contacts">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{available24hContacts.length}</div>
              <p className="text-sm text-muted-foreground">24/7 Contacts</p>
            </CardContent>
          </Card>
          <Card data-testid="card-nearby-hospitals">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{nearbyHospitals.length}</div>
              <p className="text-sm text-muted-foreground">Nearby Hospitals</p>
            </CardContent>
          </Card>
          <Card data-testid="card-embassy-count">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{embassies.length}</div>
              <p className="text-sm text-muted-foreground">Embassies</p>
            </CardContent>
          </Card>
          <Card data-testid="card-alert-count">
            <CardContent className="pt-4">
              <div className={`text-2xl font-bold ${activeAlerts.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {activeAlerts.length}
              </div>
              <p className="text-sm text-muted-foreground">Active Alerts</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5" data-testid="tabs-emergency">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <ShieldAlert className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="contacts" data-testid="tab-contacts">
              <Phone className="w-4 h-4 mr-2" />
              Contacts
            </TabsTrigger>
            <TabsTrigger value="medical" data-testid="tab-medical">
              <Hospital className="w-4 h-4 mr-2" />
              Medical
            </TabsTrigger>
            <TabsTrigger value="embassy" data-testid="tab-embassy">
              <Building className="w-4 h-4 mr-2" />
              Embassy
            </TabsTrigger>
            <TabsTrigger value="rebooking" data-testid="tab-rebooking">
              <RefreshCw className="w-4 h-4 mr-2" />
              Rebooking
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <Card data-testid="card-quick-actions">
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <Card 
                    className="cursor-pointer hover-elevate bg-destructive text-destructive-foreground"
                    data-testid="button-emergency-call"
                    role="button"
                    tabIndex={0}
                  >
                    <CardContent className="pt-4 text-center">
                      <Phone className="w-6 h-6 mx-auto mb-1" />
                      <span className="block font-medium">Emergency Call</span>
                      <span className="text-xs opacity-80">Local: 911</span>
                    </CardContent>
                  </Card>
                  <Card 
                    className="cursor-pointer hover-elevate"
                    data-testid="button-contact-expert"
                    role="button"
                    tabIndex={0}
                  >
                    <CardContent className="pt-4 text-center">
                      <UserCheck className="w-6 h-6 mx-auto mb-1" />
                      <span className="block font-medium">Contact Expert</span>
                      <span className="text-xs text-muted-foreground">24/7 Available</span>
                    </CardContent>
                  </Card>
                  <Card 
                    className="cursor-pointer hover-elevate"
                    data-testid="button-find-hospital"
                    role="button"
                    tabIndex={0}
                  >
                    <CardContent className="pt-4 text-center">
                      <Hospital className="w-6 h-6 mx-auto mb-1" />
                      <span className="block font-medium">Find Hospital</span>
                      <span className="text-xs text-muted-foreground">{nearbyHospitals.length} nearby</span>
                    </CardContent>
                  </Card>
                  <Card 
                    className="cursor-pointer hover-elevate"
                    data-testid="button-embassy-contact"
                    role="button"
                    tabIndex={0}
                  >
                    <CardContent className="pt-4 text-center">
                      <Globe className="w-6 h-6 mx-auto mb-1" />
                      <span className="block font-medium">Embassy</span>
                      <span className="text-xs text-muted-foreground">Consular services</span>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-safety-checklist">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Safety Checklist
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Travel insurance documents saved</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Emergency contacts added</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Passport copy stored</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Medical info on file</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {activeAlerts.length > 0 && (
              <Card data-testid="card-weather-alerts">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cloud className="w-4 h-4" />
                    Weather Alerts for {destination}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {activeAlerts.map(alert => (
                      <div 
                        key={alert.id}
                        className="flex items-start gap-3 p-3 rounded-lg border"
                        data-testid={`row-alert-${alert.id}`}
                      >
                        {getAlertIcon(alert.type)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {getSeverityBadge(alert.severity)}
                            <span className="font-medium" data-testid={`text-alert-title-${alert.id}`}>{alert.title}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1" data-testid={`text-alert-description-${alert.id}`}>{alert.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="space-y-4 mt-4">
            <Card data-testid="card-24h-experts">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  24/7 Expert Support
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {expertContacts.map(contact => (
                      <div 
                        key={contact.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        data-testid={`row-contact-${contact.id}`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium" data-testid={`text-contact-name-${contact.id}`}>{contact.name}</p>
                            {contact.available24h && (
                              <Badge variant="default" className="bg-green-600">24/7</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground" data-testid={`text-contact-role-${contact.id}`}>{contact.role}</p>
                          <div className="flex gap-1 mt-1">
                            {contact.languages.map(lang => (
                              <Badge key={lang} variant="outline" className="text-xs">{lang}</Badge>
                            ))}
                          </div>
                        </div>
                        <Button 
                          onClick={() => onContactExpert?.(contact.id)}
                          data-testid={`button-call-${contact.id}`}
                        >
                          <Phone className="w-4 h-4 mr-2" />
                          Call
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="medical" className="space-y-4 mt-4">
            <Card data-testid="card-medical-facilities">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <HeartPulse className="w-4 h-4" />
                  Nearby Medical Facilities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[350px]">
                  <div className="space-y-3">
                    {medicalFacilities.map(facility => (
                      <div 
                        key={facility.id}
                        className="p-3 rounded-lg border"
                        data-testid={`row-facility-${facility.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Hospital className="w-4 h-4 text-red-500" />
                              <p className="font-medium" data-testid={`text-facility-name-${facility.id}`}>{facility.name}</p>
                              {facility.open24h && (
                                <Badge variant="default" className="bg-green-600">24h</Badge>
                              )}
                            </div>
                            <Badge variant="outline" className="mt-1 capitalize" data-testid={`badge-facility-type-${facility.id}`}>{facility.type}</Badge>
                          </div>
                          {facility.distance && (
                            <span className="text-sm text-muted-foreground" data-testid={`text-facility-distance-${facility.id}`}>{facility.distance}</span>
                          )}
                        </div>
                        <div className="mt-2 space-y-1 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            <span data-testid={`text-facility-address-${facility.id}`}>{facility.address}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            <span data-testid={`text-facility-phone-${facility.id}`}>{facility.phone}</span>
                          </div>
                          {facility.englishSpeaking && (
                            <div className="flex items-center gap-2 text-green-600">
                              <Globe className="w-3 h-3" />
                              <span>English speaking staff</span>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button variant="outline" size="sm" data-testid={`button-call-facility-${facility.id}`}>
                            <Phone className="w-4 h-4 mr-1" />
                            Call
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-directions-${facility.id}`}>
                            <MapPin className="w-4 h-4 mr-1" />
                            Directions
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="embassy" className="space-y-4 mt-4">
            <Card data-testid="card-embassies">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building className="w-4 h-4" />
                  Embassy & Consulate Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[350px]">
                  <div className="space-y-3">
                    {embassies.map(embassy => (
                      <div 
                        key={embassy.id}
                        className="p-3 rounded-lg border"
                        data-testid={`row-embassy-${embassy.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4" />
                          <p className="font-medium" data-testid={`text-embassy-country-${embassy.id}`}>{embassy.country} Embassy</p>
                        </div>
                        <p className="text-sm text-muted-foreground" data-testid={`text-embassy-city-${embassy.id}`}>{embassy.city}</p>
                        <Separator className="my-2" />
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            <span data-testid={`text-embassy-address-${embassy.id}`}>{embassy.address}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            <span data-testid={`text-embassy-phone-${embassy.id}`}>Main: {embassy.phone}</span>
                          </div>
                          <div className="flex items-center gap-2 text-red-600">
                            <Phone className="w-3 h-3" />
                            <span data-testid={`text-embassy-emergency-${embassy.id}`}>Emergency: {embassy.emergencyPhone}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span data-testid={`text-embassy-hours-${embassy.id}`}>{embassy.hours}</span>
                          </div>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button variant="outline" size="sm" data-testid={`button-call-embassy-${embassy.id}`}>
                            <Phone className="w-4 h-4 mr-1" />
                            Call
                          </Button>
                          {embassy.website && (
                            <Button variant="outline" size="sm" data-testid={`button-website-embassy-${embassy.id}`}>
                              <Globe className="w-4 h-4 mr-1" />
                              Website
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rebooking" className="space-y-4 mt-4">
            <Card data-testid="card-rebooking-assistance">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarX className="w-4 h-4" />
                  Rebooking Assistance
                </CardTitle>
                <CardDescription>
                  Get help rebooking affected reservations due to weather or emergencies
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {rebookingOptions.length > 0 ? (
                      rebookingOptions.map(booking => (
                        <div 
                          key={booking.id}
                          className="p-3 rounded-lg border"
                          data-testid={`rebooking-${booking.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {booking.type === "flight" && <Plane className="w-4 h-4" />}
                              {booking.type === "hotel" && <Building className="w-4 h-4" />}
                              <p className="font-medium">{booking.originalBooking}</p>
                            </div>
                            <Badge 
                              variant={booking.status === "available" ? "default" : "secondary"}
                              className={booking.status === "available" ? "bg-green-600" : ""}
                            >
                              {booking.status}
                            </Badge>
                          </div>
                          
                          {booking.options.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-sm font-medium">Available Options:</p>
                              {booking.options.map(option => (
                                <div 
                                  key={option.id}
                                  className="flex items-center justify-between p-2 rounded bg-muted/50"
                                  data-testid={`row-rebooking-option-${option.id}`}
                                >
                                  <div>
                                    <p className="text-sm">{option.description}</p>
                                    <p className="text-xs text-muted-foreground">{option.availability}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-medium ${option.priceDifference > 0 ? 'text-red-600' : option.priceDifference < 0 ? 'text-green-600' : ''}`}>
                                      {option.priceDifference > 0 ? '+' : ''}{option.priceDifference === 0 ? 'Same price' : `$${Math.abs(option.priceDifference)}`}
                                    </span>
                                    <Button 
                                      size="sm"
                                      onClick={() => onRequestRebooking?.(booking.id, option.id)}
                                      data-testid={`button-rebook-${option.id}`}
                                    >
                                      Select
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
                        <p className="font-medium">No Rebooking Needed</p>
                        <p className="text-sm text-muted-foreground">All your reservations are on track!</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
