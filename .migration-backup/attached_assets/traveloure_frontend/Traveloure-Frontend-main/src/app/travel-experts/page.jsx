"use client"
import { useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import Header from "../../components/Header";
import Footer from "../../components/footer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ChevronLeft } from "lucide-react";
import { Stepper, Step } from 'react-form-stepper';
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Textarea } from "../../components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { useDispatch } from "react-redux";
import { fetchExperts } from "../redux-features/Travelexperts/travelexpertsSlice";
import { useSession } from "next-auth/react";
import Image from "next/image";
import ReactSelect from "react-select";
import { Country, City } from "country-state-city";
import ProtectedRoute from "../../components/protectedroutes/ProtectedRoutes";
import { useRouter } from "next/navigation";
import Link from "next/link";
import i18next from 'i18next';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import countries from 'i18n-iso-countries';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';

// Initialize countries
countries.registerLocale(require('i18n-iso-countries/langs/en.json'));

// Get countries list
const getCountriesList = () => {
  const countryCodes = countries.getAlpha2Codes();
  return Object.keys(countryCodes).map(code => ({
    value: code,
    label: countries.getName(code, 'en')
  })).sort((a, b) => a.label.localeCompare(b.label));
};

const countriesList = getCountriesList();

// Custom Year Dropdown with Search
const CustomYearDropdown = ({ date, onChange, onYearChange, yearItemNumber = 50 }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  
  const currentYear = new Date().getFullYear();
  const years = [];
  
  // Generate years from current year to current year - 100 (no future years)
  for (let year = currentYear; year >= currentYear - 100; year--) {
    years.push(year);
  }
  
  const filteredYears = years.filter(year => 
    year.toString().includes(searchTerm)
  );
  
  const handleYearSelect = (year) => {
    // Create a new date object with the selected year
    const newDate = new Date(date);
    newDate.setFullYear(year);
    
    // Call the onYearChange function to update the calendar
    onYearChange(year);
    
    setIsOpen(false);
    setSearchTerm("");
  };
  
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-white font-medium px-3 py-1 rounded hover:bg-white hover:bg-opacity-20 transition-colors"
      >
        {date.getFullYear()}
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px]">
          <div className="p-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search year..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="year-search-input"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredYears.length > 0 ? (
              filteredYears.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => handleYearSelect(year)}
                  className={`w-full text-left px-3 py-2 hover:bg-red-50 hover:text-red-600 transition-colors ${
                    year === date.getFullYear() ? 'bg-red-600 text-white' : 'text-gray-700'
                  }`}
                >
                  {year}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-gray-500 text-sm">
                No years found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Custom styles for the date picker
