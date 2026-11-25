/**
 * The hover toolbar's type button cycles within the card's family (M0 plan
 * S4, D11): the general types keep their old cycle, and a problem-framing
 * card never jumps to a general type. Each press is one undo step.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { emptyCanvas } from '../../data/mutators';
import { canvasActions, useCanvasStore } from '../../data/store';
import type { Node, NodeType } from '../../data/types';
import { HoverToolbar } from '../HoverToolbar';

function current(): Node {
  return useCanvasStore.getState().canvas.nodes[0]!;
}

/** Press the type button `times` times and return the types it went through. */
function cycle(start: NodeType, times: number): NodeType[] {
  canvasActions.loadCanvas(emptyCanvas());
  canvasActions.addNode({ x: 0, y: 0 });
  canvasActions.updateNode(current().id, { type: start });
  const seen: NodeType[] = [];
  for (let i = 0; i < times; i++) {
    const { unmount } = render(<HoverToolbar node={current()} />);
    fireEvent.click(screen.getByTestId('btn-cycle-type'));
    unmount();
    seen.push(current().type);
  }
  return seen;
}

describe('HoverToolbar — cycle type within family', () => {
  beforeEach(() => {
    canvasActions.loadCanvas(emptyCanvas());
  });

  it('cycles the general family topic → finding → question → conclusion → topic', () => {
    expect(cycle('topic', 4)).toEqual(['finding', 'question', 'conclusion', 'topic']);
  });

  it('cycles the problem-framing family without leaving it', () => {
    expect(cycle('problem', 5)).toEqual(['objective', 'research-question', 'hypothesis', 'variable', 'problem']);
  });

  it('names the current type in the button label', () => {
    canvasActions.addNode({ x: 0, y: 0 });
    canvasActions.updateNode(current().id, { type: 'research-question' });
    render(<HoverToolbar node={current()} />);
    expect(screen.getByTestId('btn-cycle-type')).toHaveAccessibleName('Change card type (current: Research question)');
  });

  it('drops the fields the next type does not define, as one undo step', () => {
    canvasActions.addNode({ x: 0, y: 0 });
    canvasActions.saveNodeEdits(current().id, {
      title: '',
      body: '',
      type: 'objective',
      fields: { scope: 'general' },
      images: [],
    });
    render(<HoverToolbar node={current()} />);
    fireEvent.click(screen.getByTestId('btn-cycle-type'));
    expect(current().type).toBe('research-question');
    expect(current().fields).toEqual({});
    canvasActions.undo();
    expect(current().type).toBe('objective');
    expect(current().fields).toEqual({ scope: 'general' });
  });
});
