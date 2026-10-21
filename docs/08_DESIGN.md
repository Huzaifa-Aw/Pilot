# Design System & Style Specification

> **Portability Notice:** This document is a standalone, framework-agnostic design specification. You can copy this file into any other project (Next.js, Vite, React, Vue, Svelte, or Vanilla HTML/CSS) to reproduce the exact same visual identity, tokens, and UI components.

---

## 1. Aesthetic Vision & Personality

- **Design Archetype:** Modern SaaS Dashboard / Enterprise Financial & Operations Portal
- **Key Characteristics:** Clean, crisp, high-contrast, data-dense without feeling cluttered, subtle elevations, rounded modern edges, and polished micro-interactions.
- **Palette Strategy:**
  - **Dominant Base:** Clean slate-gray neutrals (`#F8FAFC` to `#0F172A`).
  - **Brand & Trust:** Vibrant Royal Blue (`#2563EB`) as primary interactive color.
  - **Energy & Action:** Vivid Warm Orange (`#F97316`) as accent/CTA.
  - **Shell Layout:** Dark contrasting sidebar (`#0F172A`) paired with bright surface cards (`#FFFFFF`).
  - **Semantic Hierarchy:** Dedicated color pairs (light background + dark high-contrast foreground) for every status and badge state.

---

## 2. Design Tokens & Color Palette

### 2.1 Complete Color Scale

| Role / Scale | Token Name | Hex Value | RGB / HSL Reference | Usage |
|---|---|---|---|---|
| **Brand Primary 400** | `--color-brand-primary-400` | `#60A5FA` | `rgb(96, 165, 250)` | Focus highlights, dark-mode links |
| **Brand Primary (500)** | `--color-brand-primary` | `#2563EB` | `rgb(37, 99, 235)` | Primary buttons, active states, key links |
| **Brand Primary 600** | `--color-brand-primary-600` | `#1D4ED8` | `rgb(29, 78, 216)` | Primary button hover, sidebar active |
| **Brand Primary 700** | `--color-brand-primary-700` | `#1E40AF` | `rgb(30, 64, 175)` | Active button press, dark info text |
| **Brand Accent (CTA)** | `--color-brand-accent` | `#F97316` | `rgb(249, 115, 22)` | Accent CTAs, secondary brand marks, alerts |
| **Accent Hover** | `--color-brand-accent-hover`| `#EA580C` | `rgb(234, 88, 12)` | Accent hover state |
| **Neutral 50** | `--color-neutral-50` | `#F8FAFC` | `rgb(248, 250, 252)` | App canvas background (`--bg-base`), table hover |
| **Neutral 100** | `--color-neutral-100` | `#F1F5F9` | `rgb(241, 245, 249)` | Ghost button hover, subtle card fills, inactive tags |
| **Neutral 200** | `--color-neutral-200` | `#E2E8F0` | `rgb(226, 232, 240)` | Default borders (`--border-default`), dividers |
| **Neutral 300** | `--color-neutral-300` | `#CBD5E1` | `rgb(203, 213, 225)` | Stronger borders, disabled button borders |
| **Neutral 400** | `--color-neutral-400` | `#94A3B8` | `rgb(148, 163, 184)` | Placeholder text, inactive icon outlines |
| **Neutral 500** | `--color-neutral-500` | `#64748B` | `rgb(100, 116, 139)` | Muted copy, secondary metadata, captions |
| **Neutral 600** | `--color-neutral-600` | `#475569` | `rgb(71, 85, 105)` | Secondary body text, form field labels |
| **Neutral 700** | `--color-neutral-700` | `#334155` | `rgb(51, 65, 85)` | Subsection titles, high-emphasis secondary |
| **Neutral 800** | `--color-neutral-800` | `#1E293B` | `rgb(30, 41, 59)` | Primary body copy, headers (`--text-primary`) |
| **Neutral 900** | `--color-neutral-900` | `#0F172A` | `rgb(15, 23, 42)` | Sidebar background (`--bg-sidebar`) |

