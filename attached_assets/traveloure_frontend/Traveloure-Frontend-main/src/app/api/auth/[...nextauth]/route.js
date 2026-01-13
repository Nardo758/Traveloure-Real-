import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import CredentialsProvider from "next-auth/providers/credentials";

// Simple JWT decoder function (no external dependencies needed)
function decodeJWT(token) {
  if (!token) return null;
  
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode JWT token:', error);
    return null;
  }
}

// Check if token is expired
function isTokenExpired(token) {
  if (!token) return true;
  
  try {
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.exp) return true;
    
    // Add 30 second buffer to refresh before actual expiration
    const bufferTime = 30 * 1000; // 30 seconds
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    return Date.now() >= (expirationTime - bufferTime);
  } catch (error) {
    console.error('Error checking token expiration:', error);
    return true;
  }
}

// Refresh access token using refresh token
async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new Error('No refresh token provided');
  }

  try {
    
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
    const response = await fetch(`${apiBaseUrl}/auth/refresh-token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh: refreshToken
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('🔴 Token refresh failed:', data);
      throw new Error(data?.detail || 'Failed to refresh token');
    }

    return {
      accessToken: data.access,
      refreshToken: data.refresh || refreshToken, // Use new refresh token if provided
      expires: data.expires || null,
    };
  } catch (error) {
    console.error('🔴 Token refresh error:', error);
    throw error;
  }
}


const handler = NextAuth({
  debug: true, // Enable debug mode
  url: process.env.NEXTAUTH_URL,
  providers: [
    // Google OAuth Login
    GoogleProvider({
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      clientSecret: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),

    // Facebook OAuth Login
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    }),

    // Email/Password Login (Credentials) and External Token Login
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
        accessToken: { label: "Access Token", type: "text" },
        refreshToken: { label: "Refresh Token", type: "text" },
        userData: { label: "User Data", type: "text" },
      },
      async authorize(credentials) {
              // Handle external token login (from URL callback)
      if (credentials?.accessToken) {
      
        
        try {
          // Parse user data if provided
          let userData = null;
          if (credentials.userData) {
            try {
              userData = JSON.parse(credentials.userData);
            } catch (e) {
              console.warn('⚠️ Could not parse user data:', e);
            }
          }

          // If no user data provided, fetch it from backend
          if (!userData) {
            const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
            const userResponse = await fetch(`${apiBaseUrl}/auth/user/`, {
              headers: {
                'Authorization': `Bearer ${credentials.accessToken}`,
                'Content-Type': 'application/json',
              },
            });

            if (userResponse.ok) {
              userData = await userResponse.json();
            } else {
              console.warn("⚠️ Failed to fetch user data from backend");
            }
          }

          const result = {
            id: userData?.id || 'external-user',
            name: userData?.name || userData?.first_name || 'User',
            email: userData?.email || '',
            accessToken: credentials.accessToken,
            refreshToken: credentials.refreshToken,
            backendData: userData,
            provider: 'external',
          };
          
          return result;
        } catch (err) {
          console.error("🔴 External token login failed:", err);
          return null;
        }
      }

        // Handle regular email/password login
        try {
          const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
          
          // Log API URL in production for debugging (without sensitive data)
          if (process.env.NODE_ENV === 'production') {
            console.log('🔍 Login attempt - API URL:', apiBaseUrl);
          }
          
          // Create AbortController for timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

          let res;
          try {
            res = await fetch(`${apiBaseUrl}/auth/login/`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email_or_username: credentials?.email,
                password: credentials?.password,
              }),
              signal: controller.signal,
            });
          } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
              throw new Error("Request timeout - Backend server is not responding. Please try again later.");
            }
            // Handle network errors (ECONNREFUSED, ENOTFOUND, etc.)
            if (fetchError.message.includes('fetch') || fetchError.code === 'ECONNREFUSED' || fetchError.code === 'ENOTFOUND') {
              throw new Error("Cannot connect to backend server. Please check if the server is running.");
            }
            throw fetchError;
          }
          clearTimeout(timeoutId);

          // Check Content-Type before parsing
          const contentType = res.headers.get('content-type') || '';
          const isJSON = contentType.includes('application/json');
          
          // Check if response is ok before parsing JSON
          if (!res.ok) {
            // Handle 502 Bad Gateway specifically (often returns HTML from nginx)
            if (res.status === 502) {
              throw new Error("Backend server is unavailable (502 Bad Gateway). Please check if the backend API is running and accessible.");
            }
            
            // Handle other HTTP errors - safely read response body
            let errorData;
            try {
              // Read response as text first (works for both JSON and HTML)
              const responseText = await res.text();
              
              if (!responseText || !responseText.trim()) {
                // Empty response body
                errorData = { detail: `Server error: ${res.status} ${res.statusText} (Empty response)` };
              } else if (isJSON) {
                try {
                  errorData = JSON.parse(responseText);
                } catch (parseError) {
                  // Not valid JSON despite content-type
                  errorData = { detail: responseText || `Server error: ${res.status} ${res.statusText}` };
                }
              } else {
                // Response is HTML (like nginx error page)
                errorData = { 
                  detail: `Backend server error (${res.status}). The server returned an HTML error page instead of JSON. This usually means the backend API is down or misconfigured.` 
                };
              }
            } catch (readError) {
              // Failed to read response body
              errorData = { detail: `Server error: ${res.status} ${res.statusText} (Unable to read response)` };
            }
            
            throw new Error(errorData?.detail || `Server error: ${res.status}`);
          }

          // Parse JSON only if content type is JSON
          let data;
          if (isJSON) {
            try {
              // Read response as text first to check if it's empty
              const responseText = await res.text();
              
              if (!responseText || !responseText.trim()) {
                throw new Error("Empty response from server. Please try again.");
              }
              
              // Parse JSON
              data = JSON.parse(responseText);
            } catch (parseError) {
              if (parseError.message.includes('Empty response')) {
                throw parseError;
              }
              throw new Error("Invalid JSON response from server. Please try again.");
            }
          } else {
            // Response is not JSON - this shouldn't happen for a successful login
            throw new Error("Server returned unexpected response format. Please try again.");
          }

          // Check for access token in different possible locations
          const accessToken = data.tokens?.access || data.access || data.access_token || data.accessToken;

          if (!accessToken) {
            throw new Error("No access token received from server");
          }

          // Fetch complete user data using the access token
          let userData = null;
          try {
            const userController = new AbortController();
            const userTimeoutId = setTimeout(() => userController.abort(), 5000); // 5 second timeout
            
            let userResponse;
            try {
              userResponse = await fetch(`${apiBaseUrl}/auth/user/`, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                signal: userController.signal,
              });
            } catch (fetchError) {
              clearTimeout(userTimeoutId);
              if (fetchError.name === 'AbortError') {
                console.warn("⚠️ User data fetch timeout, using tokens data");
              } else {
                console.warn("⚠️ Error fetching user data:", fetchError);
              }
              // Continue with login even if user data fetch fails
              userResponse = null;
            }
            clearTimeout(userTimeoutId);

            if (userResponse && userResponse.ok) {
              userData = await userResponse.json();
            } else {
              console.warn("⚠️ Failed to fetch user data, using tokens data");
            }
          } catch (err) {
            console.warn("⚠️ Error fetching user data:", err);
            // Continue with login even if user data fetch fails
          }

          // Merge tokens data with user data, preserving roles from login response
          const mergedData = {
            ...data,
            user: {
              ...data.user, // Root user from login response (contains roles)
              ...userData,  // Fetched user data (may have additional fields)
            },
          };

          // Get refresh token from different possible locations
          const refreshToken = data.tokens?.refresh || data.refresh || data.refresh_token || data.refreshToken;

          const result = {
            id: userData?.id || data.tokens?.id || data.user?.id || data.id,
            name: userData?.first_name || data.tokens?.first_name || data.user?.name || data.user?.first_name || data.first_name,
            email: userData?.email || data.tokens?.email || data.user?.email || data.email,
            accessToken: accessToken,
            refreshToken: refreshToken,
            backendData: mergedData,
          };

      

          return result;
        } catch (err) {
          const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
          
          console.error("🔴 Credentials login failed:", {
            error: err.message,
            stack: err.stack,
            credentials: {
              email: credentials?.email,
              hasPassword: !!credentials?.password
            },
            apiUrl: `${apiBaseUrl}/auth/login/`,
            environment: process.env.NODE_ENV
          });
          
          // Throw error to show user-friendly message in NextAuth error page
          // NextAuth will catch this and redirect to /login?error=...
          const errorMessage = err.message || "Login failed. Please try again.";
          throw new Error(errorMessage);
        }
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        try {
          const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
          const response = await fetch(`${apiBaseUrl}/auth/google-callback/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              picture: user.image,
              google_id: profile.sub,
              access_token: account.access_token,
              id_token: account.id_token,
              refresh_token: account.refresh_token
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            return false;
          }

          account.backendResponse = data;
          return true;
        } catch (err) {
          console.error("🔴 Google login error:", err);
          return false;
        }
      }

      if (account?.provider === "facebook") {
        try {
          const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
          const response = await fetch(`${apiBaseUrl}/auth/facebook-callback/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              picture: user.image,
              facebook_id: profile.id,
              access_token: account.access_token,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            console.error("🔴 Facebook callback backend failed:", data);
            return false;
          }

          account.backendResponse = data;
          return true;
        } catch (err) {
          console.error("🔴 Facebook login error:", err);
          return false;
        }
      }

      return true; // allow credentials login to proceed
    },

    async jwt({ token, account, user, trigger }) {
      
      // Initial sign in
      if (account?.provider === "google" && account.backendResponse) {
        token.accessToken = account.backendResponse.access;
        token.refreshToken = account.backendResponse.refresh;
        token.expiresAt = account.backendResponse.expires || null;
        token.provider = "google";
        
        // Store only essential user data to reduce cookie size
        if (account.backendResponse.user) {
          token.userId = account.backendResponse.user.id;
          token.userEmail = account.backendResponse.user.email;
          token.userName = account.backendResponse.user.name || account.backendResponse.user.first_name;
          token.isLocalExpert = account.backendResponse.user.is_local_expert || false;
          token.isAdmin = account.backendResponse.user.is_admin || account.backendResponse.user.is_superuser || false;
          token.userRoles = account.backendResponse.user.roles || [];
          token.toggleRole = account.backendResponse.user.toggle_role || null;
        }
        // Don't store full backendData - reconstruct in session callback if needed
      }

      // Handle Facebook backend response
      if (account?.provider === "facebook" && account.backendResponse) {
        token.accessToken = account.backendResponse.access;
        token.refreshToken = account.backendResponse.refresh;
        token.expiresAt = account.backendResponse.expires || null;
        token.provider = "facebook";
        
        // Store only essential user data to reduce cookie size
        if (account.backendResponse.user) {
          token.userId = account.backendResponse.user.id;
          token.userEmail = account.backendResponse.user.email;
          token.userName = account.backendResponse.user.name || account.backendResponse.user.first_name;
          token.isLocalExpert = account.backendResponse.user.is_local_expert || false;
          token.isAdmin = account.backendResponse.user.is_admin || account.backendResponse.user.is_superuser || false;
          token.userRoles = account.backendResponse.user.roles || [];
          token.toggleRole = account.backendResponse.user.toggle_role || null;
        }
        // Don't store full backendData - reconstruct in session callback if needed
      } else if (account?.provider === "facebook") {
        // Fallback for Facebook without backend response
        token.accessToken = account.access_token;
        token.provider = "facebook";
      }

      if (user?.accessToken) {
        // From credentials login or external token login
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.expiresAt = user.backendData?.expires || null;
        token.provider = user.provider || 'credentials';
        
        // Store only essential user data in token to reduce size (don't store full backendData)
        if (user.backendData?.user) {
          token.userId = user.backendData.user.id;
          token.userEmail = user.backendData.user.email;
          token.userName = user.backendData.user.name || user.backendData.user.first_name;
          token.isLocalExpert = user.backendData.user.is_local_expert || false;
          token.isAdmin = user.backendData.user.is_admin || user.backendData.user.is_superuser || false;
          token.userRoles = user.backendData.user.roles || [];
          token.toggleRole = user.backendData.user.toggle_role || null;
        }
        // Don't store full backendData - it's too large for cookies
      }

      // Handle token refresh (for all providers)
      if (token.accessToken && token.refreshToken) {
        
        try {
          const expired = isTokenExpired(token.accessToken);
          
          if (expired) {
            
            try {
              const newTokens = await refreshAccessToken(token.refreshToken);
              
              token.accessToken = newTokens.accessToken;
              token.refreshToken = newTokens.refreshToken;
              token.expiresAt = newTokens.expires;
              
            } catch (error) {
              
              // Clear tokens on refresh failure
              token.accessToken = null;
              token.refreshToken = null;
              token.expiresAt = null;
            }
          } else {
            console.log("✅ Token is still valid");
          }
        } catch (error) {
          console.error("🔴 JWT token check error:", error);
        }
      }

      return token;
    },

    async session({ session, token }) {
      // Keep original session structure but optimize data size
      session.refreshToken = token.refreshToken;
      session.expiresAt = token.expiresAt;
      session.provider = token.provider;
      
      // Reconstruct minimal backendData from optimized token data (for all providers)
      if (token.userId) {
        // Reconstruct backendData from stored essential fields only
        session.backendData = {
          accessToken: token.accessToken,
          user: {
            id: token.userId,
            email: token.userEmail,
            name: token.userName,
            first_name: token.userName,
            is_local_expert: token.isLocalExpert,
            is_admin: token.isAdmin,
            is_superuser: token.isAdmin,
            roles: token.userRoles || [],
            toggle_role: token.toggleRole,
          }
        };
      } else {
        // Fallback for OAuth without optimized data
        session.backendData = {
          accessToken: token.accessToken,
          user: {}
        };
      }
      
      // Set user info from token data (optimized structure)
      if (token.userId) {
        session.user = {
          id: token.userId,
          name: token.userName,
          email: token.userEmail,
          first_name: token.userName,
          is_local_expert: token.isLocalExpert,
          is_admin: token.isAdmin,
          is_superuser: token.isAdmin,
          roles: token.userRoles || [],
          toggle_role: token.toggleRole,
        };
      } else {
        // Fallback: create user object from token data
        session.user = {
          id: token.id,
          name: token.name,
          email: token.email,
        };
      }
      
      return session;
    },

    async signOut({ token }) {
      
      // If we have a backend token, try to logout from backend
      if (token?.accessToken) {
        try {
          const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
          await fetch(`${apiBaseUrl}/auth/logout/`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token.accessToken}`,
              'Content-Type': 'application/json',
            },
          });
        } catch (error) {
          console.warn("⚠️ Backend logout failed:", error);
          // Don't throw error, continue with client-side logout
        }
      }
      
      return true;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };