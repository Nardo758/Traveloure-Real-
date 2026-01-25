import { useState } from "react";
import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Edit,
  Trash2,
  DollarSign,
  Clock,
  Star,
  FileText,
  Plane,
  Heart,
  Gift,
  PartyPopper,
  Briefcase,
  Users,
  MapPin,
  Search,
  Filter,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const contractCategories = [
  {
    id: 1,
    name: "Vacation Planning",
    description: "Full-service vacation planning and booking",
    icon: Plane,
    contracts: 24,
    revenue: 12500,
    avgRating: 4.9,
    active: true,
    subCategories: ["Beach Getaways", "City Breaks", "Adventure Trips"],
    commissionRate: 15,
  },
  {
    id: 2,
    name: "Romantic Events",
    description: "Proposals, anniversaries, and honeymoons",
    icon: Heart,
    contracts: 18,
    revenue: 28000,
    avgRating: 5.0,
    active: true,
    subCategories: ["Proposals", "Honeymoons", "Anniversaries"],
    commissionRate: 18,
  },
  {
    id: 3,
    name: "Celebrations",
    description: "Birthday parties and special occasions",
    icon: Gift,
    contracts: 12,
    revenue: 8500,
    avgRating: 4.8,
    active: true,
    subCategories: ["Birthdays", "Reunions", "Graduations"],
    commissionRate: 12,
  },
  {
    id: 4,
    name: "Group Events",
    description: "Bachelor/bachelorette parties and group trips",
    icon: PartyPopper,
    contracts: 8,
    revenue: 15000,
    avgRating: 4.7,
    active: false,
    subCategories: ["Bachelor Parties", "Bachelorette Parties", "Group Adventures"],
    commissionRate: 14,
  },
  {
    id: 5,
    name: "Corporate",
    description: "Business travel and corporate retreats",
    icon: Briefcase,
    contracts: 5,
    revenue: 45000,
    avgRating: 4.9,
    active: true,
    subCategories: ["Retreats", "Conferences", "Team Building"],
    commissionRate: 20,
  },
];

const recentContracts = [
  {
    id: 1,
    client: "Sarah & Mike",
    category: "Romantic Events",
    type: "Honeymoon Planning",
    value: 4500,
    status: "active",
    dueDate: "Feb 15, 2026",
  },
  {
    id: 2,
    client: "Tech Innovations Inc",
    category: "Corporate",
    type: "Retreat Planning",
    value: 15000,
    status: "pending",
    dueDate: "Mar 1, 2026",
  },
  {
    id: 3,
    client: "Johnson Family",
    category: "Celebrations",
    type: "50th Birthday",
    value: 2800,
    status: "completed",
    dueDate: "Jan 5, 2026",
  },
  {
    id: 4,
    client: "Adventure Seekers Group",
    category: "Vacation Planning",
    type: "Safari Trip",
    value: 8200,
    status: "active",
    dueDate: "Apr 10, 2026",
  },
];

export default function ContractCategories() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  const filteredCategories = contractCategories.filter((cat) => {
    const matchesSearch = cat.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesActive = showActiveOnly ? cat.active : true;
    return matchesSearch && matchesActive;
  });

  const totalContracts = contractCategories.reduce((sum, cat) => sum + cat.contracts, 0);
  const totalRevenue = contractCategories.reduce((sum, cat) => sum + cat.revenue, 0);
  const activeCategories = contractCategories.filter((cat) => cat.active).length;

  return (
    <ExpertLayout title="Contract Categories">
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-page-title">
              Contract Categories
            </h1>
            <p className="text-gray-600">Manage your service categories and track contracts</p>
          </div>
          <Button className="bg-[#FF385C] " data-testid="button-add-category">
            <Plus className="w-4 h-4 mr-2" />
            Add Category
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#FFE3E8] rounded-lg">
                  <FileText className="w-5 h-5 text-[#FF385C]" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Contracts</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-total-contracts">
                    {totalContracts}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-total-revenue">
                    ${totalRevenue.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Active Categories</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-active-categories">
                    {activeCategories}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Star className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Avg Rating</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-avg-rating">
                    4.9
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={showActiveOnly}
              onCheckedChange={setShowActiveOnly}
              data-testid="switch-active-only"
            />
            <Label className="text-sm text-gray-600">Active only</Label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCategories.map((category) => (
            <Card key={category.id} className={!category.active ? "opacity-60" : ""} data-testid={`card-category-${category.id}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#FFE3E8] rounded-lg">
                      <category.icon className="w-6 h-6 text-[#FF385C]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{category.name}</h3>
                      <p className="text-sm text-gray-600">{category.description}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-menu-${category.id}`}>
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem data-testid={`menu-edit-${category.id}`}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid={`menu-view-${category.id}`}>
                        <FileText className="w-4 h-4 mr-2" />
                        View Contracts
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600" data-testid={`menu-delete-${category.id}`}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-wrap gap-1 mb-4">
                  {category.subCategories.map((sub, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {sub}
                    </Badge>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                  <div>
                    <p className="text-xs text-gray-500">Contracts</p>
                    <p className="font-semibold text-gray-900">{category.contracts}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Revenue</p>
                    <p className="font-semibold text-gray-900">${category.revenue.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Rating</p>
                    <p className="font-semibold text-gray-900 flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      {category.avgRating}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                  <span className="text-sm text-gray-600">
                    {category.commissionRate}% commission
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Active</span>
                    <Switch
                      checked={category.active}
                      data-testid={`switch-active-${category.id}`}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg">Recent Contracts</CardTitle>
            <Button variant="outline" size="sm" data-testid="button-view-all-contracts">
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentContracts.map((contract) => (
                <div
                  key={contract.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  data-testid={`row-contract-${contract.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-white rounded-lg border border-gray-200">
                      <FileText className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{contract.client}</p>
                      <p className="text-sm text-gray-600">
                        {contract.category} - {contract.type}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">${contract.value.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Due: {contract.dueDate}</p>
                    </div>
                    <Badge
                      className={
                        contract.status === "active"
                          ? "bg-green-100 text-green-700"
                          : contract.status === "pending"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-700"
                      }
                    >
                      {contract.status === "active" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                      {contract.status === "pending" && <Clock className="w-3 h-3 mr-1" />}
                      {contract.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