---

### 2.2 Semantic Feedback Palette

All feedback and status badges use two coordinated tokens: a **Light Background** (high-tint wash) paired with a **Dark Text/Icon Color** to ensure accessible contrast (WCAG AA & AAA compliant).

| Status | Background Token | Hex | Text/Border Token | Hex | Indicator Dot Hex |
|---|---|---|---|---|---|
| **Success / Paid** | `--color-success-light` | `#DCFCE7` | `--color-success-dark` | `#15803D` | `#22C55E` (`--color-success`) |
| **Warning / Pending** | `--color-warning-light` | `#FEF9C3` | `--color-warning-dark` | `#A16207` | `#EAB308` (`--color-warning`) |
| **Error / Overdue** | `--color-error-light` | `#FEE2E2` | `--color-error-dark` | `#B91C1C` | `#EF4444` (`--color-error`) |
| **Info / Active / Open**| `--color-info-light` | `#DBEAFE` | `--color-info-dark` | `#1E40AF` | `#2563EB` (`--color-brand-primary`) |
| **In-Progress** | `--color-progress-bg` | `#EDE9FE` | `--color-progress-text` | `#5B21B6` | `#7C3AED` (`--color-progress-dot`) |
| **Neutral / Vacant** | `--color-neutral-100` | `#F1F5F9` | `--color-neutral-600` | `#475569` | `#94A3B8` (`--color-neutral-400`) |

---

### 2.3 Semantic Surface & Text Variables

```css
:root {
  /* Surfaces */
  --bg-base:             #F8FAFC;  /* App background */
  --bg-surface:          #FFFFFF;  /* Cards, tables, forms */
  --bg-surface-raised:   #FFFFFF;  /* Modals, popovers */
  --bg-sidebar:          #0F172A;  /* Dark navigation shell */
  --bg-sidebar-hover:    #1E293B;  /* Hover state in navigation */
  --bg-sidebar-active:   #1D4ED8;  /* Active route highlight */

  /* Text Roles */
  --text-primary:        #1E293B;  /* Headings and primary copy */
  --text-secondary:      #475569;  /* Supporting descriptions, labels */
  --text-muted:          #64748B;  /* Timestamps, helper text, empty states */
  --text-inverse:        #FFFFFF;  /* Text on dark sidebar or primary buttons */

  /* Borders */
  --border-default:      #E2E8F0;  /* Standard card/table/input borders */
  --border-focus:        #2563EB;  /* Interactive element focus state */

  /* Focus Ring */
  --shadow-focus-ring:   0 0 0 3px rgba(37, 99, 235, 0.15);
}
```

---

## 3. Typography & Font Scale

### 3.1 Font Families
- **Display & Section Headings:** `'Poppins', sans-serif` (Weights: `500`, `600`, `700`)
- **Body, UI & Data Tables:** `'Inter', system-ui, sans-serif` (Weights: `400`, `500`, `600`, `700`)

```html
<!-- Google Fonts Embed -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
```

### 3.2 Type Scale

| Scale | Size | Line Height | Tracking | Recommended Weight | Usage |
|---|---|---|---|---|---|
| **`text-xs`** | `0.75rem` (12px) | `1.0rem` (16px) | `0.025em` to `0.1em` | `500` / `600` | Badges, table headers (uppercase), micro-labels |
| **`text-sm`** | `0.875rem` (14px)| `1.25rem` (20px)| `normal` | `400` / `500` | Table data cells, input fields, form labels, secondary copy |
| **`text-base`** | `1.0rem` (16px) | `1.5rem` (24px) | `normal` | `400` / `600` | Default body copy, button labels, card headers |
| **`text-lg`** | `1.125rem` (18px)| `1.75rem` (28px)| `-0.01em` | `600` | Card titles, modal titles, drawer headers |
| **`text-xl`** | `1.25rem` (20px) | `1.75rem` (28px)| `-0.015em`| `600` | Section headings, prominent dialog titles |
| **`text-2xl`** | `1.5rem` (24px)  | `2.0rem` (32px) | `-0.02em` | `700` | Page title in TopBar / PageHeader |
| **`text-3xl`** | `1.875rem` (30px)| `2.25rem` (36px)| `-0.025em`| `700` | KPI card hero metrics, analytics stat highlights |
| **`text-4xl`** | `2.25rem` (36px) | `2.5rem` (40px) | `-0.03em` | `700` | Landing heroes, large balance display |

