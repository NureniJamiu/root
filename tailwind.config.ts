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
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Reset the built-in Tailwind palettes so only DESIGN.md tokens are
    // usable via utility classes. Any color reference outside this map is
    // a compile-time error surface (missing utility class).
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      // Text palette (DESIGN.md)
      text: {
        primary: '#000000',   // obsidian
        secondary: '#404040', // primary reading ink
        tertiary: '#595959',  // annotation / muted
        inverse: '#ffffff',
        reading: '#404040',
        muted: '#595959',
      },
      // Surface palette (DESIGN.md)
      surface: {
        DEFAULT: '#fbf9f8',
        canvas: '#f9f9fb',
        base: '#000000',
        muted: '#f5f3f3',
        raised: '#ffffff',
        lowest: '#ffffff',
        low: '#f5f3f3',
        container: '#f0eded',
        high: '#eae8e7',
        highest: '#e4e2e1',
        strong: '#0051c3',
      },
      // Hairlines & borders (DESIGN.md)
      border: {
        DEFAULT: '#ebebeb',
        rule: '#ebebeb',
        outline: '#737785',
        variant: '#c3c6d6',
      },
      // Semantic research nodes (DESIGN.md)
      semantic: {
        topic: '#0051c3',
        finding: '#2d7a4c',
        question: '#de5052',
        conclusion: '#521010',
      },
      primary: {
        DEFAULT: '#003b93',
        container: '#0051c3',
      },
      // Convenience aliases
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
    // DESIGN.md spacing scale
    spacing: {
      '0': '0px',
      '1': '4px',
      '2': '6px',
      '3': '8px',
      '4': '10px',
      '5': '11px',
      '6': '12px',
      '7': '16px',
      '8': '17px',
      'gutter': '1rem',
      'margin': '1.5rem',
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
