/**
 * Data Sanitization Layer
 * Protects sensitive user information from being exposed to experts and other roles
 */

// Define which fields are sensitive for each entity type
export const SENSITIVE_FIELDS = {
  user: ['email', 'phoneNumber', 'address', 'paymentInfo', 'ssn', 'taxId', 'bankAccount'],
  booking: ['paymentDetails', 'cardInfo', 'billingAddress'],
  trip: ['emergencyContact', 'passportNumber', 'idNumber'],
} as const;

// Define what each role can see
// SECURITY: Experts and providers do NOT see lastName - only first name for privacy
export const ROLE_PERMISSIONS = {
  admin: {
    canSeeFull: true,
    description: 'Full access to all user data'
  },
  executive_assistant: {
    canSeeFull: true,
    description: 'Full access to manage operations'
  },
  expert: {
    canSeeFull: false,
    allowedFields: ['id', 'firstName', 'profileImageUrl', 'bio', 'createdAt'],
    maskedFields: [],
    hiddenFields: ['lastName', 'email', 'phoneNumber', 'address'],
    description: 'Limited access - first name and profile only, no contact info'
  },
  provider: {
    canSeeFull: false,
    allowedFields: ['id', 'firstName', 'profileImageUrl', 'bio', 'createdAt'],
    maskedFields: [],
    hiddenFields: ['lastName', 'email', 'phoneNumber', 'address'],
    description: 'Limited access - first name and profile only, no contact info'
  },
  user: {
    canSeeFull: false,
    allowedFields: ['id', 'firstName', 'profileImageUrl', 'bio', 'createdAt'],
    maskedFields: [],
    hiddenFields: ['lastName', 'email', 'phoneNumber'],
    description: 'Standard user - limited access to other users data'
  }
} as const;

type UserRole = keyof typeof ROLE_PERMISSIONS;

/**
 * Mask an email address for privacy
 * "john.doe@example.com" -> "j***@e***.com"
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return '***@***.***';
  
  const maskedLocal = localPart.charAt(0) + '***';
  const domainParts = domain.split('.');
  const maskedDomain = domainParts.map((part, i) => 
    i === domainParts.length - 1 ? part : part.charAt(0) + '***'
  ).join('.');
  
  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * Mask a phone number for privacy
 * "+1 (555) 123-4567" -> "+1 (***) ***-4567"
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Keep last 4 digits visible
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  
  const lastFour = digits.slice(-4);
  return `***-***-${lastFour}`;
}

/**
 * Sanitize user data based on the requester's role
 */
export function sanitizeUserForRole<T extends Record<string, any>>(
  userData: T,
  requesterRole: string,
  isOwnProfile: boolean = false
): Partial<T> {
  const { password, ...withoutPassword } = userData;
  const safeData = withoutPassword as T;

  if (isOwnProfile) {
    return safeData;
  }

  const role = (requesterRole || 'user') as UserRole;
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;

  if (permissions.canSeeFull) {
    return safeData;
  }

  // Build sanitized response
  const sanitized: Record<string, any> = {};
  const allowedFields = 'allowedFields' in permissions ? permissions.allowedFields : [];
  const maskedFields = 'maskedFields' in permissions ? permissions.maskedFields : [];

  for (const field of allowedFields) {
    if (field in userData) {
      sanitized[field] = userData[field];
    }
  }

  // Apply masking to masked fields
  for (const field of maskedFields) {
    if (field in userData) {
      if (field === 'email') {
        sanitized[field] = maskEmail(userData[field] as string);
      } else if (field === 'phoneNumber' || field === 'phone') {
        sanitized[field] = maskPhone(userData[field] as string);
      }
    }
  }

  return sanitized as Partial<T>;
}

/**
 * Sanitize an array of users
 */
export function sanitizeUsersForRole<T extends Record<string, any>>(
  users: T[],
  requesterRole: string,
  requesterId?: string
): Partial<T>[] {
  return users.map(user => 
    sanitizeUserForRole(user, requesterRole, user.id === requesterId)
  );
}

/**
 * Sanitize booking data for experts - they only need relevant trip info
 */
export function sanitizeBookingForExpert<T extends Record<string, any>>(
  booking: T,
  requesterRole: string,
  requesterId?: string
): T {
  const role = (requesterRole || 'user') as UserRole;
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;

  // Admins and EAs see everything
  if (permissions.canSeeFull) {
    return booking;
  }

  // For experts/providers: remove payment details but keep operational info
  const sanitized = { ...booking };
  
  // Remove sensitive payment/billing info
  const sensitiveFields = ['paymentDetails', 'cardInfo', 'billingAddress', 'paymentIntentId', 'stripeSessionId'];
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      delete (sanitized as any)[field];
    }
  }

  // Sanitize nested traveler info if present
  if ('traveler' in sanitized && (sanitized as any).traveler) {
    const travelerData = (sanitized as any).traveler;
    (sanitized as any).traveler = sanitizeUserForRole(
      travelerData as Record<string, any>,
      requesterRole,
      travelerData.id === requesterId
    );
  }

  return sanitized;
}

/**
 * Create a safe public profile view
 */
export function createPublicProfile<T extends Record<string, any>>(userData: T): Partial<T> {
  const publicFields = ['id', 'firstName', 'lastName', 'profileImageUrl', 'bio', 'specialties', 'role'];
  const publicProfile: Record<string, any> = {};
  
  for (const field of publicFields) {
    if (field in userData) {
      publicProfile[field] = userData[field];
    }
  }
  
  return publicProfile as Partial<T>;
}