---

## 4. Spacing, Radii, Shadows & Elevation

### 4.1 4-Pixel Spacing Grid
```css
--space-1:  0.25rem;  /* 4px  - Micro gap, badge padding */
--space-2:  0.5rem;   /* 8px  - Stack gap, small button padding */
--space-3:  0.75rem;  /* 12px - Form field spacing, table cell padding */
--space-4:  1.0rem;   /* 16px - Default container padding, button px */
--space-5:  1.25rem;  /* 20px - Card header py */
--space-6:  1.5rem;   /* 24px - Standard card padding, grid gutter */
--space-8:  2.0rem;   /* 32px - Page content padding, modal padding */
--space-10: 2.5rem;   /* 40px - Major section dividers */
--space-12: 3.0rem;   /* 48px - Auth hero spacing */
```

### 4.2 Border Radii
```css
--radius-sm:   0.25rem;  /* 4px  - Small badges, micro tags */
--radius-md:   0.5rem;   /* 8px  - Buttons, form inputs, dropdown menus */
--radius-lg:   0.75rem;  /* 12px - Standard cards, KPI containers */
--radius-xl:   1.0rem;   /* 16px - Modal dialogs, major panel containers */
--radius-2xl:  1.5rem;   /* 24px - Auth card, hero banners */
--radius-full: 9999px;   /* Full pills, status dots, user avatars */
```

### 4.3 Shadows & Elevation
```css
/* Elevation Levels */
--shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1); /* Standard cards */
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); /* Card hover */
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1); /* Dropdowns/Flyouts */
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1); /* Modals */
```

### 4.4 Z-Index Hierarchy
```css
--z-base:     0;   /* Normal content */
--z-dropdown: 20;  /* Select popups, action menus */
--z-sidebar:  30;  /* App navigation rail/drawer */
--z-overlay:  40;  /* Modal backdrop shade */
--z-modal:    50;  /* Modal dialogue panel */
--z-toast:    60;  /* Floating alert toasts */
```

---

## 5. Ready-to-Copy Configuration

### Option A: Tailwind CSS v4 (`globals.css` / `@theme`)

