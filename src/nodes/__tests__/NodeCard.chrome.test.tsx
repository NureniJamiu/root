import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addChild, addNode, emptyCanvas, updateNode } from '../../data/mutators';
import { canvasActions } from '../../data/store';
import { NodeCard } from '../NodeCard';
import type { NodeCardData } from '../NodeCard';

vi.mock('reactflow', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => <div data-testid={`handle-${type}-${position}`} />,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}));

function props(nodeId: string, selected = false) {
  const data: NodeCardData = { nodeId };
  return { id: nodeId, data, selected } as unknown as import('reactflow').NodeProps<NodeCardData>;
}

describe('NodeCard chrome and labels', () => {
  beforeEach(() => canvasActions.loadCanvas(emptyCanvas()));

  it('labels ideas uniquely even when many are created', () => {
    let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    for (let i = 0; i < 30; i++) c = addChild(c, c.nodes[0]!.id, { position: { x: i, y: i } });
    canvasActions.loadCanvas(c);

    const labels = c.nodes.slice(1).map((n) => {
      const { unmount, container } = render(<NodeCard {...props(n.id)} />);
      const footer = container.querySelector('.select-none.tracking-wide span');
      const label = footer?.textContent ?? '';
      unmount();
      return label;
    });

    expect(new Set(labels).size).toBe(30);
  });

  it('counts the connectors on a card, in and out alike', () => {
    let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    c = addChild(c, c.nodes[0]!.id, { position: { x: 1, y: 1 } });
    c = addChild(c, c.nodes[0]!.id, { position: { x: 2, y: 2 } });
    canvasActions.loadCanvas(c);

    render(<NodeCard {...props(c.nodes[0]!.id)} />);

    expect(screen.getByText('2 connections')).toBeInTheDocument();
    expect(screen.queryByText(/Branch/)).not.toBeInTheDocument();
  });

  it('shows no SELECTED pill: the border is the selection signal', () => {
    const c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    canvasActions.loadCanvas(c);

    render(<NodeCard {...props(c.nodes[0]!.id, true)} />);

    expect(screen.queryByText('SELECTED')).not.toBeInTheDocument();
    expect(screen.getByTestId(`node-card-${c.nodes[0]!.id}`)).toHaveAttribute('data-selected', 'true');
  });

  it('shows the whole note and lets CSS fade it out, rather than cutting it mid-word', () => {
    let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    const body = 'word '.repeat(80).trim();
    c = updateNode(c, c.nodes[0]!.id, { body });
    canvasActions.loadCanvas(c);

    render(<NodeCard {...props(c.nodes[0]!.id)} />);

    const preview = screen.getByTestId('node-body-preview');
    expect(preview.textContent).toBe(body);
    expect(preview.style.maxHeight).toBeTruthy();
  });

  it('formats Markdown in the note instead of showing the markers', () => {
    let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    c = updateNode(c, c.nodes[0]!.id, { body: '**Calcium** and *phosphate*\n- one\n- two' });
    canvasActions.loadCanvas(c);

    render(<NodeCard {...props(c.nodes[0]!.id)} />);

    const preview = screen.getByTestId('node-body-preview');
    expect(preview.textContent).not.toContain('*');
    expect(preview.querySelector('strong')?.textContent).toBe('Calcium');
    expect(preview.querySelector('em')?.textContent).toBe('phosphate');
    expect(preview.querySelectorAll('li')).toHaveLength(2);
  });
});
