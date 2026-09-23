/**
 * Component test for React Flow config (task 9.5).
 *
 * Validates: Requirements 1.4, 12.2
 *
 * Asserts that `<CanvasView>` mounts with the exact React Flow config props
 * required by R1.4 (zoom limits, `onlyRenderVisibleElements`) and R12.2
 * (interaction modes) by capturing them through the `onRFPropsMounted`
 * test-only probe prop.
 *
 * The probe fires from a `useEffect` inside `CanvasViewInner` — once per
 * mount, after commit — and reports the values actually handed to
 * `<ReactFlow>`. This means the test validates the real prop values, not
 * the `data-*` attribute mirror, so it catches a misconfiguration even if
 * the wrapper div is updated but the inner `<ReactFlow>` is not.
 *
 * React Flow under jsdom renders without real dimensions. RF uses
 * `ResizeObserver` internally, which jsdom does not provide. A minimal
 * no-op stub is installed on `globalThis` below so the RF component can
 * mount without throwing. The stub is removed after the suite.
 *
 * CSS: `reactflow/dist/style.css` is mocked as an empty module by the
 * `vi.mock` call below. Vite's CSS handling already treats CSS imports as
 * empty objects in Vitest's jsdom environment, but the explicit mock makes
 * the intent clear and prevents any future environment change from breaking
 * the test with a "cannot process CSS" error.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';

// Prevent "Cannot process CSS" from reactflow's stylesheet import.
vi.mock('reactflow/dist/style.css', () => ({}));

import { CanvasView, type CanvasViewProbeProps } from '../CanvasView';
import { useCanvasStore } from '../../data';
import { emptyCanvas } from '../../data';
import type { CanvasState } from '../../data';

/* -------------------------------------------------------------------------- */
/* ResizeObserver stub                                                        */
/* -------------------------------------------------------------------------- */

/**
 * jsdom does not implement `ResizeObserver`. React Flow's `<ZoomPane>`
 * instantiates one on mount; without a global constructor the effect throws
 * and React unmounts the tree before our own `useEffect` fires, meaning the
 * probe never runs and the test assertion fails.
 *
 * A minimal no-op class is sufficient: we do not need resize notifications —
 * we only need RF to mount cleanly so commit-phase effects run.
 */
class ResizeObserverStub {
  observe(): void { /* no-op */ }
  unobserve(): void { /* no-op */ }
  disconnect(): void { /* no-op */ }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A clean store state that mirrors `initialState()` inside `store.ts`.
 * Provided here so each test gets a fresh empty canvas without depending
 * on internal store exports.
 */
function cleanState(): CanvasState {
  return {
    canvas: emptyCanvas(),
    selection: { nodeId: null },
    editor: { openNodeId: null },
    deletePrompt: { nodeId: null },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/* -------------------------------------------------------------------------- */
/* Suite                                                                      */
/* -------------------------------------------------------------------------- */

describe('CanvasView — React Flow config (task 9.5)', () => {
  beforeAll(() => {
    // Install the stub before any test in this suite runs.
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverStub,
    });
  });

  afterAll(() => {
    // Remove the stub so it does not bleed into other test files.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).ResizeObserver;
  });

  beforeEach(() => {
    // Reset the singleton store so each test starts with an empty canvas.
    useCanvasStore.setState(cleanState());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires onRFPropsMounted with the required React Flow config props', async () => {
    let captured: CanvasViewProbeProps | undefined;

    const spy = vi.fn((props: CanvasViewProbeProps) => {
      captured = props;
    });

    await act(async () => {
      render(<CanvasView onRFPropsMounted={spy} />);
    });

    // The probe must have fired exactly once per mount.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(captured).toBeDefined();

    // Requirement 1.4 — zoom limits
    expect(captured!.minZoom).toBe(0.25);
    expect(captured!.maxZoom).toBe(2.5);

    // Requirement 1.4 / 12.2 — render performance flag
    expect(captured!.onlyRenderVisibleElements).toBe(true);

    // Requirement 12.2 — interaction mode config
    expect(captured!.nodesDraggable).toBe(true);
    expect(captured!.nodesConnectable).toBe(false);
    expect(captured!.elementsSelectable).toBe(true);
  });

  it('does not call onRFPropsMounted when the prop is omitted', async () => {
    // Regression guard: rendering without the probe must not throw.
    let renderError: unknown = null;
    try {
      await act(async () => {
        render(<CanvasView />);
      });
    } catch (err) {
      renderError = err;
    }
    expect(renderError).toBeNull();
  });
});