```css
@import "tailwindcss";

@theme {
  /* Brand colours */
  --color-brand-primary-400: #60a5fa;
  --color-brand-primary:     #2563eb;
  --color-brand-primary-600: #1d4ed8;
  --color-brand-primary-700: #1e40af;
  --color-brand-accent:      #f97316;
  --color-brand-accent-hover:#ea580c;

  /* Neutral scale */
  --color-neutral-50:  #f8fafc;
  --color-neutral-100: #f1f5f9;
  --color-neutral-200: #e2e8f0;
  --color-neutral-300: #cbd5e1;
  --color-neutral-400: #94a3b8;
  --color-neutral-500: #64748b;
  --color-neutral-600: #475569;
  --color-neutral-700: #334155;
  --color-neutral-800: #1e293b;
  --color-neutral-900: #0f172a;

  /* Semantic surfaces */
  --color-surface:          #ffffff;
  --color-surface-raised:   #ffffff;
  --color-base:             #f8fafc;
  --color-sidebar:          #0f172a;
  --color-sidebar-hover:    #1e293b;
  --color-sidebar-active:   #1d4ed8;

  /* Semantic text */
  --color-text-primary:   #1e293b;
  --color-text-secondary: #475569;
  --color-text-muted:     #64748b;
  --color-text-inverse:   #ffffff;

  /* Semantic borders */
  --color-border-default: #e2e8f0;
  --color-border-focus:   #2563eb;

  /* Feedback */
  --color-success-light: #dcfce7;
  --color-success:       #22c55e;
  --color-success-dark:  #15803d;
  --color-warning-light: #fef9c3;
  --color-warning:       #eab308;
  --color-warning-dark:  #a16207;
  --color-error-light:   #fee2e2;
  --color-error:         #ef4444;
  --color-error-dark:    #b91c1c;
  --color-info-light:    #dbeafe;
  --color-info-dark:     #1e40af;

  /* In-progress badge (purple) */
  --color-progress-bg:   #ede9fe;
  --color-progress-text: #5b21b6;
  --color-progress-dot:  #7c3aed;

  /* Typography */
  --font-heading: 'Poppins', sans-serif;
  --font-body:    'Inter', system-ui, sans-serif;

  /* Border radii */
  --radius-sm:   0.25rem;
  --radius-md:   0.5rem;
  --radius-lg:   0.75rem;
  --radius-xl:   1rem;
  --radius-2xl:  1.5rem;
  --radius-full: 9999px;

  /* Sidebar layout */
  --width-sidebar: 240px;

  /* Focus ring */
  --shadow-focus-ring: 0 0 0 3px rgba(37,99,235,0.15);

  /* Modal animation keyframes */
  --animate-modal-in:    modal-in 200ms ease forwards;
  --animate-backdrop-in: backdrop-in 200ms ease forwards;
}

@keyframes modal-in {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes backdrop-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

---

### Option B: Tailwind CSS v3 (`tailwind.config.js` / `tailwind.config.ts`)

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,html}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: {
            DEFAULT: "#2563eb",
            400: "#60a5fa",
            600: "#1d4ed8",
            700: "#1e40af",
          },
          accent: {
            DEFAULT: "#f97316",
            hover: "#ea580c",
          },
        },
        neutral: {
          50:  "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },
        surface: "#ffffff",
        base: "#f8fafc",
        sidebar: {
          DEFAULT: "#0f172a",
          hover: "#1e293b",
          active: "#1d4ed8",
        },
        text: {
          primary: "#1e293b",
          secondary: "#475569",
          muted: "#64748b",
          inverse: "#ffffff",
        },
        border: {
          default: "#e2e8f0",
          focus: "#2563eb",
        },
        success: {
          light: "#dcfce7",
          DEFAULT: "#22c55e",
          dark: "#15803d",
        },
        warning: {
          light: "#fef9c3",
          DEFAULT: "#eab308",
          dark: "#a16207",
        },
        error: {
          light: "#fee2e2",
          DEFAULT: "#ef4444",
          dark: "#b91c1c",
        },
        info: {
          light: "#dbeafe",
          dark: "#1e40af",
        },
        progress: {
          bg: "#ede9fe",
          text: "#5b21b6",
          dot: "#7c3aed",
        },
      },
      fontFamily: {
        heading: ["Poppins", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "focus-ring": "0 0 0 3px rgba(37,99,235,0.15)",
      },
    },
  },
  plugins: [],
};
```

---

### Option C: Pure Vanilla CSS (`styles.css` / `:root`)

