#!/bin/bash
# Fix vulnerable dependencies in Traveloure Frontend

set -e  # Exit on error

echo "🔒 Traveloure Dependency Security Fix"
echo "====================================="
echo ""

cd attached_assets/traveloure_frontend/Traveloure-Frontend-main

echo "📋 Current versions:"
echo "   axios: $(npm list axios --depth=0 2>/dev/null | grep axios | awk '{print $2}' || echo 'not found')"
echo "   jspdf: $(npm list jspdf --depth=0 2>/dev/null | grep jspdf | awk '{print $2}' || echo 'not found')"
echo "   next: $(npm list next --depth=0 2>/dev/null | grep next | awk '{print $2}' || echo 'not found')"
echo ""

echo "🔄 Updating vulnerable dependencies..."
echo ""

# Update axios (security patches)
echo "📦 Updating axios: 1.9.0 → 1.12.0"
npm install axios@1.12.0

# Update jspdf (patch version)
echo "📦 Updating jspdf: 3.0.1 → 3.0.2"
npm install jspdf@3.0.2

echo ""
echo "✅ Safe updates complete!"
echo ""

echo "📊 Running security audit..."
npm audit || true
echo ""

echo "📋 Updated versions:"
echo "   axios: $(npm list axios --depth=0 2>/dev/null | grep axios | awk '{print $2}' || echo 'not found')"
echo "   jspdf: $(npm list jspdf --depth=0 2>/dev/null | grep jspdf | awk '{print $2}' || echo 'not found')"
echo "   next: $(npm list next --depth=0 2>/dev/null | grep next | awk '{print $2}' || echo 'not found')"
echo ""

echo "⚠️  Next.js Decision Needed:"
echo "   Current version: 15.3.1"
echo ""
echo "   Option 1: Downgrade to stable 15.0.8"
echo "   $ npm install next@15.0.8"
echo ""
echo "   Option 2: Keep current (if no issues)"
echo "   $ # Do nothing"
echo ""
echo "   Option 3: Check form-data dependency"
echo "   $ npm ls form-data"
echo ""

echo "🧪 Next steps:"
echo "1. Test the app: npm run dev"
echo "2. Decide on Next.js version (see above)"
echo "3. Commit changes: git add package.json package-lock.json"
echo "4. Push to GitHub"
echo ""
echo "📚 See DEPENDENCY_SECURITY_FIX.md for details"
