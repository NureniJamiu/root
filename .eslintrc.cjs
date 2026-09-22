/*
 * ESLint configuration for root-mvp.
 *
 * Enforces the architectural separation described in Requirement 10 of the
 * root-mvp spec:
 *   10.1  data/   must not import from canvas/, nodes/, react, or reactflow.
 *   10.2  canvas/ must not import from nodes/* internals; only the public
 *         `NodeCard` (and other public exports) reached through the
 *         `src/nodes` barrel are allowed.
 *   10.3  nodes/  must not import from canvas/.
 *
 * The rules are implemented with the built-in `no-restricted-imports` rule
 * scoped to each layer through `overrides`, so no extra plugin is required.
 */

/* eslint-env node */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: '18.3' },
  },
  plugins: ['@typescript-eslint', 'react'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
  ],
  ignorePatterns: [
    'dist',
    'node_modules',
    'coverage',
    '*.config.js',
    '*.config.ts',
    '*.config.cjs',
    '*.cjs',
    'vite.config.*',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  overrides: [
    // ----- Data Model Layer (Requirement 10.1) -----------------------------
    // data/ is pure logic: no UI framework, no canvas, no node-UI imports.
    {
      files: ['src/data/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/canvas', '**/canvas/**'],
                message:
                  'data/ must not import from canvas/ (Requirement 10.1).',
              },
              {
                group: ['**/nodes', '**/nodes/**'],
                message:
                  'data/ must not import from nodes/ (Requirement 10.1).',
              },
              {
                group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
                message:
                  'data/ must be UI-free: no react imports (Requirement 10.1).',
              },
              {
                group: ['reactflow', 'reactflow/*'],
                message:
                  'data/ must not depend on reactflow (Requirement 10.1).',
              },
            ],
          },
        ],
      },
    },

    // ----- Canvas Layer (Requirement 10.2) ---------------------------------
    // canvas/ may consume the nodes/ public surface only via the barrel
    // `src/nodes` (or `src/nodes/index`). Deep imports into node internals
    // are forbidden.
    {
      files: ['src/canvas/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                // Matches any deep import under nodes/, e.g. `../nodes/NodeEditor`
                // or `@/nodes/typeStyles`. The bare barrel `../nodes` and
                // `@/nodes` are NOT matched by this pattern.
                group: [
                  '**/nodes/*',
                  '**/nodes/**/*',
                  '!**/nodes/index',
                ],
                message:
                  'canvas/ may import from nodes/ only through the public barrel (src/nodes). Deep imports into node internals are forbidden (Requirement 10.2).',
              },
            ],
          },
        ],
      },
    },

    // ----- Node UI Layer (Requirement 10.3) --------------------------------
    // nodes/ must not reach into canvas/ rendering internals.
    {
      files: ['src/nodes/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/canvas', '**/canvas/**'],
                message:
                  'nodes/ must not import from canvas/ (Requirement 10.3).',
              },
            ],
          },
        ],
      },
    },
  ],
};