```css
:root {
  /* Colors */
  --color-primary-400: #60a5fa;
  --color-primary-500: #2563eb;
  --color-primary-600: #1d4ed8;
  --color-primary-700: #1e40af;
  --color-accent-500:  #f97316;
  --color-accent-600:  #ea580c;

  --color-neutral-50:  #f8fafc;
  --color-neutral-100: #f1f5f9;
  --color-neutral-200: #e2e8f0;
  --color-neutral-300: #cbd5e1;
  --color-neutral-400: #94a3b8;
  --color-neutral-500: #64748b;
  --color-neutral-600: #475569;
  --color-neutral-700: #334155;
  --color-neutral-800: #1e293b;
  --color-neutral-900: #0f172a;

  /* Surfaces & Text */
  --bg-base:           var(--color-neutral-50);
  --bg-surface:        #ffffff;
  --bg-sidebar:        var(--color-neutral-900);
  --bg-sidebar-hover:  var(--color-neutral-800);
  --bg-sidebar-active: var(--color-primary-600);
  --text-primary:      var(--color-neutral-800);
  --text-secondary:    var(--color-neutral-600);
  --text-muted:        var(--color-neutral-500);
  --text-inverse:      #ffffff;
  --border-default:    var(--color-neutral-200);
  --border-focus:      var(--color-primary-500);

  /* Status */
  --color-success-light: #dcfce7;
  --color-success:       #22c55e;
  --color-success-dark:  #15803d;
  --color-warning-light: #fef9c3;
  --color-warning:       #eab308;
  --color-warning-dark:  #a16207;
  --color-error-light:   #fee2e2;
  --color-error:         #ef4444;
  --color-error-dark:    #b91c1c;
  --color-info-light:    #dbeafe;
  --color-info-dark:     #1e40af;

  /* Fonts */
  --font-heading: 'Poppins', sans-serif;
  --font-body:    'Inter', system-ui, sans-serif;

  /* Radii & Shadows */
  --radius-sm:  0.25rem;
  --radius-md:  0.5rem;
  --radius-lg:  0.75rem;
  --radius-xl:  1.0rem;
  --radius-2xl: 1.5rem;
  --shadow-sm:  0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-xl:  0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
}
```

---

## 6. Core UI Component Blueprints

### 6.1 Buttons

Buttons feature crisp typography, consistent heights, subtle box-shadows, and micro-elevation on active press (`active:translate-y-px`).

#### Variants:
1. **Primary:** High-emphasis actions (Save, Submit, Create, Confirm).
2. **Secondary:** Outlined cards, Cancel, Filter, Export, Secondary action.
3. **Ghost:** TopBar icon buttons, table action triggers, inline navigation.
4. **Danger:** Irreversible actions (Delete, Terminate Lease).

#### HTML + Tailwind Classes:
```html
<!-- Primary Button -->
<button class="inline-flex items-center justify-center gap-2 rounded-md bg-brand-primary px-4 h-10 text-sm font-semibold text-text-inverse transition-[background,box-shadow] duration-200 hover:bg-brand-primary-600 hover:shadow-md active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:opacity-50 disabled:pointer-events-none">
  Save Changes
</button>

<!-- Secondary Button -->
<button class="inline-flex items-center justify-center gap-2 rounded-md border border-border-default bg-surface px-4 h-10 text-sm font-semibold text-text-primary transition-[background,box-shadow] duration-200 hover:bg-neutral-50 hover:shadow-sm active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:opacity-50 disabled:pointer-events-none">
  Cancel
</button>

<!-- Ghost Button -->
<button class="inline-flex items-center justify-center gap-2 rounded-md bg-transparent px-3 h-8 text-xs font-semibold text-text-secondary transition-colors duration-200 hover:bg-neutral-100 hover:text-text-primary active:translate-y-px">
  View All
</button>

<!-- Danger Button -->
<button class="inline-flex items-center justify-center gap-2 rounded-md bg-error text-text-inverse px-4 h-10 text-sm font-semibold transition-[background,box-shadow] duration-200 hover:bg-error-dark hover:shadow-md active:translate-y-px">
  Delete Property
</button>
```

---

### 6.2 Status Badges & Pills

Used across tables, cards, and modal headers to communicate state instantaneously. Supports an optional 6×6px rounded status dot.

