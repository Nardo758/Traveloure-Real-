"use client"

import { useState, useEffect } from "react";
import { useTravelExperts } from "../../../hooks/useTravelExperts";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import ProtectedRoute from "../../../components/protectedroutes/ProtectedRoutes";

export default function LocalExpertsDashboard() {
  const {
    Travelexperts,
    currentLocalExpert,
    loading,
    error,
    getAllExperts,
    getExpertById,
    updateExpert,
    clearError
  } = useTravelExperts();

  const [selectedExpertId, setSelectedExpertId] = useState(null);
  const [updateData, setUpdateData] = useState({
    status: '',
    notes: ''
  });

  useEffect(() => {
    // Load all local experts on component mount
    getAllExperts();
  }, [getAllExperts]);

  const handleGetExpertById = async (id) => {
    const result = await getExpertById(id);
    if (result.meta.requestStatus === 'fulfilled') {
      console.log('Expert details:', result.payload);
    }
  };

  const handleUpdateExpert = async (id) => {
    if (updateData.status) {
      const result = await updateExpert(id, updateData);
      if (result.meta.requestStatus === 'fulfilled') {
        setUpdateData({ status: '', notes: '' });
        // Refresh the list
        getAllExperts();
      }
    }
  };

  const handleStatusChange = (status) => {
    setUpdateData(prev => ({ ...prev, status }));
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF385C] mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading local experts...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Local Experts Management</h1>
            <p className="text-gray-600">Manage and review local expert applications</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600">{error}</p>
              <Button 
                onClick={clearError} 
                variant="outline" 
                size="sm" 
                className="mt-2"
              >
                Dismiss
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Local Experts List */}
            <Card>
              <CardHeader>
                <CardTitle>Local Experts ({Travelexperts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Travelexperts.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No local experts found</p>
                  ) : (
                    Travelexperts.map((expert) => (
                      <div 
                        key={expert.id} 
                        className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-semibold text-lg">{expert.name || expert.first_name}</h3>
                            <p className="text-gray-600">{expert.email}</p>
                            <p className="text-sm text-gray-500">{expert.destination}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            expert.status === 'approved' ? 'bg-green-100 text-green-800' :
                            expert.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {expert.status || 'pending'}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedExpertId(expert.id);
                              handleGetExpertById(expert.id);
                            }}
                          >
                            View Details
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setSelectedExpertId(expert.id)}
                          >
                            Update Status
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Update Status Panel */}
            <Card>
              <CardHeader>
                <CardTitle>Update Expert Status</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedExpertId ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Status</label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={updateData.status === 'approved' ? 'default' : 'outline'}
                          onClick={() => handleStatusChange('approved')}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant={updateData.status === 'rejected' ? 'default' : 'outline'}
                          onClick={() => handleStatusChange('rejected')}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant={updateData.status === 'pending' ? 'default' : 'outline'}
                          onClick={() => handleStatusChange('pending')}
                        >
                          Pending
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2">Notes (Optional)</label>
                      <textarea
                        value={updateData.notes}
                        onChange={(e) => setUpdateData(prev => ({ ...prev, notes: e.target.value }))}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF385C]"
                        rows={3}
                        placeholder="Add notes about this decision..."
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleUpdateExpert(selectedExpertId)}
                        disabled={!updateData.status}
                        className="bg-[#FF385C] hover:bg-[#e62e50]"
                      >
                        Update Status
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedExpertId(null);
                          setUpdateData({ status: '', notes: '' });
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Select an expert to update their status
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Current Expert Details */}
          {currentLocalExpert && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Expert Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Personal Information</h4>
                    <p><strong>Name:</strong> {currentLocalExpert.name || currentLocalExpert.first_name}</p>
                    <p><strong>Email:</strong> {currentLocalExpert.email}</p>
                    <p><strong>Phone:</strong> {currentLocalExpert.phone}</p>
                    <p><strong>Destination:</strong> {currentLocalExpert.destination}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Expertise & Services</h4>
                    <p><strong>Expertise:</strong> {currentLocalExpert.expertise}</p>
                    <p><strong>Languages:</strong> {currentLocalExpert.languages?.join(', ')}</p>
                    <p><strong>Experience:</strong> {currentLocalExpert.experience_years} years</p>
                    <p><strong>Services:</strong> {currentLocalExpert.services?.join(', ')}</p>
                  </div>
                </div>
                {currentLocalExpert.description && (
                  <div className="mt-4">
                    <h4 className="font-semibold mb-2">Description</h4>
                    <p className="text-gray-700">{currentLocalExpert.description}</p>
                  </div>
                )}
                {currentLocalExpert.why_choose_me && (
                  <div className="mt-4">
                    <h4 className="font-semibold mb-2">Why Choose Me</h4>
                    <p className="text-gray-700">{currentLocalExpert.why_choose_me}</p>
                  </div>
                )}
                {currentLocalExpert.admin_notes && (
                  <div className="mt-4">
                    <h4 className="font-semibold mb-2">Admin Notes</h4>
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-blue-800">{currentLocalExpert.admin_notes}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
} 