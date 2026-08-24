import { z } from "zod";

// Common validations
export const emailSchema = z.string().email("Please enter a valid email address");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Please enter a valid phone number")
  .optional()
  .or(z.literal(""));

export const urlSchema = z.string().url("Please enter a valid URL").optional().or(z.literal(""));

export const dateSchema = z.date().or(z.string());

// Auth schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const registrationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  firstName: z.string().min(1, "First name is required").max(50, "First name is too long"),
  lastName: z.string().min(1, "Last name is required").max(50, "Last name is too long"),
  phone: phoneSchema,
  agreeToTerms: z.boolean().refine((val) => val === true, {
    message: "You must agree to the terms and conditions",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Trip planning schemas
export const tripBasicInfoSchema = z.object({
  destination: z.string().min(1, "Destination is required"),
  startDate: dateSchema.refine((date) => {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj >= new Date();
  }, "Start date must be in the future"),
  endDate: dateSchema,
  numberOfTravelers: z.number().min(1, "At least 1 traveler is required").max(50, "Maximum 50 travelers"),
  budget: z.number().min(0, "Budget must be positive").optional(),
}).refine((data) => {
  const start = typeof data.startDate === "string" ? new Date(data.startDate) : data.startDate;
  const end = typeof data.endDate === "string" ? new Date(data.endDate) : data.endDate;
  return end >= start;
}, {
  message: "End date must be after start date",
  path: ["endDate"],
});

export const tripPreferencesSchema = z.object({
  accommodationType: z.enum(["hotel", "resort", "apartment", "villa", "hostel", "camping"], {
    required_error: "Please select an accommodation type",
  }),
  transportationType: z.array(z.string()).min(1, "Select at least one transportation type"),
  mealPreferences: z.array(z.string()).optional(),
  activityTypes: z.array(z.string()).min(1, "Select at least one activity type"),
  accessibilityNeeds: z.string().max(500, "Description too long").optional(),
});

export const tripPlanningSchema = tripBasicInfoSchema.merge(tripPreferencesSchema);

// Booking schemas
export const contactInfoSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: emailSchema,
  phone: phoneSchema.refine((val) => val && val.length > 0, {
    message: "Phone number is required for booking",
  }),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  country: z.string().min(1, "Country is required"),
  postalCode: z.string().min(1, "Postal code is required"),
});

export const paymentInfoSchema = z.object({
  cardNumber: z.string().regex(/^\d{16}$/, "Card number must be 16 digits"),
  cardholderName: z.string().min(1, "Cardholder name is required"),
  expiryDate: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Expiry date must be in MM/YY format"),
  cvv: z.string().regex(/^\d{3,4}$/, "CVV must be 3 or 4 digits"),
  billingAddress: z.string().min(1, "Billing address is required"),
  saveCard: z.boolean().optional(),
});

export const bookingSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  numberOfGuests: z.number().min(1, "At least 1 guest is required"),
  specialRequests: z.string().max(1000, "Special requests are too long").optional(),
  contactInfo: contactInfoSchema,
  paymentInfo: paymentInfoSchema.optional(),
});

// Service provider schemas
export const serviceProviderProfileSchema = z.object({
  businessName: z.string().min(1, "Business name is required").max(100),
  description: z.string().min(50, "Description must be at least 50 characters").max(2000),
  category: z.string().min(1, "Category is required"),
  phone: phoneSchema.refine((val) => val && val.length > 0, {
    message: "Phone number is required",
  }),
  email: emailSchema,
  website: urlSchema,
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  country: z.string().min(1, "Country is required"),
  businessLicense: z.string().optional(),
  insuranceInfo: z.string().optional(),
  agreeToTerms: z.boolean().refine((val) => val === true, {
    message: "You must agree to the provider terms",
  }),
});

export const serviceListingSchema = z.object({
  serviceName: z.string().min(3, "Service name must be at least 3 characters").max(100),
  shortDescription: z.string().min(20, "Short description must be at least 20 characters").max(200),
  description: z.string().min(100, "Description must be at least 100 characters").max(5000),
  categoryId: z.string().min(1, "Category is required"),
  price: z.number().min(0, "Price must be positive"),
  duration: z.number().min(0, "Duration must be positive").optional(),
  capacity: z.number().min(1, "Capacity must be at least 1").optional(),
  location: z.string().min(1, "Location is required"),
  availabilityType: z.enum(["always", "seasonal", "custom"]),
  cancellationPolicy: z.string().min(1, "Cancellation policy is required"),
  inclusions: z.array(z.string()).min(1, "Add at least one inclusion"),
  exclusions: z.array(z.string()).optional(),
});

// Contact form schema
export const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: emailSchema,
  phone: phoneSchema,
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(10, "Message must be at least 10 characters").max(2000),
  preferredContactMethod: z.enum(["email", "phone"]).optional(),
});

// Search and filter schemas
export const searchSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  category: z.string().optional(),
  location: z.string().optional(),
  priceMin: z.number().min(0).optional(),
  priceMax: z.number().min(0).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  sortBy: z.enum(["price", "rating", "popularity", "date"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
}).refine((data) => {
  if (data.priceMin && data.priceMax) {
    return data.priceMax >= data.priceMin;
  }
  return true;
}, {
  message: "Maximum price must be greater than minimum price",
  path: ["priceMax"],
});

// Review schema
export const reviewSchema = z.object({
  rating: z.number().min(1, "Rating must be at least 1").max(5, "Rating cannot exceed 5"),
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  comment: z.string().min(20, "Review must be at least 20 characters").max(2000),
  wouldRecommend: z.boolean(),
  serviceId: z.string().min(1, "Service ID is required"),
});

// Export type helpers
export type LoginFormData = z.infer<typeof loginSchema>;
export type RegistrationFormData = z.infer<typeof registrationSchema>;
export type TripPlanningFormData = z.infer<typeof tripPlanningSchema>;
export type BookingFormData = z.infer<typeof bookingSchema>;
export type ContactFormData = z.infer<typeof contactFormSchema>;
export type ServiceListingFormData = z.infer<typeof serviceListingSchema>;
export type ReviewFormData = z.infer<typeof reviewSchema>;
export type SearchFormData = z.infer<typeof searchSchema>;