#### Badge Matrix:
```html
<!-- Paid / Approved (Success) -->
<span class="inline-flex items-center gap-1.5 rounded-full bg-success-light px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-success-dark">
  <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
  Paid
</span>

<!-- Overdue / High Severity (Error) -->
<span class="inline-flex items-center gap-1.5 rounded-full bg-error-light px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-error-dark">
  <span class="h-1.5 w-1.5 rounded-full bg-error"></span>
  Overdue
</span>

<!-- Pending / Expiring / Warning (Warning) -->
<span class="inline-flex items-center gap-1.5 rounded-full bg-warning-light px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-warning-dark">
  <span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
  Pending
</span>

<!-- Active / Open (Info) -->
<span class="inline-flex items-center gap-1.5 rounded-full bg-info-light px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-info-dark">
  <span class="h-1.5 w-1.5 rounded-full bg-brand-primary"></span>
  Active
</span>

<!-- In Progress (Unique Purple Tint) -->
<span class="inline-flex items-center gap-1.5 rounded-full bg-progress-bg px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-progress-text">
  <span class="h-1.5 w-1.5 rounded-full bg-progress-dot"></span>
  In Progress
</span>

<!-- Vacant / Draft / Closed (Neutral) -->
<span class="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
  <span class="h-1.5 w-1.5 rounded-full bg-neutral-400"></span>
  Vacant
</span>
```

---

### 6.3 KPI / Stat Metric Cards

The benchmark for operational SaaS dashboards. Features an accent border-left indicator (4px), a 40×40px semantic icon container, bold headline numbers, and an upward/downward trend badge.

```html
<article class="relative overflow-hidden rounded-lg border border-border-default bg-surface p-6 shadow-sm transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-md border-l-4 border-l-brand-primary">
  <div class="flex items-start justify-between mb-4">
    <!-- Icon Container: 40x40px with semantic wash -->
    <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-info-light text-brand-primary">
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    </div>

    <!-- Trend Badge -->
    <span class="inline-flex items-center gap-1 rounded-full bg-success-light px-2 py-0.5 text-xs font-semibold text-success-dark">
      <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
      +8.4%
    </span>
  </div>

  <!-- Metric Value & Label -->
  <div class="font-heading text-3xl font-bold text-text-primary tracking-tight">$42,850</div>
  <p class="mt-1 text-sm font-medium text-text-secondary">Total Monthly Revenue</p>
</article>
```

---

### 6.4 Cards & Bento Containers

Standard surface cards maintain consistent padding, header divider, and action slots.

```html
<div class="overflow-hidden rounded-lg border border-border-default bg-surface shadow-sm">
  <!-- Card Header -->
  <div class="flex items-center justify-between border-b border-border-default px-6 py-4">
    <h2 class="font-heading text-base font-semibold text-text-primary">Recent Leases</h2>
    <button class="cursor-pointer text-sm font-medium text-brand-primary hover:text-brand-primary-600 transition-colors">
      View All
    </button>
  </div>

  <!-- Card Body -->
  <div class="p-6">
    Card content goes here...
  </div>
</div>
```

---

### 6.5 Form Inputs & Field Controls

- Height: `40px` (`h-10`)
- Padding: `0.5rem 0.75rem` (`px-3 py-2`)
- Border: `1px solid var(--border-default)` (`#E2E8F0`)
- Focus: `border-brand-primary` with `box-shadow: 0 0 0 3px rgba(37,99,235,0.15)`

```html
<div class="flex flex-col gap-1.5">
  <label for="monthly-rent" class="text-sm font-medium text-text-secondary">
    Monthly Rent ($)
  </label>
  <input
    id="monthly-rent"
    type="number"
    placeholder="e.g. 1,450"
    class="h-10 w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-neutral-400 focus:border-brand-primary focus:outline-none focus:ring-3 focus:ring-brand-primary/15 transition-all"
  />
  <span class="text-xs text-text-muted">Standard rate applied at lease signing</span>
</div>
```

---

### 6.6 Data Tables

