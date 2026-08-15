import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Building2, 
  Calendar, 
  DollarSign, 
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Phone,
  Mail,
  MessageSquare,
  Plus,
  ExternalLink,
  Download,
  Bell
} from "lucide-react";

export interface Vendor {
  id: string;
  name: string;
  category: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  contractStatus: "none" | "pending" | "signed" | "expired";
  contractUrl?: string;
  contractExpiresAt?: Date;
  totalAmount: number;
  depositAmount: number;
  depositPaid: boolean;
  depositDueDate?: Date;
  finalPaymentDue?: Date;
  paymentSchedule: PaymentMilestone[];
  notes?: string;
  rating?: number;
  isConfirmed: boolean;
}

export interface PaymentMilestone {
  id: string;
  description: string;
  amount: number;
  dueDate: Date;
  status: "pending" | "paid" | "overdue";
  paidDate?: Date;
}

export interface VendorCommunication {
  id: string;
  vendorId: string;
  vendorName: string;
  type: "email" | "phone" | "message" | "meeting";
  subject: string;
  content: string;
  timestamp: Date;
  isIncoming: boolean;
}

interface VendorManagementProps {
  experienceId: string;
  experienceName: string;
  vendors: Vendor[];
  communications: VendorCommunication[];
  onAddVendor?: (vendor: Partial<Vendor>) => void;
  onUpdateVendor?: (vendorId: string, updates: Partial<Vendor>) => void;
  onRecordPayment?: (vendorId: string, milestoneId: string) => void;
  onSendReminder?: (vendorId: string, type: "deposit" | "payment" | "contract") => void;
  onLogCommunication?: (vendorId: string, comm: Partial<VendorCommunication>) => void;
}

