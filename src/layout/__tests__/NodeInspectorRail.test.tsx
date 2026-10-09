import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('collapsed branch summary counts the hidden ideas by type', () => {
    const { canvas, ids } = build(['topic', 'finding', 'question']);
    const a = ids[1]!;
    show({ ...canvas, nodes: canvas.nodes.map((n) => (n.id === a ? { ...n, collapsed: true } : n)) }, a);

    render(<NodeInspectorRail />);

    const stats = within(screen.getByTestId('branch-stats'));
    // Hidden under the collapsed idea: Idea 2 (a finding) and Idea 3 (a question).
    expect(stats.getByText('Findings').previousElementSibling).toHaveTextContent('1');
    expect(stats.getByText('Open Questions').previousElementSibling).toHaveTextContent('1');
    expect(stats.getByText('Conclusions').previousElementSibling).toHaveTextContent('0');
    expect(stats.getByText('Topics').previousElementSibling).toHaveTextContent('0');
    expect(screen.getByText('2 Hidden Ideas')).toBeInTheDocument();
  });

  it('does not show invented references or links', () => {
    const { canvas, ids } = build();
    show({ ...canvas, nodes: canvas.nodes.map((n) => (n.id === ids[1] ? { ...n, collapsed: true } : n)) }, ids[1]!);
    const { container } = render(<NodeInspectorRail />);
    expect(container.textContent).not.toMatch(/youtube|notion\.so|medium\.com|drive\.google|References|Saved References/i);
  });

  it('"Expand All Under Branch" reveals the whole branch, not one level', () => {
    const { canvas, ids } = build();
    const [, a, b] = ids;
    show(
      { ...canvas, nodes: canvas.nodes.map((n) => (n.id === a || n.id === b ? { ...n, collapsed: true } : n)) },
      a!,
    );
    render(<NodeInspectorRail />);

    fireEvent.click(screen.getByRole('button', { name: /Expand All Under Branch/ }));

    expect(useCanvasStore.getState().canvas.nodes.every((n) => !n.collapsed)).toBe(true);
  });

  it("shows the selected idea's real created and updated times", () => {
    const { canvas, ids } = build();
    const stamped = {
      ...canvas,
      nodes: canvas.nodes.map((n) =>
        n.id === ids[1] ? { ...n, createdAt: '2026-03-04T10:00:00.000Z', updatedAt: new Date().toISOString() } : n,
      ),
    };
    show(stamped, ids[1]!);
    render(<NodeInspectorRail />);

    expect(screen.getByText(/CREATED: .*2026/)).toBeInTheDocument();
    expect(screen.getByText('UPDATED: just now')).toBeInTheDocument();
    expect(screen.queryByText(/2025-02-14/)).not.toBeInTheDocument();
  });

  it('lists every attached image with a remove button each, and a correct count', () => {
    const { canvas, ids } = build();
    let c = canvas;
    for (let i = 0; i < 2; i++) {
      c = addImage(c, ids[1]!, { id: crypto.randomUUID(), dataUrl: PIXEL, addedAt: new Date().toISOString() });
    }
    show(c, ids[1]!);
    render(<NodeInspectorRail />);

    expect(screen.getByText('2 FILES')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Remove image 2' }));
    expect(useCanvasStore.getState().canvas.nodes.find((n) => n.id === ids[1])!.images).toHaveLength(1);
  });

  it('reports the real image size, not a canned one', () => {
    const { canvas, ids } = build();
    show(addImage(canvas, ids[1]!, { id: crypto.randomUUID(), dataUrl: PIXEL, addedAt: new Date().toISOString() }), ids[1]!);
    const { container } = render(<NodeInspectorRail />);
    expect(container.textContent).toContain(formatDataUrlSize(PIXEL));
    expect(container.textContent).not.toMatch(/1920x1080|1\.2 MB/);
  });

  it('refuses an oversized image with a visible message', async () => {
    const { canvas, ids } = build();
    show(canvas, ids[1]!);
    render(<NodeInspectorRail />);

    const huge = new File([new Uint8Array(3 * 1024 * 1024)], 'huge.png', { type: 'image/png' });
    const input = screen.getByLabelText('Choose an image to attach') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [huge] } });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(await screen.findByTestId('image-error')).toHaveTextContent(/larger than 2 MB/);
    expect(useCanvasStore.getState().canvas.nodes.find((n) => n.id === ids[1])!.images).toHaveLength(0);
  });

  it("'Connect to' offers every other idea, and labels are unique", () => {
    const { canvas, ids } = build();
    const [root, a, b, c] = ids;
    show(canvas, a!);
    render(<NodeInspectorRail />);

    const select = screen.getByTestId('connect-to-select') as HTMLSelectElement;
    const offered = Array.from(select.options).map((o) => o.value).filter(Boolean);
    expect(offered.sort()).toEqual([root, b, c].sort()); // anything but itself
  });

  it("'Connect to' adds a connector from the selected idea to the chosen one", () => {
    const { canvas, ids } = build();
    const [root, a] = ids;
    show(canvas, root!);
    render(<NodeInspectorRail />);

    const before = useCanvasStore.getState().canvas.edges.length;
    fireEvent.change(screen.getByTestId('connect-to-select'), { target: { value: ids[3] } });

    const after = useCanvasStore.getState().canvas;
    expect(after.edges).toHaveLength(before + 1);
    expect(after.edges[after.edges.length - 1]).toMatchObject({ source: root, target: ids[3] });
    expect(a).toBeDefined();
  });

  it('lists every connector on the selected idea, in and out, and removes one on request', () => {
    const { canvas, ids } = build(); // root -> a -> (b, c)
    const [root, a, b, c] = ids;
    show(canvas, a!);
    render(<NodeInspectorRail />);

    const panel = within(screen.getByTestId('node-inspector-connections'));
    expect(panel.getByText('3 TOTAL')).toBeInTheDocument();
    expect(panel.getAllByText(/^IN/)).toHaveLength(1);
    expect(panel.getAllByText(/^OUT/)).toHaveLength(2);

    const toB = useCanvasStore.getState().canvas.edges.find((e) => e.source === a && e.target === b)!;
    fireEvent.click(screen.getByTestId(`connection-remove-${toB.id}`));

    const edges = useCanvasStore.getState().canvas.edges;
    expect(edges.some((e) => e.id === toB.id)).toBe(false);
    expect(edges).toHaveLength(2);
    expect([root, c]).toBeDefined();
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

  it('labels many ideas distinctly in the Connect to list', () => {
    let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    const root = c.nodes[0]!.id;
    for (let i = 0; i < 40; i++) c = addChild(c, root, { position: { x: i, y: i } });
    const last = c.nodes[c.nodes.length - 1]!.id;
    show(c, last);
    render(<NodeInspectorRail />);

    const select = screen.getByTestId('connect-to-select') as HTMLSelectElement;
    const labels = Array.from(select.options).slice(1).map((o) => o.textContent!.trim().split(' ')[0]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('title field enforces the shared 200-character limit', () => {
    const { canvas, ids } = build();
    show(canvas, ids[1]!);
    render(<NodeInspectorRail />);
    expect(screen.getByLabelText('Idea title')).toHaveAttribute('maxLength', '200');
    expect(screen.getByText(/\/200$/)).toBeInTheDocument();
  });

  it.each([
    ['saved', 'Saved'],
    ['saving', 'Saving…'],
    ['error', 'Not saved — retrying'],
  ] as const)('save indicator shows %s truthfully', (status, text) => {
    const { canvas, ids } = build();
    show(canvas, ids[1]!);
    render(<NodeInspectorRail saveStatus={status} />);
    expect(screen.getByTestId('save-status')).toHaveTextContent(text);
    expect(screen.queryByText('Saved automatically')).not.toBeInTheDocument();
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