High-density financial and record tables.
- **Header:** Sticky-capable, uppercase tracking, subtle background, `text-xs font-semibold text-text-muted`.
- **Row:** `border-b border-border-default`, hover state `bg-neutral-50`.
- **Numbers/Amounts:** Right-aligned with tabular numbers (`font-mono` or `tabular-nums`).

```html
<div class="w-full overflow-x-auto rounded-lg border border-border-default bg-surface shadow-sm">
  <table class="w-full border-collapse text-left text-sm">
    <thead>
      <tr class="border-b border-border-default bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-text-muted">
        <th class="px-6 py-3.5">Property / Unit</th>
        <th class="px-6 py-3.5">Tenant</th>
        <th class="px-6 py-3.5">Status</th>
        <th class="px-6 py-3.5 text-right">Balance</th>
        <th class="px-6 py-3.5 text-right">Actions</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border-default text-text-primary">
      <tr class="transition-colors hover:bg-neutral-50">
        <td class="px-6 py-4 font-medium">Sunset Heights &bull; Apt 3B</td>
        <td class="px-6 py-4 text-text-secondary">Eleanor Vance</td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center gap-1.5 rounded-full bg-success-light px-2.5 py-0.5 text-xs font-semibold text-success-dark">
            <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
            Paid
          </span>
        </td>
        <td class="px-6 py-4 text-right font-medium tabular-nums">$1,850.00</td>
        <td class="px-6 py-4 text-right">
          <button class="text-sm font-medium text-brand-primary hover:text-brand-primary-600">Edit</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

### 6.7 Modal / Dialog Pattern

- **Backdrop:** `fixed inset-0 bg-neutral-900/50 backdrop-blur-xs z-40 animate-fade-in`
- **Panel:** `z-50 rounded-xl bg-surface shadow-xl max-w-lg w-full border border-border-default`
- **Animation:** `scale(0.95) -> scale(1.0)` with `opacity: 0 -> 1` (200ms ease)

```html
<!-- Modal Backdrop -->
<div class="fixed inset-0 z-40 flex items-center justify-center bg-neutral-900/50 p-4 backdrop-blur-[2px]">
  <!-- Dialog Panel -->
  <div class="relative w-full max-w-lg rounded-xl border border-border-default bg-surface shadow-xl overflow-hidden animate-[modal-in_200ms_ease_forwards]">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-border-default px-6 py-4">
      <div>
        <h3 class="font-heading text-lg font-semibold text-text-primary">Add New Tenant</h3>
        <p class="text-xs text-text-muted mt-0.5">Assign tenant details and emergency contact</p>
      </div>
      <button class="rounded-md p-1.5 text-text-muted hover:bg-neutral-100 hover:text-text-primary">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <!-- Body -->
    <div class="px-6 py-5 space-y-4">
      <!-- Input fields go here -->
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-end gap-3 border-t border-border-default bg-neutral-50 px-6 py-4">
      <button class="h-9 px-4 text-sm font-medium text-text-secondary hover:text-text-primary">Cancel</button>
      <button class="h-9 rounded-md bg-brand-primary px-4 text-sm font-semibold text-text-inverse hover:bg-brand-primary-600">Save Tenant</button>
    </div>
  </div>
</div>
```

---

### 6.8 Alert Banners

Full-width and card-level notification callouts.

```html
<!-- Error Alert Banner -->
<div class="flex items-start gap-3 rounded-lg border border-error-light bg-error-light/40 p-4 text-error-dark">
  <svg class="h-5 w-5 shrink-0 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  <div class="text-sm">
    <strong class="font-semibold">Payment Overdue:</strong>
    <span> 3 tenant utility bills have exceeded their grace period.</span>
  </div>
</div>

<!-- Info Banner -->
<div class="flex items-start gap-3 rounded-lg border border-info-light bg-info-light/40 p-4 text-info-dark">
  <svg class="h-5 w-5 shrink-0 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  <div class="text-sm">
    <strong class="font-semibold">Notice:</strong>
    <span> Scheduled maintenance for the payment gateway on Sunday at 02:00 UTC.</span>
  </div>
