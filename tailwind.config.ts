import type { Config } from 'tailwindcss';

/**
 * Tailwind CSS configuration for Root MVP.
 *
 * All tokens are drawn directly from DESIGN.md so the palette, typography,
 * radii, and transition durations exposed to utility classes stay in sync
 * with the design system (see Requirement 11).
 *
 * Token source: DESIGN.md §Style Foundations
 *   font.family.primary = ABC Diatype Plus Variable
 *   color.text.*        = text palette
 *   color.surface.*     = surface palette
 *   space.*             = spacing scale
 *   radius.*            = border-radius scale
 *   motion.duration.*   = transition duration scale
 *   font.size.*         = typography scale
 */
/** A colour backed by a theme token, with Tailwind opacity support. */
function tok(name: string): string {
  return `rgb(var(--${name}) / <alpha-value>)`;
}

const config: Config = {
  // Dark mode follows the `.dark` class that theme/theme.ts puts on <html>.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Reset the built-in Tailwind palettes so only theme tokens are usable
    // via utility classes.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      // Theme tokens (theme/tokens.css). Each resolves to a CSS variable that
      // `.dark` redefines, so one class covers both themes.
      paper: tok('paper'),
      canvas: tok('canvas'),
      panel: { DEFAULT: tok('panel'), 2: tok('panel-2') },
      subtle: tok('subtle'),
      sunken: { DEFAULT: tok('sunken'), 2: tok('sunken-2'), 3: tok('sunken-3') },
      ink: {
        DEFAULT: tok('ink'),
        strong: tok('ink-strong'),
        read: tok('ink-read'),
        2: tok('ink-2'),
        3: tok('ink-3'),
      },
      muted: tok('muted'),
      faint: tok('faint'),
      rule: { DEFAULT: tok('rule'), 2: tok('rule-2'), strong: tok('rule-strong') },
      topic: { DEFAULT: tok('topic'), strong: tok('topic-strong'), soft: tok('topic-soft'), fill: tok('accent') },
      finding: { DEFAULT: tok('finding'), fill: tok('finding-fill') },
      question: { DEFAULT: tok('question'), fill: tok('question-fill') },
      conclusion: { DEFAULT: tok('conclusion'), fill: tok('conclusion-fill') },
      accent: { DEFAULT: tok('accent'), strong: tok('accent-strong'), deep: tok('accent-deep') },
      'on-accent': tok('on-accent'),
      danger: {
        DEFAULT: tok('danger'),
        fill: tok('danger-fill'),
        strong: tok('danger-strong'),
        soft: tok('danger-soft'),
      },
      inverse: tok('inverse'),
      'on-inverse': tok('on-inverse'),
      'inverse-accent': tok('inverse-accent'),
      stage: tok('stage'),
      // DESIGN.md names, kept for existing references
      text: {
        primary: tok('ink-strong'),
        secondary: tok('ink-read'),
        tertiary: tok('ink-3'),
        inverse: tok('on-inverse'),
        reading: tok('ink-read'),
        muted: tok('ink-3'),
      },
      surface: {
        DEFAULT: tok('paper'),
        canvas: tok('canvas'),
        base: tok('inverse'),
        muted: tok('sunken'),
        raised: tok('panel'),
        lowest: tok('panel'),
        low: tok('sunken'),
        container: tok('sunken-2'),
        high: tok('sunken-3'),
        highest: tok('sunken-3'),
        strong: tok('accent'),
      },
      border: {
        DEFAULT: tok('rule'),
        rule: tok('rule'),
        outline: tok('muted'),
        variant: tok('rule-strong'),
      },
      semantic: {
        topic: tok('topic'),
        finding: tok('finding'),
        question: tok('question'),
        conclusion: tok('conclusion'),
      },
      primary: {
        DEFAULT: tok('accent-strong'),
        container: tok('accent'),
      },
      // Fixed colours that do not change with the theme
      black: '#000000',
      white: '#ffffff',
    },
    fontFamily: {
      serif: ['EB Garamond', 'Georgia', 'serif'],
      sans: ['EB Garamond', 'Georgia', 'serif'],
      mono: ['JetBrains Mono', 'monospace'],
    },
    // Micro-radii (2px - 4px) per DESIGN.md
    borderRadius: {
      none: '0px',
      xs: '2px',
      sm: '2px',
      DEFAULT: '2px',
      md: '3px',
      lg: '4px',
      xl: '6px',
      full: '9999px',
    },
    transitionDuration: {
      DEFAULT: '150ms',
      instant: '100ms',
      fast: '120ms',
      normal: '150ms',
      slow: '200ms',
      slower: '400ms',
    },
    extend: {
      spacing: {
        'gutter': '1rem',
        'margin': '1.5rem',
      },
      fontSize: {
        // DESIGN.md typography scale
        'headline-xl': ['60px', { lineHeight: '68px', letterSpacing: '-0.02em', fontWeight: '300' }],
        'headline-lg': ['30px', { lineHeight: '36px', letterSpacing: '-0.01em', fontWeight: '300' }],
        'headline-md': ['22px', { lineHeight: '28px', fontWeight: '400' }],
        'headline-sm': ['18px', { lineHeight: '24px', fontWeight: '500' }],
        'body-lg':     ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-md':     ['13px', { lineHeight: '20px', fontWeight: '400' }],
        'body-sm':     ['11px', { lineHeight: '16px', fontWeight: '400' }],
        'label-md':    ['11px', { lineHeight: '14px', letterSpacing: '0.04em', fontWeight: '500' }],
        'label-sm':    ['9px',  { lineHeight: '12px', letterSpacing: '0.06em', fontWeight: '500' }],
        // Backward-compatible aliases
        xs:   ['9.33px', { lineHeight: 'normal', fontWeight: '400' }],
        sm:   ['13px',   { lineHeight: 'normal', fontWeight: '400' }],
        md:   ['14px',   { lineHeight: 'normal', fontWeight: '400' }],
        lg:   ['15px',   { lineHeight: 'normal', fontWeight: '400' }],
        xl:   ['16px',   { lineHeight: 'normal', fontWeight: '400' }],
        '2xl': ['17px',  { lineHeight: 'normal', fontWeight: '400' }],
        '3xl': ['18px',  { lineHeight: 'normal', fontWeight: '400' }],
        '4xl': ['26px',  { lineHeight: 'normal', fontWeight: '400' }],
        body: ['13px',   { lineHeight: '20px', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
};

export default config;
