"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useDispatch, useSelector } from 'react-redux'
import { AdminSidebar } from '../../../components/admin/AdminSidebar'
import { AdminHeader } from '../../../components/admin/AdminHeader'
import { useAdmin } from '../../../hooks/useAdmin'
import { 
  fetchFAQs, 
  createFAQ, 
  updateFAQ, 
  deleteFAQ,
  clearError 
} from '../../../app/redux-features/faq/faqSlice'
import { Plus, Edit2, Trash2, Search, X, Save } from 'lucide-react'

export default function AdminFAQs() {
  const { isAdmin, isLoading: adminLoading, isAuthenticated, session } = useAdmin()
  const router = useRouter()
  const dispatch = useDispatch()
  const { data: sessionData } = useSession()
  
  const faqState = useSelector((state) => state.faq)
  const { 
    faqs = [], 
    loading = false, 
    error = null 
  } = faqState || {}
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [faqForm, setFAQForm] = useState({ question: '', answer: '' })
  const [editingFAQ, setEditingFAQ] = useState(null)
  const [editFAQForm, setEditFAQForm] = useState({ question: '', answer: '' })
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [faqToDelete, setFAQToDelete] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Get access token
  const getAccessToken = () => {
    return session?.backendData?.accessToken || 
           session?.backendData?.backendData?.accessToken ||
           sessionData?.backendData?.accessToken ||
           sessionData?.backendData?.backendData?.accessToken ||
           localStorage.getItem('accessToken')
  }

  useEffect(() => {
    if (adminLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    if (!isAdmin) {
      router.push('/dashboard')
      return
    }

    // Fetch FAQs on mount
    const token = getAccessToken()
    if (token) {
      dispatch(fetchFAQs(token))
    }
  }, [isAdmin, adminLoading, isAuthenticated, router, dispatch, session, sessionData])

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        dispatch(clearError())
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, dispatch])

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
  }

  const handleCreateFAQ = async (e) => {
    e.preventDefault()
    if (!faqForm.question.trim() || !faqForm.answer.trim()) {
      return
    }

    const token = getAccessToken()
    if (token) {
      const result = await dispatch(createFAQ({ 
        token, 
        question: faqForm.question.trim(), 
        answer: faqForm.answer.trim() 
      }))
      
      // Only refetch if create was successful (not rejected)
      if (result.type === 'faq/createFAQ/fulfilled') {
        setFAQForm({ question: '', answer: '' })
        setShowCreateForm(false)
        // Refresh FAQs list
        await dispatch(fetchFAQs(token))
      }
    }
  }

  const handleEditFAQ = (faq) => {
    setEditingFAQ(faq)
    setEditFAQForm({ 
      question: faq.question || '', 
      answer: faq.answer || '' 
    })
  }

  const handleUpdateFAQ = async (e) => {
    e.preventDefault()
    if (!editingFAQ || !editFAQForm.question.trim() || !editFAQForm.answer.trim()) {
      return
    }

    const token = getAccessToken()
    if (token) {
      await dispatch(updateFAQ({
        token,
        faqId: editingFAQ.id,
        question: editFAQForm.question.trim(),
        answer: editFAQForm.answer.trim()
      }))
      setEditingFAQ(null)
      setEditFAQForm({ question: '', answer: '' })
      // Refresh FAQs list
      dispatch(fetchFAQs(token))
    }
  }

  const handleDeleteClick = (faq) => {
    setFAQToDelete(faq)
    setShowDeleteModal(true)
  }

  const confirmDeleteFAQ = async () => {
    if (!faqToDelete) return

    const token = getAccessToken()
    if (token) {
      await dispatch(deleteFAQ({ token, faqId: faqToDelete.id }))
      setShowDeleteModal(false)
      setFAQToDelete(null)
      // Refresh FAQs list
      dispatch(fetchFAQs(token))
    }
  }

  // Filter FAQs based on search query
  const filteredFAQs = faqs.filter(faq => {
    const searchLower = searchQuery.toLowerCase()
    return (
      faq.question?.toLowerCase().includes(searchLower) ||
      faq.answer?.toLowerCase().includes(searchLower)
    )
  })

  if (adminLoading || loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#ff2e44' }}></div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  const isModalOpen = showDeleteModal

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Admin Sidebar */}
      {!isModalOpen && <AdminSidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />}
      
      {/* Main Content */}
      <div className={`flex-1 flex flex-col overflow-hidden min-w-0 ${isModalOpen ? 'pointer-events-none' : ''}`}>
        {/* Admin Header */}
        <AdminHeader onMenuToggle={handleMenuToggle} />
        
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto bg-[#fcfbfa] p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            {/* Page Header */}
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                    Manage FAQs
                  </h1>
                  <p className="text-gray-600">
                    Create, update, and manage frequently asked questions
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="px-4 py-2 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  style={{ backgroundColor: '#ff2e44' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d61e35'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ff2e44'}
                >
                  <Plus className="w-4 h-4" />
                  {showCreateForm ? 'Cancel' : 'Add New FAQ'}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {/* Create FAQ Form */}
            {showCreateForm && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <Plus className="w-5 h-5" style={{ color: '#ff2e44' }} />
                  <h2 className="text-xl font-semibold text-gray-900">Create New FAQ</h2>
                </div>
                
                <form onSubmit={handleCreateFAQ} className="space-y-4">
                  <div>
                    <label 
                      htmlFor="question" 
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Question <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="question"
                      value={faqForm.question}
                      onChange={(e) => setFAQForm(prev => ({ ...prev, question: e.target.value }))}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': '#ff2e44' }}
                      onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                      onBlur={(e) => e.target.style.boxShadow = ''}
                      placeholder="Enter the question"
                    />
                  </div>

                  <div>
                    <label 
                      htmlFor="answer" 
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Answer <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="answer"
                      value={faqForm.answer}
                      onChange={(e) => setFAQForm(prev => ({ ...prev, answer: e.target.value }))}
                      required
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent resize-none"
                      style={{ '--tw-ring-color': '#ff2e44' }}
                      onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                      onBlur={(e) => e.target.style.boxShadow = ''}
                      placeholder="Enter the answer"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-2 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={{ backgroundColor: '#ff2e44' }}
                      onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#d61e35')}
                      onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#ff2e44')}
                    >
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Creating...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          Create FAQ
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateForm(false)
                        setFAQForm({ question: '', answer: '' })
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Search and FAQs List */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  FAQs ({filteredFAQs.length})
                </h2>
                
                {/* Search Field */}
                <div className="relative flex-1 sm:max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search FAQs..."
                    className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
                    style={{ '--tw-ring-color': '#ff2e44' }}
                    onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                    onBlur={(e) => e.target.style.boxShadow = ''}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* FAQs Table */}
              {faqs.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg mb-2">No FAQs yet.</p>
                  <p className="text-sm">Click "Add New FAQ" to create your first FAQ.</p>
                </div>
              ) : filteredFAQs.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg mb-2">No FAQs found matching "{searchQuery}"</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-sm text-[#ff2e44] hover:underline"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Question
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Answer
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredFAQs.map((faq) => {
                        const isEditing = editingFAQ?.id === faq.id

                        return (
                          <tr key={faq.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 whitespace-nowrap">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editFAQForm.question}
                                  onChange={(e) => setEditFAQForm(prev => ({ ...prev, question: e.target.value }))}
                                  className="w-full px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2"
                                  style={{ '--tw-ring-color': '#ff2e44' }}
                                  onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                                  onBlur={(e) => e.target.style.boxShadow = ''}
                                  autoFocus
                                />
                              ) : (
                                <div className="text-sm font-medium text-gray-900 max-w-xs truncate" title={faq.question}>
                                  {faq.question}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              {isEditing ? (
                                <textarea
                                  value={editFAQForm.answer}
                                  onChange={(e) => setEditFAQForm(prev => ({ ...prev, answer: e.target.value }))}
                                  className="w-full px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 resize-none"
                                  style={{ '--tw-ring-color': '#ff2e44' }}
                                  onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                                  onBlur={(e) => e.target.style.boxShadow = ''}
                                  rows={3}
                                />
                              ) : (
                                <div className="text-sm text-gray-600 max-w-md line-clamp-2" title={faq.answer}>
                                  {faq.answer}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={handleUpdateFAQ}
                                    className="p-1 text-green-600 hover:text-green-700 transition-colors"
                                    title="Save"
                                  >
                                    <Save className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingFAQ(null)
                                      setEditFAQForm({ question: '', answer: '' })
                                    }}
                                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                    title="Cancel"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleEditFAQ(faq)}
                                    className="p-1 text-gray-400 transition-colors"
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#ff2e44'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
                                    title="Edit FAQ"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteClick(faq)}
                                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                    title="Delete FAQ"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && faqToDelete && (
        <div 
          className="fixed inset-0 bg-gray-300/30 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDeleteModal(false)
              setFAQToDelete(null)
            }
          }}
        >
          <div className="bg-white rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete FAQ</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete this FAQ? This action cannot be undone.
            </p>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-1">Question:</p>
              <p className="text-sm text-gray-600">{faqToDelete.question}</p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setFAQToDelete(null)
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFAQ}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

