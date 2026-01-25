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
    allowedFields: ['id', 'firstName', 'lastName', 'profileImageUrl', 'bio', 'createdAt'],
    maskedFields: ['email'],
    description: 'Limited access - can see names and profile info only'
  },
  provider: {
    canSeeFull: false,
    allowedFields: ['id', 'firstName', 'lastName', 'profileImageUrl', 'bio', 'createdAt'],
    maskedFields: ['email'],
    description: 'Limited access - can see names and profile info only'
  },
  user: {
    canSeeFull: false,
    allowedFields: ['id', 'firstName', 'lastName', 'profileImageUrl', 'bio', 'createdAt'],
    maskedFields: [],
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
  // Users can see their own full profile
  if (isOwnProfile) {
    return userData;
  }

  const role = (requesterRole || 'user') as UserRole;
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;

  // Admins and EAs see everything
  if (permissions.canSeeFull) {
    return userData;
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
 * Get display name (first name + last initial) for privacy
 */
export function getDisplayName(firstName?: string | null, lastName?: string | null): string {
  const first = firstName || 'User';
  const lastInitial = lastName ? ` ${lastName.charAt(0)}.` : '';
  return `${first}${lastInitial}`;
}

/**
 * Check if a role has access to full user data
 */
export function canSeeFullUserData(role: string): boolean {
  const permissions = ROLE_PERMISSIONS[role as UserRole];
  return permissions?.canSeeFull || false;
}
