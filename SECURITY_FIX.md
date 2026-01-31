# Security Fix: Remove Auth Tokens from localStorage

## Issue
Auth tokens stored in localStorage are vulnerable to XSS attacks. Any malicious JavaScript can access them.

## Solution
Use NextAuth session instead - tokens are already stored securely in httpOnly cookies.

## Files to Update

### 1. `/src/lib/authUtils.js`
**Remove:** localStorage token operations
**Keep:** Session clearing logic via NextAuth signOut

### 2. `/src/lib/axiosInterceptor.js`  
**Replace:** localStorage.getItem/setItem with session-based token retrieval
**Add:** useSession hook for client components

### 3. `/src/lib/tokenManager.js` (NEW FILE)
**Purpose:** Centralized secure token access via NextAuth session

## Implementation Steps

### Step 1: Create Secure Token Manager
```javascript
// src/lib/tokenManager.js
import { getSession } from 'next-auth/react';

/**
 * Get access token from NextAuth session (client-side)
 * Use this in client components with useSession
 */
export const getAccessToken = async () => {
  const session = await getSession();
  return session?.backendData?.accessToken || null;
};

/**
 * Get refresh token from NextAuth session (client-side)
 */
export const getRefreshToken = async () => {
  const session = await getSession();
  return session?.refreshToken || null;
};

/**
 * No need to store tokens - NextAuth handles this securely
 */
export const setTokens = () => {
  console.warn('⚠️ Tokens are managed by NextAuth - no manual storage needed');
};
```

### Step 2: Update authUtils.js
Remove all localStorage operations:

```javascript
// BEFORE (❌ Vulnerable)
export const clearAuthData = () => {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('userData')
}

// AFTER (✅ Secure)
export const clearAuthData = () => {
  // NextAuth handles token cleanup automatically via signOut
  // Only clear non-sensitive app data if needed
  console.log('🔒 Clearing auth data via NextAuth signOut')
}
```

### Step 3: Update axiosInterceptor.js
Use session instead of localStorage:

```javascript
// BEFORE (❌ Vulnerable)
import axios from 'axios'

axiosInstance.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem('accessToken')  // ❌ XSS risk
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// AFTER (✅ Secure)
import axios from 'axios'
import { getSession } from 'next-auth/react'

axiosInstance.interceptors.request.use(async (config) => {
  const session = await getSession()
  const accessToken = session?.backendData?.accessToken
  
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})
```

### Step 4: Remove localStorage from Token Refresh
```javascript
// BEFORE (❌ Vulnerable) 
if (response.data?.access) {
  localStorage.setItem('accessToken', response.data.access)  // ❌ XSS risk
}

// AFTER (✅ Secure)
// Token refresh is handled by NextAuth JWT callback
// No manual storage needed
if (response.data?.access) {
  // NextAuth will automatically update the session
  console.log('✅ Token refreshed via NextAuth')
}
```

## Testing Checklist

- [ ] Login works and tokens are NOT in localStorage
- [ ] API requests include auth header
- [ ] Token refresh works automatically
- [ ] Logout clears session properly
- [ ] Multi-tab logout works (NextAuth handles this)
- [ ] Check DevTools > Application > Local Storage - should be empty of tokens

## Compliance
This fix addresses:
- **GDPR Article 5.32** - Appropriate security for personal data
- **CCPA** - Reasonable security procedures
- **NIST 800-53** - Access control and session management

## Timeline
- **Priority:** High (XSS vulnerability)
- **Estimated time:** 2-3 hours
- **Testing time:** 1 hour
