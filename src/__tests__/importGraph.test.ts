/**
 * Import-graph layer-boundary test (Task 14.1).
 *
 * Validates Requirements 10.1, 10.2, 10.3 at test time using static analysis:
 * reads `.ts`/`.tsx` source files and asserts no boundary-violating imports.
 *
 * Rules enforced:
 *   1. `data/` files must NOT import from `canvas/`, `nodes/`, `react`, or
 *      `reactflow`.
 *   2. `canvas/` files must NOT deep-import `nodes/` internals; only the
 *      public barrel (`../nodes`, `../nodes/index`, `@/nodes`, etc.) is
 *      allowed.
 *   3. `nodes/` files must NOT import from `canvas/`.
 *
 * Test files (`__tests__/` directories and `*.test.*` / `*.spec.*` files) are
 * excluded from all checks.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SRC_ROOT = resolve(__dirname, '..');

/** Recursively collect `.ts`/`.tsx` files, skipping test directories/files. */
function getSourceFiles(dir: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      if (entry === '__tests__') continue; // skip test directories
      results.push(...getSourceFiles(full));
    } else if (
      /\.(tsx?|jsx?)$/.test(entry) &&
      !/\.(test|spec)\.(tsx?|jsx?)$/.test(entry)
    ) {
      results.push(full);
    }
  }

  return results;
}

/**
 * Extract every `from '…'` / `from "…"` specifier in `content`.
 * Also matches bare `import '…'` (side-effect imports).
 */
function extractImportSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  // Matches: import ... from 'specifier'  or  import 'specifier'
  const re = /(?:^|\n)\s*import\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    specifiers.push(m[1]);
  }
  return specifiers;
}

// ---------------------------------------------------------------------------
// Rule 1 — data/ must not import canvas/, nodes/, react, react-dom, reactflow
// ---------------------------------------------------------------------------

describe('Layer boundary: data/', () => {
  const dataFiles = getSourceFiles(join(SRC_ROOT, 'data'));

  /**
   * Validates: Requirements 10.1
   * The Data_Model_Layer has no dependency on rendering or interaction code.
   */
  it.each(dataFiles.map((f) => [f.replace(SRC_ROOT + '/', ''), f]))(
    '%s — must not import canvas/, nodes/, react, or reactflow',
    (_rel, filePath) => {
      const content = readFileSync(filePath, 'utf-8');
      const imports = extractImportSpecifiers(content);

      const violations: string[] = [];

      for (const spec of imports) {
        if (/canvas/.test(spec)) {
          violations.push(`canvas: "${spec}"`);
        } else if (/nodes/.test(spec)) {
          violations.push(`nodes: "${spec}"`);
        } else if (/^react$/.test(spec) || /^react\//.test(spec)) {
          violations.push(`react: "${spec}"`);
        } else if (/^react-dom$/.test(spec) || /^react-dom\//.test(spec)) {
          violations.push(`react-dom: "${spec}"`);
        } else if (/^reactflow$/.test(spec) || /^reactflow\//.test(spec)) {
          violations.push(`reactflow: "${spec}"`);
        }
      }

      expect(violations).toEqual([]);
    }
  );
});

// ---------------------------------------------------------------------------
// Rule 2 — canvas/ must not deep-import nodes/ internals
// ---------------------------------------------------------------------------

describe('Layer boundary: canvas/', () => {
  const canvasFiles = getSourceFiles(join(SRC_ROOT, 'canvas'));

  /**
   * Validates: Requirements 10.2
   * The Canvas_Layer may only import the public nodes/ barrel, not internal
   * files.
   *
   * Allowed barrel forms: '../nodes', '../nodes/index', '@/nodes',
   *   '@/nodes/index', '../../nodes', etc.
   * Forbidden: '../nodes/NodeCard', '../nodes/HoverToolbar', etc.
   */
  it.each(canvasFiles.map((f) => [f.replace(SRC_ROOT + '/', ''), f]))(
    '%s — must not deep-import nodes/ internals',
    (_rel, filePath) => {
      const content = readFileSync(filePath, 'utf-8');
      const imports = extractImportSpecifiers(content);

      const violations: string[] = [];

      for (const spec of imports) {
        // Is this a nodes/ import at all?
        if (!/nodes/.test(spec)) continue;

        // Allow bare barrel: ends with '/nodes' or '/nodes/index'
        if (/\/nodes$/.test(spec) || /\/nodes\/index$/.test(spec)) continue;
        // Allow '@/nodes' shorthand or '@/nodes/index'
        if (/^@\/nodes$/.test(spec) || /^@\/nodes\/index$/.test(spec)) continue;

        // Any other path that contains 'nodes/' followed by more segments is a
        // deep internal import.
        if (/nodes\//.test(spec)) {
          violations.push(`deep nodes import: "${spec}"`);
        }
      }

      expect(violations).toEqual([]);
    }
  );
});

// ---------------------------------------------------------------------------
// Rule 3 — nodes/ must not import from canvas/
// ---------------------------------------------------------------------------

describe('Layer boundary: nodes/', () => {
  const nodesFiles = getSourceFiles(join(SRC_ROOT, 'nodes'));

  /**
   * Validates: Requirements 10.3
   * The Node_UI_Layer must not depend on the Canvas_Layer.
   */
  it.each(nodesFiles.map((f) => [f.replace(SRC_ROOT + '/', ''), f]))(
    '%s — must not import from canvas/',
    (_rel, filePath) => {
      const content = readFileSync(filePath, 'utf-8');
      const imports = extractImportSpecifiers(content);

      const violations = imports
        .filter((spec) => /canvas/.test(spec))
        .map((spec) => `canvas: "${spec}"`);

      expect(violations).toEqual([]);
    }
  );
});
