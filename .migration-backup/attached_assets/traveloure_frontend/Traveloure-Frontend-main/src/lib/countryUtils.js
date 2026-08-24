import { Country, State, City } from 'country-state-city'
import ISO6391 from 'iso-639-1'

// Get all countries for filter options
export const getCountriesForFilter = () => {
  const countries = Country.getAllCountries()
  return [
    { value: 'all', label: 'All Countries' },
    ...countries.map(country => ({
      value: country.isoCode.toLowerCase(),
      label: country.name
    }))
  ]
}

// Get all languages for filter options
export const getLanguagesForFilter = () => {
  const languages = ISO6391.getAllNames()
  return [
    { value: 'all', label: 'All Languages' },
    ...languages.map(language => ({
      value: language.toLowerCase(),
      label: language
    }))
  ]
}

// Get country-specific languages for filter options
export const getCountrySpecificLanguages = (countryName) => {
  const country = countryName.toLowerCase()
  
  // Country-specific language mappings
  const countryLanguages = {
    'india': [
      'Hindi', 'English', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Urdu', 'Gujarati',
      'Kannada', 'Odia', 'Malayalam', 'Punjabi', 'Assamese', 'Maithili', 'Santali',
      'Kashmiri', 'Nepali', 'Sindhi', 'Dogri', 'Konkani', 'Manipuri', 'Bodo', 'Sanskrit'
    ],
    'spain': [
      'Spanish', 'Catalan', 'Galician', 'Basque', 'Aranese', 'English', 'French', 'German'
    ],
    'france': [
      'French', 'Occitan', 'Breton', 'Basque', 'Catalan', 'Corsican', 'Alsatian', 'English'
    ],
    'germany': [
      'German', 'Low German', 'Upper Sorbian', 'Lower Sorbian', 'Danish', 'English', 'French'
    ],
    'italy': [
      'Italian', 'Sardinian', 'Friulian', 'Ladin', 'Occitan', 'Slovene', 'German', 'French'
    ],
    'usa': [
      'English', 'Spanish', 'Chinese', 'French', 'Tagalog', 'Vietnamese', 'German', 'Korean',
      'Russian', 'Arabic', 'Italian', 'Portuguese', 'Hindi', 'Japanese', 'Polish'
    ],
    'united states': [
      'English', 'Spanish', 'Chinese', 'French', 'Tagalog', 'Vietnamese', 'German', 'Korean',
      'Russian', 'Arabic', 'Italian', 'Portuguese', 'Hindi', 'Japanese', 'Polish'
    ],
    'uk': [
      'English', 'Welsh', 'Scottish Gaelic', 'Irish', 'Cornish', 'French', 'German', 'Spanish'
    ],
    'united kingdom': [
      'English', 'Welsh', 'Scottish Gaelic', 'Irish', 'Cornish', 'French', 'German', 'Spanish'
    ],
    'canada': [
      'English', 'French', 'Chinese', 'Punjabi', 'Spanish', 'Italian', 'German', 'Tagalog',
      'Arabic', 'Portuguese', 'Polish', 'Ukrainian', 'Dutch', 'Vietnamese'
    ],
    'australia': [
      'English', 'Mandarin', 'Italian', 'Arabic', 'Greek', 'Vietnamese', 'Cantonese', 'Spanish',
      'Hindi', 'Tagalog', 'Korean', 'German', 'French', 'Turkish'
    ],
    'japan': [
      'Japanese', 'English', 'Chinese', 'Korean', 'Portuguese', 'Spanish', 'Vietnamese'
    ],
    'china': [
      'Chinese', 'Mandarin', 'Cantonese', 'English', 'Mongolian', 'Tibetan', 'Uyghur', 'Zhuang'
    ],
    'brazil': [
      'Portuguese', 'Spanish', 'English', 'German', 'Italian', 'Japanese', 'Korean', 'Chinese'
    ],
    'russia': [
      'Russian', 'Tatar', 'Bashkir', 'Chuvash', 'Chechen', 'English', 'German', 'French'
    ],
    'mexico': [
      'Spanish', 'Nahuatl', 'Yucatec Maya', 'Mixtec', 'Zapotec', 'English', 'French', 'German'
    ],
    'south africa': [
      'English', 'Afrikaans', 'Zulu', 'Xhosa', 'Northern Sotho', 'Tswana', 'Southern Sotho',
      'Tsonga', 'Swati', 'Venda', 'Ndebele', 'French', 'German', 'Portuguese'
    ]
  }
  
  // Return country-specific languages or default to common languages
  const languages = countryLanguages[country] || [
    'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian', 'Chinese',
    'Japanese', 'Korean', 'Arabic', 'Hindi', 'Turkish', 'Dutch', 'Swedish', 'Norwegian'
  ]
  
  return [
    { value: 'all', label: 'All Languages' },
    ...languages.map(language => ({
      value: language.toLowerCase(),
      label: language
    }))
  ]
}

