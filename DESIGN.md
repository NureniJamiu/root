# Design Language: Attention Required! | Cloudflare

> Extracted from `https://replit.com` on May 28, 2026
> 47 elements analyzed

This document describes the complete design language of the website. It is structured for AI/LLM consumption — use it to faithfully recreate the visual design in any framework.

## Color Palette

### Primary Colors

| Role | Hex | RGB | HSL | Usage Count |
|------|-----|-----|-----|-------------|
| Primary | `#0051c3` | rgb(0, 81, 195) | hsl(215, 100%, 38%) | 4 |
| Secondary | `#de5052` | rgb(222, 80, 82) | hsl(359, 68%, 59%) | 1 |
| Accent | `#521010` | rgb(82, 16, 16) | hsl(0, 67%, 19%) | 1 |

### Neutral Colors

| Hex | HSL | Usage Count |
|-----|-----|-------------|
| `#404040` | hsl(0, 0%, 25%) | 53 |
| `#000000` | hsl(0, 0%, 0%) | 30 |
| `#595959` | hsl(0, 0%, 35%) | 4 |
| `#ffffff` | hsl(0, 0%, 100%) | 3 |
| `#ebebeb` | hsl(0, 0%, 92%) | 2 |

### Background Colors

Used on large-area elements: `#ffffff`, `#ebebeb`

### Text Colors

Text color palette: `#000000`, `#404040`, `#ffffff`, `#595959`, `#0051c3`

### Gradients

```css
background-image: -webkit-gradient(linear, 0% 0%, 0% 100%, from(rgb(222, 222, 222)), color-stop(0.03, rgb(235, 235, 235)), color-stop(0.97, rgb(235, 235, 235)), to(rgb(222, 222, 222)));
```

### Full Color Inventory

| Hex | Contexts | Count |
|-----|----------|-------|
| `#404040` | text, border | 53 |
| `#000000` | text, border | 30 |
| `#595959` | text, border | 4 |
| `#0051c3` | text, border | 4 |
| `#ffffff` | text, background | 3 |
| `#ebebeb` | background, border | 2 |
| `#de5052` | background | 1 |
| `#521010` | border | 1 |

## Typography

### Font Families

- **Times** — used for body (15 elements)

### Type Scale

| Size (px) | Size (rem) | Weight | Line Height | Letter Spacing | Used On |
|-----------|------------|--------|-------------|----------------|---------|
| 60px | 3.75rem | 300 | 72px | normal | h1 |
| 30px | 1.875rem | 300 | 39px | normal | h2, span |
| 16px | 1rem | 400 | normal | normal | html, head, title, meta |
| 15px | 0.9375rem | 400 | 22.5px | normal | div, span, p, script |
| 13px | 0.8125rem | 400 | 19.5px | normal | div, p, span, strong |

### Heading Scale

```css
h1 { font-size: 60px; font-weight: 300; line-height: 72px; }
h2 { font-size: 30px; font-weight: 300; line-height: 39px; }
```

### Body Text

```css
body { font-size: 13px; font-weight: 400; line-height: 19.5px; }
```

### Font Weights in Use

`400` (43x), `300` (3x), `600` (1x)

## Spacing

| Token | Value | Rem |
|-------|-------|-----|
| spacing-3 | 3px | 0.1875rem |
| spacing-23 | 23px | 1.4375rem |
| spacing-53 | 53px | 3.3125rem |
| spacing-160 | 160px | 10rem |

## Border Radii

| Label | Value | Count |
|-------|-------|-------|
| xs | 2px | 1 |
| sm | 5px | 1 |

## CSS Custom Properties

### Semantic

```css
success: [object Object];
warning: [object Object];
error: [object Object];
info: [object Object];
```

## Breakpoints

| Name | Value | Type |
|------|-------|------|
| md | 787px | min-width |
| lg | 1056px | min-width |

## Transitions & Animations

**Durations:** `0.15s`

### Common Transitions

```css
transition: all;
transition: color 0.15s;
transition: 0.15s;
```

## Component Patterns

Detected UI component patterns and their most common styles:

### Buttons (1 instances)

```css
.button {
  color: rgb(0, 81, 195);
  font-size: 13px;
  font-weight: 400;
  padding-top: 0px;
  padding-right: 0px;
  border-radius: 0px;
}
```

### Links (1 instances)

```css
.link {
  color: rgb(0, 81, 195);
  font-size: 13px;
  font-weight: 400;
}
```

### Navigation (1 instances)

```css
.navigatio {
  color: rgb(64, 64, 64);
  padding-top: 35px;
  padding-bottom: 0px;
  padding-left: 0px;
  padding-right: 0px;
  position: static;
}
```

### Footer (7 instances)

```css
.foote {
  color: rgb(64, 64, 64);
  padding-top: 0px;
  padding-bottom: 0px;
  font-size: 13px;
}
```

## Component Clusters

Reusable component instances grouped by DOM structure and style similarity:

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 81, 195);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(0, 81, 195);
  font-size: 13px;
  font-weight: 400;
```

## Layout System

**0 grid containers** and **0 flex containers** detected.

## Accessibility (WCAG 2.1)

**Overall Score: 100%** — 0 passing, 0 failing color pairs

## Design System Score

**Overall: 84/100 (Grade: B)**

| Category | Score |
|----------|-------|
| Color Discipline | 100/100 |
| Typography Consistency | 100/100 |
| Spacing System | 55/100 |
| Shadow Consistency | 85/100 |
| Border Radius Consistency | 100/100 |
| Accessibility | 100/100 |
| CSS Tokenization | 50/100 |

**Strengths:** Tight, disciplined color palette, Consistent typography system, Clean elevation system, Consistent border radii, Strong accessibility compliance

**Issues:**
- No consistent spacing base unit detected — values appear arbitrary
- 16 !important rules — prefer specificity over overrides
- 69% of CSS is unused — consider purging
- 241 duplicate CSS declarations

## Gradients

**1 unique gradients** detected.

| Type | Direction | Stops | Classification |
|------|-----------|-------|----------------|
| linear | — | 7 | complex |

```css
background: gradient(linear, 0% 0%, 0% 100%, from(rgb(222, 222, 222)), color-stop(0.03, rgb(235, 235, 235)), color-stop(0.97, rgb(235, 235, 235)), to(rgb(222, 222, 222)));
```

## Z-Index Map

**1 unique z-index values** across 1 layers.

| Layer | Range | Elements |
|-------|-------|----------|
| modal | 999999999,999999999 | div |

**Issues:**
- [object Object]

## Motion Language

**Feel:** mixed · **Scroll-linked:** yes

### Duration Tokens

| name | value | ms |
|---|---|---|
| `xs` | `150ms` | 150 |

## Brand Voice

**Tone:** neutral · **Pronoun:** third-person · **Headings:** unknown (tight)

### Top CTA Verbs

- **click** (1)

### Button Copy Patterns

- "click to reveal" (1×)

## Page Intent

**Type:** `landing` (confidence 0.45)

## Material Language

**Label:** `flat` (confidence 0.55)

| Metric | Value |
|--------|-------|
| Avg saturation | 0.306 |
| Shadow profile | none |
| Avg shadow blur | 0px |
| Max radius | 5px |
| backdrop-filter in use | no |
| Gradients | 1 |

## Quick Start

To recreate this design in a new project:

1. **Install fonts:** Add `Times` from Google Fonts or your font provider
2. **Import CSS variables:** Copy `variables.css` into your project
3. **Tailwind users:** Use the generated `tailwind.config.js` to extend your theme
4. **Design tokens:** Import `design-tokens.json` for tooling integration
