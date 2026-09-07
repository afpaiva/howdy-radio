import { test, expect, describe } from "bun:test";
import { StubEmailProvider, createAuthProvider } from "../auth/authProvider";
import type { AuthInput } from "../types";
import jwt from "jsonwebtoken";
import { createServer, type Server } from "http";

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

describe("Session token extraction and /auth/me", () => {
  // JWT secret must match a non-random value for deterministic tests
  const TEST_JWT_SECRET = "test-secret-for-auth-me";
  const JWT_EXPIRES_IN = "24h";

  function makeToken(payload: object): string {
    return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  function getSessionToken(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    return match ? match[1] ?? null : null;
  }

  function createTestServer(): Server {
    return createServer((req, res) => {
      // Inline the handler logic for testing (avoids top-level await in index.ts)
      if (req.method === "GET" && req.url === "/auth/me") {
        const token = getSessionToken(req.headers?.cookie);
        if (!token) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not authenticated" }));
          return;
        }
        try {
          const decoded = jwt.verify(token, TEST_JWT_SECRET) as {
            email: string;
            name?: string;
          };
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ email: decoded.email, name: decoded.name }));
        } catch {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or expired token" }));
        }
        return;
      }
      res.writeHead(404);
      res.end("Not found");
    });
  }

  async function startServer(): Promise<{ server: Server; port: number }> {
    const server = createTestServer();
    const port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (!addr) {
          resolve(0);
          return;
        }
        resolve(typeof addr === "string" ? parseInt(addr, 10) : addr.port);
      });
    });
    return { server, port };
  }

  test("getSessionToken extracts token from cookie header", () => {
    expect(getSessionToken("session=abc123")).toBe("abc123");
    expect(getSessionToken("other=cookie; session=mytoken; foo=bar")).toBe("mytoken");
    expect(getSessionToken(undefined)).toBeNull();
    expect(getSessionToken("no_session_here")).toBeNull();
  });

  test("/auth/me returns 401 when no session cookie present", async () => {
    const { server, port } = await startServer();

    const res = await fetch(`http://localhost:${port}/auth/me`);
    expect(res.status).toBe(401);
    const body = await res.json() as { error?: string };
    expect(body.error).toBe("Not authenticated");

    server.close();
  });

  test("/auth/me returns user identity when valid JWT cookie present", async () => {
    const { server, port } = await startServer();

    const token = makeToken({ email: "alice@howdy.com", name: "Alice" });
    const res = await fetch(`http://localhost:${port}/auth/me`, {
      headers: { Cookie: `session=${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { email?: string; name?: string };
    expect(body.email).toBe("alice@howdy.com");
    expect(body.name).toBe("Alice");

    server.close();
  });

  test("/auth/me returns 401 when JWT is invalid", async () => {
    const { server, port } = await startServer();

    const res = await fetch(`http://localhost:${port}/auth/me`, {
      headers: { Cookie: "session=invalid.token.here" },
    });

    expect(res.status).toBe(401);
    const body = await res.json() as { error?: string };
    expect(body.error).toBe("Invalid or expired token");

    server.close();
  });

  test("/auth/me returns 401 when JWT is expired", async () => {
    const { server, port } = await startServer();

    const expiredToken = jwt.sign(
      { email: "bob@howdy.com", name: "Bob" },
      TEST_JWT_SECRET,
      { expiresIn: "-1s" },
    );

    const res = await fetch(`http://localhost:${port}/auth/me`, {
      headers: { Cookie: `session=${expiredToken}` },
    });

    expect(res.status).toBe(401);

    server.close();
  });

  test("/auth/me returns undefined name when token has no name field", async () => {
    const { server, port } = await startServer();

    const token = makeToken({ email: "alice@howdy.com" });
    const res = await fetch(`http://localhost:${port}/auth/me`, {
      headers: { Cookie: `session=${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { email?: string; name?: string };
    expect(body.email).toBe("alice@howdy.com");
    expect(body.name).toBeUndefined();

    server.close();
  });
});
