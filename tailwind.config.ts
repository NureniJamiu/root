import type { Config } from 'tailwindcss';

/**
 * Tailwind CSS configuration for Root MVP.
 *
 * All tokens are drawn directly from DESIGN.md so the palette, typography,
 * radii, and transition durations exposed to utility classes stay in sync
 * with the design system (see Requirement 11).
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
      primary: '#0051c3',
      secondary: '#de5052',
      accent: '#521010',
      neutral: {
        900: '#000000',
        700: '#404040',
        500: '#595959',
        200: '#ebebeb',
        0: '#ffffff',
      },
      // Convenience aliases used throughout the app.
      black: '#000000',
      white: '#ffffff',
    },
    fontFamily: {
      sans: ['Times', 'serif'],
      serif: ['Times', 'serif'],
    },
    // Reset default radii so only the two DESIGN.md tokens are exposed.
    borderRadius: {
      none: '0px',
      xs: '2px',
      sm: '5px',
    },
    transitionDuration: {
      DEFAULT: '150ms',
      0: '0ms',
      150: '150ms',
    },
    extend: {
      fontSize: {
        // DESIGN.md type scale
        h1: ['60px', { lineHeight: '72px', fontWeight: '300' }],
        h2: ['30px', { lineHeight: '39px', fontWeight: '300' }],
        body: ['13px', { lineHeight: '19.5px', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
};

export default config;
