import citiesList from 'cities-list'
import citiesJson from 'cities.json'

// Get cities for a specific country using cities-list package
export const getCitiesForCountry = (countryName) => {
  if (!countryName) return []
  
  const country = countryName.toLowerCase()
  
  // Filter cities by country
  const countryCities = Object.values(citiesList).filter(city => 
    city.country && city.country.toLowerCase() === country
  )
  
  // Convert to our format and remove duplicates
  const uniqueCities = new Set()
  const formattedCities = []
  
  countryCities.forEach(city => {
    if (city.name && !uniqueCities.has(city.name.toLowerCase())) {
      uniqueCities.add(city.name.toLowerCase())
      formattedCities.push({
        value: city.name.toLowerCase(),
        label: city.name
      })
    }
  })
  
  // Sort alphabetically
  formattedCities.sort((a, b) => a.label.localeCompare(b.label))
  
  return formattedCities
}

// Get cities for a specific country using cities.json package (GeoNames)
export const getCitiesForCountryGeoNames = (countryName) => {
  if (!countryName) return []
  
  const country = countryName.toLowerCase()
  
  // Country name mappings for GeoNames
  const countryMappings = {
    'india': 'IN',
    'usa': 'US',
    'united states': 'US',
    'united states of america': 'US',
    'uk': 'GB',
    'united kingdom': 'GB',
    'great britain': 'GB',
    'england': 'GB',
    'spain': 'ES',
    'france': 'FR',
    'germany': 'DE',
    'italy': 'IT',
    'canada': 'CA',
    'australia': 'AU',
    'japan': 'JP',
    'china': 'CN',
    'brazil': 'BR',
    'russia': 'RU',
    'mexico': 'MX',
    'south africa': 'ZA',
    'netherlands': 'NL',
    'belgium': 'BE',
    'switzerland': 'CH',
    'austria': 'AT',
    'sweden': 'SE',
    'norway': 'NO',
    'denmark': 'DK',
    'finland': 'FI',
    'poland': 'PL',
    'czech republic': 'CZ',
    'hungary': 'HU',
    'romania': 'RO',
    'bulgaria': 'BG',
    'greece': 'GR',
    'turkey': 'TR',
    'portugal': 'PT',
    'ireland': 'IE',
    'new zealand': 'NZ',
    'singapore': 'SG',
    'malaysia': 'MY',
    'thailand': 'TH',
    'vietnam': 'VN',
    'indonesia': 'ID',
    'philippines': 'PH',
    'south korea': 'KR',
    'taiwan': 'TW',
    'hong kong': 'HK',
    'israel': 'IL',
    'egypt': 'EG',
    'morocco': 'MA',
    'nigeria': 'NG',
    'kenya': 'KE',
    'ghana': 'GH',
    'ethiopia': 'ET',
    'uganda': 'UG',
    'tanzania': 'TZ',
    'zimbabwe': 'ZW',
    'botswana': 'BW',
    'namibia': 'NA',
    'angola': 'AO',
    'mozambique': 'MZ',
    'madagascar': 'MG',
    'mauritius': 'MU',
    'seychelles': 'SC',
    'comoros': 'KM',
    'djibouti': 'DJ',
    'somalia': 'SO',
    'eritrea': 'ER',
    'sudan': 'SD',
    'south sudan': 'SS',
    'chad': 'TD',
    'niger': 'NE',
    'mali': 'ML',
    'burkina faso': 'BF',
    'senegal': 'SN',
    'gambia': 'GM',
    'guinea-bissau': 'GW',
    'guinea': 'GN',
    'sierra leone': 'SL',
    'liberia': 'LR',
    'ivory coast': 'CI',
    'togo': 'TG',
    'benin': 'BJ',
    'cameroon': 'CM',
    'central african republic': 'CF',
    'equatorial guinea': 'GQ',
    'gabon': 'GA',
    'congo': 'CG',
    'democratic republic of the congo': 'CD',
    'rwanda': 'RW',
    'burundi': 'BI',
    'malawi': 'MW',
    'zambia': 'ZM',
    'lesotho': 'LS',
    'eswatini': 'SZ'
  }
  
  const countryCode = countryMappings[country]
  if (!countryCode) return []
  
  // Filter cities by country code
  const countryCities = citiesJson.filter(city => 
    city.country === countryCode
  )
  
  // Convert to our format and remove duplicates
  const uniqueCities = new Set()
  const formattedCities = []
  
  countryCities.forEach(city => {
    if (city.name && !uniqueCities.has(city.name.toLowerCase())) {
      uniqueCities.add(city.name.toLowerCase())
      formattedCities.push({
        value: city.name.toLowerCase(),
        label: city.name
      })
    }
  })
  
  // Sort alphabetically
  formattedCities.sort((a, b) => a.label.localeCompare(b.label))
  
  return formattedCities
}

// Get cities using both packages for maximum coverage
export const getCitiesForCountryCombined = (countryName) => {
  if (!countryName) return []
  
  // Get cities from both packages
  const citiesListCities = getCitiesForCountry(countryName)
  const geoNamesCities = getCitiesForCountryGeoNames(countryName)
  
  // Combine and remove duplicates
  const allCities = [...citiesListCities, ...geoNamesCities]
  const uniqueCities = new Map()
  
  allCities.forEach(city => {
    const key = city.value.toLowerCase()
    if (!uniqueCities.has(key)) {
      uniqueCities.set(key, city)
    }
  })
  
  // Convert back to array and sort
  const combinedCities = Array.from(uniqueCities.values())
  combinedCities.sort((a, b) => a.label.localeCompare(b.label))
  
  return combinedCities
}

// Get major cities for a country (top cities by population/importance)
export const getMajorCitiesForCountry = (countryName) => {
  const allCities = getCitiesForCountryCombined(countryName)
  
  // Return first 50 cities (major cities are usually listed first)
  return allCities.slice(0, 50)
}

// Search cities by name
export const searchCities = (countryName, searchTerm) => {
  if (!searchTerm) return getCitiesForCountryCombined(countryName)
  
  const allCities = getCitiesForCountryCombined(countryName)
  const term = searchTerm.toLowerCase()
  
  return allCities.filter(city => 
    city.label.toLowerCase().includes(term) ||
    city.value.toLowerCase().includes(term)
  )
} 