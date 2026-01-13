"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { LocalExpertSidebar } from '../../../components/local-expert/LocalExpertSidebar'
import { useLocalExpert } from '../../../hooks/useLocalExpert'
import { Button } from '../../../components/ui/button'
import { Navbar } from '../../../components/help-me-decide/navbar'
import FAQContent from '../../../components/faq/FAQContent'
import { Menu } from 'lucide-react'

export default function LocalExpertFAQsPage() {
  const { isLocalExpert, isLoading, isAuthenticated, session } = useLocalExpert()
  const { data: sessionData } = useSession()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Get access token
  const getAccessToken = () => {
    return session?.backendData?.accessToken || 
           session?.backendData?.backendData?.accessToken ||
           sessionData?.backendData?.accessToken ||
           sessionData?.backendData?.backendData?.accessToken ||
           localStorage.getItem('accessToken')
  }

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
    <div className="flex flex-col h-screen bg-[#fcfbfa]">
      {/* Navbar */}
      <Navbar />
      
      {/* Main Content with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Local Expert Sidebar */}
        <LocalExpertSidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          {/* Mobile Menu Toggle Button */}
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
          <main className="flex-1 overflow-y-auto bg-[#fcfbfa] p-6">
            <FAQContent 
              getAccessToken={getAccessToken}
              isAuthenticated={isAuthenticated && isLocalExpert}
              dashboardPath="/local-expert/dashboard"
            />
          </main>
        </div>
      </div>
    </div>
  )
}
