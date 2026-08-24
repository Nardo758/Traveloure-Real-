# TRAVELOURE DESIGN SYSTEM REFERENCE
## DO NOT MODIFY - Reference Only for New Components

---

## 🎨 COLOR PALETTE

### Primary Colors
```javascript
// Tailwind CSS classes to use
bg-primary          // #FF385C (Traveloure red/pink)
hover:bg-primary-hover  // #E23350 (darker on hover)
bg-primary-light    // #FFE3E8 (light backgrounds)
text-primary        // #FF385C (primary text)
border-primary      // #FF385C (primary borders)

// Usage example:
<Button className="bg-primary hover:bg-primary-hover text-white">
  Click Me
</Button>
```

### Secondary/Neutral Colors
```javascript
// Gray scale
bg-gray-50          // #F9FAFB (lightest background)
bg-gray-100         // #F3F4F6 
bg-gray-200         // #E5E7EB (borders, dividers)
bg-gray-300         // #D1D5DB
bg-gray-600         // #6B7280 (body text)
bg-gray-900         // #111827 (headings, dark text)

text-gray-600       // Body text
text-gray-900       // Headings
border-gray-200     // Default borders
border-gray-300     // Input borders
```

### Status Colors
```javascript
bg-green-500        // #10B981 (success)
bg-yellow-500       // #F59E0B (warning)
bg-red-500          // #EF4444 (error)
bg-blue-500         // #3B82F6 (info)

text-green-600      // Success text
text-yellow-600     // Warning text
text-red-600        // Error text
text-blue-600       // Info text
```

---

## 📝 TYPOGRAPHY

### Font Stack
```tsx
// Already configured in Tailwind - just use font-sans
<h1 className="font-sans">Heading</h1>

// System font stack (already configured):
// -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, 
// "Helvetica Neue", Arial, sans-serif
```

### Text Sizes & Weights
```tsx
// Headings
<h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900">
  Main Page Title
</h1>

<h2 className="text-3xl lg:text-4xl font-bold text-gray-900">
  Section Heading
</h2>

<h3 className="text-2xl lg:text-3xl font-semibold text-gray-900">
  Subsection Heading
</h3>

<h4 className="text-xl font-semibold text-gray-900">
  Card Title
</h4>

// Body text
<p className="text-base text-gray-600 leading-relaxed">
  Regular paragraph text
</p>

<p className="text-lg text-gray-600 leading-relaxed">
  Larger body text (hero descriptions)
</p>

// Small text
<span className="text-sm text-gray-500">
  Helper text, captions
</span>

<span className="text-xs text-gray-400">
  Tiny labels, metadata
</span>
```

---

## 📏 SPACING SYSTEM

### Common Spacing Patterns
```tsx
// Section spacing (vertical)
<section className="py-20">              // Large sections
<section className="py-16">              // Medium sections
<section className="py-12">              // Small sections

// Container padding (horizontal)
<div className="px-4 lg:px-8">          // Responsive padding

// Card/component padding
<div className="p-6">                    // Standard card padding
<div className="p-8">                    // Large card padding
<div className="p-4">                    // Compact padding

// Gaps between items
<div className="space-y-6">              // Vertical spacing
<div className="space-x-4">              // Horizontal spacing
<div className="gap-6">                  // Grid/flex gaps
<div className="gap-4">                  // Smaller gaps
```

### Container Widths
```tsx
// Page container (use this for all main content)
<div className="container mx-auto px-4 max-w-7xl">
  {/* Content */}
</div>

// Narrow container (for forms, articles)
<div className="container mx-auto px-4 max-w-3xl">
  {/* Content */}
</div>

// Wide container (for dashboards)
<div className="container mx-auto px-4 max-w-screen-2xl">
  {/* Content */}
</div>
```

---

## 🧩 COMPONENT PATTERNS

### 1. Buttons

