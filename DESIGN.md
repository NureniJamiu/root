---
name: Editorial Research Workbench
colors:
  surface: '#fbf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#f0eded'
  surface-container-high: '#eae8e7'
  surface-container-highest: '#e4e2e1'
  on-surface: '#1b1c1c'
  on-surface-variant: '#434653'
  inverse-surface: '#303030'
  inverse-on-surface: '#f3f0f0'
  outline: '#737785'
  outline-variant: '#c3c6d6'
  surface-tint: '#1357c9'
  primary: '#003b93'
  on-primary: '#ffffff'
  primary-container: '#0051c3'
  on-primary-container: '#beceff'
  inverse-primary: '#b1c5ff'
  secondary: '#af2d33'
  on-secondary: '#ffffff'
  secondary-container: '#fd6767'
  on-secondary-container: '#69000f'
  tertiary: '#722825'
  on-tertiary: '#ffffff'
  tertiary-container: '#903f3b'
  on-tertiary-container: '#ffc0ba'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b1c5ff'
  on-primary-fixed: '#001947'
  on-primary-fixed-variant: '#00419f'
  secondary-fixed: '#ffdad8'
  secondary-fixed-dim: '#ffb3b0'
  on-secondary-fixed: '#410006'
  on-secondary-fixed-variant: '#8d131f'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#3f0305'
  on-tertiary-fixed-variant: '#7a2e2b'
  background: '#fbf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e1'
typography:
  headline-xl:
    fontFamily: EB Garamond
    fontSize: 60px
    fontWeight: '300'
    lineHeight: 68px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: EB Garamond
    fontSize: 30px
    fontWeight: '300'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: EB Garamond
    fontSize: 22px
    fontWeight: '400'
    lineHeight: 28px
  headline-sm:
    fontFamily: EB Garamond
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-lg:
    fontFamily: EB Garamond
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: EB Garamond
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: EB Garamond
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 9px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers an intentional, rigorous desktop-first workspace tailored for research synthesis, academic inquiry, and critical analysis. The aesthetic synthesizes the typographic discipline of classical broadsheets and scholarly monographs with the mechanical clarity of mid-century technical drafting systems.

### Core Philosophy
- **Scholarship over Spectacle:** Chromatic noise and decorative novelties are eliminated. Visual hierarchy is achieved strictly via typographic scale, crisp hairline divisions, and disciplined spatial positioning.
- **Architectonic Rigor:** Interfaces operate on an uncompromising structural grid. Information sits within defined rectangular cells reminiscent of catalog indices and ledger sheets.
- **Instrumental Precision:** Rather than simulating physical materials through skeuomorphic rendering or fuzzy drop shadows, surfaces are strictly flat, using 1px boundary rules, micro-radii, and an engineered millimeter coordinate plane.

### Visual Style
The system embodies an **Editorial Brutalism** informed by academic publishing: high-contrast black ink, archival paper white, surgical hairline rules, classical transitional serif typography, and acute, purpose-driven chromatic accents to flag semantic research nodes.

## Colors

The palette establishes an authoritative, high-legibility scholarly environment rooted in ink-on-vellum tonality with semantic taxonomy markers.

### Palette Architecture
- **Primary Canvas (`#f9f9fb`):** An engineered neutral backdrop providing soft contrast beneath dense black text without eye strain.
- **Pure Surface (`#ffffff`):** Reserved for card containers, inspect panels, and reading panes to ensure maximum contrast.
- **Structural Dividing Rules (`#ebebeb`):** Used for grid lines, panel dividers, and canvas dot matrices.
- **Typographic Neutrals:**
  - `#000000` (Obsidian): Document headlines, active indicators, and high-priority titles.
  - `#404040` (Primary Reading Ink): Optimized for long-form synthesis body copy and data table cells.
  - `#595959` (Annotation/Muted): Secondary metadata, timestamps, keyboard shortcuts, and millimeter coordinates.

### Semantic Research Nodes
- **Topic Node (`#0051c3`):** Cobalt blue indicative of core subject anchors, primary structural threads, and active focus states.
- **Finding Node (`#2d7a4c`):** Deep botanical green reserved for verified facts, data points, citations, and validated outcomes.
- **Question Node (`#de5052`):** Crimson coral highlighting active inquiries, unresolved hypotheses, and critical anomalies.
- **Conclusion Node (`#521010`):** Deep oxblood signaling consolidated theses, synthesized outcomes, and definitive closures.

## Typography

The typographical engine mirrors the precision of academic presses. The foundation uses classical transitional and old-style serifs (`EB Garamond` or system serif fallbacks: `Times New Roman`, `Times`, `Georgia`), paired with an austere technical monospaced face (`JetBrains Mono`) for navigational chrome, node indices, metadata, and data points.

### Typographic Rules
- **Headline Lightness:** Major titles (`headline-xl` at 60px and `headline-lg` at 30px) must always maintain a light weight (`300`), allowing classical serifs to project literary authority without overwhelming interface chrome.
- **Reading Proportion:** Core analytical body text is set to `13px` with a generous `20px` leading (`1.538`), producing optimal reading rhythm for dense multi-column synthesis.
- **Monospace Taxonomy:** All technical chrome—such as node IDs, status badges, timestamps, tags, and coordinates—uses uppercase, tracked monospaced labels to visually separate analytical metadata from authored prose.

