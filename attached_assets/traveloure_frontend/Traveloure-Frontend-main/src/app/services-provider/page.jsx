"use client"

import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "../../components/ui/input";
import { useServiceProvider } from "../../hooks/useServiceProvider";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
;

import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { ChevronLeft } from "lucide-react";
import { Stepper, Step } from "react-form-stepper";
import Image from "next/image";
import { Country, City } from "country-state-city";
import ReactSelect from "react-select";
import { PhoneInput } from 'react-international-phone';
import ProtectedRoute from "../../components/protectedroutes/ProtectedRoutes";
import 'react-international-phone/style.css';

// Phone Input Styles for Production
const phoneInputStyles = `
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
    height: 40px !important;
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
  styleSheet.innerText = phoneInputStyles;
  document.head.appendChild(styleSheet);
}

const languageOptions = ["English", "Spanish", "French", "German", "Hindi", "Mandarin"];

// Phone number validation helper
const validatePhoneNumber = (phone) => {
  if (!phone) return false;
  
  // Remove spaces and special characters except +
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  
  // Multiple validation patterns to match different backend expectations
  const patterns = [
    /^\+[1-9]\d{9,14}$/, // Standard international format: +1234567890
    /^\+[1-9]\d{10,15}$/, // Alternative with more digits
    /^\+[1-9]\d{8,14}$/,  // Alternative with fewer digits
  ];
  
  return patterns.some(pattern => pattern.test(cleaned));
};

const businessTypes = [
  "Transport Services",
  "Accommodation",
  "Guided Tours",
  "Food & Beverage",
  "Other",
];

const serviceOptions = [
  "Taxi & Ride Services",
  "Car Rentals",
  "Two-Wheeler Rentals",
  "Group Transport",
];

const step1Schema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  contactName: z.string().min(1, "Contact person name is required"),
  businessEmail: z.string().email("Invalid email"),
  website: z.string().optional().or(z.literal("")),
  mobile: z.string()
    .min(8, "Mobile number is required")
    .refine((val) => validatePhoneNumber(val), "Please provide a valid phone number with country code (e.g., +1234567890)"),
  whatsapp: z.string()
    .min(8, "WhatsApp number is required")
    .refine((val) => validatePhoneNumber(val), "Please provide a valid phone number with country code (e.g., +1234567890)"),
  country: z.object({ value: z.string(), label: z.string() }),
  city: z.object({ value: z.string(), label: z.string() }),
  address: z.string().min(1, "Registered address is required"),
  bookingLink: z.string().optional().or(z.literal("")),
  gst: z.string().optional().or(z.literal("")),
  instagram: z.string().url().optional().or(z.literal("")),
  facebook: z.string().url().optional().or(z.literal("")),
  linkedin: z.string().url().optional().or(z.literal("")),
}).refine(data => data.country && data.city, {
  message: "Select country first, then city",
  path: ["city"],
});

const step2Schema = z.object({
  files: z
    .any()
    .refine((val) => !val || val.length <= 5, "Max 5 files allowed"),
  businessType: z.string().min(1, "Business type is required"),
  services: z.array(z.string()).min(1, "Select at least one service"),
  description: z.string().min(1, "Description is required"),
  instantBooking: z.enum(["yes", "no"], { required_error: "Select an option" }),
});

const step3Schema = z.object({
  logo: z
    .any()
    .refine((val) => val && val.length > 0, "Logo is required"),
  license: z
    .any()
    .refine((val) => val && val.length > 0, "Business license/permit is required"),
  gst: z
    .any()
    .refine((val) => val && val.length > 0, "GST or Tax Registration is required"),
  confirmInfo: z.literal(true, {
    errorMap: () => ({ message: "You must confirm the information is accurate." }),
  }),
  agreeTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the Terms of Service and Privacy Policy." }),
  }),
  consentContact: z.boolean().optional(),
});

export default function ServiceProviderRegistration(props) {
  const { loading, error, createProvider } = useServiceProvider();
  const { data: session } = useSession();
  
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedServices, setSelectedServices] = useState([]);
  const [customService, setCustomService] = useState("");
  const [files, setFiles] = useState([]);
  const [logoFiles, setLogoFiles] = useState([]);
  const [licenseFiles, setLicenseFiles] = useState([]);
  const [gstFiles, setGstFiles] = useState([]);
  const [cities, setCities] = useState([]);
  const countries = Country.getAllCountries().map(c => ({
    value: c.isoCode,
    label: c.name,
  }));
  const [success, setSuccess] = useState(false);

  // Step 1 form
  const step1Form = useForm({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      businessName: "",
      contactName: "",
      businessEmail: "",
      website: "",
      mobile: "",
      whatsapp: "",
      country: null,
      city: null,
      address: "",
      bookingLink: "",
      gst: "",
      instagram: "",
      facebook: "",
      linkedin: "",
    },
  });

  // Step 2 form
  const step2Form = useForm({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      files: [],
      businessType: "",
      services: [],
      description: "",
      instantBooking: undefined,
    },
  });

  // Step 3 form
  const step3Form = useForm({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      logo: [],
      license: [],
      gst: [],
      confirmInfo: false,
      agreeTerms: false,
      consentContact: false,
    },
  });

  // File upload handler
  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files).slice(0, 5 - files.length);
    setFiles((prev) => [...prev, ...newFiles]);
    step2Form.setValue("files", [...files, ...newFiles]);
  };
  const removeFile = (idx) => {
    const updated = files.filter((_, i) => i !== idx);
    setFiles(updated);
    step2Form.setValue("files", updated);
  };

  // Service selection
  const toggleService = (service) => {
    let updated;
    if (selectedServices.includes(service)) {
      updated = selectedServices.filter((s) => s !== service);
    } else {
      updated = [...selectedServices, service];
    }
    setSelectedServices(updated);
    step2Form.setValue("services", updated, { shouldValidate: true });
    if (updated.length > 0) step2Form.clearErrors("services");
  };
  const addCustomService = () => {
    if (customService && !selectedServices.includes(customService)) {
      const updated = [...selectedServices, customService];
      setSelectedServices(updated);
      step2Form.setValue("services", updated, { shouldValidate: true });
      setCustomService("");
      if (updated.length > 0) step2Form.clearErrors("services");
    }
  };

  // File handlers for step 3
  const handleLogoChange = (e) => {
    const newFiles = Array.from(e.target.files).slice(0, 1);
    setLogoFiles(newFiles);
    step3Form.setValue("logo", newFiles, { shouldValidate: true });
    step3Form.clearErrors("logo");
  };
  const removeLogo = () => {
    setLogoFiles([]);
    step3Form.setValue("logo", [], { shouldValidate: true });
    step3Form.clearErrors("logo");
  };
  const handleLicenseChange = (e) => {
    const newFiles = Array.from(e.target.files).slice(0, 1);
    setLicenseFiles(newFiles);
    step3Form.setValue("license", newFiles, { shouldValidate: true });
    step3Form.clearErrors("license");
  };
  const removeLicense = () => {
    setLicenseFiles([]);
    step3Form.setValue("license", [], { shouldValidate: true });
    step3Form.clearErrors("license");
  };
  const handleGstChange = (e) => {
    const newFiles = Array.from(e.target.files).slice(0, 1);
    setGstFiles(newFiles);
    step3Form.setValue("gst", newFiles, { shouldValidate: true });
    step3Form.clearErrors("gst");
  };
  const removeGst = () => {
    setGstFiles([]);
    step3Form.setValue("gst", [], { shouldValidate: true });
    step3Form.clearErrors("gst");
  };

  // Step navigation
  const handleNext = async () => {
    if (step === 0) {
      const valid = await step1Form.trigger();
      if (valid) {
        setStep(1);
        step1Form.clearErrors();
      } else {
        toast.error("Please fill in all required fields in Step 1");
      }
    } else if (step === 1) {
      const valid = await step2Form.trigger();
      if (valid) {
        setStep(2);
        step2Form.clearErrors();
      } else {
        toast.error("Please fill in all required fields in Step 2");
      }
    } else if (step === 2) {
      const valid = await step3Form.trigger();
      if (valid) {
        const allData = {
          ...step1Form.getValues(),
          ...step2Form.getValues(),
          ...step3Form.getValues(),
        };
        // Ensure phone numbers are in correct format with country code
        const formatPhoneNumber = (phone) => {
          if (!phone) return "";
          
          // Log the original phone number for debugging
          console.log("Original phone number:", phone);
          console.log("Original phone char codes:", phone.split('').map(c => c.charCodeAt(0)));
          
          // Remove any spaces, special characters, and non-printable characters except +
          let cleaned = phone.replace(/[\s\-\(\)\u00A0\u2000-\u200F\u2028-\u202F]/g, '');
          
          // Remove any non-digit characters except +
          cleaned = cleaned.replace(/[^\d+]/g, '');
          
          console.log("Cleaned phone number:", cleaned);
          console.log("Cleaned phone char codes:", cleaned.split('').map(c => c.charCodeAt(0)));
          
          // If phone already starts with +, validate and return
          if (cleaned.startsWith('+')) {
            if (validatePhoneNumber(cleaned)) {
              console.log("Phone already has + and is valid:", cleaned);
              return cleaned;
            } else {
              console.log("Phone has + but is invalid format:", cleaned);
              // Try to fix common issues
              if (cleaned.length < 10) {
                console.log("Phone too short, might be missing digits");
              }
              return cleaned; // Return as is, validation will catch it
            }
          }
          
          // If phone starts with country code without +, add +
          if (cleaned.match(/^\d{1,4}/)) {
            const formatted = `+${cleaned}`;
            if (validatePhoneNumber(formatted)) {
              console.log("Added + to phone and it's valid:", formatted);
              return formatted;
            } else {
              console.log("Added + but phone is still invalid:", formatted);
              return formatted; // Return as is, validation will catch it
            }
          }
          
          console.log("Phone format not recognized, returning as is:", phone);
          return phone;
        };

        // Pass a plain object to the thunk, not FormData
        const providerPayload = {
          businessName: allData.businessName,
          contactName: allData.contactName,
          businessEmail: allData.businessEmail,
          gst: allData.gst,
          mobile: formatPhoneNumber(allData.mobile), // Ensure proper format with country code
          whatsapp: formatPhoneNumber(allData.whatsapp), // Ensure proper format with country code
          country: allData.country?.value,
          address: allData.address,
          businessType: allData.businessType,
          description: allData.description,
          instantBooking: allData.instantBooking,
          services: allData.services,
          logo: logoFiles[0],
          license: licenseFiles[0],
          gstFile: gstFiles[0],
          servicePhotos: files,
          confirmInfo: allData.confirmInfo,
          agreeTerms: allData.agreeTerms,
          consentContact: allData.consentContact,
        };

        // Debug: Log phone numbers to ensure correct format
        console.log("Mobile number:", providerPayload.mobile);
        console.log("WhatsApp number:", providerPayload.whatsapp);
        console.log("Mobile validation result:", validatePhoneNumber(providerPayload.mobile));
        console.log("WhatsApp validation result:", validatePhoneNumber(providerPayload.whatsapp));
        console.log("Mobile length:", providerPayload.mobile?.length);
        console.log("WhatsApp length:", providerPayload.whatsapp?.length);
        console.log("Mobile char codes:", providerPayload.mobile?.split('').map(c => c.charCodeAt(0)));
        console.log("WhatsApp char codes:", providerPayload.whatsapp?.split('').map(c => c.charCodeAt(0)));
        console.log("Full payload being sent:", providerPayload);
        // Debug: Log all fields before sending
        const result = await createProvider(providerPayload);
        if (result.meta.requestStatus === 'fulfilled') {
          // Show toast notification about password
          toast.success("You will get your new password after your request is approved on your email", {
            duration: 3000, // Show for 6 seconds
            position: "top-center",
          });
          setSuccess(true);
          step1Form.reset();
          step2Form.reset();
          step3Form.reset();
        } else {
          console.error('Failed to create service provider:', result.error);
          toast.error("Failed to submit application. Please try again.");
        }
      } else {
        toast.error("Please fill in all required fields and upload required documents in Step 3");
      }
    }
  };
  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  // Update cities when country changes
  const selectedCountry = step1Form.watch("country");
  useEffect(() => {
    if (selectedCountry && selectedCountry.value) {
      setCities(City.getCitiesOfCountry(selectedCountry.value).map(city => ({ value: city.name, label: city.name })));
    } else {
      setCities([]);
    }
  }, [selectedCountry]);

  // Email is not pre-filled - users can enter any business email

  // Ensure PhoneInput styles are applied in production
  useEffect(() => {
    const styleId = 'phone-input-styles';
    if (!document.getElementById(styleId)) {
      const styleSheet = document.createElement("style");
      styleSheet.id = styleId;
      styleSheet.type = "text/css";
      styleSheet.innerText = phoneInputStyles;
      document.head.appendChild(styleSheet);
    }
  }, []);

  if (success) {
    const name = step1Form.getValues("contactName") || session?.user?.name || "User";
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-2">
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-8 max-w-xl w-full text-center">
          <div className="flex justify-center mb-4 sm:mb-6">
            <div className="relative flex items-center justify-center" style={{ height: 100, width: 100 }}>
              <div style={{ position: 'absolute', width: 100, height: 100, borderRadius: '50%', background: '#F6FBF4', zIndex: 1 }} />
              <div style={{ position: 'absolute', width: 70, height: 70, borderRadius: '50%', background: '#ECF8EC', zIndex: 2 }} />
              <div style={{ position: 'absolute', width: 45, height: 45, borderRadius: '50%', background: '#5CB712', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M7 13l3 3 7-7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
              onClick={() => router.push("/dashboard/service-provider-status")}
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
      
        <div className="min-h-screen bg-white flex flex-col items-center py-8 px-2">
        <div className="w-full max-w-4xl flex flex-col items-center">
          <button className="flex items-center text-gray-500 mb-4 hover:underline self-start" onClick={() => window.history.back()}>
            <ChevronLeft className="h-5 w-5 mr-1" /> Back to Previous Page
          </button>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
            <span className="text-black">Fill in <span className="text-green-600">Your Details</span> to Join as a Service Provider</span>
          </h2>
          <Stepper
            activeStep={step}
            styleConfig={{
              activeBgColor: '#fff',
              activeTextColor: '#FF385C',
              completedBgColor: '#fff',
              completedTextColor: '#FF385C',
              inactiveBgColor: '#fff',
              inactiveTextColor: '#bdbdbd',
              circleFontSize: '1.1rem',
              size: '2.2em',
              labelFontSize: '1rem',
              borderRadius: '50%',
              fontWeight: 500,
              activeBorderColor: '#FF385C',
              completedBorderColor: '#bdbdbd',
              inactiveBorderColor: '#bdbdbd',
              connectorColor: '#d1d5db',
              connectorThickness: 1,
              connectorStyle: 'dashed',
            }}
            className="w-full mb-8"
          >
            <Step label="Business Information" />
            <Step label="Business Type & Services" />
            <Step label="Verification" />
          </Stepper>
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 w-full">
            {step === 0 && (
              <form onSubmit={step1Form.handleSubmit(handleNext)}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Business Name */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Business Name:<span className="text-[#FF385C]">*</span></label>
                    <Controller
                      name="businessName"
                      control={step1Form.control}
                      render={({ field }) => <Input {...field} placeholder="ABC Tour & Travels" />}
                    />
                    {step1Form.formState.errors.businessName && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.businessName.message}</p>}
                  </div>
                  {/* Contact Person Name */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Contact Person Name:<span className="text-[#FF385C]">*</span></label>
                    <Controller
                      name="contactName"
                      control={step1Form.control}
                      render={({ field }) => <Input {...field} placeholder="Mathew Wade" />}
                    />
                    {step1Form.formState.errors.contactName && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.contactName.message}</p>}
                  </div>
                  {/* Business Email */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Business Email:<span className="text-[#FF385C]">*</span></label>
                    <Controller
                      name="businessEmail"
                      control={step1Form.control}
                      render={({ field }) => (
                        <Input
                          {...field}
                          placeholder="contact@abctour&travels.com"
                          type="email"
                        />
                      )}
                    />
                    {step1Form.formState.errors.businessEmail && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.businessEmail.message}</p>}
                  </div>
                  {/* Website */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Website:</label>
                    <Controller
                      name="website"
                      control={step1Form.control}
                      render={({ field }) => <Input {...field} placeholder="www.abctour&travels.com" />}
                    />
                    {step1Form.formState.errors.website && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.website.message}</p>}
                  </div>
                  {/* Country */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Country:<span className="text-[#FF385C]">*</span></label>
                    <Controller
                      name="country"
                      control={step1Form.control}
                      render={({ field }) => (
                        <ReactSelect
                          {...field}
                          options={countries}
                          placeholder="Select or type country"
                          isClearable
                          onChange={val => {
                            field.onChange(val);
                            step1Form.setValue("city", null);
                            // Reset mobile and whatsapp to clear old country codes
                            step1Form.setValue("mobile", "");
                            step1Form.setValue("whatsapp", "");
                          }}
                          value={field.value}
                        />
                      )}
                    />
                    {step1Form.formState.errors.country && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.country.message}</p>}
                  </div>
                  {/* City of Residence */}
                  <div>
                    <label className="block text-sm font-medium mb-1">City of Operation:<span className="text-[#FF385C]">*</span></label>
                    <Controller
                      name="city"
                      control={step1Form.control}
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
                    {step1Form.formState.errors.city && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.city.message}</p>}
                  </div>
                  {/* Mobile Number */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Mobile Number:<span className="text-[#FF385C]">*</span></label>
                    <Controller
                      name="mobile"
                      control={step1Form.control}
                      render={({ field }) => {
                        // Get the country code from selected country, default to 'us'
                        const phoneCountry = selectedCountry?.value?.toLowerCase() || 'us';
                        return (
                          <PhoneInput
                            key={phoneCountry} // Force re-render when country changes
                            value={field.value}
                            onChange={(phone) => {
                              console.log("PhoneInput onChange:", phone);
                              field.onChange(phone);
                            }}
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
                              backgroundColor: '#f9fafb',
                              padding: '8px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              minWidth: '120px',
                              flexShrink: '0'
                            }}
                            inputStyle={{
                              border: '1px solid #e5e7eb',
                              borderLeft: 'none',
                              borderRadius: '0 6px 6px 0',
                              padding: '8px 12px',
                              fontSize: '14px',
                              backgroundColor: 'white',
                              color: '#374151',
                              outline: 'none',
                              flex: '1',
                              width: '100%',
                              minHeight: '40px'
                            }}
                          />
                        );
                      }}
                    />
                    {step1Form.formState.errors.mobile && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.mobile.message}</p>}
                  </div>
                  {/* WhatsApp */}
                  <div>
                    <label className="block text-sm font-medium mb-1">WhatsApp:<span className="text-[#FF385C]">*</span></label>
                    <Controller
                      name="whatsapp"
                      control={step1Form.control}
                      render={({ field }) => {
                        // Get the country code from selected country, default to 'us'
                        const phoneCountry = selectedCountry?.value?.toLowerCase() || 'us';
                        return (
                          <PhoneInput
                            key={`whatsapp-${phoneCountry}`} // Force re-render when country changes
                            value={field.value}
                            onChange={(phone) => {
                              console.log("WhatsApp PhoneInput onChange:", phone);
                              field.onChange(phone);
                            }}
                            defaultCountry={phoneCountry}
                            placeholder="Enter your WhatsApp number"
                            className="w-full"
                            showCountryCode={true}
                            showCountryFlag={true}
                            searchPlaceholder="Search country..."
                            searchNotFound="No country found"
                            preferredCountries={['us', 'gb', 'in', 'ca', 'au']}
                            enableSearch={true}
                            disableSearchIcon={false}
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
                              backgroundColor: '#f9fafb',
                              padding: '8px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              minWidth: '120px',
                              flexShrink: '0'
                            }}
                            inputStyle={{
                              border: '1px solid #e5e7eb',
                              borderLeft: 'none',
                              borderRadius: '0 6px 6px 0',
                              padding: '8px 12px',
                              fontSize: '14px',
                              backgroundColor: 'white',
                              color: '#374151',
                              outline: 'none',
                              flex: '1',
                              width: '100%',
                              minHeight: '40px'
                            }}
                          />
                        );
                      }}
                    />
                    {step1Form.formState.errors.whatsapp && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.whatsapp.message}</p>}
                  </div>
                  {/* Registered Address */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Registered Address:<span className="text-[#FF385C]">*</span></label>
                    <Controller
                      name="address"
                      control={step1Form.control}
                      render={({ field }) => <Input {...field} placeholder="Apt. 516 215 Quitzon Path, New Candy, RI 83581" />}
                    />
                    {step1Form.formState.errors.address && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.address.message}</p>}
                  </div>
                  {/* Service Booking Link */}
                  {/* GST/Business Registration Number */}
                  <div>
                    <label className="block text-sm font-medium mb-1">GST/Business Registration Number:</label>
                    <Controller
                      name="gst"
                      control={step1Form.control}
                      render={({ field }) => <Input {...field} placeholder="33AAACH7409R1Z8" />}
                    />
                    {step1Form.formState.errors.gst && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.gst.message}</p>}
                  </div>
                  {/* Social Links */}
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                       <Image src="/instalogo.png" alt="Instagram" width={20} height={20} /> Link Instagram Business Page:</label>
                    <Controller
                      name="instagram"
                      control={step1Form.control}
                      render={({ field }) => <Input {...field} placeholder="Add URL Here" />}
                    />
                    {step1Form.formState.errors.instagram && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.instagram.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                       <Image src="/logos_facebook.png" alt="Facebook" width={20} height={20} /> Link Facebook Business Page:</label>
                    <Controller
                      name="facebook"
                      control={step1Form.control}
                      render={({ field }) => <Input {...field} placeholder="Add URL Here" />}
                    />
                    {step1Form.formState.errors.facebook && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.facebook.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                       <Image src="/linkedin.png" alt="LinkedIn" width={20} height={20} /> Link LinkedIn Business Page:</label>
                    <Controller
                      name="linkedin"
                      control={step1Form.control}
                      render={({ field }) => <Input {...field} placeholder="Add URL Here" />}
                    />
                    {step1Form.formState.errors.linkedin && <p className="text-red-500 text-xs mt-1">{step1Form.formState.errors.linkedin.message}</p>}
                  </div>
                </div>
                <div className="flex justify-between mt-8">
                  {step > 0 && (
                    <Button type="button" variant="outline" onClick={handleBack} className="rounded-lg px-8">
                      Back
                    </Button>
                  )}
                  <Button type="submit" className="bg-[#FF385C] text-white rounded-lg px-8 hover:bg-[#e62e50]">
                    Next
                  </Button>
                </div>
              </form>
            )}
            {step === 1 && (
              <form onSubmit={step2Form.handleSubmit(handleNext)}>
                {/* Upload Service Photos or Brochure */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold mb-1">Upload Service Photos or Brochure: <span className="text-xs text-gray-400 font-normal">(Max 5 Files)</span></label>
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center px-6 py-2 bg-white border border-gray-300 rounded-lg shadow-sm cursor-pointer text-base font-medium hover:bg-gray-50 transition-all">
                      <input
                        type="file"
                        multiple
                        accept="image/*,image/heic,image/heif,application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={files.length >= 5}
                        capture="environment"
                      />
                      Choose File
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {files.map((file, idx) => (
                        <span key={idx} className="flex items-center bg-white border border-gray-300 rounded-full px-3 py-1 text-sm font-medium shadow-sm">
                          {file.name}
                          <button type="button" className="ml-2 text-gray-400 hover:text-red-500" onClick={() => removeFile(idx)}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  {step2Form.formState.errors.files && <p className="text-red-500 text-xs mt-1">{step2Form.formState.errors.files.message}</p>}
                </div>
                {/* Business Type */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold mb-1">Business Type:<span className="text-[#FF385C]">*</span></label>
                  <Controller
                    name="businessType"
                    control={step2Form.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="w-full h-12 rounded-lg border-gray-300 text-base">
                          <SelectValue placeholder="Select Business Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {businessTypes.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {step2Form.formState.errors.businessType && <p className="text-red-500 text-xs mt-1">{step2Form.formState.errors.businessType.message}</p>}
                </div>
                {/* Select Services */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold mb-2">Select the Services You are Willing to Offer:<span className="text-[#FF385C]">*</span></label>
                  <div className="flex flex-wrap gap-3 mb-3">
                    {/* Render all selected services as pills (including custom) */}
                    {selectedServices.map((service) => (
                      <button
                        type="button"
                        key={service}
                        className={`flex items-center gap-2 px-5 py-2 rounded-full border text-base font-medium transition-all duration-150 bg-white shadow-sm
                          border-green-500 text-green-600
                        `}
                        onClick={() => toggleService(service)}
                      >
                        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        {service}
                      </button>
                    ))}
                    {/* Render unselected predefined services as unselected pills */}
                    {serviceOptions.filter((service) => !selectedServices.includes(service)).map((service) => (
                      <button
                        type="button"
                        key={service}
                        className="flex items-center gap-2 px-5 py-2 rounded-full border text-base font-medium transition-all duration-150 bg-white border-gray-300 text-gray-500 hover:bg-gray-100"
                        onClick={() => toggleService(service)}
                      >
                        {service}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 items-center">
                    <Input
                      value={customService}
                      onChange={e => setCustomService(e.target.value)}
                      placeholder="Add Custom Service"
                      className="w-56 h-11 rounded-lg text-base"
                    />
                    <Button type="button" onClick={addCustomService} className="bg-[#FF385C] text-white px-7 h-11 rounded-lg font-semibold text-base shadow-sm">
                      Add
                    </Button>
                  </div>
                  {step2Form.formState.errors.services && <p className="text-red-500 text-xs mt-1">{step2Form.formState.errors.services.message}</p>}
                </div>
                {/* Brief Description */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold mb-1">Brief Description of Services</label>
                  <Controller
                    name="description"
                    control={step2Form.control}
                    render={({ field }) => (
                      <textarea
                        {...field}
                        rows={3}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FF385C] text-base"
                        placeholder="Describe your services..."
                      />
                    )}
                  />
                  {step2Form.formState.errors.description && <p className="text-red-500 text-xs mt-1">{step2Form.formState.errors.description.message}</p>}
                </div>
                {/* Instant Booking */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold mb-2">Instant Booking Available?</label>
                  <Controller
                    name="instantBooking"
                    control={step2Form.control}
                    render={({ field }) => (
                      <div className="flex gap-10 mt-2">
                        <label className="flex items-center cursor-pointer gap-2">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full border-2 transition-all duration-150 ${field.value === 'yes' ? 'border-[#FF385C]' : 'border-gray-300'}`}>
                            <input
                              type="radio"
                              value="yes"
                              checked={field.value === "yes"}
                              onChange={() => field.onChange("yes")}
                              className="appearance-none w-4 h-4 rounded-full"
                            />
                            {field.value === 'yes' && (
                              <span className="absolute w-3 h-3 rounded-full bg-[#FF385C]"></span>
                            )}
                          </span>
                          <span className={`ml-2 font-semibold text-base ${field.value === 'yes' ? 'text-[#FF385C]' : 'text-gray-500'}`}>Yes</span>
                        </label>
                        <label className="flex items-center cursor-pointer gap-2">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full border-2 transition-all duration-150 ${field.value === 'no' ? 'border-[#FF385C]' : 'border-gray-300'}`}>
                            <input
                              type="radio"
                              value="no"
                              checked={field.value === "no"}
                              onChange={() => field.onChange("no")}
                              className="appearance-none w-4 h-4 rounded-full"
                            />
                            {field.value === 'no' && (
                              <span className="absolute w-3 h-3 rounded-full bg-[#FF385C]"></span>
                            )}
                          </span>
                          <span className={`ml-2 font-semibold text-base ${field.value === 'no' ? 'text-[#FF385C]' : 'text-gray-500'}`}>No</span>
                        </label>
                      </div>
                    )}
                  />
                  {step2Form.formState.errors.instantBooking && <p className="text-red-500 text-xs mt-1">{step2Form.formState.errors.instantBooking.message}</p>}
                </div>
                <div className="flex justify-between mt-8">
                  {step > 0 && (
                    <Button type="button" variant="outline" onClick={handleBack} className="rounded-lg px-8 h-12 text-base font-semibold">
                      Back
                    </Button>
                  )}
                  <Button type="submit" className="bg-[#FF385C] text-white rounded-lg px-8 h-12 text-base font-semibold hover:bg-[#e62e50]">
                    Next
                  </Button>
                </div>
              </form>
            )}
            {step === 2 && (
              <form onSubmit={step3Form.handleSubmit(handleNext)}>
                {/* Logo Upload */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold mb-1">Upload Logo of your Business:<span className="text-[#FF385C]">*</span></label>
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center px-6 py-2 bg-white border border-gray-300 rounded-lg shadow-sm cursor-pointer text-base font-medium hover:bg-gray-50 transition-all">
                      <input
                        type="file"
                        accept="image/*,image/heic,image/heif"
                        onChange={handleLogoChange}
                        className="hidden"
                        disabled={logoFiles.length >= 1}
                        capture="environment"
                      />
                      Choose File
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {logoFiles.map((file, idx) => (
                        <span key={idx} className="flex items-center bg-white border border-gray-300 rounded-full px-3 py-1 text-sm font-medium shadow-sm">
                          {file.name}
                          <button type="button" className="ml-2 text-gray-400 hover:text-red-500" onClick={removeLogo}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  {step3Form.formState.errors.logo && <p className="text-red-500 text-xs mt-1">{step3Form.formState.errors.logo.message}</p>}
                </div>
                {/* License Upload */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold mb-1">Upload Business License or Permit:</label>
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center px-6 py-2 bg-white border border-gray-300 rounded-lg shadow-sm cursor-pointer text-base font-medium hover:bg-gray-50 transition-all">
                      <input
                        type="file"
                        accept="image/*,image/heic,image/heif,application/pdf"
                        onChange={handleLicenseChange}
                        className="hidden"
                        disabled={licenseFiles.length >= 1}
                        capture="environment"
                      />
                      Choose File
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {licenseFiles.map((file, idx) => (
                        <span key={idx} className="flex items-center bg-white border border-gray-300 rounded-full px-3 py-1 text-sm font-medium shadow-sm">
                          {file.name}
                          <button type="button" className="ml-2 text-gray-400 hover:text-red-500" onClick={removeLicense}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  {step3Form.formState.errors.license && <p className="text-red-500 text-xs mt-1">{step3Form.formState.errors.license.message}</p>}
                </div>
                {/* GST Upload */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold mb-1">Upload GST or Tax Registration:<span className="text-[#FF385C]">*</span></label>
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center px-6 py-2 bg-white border border-gray-300 rounded-lg shadow-sm cursor-pointer text-base font-medium hover:bg-gray-50 transition-all">
                      <input
                        type="file"
                        accept="image/*,image/heic,image/heif,application/pdf"
                        onChange={handleGstChange}
                        className="hidden"
                        disabled={gstFiles.length >= 1}
                        capture="environment"
                      />
                      Choose File
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {gstFiles.map((file, idx) => (
                        <span key={idx} className="flex items-center bg-white border border-gray-300 rounded-full px-3 py-1 text-sm font-medium shadow-sm">
                          {file.name}
                          <button type="button" className="ml-2 text-gray-400 hover:text-red-500" onClick={removeGst}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  {step3Form.formState.errors.gst && <p className="text-red-500 text-xs mt-1">{step3Form.formState.errors.gst.message}</p>}
                </div>
                {/* Agreements */}
                <div className="mb-8 flex flex-col gap-3">
                  <Controller
                    name="confirmInfo"
                    control={step3Form.control}
                    render={({ field }) => (
                      <label className="flex items-center gap-2 text-base">
                        <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} className="accent-green-600 w-5 h-5 rounded" />
                        <span>I confirm the information provided is accurate and I am authorized to list this business on Traveloure.</span>
                      </label>
                    )}
                  />
                  {step3Form.formState.errors.confirmInfo && <p className="text-red-500 text-xs mt-1">{step3Form.formState.errors.confirmInfo.message}</p>}
                  <Controller
                    name="agreeTerms"
                    control={step3Form.control}
                    render={({ field }) => (
                      <label className="flex items-center gap-2 text-base">
                        <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} className="accent-green-600 w-5 h-5 rounded" />
                        <span>I agree to Traveloure's <a href="/service-provider-terms" className="text-[#FF385C] underline hover:text-[#e02d50]">Terms of Service</a> and <a href="/privacy-policy" className="text-[#FF385C] underline hover:text-[#e02d50]">Privacy Policy</a>.</span>
                      </label>
                    )}
                  />
                  {step3Form.formState.errors.agreeTerms && <p className="text-red-500 text-xs mt-1">{step3Form.formState.errors.agreeTerms.message}</p>}
                  <Controller
                    name="consentContact"
                    control={step3Form.control}
                    render={({ field }) => (
                      <label className="flex items-center gap-2 text-base">
                        <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} className="accent-green-600 w-5 h-5 rounded" />
                        <span>I consent to Traveloure contacting me for partnership and traveler requests.</span>
                      </label>
                    )}
                  />
                </div>
                <div className="flex justify-between mt-8">
                  {step > 0 && (
                    <Button type="button" variant="outline" onClick={handleBack} className="rounded-lg px-8 h-12 text-base font-semibold">
                      Back
                    </Button>
                  )}
                  <Button 
                    type="submit" 
                    className="bg-[#FF385C] text-white rounded-lg px-8 h-12 text-base font-semibold hover:bg-[#e62e50]"
                    disabled={loading}
                  >
                    {loading ? "Submitting..." : "Submit"}
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