const datePickerStyles = `
  .react-datepicker-wrapper {
    width: 100% !important;
  }
  
  .react-datepicker__input-container {
    width: 100% !important;
  }
  
  .react-datepicker__input-container input {
    width: 100% !important;
  }
  
  .react-datepicker {
    font-family: inherit;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    background: white;
  }
  
  .react-datepicker__header {
    background: linear-gradient(135deg, #FF385C 0%, #e62e50 100%);
    border-bottom: 1px solid #e5e7eb;
    border-radius: 0.5rem 0.5rem 0 0;
    padding: 1rem;
  }
  
  .react-datepicker__current-month {
    color: white;
    font-weight: 600;
    font-size: 1.1rem;
    margin-bottom: 0.5rem;
  }
  
  .react-datepicker__day-name {
    color: white;
    font-weight: 500;
    margin: 0.25rem;
  }
  
  .react-datepicker__day {
    border-radius: 0.375rem;
    margin: 0.125rem;
    width: 2rem;
    height: 2rem;
    line-height: 2rem;
    color: #374151;
    font-weight: 500;
  }
  
  .react-datepicker__day:hover {
    background-color: #fef2f2;
    color: #FF385C;
  }
  
  .react-datepicker__day--selected {
    background-color: #FF385C !important;
    color: white !important;
  }
  
  .react-datepicker__day--keyboard-selected {
    background-color: #FF385C !important;
    color: white !important;
  }
  
  .react-datepicker__day--outside-month {
    color: #d1d5db;
  }
  
  .react-datepicker__navigation {
    top: 1rem;
    position: absolute;
    z-index: 10;
  }
  
  .react-datepicker__navigation--previous {
    left: 1rem;
  }
  
  .react-datepicker__navigation--next {
    right: 1rem;
  }
  
  .react-datepicker__navigation-icon::before {
    border-color: white;
    border-width: 2px 2px 0 0;
  }
  
  .react-datepicker__navigation button {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 0.25rem;
    transition: background-color 0.2s ease;
  }
  
  .react-datepicker__navigation button:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
  
  .react-datepicker__navigation button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }
  
  .react-datepicker__year-dropdown,
  .react-datepicker__month-dropdown {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    max-height: 200px;
    overflow-y: auto;
  }
  
  .react-datepicker__year-option,
  .react-datepicker__month-option {
    padding: 0.5rem 1rem;
    cursor: pointer;
    border-bottom: 1px solid #f3f4f6;
  }
  
  .react-datepicker__year-option:hover,
  .react-datepicker__month-option:hover {
    background-color: #fef2f2;
    color: #FF385C;
  }
  
  .react-datepicker__year-option--selected,
  .react-datepicker__month-option--selected {
    background-color: #FF385C;
    color: white;
  }
  
  .react-datepicker__year-read-view,
  .react-datepicker__month-read-view {
    color: white;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  
  .react-datepicker__year-read-view:hover,
  .react-datepicker__month-read-view:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
  
  .react-datepicker__year-dropdown-container,
  .react-datepicker__month-dropdown-container {
    margin: 0 0.5rem;
  }
  
  .react-datepicker__header__dropdown {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
  }
  
  .year-search-container {
    position: relative;
    margin-bottom: 0.5rem;
  }
  
  .year-search-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
    color: #374151;
  }
  
  .year-search-input:focus {
    outline: none;
    border-color: #FF385C;
    box-shadow: 0 0 0 3px rgba(255, 56, 92, 0.1);
  }
  
  .year-search-input::placeholder {
    color: #9ca3af;
  }
  
  .react-datepicker__year-dropdown {
    max-height: 150px;
  }
  
  .react-datepicker__year-option {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
  }
  
  .react-datepicker__year-option--selected {
    background-color: #FF385C;
    color: white;
    font-weight: 600;
  }
  
  /* Date Picker Popper Styles */
  .react-datepicker-popper {
    position: relative !important;
    left: auto !important;
    top: auto !important;
    transform: none !important;
    will-change: auto !important;
  }
  
  .datepicker-popper {
    position: relative !important;
    left: auto !important;
    top: auto !important;
    transform: none !important;
    will-change: auto !important;
  }
  
  /* Phone Input Styles */
  .PhoneInput {
    width: 100% !important;
    display: flex !important;
    align-items: center !important;
    min-height: 40px !important;
  }
  
  .PhoneInputCountry {
    border: 1px solid #e5e7eb !important;
    border-right: none !important;
    border-radius: 0.5rem 0 0 0.5rem !important;
    background: #f9fafb !important;
    padding: 0.5rem !important;
    display: flex !important;
    align-items: center !important;
    gap: 0.5rem !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
    min-width: 120px !important;
    flex-shrink: 0 !important;
    height: 100px !important;
  }
  
  .react-international-phone-country-selector-button {
    height: 100% !important;
   
  }
  
  .PhoneInputCountry:hover {
    background: #f3f4f6 !important;
  }
  
  .PhoneInputCountryIcon {
    width: 1.5rem !important;
    height: 1.5rem !important;
    border-radius: 2px !important;
  }
  
  .PhoneInputCountrySelectArrow {
    border-left: 4px solid transparent !important;
    border-right: 4px solid transparent !important;
    border-top: 4px solid #6b7280 !important;
    margin-left: 0.25rem !important;
    transition: transform 0.2s ease !important;
  }
  
  .PhoneInputCountrySelectArrow--open {
    transform: rotate(180deg) !important;
  }
  
  .PhoneInputInput {
    flex: 1 !important;
    border: 1px solid #e5e7eb !important;
    border-left: none !important;
    border-radius: 0 0.5rem 0.5rem 0 !important;
    padding: 0.5rem 0.75rem !important;
    font-size: 0.875rem !important;
    background: white !important;
    color: #374151 !important;
    outline: none !important;
    transition: all 0.2s ease !important;
    min-height: 40px !important;
    width: 100% !important;
  }
  
  .PhoneInputInput:focus {
    border-color: #FF385C !important;
    box-shadow: 0 0 0 3px rgba(255, 56, 92, 0.1) !important;
  }
  
  .PhoneInputInput::placeholder {
    color: #9ca3af !important;
  }
  
  .PhoneInputCountrySelect {
    background: transparent !important;
    border: none !important;
    font-size: 0.875rem !important;
    color: #374151 !important;
    cursor: pointer !important;
    padding: 0.25rem !important;
    outline: none !important;
  }
  
  .PhoneInputCountrySelect:focus {
    outline: none !important;
  }
  
  /* Country Dropdown Styles */
  .PhoneInputCountrySelectDropdown {
    position: absolute !important;
    top: 100% !important;
    left: 0 !important;
    right: 0 !important;
    background: white !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 0.5rem !important;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1) !important;
    z-index: 1000 !important;
    max-height: 300px !important;
    overflow-y: auto !important;
  }
  
  /* Search Input Styles */
  .PhoneInputCountrySelectSearch {
    padding: 0.75rem !important;
    border-bottom: 1px solid #f3f4f6 !important;
  }
  
  .PhoneInputCountrySelectSearchInput {
    width: 100% !important;
    padding: 0.5rem 0.75rem !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 0.375rem !important;
    font-size: 0.875rem !important;
    background: white !important;
    color: #374151 !important;
    outline: none !important;
  }
  
  .PhoneInputCountrySelectSearchInput:focus {
    border-color: #FF385C !important;
    box-shadow: 0 0 0 3px rgba(255, 56, 92, 0.1) !important;
  }
  
  .PhoneInputCountrySelectSearchInput::placeholder {
    color: #9ca3af !important;
  }
  
  /* Country List Styles */
  .PhoneInputCountrySelectList {
    max-height: 250px !important;
    overflow-y: auto !important;
  }
  
  .PhoneInputCountrySelectOption {
    padding: 0.75rem !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    gap: 0.75rem !important;
    border-bottom: 1px solid #f3f4f6 !important;
    transition: background-color 0.2s ease !important;
  }
  
  .PhoneInputCountrySelectOption:hover {
    background-color: #fef2f2 !important;
  }
  
  .PhoneInputCountrySelectOption--selected {
    background-color: #FF385C !important;
    color: white !important;
  }
  
  .PhoneInputCountrySelectOption--selected:hover {
    background-color: #e62e50 !important;
  }
  
  .PhoneInputCountrySelectOptionIcon {
    width: 1.5rem !important;
    height: 1.5rem !important;
    border-radius: 2px !important;
  }
  
  .PhoneInputCountrySelectOptionName {
    flex: 1 !important;
    font-size: 0.875rem !important;
  }
  
  .PhoneInputCountrySelectOptionCode {
    font-size: 0.75rem !important;
    color: #6b7280 !important;
    font-weight: 500 !important;
  }
  
  .PhoneInputCountrySelectOption--selected .PhoneInputCountrySelectOptionCode {
    color: rgba(255, 255, 255, 0.8) !important;
  }
`;

// Inject the styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.type = "text/css";
  styleSheet.innerText = datePickerStyles;
  document.head.appendChild(styleSheet);
}

