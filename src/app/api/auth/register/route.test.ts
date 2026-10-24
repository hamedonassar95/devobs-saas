import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashEmailVerificationToken } from "@/lib/auth/email-verification";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    user: { findUnique: vi.fn() },
    pendingRegistration: { upsert: vi.fn() },
  },
  consumeAuthAttempt: vi.fn(),
  resetAuthAttempts: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/rate-limit", () => ({
  consumeAuthAttempt: mocks.consumeAuthAttempt,
  resetAuthAttempts: mocks.resetAuthAttempts,
}));
vi.mock("@/lib/auth/session", () => ({ createSession: mocks.createSession }));

import { POST } from "./route";

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    mocks.consumeAuthAttempt.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.pendingRegistration.upsert.mockResolvedValue({ id: "pending-1" });
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      user: { create: vi.fn().mockResolvedValue({ id: "user-1" }) },
      organization: { create: vi.fn().mockResolvedValue({ id: "org-1" }) },
      membership: { create: vi.fn() },
    }));
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");
    vi.stubEnv("CONTACT_FROM_EMAIL", "Devobs <verified@example.test>");
    vi.stubEnv("APP_URL", "https://app.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    mocks.consumeAuthAttempt.mockReset();
    mocks.resetAuthAttempts.mockReset();
    mocks.createSession.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.pendingRegistration.upsert.mockReset();
  });

  it("stores a pending registration and does not create an account session", async () => {
    const response = await POST(new Request("https://app.example.test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "person@example.test",
        password: "attacker-chosen-password-is-ignored",
        name: "Example Person",
        organizationName: "Example Team",
      }),
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.prisma.pendingRegistration.upsert).toHaveBeenCalledOnce();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    const emailBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)) as { text: string };
    const token = emailBody.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
    if (!token) throw new Error("Expected the email to contain a verification token");
    const pendingData = mocks.prisma.pendingRegistration.upsert.mock.calls[0]?.[0]?.create;
    expect(pendingData?.tokenHash).toBe(hashEmailVerificationToken(token));
    expect(pendingData).not.toHaveProperty("passwordHash");
  });

  it("returns the same accepted response for an address with an existing account", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "existing-user" });

    const response = await POST(new Request("https://app.example.test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "person@example.test",
        name: "Example Person",
        organizationName: "Example Team",
      }),
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.prisma.pendingRegistration.upsert).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.consumeAuthAttempt).toHaveBeenCalledOnce();
    expect(mocks.consumeAuthAttempt).toHaveBeenCalledWith("register", "person@example.test");
  });

  it("keeps the response generic and logs no provider details when delivery fails", async () => {
    const providerCanary = "provider-response-do-not-log";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetch).mockRejectedValue(new Error(providerCanary));

    const response = await POST(new Request("https://app.example.test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "person@example.test",
        name: "Example Person",
        organizationName: "Example Team",
      }),
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(errorLog).toHaveBeenCalledWith("[auth] Verification email delivery failed.");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(providerCanary);
  });
});
