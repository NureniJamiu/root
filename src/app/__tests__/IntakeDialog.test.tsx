/**
 * The intake (M0 plan D10): one question, at most one follow-up, skippable.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IntakeDialog } from '../IntakeDialog';

function setup(aiAvailable = true, rerun = false) {
  const onComplete = vi.fn();
  const onSkip = vi.fn();
  render(<IntakeDialog onComplete={onComplete} onSkip={onSkip} aiAvailable={aiAvailable} rerun={rerun} />);
  return { onComplete, onSkip };
}

describe('IntakeDialog', () => {
  it('can be skipped for a blank canvas', () => {
    const { onComplete, onSkip } = setup();
    fireEvent.click(screen.getByTestId('intake-skip'));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it.each(['no-topic', 'collected-data', 'writing-up'] as const)('finishes at once for %s', (answer) => {
    const { onComplete } = setup();
    fireEvent.click(screen.getByTestId(`intake-${answer}`));
    expect(onComplete).toHaveBeenCalledWith({ answer });
  });

  it('asks for the topic, and needs one to continue', () => {
    const { onComplete } = setup();
    fireEvent.click(screen.getByTestId('intake-has-topic'));
    expect(screen.getByText('What is your topic?')).toBeTruthy();
    const next = screen.getByTestId('intake-continue') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('intake-topic'), { target: { value: '  Remote work and trust  ' } });
    fireEvent.click(next);
    expect(onComplete).toHaveBeenCalledWith({ answer: 'has-topic', text: 'Remote work and trust' });
  });

  it('takes pasted objectives when AI can suggest cards, and allows leaving them out', () => {
    const { onComplete } = setup();
    fireEvent.click(screen.getByTestId('intake-objectives-drafted'));
    fireEvent.click(screen.getByTestId('intake-continue'));
    expect(onComplete).toHaveBeenLastCalledWith({ answer: 'objectives-drafted' });
  });

  it('skips the paste step when AI is not available', () => {
    const { onComplete } = setup(false);
    fireEvent.click(screen.getByTestId('intake-objectives-drafted'));
    expect(onComplete).toHaveBeenCalledWith({ answer: 'objectives-drafted' });
  });

  it('goes back from a follow-up to the question', () => {
    setup();
    fireEvent.click(screen.getByTestId('intake-has-topic'));
    fireEvent.click(screen.getByTestId('intake-back'));
    expect(screen.getByTestId('intake-no-topic')).toBeTruthy();
  });

  it('reads as a change of starting point when run again', () => {
    setup(true, true);
    expect(screen.getByText('Starting point')).toBeTruthy();
    expect(screen.getByTestId('intake-skip').textContent).toBe('Keep things as they are');
  });
});