// Get languages from i18next with comprehensive list
const getLanguageOptions = () => {
  // Comprehensive language list with ISO codes
  const allLanguages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'hi', name: 'Hindi' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ar', name: 'Arabic' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'it', name: 'Italian' },
    { code: 'nl', name: 'Dutch' },
    { code: 'sv', name: 'Swedish' },
    { code: 'no', name: 'Norwegian' },
    { code: 'da', name: 'Danish' },
    { code: 'fi', name: 'Finnish' },
    { code: 'pl', name: 'Polish' },
    { code: 'tr', name: 'Turkish' },
    { code: 'el', name: 'Greek' },
    { code: 'he', name: 'Hebrew' },
    { code: 'th', name: 'Thai' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'id', name: 'Indonesian' },
    { code: 'ms', name: 'Malay' },
    { code: 'tl', name: 'Filipino' },
    { code: 'bn', name: 'Bengali' },
    { code: 'ur', name: 'Urdu' },
    { code: 'fa', name: 'Persian' },
    { code: 'sw', name: 'Swahili' },
    { code: 'am', name: 'Amharic' },
    { code: 'yo', name: 'Yoruba' },
    { code: 'ig', name: 'Igbo' },
    { code: 'zu', name: 'Zulu' },
    { code: 'xh', name: 'Xhosa' },
    { code: 'af', name: 'Afrikaans' },
    { code: 'cy', name: 'Welsh' },
    { code: 'ga', name: 'Irish' },
    { code: 'gd', name: 'Scottish Gaelic' },
    { code: 'ca', name: 'Catalan' },
    { code: 'eu', name: 'Basque' },
    { code: 'gl', name: 'Galician' },
    { code: 'ro', name: 'Romanian' },
    { code: 'bg', name: 'Bulgarian' },
    { code: 'sr', name: 'Serbian' },
    { code: 'hr', name: 'Croatian' },
    { code: 'sl', name: 'Slovenian' },
    { code: 'sk', name: 'Slovak' },
    { code: 'cs', name: 'Czech' },
    { code: 'hu', name: 'Hungarian' },
    { code: 'et', name: 'Estonian' },
    { code: 'lv', name: 'Latvian' },
    { code: 'lt', name: 'Lithuanian' },
    { code: 'uk', name: 'Ukrainian' },
    { code: 'be', name: 'Belarusian' },
    { code: 'mo', name: 'Moldovan' },
    { code: 'ka', name: 'Georgian' },
    { code: 'hy', name: 'Armenian' },
    { code: 'az', name: 'Azerbaijani' },
    { code: 'kk', name: 'Kazakh' },
    { code: 'uz', name: 'Uzbek' },
    { code: 'ky', name: 'Kyrgyz' },
    { code: 'tg', name: 'Tajik' },
    { code: 'tk', name: 'Turkmen' },
    { code: 'mn', name: 'Mongolian' },
    { code: 'bo', name: 'Tibetan' },
    { code: 'ne', name: 'Nepali' },
    { code: 'si', name: 'Sinhala' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'kn', name: 'Kannada' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'mr', name: 'Marathi' },
    { code: 'gu', name: 'Gujarati' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'as', name: 'Assamese' },
    { code: 'or', name: 'Odia' },
    { code: 'ks', name: 'Kashmiri' },
    { code: 'sd', name: 'Sindhi' },
    { code: 'kok', name: 'Konkani' },
    { code: 'mni', name: 'Manipuri' },
    { code: 'kha', name: 'Khasi' },
    { code: 'lus', name: 'Mizo' },
    { code: 'grt', name: 'Garo' },
    { code: 'brx', name: 'Bodo' },
    { code: 'sat', name: 'Santhali' },
    { code: 'doi', name: 'Dogri' },
    { code: 'mai', name: 'Maithili' },
    { code: 'bho', name: 'Bhojpuri' },
    { code: 'awa', name: 'Awadhi' },
    { code: 'cgc', name: 'Chhattisgarhi' },
    { code: 'raj', name: 'Rajasthani' },
    { code: 'bgc', name: 'Haryanvi' },
    { code: 'kfy', name: 'Kumaoni' },
    { code: 'gjm', name: 'Garhwali' },
    { code: 'kfr', name: 'Kangri' },
    { code: 'pah', name: 'Pahari' },
    { code: 'gad', name: 'Ladakhi' },
    { code: 'kng', name: 'Balti' }
  ];
  
  return allLanguages.map(lang => ({
    value: lang.name,
    label: lang.name
  })).sort((a, b) => a.label.localeCompare(b.label));
};

const languageOptions = getLanguageOptions();

const fullSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email"),
  mobile: z.string().min(8, "Mobile number is required"),
  country: z.object({ value: z.string(), label: z.string() }).nullable().refine(val => val !== null, { message: "Country is required" }),
  city: z.object({ value: z.string(), label: z.string() }).nullable().refine(val => val !== null, { message: "City is required" }),
  dob: z.string().min(1, "Date of birth is required"),
  languages: z.array(z.string()).min(1, "At least one language is required"),
  yearsInCity: z.number().min(1, "Years in city is required"),
  offersTours: z.enum(["yes", "no"], { required_error: "Required" }),
  bio: z.string().min(1, "Short bio is required"),
  photo: z.any().refine((file) => file && file.length === 1, "Photo is required"),
  govId: z.any().refine((file) => file && file.length === 1, "Government ID is required"),
  licence: z.any().refine((file) => file && file.length === 1, "Travel licence is required"),
  instagram: z.string().refine(
    val => !val || /^https?:\/\/.+\..+/.test(val),
    { message: "Invalid URL" }
  ).optional(),
  facebook: z.string().refine(
    val => !val || /^https?:\/\/.+\..+/.test(val),
    { message: "Invalid URL" }
  ).optional(),
  linkedin: z.string().refine(
    val => !val || /^https?:\/\/.+\..+/.test(val),
    { message: "Invalid URL" }
  ).optional(),
  services: z.array(z.string()).min(1, "Select at least one service"),
  customService: z.string().optional(),
  availability: z.number().min(1, "Service availability is required"),
  availabilityUnit: z.string().min(1, "Required"),
  minPrice: z.number().min(1, "Minimum price is required"),
  agreeAccurate: z.literal(true, { errorMap: () => ({ message: "Required" }) }),
  agreeTerms: z.literal(true, { errorMap: () => ({ message: "Required" }) }),
  agreeContact: z.boolean().optional(),
});

const stepSchemas = [
  z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email"),
    mobile: z.string().min(8, "Mobile number is required"),
    country: z.object({ value: z.string(), label: z.string() }).nullable().refine(val => val !== null, { message: "Country is required" }),
    city: z.object({ value: z.string(), label: z.string() }).nullable().refine(val => val !== null, { message: "City is required" }),
    dob: z.string().min(1, "Date of birth is required"),
    languages: z.array(z.string()).min(1, "At least one language is required"),
  }),
  z.object({
    yearsInCity: z.number().min(1, "Years in city is required"),
    offersTours: z.enum(["yes", "no"], { required_error: "Required" }),
    bio: z.string().min(1, "Short bio is required"),
  }),
  z.object({
    photo: z.any().refine((file) => file && file.length === 1, "Photo is required"),
    govId: z.any().refine((file) => file && file.length === 1, "Government ID is required"),
    licence: z.any().refine((file) => file && file.length === 1, "Travel licence is required"),
    instagram: z.string().refine(
      val => !val || /^https?:\/\/.+\..+/.test(val),
      { message: "Invalid URL" }
    ).optional(),
    facebook: z.string().refine(
      val => !val || /^https?:\/\/.+\..+/.test(val),
      { message: "Invalid URL" }
    ).optional(),
    linkedin: z.string().refine(
      val => !val || /^https?:\/\/.+\..+/.test(val),
      { message: "Invalid URL" }
    ).optional(),
  }),
  z.object({
    services: z.array(z.string()).min(1, "Select at least one service"),
    customService: z.string().optional(),
    availability: z.number().min(1, "Service availability is required"),
    availabilityUnit: z.string().min(1, "Required"),
    minPrice: z.number().min(1, "Minimum price is required"),
    agreeAccurate: z.literal(true, { errorMap: () => ({ message: "Required" }) }),
    agreeTerms: z.literal(true, { errorMap: () => ({ message: "Required" }) }),
    agreeContact: z.boolean().optional(),
  }),
];

