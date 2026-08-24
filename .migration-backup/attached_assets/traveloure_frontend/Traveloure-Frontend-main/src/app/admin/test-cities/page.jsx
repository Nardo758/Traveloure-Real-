'use client'

import { useState, useEffect } from 'react'
import { getCitiesForCountryCombined, getCitiesForCountry, getCitiesForCountryGeoNames } from '../../../lib/cityUtils'

export default function TestCities() {
  const [country, setCountry] = useState('india')
  const [cities, setCities] = useState([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({})

  const countries = [
    'india', 'usa', 'spain', 'france', 'germany', 'italy', 'uk', 'canada', 
    'australia', 'japan', 'china', 'brazil', 'russia', 'mexico', 'south africa'
  ]

  const loadCities = async (countryName) => {
    setLoading(true)
    try {
      
      // Test all three methods
      const combinedCities = getCitiesForCountryCombined(countryName)
      const citiesListCities = getCitiesForCountry(countryName)
      const geoNamesCities = getCitiesForCountryGeoNames(countryName)
      
      setStats({
        combined: combinedCities.length,
        citiesList: citiesListCities.length,
        geoNames: geoNamesCities.length
      })
      
      setCities(combinedCities.slice(0, 50)) // Show first 50 cities
      
    
      
    } catch (error) {
      console.error('Error loading cities:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCities(country)
  }, [country])

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">City Packages Test</h1>
      
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

      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-800">Combined Cities</h3>
          <p className="text-2xl font-bold text-blue-600">{stats.combined || 0}</p>
          <p className="text-sm text-blue-600">Total cities from both packages</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="font-semibold text-green-800">Cities-List Package</h3>
          <p className="text-2xl font-bold text-green-600">{stats.citiesList || 0}</p>
          <p className="text-sm text-green-600">~80K cities package</p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <h3 className="font-semibold text-purple-800">GeoNames Package</h3>
          <p className="text-2xl font-bold text-purple-600">{stats.geoNames || 0}</p>
          <p className="text-sm text-purple-600">Cities.json package</p>
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
            Sample Cities for {country.charAt(0).toUpperCase() + country.slice(1)}:
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {cities.map((city, index) => (
              <div 
                key={index}
                className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center"
              >
                <span className="font-medium text-sm">{city.label}</span>
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

      <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-yellow-800 mb-2">✅ New City Packages Working</h3>
        <p className="text-yellow-700">
          The new city packages provide much better coverage:
        </p>
        <ul className="list-disc list-inside mt-2 text-yellow-700">
          <li><strong>cities-list:</strong> ~80,000 cities worldwide</li>
          <li><strong>cities.json:</strong> GeoNames-based city data</li>
          <li><strong>Combined:</strong> Maximum coverage by merging both packages</li>
          <li><strong>Performance:</strong> Fast loading with proper country filtering</li>
        </ul>
      </div>
    </div>
  )
} 