import type { AuthInput, AuthResult, AuthProvider } from "../types";

/**
 * AuthProvider interface implementation.
 * v1 implementation: StubEmailProvider
 *
 * Accepts any email ending in @howdy.com without cryptographic verification.
 * This is an accepted trade-off for hackathon scope — no admin access to
 * configure real SSO within the competition window.
 */

export class StubEmailProvider implements AuthProvider {
  private readonly allowedDomain: string;

  constructor(allowedDomain: string = "howdy.com") {
    this.allowedDomain = allowedDomain;
  }

  /**
   * Authenticate a user by validating their email domain.
   * @param input - Contains the email string to validate
   * @returns AuthResult with email and optional name
   * @throws Error if email doesn't match the allowed domain
   */
  async authenticate(input: AuthInput): Promise<AuthResult> {
    const { email } = input;

    if (!email || !this.isValidEmail(email)) {
      throw new Error(
        `Invalid email format. Must be a valid email address ending in @${this.allowedDomain}`
      );
    }

    if (!this.hasAllowedDomain(email)) {
      throw new Error(
        `Email must be from the ${this.allowedDomain} domain`
      );
    }

    // Extract name from email if possible
    const name = this.extractName(email);

    return {
      email,
      name,
    };
  }

  /**
   * Validate basic email format.
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if the email is from the allowed domain.
   */
  private hasAllowedDomain(email: string): boolean {
    const domain = email.split("@")[1]?.toLowerCase();
    return domain === this.allowedDomain.toLowerCase();
  }

  /**
   * Extract a display name from the email local part.
   * Example: "alice.johnson" -> "Alice Johnson"
   */
  private extractName(email: string): string | undefined {
    const localPart = email.split("@")[0];
    if (!localPart || localPart.length === 0) {
      return undefined;
    }

    // Handle common formats: alice.johnson, alice-johnson, alice_johnson
    return localPart
      .replace(/[._-]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

/**
 * Factory function to create the appropriate AuthProvider based on AUTH_PROVIDER env var.
 * Currently only supports "stub" in v1.
 */
export function createAuthProvider(provider: string): AuthProvider {
  switch (provider.toLowerCase()) {
    case "stub":
      return new StubEmailProvider();
    case "slack":
    case "google":
      // Future implementations would go here
      console.warn(
        `Auth provider "${provider}" is not yet implemented, falling back to stub`
      );
      return new StubEmailProvider();
    default:
      console.warn(`Unknown auth provider "${provider}", falling back to stub`);
      return new StubEmailProvider();
  }
}