```tsx
// Primary Button
<Button 
  className="bg-primary hover:bg-primary-hover text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow-sm hover:shadow-md"
>
  Primary Action
</Button>

// Secondary Button
<Button 
  variant="outline"
  className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-semibold px-6 py-3 rounded-lg transition-colors"
>
  Secondary Action
</Button>

// Ghost Button
<Button 
  variant="ghost"
  className="text-gray-700 hover:text-gray-900 hover:bg-gray-100 px-4 py-2 rounded-lg transition-colors"
>
  Subtle Action
</Button>

// Disabled Button
<Button 
  disabled
  className="bg-gray-300 text-gray-500 cursor-not-allowed px-6 py-3 rounded-lg"
>
  Disabled
</Button>

// Icon Button
<Button 
  size="icon"
  className="w-10 h-10 rounded-full hover:bg-gray-100"
>
  <SearchIcon className="w-5 h-5" />
</Button>
```

### 2. Cards

```tsx
// Standard Card
<Card className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow border border-gray-200 overflow-hidden">
  <CardHeader className="border-b border-gray-200 p-6">
    <CardTitle className="text-xl font-semibold text-gray-900">
      Card Title
    </CardTitle>
    <CardDescription className="text-sm text-gray-600 mt-1">
      Optional description
    </CardDescription>
  </CardHeader>
  <CardContent className="p-6">
    <p className="text-gray-600">Content goes here</p>
  </CardContent>
  <CardFooter className="border-t border-gray-200 p-6 bg-gray-50">
    <Button className="w-full">Action</Button>
  </CardFooter>
</Card>

// Simple Card (no header/footer)
<Card className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
  <p className="text-gray-600">Simple content</p>
</Card>

// Stat Card
<Card className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
  <p className="text-sm text-gray-600 mb-1">Active Plans</p>
  <p className="text-3xl font-bold text-gray-900">24</p>
  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
    <ArrowUpIcon className="w-3 h-3" />
    12% from last month
  </p>
</Card>

// Hoverable Card (for clickable items)
<Card className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all cursor-pointer hover:-translate-y-1 border border-gray-200">
  {/* Content */}
</Card>
```

### 3. Forms

```tsx
// Form Container
<form className="space-y-6 bg-white rounded-lg shadow-md p-8 border border-gray-200">
  
  {/* Input Group */}
  <div className="space-y-2">
    <Label 
      htmlFor="field-name" 
      className="text-sm font-medium text-gray-700"
    >
      Field Label *
    </Label>
    <Input
      id="field-name"
      placeholder="Enter value..."
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
    />
    <p className="text-xs text-gray-500">
      Helper text goes here
    </p>
  </div>
  
  {/* Select/Dropdown */}
  <div className="space-y-2">
    <Label className="text-sm font-medium text-gray-700">
      Select Option
    </Label>
    <Select>
      <SelectTrigger className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary">
        <SelectValue placeholder="Choose..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option1">Option 1</SelectItem>
        <SelectItem value="option2">Option 2</SelectItem>
      </SelectContent>
    </Select>
  </div>
  
  {/* Textarea */}
  <div className="space-y-2">
    <Label className="text-sm font-medium text-gray-700">
      Description
    </Label>
    <Textarea
      rows={4}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary resize-none"
      placeholder="Enter description..."
    />
  </div>
  
  {/* Checkbox */}
  <div className="flex items-start gap-3">
    <Checkbox id="terms" className="mt-1" />
    <Label 
      htmlFor="terms" 
      className="text-sm text-gray-700 cursor-pointer leading-relaxed"
    >
      I agree to the terms and conditions
    </Label>
  </div>
  
  {/* Radio Group */}
  <RadioGroup defaultValue="option1" className="space-y-3">
    <div className="flex items-center gap-3">
      <RadioGroupItem value="option1" id="r1" />
      <Label htmlFor="r1" className="cursor-pointer">Option 1</Label>
    </div>
    <div className="flex items-center gap-3">
      <RadioGroupItem value="option2" id="r2" />
      <Label htmlFor="r2" className="cursor-pointer">Option 2</Label>
    </div>
  </RadioGroup>
  
  {/* Submit Button */}
  <Button 
    type="submit"
    className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-3"
  >
    Submit
  </Button>
</form>
```

