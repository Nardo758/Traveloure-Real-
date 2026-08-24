'use client'

import { useState, useEffect } from 'react'

export default function TestLanguages() {
  const [languages, setLanguages] = useState([])
  const [loading, setLoading] = useState(false)

  const loadLanguages = async () => {
    setLoading(true)
    try {
      
      // Simulate loading languages
      const mockLanguages = [
        { code: 'en', name: 'English', nativeName: 'English' },
        { code: 'es', name: 'Spanish', nativeName: 'Español' },
        { code: 'fr', name: 'French', nativeName: 'Français' },
        { code: 'de', name: 'German', nativeName: 'Deutsch' },
        { code: 'it', name: 'Italian', nativeName: 'Italiano' },
        { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
        { code: 'ru', name: 'Russian', nativeName: 'Русский' },
        { code: 'ja', name: 'Japanese', nativeName: '日本語' },
        { code: 'ko', name: 'Korean', nativeName: '한국어' },
        { code: 'zh', name: 'Chinese', nativeName: '中文' },
        { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
        { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' }
      ]
      
      setLanguages(mockLanguages)
      
    } catch (error) {
      console.error('Error loading languages:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLanguages()
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Languages Test</h1>
      
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4">Loading languages...</p>
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-semibold mb-4">
            Available Languages ({languages.length}):
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {languages.map((language, index) => (
              <div 
                key={index}
                className="p-4 bg-gray-50 border border-gray-200 rounded-lg"
              >
                <h3 className="font-semibold text-lg mb-2">{language.name}</h3>
                <div className="space-y-1 text-sm text-gray-600">
                  <div><strong>Code:</strong> {language.code}</div>
                  <div><strong>Native:</strong> {language.nativeName}</div>
                </div>
              </div>
            ))}
          </div>
          
          {languages.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No languages found
            </div>
          )}
        </div>
      )}

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-800 mb-2">🌐 Language Support</h3>
        <p className="text-blue-700">
          This test shows the available languages for the application:
        </p>
        <ul className="list-disc list-inside mt-2 text-blue-700">
          <li><strong>Language Codes:</strong> ISO 639-1 language codes</li>
          <li><strong>Native Names:</strong> Languages in their native script</li>
          <li><strong>English Names:</strong> Languages in English</li>
          <li><strong>Total:</strong> {languages.length} languages supported</li>
        </ul>
      </div>
    </div>
  )
} 