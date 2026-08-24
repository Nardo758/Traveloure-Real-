"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LocalExpertSidebar } from '../../../components/local-expert/LocalExpertSidebar'
import { useLocalExpert } from '../../../hooks/useLocalExpert'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Navbar } from '../../../components/help-me-decide/navbar'
import { 
  CalendarDays,
  Construction,
  Plus,
  Menu
} from 'lucide-react'

export default function LocalExpertServicesPage() {
  const { isLocalExpert, isLoading, isAuthenticated } = useLocalExpert()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    if (!isLocalExpert) {
      router.push('/dashboard')
    }
  }, [isLocalExpert, isLoading, isAuthenticated, router])

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-[#fcfbfa]">
        <Navbar />
        <div className="flex justify-center items-center flex-1">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
        </div>
      </div>
    )
  }

  if (!isLocalExpert) {
    return null
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Navbar */}
      <Navbar />
      
      {/* Main Content with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Local Expert Sidebar */}
        <LocalExpertSidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          {/* Mobile Menu Toggle Button - Only visible on mobile */}
          <div className="lg:hidden absolute top-4 right-4 z-30">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="bg-white shadow-md"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
              {/* Page Header */}
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">All Services</h1>
                  <p className="text-gray-600">Manage your travel services and offerings.</p>
                </div>
                <Button className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add New Service
                </Button>
              </div>

              {/* Under Construction Content */}
              <Card className="max-w-2xl mx-auto">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                    <Construction className="h-8 w-8 text-yellow-600" />
                  </div>
                  <CardTitle className="text-2xl font-bold text-gray-900">Under Construction</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <p className="text-gray-600 mb-6">
                    The All Services page is currently being developed. This page will allow you to:
                  </p>
                  <div className="space-y-3 text-left max-w-md mx-auto">
                    <div className="flex items-center gap-3">
                      <CalendarDays className="h-5 w-5 text-pink-500" />
                      <span className="text-gray-700">Create and manage your travel services</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CalendarDays className="h-5 w-5 text-pink-500" />
                      <span className="text-gray-700">Set pricing and availability</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CalendarDays className="h-5 w-5 text-pink-500" />
                      <span className="text-gray-700">Upload photos and descriptions</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CalendarDays className="h-5 w-5 text-pink-500" />
                      <span className="text-gray-700">Track service performance</span>
                    </div>
                  </div>
                  <div className="mt-8">
                    <Button variant="outline" onClick={() => router.push('/local-expert/dashboard')}>
                      Back to Dashboard
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
