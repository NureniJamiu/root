import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aiProposalActions, canvasActions, emptyCanvas, useCanvasStore } from '../../data';
import { AiReviewBar } from '../AiReviewBar';

describe('AiReviewBar', () => {
  beforeEach(() => {
    canvasActions.loadCanvas(emptyCanvas());
    aiProposalActions.clear();
  });

  it('shows progress, then adds the included suggestions', () => {
    const onAccepted = vi.fn();
    const onCancel = vi.fn();
    render(<AiReviewBar onAccepted={onAccepted} onCancel={onCancel} />);
    expect(screen.queryByTestId('ai-review-bar')).toBeNull();

    act(() => aiProposalActions.start({ kind: 'map', anchorId: null }));
    fireEvent.click(screen.getByTestId('ai-cancel'));
    expect(onCancel).toHaveBeenCalled();

    act(() => aiProposalActions.propose({
      kind: 'map',
      anchorId: null,
      ideas: [
        { key: 'a', title: 'A', body: '', type: 'topic', parentKey: null, position: { x: 0, y: 0 } },
        { key: 'b', title: 'B', body: '', type: 'finding', parentKey: 'a', position: { x: 0, y: 300 } },
      ],
      excluded: ['b'],
      modelLabel: 'Gemini',
    }));
    expect(screen.getByTestId('ai-accept').textContent).toBe('Add 1');
    fireEvent.click(screen.getByTestId('ai-accept'));
    expect(useCanvasStore.getState().canvas.nodes.map((n) => n.title)).toEqual(['A']);
    expect(onAccepted).toHaveBeenCalledWith([useCanvasStore.getState().canvas.nodes[0]!.id]);
    expect(screen.queryByTestId('ai-review-bar')).toBeNull();
  });

  it('shows errors until dismissed', () => {
    render(<AiReviewBar />);
    act(() => aiProposalActions.fail('Your plan does not include this AI feature.'));
    expect(screen.getByText('Your plan does not include this AI feature.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('ai-dismiss-error'));
    expect(screen.queryByTestId('ai-review-bar')).toBeNull();
  });
});
