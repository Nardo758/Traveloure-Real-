#!/bin/bash
# Security Fix Deployment Script for Traveloure
# Run this from the root of Traveloure-Platform

set -e  # Exit on error

echo "🔒 Traveloure Security Fix Deployment"
echo "====================================="
echo ""

# Change to frontend directory
cd attached_assets/traveloure_frontend/Traveloure-Frontend-main/src/lib

echo "📦 Step 1: Creating backups..."
if [ -f "authUtils.js.backup" ]; then
    echo "⚠️  Backup already exists. Skipping backup step."
    echo "   (Remove .backup files manually if you want fresh backups)"
else
    cp authUtils.js authUtils.js.backup
    cp axiosInterceptor.js axiosInterceptor.js.backup
    echo "✅ Backups created:"
    echo "   - authUtils.js.backup"
    echo "   - axiosInterceptor.js.backup"
fi
echo ""

echo "🔄 Step 2: Replacing files with secure versions..."
mv -f authUtils.SECURE.js authUtils.js
mv -f axiosInterceptor.SECURE.js axiosInterceptor.js
echo "✅ Files replaced:"
echo "   - authUtils.js (now secure)"
echo "   - axiosInterceptor.js (now secure)"
echo "   - tokenManager.js (already in place)"
echo ""

echo "🧹 Step 3: Cleaning up old localStorage tokens (one-time)..."
echo ""
echo "⚠️  IMPORTANT: Add this code to your root layout (src/app/layout.jsx):"
echo ""
echo "────────────────────────────────────────────────────────────────"
cat << 'EOF'
'use client'
import { useEffect } from 'react'

export default function RootLayout({ children }) {
  useEffect(() => {
    // One-time cleanup: remove old tokens from localStorage
    if (typeof window !== 'undefined') {
      const hadTokens = 
        localStorage.getItem('accessToken') || 
        localStorage.getItem('refreshToken')
      
      if (hadTokens) {
        console.log('🔒 Security update: Removing old tokens')
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('userData')
      }
    }
  }, [])

  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
EOF
echo "────────────────────────────────────────────────────────────────"
echo ""

echo "✅ Deployment complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Review SECURITY_FIX_SUMMARY.md for full details"
echo "2. Add the cleanup code above to src/app/layout.jsx"
echo "3. Run: npm run dev (test locally)"
echo "4. Test login, API calls, logout"
echo "5. Check DevTools > Application > Local Storage (should be empty of tokens)"
echo "6. Deploy to production when ready"
echo ""
echo "🆘 Rollback (if needed):"
echo "   cp authUtils.js.backup authUtils.js"
echo "   cp axiosInterceptor.js.backup axiosInterceptor.js"
echo ""
echo "📚 Documentation:"
echo "   - SECURITY_FIX_SUMMARY.md   - Quick overview"
echo "   - IMPLEMENTATION_GUIDE.md   - Detailed guide"
echo "   - SECURITY_FIX.md           - Technical details"
echo ""
echo "🚀 Happy securing! Questions? Let me know."