// Get states for a specific country
export const getStatesForCountry = (countryCode) => {
  if (!countryCode || countryCode === 'all') return []
  const states = State.getStatesOfCountry(countryCode.toUpperCase())
  return [
    { value: 'all', label: 'All States' },
    ...states.map(state => ({
      value: state.isoCode.toLowerCase(),
      label: state.name
    }))
  ]
}

// Get cities for a specific state and country
export const getCitiesForState = (countryCode, stateCode) => {
  if (!countryCode || !stateCode || countryCode === 'all' || stateCode === 'all') return []
  const cities = City.getCitiesOfState(countryCode.toUpperCase(), stateCode.toUpperCase())
  return cities.map(city => ({
    value: city.name.toLowerCase(),
    label: city.name
  }))
}

// Get country name by ISO code
export const getCountryName = (isoCode) => {
  if (!isoCode) return ''
  const country = Country.getCountryByCode(isoCode.toUpperCase())
  return country ? country.name : isoCode
}

// Get country code by name
export const getCountryCodeFromName = (countryName) => {
  if (!countryName) return ''
  
  // Common country name mappings
  const countryMappings = {
    'india': 'in',
    'usa': 'us',
    'united states': 'us',
    'united states of america': 'us',
    'uk': 'gb',
    'united kingdom': 'gb',
    'great britain': 'gb',
    'england': 'gb',
    'spain': 'es',
    'france': 'fr',
    'germany': 'de',
    'italy': 'it',
    'canada': 'ca',
    'australia': 'au',
    'japan': 'jp',
    'china': 'cn',
    'brazil': 'br',
    'russia': 'ru',
    'mexico': 'mx',
    'south africa': 'za'
  }
  
  const normalizedName = countryName.toLowerCase().trim()
  
  // Check mappings first
  if (countryMappings[normalizedName]) {
    return countryMappings[normalizedName]
  }
  
  // Fallback to API search
  const countries = Country.getAllCountries()
  const country = countries.find(c => 
    c.name.toLowerCase() === normalizedName ||
    c.name.toLowerCase().includes(normalizedName) ||
    normalizedName.includes(c.name.toLowerCase())
  )
  
  return country ? country.isoCode.toLowerCase() : normalizedName
}

// Get state name by ISO code
export const getStateName = (countryCode, stateCode) => {
  if (!countryCode || !stateCode) return ''
  const state = State.getStateByCodeAndCountry(stateCode.toUpperCase(), countryCode.toUpperCase())
  return state ? state.name : stateCode
}

// Filter data by country
export const filterByCountry = (data, countryFilter) => {
  if (!countryFilter || countryFilter === 'all') return data
  return data.filter(item => 
    item.country?.toLowerCase() === countryFilter.toLowerCase() ||
    item.country?.toLowerCase().includes(countryFilter.toLowerCase())
  )
}

// Filter data by state
export const filterByState = (data, stateFilter) => {
  if (!stateFilter || stateFilter === 'all') return data
  return data.filter(item => 
    item.state?.toLowerCase() === stateFilter.toLowerCase() ||
    item.state?.toLowerCase().includes(stateFilter.toLowerCase())
  )
}

// Filter data by city
export const filterByCity = (data, cityFilter) => {
  if (!cityFilter || cityFilter === 'all') return data
  return data.filter(item => {
    const itemCity = item.city?.toLowerCase() || ''
    const filterCity = cityFilter.toLowerCase()
    return itemCity === filterCity || itemCity.includes(filterCity)
  })
}

// Filter data by language
export const filterByLanguage = (data, languageFilter) => {
  if (!languageFilter || languageFilter === 'all') return data
  return data.filter(item => 
    item.languages?.toLowerCase().includes(languageFilter.toLowerCase())
  )
}

