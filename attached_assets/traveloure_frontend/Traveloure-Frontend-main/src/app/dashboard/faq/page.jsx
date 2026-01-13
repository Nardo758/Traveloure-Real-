"use client"

import { useState } from "react"
import { useIsMobile } from "../../../hooks/use-mobile"
import { AppSidebar } from "../../../components/app-sidebar"
import { Button } from "../../../components/ui/button"
import { Menu, X } from "lucide-react"
import { Navbar } from "../../../components/help-me-decide/navbar"
import FAQContent from "../../../components/faq/FAQContent"
import { useSession } from "next-auth/react"

export default function FAQsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { data: session } = useSession()
  const isMobile = useIsMobile()

  // Get access token
  const getAccessToken = () => {
    return session?.backendData?.accessToken || 
           session?.backendData?.backendData?.accessToken ||
           localStorage.getItem('accessToken')
  }

  return (
    <div className="min-h-screen bg-[#fcfbfa]">
      {/* Header */}
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
      <div className="lg:grid lg:grid-cols-12 lg:gap-0 min-h-[calc(100vh-64px)]">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block lg:col-span-2 bg-white border-r border-gray-200">
          <AppSidebar />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-10 p-6">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mb-4 border border-gray-300"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <FAQContent 
            getAccessToken={getAccessToken}
            isAuthenticated={!!session}
            dashboardPath="/dashboard"
          />
        </div>
      </div>
    </div>
  )
}
