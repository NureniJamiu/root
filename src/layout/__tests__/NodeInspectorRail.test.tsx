import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { addChild, addImage, addNode, emptyCanvas, updateNode } from '../../data/mutators';
import { canvasActions, useCanvasStore } from '../../data/store';
import type { Canvas, NodeType } from '../../data';
import { formatDataUrlSize, formatRelativeTime } from '../formatTime';
import { NodeInspectorRail } from '../NodeInspectorRail';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

interface Built {
  canvas: Canvas;
  ids: string[];
}

/** root → a → (b, c); every non-root node has the given type. */
function build(types: NodeType[] = ['finding', 'question', 'conclusion']): Built {
  let c = addNode({ ...emptyCanvas(), title: 'T' }, { position: { x: 0, y: 0 } });
  const root = c.nodes[0]!.id;
  c = addChild(c, root, { position: { x: 1, y: 1 } });
  const a = c.nodes[1]!.id;
  c = addChild(c, a, { position: { x: 2, y: 2 } });
  const b = c.nodes[2]!.id;
  c = addChild(c, a, { position: { x: 3, y: 3 } });
  const cc = c.nodes[3]!.id;
  [a, b, cc].forEach((id, i) => {
    c = updateNode(c, id, { type: types[i]!, title: `Idea ${i + 1}` });
  });
  return { canvas: c, ids: [root, a, b, cc] };
}

function show(canvas: Canvas, selected: string | null): void {
  canvasActions.loadCanvas(canvas);
  canvasActions.select(selected);
}

describe('NodeInspectorRail shows real data', () => {
  beforeEach(() => canvasActions.loadCanvas(emptyCanvas()));

  it('shows the selected idea read-only: type, a large title and its notes', () => {
    const { canvas, ids } = build();
    show(updateNode(canvas, ids[1]!, { body: 'Line one\nLine two' }), ids[1]!);
    render(<NodeInspectorRail />);

    expect(screen.getByTestId('inspector-type')).toHaveTextContent('Finding');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Idea 1');
    expect(screen.getByTestId('inspector-notes')).toHaveTextContent('Line one Line two');
    // Nothing to type into.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('leaves out branch summaries, footer metadata and the old action buttons', () => {
    const { canvas, ids } = build();
    show({ ...canvas, nodes: canvas.nodes.map((n) => (n.id === ids[1] ? { ...n, collapsed: true } : n)) }, ids[1]!);
    const { container } = render(<NodeInspectorRail onOpenEditor={() => {}} onAddChild={() => {}} />);

    expect(container.textContent).not.toMatch(
      /Collapsed Branch|Sub-ideas|Expand All|Open in editor|Add Connected Idea|Delete|LINKS:|IDEA:|CONNECT TO|CREATED:|UPDATED:/i,
    );
    expect(screen.queryByTestId('branch-stats')).toBeNull();
  });

  it('the Edit button opens the editor on the selected idea', () => {
    const { canvas, ids } = build();
    show(canvas, ids[2]!);
    const opened: string[] = [];
    render(<NodeInspectorRail onOpenEditor={(id) => opened.push(id)} />);
    fireEvent.click(screen.getByTestId('btn-inspector-edit'));
    expect(opened).toEqual([ids[2]]);
  });

  it('says when an idea has no notes yet', () => {
    const { canvas, ids } = build();
    show(canvas, ids[1]!);
    render(<NodeInspectorRail />);
    expect(screen.getByTestId('inspector-notes')).toHaveTextContent('No notes yet.');
  });

  it('shows attached images as a mosaic, without remove buttons', () => {
    const { canvas, ids } = build();
    let c = addImage(canvas, ids[1]!, { id: crypto.randomUUID(), dataUrl: PIXEL, addedAt: new Date().toISOString() });
    c = addImage(c, ids[1]!, { id: crypto.randomUUID(), dataUrl: PIXEL, addedAt: new Date().toISOString() });
    show(c, ids[1]!);
    render(<NodeInspectorRail />);
    expect(screen.getByTestId('inspector-image-mosaic')).toHaveAttribute('data-count', '2');
    expect(screen.getAllByRole('button', { name: /Open image/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Remove image/ })).toBeNull();
  });

  it('does not list connections', () => {
    const { canvas, ids } = build();
    show(canvas, ids[1]!);
    render(<NodeInspectorRail />);
    expect(screen.queryByTestId('node-inspector-connections')).toBeNull();
    expect(screen.queryByText(/Connections/i)).toBeNull();
  });

  it('does not show invented references or links', () => {
    const { canvas, ids } = build();
    show({ ...canvas, nodes: canvas.nodes.map((n) => (n.id === ids[1] ? { ...n, collapsed: true } : n)) }, ids[1]!);
    const { container } = render(<NodeInspectorRail />);
    expect(container.textContent).not.toMatch(/youtube|notion\.so|medium\.com|drive\.google|References|Saved References/i);
  });

  it('reports the real image size in the gallery, not a canned one', () => {
    const { canvas, ids } = build();
    show(addImage(canvas, ids[1]!, { id: crypto.randomUUID(), dataUrl: PIXEL, addedAt: new Date().toISOString() }), ids[1]!);
    render(<NodeInspectorRail />);
    fireEvent.click(screen.getByTestId('inspector-image-0'));
    const gallery = screen.getByTestId('image-lightbox');
    expect(gallery.textContent).toContain(formatDataUrlSize(PIXEL));
    expect(gallery.textContent).not.toMatch(/1920x1080|1\.2 MB/);
  });

  it('shows the connector panel when a connector is selected, with editable sides and a remove button', () => {
    const { canvas, ids } = build();
    show(canvas, null);
    const edge = canvas.edges.find((e) => e.source === ids[1] && e.target === ids[2])!;
    canvasActions.selectEdge(edge.id);
    render(<NodeInspectorRail />);

    expect(screen.getByTestId('connector-panel')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('connector-sourceSide'), { target: { value: 'top' } });
    expect(useCanvasStore.getState().canvas.edges.find((e) => e.id === edge.id)).toMatchObject({ sourceSide: 'top' });

    fireEvent.click(screen.getByTestId('btn-remove-connector'));
    expect(useCanvasStore.getState().canvas.edges.some((e) => e.id === edge.id)).toBe(false);
  });

  it('while dragging there is no disabled "Repositioning" button or spinner', () => {
    const { canvas, ids } = build();
    show(canvas, ids[1]!);
    const { container } = render(
      <NodeInspectorRail
        dragInfo={{ nodeId: ids[1]!, startX: 0, startY: 0, currentX: 20, currentY: 20, dx: 20, dy: 20 }}
      />,
    );
    expect(screen.queryByText(/Repositioning/)).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-09T12:00:00Z');
  it.each([
    ['2026-10-09T11:59:40Z', 'just now'],
    ['2026-10-09T11:30:00Z', '30m ago'],
    ['2026-10-09T07:00:00Z', '5h ago'],
    ['2026-10-06T12:00:00Z', '3d ago'],
  ])('%s → %s', (iso, label) => expect(formatRelativeTime(iso, now)).toBe(label));
  it('returns null for garbage', () => expect(formatRelativeTime('nope', now)).toBeNull());
});