</div>
```

---

## 7. Layout Shell & Navigation Structure

```
+-------------------------------------------------------------------------+
| [ Dark Sidebar: 240px ] | [ TopBar: 64px height, fluid width ]         |
|                         | - Breadcrumb / Current Page Title             |
| - Brand Logo & Name     | - Search / Global filter                      |
| - Navigation links:     | - Notifications & User Avatar                 |
|   * Properties          +-----------------------------------------------+
|   * Tenants             | [ Main Content: bg-base (#F8FAFC), p-6/p-8 ]  |
|   * Leases              |                                               |
|   * Rent Ledger         | 1. Page Header (Title + CTA Button)           |
|   * Maintenance         | 2. KPI Cards Grid (4 cols / 2 cols / 1 col)   |
|   * Utilities           | 3. Main Data Table or Split Bento Panels      |
|   * Billing             |                                               |
| - User profile / Logout |                                               |
+-------------------------------------------------------------------------+
```

### Layout Rules:
1. **Desktop Shell:**
   - Sidebar: fixed `240px` (`min-w-[240px] max-w-[240px]`), background `#0F172A`, text `rgba(255,255,255,0.85)`.
   - Active nav item: `background: #1D4ED8`, text `#FFFFFF`, `border-radius: 8px`.
   - Hover nav item: `background: #1E293B`, text `#FFFFFF`.
2. **Mobile Shell (`< 768px`):**
   - Sidebar collapses into an off-canvas drawer with toggle button in the TopBar.
   - Main content padding reduces from `p-8` (32px) to `p-4` (16px).
   - KPI metrics collapse into a 2-column or 1-column stack.

---

## 8. Iconography Standards

- **Library:** Lucide Icons (inline SVG, 24×24 viewBox)
- **Props:** `stroke="currentColor"`, `fill="none"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- **Sizes:**
  - `16px` (`size={16}`): Inline links, badges, table actions.
  - `20px` (`size={20}`): Navigation items, buttons, form inputs.
  - `24px` (`size={24}`): Section titles, top bar actions.
  - `40px` (`size={40}`): KPI icon wrappers, empty state placeholders.
- **Strict Rule:** Never use emojis as functional UI icons; use vector SVGs to preserve crisp rendering across retina displays.

---

## 9. Accessibility (a11y) & Usability Checklist

1. **Color Contrast:**
   - Regular body copy on white: Contrast ratio is `10.8:1` (exceeds WCAG AAA `7:1`).
   - Muted text (`#64748B` on `#FFFFFF`): `4.6:1` (exceeds WCAG AA `4.5:1`).
2. **Focus Visibility:**
   - Every interactive control must exhibit an active focus ring: `outline: 2px solid #2563EB; outline-offset: 2px;` or `box-shadow: 0 0 0 3px rgba(37,99,235,0.15);`.
3. **Multi-Modal Indicators:**
   - Badges never rely solely on color; they always include descriptive text and/or status dot indicators.
4. **Reduced Motion:**
   - All animations must respect OS preferences:
     ```css
     @media (prefers-reduced-motion: reduce) {
       *, ::before, ::after {
         animation-duration: 0.01ms !important;
         animation-iteration-count: 1 !important;
         transition-duration: 0.01ms !important;
       }
     }
     ```

---

## 10. Summary Cheat-Sheet for Fast Reuse

To apply this design system in another app:
1. Copy **Fonts** (`Inter` + `Poppins`) into your HTML `<head>` or CSS `@import`.
2. Copy **Option A** (`@theme` in Tailwind v4) or **Option B** (`tailwind.config.js` in Tailwind v3) into your styling pipeline.
3. Use the CSS variables or Tailwind utility classes (`bg-brand-primary`, `bg-surface`, `bg-base`, `text-text-primary`, `border-border-default`).
4. Replicate the component templates for Buttons, Badges, KPI Cards, Tables, and Modals from Section 6.
