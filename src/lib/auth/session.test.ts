import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { session: { findUnique: vi.fn(), deleteMany: vi.fn() } },
  cookieGet: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookieGet }) }));

import { getAuthenticatedUserId, SESSION_COOKIE } from "./session";

describe("authenticated session email-verification enforcement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.prisma.session.findUnique.mockReset();
    mocks.prisma.session.deleteMany.mockReset();
    mocks.cookieGet.mockReset();
  });

  it("revokes a session if verification is required but still incomplete", async () => {
    mocks.cookieGet.mockReturnValue({ value: "session-token" });
    mocks.prisma.session.findUnique.mockResolvedValue({
      userId: "user-1",
      expiresAt: new Date(Date.now() + 60_000),
      user: { emailVerificationRequired: true, emailVerifiedAt: null },
    });
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 1 });

    await expect(getAuthenticatedUserId()).resolves.toBeNull();
    expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: expect.any(String) } });
    expect(SESSION_COOKIE).toBe("devobs_session");
  });

  it("keeps legacy account sessions active while verification is not enforced for them", async () => {
    mocks.cookieGet.mockReturnValue({ value: "session-token" });
    mocks.prisma.session.findUnique.mockResolvedValue({
      userId: "legacy-user",
      expiresAt: new Date(Date.now() + 60_000),
      user: { emailVerificationRequired: false, emailVerifiedAt: null },
    });

    await expect(getAuthenticatedUserId()).resolves.toBe("legacy-user");
    expect(mocks.prisma.session.deleteMany).not.toHaveBeenCalled();
  });
});
