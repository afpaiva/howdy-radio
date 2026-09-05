import { test, expect, describe } from "bun:test";
import { StubEmailProvider, createAuthProvider } from "../auth/authProvider";
import type { AuthInput } from "../types";

describe("StubEmailProvider", () => {
  const provider = new StubEmailProvider();

  test("authenticates valid howdy.com email", async () => {
    const input: AuthInput = { email: "alice@howdy.com" };
    const result = await provider.authenticate(input);

    expect(result.email).toBe("alice@howdy.com");
    expect(result.name).toBe("Alice");
  });

  test("authenticates email with dots in name", async () => {
    const input: AuthInput = { email: "alice.johnson@howdy.com" };
    const result = await provider.authenticate(input);

    expect(result.email).toBe("alice.johnson@howdy.com");
    expect(result.name).toBe("Alice Johnson");
  });

  test("authenticates email with underscores", async () => {
    const input: AuthInput = { email: "bob_smith@howdy.com" };
    const result = await provider.authenticate(input);

    expect(result.email).toBe("bob_smith@howdy.com");
    expect(result.name).toBe("Bob Smith");
  });

  test("authenticates email with hyphens", async () => {
    const input: AuthInput = { email: "charlie-brown@howdy.com" };
    const result = await provider.authenticate(input);

    expect(result.email).toBe("charlie-brown@howdy.com");
    expect(result.name).toBe("Charlie Brown");
  });

  test("rejects non-howdy.com email", async () => {
    const input: AuthInput = { email: "alice@gmail.com" };

    await expect(provider.authenticate(input)).rejects.toThrow(
      "Email must be from the howdy.com domain"
    );
  });

  test("rejects invalid email format", async () => {
    const input: AuthInput = { email: "not-an-email" };

    await expect(provider.authenticate(input)).rejects.toThrow(
      "Invalid email format"
    );
  });

  test("rejects empty email", async () => {
    const input: AuthInput = { email: "" };

    await expect(provider.authenticate(input)).rejects.toThrow(
      "Invalid email format"
    );
  });

  test("handles email with subdomains correctly", async () => {
    const input: AuthInput = { email: "alice@sub.howdy.com" };

    await expect(provider.authenticate(input)).rejects.toThrow(
      "Email must be from the howdy.com domain"
    );
  });
});

describe("createAuthProvider", () => {
  test("creates StubEmailProvider for 'stub'", () => {
    const provider = createAuthProvider("stub");
    expect(provider).toBeInstanceOf(StubEmailProvider);
  });

  test("falls back to stub for 'slack' with warning", () => {
    const provider = createAuthProvider("slack");
    expect(provider).toBeInstanceOf(StubEmailProvider);
  });

  test("falls back to stub for 'google' with warning", () => {
    const provider = createAuthProvider("google");
    expect(provider).toBeInstanceOf(StubEmailProvider);
  });

  test("falls back to stub for unknown provider with warning", () => {
    const provider = createAuthProvider("unknown");
    expect(provider).toBeInstanceOf(StubEmailProvider);
  });
});
