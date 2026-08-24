// corrected code for responsiveness and structure
"use client";

import { useState } from "react";
import { useIsMobile } from "../../../hooks/use-mobile";
import { AppSidebar } from "../../../components/app-sidebar";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  Menu,
  X,
  Plane,
  Car,
  Building,
  Train,
  UtensilsCrossed,
  Ship,
  Bus,
  Search,
} from "lucide-react";
import { Navbar } from "../../../components/help-me-decide/navbar";
import { useSelector } from "react-redux";

export default function ServicesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userinfo = useSelector((state) => state?.auth?.profile?.data?.[0] || {});

  // Only show Hotel and Car Rental cards for now
  const services = [
    { icon: Car, name: "Car Rental", type: "car" },
    { icon: Plane, name: "Flight Booking", type: "flight" },
    // { icon: Train, name: "Train", href: "#" },
    // { icon: UtensilsCrossed, name: "Restaurant", href: "#" },
    // { icon: Ship, name: "Cruise or Ferry", href: "#" },
    // { icon: Bus, name: "Bus Service", href: "#" },
  ];

  const [selectedServiceType, setSelectedServiceType] = useState("car");

  // Aggregate all hotels and car rentals from all trips
  const allHotels = (userinfo.trips_with_services || []).flatMap(trip => trip.hotels || []);
  const allServices = (userinfo.trips_with_services || []).flatMap(trip => trip.services || []);
  const hotelData = allHotels;
  const carRentalData = allServices.filter(s => s.service_type === "car" || s.service_type === "transport");
  const flightData = allServices.filter(s => s.service_type === "flight");



  return (
    <div className="min-h-screen bg-[#fcfcfd]">
      <Navbar />

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">Menu</h2>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <AppSidebar onItemClick={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-12">
        <div className="hidden lg:block lg:col-span-2 bg-white border-r border-gray-200">
          <AppSidebar />
        </div>

        <div className="lg:col-span-10 p-4 lg:p-6 w-full">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mb-4 border border-gray-300"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Services</h1>

            <Card className="p-6 mb-8 bg-white rounded-xl border border-gray-200 shadow-none">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Book Your Services</h2>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {services.map((service) => (
                  <div
                    key={service.name}
                    onClick={() => setSelectedServiceType(service.type)}
                    className={`flex flex-col items-center justify-center bg-[#fafbfc] border border-gray-200 rounded-lg py-6 px-2 hover:shadow transition-shadow cursor-pointer ${selectedServiceType === service.type ? 'ring-2 ring-[#FF385C]' : ''}`}
                                     >
                    <service.icon className="h-7 w-7 text-gray-500 mb-2" />
                    <span className="text-sm text-gray-700 font-medium text-center">{service.name}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Table for selected service type */}
            <Card className="p-0 bg-white rounded-xl border border-gray-200 shadow-none">
              <div className="p-6 pb-2 flex flex-col md:flex-row md:items-center md:justify-between">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 md:mb-0">
                  {selectedServiceType === "hotel" ? "Hotel Bookings" : 
                   selectedServiceType === "car" ? "Car Rental Bookings" : 
                   selectedServiceType === "flight" ? "Flight Bookings" : "Bookings"}
                </h2>
              </div>
              <div className="overflow-x-auto p-6 pt-2">
                <Table className="w-full border-collapse">
                  <TableBody>
                    {selectedServiceType === "hotel" && hotelData.length > 0 && hotelData.map((hotel, idx) => (
                      <TableRow key={hotel.hotel_id || idx} className="border-b border-gray-100 hover:bg-[#f8f8fa] transition">
                        <TableCell className="py-4 text-gray-500 text-sm align-top">#{idx + 1}</TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Hotel Name:</div>
                          <div className="text-sm text-gray-700">{hotel.name}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Description:</div>
                          <div className="text-sm text-gray-700">{hotel.description}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Price Range:</div>
                          <div className="text-sm text-gray-700">{hotel.price_range}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Rating:</div>
                          <div className="text-sm text-gray-700">{hotel.rating}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Check-in:</div>
                          <div className="text-sm text-gray-700">{hotel.metadata?.check_in_time || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Check-out:</div>
                          <div className="text-sm text-gray-700">{hotel.metadata?.check_out_time || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <a href={hotel.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Website</a>
                        </TableCell>
                      </TableRow>
                    ))}
                    {selectedServiceType === "car" && carRentalData.length > 0 && carRentalData.map((car, idx) => (
                      <TableRow key={car.id || idx} className="border-b border-gray-100 hover:bg-[#f8f8fa] transition">
                        <TableCell className="py-4 text-gray-500 text-sm align-top">#{idx + 1}</TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Service Name:</div>
                          <div className="text-sm text-gray-700">{car.name || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Description:</div>
                          <div className="text-sm text-gray-700">{car.description || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Price Range:</div>
                          <div className="text-sm text-gray-700">{car.price_range || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Service Date:</div>
                          <div className="text-sm text-gray-700">{car.service_date || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Service Time:</div>
                          <div className="text-sm text-gray-700">{car.service_time || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Phone:</div>
                          <div className="text-sm text-gray-700">{car.metadata?.phone || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <a href={car.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Website</a>
                        </TableCell>
                      </TableRow>
                    ))}
                    {selectedServiceType === "flight" && flightData.length > 0 && flightData.map((flight, idx) => (
                      <TableRow key={flight.id || idx} className="border-b border-gray-100 hover:bg-[#f8f8fa] transition">
                        <TableCell className="py-4 text-gray-500 text-sm align-top">#{idx + 1}</TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Flight Name:</div>
                          <div className="text-sm text-gray-700">{flight.name || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Description:</div>
                          <div className="text-sm text-gray-700">{flight.description || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Price Range:</div>
                          <div className="text-sm text-gray-700">{flight.price_range || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Flight Date:</div>
                          <div className="text-sm text-gray-700">{flight.service_date || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="font-semibold text-sm text-gray-900">Flight Time:</div>
                          <div className="text-sm text-gray-700">{flight.service_time || '-'}</div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <a href={flight.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Website</a>
                        </TableCell>
                      </TableRow>
                    ))}
                    {selectedServiceType === "car" && carRentalData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-400">No car rental bookings found.</TableCell>
                      </TableRow>
                    )}
                    {selectedServiceType === "flight" && flightData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-400">No flight bookings found.</TableCell>
                      </TableRow>
                    )}
                    {selectedServiceType === "hotel" && hotelData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-gray-400">No hotel bookings found.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}