export function VendorManagement({
  experienceName,
  vendors,
  communications,
  onAddVendor,
  onRecordPayment,
  onSendReminder,
}: VendorManagementProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  const totalBudget = vendors.reduce((sum, v) => sum + v.totalAmount, 0);
  const totalPaid = vendors.reduce((sum, v) => {
    const paidMilestones = v.paymentSchedule.filter(p => p.status === "paid");
    return sum + paidMilestones.reduce((s, p) => s + p.amount, 0);
  }, 0);
  const totalPending = totalBudget - totalPaid;
  const paymentProgress = totalBudget > 0 ? (totalPaid / totalBudget) * 100 : 0;

  const confirmedVendors = vendors.filter(v => v.isConfirmed).length;
  const pendingContracts = vendors.filter(v => v.contractStatus === "pending").length;
  const overduePayments = vendors.flatMap(v => v.paymentSchedule.filter(p => p.status === "overdue")).length;

  const upcomingPayments = vendors
    .flatMap(v => v.paymentSchedule.filter(p => p.status === "pending").map(p => ({ vendor: v, payment: p })))
    .sort((a, b) => new Date(a.payment.dueDate).getTime() - new Date(b.payment.dueDate).getTime())
    .slice(0, 5);

  const getContractBadge = (status: Vendor["contractStatus"]) => {
    switch (status) {
      case "signed":
        return <Badge variant="default" className="bg-green-600" data-testid="badge-contract-signed"><CheckCircle className="w-3 h-3 mr-1" />Signed</Badge>;
      case "pending":
        return <Badge variant="secondary" className="bg-amber-500" data-testid="badge-contract-pending"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "expired":
        return <Badge variant="destructive" data-testid="badge-contract-expired"><AlertTriangle className="w-3 h-3 mr-1" />Expired</Badge>;
      default:
        return <Badge variant="outline" data-testid="badge-contract-none">No Contract</Badge>;
    }
  };

  const getDaysUntil = (date: Date) => {
    const now = new Date();
    const diff = new Date(date).getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const selectedVendor = vendors.find(v => v.id === selectedVendorId);
  const vendorComms = communications.filter(c => c.vendorId === selectedVendorId);

  return (
    <Card className="w-full" data-testid="card-vendor-management">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2" data-testid="text-vendor-title">
            <Building2 className="h-5 w-5" />
            Vendor Management
          </CardTitle>
          <CardDescription data-testid="text-vendor-description">
            Track contracts, payments, and communications for {experienceName}
          </CardDescription>
        </div>
        <Button onClick={() => onAddVendor?.({})} data-testid="button-add-vendor">
          <Plus className="w-4 h-4 mr-2" />
          Add Vendor
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4" data-testid="tabs-vendor">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Building2 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="contracts" data-testid="tab-contracts">
              <FileText className="w-4 h-4 mr-2" />
              Contracts
            </TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">
              <DollarSign className="w-4 h-4 mr-2" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="communication" data-testid="tab-communication">
              <MessageSquare className="w-4 h-4 mr-2" />
              Communication
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-4 gap-4">
              <Card data-testid="card-total-vendors">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{vendors.length}</div>
                  <p className="text-sm text-muted-foreground">Total Vendors</p>
                </CardContent>
              </Card>
              <Card data-testid="card-confirmed-vendors">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-green-600">{confirmedVendors}</div>
                  <p className="text-sm text-muted-foreground">Confirmed</p>
                </CardContent>
              </Card>
              <Card data-testid="card-pending-contracts">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-amber-600">{pendingContracts}</div>
                  <p className="text-sm text-muted-foreground">Pending Contracts</p>
                </CardContent>
              </Card>
              <Card data-testid="card-overdue-payments">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-red-600">{overduePayments}</div>
                  <p className="text-sm text-muted-foreground">Overdue Payments</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Payment Progress</span>
                <span className="font-medium">${totalPaid.toLocaleString()} / ${totalBudget.toLocaleString()}</span>
              </div>
              <Progress value={paymentProgress} className="h-3" data-testid="progress-vendor-payments" />
            </div>

            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {vendors.map((vendor) => (
                  <div 
                    key={vendor.id}
                    className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover-elevate"
                    onClick={() => setSelectedVendorId(vendor.id)}
                    data-testid={`row-vendor-${vendor.id}`}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{vendor.name}</p>
                        <p className="text-sm text-muted-foreground">{vendor.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-medium">${vendor.totalAmount.toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">
                          {vendor.depositPaid ? "Deposit Paid" : "Deposit Due"}
                        </p>
                      </div>
                      {getContractBadge(vendor.contractStatus)}
                      {vendor.isConfirmed && (
                        <Badge variant="default" className="bg-green-600">Confirmed</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="contracts" className="space-y-4 mt-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {vendors.map((vendor) => (
                  <Card key={vendor.id} data-testid={`card-contract-${vendor.id}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium">{vendor.name}</p>
                            <p className="text-sm text-muted-foreground">{vendor.category}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getContractBadge(vendor.contractStatus)}
                          {vendor.contractUrl && (
                            <Button variant="ghost" size="sm" data-testid={`button-download-contract-${vendor.id}`}>
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {vendor.contractExpiresAt && (
                        <div className="mt-2 flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span>
                            Expires: {new Date(vendor.contractExpiresAt).toLocaleDateString()}
                            {getDaysUntil(vendor.contractExpiresAt) <= 30 && (
                              <Badge variant="secondary" className="ml-2 bg-amber-500">
                                {getDaysUntil(vendor.contractExpiresAt)} days left
                              </Badge>
                            )}
                          </span>
                        </div>
                      )}
                      {vendor.contractStatus === "pending" && onSendReminder && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          onClick={() => onSendReminder(vendor.id, "contract")}
                          data-testid={`button-remind-contract-${vendor.id}`}
                        >
                          <Bell className="w-4 h-4 mr-2" />
                          Send Reminder
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4 mt-4">
            <Card data-testid="card-payment-summary">
              <CardHeader>
                <CardTitle className="text-base">Payment Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Total Contract Value</span>
                    <span className="font-medium">${totalBudget.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Amount Paid</span>
                    <span className="font-medium">${totalPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-amber-600">
                    <span>Amount Pending</span>
                    <span className="font-medium">${totalPending.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-upcoming-payments">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Upcoming Payments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {upcomingPayments.length > 0 ? (
                    upcomingPayments.map(({ vendor, payment }) => (
                      <div 
                        key={payment.id}
                        className="flex items-center justify-between p-2 rounded-lg border"
                        data-testid={`row-upcoming-payment-${payment.id}`}
                      >
                        <div>
                          <p className="font-medium">{vendor.name}</p>
                          <p className="text-sm text-muted-foreground">{payment.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="font-medium">${payment.amount.toLocaleString()}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(payment.dueDate).toLocaleDateString()}
                            </p>
                          </div>
                          {getDaysUntil(payment.dueDate) <= 7 && (
                            <Badge variant="destructive">
                              {getDaysUntil(payment.dueDate)} days
                            </Badge>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => onRecordPayment?.(vendor.id, payment.id)}
                            data-testid={`button-mark-paid-${payment.id}`}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Mark Paid
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No upcoming payments</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {vendors.map((vendor) => (
                  <Card key={vendor.id} data-testid={`card-vendor-payments-${vendor.id}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium">{vendor.name}</p>
                        <span className="text-sm font-medium">${vendor.totalAmount.toLocaleString()}</span>
                      </div>
                      <div className="space-y-1">
                        {vendor.paymentSchedule.map((payment) => (
                          <div 
                            key={payment.id}
                            className="flex items-center justify-between text-sm py-1"
                            data-testid={`row-payment-schedule-${payment.id}`}
                          >
                            <span className="text-muted-foreground" data-testid={`text-payment-desc-${payment.id}`}>{payment.description}</span>
                            <div className="flex items-center gap-2">
                              <span data-testid={`text-payment-amount-${payment.id}`}>${payment.amount.toLocaleString()}</span>
                              {payment.status === "paid" ? (
                                <Badge variant="default" className="bg-green-600">Paid</Badge>
                              ) : payment.status === "overdue" ? (
                                <Badge variant="destructive">Overdue</Badge>
                              ) : (
                                <Badge variant="outline">Due {new Date(payment.dueDate).toLocaleDateString()}</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="communication" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 border rounded-lg p-4">
                <h4 className="font-medium mb-3">Vendors</h4>
                <ScrollArea className="h-[350px]">
                  <div className="space-y-1">
                    {vendors.map((vendor) => (
                      <div
                        key={vendor.id}
                        className={`p-2 rounded-lg cursor-pointer ${selectedVendorId === vendor.id ? 'bg-primary/10' : 'hover-elevate'}`}
                        onClick={() => setSelectedVendorId(vendor.id)}
                        data-testid={`list-vendor-${vendor.id}`}
                        role="button"
                        tabIndex={0}
                      >
                        <p className="font-medium text-sm">{vendor.name}</p>
                        <p className="text-xs text-muted-foreground">{vendor.category}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="col-span-2 border rounded-lg p-4">
                {selectedVendor ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{selectedVendor.name}</h4>
                        <p className="text-sm text-muted-foreground">{selectedVendor.category}</p>
                      </div>
                      <div className="flex gap-2">
                        {selectedVendor.email && (
                          <Button variant="outline" size="sm" data-testid="button-email-vendor">
                            <Mail className="w-4 h-4 mr-1" />
                            Email
                          </Button>
                        )}
                        {selectedVendor.phone && (
                          <Button variant="outline" size="sm" data-testid="button-call-vendor">
                            <Phone className="w-4 h-4 mr-1" />
                            Call
                          </Button>
                        )}
                        {selectedVendor.website && (
                          <Button variant="outline" size="sm" data-testid="button-website-vendor">
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Website
                          </Button>
                        )}
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h5 className="text-sm font-medium mb-2">Contact Info</h5>
                      <div className="space-y-1 text-sm">
                        {selectedVendor.contactName && <p>Contact: {selectedVendor.contactName}</p>}
                        {selectedVendor.email && <p>Email: {selectedVendor.email}</p>}
                        {selectedVendor.phone && <p>Phone: {selectedVendor.phone}</p>}
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h5 className="text-sm font-medium mb-2">Communication Log</h5>
                      <ScrollArea className="h-[200px]">
                        <div className="space-y-2">
                          {vendorComms.length > 0 ? (
                            vendorComms.map((comm) => (
                              <div 
                                key={comm.id}
                                className={`p-2 rounded-lg border ${comm.isIncoming ? 'bg-muted/50' : ''}`}
                                data-testid={`row-communication-${comm.id}`}
                              >
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {comm.type === "email" && <Mail className="w-3 h-3" />}
                                  {comm.type === "phone" && <Phone className="w-3 h-3" />}
                                  {comm.type === "message" && <MessageSquare className="w-3 h-3" />}
                                  <span>{comm.isIncoming ? "Received" : "Sent"}</span>
                                  <span data-testid={`text-comm-time-${comm.id}`}>{new Date(comm.timestamp).toLocaleString()}</span>
                                </div>
                                <p className="font-medium text-sm mt-1" data-testid={`text-comm-subject-${comm.id}`}>{comm.subject}</p>
                                <p className="text-sm text-muted-foreground" data-testid={`text-comm-content-${comm.id}`}>{comm.content}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">No communication logged</p>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Select a vendor to view communication
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
