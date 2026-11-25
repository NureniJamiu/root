/**
 * `ConnectorEdge` draws what a connector means: its relation label, the quiet
 * label of an untyped connector, the warning look of a relation that does not
 * fit its cards, and the remove button that sits clear of the label.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { CSSProperties, ReactNode } from 'react';
import type { EdgeProps } from 'reactflow';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasActions } from '../../data/store';
import type { NodeType, RelationType } from '../../data/types';
import { ConnectorEdge } from '../ConnectorEdge';
import type { ConnectorEdgeData } from '../ConnectorEdge';
import { EDGE_DASH, EDGE_INVALID_DASH } from '../edgeStyles';
import { connectorLook } from '../useReactFlowGraph';

// The curve's middle is (50, 80); labels render outside the SVG, as React Flow's label layer does.
vi.mock('reactflow', async (importOriginal) => {
  const { createPortal } = await import('react-dom');
  return {
    ...(await importOriginal<typeof import('reactflow')>()),
    BaseEdge: ({ path, style }: { path: string; style?: CSSProperties }) => (
      <path data-testid="base-edge" d={path} data-dash={style?.strokeDasharray} />
    ),
    EdgeLabelRenderer: ({ children }: { children: ReactNode }) => createPortal(children, document.body),
    getBezierPath: () => ['M0,0 C50,0 50,160 100,160', 50, 80, 50, 80],
  };
});

const ID = 'e1';

function look(relation: RelationType, from: NodeType, to: NodeType): ConnectorEdgeData {
  return connectorLook({ relationType: relation }, { type: from }, { type: to });
}

function renderEdge(data: ConnectorEdgeData, selected = false) {
  const props = {
    id: ID,
    source: 'a',
    target: 'b',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 160,
    sourcePosition: 'right',
    targetPosition: 'left',
    selected,
    data,
  } as unknown as EdgeProps<ConnectorEdgeData>;
  return render(
    <svg>
      <ConnectorEdge {...props} />
    </svg>,
  );
}

const label = () => screen.queryByTestId(`connector-label-${ID}`);
const removeButton = () => screen.queryByTestId(`connector-remove-${ID}`);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ConnectorEdge', () => {
  it('always shows a typed connector’s relation, read from the card it leaves, with no warning', () => {
    renderEdge(look('supports', 'conclusion', 'finding'));
    expect(screen.getByTestId(`connector-${ID}`)).toHaveAttribute('data-relation', 'supports');
    expect(screen.getByTestId(`connector-${ID}`)).not.toHaveAttribute('data-invalid');
    expect(label()).toHaveTextContent('supported by');
    expect(screen.queryByLabelText('Does not fit these cards')).toBeNull();
    expect(screen.getByTestId('base-edge')).not.toHaveAttribute('data-dash');
    // Nothing else shows until the connector is hovered or selected.
    expect(removeButton()).toBeNull();
  });

  it('shows an untyped connector’s label only while it is hovered or selected', () => {
    vi.useFakeTimers();
    const { unmount } = renderEdge(look('related-to', 'topic', 'question'));
    const edge = screen.getByTestId(`connector-${ID}`);
    expect(label()).toBeNull();
    expect(screen.getByTestId('base-edge')).toHaveAttribute('data-dash', EDGE_DASH);

    fireEvent.mouseEnter(edge);
    expect(label()).toHaveTextContent('related to');
    expect(removeButton()).not.toBeNull();

    fireEvent.mouseLeave(edge);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(label()).toBeNull();
    expect(removeButton()).toBeNull();
    unmount();

    renderEdge(look('related-to', 'topic', 'question'), true);
    expect(label()).toHaveTextContent('related to');
  });

  it('marks a relation that does not fit its cards, dotted rather than dashed', () => {
    renderEdge(look('supports', 'question', 'topic'));
    expect(screen.getByTestId(`connector-${ID}`)).toHaveAttribute('data-invalid', 'true');
    expect(label()).toHaveTextContent('supports');
    expect(screen.getByLabelText('Does not fit these cards')).toBeInTheDocument();
    expect(screen.getByTestId('base-edge')).toHaveAttribute('data-dash', EDGE_INVALID_DASH);
    expect(EDGE_INVALID_DASH).not.toBe(EDGE_DASH);
  });

  it('lets clicks through the label and keeps the remove button above it', () => {
    const remove = vi.spyOn(canvasActions, 'removeEdge').mockImplementation(() => undefined);
    renderEdge(look('supports', 'finding', 'conclusion'), true);
    const pill = label()!;
    expect(pill.style.pointerEvents).toBe('none');
    expect(pill.style.transform).toContain('translate(50px, 80px)');
    const wrapper = removeButton()!.parentElement!;
    expect(wrapper.style.pointerEvents).toBe('all');
    expect(wrapper.style.transform).toContain('translate(50px, 50px)');

    fireEvent.click(removeButton()!);
    expect(remove).toHaveBeenCalledWith(ID);
  });
});