// Filter data by industry
export const filterByIndustry = (data, industryFilter) => {
  if (!industryFilter || industryFilter === 'all') return data
  return data.filter(item => 
    item.industry?.toLowerCase().includes(industryFilter.toLowerCase())
  )
}

// Filter data by category
export const filterByCategory = (data, categoryFilter) => {
  if (!categoryFilter || categoryFilter === 'all') return data
  return data.filter(item => 
    item.category?.toLowerCase().includes(categoryFilter.toLowerCase())
  )
}

// Sort data by various criteria
export const sortData = (data, sortBy) => {
  if (!sortBy) return data
  
  const sortedData = [...data]
  
  switch (sortBy) {
    case 'recent':
      return sortedData.sort((a, b) => {
        const dateA = new Date(a.requestDate || a.createdAt || 0)
        const dateB = new Date(b.requestDate || b.createdAt || 0)
        return dateB - dateA
      })
    
    case 'all':
      return sortedData // No sorting, return as is
    
    case 'older':
      return sortedData.sort((a, b) => {
        const dateA = new Date(a.requestDate || a.createdAt || 0)
        const dateB = new Date(b.requestDate || b.createdAt || 0)
        return dateA - dateB
      })
    
    case 'name':
      return sortedData.sort((a, b) => 
        (a.name || '').localeCompare(b.name || '')
      )
    
    case 'country':
      return sortedData.sort((a, b) => 
        (a.country || '').localeCompare(b.country || '')
      )
    
    case 'rating':
      return sortedData.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    
    case 'earning':
      return sortedData.sort((a, b) => {
        const earningA = parseFloat(a.totalEarning || a.monthlyEarning || 0)
        const earningB = parseFloat(b.totalEarning || b.monthlyEarning || 0)
        return earningB - earningA
      })
    
    case 'industry':
      return sortedData.sort((a, b) => 
        (a.industry || '').localeCompare(b.industry || '')
      )
    
    case 'highest rating':
      return sortedData.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    
    case 'lowest rating':
      return sortedData.sort((a, b) => (a.rating || 0) - (b.rating || 0))
    
    case 'highest earning':
      return sortedData.sort((a, b) => {
        const earningA = parseFloat(a.totalEarning || a.totalEarnings || 0)
        const earningB = parseFloat(b.totalEarning || b.totalEarnings || 0)
        return earningB - earningA
      })
    
    case 'lowest earning':
      return sortedData.sort((a, b) => {
        const earningA = parseFloat(a.totalEarning || a.totalEarnings || 0)
        const earningB = parseFloat(b.totalEarning || b.totalEarnings || 0)
        return earningA - earningB
      })
    
    case 'name desc':
      return sortedData.sort((a, b) => 
        (b.name || '').localeCompare(a.name || '')
      )
    
    case 'city':
      return sortedData.sort((a, b) => 
        (a.city || '').localeCompare(b.city || '')
      )
    
    case 'projects':
      return sortedData.sort((a, b) => (b.totalProjects || 0) - (a.totalProjects || 0))
    
    default:
      return sortedData
  }
}

// Apply multiple filters and sorting
export const applyFilters = (data, filters) => {
  let filteredData = [...data]
  
  if (filters.country && filters.country !== 'all') {
    filteredData = filterByCountry(filteredData, filters.country)
  }
  
  if (filters.state && filters.state !== 'all') {
    filteredData = filterByState(filteredData, filters.state)
  }
  
  if (filters.city && filters.city !== 'all') {
    filteredData = filterByCity(filteredData, filters.city)
  }
  
  if (filters.languages && filters.languages !== 'all') {
    filteredData = filterByLanguage(filteredData, filters.languages)
  }
  
  if (filters.industry && filters.industry !== 'all') {
    filteredData = filterByIndustry(filteredData, filters.industry)
  }
  
  if (filters.category && filters.category !== 'all') {
    filteredData = filterByCategory(filteredData, filters.category)
  }
  
  if (filters.search) {
    filteredData = filteredData.filter(item =>
      item.name?.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.email?.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.country?.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.city?.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.industry?.toLowerCase().includes(filters.search.toLowerCase())
    )
  }
  
  // Apply sorting
  if (filters.sortBy) {
    filteredData = sortData(filteredData, filters.sortBy)
  }
  
  return filteredData
} 