/**
 * /client/src/components/LoginGate.tsx
 *
 * Skin-neutral authentication gate. Renders a minimal email form that
 * POSTs to /auth/login. On success, stores the user info and resolves the
 * gate so the rest of the app can render.
 *
 * Per client/AGENTS.md rule #2, no localStorage is used for auth state —
 * the session cookie is HTTP-only and set by the server. On page load we
 * call GET /auth/me to check for an existing session.
 *
 * This component is skin-neutral (uses app-shell CSS only) so it renders
 * correctly before any skin is selected.
 */

import { useState, useEffect, type JSX } from "react";
import "./LoginGate.css";

/** Result of a successful login or session check. */
export interface AuthUser {
  email: string;
  name?: string;
}

/** Props for the LoginGate component. */
export interface LoginGateProps {
  /** Called with the authenticated user when login succeeds or session is valid. */
  onAuthenticated: (user: AuthUser) => void;
}

/**
 * The login gate component.
 *
 * - On mount: checks for an existing session via GET /auth/me.
 * - If no session: renders an email form.
 * - On form submit: POSTs to /auth/login, handles success/error.
 * - On success: calls onAuthenticated with the user info.
 */
export function LoginGate({ onAuthenticated }: LoginGateProps): JSX.Element {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // On mount: check for an existing session
  useEffect(() => {
    checkSession();
  }, []);

  /** Check for an existing session via /auth/me. */
  async function checkSession(): Promise<void> {
    setIsChecking(true);
    try {
      const res = await fetch("/auth/me", {
        credentials: "include",
      });
      if (res.ok) {
        const user: AuthUser = await res.json();
        onAuthenticated(user);
      }
      // If not authenticated, just show the login form (no error)
    } catch {
      // Network error — show login form
    } finally {
      setIsChecking(false);
    }
  }

  /** Handle form submission. */
  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        onAuthenticated({
          email: data.email,
          name: data.name,
        });
      } else {
        // Server returns domain-specific errors; we display a generic
        // message instead of leaking the @howdy.com requirement.
        setError("That email isn't on our team access list. Please use your work email.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isChecking) {
    return (
      <div className="howdy-login-gate">
        <div className="howdy-bento-panel">
          <p className="howdy-body-text">Checking session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="howdy-login-gate">
      <div className="howdy-bento-panel howdy-bento-panel--wide">
        <h1 className="howdy-panel-title">Howdy Radio</h1>

         <form onSubmit={handleSubmit} className="howdy-login-form">
          <div className="howdy-form-field">
            <label htmlFor="email-input" className="howdy-form-label">
              Email
            </label>
            <input
              id="email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.name@howdy.com"
              className="howdy-form-input"
              autoComplete="email"
              required
              aria-describedby={error ? "login-error" : "login-help"}
            />
            <p id="login-help" className="howdy-form-help">
              We ask for your work email just to confirm you're part of the
              team. It isn't stored — it's only used to verify access.
            </p>
            <p className="howdy-form-help howdy-form-help--note">
              This authentication flow is just for the Dev Day Hackathon — it's
              for illustrative purposes only.
            </p>
          </div>

          {error && (
            <p id="login-error" className="howdy-form-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !email.trim()}
            className="howdy-pill howdy-pill--periwinkle howdy-login-button"
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
