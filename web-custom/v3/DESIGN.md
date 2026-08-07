---
name: Kinetic Forge
colors:
  surface: '#0f131e'
  surface-dim: '#0f131e'
  surface-bright: '#353945'
  surface-container-lowest: '#0a0e19'
  surface-container-low: '#171b27'
  surface-container: '#1b1f2b'
  surface-container-high: '#262a36'
  surface-container-highest: '#313441'
  on-surface: '#dfe2f2'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#dfe2f2'
  inverse-on-surface: '#2c303c'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#adc6ff'
  on-secondary: '#002e6a'
  secondary-container: '#0566d9'
  on-secondary-container: '#e6ecff'
  tertiary: '#fdf2ff'
  on-tertiary: '#490080'
  tertiary-container: '#eacfff'
  on-tertiary-container: '#842bd2'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#f0dbff'
  tertiary-fixed-dim: '#ddb7ff'
  on-tertiary-fixed: '#2c0051'
  on-tertiary-fixed-variant: '#6900b3'
  background: '#0f131e'
  on-background: '#dfe2f2'
  surface-variant: '#313441'
  space-black: '#05070A'
  electric-cyan: '#00F0FF'
  plasma-purple: '#A855F7'
  glass-border: rgba(255, 255, 255, 0.1)
  code-gray: '#1E293B'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 72px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  code-label:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

The design system embodies a **Futurist / High-Contrast** aesthetic tailored for a "Tech-as-a-Service" model. It positions the product as the definitive, high-performance bridge between raw AI power and enterprise-scale application.

The visual narrative is built on **precision, speed, and depth**. By shifting from the light-mode origins of the current site to a sophisticated "Deep Space" environment, the interface feels like a mission control for developers. We utilize clean, geometric structures paired with vibrant light-emitting accents (neon pulses and glass blurs) to signal modern, cutting-edge capability.

The emotional goal is to evoke **absolute reliability** through structured layouts and **forward-thinking innovation** through advanced visual effects. It is a "developer-first" environment that feels premium, professional, and frictionless.

## Colors

The palette transitions from the standard light-mode blue to a multi-dimensional "Deep Space" theme.

- **Primary (Electric Cyan):** Used for critical calls to action, active states, and focus indicators. It represents high-speed data transfer and connectivity.
- **Secondary (Vibrant Blue):** Drawn from the existing brand, this serves as the foundational brand color for secondary buttons and structural accents.
- **Tertiary (Plasma Purple):** Reserved for highlights, specific AI model categories, and gradients that signify "intelligence" or "computation."
- **Neutral (Space Navy/Black):** The canvas is a deep, desaturated navy rather than true black, providing a more premium, backlit feel.

**Color Application:**
Use high-contrast ratios (WCAG AAA) for text against the deep background. Accents should be used sparingly but boldly to guide the user's eye toward interactive elements.

## Typography

This design system uses a triple-font strategy to balance impact, readability, and technicality:

1.  **Hanken Grotesk (Display & Headlines):** A sharp, contemporary sans-serif that feels engineered and modern. Used for high-impact marketing and section titles.
2.  **Inter (Body):** The industry standard for UI readability. Used for all long-form content, descriptions, and dashboard data.
3.  **JetBrains Mono (Technical Labels/Code):** A highly legible monospaced font used for API keys, terminal outputs, and metadata. This reinforces the "Unified API" nature of the product.

**Scale:** Headlines use tight letter-spacing to feel "locked-in" and architectural. Body text maintains generous line height for clarity against the dark background.

## Layout & Spacing

The system uses a **Fixed Grid** approach for marketing pages and a **Fluid Sidebar-Main** layout for application views.

- **The 8px Rhythm:** All padding, margins, and component heights must be multiples of 8px to ensure mathematical harmony.
- **Grid:** A 12-column grid with 24px gutters is standard. On desktop, content is centered within a 1280px container.
- **Density:** Maintain "Tech-SaaS" density—generous whitespace between major sections (80px+), but tight, efficient spacing within data-heavy cards and tables (8px–16px) to maximize information density for power users.

## Elevation & Depth

Hierarchy is established through **Tonal Layering and Glassmorphism** rather than traditional drop shadows.

- **Level 0 (Background):** `#05070A` - The base layer.
- **Level 1 (Card/Surface):** `#111827` - Subtly lighter to create separation. Use a 1px `glass-border` (white at 10% opacity) to define edges.
- **Level 2 (Glass Floating):** Semi-transparent surfaces (20% opacity) with a `24px` backdrop blur. Used for navigation bars and floating tooltips.
- **Accents:** Depth is further enhanced using "Glow" effects. Primary buttons and active status indicators should have a soft, colored outer glow (8px-16px blur) to simulate light emission on a dark console.

## Shapes

The design system utilizes **Soft (0.25rem)** roundedness to maintain a precise, engineered feel.

- **Standard Elements:** Buttons, inputs, and small cards use a `4px` radius. This feels modern without the "consumer-friendly" softness of fully rounded corners.
- **Large Containers:** Hero sections or main dashboard panels may use `8px` (rounded-lg) for a more substantial look.
- **Technical Elements:** Code blocks and small badges may use `2px` or `0px` to emphasize their "system-level" utility.

## Components

### Buttons
- **Primary:** Background in Electric Cyan, text in Space Black (Hanken Grotesk Bold). Subtle outer glow on hover.
- **Ghost:** Transparent background with 1px `glass-border`. Text in White.

### Input Fields
- Dark background (`#0B0F1A`) with 1px border. On focus, the border glows Electric Cyan. Labels use Inter SemiBold.

### Cards
- Surfaces are `#111827` with a 1px border. For "featured" AI models, use a subtle gradient border from Secondary Blue to Plasma Purple.

### Chips / Status Badges
- **Active:** Electric Cyan text on a desaturated Cyan-tinted transparent background.
- **Inactive:** Gray text on a transparent background with a dashed border.

### Code Blocks
- Background is `#05070A`. Use JetBrains Mono. Syntax highlighting should follow a "Cyber" theme using the Primary, Secondary, and Tertiary accent colors.

### Lists
- Use horizontal dividers with 5% opacity. Icons should be monolinear and 20px in size, colored in Secondary Blue for consistency.
