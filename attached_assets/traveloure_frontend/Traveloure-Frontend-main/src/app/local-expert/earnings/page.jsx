"use client"

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useDispatch, useSelector } from 'react-redux'
import { LocalExpertSidebar } from '../../../components/local-expert/LocalExpertSidebar'
import { useLocalExpert } from '../../../hooks/useLocalExpert'
import { Card, CardContent } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Navbar } from '../../../components/help-me-decide/navbar'
import { fetchLocalExpertEarnings, clearEarningsError } from '../../../app/redux-features/local-expert/localExpertSlice'
import { 
  DollarSign,
  TrendingUp,
  Menu,
  Loader2,
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Trophy
} from 'lucide-react'

export default function LocalExpertEarningsPage() {
  const { isLocalExpert, isLoading, isAuthenticated, session } = useLocalExpert()
  const { data: sessionData } = useSession()
  const router = useRouter()
  const dispatch = useDispatch()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const hasFetchedRef = useRef(false)

  const { earnings, earningsLoading, earningsError } = useSelector(state => state.localExpert)

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

  // Fetch earnings on mount - only once
  useEffect(() => {
    if (isAuthenticated && isLocalExpert && !hasFetchedRef.current) {
      const token = getAccessToken()
      if (token) {
        hasFetchedRef.current = true
        dispatch(fetchLocalExpertEarnings({ token }))
      }
    }
  }, [isAuthenticated, isLocalExpert, dispatch])

  // Clear error after 5 seconds
  useEffect(() => {
    if (earningsError) {
      const timer = setTimeout(() => {
        dispatch(clearEarningsError())
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [earningsError, dispatch])

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
  }

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0)
  }

  // Format month (e.g., "2025-09" -> "September 2025")
  const formatMonth = (monthString) => {
    if (!monthString) return ''
    const [year, month] = monthString.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
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
            <div className="max-w-7xl mx-auto">
              {/* Page Header */}
              <div className="mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
                  Earnings
                </h1>
                <p className="text-gray-600 text-base md:text-lg">
                  Track your income and financial performance
                </p>
              </div>

              {/* Error Message */}
              {earningsError && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                  <div className="flex items-center gap-2 text-red-800">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{earningsError}</p>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {earningsLoading && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
                  <Loader2 className="w-10 h-10 animate-spin text-[#ff2e44] mx-auto mb-4" />
                  <p className="text-gray-600 font-medium">Loading earnings data...</p>
                </div>
              )}

              {/* Earnings Content */}
              {!earningsLoading && earnings && (
                <>
                  {/* Key Metrics Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {/* Total Earnings */}
                    <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-600 mb-1">Total Earnings</p>
                            <p className="text-2xl font-bold text-gray-900">
                              {formatCurrency(earnings.total_earnings)}
                            </p>
                          </div>
                          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                            <DollarSign className="w-6 h-6 text-green-600" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Pending Earnings */}
                    <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-600 mb-1">Pending Earnings</p>
                            <p className="text-2xl font-bold text-[#ff2e44]">
                              {formatCurrency(earnings.pending_earnings)}
                            </p>
                          </div>
                          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                            <Clock className="w-6 h-6 text-orange-600" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* This Month Earnings */}
                    <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-600 mb-1">This Month</p>
                            <p className="text-2xl font-bold text-gray-900">
                              {formatCurrency(earnings.this_month_earnings)}
                            </p>
                          </div>
                          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <Calendar className="w-6 h-6 text-blue-600" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Average Monthly */}
                    <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-600 mb-1">Average Monthly</p>
                            <p className="text-2xl font-bold text-gray-900">
                              {formatCurrency(earnings.average_monthly_earnings)}
                            </p>
                          </div>
                          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                            <TrendingUp className="w-6 h-6 text-purple-600" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    {/* Monthly Comparison */}
                    <Card className="lg:col-span-2 bg-white border border-gray-200 shadow-sm">
                      <CardContent className="p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6">Monthly Comparison</h2>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                <Calendar className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-600">This Month</p>
                                <p className="text-lg font-bold text-gray-900">
                                  {formatCurrency(earnings.this_month_earnings)}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                                <Calendar className="w-5 h-5 text-gray-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-600">Last Month</p>
                                <p className="text-lg font-bold text-gray-900">
                                  {formatCurrency(earnings.last_month_earnings)}
                                </p>
                              </div>
                            </div>
                          </div>
                          {earnings.highest_month_earnings && (
                            <div className="flex items-center justify-between p-4 bg-[#ff2e44]/5 border border-[#ff2e44]/20 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-[#ff2e44]/10 rounded-full flex items-center justify-center">
                                  <Trophy className="w-5 h-5 text-[#ff2e44]" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-600">Highest Month</p>
                                  <p className="text-lg font-bold text-[#ff2e44]">
                                    {formatCurrency(earnings.highest_month_earnings.earnings)}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {formatMonth(earnings.highest_month_earnings.month)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Contracts Summary */}
                    <Card className="bg-white border border-gray-200 shadow-sm">
                      <CardContent className="p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6">Contracts</h2>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <FileText className="w-5 h-5 text-gray-600" />
                              <span className="text-sm font-medium text-gray-600">Total</span>
                            </div>
                            <span className="text-lg font-bold text-gray-900">
                              {earnings.contracts?.total_contracts || 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <CheckCircle className="w-5 h-5 text-green-600" />
                              <span className="text-sm font-medium text-gray-600">Completed</span>
                            </div>
                            <span className="text-lg font-bold text-green-600">
                              {earnings.contracts?.completed_contracts || 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Clock className="w-5 h-5 text-orange-600" />
                              <span className="text-sm font-medium text-gray-600">Pending</span>
                            </div>
                            <span className="text-lg font-bold text-orange-600">
                              {earnings.contracts?.pending_contracts || 0}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Month-wise Earnings */}
                  {earnings.month_wise_earnings && earnings.month_wise_earnings.length > 0 && (
                    <Card className="bg-white border border-gray-200 shadow-sm">
                      <CardContent className="p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6">Month-wise Earnings</h2>
                        <div className="space-y-3">
                          {earnings.month_wise_earnings.map((item, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-[#ff2e44]/10 rounded-lg flex items-center justify-center">
                                  <span className="text-sm font-bold text-[#ff2e44]">
                                    {String(index + 1).padStart(2, '0')}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {formatMonth(item.month)}
                                  </p>
                                </div>
                              </div>
                              <p className="text-lg font-bold text-gray-900">
                                {formatCurrency(item.earnings)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {/* Empty State */}
              {!earningsLoading && !earnings && !earningsError && (
                <Card className="bg-white border border-gray-200 shadow-sm">
                  <CardContent className="p-12 text-center">
                    <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">No Earnings Data</h3>
                    <p className="text-gray-600">
                      Earnings data will appear here once you start earning.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
