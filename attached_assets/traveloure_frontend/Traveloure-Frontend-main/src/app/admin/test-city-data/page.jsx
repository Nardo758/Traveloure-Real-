'use client'

import { useState, useEffect } from 'react'
import { City } from 'country-state-city'
import { getCountryCodeFromName } from '../../../lib/countryUtils'

export default function TestCityData() {
  const [country, setCountry] = useState('india')
  const [cities, setCities] = useState([])
  const [loading, setLoading] = useState(false)
  const [countryCode, setCountryCode] = useState('')
  const [cityCount, setCityCount] = useState(0)

  const countries = [
    'india', 'usa', 'spain', 'france', 'germany', 'italy', 'uk', 'canada', 
    'australia', 'japan', 'china', 'brazil', 'russia', 'mexico', 'south africa'
  ]

  const loadCities = async (countryName) => {
    setLoading(true)
    try {
      
      // Get country code
      const code = getCountryCodeFromName(countryName)
      setCountryCode(code)
      
      if (code && code !== countryName.toLowerCase()) {
        // Get cities and show their structure
        const allCities = City.getCitiesOfCountry(code.toUpperCase())
        setCityCount(allCities.length)
        
        // Show first 10 cities with full data
        const sampleCities = allCities.slice(0, 10)
        setCities(sampleCities)
        
      
      } else {
        setCityCount(0)
        setCities([])
      }
      
    } catch (error) {
      console.error('Error loading cities:', error)
      setCityCount(0)
      setCities([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCities(country)
  }, [country])

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">City Data Structure Test</h1>
      
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Country:
        </label>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg"
        >
          {countries.map(c => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </div>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-800">Country Code</h3>
          <p className="text-2xl font-bold text-blue-600">{countryCode || 'Not found'}</p>
          <p className="text-sm text-blue-600">ISO country code</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="font-semibold text-green-800">Total Cities</h3>
          <p className="text-2xl font-bold text-green-600">{cityCount}</p>
          <p className="text-sm text-green-600">Cities found</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4">Loading cities...</p>
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-semibold mb-4">
            Sample City Data for {country.charAt(0).toUpperCase() + country.slice(1)}:
          </h2>
          <div className="space-y-4">
            {cities.map((city, index) => (
              <div key={index} className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-lg mb-2">{city.name}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div><strong>State:</strong> {city.stateCode}</div>
                  <div><strong>Country:</strong> {city.countryCode}</div>
                  <div><strong>Latitude:</strong> {city.latitude}</div>
                  <div><strong>Longitude:</strong> {city.longitude}</div>
                </div>
              </div>
            ))}
          </div>
          
          {cities.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No cities found for {country}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-800 mb-2">📊 City Data Structure</h3>
        <p className="text-blue-700">
          This test shows the complete data structure for cities from the country-state-city package:
        </p>
        <ul className="list-disc list-inside mt-2 text-blue-700">
          <li><strong>name:</strong> City name</li>
          <li><strong>stateCode:</strong> State/province code</li>
          <li><strong>countryCode:</strong> ISO country code</li>
          <li><strong>latitude:</strong> Geographic latitude</li>
          <li><strong>longitude:</strong> Geographic longitude</li>
        </ul>
      </div>
    </div>
  )
} 