/**
 * Get display name for privacy - first name only for maximum protection
 */
export function getDisplayName(firstName?: string | null, lastName?: string | null): string {
  return firstName || 'Traveler';
}

/**
 * Get display name with last initial (less strict mode)
 */
export function getDisplayNameWithInitial(firstName?: string | null, lastName?: string | null): string {
  const first = firstName || 'User';
  const lastInitial = lastName ? ` ${lastName.charAt(0)}.` : '';
  return `${first}${lastInitial}`;
}

/**
 * Patterns for detecting contact information in text
 */
const CONTACT_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(?:\+?1[-.\s]?)?(?:\(?[0-9]{3}\)?[-.\s]?)?[0-9]{3}[-.\s]?[0-9]{4}/g,
  phoneIntl: /\+[0-9]{1,3}[-.\s]?[0-9]{6,14}/g,
  whatsapp: /(?:whatsapp|wa\.me|chat on whatsapp)/gi,
  socialHandles: /@[a-zA-Z0-9_]{2,30}/g,
};

/**
 * Redact contact information from text content
 * Replaces detected patterns with [REDACTED]
 */
export function redactContactInfo(text: string | null | undefined): string | null {
  if (!text) return null;
  
  let redacted = text;
  
  // Redact emails
  redacted = redacted.replace(CONTACT_PATTERNS.email, '[email redacted]');
  
  // Redact phone numbers
  redacted = redacted.replace(CONTACT_PATTERNS.phone, '[phone redacted]');
  redacted = redacted.replace(CONTACT_PATTERNS.phoneIntl, '[phone redacted]');
  
  // Redact WhatsApp references
  redacted = redacted.replace(CONTACT_PATTERNS.whatsapp, '[contact redacted]');
  
  // Redact social media handles
  redacted = redacted.replace(CONTACT_PATTERNS.socialHandles, '[handle redacted]');
  
  return redacted;
}

/**
 * Check if text contains contact information
 */
export function containsContactInfo(text: string | null | undefined): boolean {
  if (!text) return false;
  
  return Object.values(CONTACT_PATTERNS).some(pattern => {
    pattern.lastIndex = 0; // Reset regex state
    return pattern.test(text);
  });
}

/**
 * Check if a role has access to full user data
 */
export function canSeeFullUserData(role: string): boolean {
  const permissions = ROLE_PERMISSIONS[role as UserRole];
  return permissions?.canSeeFull || false;
}

/**
 * Generic allowlist projector — returns a new object containing ONLY the
 * listed keys that are present on the source object. An allowlist rather
 * than a denylist so a NEW privileged column added to the source table
 * later is excluded by default (the same pick-over-omit posture ruling 46
 * / §19 requires for request-body schemas, applied here to a response
 * body — CC-8).
 */
export function pickPublicFields<T extends Record<string, any>, K extends keyof T>(
  source: T,
  fields: readonly K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const field of fields) {
    if (field in source) {
      result[field] = source[field];
    }
  }
  return result;
}

/**
 * Denylist projector — returns a shallow copy of the source with the listed keys removed.
 * Deliberately narrower than `pickPublicFields`: use this ONLY when a single, specifically-
 * verified field is the leak (e.g. CC-8's `provider_services.revenueShareRate` on
 * POST /api/provider/services) and the source table is large/actively read by many
 * unaudited consumers, where reconstructing a full allowlist risks dropping a field some
 * other caller depends on. Prefer `pickPublicFields` when the full consumer set is known.
 */
export function omitFields<T extends Record<string, any>, K extends keyof T>(
  source: T,
  fields: readonly K[],
): Omit<T, K> {
  const result = { ...source };
  for (const field of fields) {
    delete result[field];
  }
  return result;
}

/**
 * CC-8: POST /api/expert-application (and its /api/expert-forms alias) echoed the
 * full local_expert_forms row back — including admin/financial/verification
 * internals (totalEarnings, pendingPayout, feeSettings, stripeAccountId,
 * stripeAccountStatus, identityVerificationStatus, knowledgeScore, bookingFee*,
 * payoutSchedule, canReceivePayments, stripeConnectStatus, identityVerification*,
 * verifiedInfluencer/influencerTier/referralCode, handoff/PA-access internals...).
 * Verified no client reads any of this: travel-experts.tsx's submitMutation.onSuccess
 * takes no response argument at all (it only invalidates queries + navigates), and the
 * expert console's status surfaces (expert-status.tsx, expert/settings.tsx) read the
 * separate /api/expert/application-status endpoint, never this row. This allowlist
 * keeps the fields an applicant plausibly wants echoed back — their own submitted
 * profile plus the row's lifecycle state — and excludes every admin/payment/
 * verification-internal field by construction.
 */
export const EXPERT_APPLICATION_PUBLIC_FIELDS = [
  "id", "userId", "expertType",
  "firstName", "lastName", "email", "phone", "country", "city",
  "destinations", "specialties", "languages", "experienceTypes",
  "specializations", "selectedServices",
  "neighborhoods", "localityProof", "knowledgeProofAnswers", "localSpecialties",
  "yearsOfExperience", "bio", "portfolio", "certifications",
  "availability", "responseTime", "hourlyRate",
  "offeringTypeKey",
  "isInfluencer", "instagramLink", "tiktokLink", "youtubeLink", "socialFollowers",
  "status", "rejectionMessage", "createdAt",
] as const;
