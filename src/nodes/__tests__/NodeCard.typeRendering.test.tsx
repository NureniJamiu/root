/**
 * Component test: NodeCard type rendering (task 10.3)
 *
 * For each `NodeType`, seeds the Zustand store with a canvas containing
 * one root node of that type, renders `NodeCard`, and asserts:
 *
 *   1. `data-node-type="{type}"` is present on the card element (Req 11.4).
 *   2. The card's inline `border` style contains the color specified by
 *      `typeStyles[type].border` (Req 4.7, 11.4).
 *
 * React Flow's `Handle` component reads browser APIs that jsdom does not
 * provide (ResizeObserver, etc.), so the entire `reactflow` module is
 * mocked. Only the pieces `NodeCard` actually uses are stubbed out.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
// ---------------------------------------------------------------------------
// Mock reactflow so Handle (which touches the RF internal context that
// doesn't exist outside a ReactFlowProvider) renders as a no-op div.
// ---------------------------------------------------------------------------
vi.mock('reactflow', () => {
  const Position: Record<string, string> = {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  };

  function Handle() {
    return null;
  }

  return { Handle, Position };
});

import { emptyCanvas, addRoot, updateNode } from '../../data/mutators';
import { useCanvasStore } from '../../data/store';
import type { CanvasState } from '../../data/store';
import type { NodeType } from '../../data/types';
import { NodeCard } from '../NodeCard';
import type { NodeCardData } from '../NodeCard';
import { typeStyles } from '../typeStyles';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** All four NodeTypes under test. */
const NODE_TYPES: ReadonlyArray<NodeType> = [
  'topic',
  'finding',
  'question',
  'conclusion',
];

/**
 * Build a fresh `CanvasState` with a single root node of `type`.
 * Returns the seeded state along with the generated node id so the
 * test can pass it to `NodeCard` as `data.nodeId`.
 */
function seedState(type: NodeType): { state: CanvasState; nodeId: string } {
  const canvas = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
  // The root is always created as 'topic'; patch to the desired type.
  const root = canvas.nodes[0];
  if (!root) throw new Error('addRoot produced no node');

  const patchedCanvas =
    type === 'topic'
      ? canvas
      : updateNode(canvas, root.id, { type });

  const node = patchedCanvas.nodes[0];
  if (!node) throw new Error('node vanished after updateNode');

  const state: CanvasState = {
    canvas: patchedCanvas,
    selection: { nodeId: null },
    editor: { openNodeId: null },
    deletePrompt: { nodeId: null },
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  return { state, nodeId: node.id };
}

/**
 * Minimal props that satisfy `NodeProps<NodeCardData>` at runtime.
 * TypeScript would demand the full ReactFlow union, so we cast through
 * `unknown` — the component only accesses `data` and `selected`, but
 * the memo wrapper is typed against the full `NodeProps` shape.
 */
function makeProps(nodeId: string, selected = false) {
  const data: NodeCardData = { nodeId };
  return { id: nodeId, data, selected } as unknown as import('reactflow').NodeProps<NodeCardData>;
}

/* -------------------------------------------------------------------------- */
/* Color helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Convert a 6-digit hex color string (e.g. `"#0051c3"`) to the
 * `"rgb(r, g, b)"` format that jsdom uses when reading back `style.borderColor`.
 * jsdom always normalises inline hex color values to rgb, so we must compare
 * against the rgb form rather than the hex literal.
 */
function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe('NodeCard — type rendering', () => {
  beforeEach(() => {
    // Reset the store singleton to a clean empty state before each test.
    useCanvasStore.setState({
      canvas: emptyCanvas(),
      selection: { nodeId: null },
      editor: { openNodeId: null },
      deletePrompt: { nodeId: null },
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  });

  for (const type of NODE_TYPES) {
    it(`renders data-node-type="${type}" for a ${type} node (Req 11.4)`, () => {
      const { state, nodeId } = seedState(type);
      useCanvasStore.setState(state);

      render(<NodeCard {...makeProps(nodeId)} />);

      const card = screen.getByTestId(`node-card-${nodeId}`);
      expect(card).toHaveAttribute('data-node-type', type);
    });

    it(`border style contains typeStyles['${type}'].border for a ${type} node (Req 4.7, 11.4)`, () => {
      const { state, nodeId } = seedState(type);
      useCanvasStore.setState(state);

      render(<NodeCard {...makeProps(nodeId)} />);

      const card = screen.getByTestId(`node-card-${nodeId}`);

      // NodeCard sets the border as a full shorthand: "1px solid #xxxxxx".
      // jsdom normalises hex color values in inline styles to the rgb(r, g, b)
      // form, so `card.style.borderColor` will be "rgb(…)" rather than the
      // original hex. Convert the expected hex to rgb before comparing.
      const expectedHex = typeStyles[type].border;
      const expectedRgb = hexToRgb(expectedHex);

      expect(card.style.borderColor).toBe(expectedRgb);
    });
  }
});
