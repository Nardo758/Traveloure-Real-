"use client"

import { useState } from "react"
import { AppSidebar } from "../../../components/app-sidebar"
import { Button } from "../../../components/ui/button"
import { Card, CardContent } from "../../../components/ui/card"
import { Menu, X, FileText } from "lucide-react"
import { Navbar } from "../../../components/help-me-decide/navbar"

export default function BusinessProfilePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Mobile Sidebar Overlay */}
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

      {/* Main Layout */}
      <div className="flex min-h-screen">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block w-64 bg-white border-r border-gray-200">
          <AppSidebar />
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mb-4 border border-gray-300"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Page Content */}
          <div className="max-w-4xl mx-auto">
            <div className="text-center py-20">
              <div className="mx-auto w-24 h-24 bg-gradient-to-br from-[#FF385C] to-[#BE35EB] rounded-full flex items-center justify-center mb-8">
                <FileText className="w-12 h-12 text-white" />
              </div>
              
              <h1 className="text-4xl font-bold text-gray-900 mb-4">Business Profile</h1>
              <p className="text-xl text-gray-600 mb-8">
                This page is currently under construction
              </p>
              
              <Card className="max-w-md mx-auto">
                <CardContent className="p-8">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Coming Soon</h3>
                    <p className="text-gray-600 mb-4">
                      Manage your business profile, contact information, and service details.
                    </p>
                    <div className="bg-gray-100 rounded-lg p-4">
                      <p className="text-sm text-gray-500">
                        🚧 Under Development 🚧
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}