### 4. Alerts/Notifications

```tsx
// Success Alert
<Alert className="border-green-200 bg-green-50">
  <CheckCircleIcon className="h-4 w-4 text-green-600" />
  <AlertTitle className="text-green-800">Success!</AlertTitle>
  <AlertDescription className="text-green-700">
    Your action was completed successfully.
  </AlertDescription>
</Alert>

// Error Alert
<Alert className="border-red-200 bg-red-50">
  <XCircleIcon className="h-4 w-4 text-red-600" />
  <AlertTitle className="text-red-800">Error</AlertTitle>
  <AlertDescription className="text-red-700">
    Something went wrong. Please try again.
  </AlertDescription>
</Alert>

// Warning Alert
<Alert className="border-yellow-200 bg-yellow-50">
  <AlertTriangleIcon className="h-4 w-4 text-yellow-600" />
  <AlertTitle className="text-yellow-800">Warning</AlertTitle>
  <AlertDescription className="text-yellow-700">
    Please review this information carefully.
  </AlertDescription>
</Alert>

// Info Alert
<Alert className="border-blue-200 bg-blue-50">
  <InfoIcon className="h-4 w-4 text-blue-600" />
  <AlertTitle className="text-blue-800">Info</AlertTitle>
  <AlertDescription className="text-blue-700">
    Here's some helpful information.
  </AlertDescription>
</Alert>
```

### 5. Badges

```tsx
// Status Badges
<Badge className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
  Active
</Badge>

<Badge className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
  Pending
</Badge>

<Badge className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
  Urgent
</Badge>

<Badge className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs font-medium">
  Completed
</Badge>
```

---

## 📱 LAYOUT PATTERNS

### 1. Page Layout
```tsx
export default function PageLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        {/* Nav content */}
      </nav>
      
      {/* Main Content */}
      <main className="container mx-auto px-4 max-w-7xl py-8">
        {/* Page content */}
      </main>
      
      {/* Footer */}
      <footer className="bg-gray-900 text-white mt-20">
        {/* Footer content */}
      </footer>
    </div>
  );
}
```

### 2. Dashboard Layout
```tsx
export default function DashboardLayout() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
        {/* Sidebar navigation */}
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-8 py-6">
          {/* Dashboard content */}
        </div>
      </main>
    </div>
  );
}
```

### 3. Grid Layouts
```tsx
// 3-column responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {items.map(item => (
    <Card key={item.id}>{/* Card content */}</Card>
  ))}
</div>

// 2-column responsive grid
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
  <div>{/* Left column */}</div>
  <div>{/* Right column */}</div>
</div>

// 4-column stats grid
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {stats.map(stat => (
    <StatCard key={stat.id} {...stat} />
  ))}
</div>
```

---

## 🎭 INTERACTIVE STATES

### Hover States
```tsx
// Card hover
<Card className="transition-all hover:shadow-xl hover:-translate-y-1">

// Button hover
<Button className="transition-colors hover:bg-primary-hover">

// Link hover
<a className="text-primary hover:text-primary-hover transition-colors underline-offset-4 hover:underline">
```

### Focus States
```tsx
// Input focus
<Input className="focus:ring-2 focus:ring-primary focus:border-transparent">

// Button focus
<Button className="focus:ring-2 focus:ring-primary focus:ring-offset-2">

// Link focus
<a className="focus:outline-none focus:ring-2 focus:ring-primary rounded">
```

### Loading States
```tsx
// Button loading
<Button disabled className="opacity-50 cursor-not-allowed">
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Loading...
</Button>

// Skeleton loading
<div className="animate-pulse">
  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
</div>
```

---

## 🎨 SHADOWS & BORDERS

### Shadow Scale
```tsx
shadow-sm      // Subtle shadow
shadow-md      // Default card shadow
shadow-lg      // Elevated elements
shadow-xl      // Hover states, modals
shadow-2xl     // Very prominent elements
```

