import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    pendingRegistration: { findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  },
  consumeAuthAttempt: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/rate-limit", () => ({ consumeAuthAttempt: mocks.consumeAuthAttempt }));

import { POST } from "./route";

function resendRequest(email = "person@example.test") {
  return new Request("https://app.example.test/api/auth/resend-verification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/auth/resend-verification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00.000Z"));
    mocks.consumeAuthAttempt.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.prisma.pendingRegistration.findUnique.mockResolvedValue(null);
    mocks.prisma.pendingRegistration.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.pendingRegistration.deleteMany.mockResolvedValue({ count: 0 });
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    vi.stubEnv("CONTACT_FROM_EMAIL", "Devobs <verified@example.test>");
    vi.stubEnv("APP_URL", "https://app.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    mocks.consumeAuthAttempt.mockReset();
    mocks.prisma.pendingRegistration.findUnique.mockReset();
    mocks.prisma.pendingRegistration.updateMany.mockReset();
    mocks.prisma.pendingRegistration.deleteMany.mockReset();
  });

  it("returns the same accepted response when no pending registration exists", async () => {
    const response = await POST(resendRequest());

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.consumeAuthAttempt).toHaveBeenCalledOnce();
    expect(mocks.consumeAuthAttempt).toHaveBeenCalledWith("emailVerification", "person@example.test");
  });

  it("rotates the stored token before sending a fresh link", async () => {
    const pending = {
      id: "pending-1",
      email: "person@example.test",
      tokenHash: "old-token-hash",
      expiresAt: new Date("2026-10-25T12:00:00.000Z"),
    };
    mocks.prisma.pendingRegistration.findUnique.mockResolvedValue(pending);

    const response = await POST(resendRequest());

    expect(response.status).toBe(202);
    expect(mocks.prisma.pendingRegistration.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: pending.id, tokenHash: pending.tokenHash }),
      data: expect.objectContaining({ tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAt: expect.any(Date) }),
    }));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not send for an expired pending registration", async () => {
    mocks.prisma.pendingRegistration.findUnique.mockResolvedValue({
      id: "pending-1",
      email: "person@example.test",
      tokenHash: "old-token-hash",
      expiresAt: new Date("2026-10-24T11:59:59.000Z"),
    });

    const response = await POST(resendRequest());

    expect(response.status).toBe(202);
    expect(mocks.prisma.pendingRegistration.deleteMany).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
});
