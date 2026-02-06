/** Represents a successfully authenticated user. */
export interface AuthenticatedUser {
  /** Unique identifier prefixed by provider, e.g. "local:alice" or "github:12345". */
  id: string;
  /** Human-readable name for display/logging. */
  displayName: string;
}

/** Identity provider that renders a username/password form. */
export interface FormIdentityProvider {
  type: "form";
  /** Unique provider id, e.g. "local". */
  id: string;
  /** Display name, e.g. "Local". */
  name: string;
  /** Validate credentials. Returns user on success, null on failure. */
  validate(
    username: string,
    password: string,
  ): Promise<AuthenticatedUser | null>;
}

/** Identity provider that redirects to an external authorization server. */
export interface RedirectIdentityProvider {
  type: "redirect";
  /** Unique provider id, e.g. "github". */
  id: string;
  /** Display name, e.g. "GitHub". */
  name: string;
  /** Button label for the login UI, e.g. "Continue with GitHub". */
  buttonLabel: string;
  /** Build the URL to redirect the user to for authentication. */
  getAuthorizationUrl(callbackUrl: string, state: string): string;
  /** Handle the callback from the external IdP. Returns user on success, null on failure. */
  handleCallback(params: URLSearchParams): Promise<AuthenticatedUser | null>;
}

export type IdentityProvider = FormIdentityProvider | RedirectIdentityProvider;
