import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../../../ui';
import { LoginPage } from '../LoginPage';
import { RegisterPage } from '../RegisterPage';

const signIn = vi.fn<(email: string, password: string) => Promise<void>>();
const signUp = vi.fn();

vi.mock('../../../routing', () => ({ useRouter: () => ({ navigate: vi.fn() }) }));
vi.mock('../../../auth', () => ({ useAuth: () => ({ signIn }) }));
vi.mock('../../../lib/auth-client', () => ({ authClient: { signUp: { email: (...args: unknown[]) => signUp(...args) } } }));

/** A promise the test settles by hand, to hold a request in flight. */
function pending<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fill(label: RegExp, value: string) {
  const input = screen.getByText(label).closest('div')!.parentElement!.querySelector('input')!;
  fireEvent.change(input, { target: { value } });
}

beforeEach(() => {
  signIn.mockReset();
  signUp.mockReset();
});

describe('Button loading', () => {
  it('shows a spinner, disables the button and keeps its name', () => {
    render(<Button loading>Sign In</Button>);
    const button = screen.getByRole('button', { name: 'Sign In' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
  });

  it('is a plain button when not loading', () => {
    render(<Button>Sign In</Button>);
    const button = screen.getByRole('button', { name: 'Sign In' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
    expect(screen.queryByTestId('button-spinner')).toBeNull();
  });
});

describe('LoginPage', () => {
  it('signs in once however often the button is pressed, then frees it after an error', async () => {
    const request = pending();
    signIn.mockReturnValue(request.promise);
    render(<LoginPage />);
    fill(/Email Address/i, 'a@example.com');
    fill(/^Password$/i, 'password123');

    const button = screen.getByRole('button', { name: 'Sign In' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.submit(button.closest('form')!);

    expect(signIn).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();

    request.reject(new Error('Invalid email or password'));
    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(screen.queryByTestId('button-spinner')).toBeNull();
  });
});

describe('RegisterPage', () => {
  it('creates the account once however often the button is pressed', async () => {
    const request = pending<{ error: { message: string } }>();
    signUp.mockReturnValue(request.promise);
    render(<RegisterPage />);

    const button = screen.getByRole('button', { name: 'Create Account' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(signUp).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());

    request.resolve({ error: { message: 'User already exists' } });
    expect(await screen.findByText('User already exists')).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(signIn).not.toHaveBeenCalled();
  });
});
