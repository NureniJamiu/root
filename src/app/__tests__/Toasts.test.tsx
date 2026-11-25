import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { emitSaveError } from '../../persistence';
import { ToastSurface } from '../Toasts';

describe('save-error toast', () => {
  afterEach(() => vi.useRealTimers());

  it('offers a reload when saving cannot work until the page reloads, and stays up', () => {
    vi.useFakeTimers();
    render(<ToastSurface />);
    act(() => emitSaveError({ message: 'Reload the page to continue.', reload: true }));
    expect(screen.getByTestId('toast')).toHaveTextContent('Not saved: Reload the page to continue.');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByTestId('toast-reload')).toHaveTextContent('Reload');
    fireEvent.click(screen.getByTestId('toast-dismiss'));
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('shows other save errors without a reload button, and lets them expire', () => {
    vi.useFakeTimers();
    render(<ToastSurface />);
    act(() => emitSaveError({ message: 'Could not reach the server' }));
    expect(screen.getByTestId('toast')).toHaveTextContent('Not saved: Could not reach the server');
    expect(screen.queryByTestId('toast-reload')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});
