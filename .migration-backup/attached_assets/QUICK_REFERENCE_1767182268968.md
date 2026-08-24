# TRAVELOURE QUICK REFERENCE CHEAT SHEET
## Copy/Paste Patterns for New Components

---

## 🎯 MOST COMMON PATTERNS

### Page Container
```tsx
<div className="container mx-auto px-4 max-w-7xl py-8">
  {/* Your content */}
</div>
```

### Primary Button
```tsx
<Button className="bg-primary hover:bg-primary-hover text-white font-semibold px-6 py-3 rounded-lg">
  Click Me
</Button>
```

### Card
```tsx
<Card className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
  <h3 className="text-xl font-semibold text-gray-900 mb-2">Title</h3>
  <p className="text-gray-600">Content</p>
</Card>
```

### Input Field
```tsx
<div className="space-y-2">
  <Label className="text-sm font-medium text-gray-700">Label *</Label>
  <Input 
    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
    placeholder="Enter value..."
  />
</div>
```

### Grid (3 columns)
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {items.map(item => <Card key={item.id}>{/* ... */}</Card>)}
</div>
```

---

## 🎨 COLOR QUICK REFERENCE

```tsx
bg-primary              // #FF385C (main brand color)
hover:bg-primary-hover  // Darker on hover
text-gray-900           // Headings
text-gray-600           // Body text
bg-gray-50              // Page background
border-gray-200         // Card borders
```

---

## 📏 SPACING QUICK REFERENCE

```tsx
p-6        // Padding: 24px (standard card padding)
py-20      // Vertical padding: 80px (sections)
space-y-6  // Vertical spacing between children: 24px
gap-6      // Grid/flex gap: 24px
mb-4       // Margin bottom: 16px
```

---

## ✍️ TYPOGRAPHY QUICK REFERENCE

```tsx
// Page Title
<h1 className="text-4xl lg:text-5xl font-bold text-gray-900">

// Section Heading
<h2 className="text-3xl lg:text-4xl font-bold text-gray-900">

// Card Title
<h3 className="text-xl font-semibold text-gray-900">

// Body Text
<p className="text-base text-gray-600 leading-relaxed">

// Small Text
<span className="text-sm text-gray-500">
```

---

## 📋 FORM PATTERN

```tsx
<form className="space-y-6 bg-white rounded-lg shadow-md p-8">
  <div className="space-y-2">
    <Label className="text-sm font-medium text-gray-700">Field Label *</Label>
    <Input className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" />
  </div>
  
  <Button type="submit" className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-3">
    Submit
  </Button>
</form>
```

---

## 💳 STAT CARD PATTERN

```tsx
<Card className="bg-white rounded-lg shadow-md p-6">
  <p className="text-sm text-gray-600 mb-1">Label</p>
  <p className="text-3xl font-bold text-gray-900">24</p>
  <p className="text-xs text-green-600 mt-2">↑ 12% increase</p>
</Card>
```

---

## 🔔 ALERT PATTERN

```tsx
<Alert className="border-green-200 bg-green-50">
  <CheckCircleIcon className="h-4 w-4 text-green-600" />
  <AlertTitle className="text-green-800">Success!</AlertTitle>
  <AlertDescription className="text-green-700">
    Action completed successfully.
  </AlertDescription>
</Alert>
```

---

## 🏷️ BADGE PATTERN

```tsx
<Badge className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
  Active
</Badge>
```

---

## 📱 RESPONSIVE GRID

```tsx
// Mobile: 1 column, Tablet: 2 columns, Desktop: 3 columns
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Items */}
</div>
```

---

## 🔗 LINK PATTERN

```tsx
<a className="text-primary hover:text-primary-hover transition-colors underline-offset-4 hover:underline">
  Link Text
</a>
```

---

## ⚡ LOADING BUTTON

```tsx
<Button disabled className="opacity-50 cursor-not-allowed">
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Loading...
</Button>
```

---

## 🎯 DASHBOARD LAYOUT

```tsx
<div className="flex h-screen bg-gray-50">
  {/* Sidebar */}
  <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
    {/* Nav items */}
  </aside>
  
  {/* Main */}
  <main className="flex-1 overflow-y-auto">
    <div className="container mx-auto px-8 py-6">
      {/* Content */}
    </div>
  </main>
</div>
```

---

## ✅ PRE-FLIGHT CHECKLIST

Before creating a component, ask:

- [ ] Am I using Shadcn/UI components?
- [ ] Are colors from the palette (bg-primary, text-gray-600)?
- [ ] Is spacing standard (p-6, space-y-4, gap-6)?
- [ ] Do text sizes match (text-xl, font-semibold)?
- [ ] Are shadows standard (shadow-md)?
- [ ] Are borders standard (rounded-lg, border-gray-200)?
- [ ] Do I have hover states?
- [ ] Do I have focus states?
- [ ] Is it responsive (md:, lg: breakpoints)?

---

## 🚫 NEVER DO THIS

```tsx
❌ <div style={{ padding: '20px' }}>           // No inline styles
❌ <div className="bg-[#123456]">              // No custom hex colors
❌ <div className="p-[17px]">                  // No arbitrary values
❌ <div className="font-comic-sans">           // No custom fonts
❌ import './custom-styles.css'                // No custom CSS files
```

---

## ✅ ALWAYS DO THIS

```tsx
✅ <div className="p-6">                       // Use Tailwind scale
✅ <div className="bg-primary">                // Use design tokens
✅ <div className="space-y-4">                 // Use standard spacing
✅ <div className="font-sans">                 // Use default font
✅ import { Button } from '@/components/ui'    // Use Shadcn components
```

---

**When in doubt, copy patterns from existing marketing or dashboard pages!**