## Layout & Spacing

The layout is built for desktop-first immersion, featuring multi-pane research views, horizontal reading ribbons, and split canvas-inspector patterns.

### Spatial Engine & Grid
- **Desktop Primary Grid:** 12-column or 16-column continuous fluid layout bounded by a structured framing edge. Fixed side rails (index navigator at 280px, document inspector at 360px) frame an expansive central research canvas.
- **Millimeter Canvas:** The visual canvas underlay employs a precise 16px × 16px geometric coordinate grid rendered with 1px `#ebebeb` intersection points or rules, grounding spatial graph nodes in an analytical drafting environment.
- **Strict Hairline Rules:** Structural spatial division relies on continuous `1px solid #ebebeb` rules instead of open white gaps, maintaining high-density editorial structure without clutter.
- **Responsive Adaptations:** Below 1024px, the multi-column workbench folds secondary inspectors into slide-over sheets, maintaining the 13px base reading scale.

## Elevation & Depth

This system operates under a **Zero-Shadow Mandate**. Ambient blur, drop shadows, and diffusion filters are prohibited across all standard and floating chrome.

### Mechanical Elevation Hierarchy
- **Level 0 (Underlay Canvas):** Ground `#f9f9fb` etched with 1px `#ebebeb` dot matrix or millimeter rule pattern.
- **Level 1 (Structural Panes & Cards):** Flat `#ffffff` surfaces bounded by crisp `1px solid #ebebeb` borders.
- **Level 2 (Active / Focused Nodes):** Flat `#ffffff` surface with a high-contrast `1px solid #000000` perimeter boundary or corresponding semantic edge (`#0051c3`, `#de5052`, `#521010`, `#2d7a4c`).
- **Level 3 (Modals & Command Overlays):** `#ffffff` solid container encased in `2px solid #000000` with an opaque, unblurred structural backdrop mask of `rgba(0, 0, 0, 0.4)`.

## Shapes

Form geometry leans into technical architectural drawing instruments: sharp, deliberate, and structural.

### Geometry Standards
- **Corner Radii:** Set strictly between 2px and 4px (Soft level 1). Pill shapes, round capsules, and high-radius cards are banned.
- **Sharp Utility Elements:** Table cells, vertical tab splitters, canvas framing lines, and inspector dividers use hard right angles (`0px`).
- **Micro-Radiused Nodes:** Interactive nodes, inputs, and chips utilize a uniform `2px` to `3px` corner radius, preventing pixelated corner abrasion while sustaining a brutalist, print-like edge.

## Components

Components follow desktop-first information density, featuring sharp hairline framing, print-inspired states, and instantaneous micro-transitions (`150ms ease-out`).

### Buttons
- **Primary:** Solid `#000000` background, `#ffffff` label text, `2px` micro-radius, `0 12px` padding, 32px height. Hover state shifts instantly to `#0051c3`.
- **Secondary / Ghost:** `#ffffff` surface, `1px solid #ebebeb` boundary, `#404040` label text. Hover state switches to `1px solid #000000` and text to `#000000`.
- **Destructive:** `1px solid #de5052` outline, `#de5052` text, filling to solid `#de5052` with `#ffffff` text on active confirmation.

### Research Nodes (Canvas Elements)
- **Shared Architecture:** Crisp `#ffffff` container, `2px` corner radius, surrounded by a 1px border.
- **Topic Node:** Top boundary or full border accented with `#0051c3`. Node index badge rendered in `label-sm` with `#0051c3` text on `#0051c3` (8% opacity) tint.
- **Finding Node:** Tagged with `#2d7a4c` metadata label; citation indicator anchored in `#2d7a4c`.
- **Question Node:** Border rule highlighted in `#de5052`; query indicator flagged with monospaced question mark token in coral crimson.
- **Conclusion Node:** Bordered in rich `#521010` oxblood; headline text styled in italicized transitional serif.

### Text Input & Filter Fields
- Minimalist architectural box: `#ffffff` surface, `1px solid #ebebeb` default border, `2px` radius. Focus transition (`150ms`) upgrades border to `1px solid #000000` without glow rings. Placeholder copy rendered in `#595959`.

### Chips & Semantic Tags
- Monospace micro-pills (`label-sm`), strictly rectangular with `2px` radius, `2px 6px` padding. Bordered in `1px solid #ebebeb`. Active node filters adopt respective semantic colors (`#0051c3`, `#2d7a4c`, `#de5052`, `#521010`) for borders and typography.

### Checkboxes & Radios
- Hard geometric boxes (`0px` or `2px` radius) sized precisely at `14px × 14px`. Unchecked: `1px solid #404040`. Checked: `#000000` fill with sharp, unrounded white hairline glyphs.

### Inspector Panels & Document Drawers
- Docked flush against the window edges. Structured via header ribbons containing breadcrumb coordinates in `label-md` and segmented by continuous `1px solid #ebebeb` horizontal and vertical lines.