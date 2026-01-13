"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LocalExpertSidebar } from '../../../components/local-expert/LocalExpertSidebar'
import { useLocalExpert } from '../../../hooks/useLocalExpert'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Navbar } from '../../../components/help-me-decide/navbar'
import { 
  MessageSquare, 
  Calendar, 
  Star, 
  TrendingUp, 
  Users, 
  DollarSign,
  Clock,
  CheckCircle,
  Menu
} from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { useSession } from 'next-auth/react'
import { fetchLocalExpertDashboard } from '../../redux-features/local-expert/localExpertSlice'

export default function LocalExpertDashboard() {
  const { isLocalExpert, isLoading, isAuthenticated } = useLocalExpert()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const dispatch = useDispatch()
  const { data: session } = useSession()
  const { dashboard, loading: dashboardLoading } = useSelector(state => state.localExpert)

  useEffect(() => {
   
    if (isLoading) {
      return
    }

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    // Remove the redirect check since /local-expert page already handles this
  }, [isLocalExpert, isLoading, isAuthenticated, router])

  // Fetch dashboard data dynamically
  useEffect(() => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
    if (isAuthenticated && token) {
      dispatch(fetchLocalExpertDashboard({ token }))
    }
  }, [isAuthenticated, session?.backendData?.accessToken, session?.backendData?.backendData?.accessToken, dispatch])

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

  // Dynamic stats from API
  const stats = [
    {
      title: 'Active Contracts',
      value: String(dashboard?.active_contracts ?? 0),
      change: '',
      icon: MessageSquare,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: 'Total Earnings',
      value: `$${Number(dashboard?.total_earnings ?? 0).toLocaleString()}`,
      change: '',
      icon: DollarSign,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      title: 'Average Rating',
      value: String(dashboard?.rating ?? 0),
      change: '',
      icon: Star,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50'
    },
    {
      title: 'Reviews',
      value: String(dashboard?.reviews ?? 0),
      change: '',
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    }
  ]

  const recentActivities = (dashboard?.recent_feedback || []).map((item) => ({
    id: item.id,
    type: 'review',
    message: `${item.rating}★ from ${item.reviewer_username}: ${item.review}`,
    time: new Date(item.created_at).toLocaleString(),
    icon: Star,
    color: 'text-yellow-600'
  }))

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
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Local Expert Dashboard</h1>
              <p className="text-gray-600">Welcome back! Here's what's happening with your expert services.</p>
            </div>

            {/* Stats Grid (loading aware) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {stats.map((stat, index) => {
                const Icon = stat.icon
                return (
                  <Card key={index} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                          <p className="text-2xl font-bold text-gray-900">{dashboardLoading ? '—' : stat.value}</p>
                          {/* dynamic only; no static change text */}
                        </div>
                        <div className={`p-3 rounded-full ${stat.bgColor}`}>
                          <Icon className={`h-6 w-6 ${stat.color}`} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Recent Activities and Active Contracts - full width */}
            <div className="space-y-6">
              {/* Recent Activities */}
              <div>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Recent Activities
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(recentActivities.length ? recentActivities : []).map((activity) => {
                        const Icon = activity.icon
                        return (
                          <div key={activity.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                            <div className={`p-2 rounded-full bg-gray-100`}>
                              <Icon className={`h-4 w-4 ${activity.color}`} />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{activity.message}</p>
                              <p className="text-xs text-gray-500">{activity.time}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Active Contracts */}
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Active Contracts ({dashboard?.active_contracts ?? 0})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(dashboard?.list_active_contracts || []).length === 0 ? (
                        <p className="text-sm text-gray-500">No active contracts.</p>
                      ) : (
                        (dashboard?.list_active_contracts || []).map((c) => (
                          <div key={c.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm text-gray-500 mb-1">{new Date(c.created_at).toLocaleString()}</p>
                                <h4 className="font-semibold text-gray-900 truncate">{c.title}</h4>
                                <p className="text-sm text-gray-600">{c.trip_to}</p>
                                <p className="text-sm text-gray-700 mt-2 line-clamp-2">{c.description}</p>
                                <div className="flex flex-wrap items-center gap-3 mt-3">
                                  <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700">{c.status}</span>
                                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">${Number(c.amount).toLocaleString()}</span>
                                  {c.is_paid ? (
                                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Paid</span>
                                  ) : (
                                    <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">Unpaid</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col gap-2 shrink-0">
                                {/* Local expert cannot pay here */}
                               
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-600">
                              <span>For: {c.created_by?.first_name} {c.created_by?.last_name} ({c.created_by?.username})</span>
                              <span>By: {c.created_for?.first_name} {c.created_for?.last_name} ({c.created_for?.username})</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* no right column; content uses full width */}
            </div>
          </div>
        </main>
        </div>
      </div>
    </div>
  )
}