### Border Radius
```tsx
rounded        // 4px (small elements)
rounded-md     // 6px (buttons, inputs)
rounded-lg     // 8px (cards, containers)
rounded-xl     // 12px (large cards)
rounded-full   // Fully rounded (badges, avatars)
```

### Borders
```tsx
border                    // 1px border
border-2                  // 2px border
border-gray-200          // Light border color
border-gray-300          // Input borders
border-primary           // Accent borders
```

---

## 📐 BREAKPOINTS

### Responsive Prefixes
```tsx
// Mobile first approach
<div className="
  text-base          // Mobile: 16px
  md:text-lg         // Tablet: 18px
  lg:text-xl         // Desktop: 20px
">

<div className="
  grid-cols-1        // Mobile: 1 column
  md:grid-cols-2     // Tablet: 2 columns
  lg:grid-cols-3     // Desktop: 3 columns
">

<div className="
  px-4               // Mobile: 16px padding
  md:px-6            // Tablet: 24px padding
  lg:px-8            // Desktop: 32px padding
">
```

### Breakpoint Values
```
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

---

## ✅ COMPONENT USAGE CHECKLIST

When creating a new component, verify:

- [ ] Uses Shadcn/UI components from `/components/ui/`
- [ ] Colors match palette (bg-primary, text-gray-600, etc.)
- [ ] Spacing uses standard scale (p-6, space-y-4, gap-6)
- [ ] Typography matches sizes (text-xl, font-semibold)
- [ ] Shadows match scale (shadow-md, hover:shadow-xl)
- [ ] Borders use standard radius (rounded-lg)
- [ ] Transitions included (transition-colors, transition-all)
- [ ] Hover states defined
- [ ] Focus states defined
- [ ] Responsive classes used (md:, lg:)
- [ ] Accessibility attributes included (aria-label, etc.)

---

## 🚫 ANTI-PATTERNS (DO NOT DO)

### ❌ Wrong
```tsx
// Custom colors not in palette
<div className="bg-[#123456]">

// Inline styles
<div style={{ padding: '24px' }}>

// Non-standard spacing
<div className="p-[13px]">

// Custom font
<div className="font-comic-sans">

// Hardcoded px values
<div className="text-[17px]">
```

### ✅ Correct
```tsx
// Use palette colors
<div className="bg-primary">

// Use Tailwind classes
<div className="p-6">

// Use standard spacing
<div className="p-6">

// Use default font
<div className="font-sans">

// Use standard text sizes
<div className="text-lg">
```

---

## 📖 COMMON PATTERNS REFERENCE

### Hero Section Pattern
```tsx
<section className="py-20 lg:py-32 bg-gradient-to-br from-gray-50 to-gray-100">
  <div className="container mx-auto px-4 max-w-7xl">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
      <div className="space-y-6">
        <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 leading-tight">
          Hero Title
        </h1>
        <p className="text-xl text-gray-600 leading-relaxed">
          Description text
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button size="lg" className="bg-primary hover:bg-primary-hover text-white">
            Primary CTA
          </Button>
          <Button size="lg" variant="outline">
            Secondary CTA
          </Button>
        </div>
      </div>
      <div>{/* Visual element */}</div>
    </div>
  </div>
</section>
```

### Feature Grid Pattern
```tsx
<section className="py-20 bg-white">
  <div className="container mx-auto px-4 max-w-7xl">
    <div className="text-center mb-16">
      <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
        Section Title
      </h2>
      <p className="text-lg text-gray-600 max-w-2xl mx-auto">
        Section description
      </p>
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {features.map(feature => (
        <Card key={feature.id} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="text-4xl mb-4">{feature.icon}</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {feature.title}
          </h3>
          <p className="text-gray-600">
            {feature.description}
          </p>
        </Card>
      ))}
    </div>
  </div>
</section>
```

---

**Use this reference when creating ANY new component for Traveloure!**