export default function TravelExpertRegistration(props) {
  const { data: session } = useSession();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [customServiceError, setCustomServiceError] = useState("");
  const [customServices, setCustomServices] = useState([]);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const dispatch = useDispatch();
  const router = useRouter();

  const currentSchema = step < 3 ? stepSchemas[step] : fullSchema;

  // 2. Use the fullSchema in useForm
  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    trigger,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(currentSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: session?.user?.email || "",
      mobile: "",
      country: null,
      city: null,
      dob: "",
      languages: [],
      yearsInCity: 1,
      offersTours: "yes",
      bio: "",
      photo: undefined,
      govId: undefined,
      licence: undefined,
      instagram: "",
      facebook: "",
      linkedin: "",
      services: [],
      customService: "",
      availability: 1,
      availabilityUnit: "Hours/Week",
      minPrice: 1,
      agreeAccurate: false,
      agreeTerms: false,
      agreeContact: false,
    },
    mode: "onTouched",
  });

  useEffect(() => {
    if (session?.user) {
      // Prefill email if available
      if (session.user.email) {
        setValue("email", session.user.email);
      }
      
      // Prefill first name if available
      if (session.user.name) {
        // Split the name into first and last name
        const nameParts = session.user.name.trim().split(' ');
        if (nameParts.length > 0) {
          setValue("firstName", nameParts[0]);
        }
        if (nameParts.length > 1) {
          setValue("lastName", nameParts.slice(1).join(' '));
        }
      }
      
      // Prefill first name and last name if available separately
      if (session.user.firstName) {
        setValue("firstName", session.user.firstName);
      }
      if (session.user.lastName) {
        setValue("lastName", session.user.lastName);
      }
      if (session.user.first_name) {
        setValue("firstName", session.user.first_name);
      }
      if (session.user.last_name) {
        setValue("lastName", session.user.last_name);
      }
      
      // Prefill mobile number if available
      if (session.user.mobile || session.user.phone) {
        setValue("mobile", session.user.mobile || session.user.phone);
      }
      
      // Prefill date of birth if available
      if (session.user.dob || session.user.dateOfBirth) {
        setValue("dob", session.user.dob || session.user.dateOfBirth);
      }
    }
  }, [session, setValue]);





  const countries = countriesList;
  const [cities, setCities] = useState([]);
  const selectedCountry = watch("country");

  useEffect(() => {
    if (selectedCountry && selectedCountry.value) {
      const allCities = City.getCitiesOfCountry(selectedCountry.value);
      // Remove duplicates by city name
      const uniqueCities = allCities.filter((city, index, self) => 
        index === self.findIndex(c => c.name === city.name)
      );
      setCities(uniqueCities.map(city => ({ value: city.name, label: city.name })));
    } else {
      setCities([]);
    }
  }, [selectedCountry]);

  const onSubmit = async () => {
    const valid = await trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    
    const nextStep = step + 1;
    
    if (step < 3) {
      setStep(nextStep);
    } else {
      setLoading(true);
      setError("");
      setSuccess(false);
      try {
        const allData = getValues();
        const payload = {
          first_name: allData.firstName,
          last_name: allData.lastName,
          email: allData.email,
          mobile: allData.mobile ? allData.mobile : "",
          country: allData.country?.label || "",
          city: allData.city?.label || "",
          dob: allData.dob,
          languages: JSON.stringify(allData.languages),
          years_in_city: allData.yearsInCity,
          offer_service: allData.offersTours === "yes",
          bio: allData.bio,
          gov_id: allData.govId && allData.govId[0] ? allData.govId[0] : undefined,
          travel_licence: allData.licence && allData.licence[0] ? allData.licence[0] : undefined,
          instagram_link: allData.instagram,
          facebook_link: allData.facebook,
          linkedin_link: allData.linkedin,
          services: JSON.stringify(allData.services),
          service_availability: allData.availability,
          price_expectation: allData.minPrice,
          confirm_age: true,
          t_and_c: true,
          partnership: allData.agreeContact || false,
        };
        const missing = [];
        if (!payload.mobile) missing.push("Mobile");
        if (!payload.years_in_city) missing.push("Years in City");
        if (!payload.gov_id) missing.push("Government ID");
        if (!payload.travel_licence) missing.push("Travel Licence");
        if (missing.length > 0) {
          setError("Missing required: " + missing.join(", "));
          setLoading(false);
          return;
        }
        const resultAction = await dispatch(fetchExperts({
          token: session?.backendData?.accessToken,
          payload,
        }));
        if (fetchExperts.fulfilled.match(resultAction)) {
          setSuccess(true);
        } else {
          setError(resultAction.payload || "Submission failed");
        }
      } catch (err) {
        setError(err.message || "Submission failed");
      } finally {
        setLoading(false);
      }
    }
  };

  if (success) {
    const name = getValues("firstName") || session?.user?.name || "User";
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-2">
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-8 max-w-[957px] w-full text-center">
          <div className="flex justify-center mb-4 sm:mb-6">
            <div className="relative flex items-center justify-center" style={{ height: 100, width: 100 }}>
              <div style={{
                position: 'absolute',
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: '#F6FBF4',
                zIndex: 1
              }} />
              <div style={{
                position: 'absolute',
                width: 70,
                height: 70,
                borderRadius: '50%',
                background: '#ECF8EC',
                zIndex: 2
              }} />
              <div style={{
                position: 'absolute',
                width: 45,
                height: 45,
                borderRadius: '50%',
                background: '#5CB712',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 3
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M7 13l3 3 7-7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </div>
          </div>
          <h2 className="text-lg sm:text-2xl font-bold mb-2">Thanks, {name}! Your Form Has Been Submitted Successfully</h2>
          <p className="text-gray-600 mb-4 sm:mb-6 text-sm sm:text-base">
            We're excited to have you on board with Traveloure. Our team will review your details and get back to you within 3–5 business days. Once approved, your profile will go live and you'll start receiving leads or bookings.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center w-full">
            <button
              style={{ border: '2px solid #FF385C', color: '#FF385C', background: '#fff', fontSize: '1rem' }}
              className="rounded-lg px-4 py-2 font-semibold hover:bg-[#FFF0F4] transition w-full sm:w-auto"
              onClick={() => window.location.href = "/"}
            >
              Go to Homepage
            </button>
            <button
              style={{ background: '#FF385C', color: '#fff', border: '2px solid #FF385C', fontSize: '1rem' }}
              className="rounded-lg px-4 py-2 font-semibold hover:opacity-90 transition w-full sm:w-auto"
              onClick={() => router.push("/dashboard/travel-expert-status")}
            >
              Check Application Status
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <>
       
        <div className=" bg-white flex flex-col items-center py-4 px-2 md:px-8">
        <div className="w-full max-w-4xl flex flex-col items-center">
          <button className="flex items-center text-gray-500 mb-4 hover:underline self-start" onClick={() => window.history.back()}>
            <ChevronLeft className="h-5 w-5 mr-1" /> Back to Previous Page
          </button>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
            <span className="text-black"><span className="text-green-600">Fill in Your Details</span> to Join as a Traveloure Expert</span>
          </h2>
          <div className="w-full flex justify-center">
            <div className="w-full max-w-5xl flex flex-col md:flex-row gap-4 justify-center">
              <div className="w-full overflow-x-auto scrollbar-hide">
                <Stepper
                  activeStep={step}
                  styleConfig={{
                    activeBgColor: '#fff',
                    activeTextColor: '#FF385C',
                    completedBgColor: '#fff',
                    completedTextColor: '#FF385C',
                    inactiveBgColor: '#fff',
                    inactiveTextColor: '#bdbdbd',
                    circleFontSize: '0.9rem',
                    size: '2em',
                    labelFontSize: '0.85rem',
                    borderRadius: '50%',
                    fontWeight: 500,
                    activeBorderColor: '#FF385C',
                    completedBorderColor: '#bdbdbd',
                    inactiveBorderColor: '#bdbdbd',
                    connectorColor: '#d1d5db',
                    connectorThickness: 1,
                    connectorStyle: 'dashed',
                  }}
                  className="w-full min-w-[600px] sm:min-w-0 flex-nowrap"
                >
                  <Step label={<span className="whitespace-nowrap text-xs sm:text-sm">Personal Information</span>} />
                  <Step label={<span className="whitespace-nowrap text-xs sm:text-sm">Expertise & Experience</span>} />
                  <Step label={<span className="whitespace-nowrap text-xs sm:text-sm">Verification</span>} />
                  <Step label={<span className="whitespace-nowrap text-xs sm:text-sm">Services & Agreements</span>} />
                </Stepper>
              </div>
            </div>
          </div>
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-lg p-4 md:p-8 w-full max-w-lg md:max-w-2xl lg:max-w-4xl mt-4 " >
            {step === 0 && (
              <>
                <form onSubmit={handleSubmit(onSubmit)}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* First Name */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        First Name:<span className="text-[#FF385C]">*</span>
                      </label>
                      <Controller
                        name="firstName"
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            placeholder="First Name"
                            readOnly={!!(session?.user?.name || session?.user?.firstName || session?.user?.first_name)}
                            className={!!(session?.user?.name || session?.user?.firstName || session?.user?.first_name) 
                              ? "bg-gray-100 cursor-not-allowed" 
                              : ""
                            }
                          />
                        )}
                      />
                      {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
                    </div>
                    {/* Last Name */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Last Name:<span className="text-[#FF385C]">*</span>
                      </label>
                      <Controller
                        name="lastName"
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            placeholder="Last Name"
                            readOnly={!!(session?.user?.name || session?.user?.lastName || session?.user?.last_name)}
                            className={!!(session?.user?.name || session?.user?.lastName || session?.user?.last_name) 
                              ? "bg-gray-100 cursor-not-allowed" 
                              : ""
                            }
                          />
                        )}
                      />
                      {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
                    </div>
                    {/* Email Address */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Email Address:<span className="text-[#FF385C]">*</span>
                      </label>
                      <Controller
                        name="email"
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            placeholder="your@email.com"
                            type="email"
                            readOnly
                            className="bg-gray-100 cursor-not-allowed"
                          />
                        )}
                      />
                      {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                    </div>
                    {/* Country of Residence */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Country of Residence:<span className="text-[#FF385C]">*</span>
                      </label>
                      <Controller
                        name="country"
                        control={control}
                        render={({ field }) => (
                          <ReactSelect
                            {...field}
                            options={countriesList}
                            placeholder="Select or type country"
                            isClearable
                            onChange={val => {
                              field.onChange(val);
                              setValue("city", null); // Reset city when country changes
                              // Reset mobile number to clear old country code
                              if (!session?.user?.mobile && !session?.user?.phone) {
                                setValue("mobile", "");
                              }
                            }}
                            value={field.value}
                          />
                        )}
                      />
                      {errors.country && <p className="text-red-500 text-xs mt-1">{errors.country.message}</p>}
                    </div>
                    {/* City of Residence */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        City of Residence:<span className="text-[#FF385C]">*</span>
                      </label>
                      <Controller
                        name="city"
                        control={control}
                        render={({ field }) => (
                          <ReactSelect
                            {...field}
                            options={cities}
                            placeholder="Select or type city"
                            isClearable
                            isDisabled={!selectedCountry || !selectedCountry.value}
                            value={field.value}
                          />
                        )}
                      />
                      {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city.message}</p>}
                    </div>
                    {/* Mobile Number */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Mobile Number:<span className="text-[#FF385C]">*</span>
                      </label>
                        <Controller
                          name="mobile"
                          control={control}
                          render={({ field }) => {
                            const isPrefilled = !!(session?.user?.mobile || session?.user?.phone);
                            // Get the country code from selected country, default to 'us'
                            const phoneCountry = selectedCountry?.value?.toLowerCase() || 'us';
                            return (
                              <PhoneInput
                                key={phoneCountry} // Force re-render when country changes
                                value={field.value}
                                onChange={field.onChange}
                                defaultCountry={phoneCountry}
                                placeholder="Enter your mobile number"
                                className="w-full"
                                showCountryCode={true}
                                showCountryFlag={true}
                                searchPlaceholder="Search country..."
                                searchNotFound="No country found"
                                preferredCountries={['us', 'gb', 'in', 'ca', 'au']}
                                enableSearch={true}
                                disableSearchIcon={false}
                                disabled={isPrefilled}
                                searchStyle={{
                                  width: '100%',
                                  padding: '8px 12px', 
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  outline: 'none'
                                }}
                                countryListStyle={{
                                  maxHeight: '200px',
                                  overflowY: 'auto',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  backgroundColor: 'white',
                                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}
                                countryButtonStyle={{
                                  border: '1px solid #e5e7eb',
                                  borderRight: 'none',
                                  borderRadius: '6px 0 0 6px',
                                  backgroundColor: isPrefilled ? '#f3f4f6' : '#f9fafb',
                                  padding: '8px 12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  minWidth: '120px',
                                  flexShrink: '0',
                                  cursor: isPrefilled ? 'not-allowed' : 'pointer'
                                }}
                                inputStyle={{
                                  border: '1px solid #e5e7eb',
                                  borderLeft: 'none',
                                  borderRadius: '0 6px 6px 0',
                                  padding: '8px 12px',
                                  fontSize: '14px',
                                  backgroundColor: isPrefilled ? '#f3f4f6' : 'white',
                                  color: '#374151',
                                  outline: 'none',
                                  flex: '1',
                                  width: '100%',
                                  minHeight: '40px',
                                  cursor: isPrefilled ? 'not-allowed' : 'text'
                                }}
                              />
                            );
                          }}
                        />
                      {errors.mobile && <p className="text-red-500 text-xs mt-1">{errors.mobile.message}</p>}
                    </div>
                    {/* Date of Birth */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Date of Birth:<span className="text-[#FF385C]">*</span>
                      </label>
                      <Controller
                        name="dob"
                        control={control}
                        render={({ field }) => {
                          const isPrefilled = !!(session?.user?.dob || session?.user?.dateOfBirth);
                          return (
                            <DatePicker
                              key={calendarDate.getTime()}
                              selected={field.value ? new Date(field.value) : null}
                              onChange={date => field.onChange(date ? date.toISOString().split('T')[0] : '')}
                              dateFormat="MMMM dd, yyyy"
                              placeholderText="Select your date of birth"
                              className="w-full"
                              showYearDropdown
                              showMonthDropdown
                              dropdownMode="select"
                              popperClassName="datepicker-popper"
                              popperPlacement="bottom-start"
                              disabled={isPrefilled}
                              popperModifiers={[
                                {
                                  name: "offset",
                                  options: {
                                    offset: [0, 8],
                                  },
                                },
                              ]}
                              customInput={
                                <Input
                                  className={`w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FF385C] focus:border-[#FF385C] ${
                                    isPrefilled ? 'cursor-not-allowed bg-gray-100' : 'cursor-pointer bg-white'
                                  }`}
                                  readOnly
                                  style={{ width: '100%', minHeight: '40px' }}
                                />
                              }
                              renderCustomHeader={({
                                date,
                                decreaseMonth,
                                increaseMonth,
                                prevMonthButtonDisabled,
                                nextMonthButtonDisabled,
                              }) => (
                                <div className="flex items-center justify-between mb-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (!prevMonthButtonDisabled && !isPrefilled) {
                                        decreaseMonth();
                                      }
                                    }}
                                    disabled={prevMonthButtonDisabled || isPrefilled}
                                    className="text-white hover:bg-white hover:bg-opacity-20 p-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ 
                                      pointerEvents: (prevMonthButtonDisabled || isPrefilled) ? 'none' : 'auto',
                                      cursor: (prevMonthButtonDisabled || isPrefilled) ? 'not-allowed' : 'pointer'
                                    }}
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="15,18 9,12 15,6"></polyline>
                                    </svg>
                                  </button>
                                  
                                  <div className="flex items-center gap-2">
                                    <div className="text-white font-semibold">
                                      {date.toLocaleDateString('en-US', { month: 'long' })}
                                    </div>
                                    <CustomYearDropdown
                                      date={calendarDate}
                                      onYearChange={(year) => {
                                        if (isPrefilled) return;
                                        const newDate = new Date(calendarDate);
                                        newDate.setFullYear(year);
                                        setCalendarDate(newDate);
                                        
                                        // Always update the form field with the new year
                                        if (field.value) {
                                          const selectedDate = new Date(field.value);
                                          selectedDate.setFullYear(year);
                                          field.onChange(selectedDate.toISOString().split('T')[0]);
                                        } else {
                                          // If no date is selected, create a new date with the selected year
                                          const newDateWithYear = new Date();
                                          newDateWithYear.setFullYear(year);
                                          newDateWithYear.setMonth(newDate.getMonth());
                                          newDateWithYear.setDate(1);
                                          field.onChange(newDateWithYear.toISOString().split('T')[0]);
                                        }
                                      }}
                                    />
                                  </div>
                                  
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (!nextMonthButtonDisabled && !isPrefilled) {
                                        increaseMonth();
                                      }
                                    }}
                                    disabled={nextMonthButtonDisabled || isPrefilled}
                                    className="text-white hover:bg-white hover:bg-opacity-20 p-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ 
                                      pointerEvents: (nextMonthButtonDisabled || isPrefilled) ? 'none' : 'auto',
                                      cursor: (nextMonthButtonDisabled || isPrefilled) ? 'not-allowed' : 'pointer'
                                    }}
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="9,18 15,12 9,6"></polyline>
                                    </svg>
                                  </button>
                                </div>
                              )}
                              yearDropdownItemNumber={50}
                              scrollableYearDropdown
                            />
                          );
                        }}
                      />
                      {errors.dob && <p className="text-red-500 text-xs mt-1">{errors.dob.message}</p>}
                    </div>
                    {/* Languages Spoken */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Languages Spoken:<span className="text-[#FF385C]">*</span>
                      </label>
                      <Controller
                        name="languages"
                        control={control}
                        render={({ field }) => (
                          <ReactSelect
                            {...field}
                            options={languageOptions}
                            isMulti
                            placeholder="Select languages"
                            onChange={val => field.onChange(val.map(v => v.value))}
                            value={languageOptions.filter(opt => field.value.includes(opt.value))}
                          />
                        )}
                      />
                      {errors?.languages && <p className="text-red-500 text-xs mt-1">{errors.languages.message}</p>}
                    </div>
                  </div>
                  <div className="flex justify-end mt-8">
                    <button
                      type="submit"
                      className="bg-[#FF385C] text-white rounded-lg px-8 py-2 font-semibold hover:bg-[#e62e50] transition"
                    >
                      Next
                    </button>
                  </div>
                </form>
              </>
            )}
            {step === 1 && (
              <form onSubmit={handleSubmit(onSubmit)}>
                {/* Years Living in This City */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Years Living in This City:<span className="text-[#FF385C]">*</span>
                  </label>
                  <Controller
                    name="yearsInCity"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center gap-2 bg-[#fafafd] border border-gray-200 rounded-lg w-fit px-2 py-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="rounded-md border border-gray-200 bg-white text-[#FF385C] hover:bg-[#ffe6ec] focus:ring-2 focus:ring-[#FF385C] px-3 py-2"
                          onClick={() => field.onChange(Math.max(0, field.value - 1))}
                        >
                          -
                        </Button>
                        <Input
                          {...field}
                          type="number"
                          min={0}
                          max={99}
                          className="w-16 text-center bg-transparent border-none focus:ring-0 focus:outline-none shadow-none"
                          readOnly
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          className="rounded-md border border-gray-200 bg-white text-[#FF385C] hover:bg-[#ffe6ec] focus:ring-2 focus:ring-[#FF385C] px-3 py-2"
                          onClick={() => field.onChange(Math.min(99, field.value + 1))}
                        >
                          +
                        </Button>
                      </div>
                    )}
                  />
                  {errors.yearsInCity && <p className="text-red-500 text-xs mt-1">{errors.yearsInCity.message}</p>}
                </div>

                {/* Offer Tours */}
                <div className="mt-6">
                  <label className="block text-sm font-medium mb-1">
                    Do you currently offer tours or planning services?<span className="text-[#FF385C]">*</span>
                  </label>
                  <Controller
                    name="offersTours"
                    control={control}
                    render={({ field }) => (
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex gap-8 mt-2"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="yes" id="offersTours-yes" />
                          <label htmlFor="offersTours-yes" className={`text-base ${field.value === "yes" ? "text-[#FF385C]" : "text-gray-400"}`}>Yes</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="no" id="offersTours-no" />
                          <label htmlFor="offersTours-no" className={`text-base ${field.value === "no" ? "text-[#FF385C]" : "text-gray-400"}`}>No</label>
                        </div>
                      </RadioGroup>
                    )}
                  />
                  {errors.offersTours && <p className="text-red-500 text-xs mt-1">{errors.offersTours.message}</p>}
                </div>

                {/* Short Bio */}
                <div className="mt-6">
                  <label className="block text-sm font-medium mb-1">
                    Short Bio:<span className="text-[#FF385C]">*</span>
                  </label>
                  <Controller
                    name="bio"
                    control={control}
                    render={({ field }) => (
                      <Textarea
                        {...field}
                        placeholder='Tell us about your local expertise, passions, and what makes your city special to you.'
                        rows={4}
                        className="bg-[#fafafd] border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#FF385C]"
                      />
                    )}
                  />
                  {errors.bio && <p className="text-red-500 text-xs mt-1">{errors.bio.message}</p>}
                </div>

                {/* Social Links - moved from step 3 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                      <Image
                        src="/instalogo.png"
                        alt="Instagram"
                        width={20}
                        height={20}
                        className="w-5 h-5"
                      />
                      Link Your Instagram Profile:
                    </label>
                    <Controller
                      name="instagram"
                      control={control}
                      render={({ field }) => (
                        <Input {...field} placeholder="Add URL Here" />
                      )}
                    />
                    {errors.instagram && <p className="text-red-500 text-xs mt-1">{errors.instagram.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                      <Image
                        src="/logos_facebook.png"
                        alt="Facebook"
                        width={20}
                        height={20}
                        className="w-5 h-5"
                      />
                      Link Your Facebook Profile:
                    </label>
                    <Controller
                      name="facebook"
                      control={control}
                      render={({ field }) => (
                        <Input {...field} placeholder="Add URL Here" />
                      )}
                    />
                    {errors.facebook && <p className="text-red-500 text-xs mt-1">{errors.facebook.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                      <Image
                        src="/linkedin.png"
                        alt="LinkedIn"
                        width={20}
                        height={20}
                        className="w-5 h-5"
                      />
                      Link Your LinkedIn Profile:
                    </label>
                    <Controller
                      name="linkedin"
                      control={control}
                      render={({ field }) => (
                        <Input {...field} placeholder="Add URL Here" />
                      )}
                    />
                    {errors.linkedin && <p className="text-red-500 text-xs mt-1">{errors.linkedin.message}</p>}
                  </div>
                </div>

                {/* Navigation Buttons */}
                <div className="flex justify-end mt-8 gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="border border-[#FF385C] text-[#FF385C] hover:bg-[#ffe6ec] rounded-lg px-8"
                    onClick={() => setStep(step - 1)}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="bg-[#FF385C] text-white rounded-lg px-8 hover:bg-[#e62e50]"
                  >
                    Next
                  </Button>
                </div>
              </form>
            )}
            {step === 2 && (
              <form onSubmit={handleSubmit(onSubmit)}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Photo */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Upload a photo of yourself:<span className="text-[#FF385C]">*</span>
                    </label>
                    <Controller
                      name="photo"
                      control={control}
                      render={({ field }) => (
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept="image/*,image/heic,image/heif"
                            onChange={e => {
                              if (e.target.files && e.target.files.length > 0) {
                                field.onChange(e.target.files);
                              }
                            }}
                            capture="environment"
                          />
                          {field.value && field.value.length > 0 && (
                            <div className="flex items-center bg-[#fafafd] border border-gray-200 rounded px-3 py-1 text-gray-500 text-sm">
                              {field.value[0].name}
                              <button
                                type="button"
                                className="ml-2 text-gray-400 hover:text-[#FF385C] font-bold"
                                onClick={(e) => {
                                  e.preventDefault();
                                  field.onChange(null);
                                }}
                                aria-label="Remove file"
                              >
                                &times;
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    />
                    {errors.photo && <p className="text-red-500 text-xs mt-1">{errors.photo.message}</p>}
                  </div>
                  {/* Government ID */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Upload Government ID:<span className="text-[#FF385C]">*</span>
                    </label>
                    <Controller
                      name="govId"
                      control={control}
                      render={({ field }) => (
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept="image/*,image/heic,image/heif,.pdf"
                            onChange={e => {
                              if (e.target.files && e.target.files.length > 0) {
                                field.onChange(e.target.files);
                              }
                            }}
                            capture="environment"
                          />
                          {field.value && field.value.length > 0 && (
                            <div className="flex items-center bg-[#fafafd] border border-gray-200 rounded px-3 py-1 text-gray-500 text-sm">
                              {field.value[0].name}
                              <button
                                type="button"
                                className="ml-2 text-gray-400 hover:text-[#FF385C] font-bold"
                                onClick={(e) => {
                                  e.preventDefault();
                                  field.onChange(null);
                                }}
                                aria-label="Remove file"
                              >
                                &times;
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    />
                    {errors.govId && <p className="text-red-500 text-xs mt-1">{errors.govId.message}</p>}
                  </div>
                  {/* Licence (optional) */}
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Upload Your Tour & Travel Licence:
                    </label>
                    <Controller
                      name="licence"
                      control={control}
                      render={({ field }) => (
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept="image/*,image/heic,image/heif,.pdf"
                            onChange={e => {
                              if (e.target.files && e.target.files.length > 0) {
                                field.onChange(e.target.files);
                              }
                            }}
                            capture="environment"
                          />
                          {field.value && field.value.length > 0 && (
                            <div className="flex items-center bg-[#fafafd] border border-gray-200 rounded px-3 py-1 text-gray-500 text-sm">
                              {field.value[0].name}
                              <button
                                type="button"
                                className="ml-2 text-gray-400 hover:text-[#FF385C] font-bold"
                                onClick={(e) => {
                                  e.preventDefault();
                                  field.onChange(null);
                                }}
                                aria-label="Remove file"
                              >
                                &times;
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    />
                    {errors.licence && <p className="text-red-500 text-xs mt-1">{errors.licence.message}</p>}
                  </div>
                </div>
                {/* Navigation Buttons */}
                <div className="flex justify-end mt-8 gap-4">
                  <Button type="button" variant="outline" className="border border-[#FF385C] text-[#FF385C] hover:bg-[#ffe6ec] rounded-lg px-8" onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                  <Button type="submit" className="bg-[#FF385C] text-white rounded-lg px-8 hover:bg-[#e62e50]">
                    Next
                  </Button>
                </div>
              </form>
            )}
            {step === 3 && (
              <form onSubmit={handleSubmit(onSubmit)}>
                {/* Services Multi-select */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Select the Services You are Willing to Offer:<span className="text-[#FF385C]">*</span>
                  </label>
                  <Controller
                    name="services"
                    control={control}
                    render={({ field }) => {
                      const defaultOptions = [
                        "Itinerary Planning",
                        "On-Ground Guiding",
                        "Messaging Support",
                        "Virtual Consultation",
                      ];
                      // Combine customServices and defaultOptions, no duplicates
                      const options = [...customServices, ...defaultOptions.filter(opt => !customServices.includes(opt))];
                      return (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {options.map((service) => (
                            <button
                              type="button"
                              key={service}
                              className={`px-4 py-1 rounded-full border text-sm font-medium transition-all
                                ${field.value.includes(service)
                                  ? "bg-white border-[#22c55e] text-[#22c55e] ring-2 ring-[#22c55e]"
                                  : "bg-[#f4f4f4] border-gray-200 text-gray-400 hover:border-[#22c55e]"}
                              `}
                              onClick={() =>
                                field.value.includes(service)
                                  ? field.onChange(field.value.filter((s) => s !== service))
                                  : field.onChange([...field.value, service])
                              }
                            >
                              {service}
                            </button>
                          ))}
                        </div>
                      );
                    }}
                  />
                  {errors.services && <p className="text-red-500 text-xs mt-1">{errors.services.message}</p>}
                  {/* Add Custom Service */}
                  <div className="flex gap-2 mb-4">
                    <Controller
                      name="customService"
                      control={control}
                      render={({ field }) => (
                        <Input {...field} placeholder="Add Custom Service" className="w-60" />
                      )}
                    />
                    <Button
                      type="button"
                      className="bg-[#FF385C] text-white rounded-lg px-6"
                      onClick={() => {
                        const custom = getValues("customService").trim();
                        const defaultOptions = [
                          "Itinerary Planning",
                          "On-Ground Guiding",
                          "Messaging Support",
                          "Virtual Consultation",
                        ];
                        if (!custom) {
                          setCustomServiceError("Custom service cannot be empty");
                          return;
                        }
                        if (customServices.includes(custom) || defaultOptions.includes(custom)) {
                          setCustomServiceError("Custom service already added");
                          return;
                        }
                        setCustomServices([...customServices, custom]);
                        setValue("customService", "");
                        setCustomServiceError("");
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  {customServiceError && <p className="text-red-500 text-xs mt-1">{customServiceError}</p>}
                </div>
                {/* Service Availability & Pricing */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Service Availability<span className="text-[#FF385C]">*</span></label>
                    <div className="flex gap-2">
                      <Controller
                        name="availability"
                        control={control}
                        render={({ field }) => (
                          <Input {...field} type="number" min={1} className="w-24" value={field.value ?? ""} onChange={e => {
                            const val = e.target.value;
                            field.onChange(val === "" ? undefined : Number(val));
                          }} />
                        )}
                      />
                      <Controller
                        name="availabilityUnit"
                        control={control}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Hours/Week">Hours/Week</SelectItem>
                              <SelectItem value="Hours/Month">Hours/Month</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    {errors.availability && <p className="text-red-500 text-xs mt-1">{errors.availability.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Minimum Pricing Expectations</label>
                    <div className="flex gap-2 items-center">
                      <Controller
                        name="minPrice"
                        control={control}
                        render={({ field }) => (
                          <Input {...field} type="number" min={1} className="w-24" value={field.value ?? ""} onChange={e => {
                            const val = e.target.value;
                            field.onChange(val === "" ? undefined : Number(val));
                          }} />
                        )}
                      />
                      <span className="text-gray-400">Per Hour</span>
                    </div>
                    {errors.minPrice && <p className="text-red-500 text-xs mt-1">{errors.minPrice.message}</p>}
                  </div>
                </div>
                {/* Agreements */}
                <div className="flex flex-col gap-2 mb-4">
                  <Controller
                    name="agreeAccurate"
                    control={control}
                    render={({ field }) => (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} className="accent-green-500 w-5 h-5" />
                        <span>I confirm that the information provided is accurate and I am over 18 years of age.</span>
                      </label>
                    )}
                  />
                  {errors.agreeAccurate && <p className="text-red-500 text-xs mt-1">{errors.agreeAccurate.message}</p>}
                  <Controller
                    name="agreeTerms"
                    control={control}
                    render={({ field }) => (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} className="accent-green-500 w-5 h-5" />
                        <span>
                          I agree to Traveloure's{" "}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.open('/travel-expert-terms', '_blank', 'noopener,noreferrer');
                            }}
                            className="underline text-[#FF385C] hover:text-[#e02d50]"
                          >
                            Terms of Service
                          </button>{" "}
                          and{" "}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.open('/privacy-policy', '_blank', 'noopener,noreferrer');
                            }}
                            className="underline text-[#FF385C] hover:text-[#e02d50]"
                          >
                            Privacy Policy
                          </button>.
                        </span>
                      </label>
                    )}
                  />
                  {errors.agreeTerms && <p className="text-red-500 text-xs mt-1">{errors.agreeTerms.message}</p>}
                  <Controller
                    name="agreeContact"
                    control={control}
                    render={({ field }) => (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} className="accent-green-500 w-5 h-5" />
                        <span>I consent to be contacted by Traveloure for partnership opportunities and traveler requests.</span>
                      </label>
                    )}
                  />
                </div>
                {/* Navigation Buttons */}
                <div className="flex justify-end mt-8 gap-4">
                  <Button type="button" variant="outline" className="border border-[#FF385C] text-[#FF385C] hover:bg-[#ffe6ec] rounded-lg px-8" onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                  <Button type="submit" className="bg-[#FF385C] text-white rounded-lg px-8 hover:bg-[#e62e50]">
                    Submit
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
      
      </>
    </ProtectedRoute>
  );
} 