import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { user: { findUnique: vi.fn() } },
  consumeAuthAttempt: vi.fn(),
  resetAuthAttempts: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/rate-limit", () => ({
  consumeAuthAttempt: mocks.consumeAuthAttempt,
  resetAuthAttempts: mocks.resetAuthAttempts,
}));
vi.mock("@/lib/auth/password", () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock("@/lib/auth/session", () => ({ createSession: mocks.createSession }));

import { POST } from "./route";

function loginRequest() {
  return new Request("https://app.example.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "person@example.test", password: "long-enough-password" }),
  });
}

describe("POST /api/auth/login email verification gate", () => {
  beforeEach(() => {
    mocks.consumeAuthAttempt.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.resetAuthAttempts.mockResolvedValue(undefined);
    mocks.verifyPassword.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mocks.prisma.user.findUnique.mockReset();
    mocks.consumeAuthAttempt.mockReset();
    mocks.resetAuthAttempts.mockReset();
    mocks.verifyPassword.mockReset();
    mocks.createSession.mockReset();
  });

  it("does not create a session for an unverified account that requires verification", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      passwordHash: "stored-password-hash",
      emailVerificationRequired: true,
      emailVerifiedAt: null,
    });

    const response = await POST(loginRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Verify your email before signing in.",
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("preserves sign-in for accounts that predate verification enforcement", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "legacy-user",
      passwordHash: "stored-password-hash",
      emailVerificationRequired: false,
      emailVerifiedAt: null,
    });

    const response = await POST(loginRequest());

    expect(response.status).toBe(200);
    expect(mocks.createSession).toHaveBeenCalledWith("legacy-user");
  });
});
