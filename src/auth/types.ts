export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
}

export interface AuthState {
  readonly user: AuthUser | null;
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
}
